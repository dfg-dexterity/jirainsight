// GET /api/vencimentos?ate=YYYY-MM-DD[&nocache=1]
// Lista os chamados ABERTOS (statusCategory != Done) com data de vencimento até a
// data pedida, com as horas já apontadas em cada um (timespent do Jira). Alimenta a
// tela "Apontar" — apontamento rápido dos tickets vencendo/vencidos.
import {
  cacheGet, cacheSetTTL, jiraSearchAll, json,
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

export default async function handler(req, res) {
  try {
    const q = req.query || {};
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
