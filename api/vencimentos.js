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
async function baseAnalytics(q, res) {
  const dias = Math.min(90, Math.max(7, Number(q.dias) || 30));
  const ck = `venc:analytics:${dias}`;
  if (q.nocache !== '1') {
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);
  }

  // Campo "Start date"/"Data de início" (se existir na instância) — para o check
  // de datas incoerentes (fim antes do início).
  let inicioId = '';
  try {
    const rf = await fetch(`${jiraBase()}/rest/api/3/field`, {
      headers: { Authorization: jiraAuthHeader(), Accept: 'application/json' },
    });
    if (rf.ok) {
      const campos = await rf.json();
      const c = (Array.isArray(campos) ? campos : []).find((x) => /^(start date|data de in[íi]cio)$/i.test(x.name || ''));
      inicioId = (c && c.id) || '';
    }
  } catch (e) { inicioId = ''; }

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

export default async function handler(req, res) {
  try {
    const q = req.query || {};
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
