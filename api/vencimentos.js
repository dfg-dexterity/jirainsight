// GET /api/vencimentos?ate=YYYY-MM-DD[&nocache=1]
// Lista os chamados ABERTOS (statusCategory != Done) com data de vencimento até a
// data pedida, com as horas já apontadas em cada um (timespent do Jira). Alimenta a
// tela "Apontar" — apontamento rápido dos tickets vencendo/vencidos.
import {
  cacheGet, cacheSetTTL, jiraSearchAll, jiraBase, jiraAuthHeader, json,
} from './_lib/util.js';

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// GET /api/vencimentos?semHoras=1[&dias=30] — chamados CONCLUÍDOS (statusCategory =
// Done) sem NENHUMA hora apontada (timespent vazio/0) no período. Alimenta a categoria
// "Concluído sem horas" da Central de Alertas: fechou o ticket sem registrar o trabalho.
// Fora da conta (mas contados em meta.ignorados): agrupadores (História/Épico — as horas
// ficam nas subtarefas) e resoluções de descarte (cancelado/duplicado/rejeitado).
async function concluidosSemHoras(q, res) {
  const dias = Math.min(90, Math.max(7, Number(q.dias) || 30));
  const ck = `venc:semhoras:${dias}`;
  if (q.nocache !== '1') {
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);
  }
  const { issues, truncado } = await jiraSearchAll({
    jql: `statusCategory = Done AND (timespent IS EMPTY OR timespent = 0) AND resolved >= -${dias}d ORDER BY resolved DESC`,
    fields: ['summary', 'issuetype', 'assignee', 'resolution', 'resolutiondate', 'project', 'status'],
    pageSize: 100,
    maxPages: 3,
  });
  const RE_AGRUP = /hist[óo]ria|story|épico|epic/i;
  const RE_DESCARTE = /cancel|duplic|won'?t|descart|rejeit|obsolet/i;
  let agrupadores = 0; let descartados = 0;
  const tickets = [];
  for (const it of issues) {
    const f = it.fields || {};
    const tipo = (f.issuetype && f.issuetype.name) || '';
    const resol = (f.resolution && f.resolution.name) || '';
    if (RE_AGRUP.test(tipo)) { agrupadores += 1; continue; }
    if (RE_DESCARTE.test(resol)) { descartados += 1; continue; }
    const ass = f.assignee || {};
    tickets.push({
      k: it.key,
      resumo: f.summary || '',
      p: (f.project && f.project.key) || String(it.key).split('-')[0],
      t: tipo,
      tIcon: (f.issuetype && f.issuetype.iconUrl) || '',
      status: (f.status && f.status.name) || '',
      resp: ass.displayName || '',
      respId: ass.accountId || '',
      resol,
      resolvido: String(f.resolutiondate || '').slice(0, 10),
    });
  }
  const payload = {
    meta: { dias, hoje: hojeSP(), total: tickets.length, truncado, ignorados: { agrupadores, descartados } },
    tickets,
  };
  return json(res, 200, cacheSetTTL(ck, payload, 5));
}

// ---------------------------------------------------------------------------
// GET /api/vencimentos?analytics=1[&dias=30] — BASE DE DADOS do módulo 📈 Analytics.
// Devolve três conjuntos brutos (as regras/checks rodam no front, numa passada):
//   abertos     — todos os chamados não concluídos, com descrição (tamanho), estimativa,
//                 pai/épico, prioridade, datas (criação/vencimento/início) e labels;
//   concluidos  — resolvidos no período, com horas e nº de anexos (evidência);
//   reabertos   — resolution preenchida em status NÃO concluído (proxy de reaberto).
// ---------------------------------------------------------------------------
function adfTexto(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.text || '';
  const filhos = (node.content || []).map(adfTexto).join('');
  return node.type === 'paragraph' || node.type === 'heading' ? `${filhos} ` : filhos;
}
// Campo "Start date"/"Data de início" (se existir na instância) — usado pelo
// Analytics (datas incoerentes) e pelo detalhe do ticket.
async function descobreCampoInicio() {
  try {
    const rf = await fetch(`${jiraBase()}/rest/api/3/field`, {
      headers: { Authorization: jiraAuthHeader(), Accept: 'application/json' },
    });
    if (!rf.ok) return '';
    const campos = await rf.json();
    const c = (Array.isArray(campos) ? campos : []).find((x) => /^(start date|data de in[íi]cio)$/i.test(x.name || ''));
    return (c && c.id) || '';
  } catch (e) { return ''; }
}

async function baseAnalytics(q, res) {
  const dias = Math.min(90, Math.max(7, Number(q.dias) || 30));
  const ck = `venc:analytics:${dias}`;
  if (q.nocache !== '1') {
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);
  }
  const inicioId = await descobreCampoInicio();

  const fieldsA = ['summary', 'duedate', 'assignee', 'status', 'project', 'issuetype', 'priority',
    'timespent', 'updated', 'created', 'timeoriginalestimate', 'parent', 'labels', 'description'];
  if (inicioId) fieldsA.push(inicioId);
  const rA = await jiraSearchAll({
    jql: 'statusCategory != Done ORDER BY updated DESC',
    fields: fieldsA, pageSize: 100, maxPages: 8,
  });
  const abertos = rA.issues.map((it) => {
    const f = it.fields || {};
    const ass = f.assignee || {};
    return {
      k: it.key,
      resumo: f.summary || '',
      p: (f.project && f.project.key) || String(it.key).split('-')[0],
      t: (f.issuetype && f.issuetype.name) || '',
      sub: !!(f.issuetype && f.issuetype.subtask),
      status: (f.status && f.status.name) || '',
      statCat: (f.status && f.status.statusCategory && f.status.statusCategory.key) || '',  // new|indeterminate
      venc: f.duedate || '',
      respId: ass.accountId || '',
      resp: ass.displayName || '',
      prio: (f.priority && f.priority.name) || '',
      seg: Number(f.timespent || 0),
      est: Number(f.timeoriginalestimate || 0),
      up: f.updated || '',
      criado: String(f.created || '').slice(0, 10),
      descLen: adfTexto(f.description).replace(/\s+/g, ' ').trim().length,
      labels: (f.labels || []).slice(0, 10),
      pai: (f.parent && f.parent.key) || '',
      inicio: inicioId ? String(f[inicioId] || '').slice(0, 10) : '',
    };
  });

  const rC = await jiraSearchAll({
    jql: `statusCategory = Done AND resolved >= -${dias}d ORDER BY resolved DESC`,
    fields: ['summary', 'issuetype', 'assignee', 'resolution', 'resolutiondate', 'project', 'timespent', 'attachment'],
    pageSize: 100, maxPages: 3,
  });
  const concluidos = rC.issues.map((it) => {
    const f = it.fields || {};
    const ass = f.assignee || {};
    return {
      k: it.key,
      resumo: f.summary || '',
      p: (f.project && f.project.key) || String(it.key).split('-')[0],
      t: (f.issuetype && f.issuetype.name) || '',
      sub: !!(f.issuetype && f.issuetype.subtask),
      resp: ass.displayName || '',
      respId: ass.accountId || '',
      resol: (f.resolution && f.resolution.name) || '',
      resolvido: String(f.resolutiondate || '').slice(0, 10),
      seg: Number(f.timespent || 0),
      anexos: Array.isArray(f.attachment) ? f.attachment.length : 0,
    };
  });

  const rR = await jiraSearchAll({
    jql: 'statusCategory != Done AND resolution IS NOT EMPTY ORDER BY updated DESC',
    fields: ['summary', 'status', 'assignee', 'project', 'resolution'],
    pageSize: 100, maxPages: 1,
  });
  const reabertos = rR.issues.map((it) => {
    const f = it.fields || {};
    return {
      k: it.key,
      resumo: f.summary || '',
      p: (f.project && f.project.key) || String(it.key).split('-')[0],
      status: (f.status && f.status.name) || '',
      resp: (f.assignee && f.assignee.displayName) || '',
      resol: (f.resolution && f.resolution.name) || '',
    };
  });

  const payload = {
    meta: {
      dias, hoje: hojeSP(), geradoEm: new Date().toISOString(), temInicio: !!inicioId,
      truncado: { abertos: !!rA.truncado, concluidos: !!rC.truncado, reabertos: !!rR.truncado },
    },
    abertos, concluidos, reabertos,
  };
  return json(res, 200, cacheSetTTL(ck, payload, 5));
}

// ---------------------------------------------------------------------------
// GET /api/vencimentos?detalhe=KEY — FICHA COMPLETA de um ticket (conta de
// serviço, leitura): descrição em texto, comentários recentes, anexos,
// worklogs (por pessoa + últimos), datas, épico/pai, labels, prioridade.
// Alimenta o modal "🔍 detalhes" do Analytics/Gestão — a pessoa não precisa
// abrir o Jira para entender o chamado.
// ---------------------------------------------------------------------------
const RE_ISSUE_V = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
async function detalheTicket(q, res) {
  const k = String(q.detalhe || '').trim().toUpperCase();
  if (!RE_ISSUE_V.test(k)) return json(res, 400, { erro: 'Ticket inválido.' });
  const ck = `venc:detalhe:${k}`;
  if (q.nocache !== '1') {
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);
  }
  const base = jiraBase();
  const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };
  const inicioId = await descobreCampoInicio();
  const fields = ['summary', 'description', 'status', 'issuetype', 'priority', 'assignee', 'reporter',
    'created', 'updated', 'duedate', 'resolutiondate', 'resolution', 'labels', 'parent', 'project',
    'timespent', 'timeoriginalestimate', 'attachment', 'comment'];
  if (inicioId) fields.push(inicioId);
  const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(k)}?fields=${fields.join(',')}`, { headers });
  if (r.status === 404) return json(res, 404, { erro: `Ticket ${k} não encontrado.` });
  if (!r.ok) { const t = await r.text(); return json(res, 500, { erro: `Jira ${r.status}: ${t.slice(0, 200)}` }); }
  const d = await r.json();
  const f = d.fields || {};
  const pessoa = (u) => (u && u.displayName) || '';
  const dia = (iso) => String(iso || '').slice(0, 10);

  const comAll = (f.comment && f.comment.comments) || [];
  const comentarios = comAll.slice(-6).map((c) => ({
    por: pessoa(c.author), quando: dia(c.created),
    texto: adfTexto(c.body).replace(/\s+/g, ' ').trim().slice(0, 600),
  })).reverse();

  const anexos = (Array.isArray(f.attachment) ? f.attachment : []).slice(0, 20).map((a) => ({
    nome: a.filename || '', kb: Math.round((Number(a.size) || 0) / 1024), quando: dia(a.created), por: pessoa(a.author),
  }));

  // Worklogs: totais por pessoa + últimos lançamentos.
  let porPessoa = []; let ultimos = []; let totalSeg = 0;
  try {
    const rw = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(k)}/worklog?maxResults=100`, { headers });
    if (rw.ok) {
      const wl = ((await rw.json()).worklogs) || [];
      const acc = {};
      wl.forEach((w) => {
        const nome = pessoa(w.author) || '—'; const s = Number(w.timeSpentSeconds) || 0;
        acc[nome] = (acc[nome] || 0) + s; totalSeg += s;
      });
      porPessoa = Object.entries(acc).map(([nome, seg]) => ({ nome, seg })).sort((a, b) => b.seg - a.seg);
      ultimos = wl.slice(-5).map((w) => ({
        por: pessoa(w.author), dia: dia(w.started), seg: Number(w.timeSpentSeconds) || 0,
        coment: adfTexto(w.comment).replace(/\s+/g, ' ').trim().slice(0, 160),
      })).reverse();
    }
  } catch (e) { /* worklogs indisponíveis: a ficha segue sem eles */ }

  const payload = {
    k: d.key, resumo: f.summary || '',
    desc: adfTexto(f.description).trim().slice(0, 5000),
    t: (f.issuetype && f.issuetype.name) || '', tIcon: (f.issuetype && f.issuetype.iconUrl) || '',
    status: (f.status && f.status.name) || '',
    statCat: (f.status && f.status.statusCategory && f.status.statusCategory.key) || '',
    prio: (f.priority && f.priority.name) || '', prioIcon: (f.priority && f.priority.iconUrl) || '',
    p: (f.project && f.project.key) || '', pNome: (f.project && f.project.name) || '',
    pai: (f.parent && f.parent.key) || '', paiResumo: (f.parent && f.parent.fields && f.parent.fields.summary) || '',
    labels: (f.labels || []).slice(0, 15),
    resp: pessoa(f.assignee), respId: (f.assignee && f.assignee.accountId) || '', relator: pessoa(f.reporter),
    criado: dia(f.created), atualizado: dia(f.updated), venc: f.duedate || '',
    inicio: inicioId ? dia(f[inicioId]) : '', resolvido: dia(f.resolutiondate),
    resol: (f.resolution && f.resolution.name) || '',
    seg: Number(f.timespent || 0), est: Number(f.timeoriginalestimate || 0),
    nComentarios: (f.comment && Number(f.comment.total)) || comAll.length,
    comentarios, anexos,
    worklogs: { totalSeg, porPessoa, ultimos },
  };
  return json(res, 200, cacheSetTTL(ck, payload, 3));
}

// ---------------------------------------------------------------------------
// GET /api/vencimentos?mencoes=1&accountId=XXX[&dias=14] — chamados em que a
// pessoa foi MARCADA (@) em comentários recentes. Varre o ADF dos comentários
// dos tickets atualizados no período procurando nós {type:'mention'} com o
// accountId — determinístico (não depende da busca de texto do Jira).
// respondido = existe comentário DA PESSOA depois da menção.
// ---------------------------------------------------------------------------
function achaMencao(node, accountId) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'mention' && node.attrs && String(node.attrs.id) === accountId) return true;
  return (node.content || []).some((f) => achaMencao(f, accountId));
}
async function mencoesDe(q, res) {
  const accountId = String(q.accountId || '').trim();
  if (!/^[\w:-]{5,128}$/.test(accountId)) return json(res, 400, { erro: 'accountId inválido.' });
  const dias = Math.min(60, Math.max(3, Number(q.dias) || 14));
  const ck = `venc:mencoes:${accountId}:${dias}`;
  if (q.nocache !== '1') {
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);
  }
  const { issues, truncado } = await jiraSearchAll({
    jql: `updated >= -${dias}d ORDER BY updated DESC`,
    fields: ['summary', 'status', 'assignee', 'project', 'issuetype', 'comment'],
    pageSize: 100,
    maxPages: 3,
  });
  const mencoes = [];
  for (const it of issues) {
    const f = it.fields || {};
    const coms = (f.comment && f.comment.comments) || [];
    // Última menção à pessoa neste ticket (feita por OUTRA pessoa).
    let m = null;
    for (const c of coms) {
      const autorId = (c.author && c.author.accountId) || '';
      if (autorId === accountId) continue;                     // automenção não conta
      if (achaMencao(c.body, accountId)) m = c;
    }
    if (!m) continue;
    const respondido = coms.some((c) => ((c.author && c.author.accountId) || '') === accountId
      && String(c.created || '') > String(m.created || ''));
    const ass = f.assignee || {};
    mencoes.push({
      k: it.key,
      resumo: f.summary || '',
      p: (f.project && f.project.key) || String(it.key).split('-')[0],
      t: (f.issuetype && f.issuetype.name) || '',
      status: (f.status && f.status.name) || '',
      statCat: (f.status && f.status.statusCategory && f.status.statusCategory.key) || '',
      resp: ass.displayName || '', respId: ass.accountId || '',
      por: (m.author && m.author.displayName) || '—',
      porId: (m.author && m.author.accountId) || '',
      quando: String(m.created || '').slice(0, 16).replace('T', ' '),
      dia: String(m.created || '').slice(0, 10),
      texto: adfTexto(m.body).replace(/\s+/g, ' ').trim().slice(0, 500),
      respondido,
    });
  }
  mencoes.sort((a, b) => (a.quando < b.quando ? 1 : -1));
  const payload = {
    meta: { dias, hoje: hojeSP(), total: mencoes.length,
      pendentes: mencoes.filter((x) => !x.respondido).length, truncado },
    mencoes,
  };
  return json(res, 200, cacheSetTTL(ck, payload, 3));
}

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    if (q.mencoes === '1') return await mencoesDe(q, res);
    if (q.detalhe) return await detalheTicket(q, res);
    if (q.analytics === '1') return await baseAnalytics(q, res);
    if (q.semHoras === '1') return await concluidosSemHoras(q, res);
    const ate = RE_DATA.test(q.ate || '') ? q.ate : hojeSP();
    const semVenc = q.incluirSemVenc === '1';          // também trazer chamados SEM data de vencimento
    const ck = `venc:${ate}:${semVenc ? 'sv' : 'nv'}`;
    if (q.nocache !== '1') {
      const cached = cacheGet(ck);
      if (cached) return json(res, 200, cached);
    }

    // Vencidos/vencendo até a data; opcionalmente também os SEM vencimento (para programar).
    const filtroVenc = semVenc ? `(duedate <= "${ate}" OR duedate IS EMPTY)` : `duedate <= "${ate}"`;
    const { issues, truncado } = await jiraSearchAll({
      jql: `${filtroVenc} AND statusCategory != Done ORDER BY duedate ASC`,
      fields: ['summary', 'duedate', 'assignee', 'status', 'project', 'issuetype', 'priority', 'timespent', 'updated', 'timeoriginalestimate', 'parent'],
      pageSize: 100,
      maxPages: 5,                       // até 500 chamados em aberto
    });

    const projetos = {};                 // key -> {nome,categoria}
    const tickets = issues.map((it) => {
      const f = it.fields || {};
      const proj = f.project || {};
      const pk = proj.key || '—';
      if (!projetos[pk]) {
        projetos[pk] = {
          nome: proj.name || pk,
          categoria: (proj.projectCategory && proj.projectCategory.name) || 'Sem categoria',
        };
      }
      const ass = f.assignee || {};
      return {
        k: it.key,
        resumo: f.summary || '',
        p: pk,
        t: (f.issuetype && f.issuetype.name) || '—',
        tIcon: (f.issuetype && f.issuetype.iconUrl) || '',   // ícone do tipo (épico/tarefa/bug…) no Jira
        status: (f.status && f.status.name) || '—',
        venc: f.duedate || '',
        respId: ass.accountId || '',
        resp: ass.displayName || '',
        prio: (f.priority && f.priority.name) || '',
        prioIcon: (f.priority && f.priority.iconUrl) || '',  // ícone da prioridade no Jira
        seg: Number(f.timespent || 0),   // segundos já apontados no ticket (total)
        up: f.updated || '',             // última atividade (qualquer alteração no ticket)
        est: Number(f.timeoriginalestimate || 0),  // estimativa original (segundos), se houver
        pai: (f.parent && f.parent.key) || '',     // épico/pai (para o "Ajustar épicos")
        sub: !!(f.issuetype && f.issuetype.subtask),
      };
    });

    const payload = { meta: { ate, hoje: hojeSP(), total: tickets.length, truncado, semVenc }, projetos, tickets };
    return json(res, 200, cacheSetTTL(ck, payload, 5));   // TTL curto: tela de ação
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
