// Utilitários compartilhados pelas funções serverless.
// Sem dependências externas: usa fetch global (Node >= 18).

// ---------------------------------------------------------------------------
// Cache simples em memória (best-effort por instância "quente" do serverless).
// Para cache compartilhado e durável, trocar por Vercel KV (ver README).
// ---------------------------------------------------------------------------
const _cache = new Map();
const TTL_MIN = Number(process.env.CACHE_TTL_MIN || 20);

export function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    _cache.delete(key);
    return null;
  }
  return hit.val;
}

export function cacheSet(key, val) {
  _cache.set(key, { val, exp: Date.now() + TTL_MIN * 60 * 1000 });
  return val;
}

// ---------------------------------------------------------------------------
// Datas no fuso America/Sao_Paulo (Brasil sem horário de verão = -03:00 fixo).
// ---------------------------------------------------------------------------
function spDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
}

// janela: 'hoje' | '7d' | '30d'
export function rangeFor(janela) {
  const now = new Date();
  const endDate = spDateStr(now);
  const dias = janela === 'hoje' ? 0 : janela === '30d' ? 29 : 6;
  const start = new Date(now.getTime() - dias * 86400000);
  const startDate = spDateStr(start);
  return {
    janela,
    startDate,                                  // YYYY-MM-DD
    endDate,                                     // YYYY-MM-DD
    startISO: `${startDate}T00:00:00-03:00`,     // limite inferior para filtrar eventos
    geradoEm: now.toISOString(),
  };
}

export function normalizaJanela(j) {
  return j === 'hoje' || j === '30d' ? j : '7d';
}

// ---------------------------------------------------------------------------
// Jira Cloud REST API v3
// ---------------------------------------------------------------------------
export function jiraBase() {
  const base = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('JIRA_BASE_URL não configurada');
  return base;
}

function jiraAuthHeader() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) throw new Error('JIRA_EMAIL / JIRA_API_TOKEN não configurados');
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

// Busca de issues via endpoint atual /rest/api/3/search/jql (o antigo /search foi
// removido em 2025). Paginação por nextPageToken. Retorna todas as issues.
export async function jiraSearchAll({ jql, fields, expand, maxPages = 60, pageSize = 100 }) {
  const url = `${jiraBase()}/rest/api/3/search/jql`;
  const headers = {
    Authorization: jiraAuthHeader(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  let nextPageToken;
  let pages = 0;
  const out = [];
  do {
    const body = { jql, maxResults: pageSize };
    if (fields) body.fields = fields;
    if (expand) body.expand = expand;
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Jira ${resp.status}: ${txt.slice(0, 400)}`);
    }
    const data = await resp.json();
    (data.issues || []).forEach((i) => out.push(i));
    nextPageToken = data.isLast ? undefined : data.nextPageToken;
    pages += 1;
  } while (nextPageToken && pages < maxPages);

  return { issues: out, pages, truncado: !!nextPageToken };
}

// Resolve metadados (projeto, tipo) para uma lista de IDs numéricos de issue.
// Usado pela função de tempo para enriquecer os worklogs do Clockwork.
export async function jiraResolveIssues(ids) {
  const mapa = {};
  const unicos = [...new Set(ids.map(String))].filter(Boolean);
  for (let i = 0; i < unicos.length; i += 100) {
    const lote = unicos.slice(i, i + 100);
    const { issues } = await jiraSearchAll({
      jql: `id in (${lote.join(',')})`,
      fields: ['project', 'issuetype'],
      pageSize: 100,
      maxPages: 1,
    });
    for (const it of issues) {
      const f = it.fields || {};
      const proj = f.project || {};
      mapa[String(it.id)] = {
        projetoKey: proj.key || '—',
        projetoNome: proj.name || '—',
        categoria: (proj.projectCategory && proj.projectCategory.name) || 'Sem categoria',
        tipo: (f.issuetype && f.issuetype.name) || '—',
      };
    }
  }
  return mapa;
}

// Heurística de faturável a partir do nome do tipo de issue.
// Os tipos da Dexterity já distinguem (ex.: "Tarefas ADM - Não Faturavel").
// Pode ser sobrescrita via env NAO_FATURAVEL_REGEX.
const RE_NAO_FATURAVEL = new RegExp(process.env.NAO_FATURAVEL_REGEX || 'n[aã]o.?fatur', 'i');
export function ehFaturavel(tipo) {
  return !RE_NAO_FATURAVEL.test(tipo || '');
}

export function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
