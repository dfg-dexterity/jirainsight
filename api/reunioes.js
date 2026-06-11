// GET /api/reunioes?projeto=RDF[&nocache=1]
// Lista os tickets de tipo "Reunião" (qualquer tipo cujo nome contenha "reuni") que
// estão ABERTOS (statusCategory != Done) no projeto, e os projetos-DESTINO válidos
// (que possuem um tipo de issue com o mesmo nome) para a reclassificação/mudança de
// projeto. Leitura via conta de serviço.
import { cacheGet, cacheSetTTL, jiraBase, jiraSearchAll, json } from './_lib/util.js';

const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
const RE_REUNI = /reuni/i;

function authSvc() {
  const e = process.env.JIRA_EMAIL, t = process.env.JIRA_API_TOKEN;
  if (!e || !t) throw new Error('JIRA_EMAIL / JIRA_API_TOKEN não configurados');
  return 'Basic ' + Buffer.from(`${e}:${t}`).toString('base64');
}

async function projetosComTipos(base, headers) {
  const out = [];
  let startAt = 0;
  for (let p = 0; p < 12; p += 1) {
    const r = await fetch(`${base}/rest/api/3/project/search?expand=issueTypes&maxResults=50&startAt=${startAt}`, { headers });
    if (!r.ok) { const t = await r.text(); throw new Error(`Jira ${r.status}: ${t.slice(0, 200)}`); }
    const d = await r.json();
    (d.values || []).forEach((pr) => out.push(pr));
    if (d.isLast || (d.values || []).length === 0) break;
    startAt += 50;
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const projeto = String((req.query && req.query.projeto) || 'RDF').trim().toUpperCase();
    if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
    const ck = `reunioes:${projeto}`;
    if (!(req.query && req.query.nocache === '1')) {
      const c = cacheGet(ck);
      if (c) return json(res, 200, c);
    }

    const base = jiraBase();
    const headers = { Authorization: authSvc(), Accept: 'application/json' };
    const projs = await projetosComTipos(base, headers);
    const src = projs.find((p) => p.key === projeto);
    if (!src) return json(res, 404, { erro: `Projeto ${projeto} não encontrado.` });

    const tiposReuni = (src.issueTypes || []).filter((t) => !t.subtask && RE_REUNI.test(t.name || ''));
    if (!tiposReuni.length) {
      return json(res, 200, cacheSetTTL(ck, {
        projeto, nome: src.name || projeto, tickets: [], alvos: [], tiposReuni: [],
        aviso: `O projeto ${projeto} não tem um tipo de issue de reunião.`,
      }, 5));
    }
    const idsTipo = tiposReuni.map((t) => t.id);
    const nomesTipo = new Set(tiposReuni.map((t) => (t.name || '').toLowerCase()));

    const { issues, truncado } = await jiraSearchAll({
      jql: `project = ${projeto} AND issuetype in (${idsTipo.join(',')}) AND statusCategory != Done ORDER BY status ASC, created DESC`,
      fields: ['summary', 'status', 'issuetype'],
      pageSize: 100,
      maxPages: 5,
    });
    const tickets = issues.map((it) => {
      const f = it.fields || {};
      return {
        id: it.id, k: it.key, resumo: f.summary || '',
        status: (f.status && f.status.name) || '',
        tipo: (f.issuetype && f.issuetype.name) || '',
      };
    });

    // Destinos: projetos (≠ origem) que têm um tipo com o mesmo nome de reunião.
    const alvos = projs.filter((p) => p.key !== projeto).map((p) => {
      const tipos = {};
      (p.issueTypes || []).forEach((t) => {
        const n = (t.name || '').toLowerCase();
        if (nomesTipo.has(n)) tipos[n] = t.id;
      });
      return Object.keys(tipos).length ? { key: p.key, nome: p.name || p.key, tipos } : null;
    }).filter(Boolean).sort((a, b) => a.key.localeCompare(b.key));

    return json(res, 200, cacheSetTTL(ck, {
      projeto, nome: src.name || projeto, tickets, alvos,
      tiposReuni: tiposReuni.map((t) => ({ id: t.id, nome: t.name })), truncado,
    }, 5));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
