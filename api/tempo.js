// GET /api/tempo?janela=hoje|7d|30d
// Lê os apontamentos de horas do Clockwork (Pro) na janela, enriquece cada worklog
// com projeto/categoria/tipo via Jira e classifica faturável vs não-faturável.
import {
  rangeFor, normalizaJanela, cacheGet, cacheSet,
  jiraResolveIssues, ehFaturavel, json,
} from './_lib/util.js';

const CW_BASE = 'https://api.clockwork.report/v1';

async function clockworkWorklogs(startDate, endDate) {
  const token = process.env.CLOCKWORK_API_TOKEN;
  if (!token) throw new Error('CLOCKWORK_API_TOKEN não configurada');
  const headers = { Authorization: `Token ${token}` };
  const out = [];
  let offset = 0;
  // Limite de 10000 worklogs por requisição; pagina por offset.
  for (let i = 0; i < 20; i += 1) {
    const qs = new URLSearchParams({
      starting_at: startDate,
      ending_at: endDate,
      expand: 'issues,authors,emails,worklogs',
      tz: 'America/Sao_Paulo',
      offset: String(offset),
    });
    const resp = await fetch(`${CW_BASE}/worklogs?${qs}`, { headers });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Clockwork ${resp.status}: ${txt.slice(0, 400)}`);
    }
    const lote = await resp.json();
    if (!Array.isArray(lote) || lote.length === 0) break;
    out.push(...lote);
    if (lote.length < 10000) break;
    offset += 10000;
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const janela = normalizaJanela((req.query && req.query.janela) || '7d');
    const ck = `tempo:${janela}`;
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);

    const r = rangeFor(janela);
    const brutos = await clockworkWorklogs(r.startDate, r.endDate);

    // IDs de issue para resolver projeto/tipo no Jira.
    const ids = brutos
      .map((w) => String((w.issue && (w.issue.id || w.issueId)) || w.issueId || ''))
      .filter(Boolean);
    const meta = ids.length ? await jiraResolveIssues(ids) : {};

    const pessoas = {};   // accountId -> {nome,email}
    const projetos = {};  // key -> {nome,categoria}
    const worklogs = [];  // {a,s,d,p,t,f}

    for (const w of brutos) {
      const author = w.author || {};
      const aid = author.accountId;
      if (!aid) continue;
      if (!pessoas[aid]) {
        pessoas[aid] = {
          nome: author.displayName || aid,
          email: author.emailAddress || author.email || '',
        };
      }
      const issueId = String((w.issue && (w.issue.id || w.issueId)) || w.issueId || '');
      const m = meta[issueId] || { projetoKey: '—', projetoNome: '—', categoria: 'Sem categoria', tipo: '—', issueKey: '' };
      if (!projetos[m.projetoKey]) {
        projetos[m.projetoKey] = { nome: m.projetoNome, categoria: m.categoria };
      }
      worklogs.push({
        a: aid,
        s: Number(w.timeSpentSeconds || 0),
        d: w.started || '',
        p: m.projetoKey,
        t: m.tipo,
        f: ehFaturavel(m.tipo) ? 1 : 0,
        k: m.issueKey || (w.issue && w.issue.key) || '',
      });
    }

    const payload = {
      meta: { ...r, totalWorklogs: worklogs.length },
      pessoas,
      projetos,
      worklogs,
    };
    return json(res, 200, cacheSet(ck, payload));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
