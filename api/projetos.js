// Projetos e épicos para o módulo Planejar (num só endpoint, para caber no limite de
// Serverless Functions do plano Hobby da Vercel). Leitura via conta de serviço.
//
// GET /api/projetos            -> projetos do Jira com seus tipos de issue
// GET /api/projetos?epicos=KEY -> épicos e histórias ABERTOS do projeto KEY
import { cacheGet, cacheSetTTL, jiraBase, jiraSearchAll, json } from './_lib/util.js';

const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
const RE_HISTORIA = /story|hist[oó]ria/i;

function jiraAuthHeader() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) throw new Error('JIRA_EMAIL / JIRA_API_TOKEN não configurados');
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

// GET /api/projetos?epicos=KEY -> { projeto, epicos, historias }
async function listarEpicos(projeto, res) {
  if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
  const ck = `epicos:${projeto}`;
  const cached = cacheGet(ck);
  if (cached) return json(res, 200, cached);

  const base = jiraBase();
  const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };
  const rp = await fetch(`${base}/rest/api/3/project/${encodeURIComponent(projeto)}`, { headers });
  if (!rp.ok) {
    const t = await rp.text();
    return json(res, rp.status === 404 ? 404 : 500, { erro: `Jira ${rp.status}: ${t.slice(0, 200)}` });
  }
  const pdata = await rp.json();
  const tipos = pdata.issueTypes || [];
  const idsEpico = tipos.filter((t) => t.hierarchyLevel === 1).map((t) => t.id);
  const idsHistoria = tipos
    .filter((t) => !t.subtask && t.hierarchyLevel !== 1 && RE_HISTORIA.test(t.name || ''))
    .map((t) => t.id);

  const ids = [...idsEpico, ...idsHistoria];
  const epicos = [];
  const historias = [];
  if (ids.length) {
    const { issues } = await jiraSearchAll({
      jql: `project = ${projeto} AND issuetype in (${ids.join(',')}) AND statusCategory != Done ORDER BY created DESC`,
      fields: ['summary', 'issuetype', 'status', 'parent'],
      pageSize: 100,
      maxPages: 3,
    });
    for (const it of issues) {
      const f = it.fields || {};
      const ehEpico = idsEpico.includes(f.issuetype && f.issuetype.id);
      const item = {
        k: it.key,
        resumo: f.summary || '',
        status: (f.status && f.status.name) || '',
        tipo: (f.issuetype && f.issuetype.name) || '',
      };
      if (ehEpico) { item.nHistorias = 0; epicos.push(item); }
      else {
        // Épico-pai da história (Jira novo: o pai de uma história é o épico).
        item.epico = (f.parent && f.parent.key) || '';
        historias.push(item);
      }
    }
    // Conta quantas histórias (abertas) cada épico já tem, para mostrar contexto.
    const porEpico = {};
    historias.forEach((h) => { if (h.epico) porEpico[h.epico] = (porEpico[h.epico] || 0) + 1; });
    epicos.forEach((e) => { e.nHistorias = porEpico[e.k] || 0; });
  }
  return json(res, 200, cacheSetTTL(ck, { projeto, epicos, historias }, 10));
}

// GET /api/projetos?consultorias=KEY -> opções do campo CASCATA "AMS | Consultoria >
// Cliente" do projeto (via createmeta, conta de serviço): a consultoria é o valor-pai
// e os clientes são os filhos. Usado pela árvore de decisão (AMS por parceria).
async function listarConsultorias(projeto, res) {
  if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
  const ck = `conscli:${projeto}`;
  const cached = cacheGet(ck);
  if (cached) return json(res, 200, cached);

  const base = jiraBase();
  const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };
  const r = await fetch(`${base}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projeto)}&expand=projects.issuetypes.fields`, { headers });
  if (!r.ok) {
    const t = await r.text();
    return json(res, r.status === 404 ? 404 : 500, { erro: `Jira ${r.status}: ${t.slice(0, 200)}` });
  }
  const j = await r.json();
  const tipos = (j.projects && j.projects[0] && j.projects[0].issuetypes) || [];
  let campo = ''; let nome = '';
  const mapa = new Map();
  for (const t of tipos) {
    for (const [fid, f] of Object.entries(t.fields || {})) {
      const cascata = f.schema && (f.schema.type === 'option-with-child' || /cascadingselect/.test(f.schema.custom || ''));
      if (!cascata || !/consultoria/i.test(f.name || '')) continue;
      campo = fid; nome = f.name || '';
      for (const v of (f.allowedValues || [])) {
        const atual = mapa.get(String(v.id)) || { id: String(v.id), nome: v.value || '', clientes: new Map() };
        for (const ch of (v.children || [])) atual.clientes.set(String(ch.id), { id: String(ch.id), nome: ch.value || '' });
        mapa.set(String(v.id), atual);
      }
    }
  }
  if (!campo) {
    return json(res, 200, { projeto, campo: '', nome: '', opcoes: [], erro: 'Campo "AMS | Consultoria > Cliente" não encontrado no projeto.' });
  }
  const opcoes = [...mapa.values()]
    .map((o) => ({ id: o.id, nome: o.nome, clientes: [...o.clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt')) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  return json(res, 200, cacheSetTTL(ck, { projeto, campo, nome, opcoes }, 30));
}

export default async function handler(req, res) {
  try {
    const epicosDe = String((req.query && req.query.epicos) || '').trim().toUpperCase();
    if (epicosDe) return await listarEpicos(epicosDe, res);

    const consDe = String((req.query && req.query.consultorias) || '').trim().toUpperCase();
    if (consDe) return await listarConsultorias(consDe, res);

    const ck = 'projetos:tipos';
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);

    const base = jiraBase();
    const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };
    const projetos = [];
    let startAt = 0;
    for (let page = 0; page < 10; page += 1) {
      const r = await fetch(
        `${base}/rest/api/3/project/search?expand=issueTypes,description&maxResults=50&startAt=${startAt}`,
        { headers },
      );
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Jira ${r.status}: ${t.slice(0, 300)}`);
      }
      const data = await r.json();
      for (const p of (data.values || [])) {
        projetos.push({
          key: p.key,
          nome: p.name || p.key,
          categoria: (p.projectCategory && p.projectCategory.name) || 'Sem categoria',
          descricao: String(p.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
          tipos: (p.issueTypes || []).map((t) => ({
            id: t.id,
            nome: t.name || '',
            subtarefa: !!t.subtask,
            nivel: typeof t.hierarchyLevel === 'number' ? t.hierarchyLevel : (t.subtask ? -1 : 0),
          })),
        });
      }
      if (data.isLast || (data.values || []).length === 0) break;
      startAt += 50;
    }
    projetos.sort((a, b) => a.key.localeCompare(b.key));
    return json(res, 200, cacheSetTTL(ck, { projetos }, 30));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
