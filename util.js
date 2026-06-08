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

// Meio-dia (12:00) no fuso de São Paulo para uma data 'YYYY-MM-DD'. Usado para
// aritmética de dias e dia-da-semana sem risco de virada por fuso (SP = -03:00 fixo).
function spNoon(dateStr) {
  return new Date(`${dateStr}T12:00:00-03:00`);
}
function addDays(dateStr, n) {
  const t = spNoon(dateStr);
  t.setUTCDate(t.getUTCDate() + n);
  return spDateStr(t);
}
function weekdaySP(dateStr) {
  return spNoon(dateStr).getUTCDay(); // 0=domingo … 6=sábado
}
function primeiroDiaMes(dateStr) {
  return `${dateStr.slice(0, 8)}01`;
}

// Janelas suportadas. Além das três originais (hoje/7d/30d), agora há recortes
// por semana e por mês (atual e anterior) — ver normalizaJanela.
const JANELAS = new Set([
  'hoje', 'ontem', '7d', '30d',
  'estaSemana', 'semanaPassada', 'esteMes', 'mesPassado',
]);

export function normalizaJanela(j) {
  return JANELAS.has(j) ? j : '7d';
}

// Resolve o intervalo [startDate, endDate] (datas YYYY-MM-DD no fuso de SP) para
// a janela pedida. Semana começa na segunda-feira.
export function rangeFor(janela) {
  const now = new Date();
  const hoje = spDateStr(now);
  let startDate;
  let endDate;

  switch (janela) {
    case 'hoje':
      startDate = hoje; endDate = hoje; break;
    case 'ontem':
      startDate = addDays(hoje, -1); endDate = startDate; break;
    case '30d':
      startDate = addDays(hoje, -29); endDate = hoje; break;
    case 'estaSemana': {
      const off = (weekdaySP(hoje) + 6) % 7;       // segunda = 0
      startDate = addDays(hoje, -off); endDate = hoje; break;
    }
    case 'semanaPassada': {
      const off = (weekdaySP(hoje) + 6) % 7;
      const segAtual = addDays(hoje, -off);
      startDate = addDays(segAtual, -7);            // segunda anterior
      endDate = addDays(segAtual, -1);              // domingo anterior
      break;
    }
    case 'esteMes':
      startDate = primeiroDiaMes(hoje); endDate = hoje; break;
    case 'mesPassado': {
      endDate = addDays(primeiroDiaMes(hoje), -1);  // último dia do mês anterior
      startDate = primeiroDiaMes(endDate);
      break;
    }
    case '7d':
    default:
      startDate = addDays(hoje, -6); endDate = hoje; break;
  }

  return {
    janela,
    startDate,                                   // YYYY-MM-DD (limite inferior)
    endDate,                                      // YYYY-MM-DD (limite superior, inclusivo)
    startISO: `${startDate}T00:00:00-03:00`,      // limite inferior para filtrar eventos
    endISO: `${endDate}T23:59:59-03:00`,          // limite superior para filtrar eventos
    geradoEm: now.toISOString(),
  };
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
