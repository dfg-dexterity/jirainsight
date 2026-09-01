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
//
// 🤖 BOT DO TEAMS (2026-09-01): este mesmo endpoint atende o bot de criação de
// tickets por IA no chat — ver a seção "BOT DO TEAMS" mais abaixo.
import crypto from 'node:crypto';
import { jiraBase, jiraUsuariosAtivos, jiraSearchAll, json, configCompartilhada as cfgCompartilhada, feriadosBR } from './_lib/util.js';
import { coletaAtividade } from './_lib/atividade.js';
import { chamaClaude } from './_lib/ia.js';
import { magicoCore } from './criar.js';

// O corpo é lido CRU (sem body parser) porque a assinatura HMAC do webhook de
// saída do Teams é calculada sobre os bytes exatos do corpo.
export const config = { api: { bodyParser: false } };

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

// ---- 🎯 Prioridades da semana (painel Prioridades do time) ----------------
// Cartão periódico configurável em ⚙️ (cfg.reuniao.envioTeams: ativo, dias da
// semana e hora). As prioridades vêm da label `prioridade-semana` no Jira (a
// mesma fonte do painel); "aguardando decisão" usa os status configurados.
const STATUS_DECISAO_TEAMS = [
  'Proposta de Solução', 'Aguardando Aprovação do Cliente', 'Aguardando Validação',
  'Em Validação', '📆 Reunião Agendada',
];
async function montaPrioridades(cfg, hoje) {
  const statusDec = (cfg.reuniao && Array.isArray(cfg.reuniao.statusDecisao) && cfg.reuniao.statusDecisao.length)
    ? cfg.reuniao.statusDecisao : STATUS_DECISAO_TEAMS;
  const jqlStatus = statusDec.map((s) => `"${String(s).replace(/"/g, '\\"')}"`).join(', ');
  const [rp, rd, rv] = await Promise.all([
    jiraSearchAll({
      jql: 'labels = "prioridade-semana" AND statusCategory != Done ORDER BY priority DESC, duedate ASC',
      fields: ['summary', 'assignee', 'duedate', 'status'], pageSize: 25, maxPages: 1,
    }),
    jiraSearchAll({
      jql: `(status IN (${jqlStatus}) OR labels = "aguardando-decisao") AND statusCategory != Done`,
      fields: ['summary'], pageSize: 100, maxPages: 1,
    }),
    jiraSearchAll({
      jql: `duedate <= "${hoje}" AND statusCategory != Done`,
      fields: ['summary'], pageSize: 100, maxPages: 2,
    }),
  ]);
  const prios = (rp.issues || []).slice(0, 5);
  const linhas = prios.map((it) => {
    const f = it.fields || {};
    const dono = (f.assignee && f.assignee.displayName) ? ` — ${f.assignee.displayName.split(' ')[0]}` : '';
    const venc = String(f.duedate || '').slice(0, 10);
    const atras = venc && venc < hoje;
    const pz = venc ? ` · ${atras ? '⚠ venceu ' : 'até '}${venc.slice(8, 10)}/${venc.slice(5, 7)}` : '';
    return { type: 'TextBlock', wrap: true, text: `• **${it.key}** ${f.summary || ''}${dono}${pz}` };
  });
  const cartao = cartaoAdaptive([
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', wrap: true, text: '🎯 Prioridades da semana' },
    { type: 'TextBlock', isSubtle: true, wrap: true, spacing: 'None', text: `Semana de ${hoje.slice(8, 10)}/${hoje.slice(5, 7)} · o painel conduz a reunião — status é assíncrono` },
    { type: 'ColumnSet', spacing: 'Medium', columns: [
      kpiCol(String(prios.length), 'prioridades'),
      kpiCol(String((rv.issues || []).length), 'vencidos'),
      kpiCol(String((rd.issues || []).length), 'aguardando decisão'),
    ] },
    ...(linhas.length ? linhas : [{ type: 'TextBlock', wrap: true, isSubtle: true, text: 'Nenhuma prioridade marcada — defina com a label `prioridade-semana` ou pelo painel.' }]),
    { type: 'TextBlock', wrap: true, text: '[Abrir o painel de prioridades](https://jirainsight.vercel.app/?v=prioridades)' },
  ]);
  return { cartao, stats: { prioridades: prios.length, vencidos: (rv.issues || []).length, aguardandoDecisao: (rd.issues || []).length } };
}

// ---- 📣 Aviso de melhorias no canal "Avisos Gerais" (acordo de 2026-07-28) ----
// Adaptive Card com as melhorias entregues + MENÇÃO a todos os usuários ativos do
// Jira (webhook/fluxo de canal não expõe a lista de membros; a equipe ativa do Jira
// é o mesmo público). Menções via msteams.entities funcionam em cartões postados
// por webhook/Workflows quando o id é o e-mail (UPN) da pessoa.
function cartaoAviso(titulo, linhas, link, mencoes) {
  const body = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', wrap: true, text: `📣 ${titulo}` },
    ...linhas.map((t) => ({ type: 'TextBlock', wrap: true, text: `• ${t}` })),
    ...(link ? [{ type: 'TextBlock', wrap: true, text: `[Abrir o painel](${link})` }] : []),
    ...(mencoes.length ? [{ type: 'TextBlock', wrap: true, isSubtle: true, spacing: 'Medium', size: 'Small',
      text: mencoes.map((m) => `<at>${m.nome}</at>`).join(' ') }] : []),
  ];
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body,
    msteams: { width: 'Full', entities: mencoes.map((m) => ({ type: 'mention', text: `<at>${m.nome}</at>`, mentioned: { id: m.id, name: m.nome } })) },
  } }] };
}

// ===========================================================================
// 🤖 BOT DO TEAMS — criar ticket por IA conversando no chat
// ---------------------------------------------------------------------------
// Mesma inteligência do card "🎫 Criar ticket rápido" da tela inicial do painel:
// a pessoa descreve o ticket em português, o bot devolve a PRÉVIA e só cria
// depois do "sim". O pedido pode ser acionável (responsável, horas, comentário
// com @menção e status) — quem executa é o magicoCore de /api/criar.
//
// Dois jeitos de plugar no Teams (o endpoint aceita os dois):
//  A) FLUXO/WORKFLOW do Teams (Power Automate) — recomendado, não precisa de Azure:
//     um fluxo dispara a cada mensagem no canal e faz POST aqui com
//     { "bot": { "texto": "...", "usuario": { "nome": "...", "email": "..." },
//                "conversa": "<id da conversa>" } }
//     e o header Authorization: Bearer <TEAMS_BOT_SECRET ou CRON_SECRET>.
//     A resposta traz o Adaptive Card pronto para o fluxo publicar de volta.
//  B) WEBHOOK DE SAÍDA do Teams (Outgoing Webhook) — o Teams assina o corpo com
//     HMAC-SHA256; defina o mesmo segredo em TEAMS_BOT_SECRET. A resposta desta
//     requisição já é a mensagem que aparece no canal.
//
// Credenciais do Jira: TEAMS_BOT_JIRA_EMAIL / TEAMS_BOT_JIRA_TOKEN (caem para as
// da Alexa e depois para a conta de serviço). O ticket sai na conta do bot, mas o
// RELATOR é a pessoa que pediu, casada pelo e-mail do Teams com o Jira.
// ===========================================================================
const BOT_EXEMPLO = 'Crie um ticket no nome da Jéssica no épico de gestão do projeto da Copel, '
  + 'vencimento hoje, marque o Diego no comentário e aponte 30 minutos';

function botCredenciais() {
  const email = (process.env.TEAMS_BOT_JIRA_EMAIL || process.env.ALEXA_JIRA_EMAIL || process.env.JIRA_EMAIL || '').trim();
  const token = (process.env.TEAMS_BOT_JIRA_TOKEN || process.env.ALEXA_JIRA_TOKEN || process.env.JIRA_API_TOKEN || '').trim();
  return { email, token };
}
// Tira a menção ao bot (<at>Jira</at>) e espaços — o texto que sobra é o pedido.
function botTextoLimpo(t) {
  return String(t || '').replace(/<at[^>]*>.*?<\/at>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
const botNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Estado das prévias pendentes (uma por pessoa), na mesma tabela de config do
// Supabase (id='teams_bot'). Sem Supabase o bot cria direto e avisa disso.
async function botPendentes() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  try {
    const r = await fetch(`${base}/rest/v1/jirainsight_config?id=eq.teams_bot&select=data`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return {};
    const rows = await r.json();
    return (rows && rows[0] && rows[0].data) || {};
  } catch (e) { return {}; }
}
async function gravaBotPendentes(mapa) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return;
  // Limpa o que passou de 30 min — prévia velha não deve ser confirmada por engano.
  const corte = Date.now() - 30 * 60 * 1000;
  const limpo = {};
  Object.entries(mapa || {}).forEach(([k, v]) => { if (v && Number(v.q) > corte) limpo[k] = v; });
  try {
    await fetch(`${base}/rest/v1/jirainsight_config`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: 'teams_bot', data: limpo }),
    });
  } catch (e) { /* pior caso: a pessoa repete o pedido */ }
}

function botCartao(titulo, linhas, acoes) {
  const body = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', wrap: true, text: titulo },
    ...linhas.filter(Boolean).map((t) => ({ type: 'TextBlock', wrap: true, text: t })),
  ];
  const card = { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard',
    version: '1.4', body, msteams: { width: 'Full' } };
  if (acoes && acoes.length) card.actions = acoes;
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }] };
}
const botLink = (k) => `[${k}](${jiraBase()}/browse/${encodeURIComponent(k)})`;
function botLinhasPrevia(p) {
  const dBR = (d) => (d ? d.split('-').reverse().join('/') : '');
  return [
    `**${p.resumo}**`,
    `📁 Projeto: **${p.projetoNome}** (${p.projeto}) · tipo ${p.tipoNome || 'Tarefa'}`,
    p.epicoKey ? `🎯 Épico: **${p.epicoNome || p.epicoKey}**` : '',
    p.venc ? `📅 Vencimento: **${dBR(p.venc)}**` : '',
    p.respNome ? `👤 Responsável: **${p.respNome}**` : '',
    p.tempoTexto ? `⏱ Apontar: **${p.tempoTexto}** (no usuário do bot)` : '',
    p.statusNome ? `🔀 Status ao criar: **${p.statusNome}**` : '',
    p.comentario ? `💬 Comentário: "${String(p.comentario).slice(0, 200)}"${(p.mencoes || []).length ? ` — marcando **${p.mencoes.map((m) => m.nome).join(', ')}**` : ''}` : '',
    ...(p.avisos || []).map((a) => `⚠ ${a}`),
  ];
}

// Casa a pessoa do Teams com o usuário do Jira pelo e-mail (para virar o relator).
async function botAchaJira(email) {
  if (!email) return null;
  try {
    const us = await jiraUsuariosAtivos();
    const alvo = botNorm(email);
    const hit = Object.entries(us || {}).find(([, u]) => botNorm(u.email) === alvo);
    return hit ? { accountId: hit[0], nome: hit[1].nome } : null;
  } catch (e) { return null; }
}

async function botHandler(res, pedido) {
  const { email, token } = botCredenciais();
  if (!email || !token) {
    return json(res, 200, botCartao('🤖 Bot do Jira Insights', [
      'Ainda não tenho credenciais do Jira para criar tickets.',
      'Defina **TEAMS_BOT_JIRA_EMAIL** e **TEAMS_BOT_JIRA_TOKEN** nas variáveis da Vercel.']));
  }
  const texto = botTextoLimpo(pedido.texto);
  const quem = pedido.usuario || {};
  const chave = botNorm(quem.email || quem.id || quem.nome || 'anon') || 'anon';
  const base = jiraBase();
  const headers = { Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
    Accept: 'application/json', 'Content-Type': 'application/json' };
  const n = botNorm(texto);

  if (!n || /^(ajuda|help|\?|oi|ola|bom dia|boa tarde|boa noite)$/.test(n)) {
    return json(res, 200, botCartao('🤖 Crio tickets no Jira para você', [
      'Descreva o ticket em português que eu monto e mostro a prévia antes de criar.',
      `_Exemplo:_ ${BOT_EXEMPLO}`,
      'Posso também **atribuir a alguém**, **apontar horas**, **comentar marcando pessoas** e **mudar o status** no mesmo pedido.',
      'Responda **sim** para confirmar a prévia, ou **não** para cancelar.']));
  }

  const pend = await botPendentes();
  const semEstado = (pend === null);

  // ---- cancelar ----
  if (/^(nao|n|cancela|cancelar|deixa|esquece)\b/.test(n)) {
    if (!semEstado && pend[chave]) { delete pend[chave]; await gravaBotPendentes(pend); }
    return json(res, 200, botCartao('🤖 Cancelado', ['Beleza, não criei nada. É só me chamar de novo quando quiser.']));
  }

  // ---- confirmar ----
  if (/^(sim|s|pode|pode criar|confirma|confirmar|isso|ok|manda|cria|criar)\b/.test(n)) {
    const p = semEstado ? null : (pend[chave] && pend[chave].previa);
    if (!p) {
      return json(res, 200, botCartao('🤖 Não tenho nada pendente', [
        semEstado ? 'Sem o Supabase configurado eu não consigo guardar a prévia entre mensagens — descreva o ticket e eu crio na hora.'
          : 'Não achei uma prévia sua para confirmar (elas valem por 30 minutos).',
        `_Exemplo:_ ${BOT_EXEMPLO}`]));
    }
    const eu = await botAchaJira(quem.email);
    const out = await magicoCore({ confirmar: 1, projeto: p.projeto, epicoKey: p.epicoKey || '',
      resumo: p.resumo, descricao: p.descricao || '', venc: p.venc || '', respId: p.respId || '',
      tempoSeg: p.tempoSeg || 0, statusNome: p.statusNome || '', comentario: p.comentario || '',
      mencoes: p.mencoes || [], reporterId: (eu && eu.accountId) || '' }, base, headers);
    delete pend[chave]; await gravaBotPendentes(pend);
    if (!out.ok || !out.key) {
      return json(res, 200, botCartao('🤖 Não consegui criar', [String(out.erro || 'erro no Jira').slice(0, 400)]));
    }
    const feitas = (out.acoes || []).filter((a) => a.ok).map((a) => `✓ ${a.detalhe}`);
    const falhas = (out.acoes || []).filter((a) => !a.ok).map((a) => `✕ ${a.tipo}: ${a.erro}`);
    return json(res, 200, botCartao(`🎫 Criado ${out.key}`, [
      `${botLink(out.key)} — **${p.resumo}**`,
      `📁 ${p.projetoNome}${p.epicoKey ? ` · épico ${p.epicoNome || p.epicoKey}` : ''}`,
      eu ? `🙋 Relator: **${eu.nome}**` : '',
      ...feitas, ...falhas,
    ], [{ type: 'Action.OpenUrl', title: 'Abrir no Jira', url: `${jiraBase()}/browse/${encodeURIComponent(out.key)}` }]));
  }

  // ---- interpretar o pedido ----
  const out = await magicoCore({ texto }, base, headers);
  if (!out.ok || !out.previa) {
    return json(res, 200, botCartao('🤖 Não entendi o pedido', [
      String(out.erro || 'Não consegui interpretar.').slice(0, 400),
      `_Tente assim:_ ${BOT_EXEMPLO}`]));
  }
  const p = out.previa;
  if (semEstado) {
    // Sem Supabase não dá para guardar a prévia entre mensagens: cria na hora e avisa.
    const eu = await botAchaJira(quem.email);
    const fim = await magicoCore({ confirmar: 1, projeto: p.projeto, epicoKey: p.epicoKey || '',
      resumo: p.resumo, descricao: p.descricao || '', venc: p.venc || '', respId: p.respId || '',
      tempoSeg: p.tempoSeg || 0, statusNome: p.statusNome || '', comentario: p.comentario || '',
      mencoes: p.mencoes || [], reporterId: (eu && eu.accountId) || '' }, base, headers);
    if (!fim.ok || !fim.key) return json(res, 200, botCartao('🤖 Não consegui criar', [String(fim.erro || 'erro no Jira').slice(0, 400)]));
    return json(res, 200, botCartao(`🎫 Criado ${fim.key}`, [
      `${botLink(fim.key)} — **${p.resumo}**`,
      ...(fim.acoes || []).filter((a) => a.ok).map((a) => `✓ ${a.detalhe}`),
      '_(criei direto porque o bot está sem o Supabase para guardar a prévia)_']));
  }
  pend[chave] = { q: Date.now(), previa: p };
  await gravaBotPendentes(pend);
  return json(res, 200, botCartao('🎫 Confira antes de eu criar', [
    ...botLinhasPrevia(p),
    '',
    'Responda **sim** para eu criar, ou **não** para cancelar. A prévia vale por 30 minutos.']));
}

// Confere a assinatura HMAC do webhook de saída do Teams sobre o corpo cru.
function botHmacOk(raw, cabecalho, segredo) {
  try {
    const m = /^HMAC\s+(.+)$/i.exec(String(cabecalho || '').trim());
    if (!m || !segredo || !raw) return false;
    const esperado = crypto.createHmac('sha256', Buffer.from(segredo, 'base64')).update(Buffer.from(raw, 'utf8')).digest('base64');
    const a = Buffer.from(esperado); const b = Buffer.from(m[1].trim());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

async function enviaCartao(webhook, cartao) {
  const r = await fetch(webhook, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cartao),
  });
  const ok = r.status >= 200 && r.status < 300;
  return { ok, status: r.status, erro: ok ? '' : (await r.text()).slice(0, 300) };
}

// Lê o corpo CRU (o body parser está desligado por causa do HMAC do Teams) e
// devolve também o JSON já parseado.
function lerCorpo(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
      return resolve({ raw: '', body: req.body });
    }
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { let o = {}; try { o = JSON.parse(d || '{}'); } catch (e) { o = {}; } resolve({ raw: d, body: o }); });
    req.on('error', () => resolve({ raw: '', body: {} }));
  });
}

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const dry = q.dry === '1';
    const { raw, body: corpo } = await lerCorpo(req);
    const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    const segredo = process.env.CRON_SECRET || '';

    // ---- 🤖 BOT DO TEAMS (autenticação própria, antes do gate do CRON_SECRET) ----
    // Aceita { bot:{texto,usuario} } (fluxo do Teams, com Bearer) e a atividade
    // crua do webhook de saída ({type:'message',text,from}, com HMAC).
    const segBot = process.env.TEAMS_BOT_SECRET || '';
    const ehAtividadeTeams = corpo && corpo.type === 'message' && typeof corpo.text === 'string';
    if (corpo && corpo.bot) {
      const chaveOk = segBot ? (auth === `Bearer ${segBot}`) : (!segredo || auth === `Bearer ${segredo}`);
      if (!chaveOk) return json(res, 401, { erro: 'Não autorizado.' });
      return await botHandler(res, corpo.bot);
    }
    if (ehAtividadeTeams) {
      if (!botHmacOk(raw, auth, segBot) && !(segBot && auth === `Bearer ${segBot}`)) {
        return json(res, 401, { erro: 'Assinatura inválida — confira o TEAMS_BOT_SECRET.' });
      }
      const from = corpo.from || {};
      return await botHandler(res, { texto: corpo.text,
        usuario: { nome: from.name || '', email: from.email || from.userPrincipalName || '', id: from.id || from.aadObjectId || '' },
        conversa: (corpo.conversation && corpo.conversation.id) || '' });
    }
    // Teste sem o Teams: /api/teams?bot=1&texto=... (exige o Bearer normal abaixo).
    if (q.bot === '1') {
      if (segredo && auth !== `Bearer ${segredo}`) return json(res, 401, { erro: 'Não autorizado.' });
      return await botHandler(res, { texto: String(q.texto || ''),
        usuario: { nome: String(q.nome || 'Teste'), email: String(q.email || '') } });
    }

    if (segredo && auth !== `Bearer ${segredo}`) return json(res, 401, { erro: 'Não autorizado.' });
    const webhook = process.env.TEAMS_WEBHOOK_URL || '';

    // ---- 📣 Aviso de melhorias (POST {aviso:{titulo,linhas[,link]}} ou GET ?tipo=aviso&dry=1) ----
    // Publica no canal "Avisos Gerais" (env TEAMS_AVISOS_WEBHOOK_URL; cai no webhook
    // padrão se ausente) marcando todos os usuários ativos do Jira.
    const b = (corpo && typeof corpo === 'object') ? corpo : {};
    if (b.aviso || q.tipo === 'aviso') {
      const av = b.aviso || {};
      const titulo = String(av.titulo || 'Novidades no Insights de Uso').slice(0, 150);
      const linhas = Array.isArray(av.linhas) ? av.linhas.map((x) => String(x).slice(0, 400)).slice(0, 12) : [];
      if (!linhas.length && !dry) return json(res, 400, { erro: 'Envie aviso.linhas (lista com as melhorias).' });
      const wAv = process.env.TEAMS_AVISOS_WEBHOOK_URL || webhook;
      if (!wAv && !dry) return json(res, 200, { enviado: false, erro: 'TEAMS_AVISOS_WEBHOOK_URL não configurada — crie um fluxo/webhook de entrada no canal Avisos Gerais e defina a env na Vercel.' });
      let mencoes = [];
      try {
        const us = await jiraUsuariosAtivos();
        mencoes = Object.values(us || {}).filter((u) => u.email).slice(0, 40).map((u) => ({ id: u.email, nome: u.nome || u.email }));
      } catch (e) { /* sem menções é melhor que não avisar */ }
      const cartao = cartaoAviso(titulo, linhas, String(av.link || 'https://jirainsight.vercel.app'), mencoes);
      if (dry) return json(res, 200, { enviado: false, dry: true, mencionados: mencoes.length, cartao });
      const env = await enviaCartao(wAv, cartao);
      return json(res, 200, { enviado: env.ok, status: env.status, mencionados: mencoes.length, ...(env.ok ? {} : { erro: env.erro }) });
    }

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
      // 🎯 Prioridades da semana (cfg.reuniao.envioTeams: {ativo, dias[], hora})
      const pcfg = Object.assign({ ativo: false, dias: [1], hora: '09:00' }, (cfg.reuniao || {}).envioTeams || {});
      const horaPrio = /^\d{2}:\d{2}$/.test(String(pcfg.hora || '')) ? pcfg.hora : '09:00';
      const diasPrio = (Array.isArray(pcfg.dias) ? pcfg.dias : [1]).map(Number);
      if (!pcfg.ativo) out.prioridades = { enviado: false, motivo: 'desativado no painel' };
      else if (!diasPrio.includes(diaSemana(hoje))) out.prioridades = { enviado: false, motivo: `só nos dias ${diasPrio.join(',')} da semana` };
      else {
        const gp = gateHorario(horaPrio, agora, hoje, ult('ultimoEnvioPrioridades'));
        if (gp.pronto) {
          try {
            const m = await montaPrioridades(cfg, hoje);
            const env = await enviaCartao(webhook, m.cartao);
            if (env.ok) await gravaTeamsEstado({ ultimoEnvioPrioridades: hoje }, estado);
            out.prioridades = { enviado: env.ok, status: env.status, ...m.stats, ...(env.ok ? {} : { erro: env.erro }) };
          } catch (e) { out.prioridades = { enviado: false, erro: String(e.message || e) }; }
        } else out.prioridades = { enviado: false, motivo: gp.motivo, hora: horaPrio };
      }
      return json(res, 200, out);
    }

    // ---- Chamada manual: ?tipo=prioridades (com ?dry=1) ----
    if (String(q.tipo || '') === 'prioridades') {
      const m = await montaPrioridades(cfg, hoje);
      if (dry) return json(res, 200, { enviado: false, dry: true, ...m.stats, cartao: m.cartao });
      const env = await enviaCartao(webhook, m.cartao);
      return json(res, 200, { enviado: env.ok, status: env.status, ...m.stats, ...(env.ok ? {} : { erro: env.erro }) });
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
