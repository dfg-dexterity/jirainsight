// GET /api/teams — envios agendados ao Microsoft Teams via webhook:
//   · RANKING DIÁRIO de apontamento (último dia útil)          — como sempre
//   · RESUMO DE ATIVIDADES gerado por IA (diário ou semanal)   — ?tipo=resumo
//
// Configuração:
//   TEAMS_WEBHOOK_URL  (obrigatória)  URL do webhook do canal
//   CRON_SECRET        (opcional)     se definida, exige Authorization: Bearer <segredo>
//   ANTHROPIC_API_KEY  (p/ o resumo)  chave da API do Claude
// Parâmetros: ?dry=1 visualiza o cartão sem enviar · ?forcar=1 envia mesmo em fim
// de semana/feriado · ?tipo=resumo aciona o resumo IA · ?cron=1 (agendador): decide
// pelos horários configurados no painel (cfg.teamsHora e cfg.teamsResumo).
import { jiraBase, jiraUsuariosAtivos, json, configCompartilhada as cfgCompartilhada, feriadosBR } from './_lib/util.js';
import { coletaAtividade } from './_lib/atividade.js';
import { chamaClaude } from './_lib/ia.js';

const CW_BASE = 'https://api.clockwork.report/v1';
const MAX_PESSOAS_RESUMO = 25;

// ---- Datas / feriados nacionais (mesma lógica do painel) ----
function spDate(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); }
function addDias(s, n) { const t = new Date(`${s}T12:00:00-03:00`); t.setUTCDate(t.getUTCDate() + n); return spDate(t); }
function diaSemana(s) { return new Date(`${s}T12:00:00-03:00`).getUTCDay(); }
function ehUtilBR(s, extras, removidos) {
  const w = diaSemana(s);
  if (w === 0 || w === 6) return false;
  if (removidos.has(s)) return true;                 // feriado removido na config = dia útil normal? não: removido => trabalha
  if (extras.has(s)) return false;
  return !feriadosBR(+s.slice(0, 4)).has(s);
}

// Config compartilhada (metas/ausências/feriados/horários) do Supabase, se configurado.
function configCompartilhada() {
  return cfgCompartilhada({ metaGlobalH: 8, metasPessoa: {}, ausencias: [], feriadosExtra: {}, feriadosRemovidos: [], ocultos: [] });
}

// Estado do agendamento (último envio de CADA tipo) — linha própria na tabela de
// config do Supabase (id='teams_estado'), para o cron de 30 em 30 min não enviar 2×.
// Sem Supabase, devolve null e o gate usa uma janela de 25 min como dedupe.
async function teamsEstado() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  try {
    const r = await fetch(`${base}/rest/v1/jirainsight_config?id=eq.teams_estado&select=data`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return {};
    const rows = await r.json();
    return (rows && rows[0] && rows[0].data) || {};
  } catch (e) { return {}; }
}
async function gravaTeamsEstado(patch, atual) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return;
  try {
    // merge-duplicates substitui a coluna "data" inteira: grava o objeto COMPLETO
    // (estado atual + patch) para não apagar o último envio do outro tipo.
    await fetch(`${base}/rest/v1/jirainsight_config`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: 'teams_estado', data: Object.assign({}, atual || {}, patch) }),
    });
  } catch (e) { /* pior caso: um envio duplicado amanhã — preferível a não enviar */ }
}

// Gate de horário: já passou da hora configurada e ainda não foi enviado hoje?
// Devolve { pronto, motivo } — sem Supabase usa a janela de 25 min como dedupe.
function gateHorario(horaCfg, agora, hoje, ultimoEnvio) {
  if (agora < horaCfg) return { pronto: false, motivo: `aguardando ${horaCfg} (agora ${agora})` };
  if (ultimoEnvio === hoje) return { pronto: false, motivo: `já enviado hoje (${hoje})` };
  if (ultimoEnvio === undefined) {
    // Sem Supabase para lembrar o último envio: janela de 25 min após a hora
    // (o cron é de 30 em 30 min → no máximo 1 tique cai na janela).
    const [h, m] = horaCfg.split(':').map(Number);
    const [ha, ma] = agora.split(':').map(Number);
    if ((ha * 60 + ma) - (h * 60 + m) >= 25) return { pronto: false, motivo: 'fora da janela de envio (sem Supabase para deduplicar)' };
  }
  return { pronto: true };
}

// Worklogs do Clockwork num intervalo: total e dias-com-apontamento por pessoa.
async function worklogsRange(de, ate) {
  const token = process.env.CLOCKWORK_API_TOKEN;
  if (!token) throw new Error('CLOCKWORK_API_TOKEN não configurada');
  const qs = new URLSearchParams({ starting_at: de, ending_at: ate, expand: 'authors', tz: 'America/Sao_Paulo' });
  const r = await fetch(`${CW_BASE}/worklogs?${qs}`, { headers: { Authorization: `Token ${token}` } });
  if (!r.ok) throw new Error(`Clockwork ${r.status}`);
  const lote = await r.json();
  const porPessoa = {};                       // accountId -> segundos
  const diasPessoa = {};                      // accountId -> Set('AAAA-MM-DD')
  for (const w of (Array.isArray(lote) ? lote : [])) {
    const a = (w.author && w.author.accountId) || '';
    if (!a) continue;
    porPessoa[a] = (porPessoa[a] || 0) + Number(w.timeSpentSeconds || 0);
    const dia = String(w.started || '').slice(0, 10);
    if (dia) (diasPessoa[a] = diasPessoa[a] || new Set()).add(dia);
  }
  return { porPessoa, diasPessoa };
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
const ddmmDe = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// Coluna de KPI (número grande + rótulo), no estilo dos cards do painel.
const kpiCol = (valor, rotulo) => ({
  type: 'Column', width: 'stretch', items: [
    { type: 'TextBlock', text: valor, size: 'ExtraLarge', weight: 'Bolder', horizontalAlignment: 'Center', spacing: 'None' },
    { type: 'TextBlock', text: rotulo, size: 'Small', isSubtle: true, wrap: true, horizontalAlignment: 'Center', spacing: 'None' },
  ],
});
const cartaoAdaptive = (blocos) => ({
  type: 'message',
  attachments: [{
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard', version: '1.4', msteams: { width: 'Full' }, body: blocos,
    },
  }],
});

// ---------------------------------------------------------------------------
// RANKING diário (cartão original).
// ---------------------------------------------------------------------------
async function montaRanking(cfg, extras, removidos, hoje) {
  // Último dia útil FECHADO antes de hoje.
  let dia = addDias(hoje, -1);
  for (let i = 0; i < 10 && !ehUtilBR(dia, extras, removidos); i += 1) dia = addDias(dia, -1);

  const [{ porPessoa }, pessoas] = await Promise.all([worklogsRange(dia, dia), jiraUsuariosAtivos()]);
  const ocultos = new Set((cfg.ocultos || []).map((o) => o.a));   // usuários externos: fora do relatório
  const ehAusente = (a) => (cfg.ausencias || []).some((x) => x.a === a && dia >= x.de && dia <= x.ate);
  const metaSeg = (a) => Math.max(0, Number((cfg.metasPessoa || {})[a] != null ? cfg.metasPessoa[a] : cfg.metaGlobalH) || 0) * 3600;

  // Uma linha por pessoa ativa (com meta no dia), ordenada por quem mais precisa
  // apontar (maior lacuna primeiro) — espelha a aba "Ranking" do painel.
  const linhas = Object.keys(pessoas)
    .filter((a) => !ehAusente(a) && !ocultos.has(a))
    .map((a) => {
      const seg = porPessoa[a] || 0;
      const meta = metaSeg(a);
      const pct = meta ? Math.round((seg / meta) * 100) : null;
      const lacuna = Math.max(0, meta - seg);
      return { a, nome: pessoas[a].nome, seg, meta, pct, lacuna };
    })
    .filter((l) => l.meta > 0)
    .sort((x, y) => (y.lacuna - x.lacuna) || (x.pct - y.pct) || x.nome.localeCompare(y.nome, 'pt'));

  // KPIs do dia (cabeçalho do cartão).
  const totMeta = linhas.reduce((s, l) => s + l.meta, 0);
  const totApontado = linhas.reduce((s, l) => s + Math.min(l.seg, l.meta), 0);  // capado na meta p/ o % geral
  const pctGeral = totMeta ? Math.round((totApontado / totMeta) * 100) : 0;
  const lacunaTotal = linhas.reduce((s, l) => s + l.lacuna, 0);
  const nEmDia = linhas.filter((l) => l.pct != null && l.pct >= 90).length;
  const nAtrasadas = linhas.length - nEmDia;

  const statusDe = (pct) => (pct == null ? { ic: '⚪', nome: '—' }
    : pct >= 90 ? { ic: '🟢', nome: 'Em dia' }
      : pct >= 60 ? { ic: '🟡', nome: 'Atrasado' }
        : { ic: '🔴', nome: 'Crítico' });

  const MAX_LINHAS = 40;
  const linhasTxt = linhas.slice(0, MAX_LINHAS).map((l, i) => {
    const s = statusDe(l.pct);
    const falta = l.lacuna > 0 ? ` · faltam ${fmtH(l.lacuna)}` : ' · ✓ meta batida';
    return `${s.ic} **${i + 1}. ${l.nome}** — ${s.nome} · ${l.pct}% · ${fmtH(l.seg)}/${fmtH(l.meta)}${falta}`;
  });
  if (linhas.length > MAX_LINHAS) linhasTxt.push(`_…e mais ${linhas.length - MAX_LINHAS} pessoa(s)._`);

  const [criados, resolvidos] = await Promise.all([
    contaJQL(`created >= "${dia}" AND created <= "${dia} 23:59"`),
    contaJQL(`resolutiondate >= "${dia}" AND resolutiondate <= "${dia} 23:59"`),
  ]);

  const ddmm = `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
  const blocos = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: `📊 Apontamento de horas — ${ddmm}` },
    { type: 'TextBlock', isSubtle: true, wrap: true, spacing: 'None', text: `Status do último dia útil · meta padrão ${cfg.metaGlobalH}h/dia` },
    { type: 'ColumnSet', spacing: 'Medium', columns: [
      kpiCol(`${pctGeral}%`, 'Apontamento geral'),
      kpiCol(fmtH(lacunaTotal), 'Horas faltando'),
      kpiCol(String(nEmDia), 'Pessoas em dia'),
      kpiCol(String(nAtrasadas), 'Pessoas atrasadas'),
    ] },
    { type: 'TextBlock', weight: 'Bolder', spacing: 'Medium', text: 'Ranking — quem mais precisa apontar' },
    { type: 'TextBlock', wrap: true, text: linhasTxt.length ? linhasTxt.join('\n\n') : '_Ninguém com meta no período._' },
  ];
  const uso = [];
  if (criados != null) uso.push(`Chamados criados: **${criados}**`);
  if (resolvidos != null) uso.push(`Resolvidos: **${resolvidos}**`);
  if (uso.length) blocos.push({ type: 'TextBlock', wrap: true, isSubtle: true, spacing: 'Medium', text: `Uso do Jira no dia · ${uso.join(' · ')}` });
  blocos.push({ type: 'TextBlock', isSubtle: true, size: 'Small', wrap: true, text: 'Enviado automaticamente pelo painel Insights de Uso (Jira + Clockwork).' });

  return {
    cartao: cartaoAdaptive(blocos), dia,
    stats: { pessoas: linhas.length, emDia: nEmDia, atrasadas: nAtrasadas, pctGeral },
  };
}

// ---------------------------------------------------------------------------
// RESUMO DE ATIVIDADES por IA (diário = último dia útil · semanal = últimos 7 dias).
// O servidor agrega as MESMAS métricas que o painel manda ao /api/resumo e chama
// o modelo com o MESMO prompt/schema — o cartão sai com o geral + cada pessoa.
// ---------------------------------------------------------------------------
async function montaResumoIA(cfg, extras, removidos, hoje, freq) {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada (necessária para o resumo IA).');

  let de, ate, label;
  if (freq === 'diario') {
    let dia = addDias(hoje, -1);
    for (let i = 0; i < 10 && !ehUtilBR(dia, extras, removidos); i += 1) dia = addDias(dia, -1);
    de = dia; ate = dia; label = `último dia útil (${ddmmDe(dia)})`;
  } else {
    ate = addDias(hoje, -1); de = addDias(hoje, -7);
    label = `últimos 7 dias (${ddmmDe(de)} → ${ddmmDe(ate)})`;
  }
  const dias = []; for (let d = de; d <= ate; d = addDias(d, 1)) dias.push(d);
  const diasUteis = dias.filter((d) => ehUtilBR(d, extras, removidos));

  const [{ porPessoa, diasPessoa }, atv, ativos] = await Promise.all([
    worklogsRange(de, ate),
    coletaAtividade({ startDate: de, startISO: `${de}T00:00:00-03:00`, endISO: `${ate}T23:59:59.999-03:00` }),
    jiraUsuariosAtivos(),
  ]);

  const ocultos = new Set((cfg.ocultos || []).map((o) => o.a));
  const metaSeg = (a) => Math.max(0, Number((cfg.metasPessoa || {})[a] != null ? cfg.metasPessoa[a] : cfg.metaGlobalH) || 0) * 3600;
  const diasAusente = (a) => diasUteis.filter((d) => (cfg.ausencias || []).some((x) => x.a === a && d >= x.de && d <= x.ate)).length;

  // Agrega a atividade por pessoa (mesmos campos do payload do painel).
  const porA = {};
  const at = (a) => porA[a] || (porA[a] = { tickets: new Set(), alteracoes: 0, transicoes: 0, comentarios: 0, criados: 0 });
  let transTot = 0, criadosTot = 0, comentTot = 0;
  const tocadas = new Set();
  for (const e of atv.eventos) {
    if (ocultos.has(e.a)) continue;
    const r = at(e.a); r.tickets.add(e.k); tocadas.add(e.k);
    if (e.e === 'alteracao') r.alteracoes += 1;
    else if (e.e === 'transicao') { r.transicoes += 1; transTot += 1; }
    else if (e.e === 'comentario') { r.comentarios += 1; comentTot += 1; }
    else if (e.e === 'criado') { r.criados += 1; criadosTot += 1; }
  }

  const ids = new Set([...Object.keys(porPessoa), ...Object.keys(porA)]);
  const nomeDe = (a) => (ativos[a] && ativos[a].nome) || (atv.pessoas[a] && atv.pessoas[a].nome) || a;
  let horasTot = 0;
  const pessoas = [...ids]
    .filter((a) => !ocultos.has(a) && (ativos[a] || porA[a]))
    .map((a) => {
      const seg = porPessoa[a] || 0; horasTot += seg;
      const r = porA[a] || { tickets: new Set(), alteracoes: 0, transicoes: 0, comentarios: 0, criados: 0 };
      const esperados = Math.max(0, diasUteis.length - diasAusente(a));
      const metaTotal = metaSeg(a) * esperados;
      return {
        id: a, nome: nomeDe(a),
        horas: +(seg / 3600).toFixed(1), faturavelPct: 0,
        tickets: r.tickets.size, alteracoes: r.alteracoes, transicoes: r.transicoes,
        comentarios: r.comentarios, criados: r.criados,
        diasComApontamento: (diasPessoa[a] ? diasPessoa[a].size : 0),
        diasUteisEsperados: esperados,
        metaPct: metaTotal ? Math.round((seg / metaTotal) * 100) : 0,
      };
    })
    .sort((x, y) => (y.horas - x.horas) || (y.alteracoes - x.alteracoes))
    .slice(0, MAX_PESSOAS_RESUMO);

  const payload = {
    periodo: { label, diasUteis: diasUteis.length },
    equipe: {
      horasTotais: +(horasTot / 3600).toFixed(1), faturavelPct: 0,
      ticketsTocados: tocadas.size, transicoes: transTot,
      concluidas: atv.concluidasTotal, criados: criadosTot, comentarios: comentTot,
    },
    pessoas,
  };
  const resultado = await chamaClaude(apiKey, payload);

  const ic = { positivo: '🟢', neutro: '⚪', atencao: '🟠' };
  const nomes = {}; pessoas.forEach((p) => { nomes[p.id] = p.nome; });
  const linhas = (Array.isArray(resultado.pessoas) ? resultado.pessoas : [])
    .filter((p) => nomes[p.id])
    .map((p) => `${ic[p.sinal] || '⚪'} **${nomes[p.id]}** — ${String(p.resumo || '').trim()}`);

  const blocos = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: `🧠 Resumo das atividades (IA) — ${label}` },
    { type: 'TextBlock', isSubtle: true, wrap: true, spacing: 'None', text: 'Análise automática do uso do Jira + apontamentos (Clockwork) de cada pessoa.' },
    { type: 'ColumnSet', spacing: 'Medium', columns: [
      kpiCol(fmtH(horasTot), 'Horas apontadas'),
      kpiCol(String(tocadas.size), 'Tickets tocados'),
      kpiCol(String(criadosTot), 'Criados'),
      kpiCol(String(atv.concluidasTotal), 'Concluídos'),
    ] },
    { type: 'TextBlock', wrap: true, spacing: 'Medium', text: String(resultado.geral || '').trim() || '_Sem resumo geral._' },
    { type: 'TextBlock', weight: 'Bolder', spacing: 'Medium', text: 'Por pessoa' },
    { type: 'TextBlock', wrap: true, text: linhas.length ? linhas.join('\n\n') : '_Sem pessoas para resumir._' },
    { type: 'TextBlock', isSubtle: true, size: 'Small', wrap: true, text: 'Gerado por IA a partir dos números do período — confira antes de decisões. Enviado pelo painel Insights de Uso.' },
  ];
  return { cartao: cartaoAdaptive(blocos), de, ate, stats: { pessoas: pessoas.length, horas: +(horasTot / 3600).toFixed(1) } };
}

async function enviaCartao(webhook, cartao) {
  const r = await fetch(webhook, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cartao),
  });
  const ok = r.status >= 200 && r.status < 300;
  return { ok, status: r.status, erro: ok ? '' : (await r.text()).slice(0, 300) };
}

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
    const agora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const rcfg = Object.assign({ ativo: false, freq: 'semanal', dia: 5, hora: '17:00' }, cfg.teamsResumo || {});
    const horaRank = /^\d{2}:\d{2}$/.test(String(cfg.teamsHora || '')) ? cfg.teamsHora : '08:00';
    const horaRes = /^\d{2}:\d{2}$/.test(String(rcfg.hora || '')) ? rcfg.hora : '17:00';

    // ---- Modo agendador (?cron=1): decide os DOIS envios pelos horários do painel ----
    if (q.cron === '1' && !dry && q.forcar !== '1') {
      if (!ehUtilBR(hoje, extras, removidos)) {
        return json(res, 200, { enviado: false, motivo: `Hoje (${hoje}) não é dia útil.` });
      }
      const estado = await teamsEstado();                       // null = sem Supabase
      const semSupabase = (estado === null);
      const ult = (k) => (semSupabase ? undefined : String((estado || {})[k] || ''));
      const out = {};

      const gr = gateHorario(horaRank, agora, hoje, ult('ultimoEnvio'));
      if (gr.pronto) {
        const m = await montaRanking(cfg, extras, removidos, hoje);
        const env = await enviaCartao(webhook, m.cartao);
        if (env.ok) await gravaTeamsEstado({ ultimoEnvio: hoje }, estado);
        out.ranking = { enviado: env.ok, dia: m.dia, status: env.status, ...m.stats, ...(env.ok ? {} : { erro: env.erro }) };
      } else out.ranking = { enviado: false, motivo: gr.motivo, hora: horaRank };

      const diaOk = rcfg.freq === 'diario' || diaSemana(hoje) === Number(rcfg.dia || 5);
      if (!rcfg.ativo) out.resumo = { enviado: false, motivo: 'desativado no painel' };
      else if (!diaOk) out.resumo = { enviado: false, motivo: `só ${rcfg.freq === 'diario' ? 'em dias úteis' : `no dia ${rcfg.dia} da semana`}` };
      else {
        const gs = gateHorario(horaRes, agora, hoje, ult('ultimoEnvioResumo'));
        if (gs.pronto) {
          try {
            const m = await montaResumoIA(cfg, extras, removidos, hoje, rcfg.freq);
            const env = await enviaCartao(webhook, m.cartao);
            if (env.ok) await gravaTeamsEstado({ ultimoEnvioResumo: hoje }, estado);
            out.resumo = { enviado: env.ok, de: m.de, ate: m.ate, status: env.status, ...m.stats, ...(env.ok ? {} : { erro: env.erro }) };
          } catch (e) { out.resumo = { enviado: false, erro: String(e.message || e) }; }
        } else out.resumo = { enviado: false, motivo: gs.motivo, hora: horaRes };
      }
      return json(res, 200, out);
    }

    // ---- Chamada manual: ?tipo=resumo (com ?dry=1) ou o ranking (padrão) ----
    if (String(q.tipo || '') === 'resumo') {
      const m = await montaResumoIA(cfg, extras, removidos, hoje, q.freq === 'diario' ? 'diario' : rcfg.freq);
      if (dry) return json(res, 200, { enviado: false, dry: true, de: m.de, ate: m.ate, cartao: m.cartao });
      const env = await enviaCartao(webhook, m.cartao);
      return json(res, 200, { enviado: env.ok, de: m.de, ate: m.ate, status: env.status, ...m.stats, ...(env.ok ? {} : { erro: env.erro }) });
    }

    // O cron roda seg–sex; ainda assim, pula feriados (a menos que ?forcar=1).
    if (!ehUtilBR(hoje, extras, removidos) && q.forcar !== '1' && !dry) {
      return json(res, 200, { enviado: false, motivo: `Hoje (${hoje}) não é dia útil.` });
    }
    const m = await montaRanking(cfg, extras, removidos, hoje);
    if (dry) return json(res, 200, { enviado: false, dry: true, dia: m.dia, cartao: m.cartao });
    const env = await enviaCartao(webhook, m.cartao);
    return json(res, 200, { enviado: env.ok, dia: m.dia, status: env.status, ...m.stats, ...(env.ok ? {} : { erro: env.erro }) });
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
