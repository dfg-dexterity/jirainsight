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

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const ate = RE_DATA.test(q.ate || '') ? q.ate : hojeSP();
    const ck = `venc:${ate}`;
    if (q.nocache !== '1') {
      const cached = cacheGet(ck);
      if (cached) return json(res, 200, cached);
    }

    const { issues, truncado } = await jiraSearchAll({
      jql: `duedate <= "${ate}" AND statusCategory != Done ORDER BY duedate ASC`,
      fields: ['summary', 'duedate', 'assignee', 'status', 'project', 'issuetype', 'priority', 'timespent'],
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
        status: (f.status && f.status.name) || '—',
        venc: f.duedate || '',
        respId: ass.accountId || '',
        resp: ass.displayName || '',
        prio: (f.priority && f.priority.name) || '',
        seg: Number(f.timespent || 0),   // segundos já apontados no ticket (total)
      };
    });

    const payload = { meta: { ate, hoje: hojeSP(), total: tickets.length, truncado }, projetos, tickets };
    return json(res, 200, cacheSetTTL(ck, payload, 5));   // TTL curto: tela de ação
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
