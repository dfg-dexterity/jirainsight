// Projetos e épicos para o módulo Planejar (num só endpoint, para caber no limite de
// Serverless Functions do plano Hobby da Vercel). Leitura via conta de serviço.
//
// GET /api/projetos            -> projetos do Jira com seus tipos de issue
// GET /api/projetos?epicos=KEY -> épicos e histórias ABERTOS do projeto KEY
import { cacheGet, cacheSetTTL, jiraBase, jiraSearchAll, json } from './_lib/util.js';
import { agregaProjeto, fetchIssuesProjeto, fichaProjeto, carregaCatalogoProjetos } from './_lib/projetos.js';

const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
const RE_HISTORIA = /story|hist[oó]ria/i;

function jiraAuthHeader() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) throw new Error('JIRA_EMAIL / JIRA_API_TOKEN não configurados');
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

// GET /api/projetos?epicos=KEY[&nocache=1] -> { projeto, epicos, historias }
// Cache curto (2 min) e `nocache=1` para o "↻" da tela: um épico criado direto no
// Jira aparecia só depois de 10 min (o cache não sabia dele) — 2026-09-13.
async function listarEpicos(projeto, res, nocache) {
  if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
  const ck = `epicos:${projeto}`;
  if (!nocache) { const cached = cacheGet(ck); if (cached) return json(res, 200, cached); }

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
  return json(res, 200, cacheSetTTL(ck, { projeto, epicos, historias, geradoEm: new Date().toISOString() }, 2));
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

// O plano atual do Jira não permite arquivar projetos; a convenção da casa é
// prefixar com "ARQ" (nome ou categoria). Esses projetos somem do painel inteiro.
const RE_ARQUIVADO = /(^|[^A-Za-z])ARQ([^A-Za-z]|$)/;
function semArquivados(projetos) {
  return projetos.filter((p) => !RE_ARQUIVADO.test(p.nome || '') && !RE_ARQUIVADO.test(p.categoria || '') && p.key !== 'ARQ');
}

// ---------------------------------------------------------------------------
// GET /api/projetos?visao=1[&projeto=KEY][&nocache=1] — "Visão por Projetos".
// Consolidado (todos os projetos) + ficha detalhada de um projeto, direto do Jira.
// A ficha (agregaProjeto, fetchIssuesProjeto, fichaProjeto) e o catálogo moram em
// api/_lib/projetos.js desde 2026-09-28: o 🌐 portal do projeto monta o progresso do
// cliente com o MESMO código — a rota não mudou de comportamento.
// ---------------------------------------------------------------------------
export { agregaProjeto };   // exposto para os testes locais da agregação (cronograma)

// Executa fn sobre os itens em lotes de `tamanho` (limita concorrência no Jira).
async function emLotes(itens, tamanho, fn) {
  const out = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    out.push(...await Promise.all(itens.slice(i, i + tamanho).map(fn)));
  }
  return out;
}

async function visaoPorProjetos(req, res) {
  const projeto = String((req.query && req.query.projeto) || '').trim().toUpperCase();
  const nocache = String((req.query && req.query.nocache) || '') === '1';

  // Ficha detalhada de um projeto.
  if (projeto) {
    if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
    return json(res, 200, await fichaProjeto(projeto, nocache));
  }

  // Consolidado: um resumo por projeto (sem os "ARQ"), em paralelo com
  // concorrência limitada, + agregação por CATEGORIA de projeto.
  const ck = 'visao:consolidado';
  if (!nocache) { const c = cacheGet(ck); if (c) return json(res, 200, c); }
  const catalogo = semArquivados(await carregaCatalogoProjetos());
  let algumTrunc = false;
  const projetos = await emLotes(catalogo, 5, async (p) => {
    try {
      const { issues, truncado } = await fetchIssuesProjeto(p.key, 40);
      if (truncado) algumTrunc = true;
      return { key: p.key, nome: p.nome, categoria: p.categoria, truncado, ...agregaProjeto(issues, { detalhe: false }) };
    } catch (e) {
      return { key: p.key, nome: p.nome, categoria: p.categoria, erro: String((e && e.message) || e) };
    }
  });
  projetos.sort((a, b) => (b.total || 0) - (a.total || 0) || a.key.localeCompare(b.key));
  const totais = projetos.reduce((s, l) => ({
    total: s.total + (l.total || 0), concluidos: s.concluidos + (l.concluidos || 0),
    backlog: s.backlog + (l.backlog || 0), emAndamento: s.emAndamento + (l.emAndamento || 0),
    vencidos: s.vencidos + (l.vencidos || 0), estH: Math.round((s.estH + (l.estH || 0)) * 10) / 10,
    gastoH: Math.round((s.gastoH + (l.gastoH || 0)) * 10) / 10,
    nEpicos: s.nEpicos + (l.nEpicos || 0), nEpicosAbertos: s.nEpicosAbertos + (l.nEpicosAbertos || 0),
  }), { total: 0, concluidos: 0, backlog: 0, emAndamento: 0, vencidos: 0, estH: 0, gastoH: 0, nEpicos: 0, nEpicosAbertos: 0 });
  totais.pctConcluido = totais.total ? Math.round((totais.concluidos / totais.total) * 1000) / 10 : 0;

  // Agregação por categoria de projeto (ITPR, IMI, DEF, DAMS, …): totais + atividade
  // dos últimos 30 dias (concluídos por dia e por pessoa) para as visões por foco.
  const categorias = {};
  projetos.forEach((p) => {
    if (p.erro) return;
    const c = categorias[p.categoria] || (categorias[p.categoria] = {
      projetos: [], total: 0, concluidos: 0, backlog: 0, emAndamento: 0, vencidos: 0,
      estH: 0, gastoH: 0, nEpicos: 0, nEpicosAbertos: 0, conc30: [],
    });
    c.projetos.push(p.key);
    c.total += p.total; c.concluidos += p.concluidos; c.backlog += p.backlog;
    c.emAndamento += p.emAndamento; c.vencidos += p.vencidos;
    c.estH = Math.round((c.estH + p.estH) * 10) / 10; c.gastoH = Math.round((c.gastoH + p.gastoH) * 10) / 10;
    c.nEpicos += p.nEpicos || 0; c.nEpicosAbertos += p.nEpicosAbertos || 0;
    (p.conc30 || []).forEach((x) => c.conc30.push({ ...x, proj: p.key }));
    delete p.conc30;   // a linha do projeto fica leve; a lista vive na categoria
  });
  Object.values(categorias).forEach((c) => {
    c.conc30.sort((a, b) => b.d.localeCompare(a.d));
    c.conc30 = c.conc30.slice(0, 400);
    c.pctConcluido = c.total ? Math.round((c.concluidos / c.total) * 1000) / 10 : 0;
  });

  return json(res, 200, cacheSetTTL(ck, { geradoEm: new Date().toISOString(), truncado: algumTrunc, projetos, totais, categorias }, 15));
}

export default async function handler(req, res) {
  try {
    if (String((req.query && req.query.visao) || '').trim()) return await visaoPorProjetos(req, res);

    const epicosDe = String((req.query && req.query.epicos) || '').trim().toUpperCase();
    if (epicosDe) return await listarEpicos(epicosDe, res, String((req.query && req.query.nocache) || '') === '1');

    const consDe = String((req.query && req.query.consultorias) || '').trim().toUpperCase();
    if (consDe) return await listarConsultorias(consDe, res);

    const projetos = semArquivados(await carregaCatalogoProjetos());
    return json(res, 200, { projetos });
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
