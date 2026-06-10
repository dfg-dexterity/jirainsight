// GET /api/teams — monta o RANKING DIÁRIO de apontamento (último dia útil) e envia
// ao Microsoft Teams via webhook (fluxo "Quando uma solicitação de webhook é
// recebida" do Workflows/Power Automate, ou webhook de entrada clássico).
//
// Configuração:
//   TEAMS_WEBHOOK_URL  (obrigatória)  URL do webhook do canal
//   CRON_SECRET        (opcional)     se definida, exige Authorization: Bearer <segredo>
//                                     (a Vercel envia automaticamente no cron)
// Parâmetros: ?dry=1 visualiza o cartão sem enviar · ?forcar=1 envia mesmo em fim
// de semana/feriado (o cron pula esses dias).
import { jiraBase, jiraUsuariosAtivos, json } from './_lib/util.js';

const CW_BASE = 'https://api.clockwork.report/v1';

// ---- Datas / feriados nacionais (mesma lógica do painel) ----
function spDate(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); }
function addDias(s, n) { const t = new Date(`${s}T12:00:00-03:00`); t.setUTCDate(t.getUTCDate() + n); return spDate(t); }
function diaSemana(s) { return new Date(`${s}T12:00:00-03:00`).getUTCDay(); }
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}
function feriadosBR(ano) {
  const p = pascoa(ano); const iso = (d) => d.toISOString().slice(0, 10);
  const ad = (n) => { const x = new Date(p); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
  const f = new Set([`${ano}-01-01`, ad(-48), ad(-47), ad(-2), `${ano}-04-21`, `${ano}-05-01`, ad(60),
    `${ano}-09-07`, `${ano}-10-12`, `${ano}-11-02`, `${ano}-11-15`, `${ano}-12-25`]);
  if (ano >= 2024) f.add(`${ano}-11-20`);
  return f;
}
function ehUtilBR(s, extras, removidos) {
  const w = diaSemana(s);
  if (w === 0 || w === 6) return false;
  if (removidos.has(s)) return true;                 // feriado removido na config = dia útil normal? não: removido => trabalha
  if (extras.has(s)) return false;
  return !feriadosBR(+s.slice(0, 4)).has(s);
}

// Config compartilhada (metas/ausências/feriados) do Supabase, se configurado.
async function configCompartilhada() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  const def = { metaGlobalH: 8, metasPessoa: {}, ausencias: [], feriadosExtra: {}, feriadosRemovidos: [] };
  if (!base || !key) return def;
  try {
    const r = await fetch(`${base}/rest/v1/jirainsight_config?id=eq.default&select=data`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return def;
    const rows = await r.json();
    return Object.assign(def, (rows && rows[0] && rows[0].data) || {});
  } catch (e) { return def; }
}

async function worklogsDoDia(dia) {
  const token = process.env.CLOCKWORK_API_TOKEN;
  if (!token) throw new Error('CLOCKWORK_API_TOKEN não configurada');
  const qs = new URLSearchParams({ starting_at: dia, ending_at: dia, expand: 'authors', tz: 'America/Sao_Paulo' });
  const r = await fetch(`${CW_BASE}/worklogs?${qs}`, { headers: { Authorization: `Token ${token}` } });
  if (!r.ok) throw new Error(`Clockwork ${r.status}`);
  const lote = await r.json();
  const porPessoa = {};
  for (const w of (Array.isArray(lote) ? lote : [])) {
    const a = (w.author && w.author.accountId) || '';
    if (!a) continue;
    porPessoa[a] = (porPessoa[a] || 0) + Number(w.timeSpentSeconds || 0);
  }
  return porPessoa;
}

// Contagem aproximada de issues por JQL (rápida, sem paginar).
async function contaJQL(jql) {
  const email = process.env.JIRA_EMAIL, token = process.env.JIRA_API_TOKEN;
  if (!email || !token) return null;
  try {
    const r = await fetch(`${jiraBase()}/rest/api/3/search/approximate-count`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
        'Content-Type': 'application/json', Accept: 'application/json',
      },
      body: JSON.stringify({ jql }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.count === 'number' ? d.count : null;
  } catch (e) { return null; }
}

const fmtH = (seg) => {
  const h = Math.floor(seg / 3600), m = Math.round((seg % 3600) / 60);
  if (h && m) return `${h}h${String(m).padStart(2, '0')}`;
  return h ? `${h}h` : `${m}m`;
};

export default async function handler(req, res) {
  try {
    const segredo = process.env.CRON_SECRET || '';
    if (segredo) {
      const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
      if (auth !== `Bearer ${segredo}`) return json(res, 401, { erro: 'Não autorizado.' });
    }
    const webhook = process.env.TEAMS_WEBHOOK_URL || '';
    const q = req.query || {};
    const dry = q.dry === '1';
    if (!webhook && !dry) return json(res, 200, { enviado: false, erro: 'TEAMS_WEBHOOK_URL não configurada.' });

    const cfg = await configCompartilhada();
    const extras = new Set(Object.keys(cfg.feriadosExtra || {}));
    const removidos = new Set(cfg.feriadosRemovidos || []);
    const hoje = spDate(new Date());

    // O cron roda seg–sex; ainda assim, pula feriados (a menos que ?forcar=1).
    if (!ehUtilBR(hoje, extras, removidos) && q.forcar !== '1' && !dry) {
      return json(res, 200, { enviado: false, motivo: `Hoje (${hoje}) não é dia útil.` });
    }

    // Último dia útil FECHADO antes de hoje.
    let dia = addDias(hoje, -1);
    for (let i = 0; i < 10 && !ehUtilBR(dia, extras, removidos); i += 1) dia = addDias(dia, -1);

    const [porPessoa, pessoas] = await Promise.all([worklogsDoDia(dia), jiraUsuariosAtivos()]);
    const ehAusente = (a) => (cfg.ausencias || []).some((x) => x.a === a && dia >= x.de && dia <= x.ate);
    const metaSeg = (a) => Math.max(0, Number((cfg.metasPessoa || {})[a] != null ? cfg.metasPessoa[a] : cfg.metaGlobalH) || 0) * 3600;

    const linhas = Object.keys(pessoas)
      .filter((a) => !ehAusente(a))
      .map((a) => ({ a, nome: pessoas[a].nome, seg: porPessoa[a] || 0, meta: metaSeg(a) }))
      .sort((x, y) => (y.seg - x.seg) || x.nome.localeCompare(y.nome, 'pt'));
    const comHoras = linhas.filter((l) => l.seg > 0);
    const semHoras = linhas.filter((l) => l.seg <= 0 && l.meta > 0);

    const medalhas = ['🥇', '🥈', '🥉'];
    const linhasTxt = comHoras.map((l, i) => {
      const pctv = l.meta ? Math.round((l.seg / l.meta) * 100) : null;
      const ic = i < 3 ? medalhas[i] : (pctv != null && pctv < 60 ? '🔸' : '•');
      return `${ic} **${l.nome}** — ${fmtH(l.seg)}${pctv != null ? ` (${pctv}% da meta)` : ''}`;
    });

    const [criados, resolvidos] = await Promise.all([
      contaJQL(`created >= "${dia}" AND created <= "${dia} 23:59"`),
      contaJQL(`resolutiondate >= "${dia}" AND resolutiondate <= "${dia} 23:59"`),
    ]);

    const titulo = `📊 Ranking de apontamento — ${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
    const blocos = [
      { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: titulo },
      { type: 'TextBlock', wrap: true, text: linhasTxt.length ? linhasTxt.join('\n\n') : '_Ninguém apontou horas nesse dia._' },
    ];
    if (semHoras.length) {
      blocos.push({
        type: 'TextBlock', wrap: true, color: 'Attention',
        text: `🔴 **Sem apontamento:** ${semHoras.map((l) => l.nome).join(', ')}`,
      });
    }
    const uso = [];
    if (criados != null) uso.push(`Chamados criados: **${criados}**`);
    if (resolvidos != null) uso.push(`Resolvidos: **${resolvidos}**`);
    if (uso.length) blocos.push({ type: 'TextBlock', wrap: true, isSubtle: true, text: `Uso do Jira no dia · ${uso.join(' · ')}` });
    blocos.push({ type: 'TextBlock', isSubtle: true, size: 'Small', text: 'Enviado automaticamente pelo painel Insights de Uso (Jira + Clockwork).' });

    const cartao = {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard', version: '1.4', msteams: { width: 'Full' }, body: blocos,
        },
      }],
    };

    if (dry) return json(res, 200, { enviado: false, dry: true, dia, cartao });

    const r = await fetch(webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cartao),
    });
    const okEnvio = r.status >= 200 && r.status < 300;
    return json(res, 200, {
      enviado: okEnvio, dia, status: r.status,
      pessoas: comHoras.length, semApontamento: semHoras.length,
      ...(okEnvio ? {} : { erro: (await r.text()).slice(0, 300) }),
    });
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
