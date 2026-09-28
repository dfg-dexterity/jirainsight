// GET /api/teams — envios agendados ao Microsoft Teams via webhook:
//   · RANKING DIÁRIO de apontamento (último dia útil)          — como sempre
//   · RESUMO DE ATIVIDADES gerado por IA (diário ou semanal)   — ?tipo=resumo
//   · 📊 RELATÓRIO SEMANAL DE SEXTA (foto + cartão dos gestores + mensagem a cada gerente) — ?tipo=semanal
//
// Configuração:
//   TEAMS_WEBHOOK_URL  (obrigatória)  URL do webhook do canal
//   CRON_SECRET        (opcional)     se definida, exige Authorization: Bearer <segredo>
//                                     (OBRIGATÓRIA para o ?tipo=semanal — a foto tem dados por pessoa)
//   ANTHROPIC_API_KEY  (p/ o resumo)  chave da API do Claude (opcional no relatório semanal)
//   TEAMS_GESTORES_WEBHOOK_URL        canal dos gestores (cartão do relatório semanal; sem ela, não envia)
//   TEAMS_DM_WEBHOOK_URL              fluxo de mensagem direta (pendências para cada gerente de projeto)
// Parâmetros: ?dry=1 visualiza o cartão sem enviar · ?forcar=1 envia mesmo em fim
// de semana/feriado · ?tipo=resumo aciona o resumo IA · ?cron=1 (agendador): decide
// pelos horários configurados no painel (cfg.teamsHora, cfg.teamsResumo e cfg.relSemanal).
//
// 🤖 BOT DO TEAMS (2026-09-01): este mesmo endpoint atende o bot de criação de
// tickets por IA no chat — ver a seção "BOT DO TEAMS" mais abaixo.
import crypto from 'node:crypto';
import { jiraBase, jiraUsuariosAtivos, jiraSearchAll, json, configCompartilhada as cfgCompartilhada, feriadosBR } from './_lib/util.js';
import { coletaAtividade } from './_lib/atividade.js';
import { chamaClaude } from './_lib/ia.js';
import { magicoCore } from './criar.js';
import { avisaTeamsDM } from './apontar.js';
import { montaFotoSemanal, gravaFoto, marcaRealFechado, anotaFoto, leFotos, comparaFotos, segundaDe } from './_lib/semanal.js';

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
    // O mesmo tique pode gravar mais de uma vez (ranking e depois a foto semanal): o objeto
    // em memória acompanha o que já foi gravado, senão a 2ª gravação apagaria a 1ª.
    if (atual && typeof atual === 'object') Object.assign(atual, patch);
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
  blocos.push({ type: 'TextBlock', isSubtle: true, size: 'Small', wrap: true, text: 'Enviado automaticamente pelo Dexterity Hub (antes Insights de Uso · Jira + Clockwork).' });

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
    { type: 'TextBlock', isSubtle: true, size: 'Small', wrap: true, text: 'Gerado por IA a partir dos números do período — confira antes de decisões. Enviado pelo Dexterity Hub.' },
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

// ===========================================================================
// 📊 RELATÓRIO SEMANAL DE SEXTA (pedido do usuário, 2026-09-28) — ?tipo=semanal
// ---------------------------------------------------------------------------
// "Toda sexta: planejado × orçado × realizado, reuniões, tickets criados, qualidade
// da informação, comparável com as semanas anteriores, e a visão do gerente de
// projeto — o que está parado e vencido por pessoa, para ele cobrar."
// O cálculo mora em api/_lib/semanal.js (fonte única, também da tela ?v=semanal);
// aqui ficam o agendamento, a apresentação e o envio. Duas fases, em tiques
// diferentes do cron de 30 min (cada execução tem 60 s):
//   fase=foto   busca as fontes em paralelo, monta a foto da semana, grava
//               `semanal_<segunda>`, anota o realizado FECHADO na foto da semana
//               anterior e marca `ultimaFotoSemanal` no teams_estado;
//   fase=envio  no tique seguinte: IA (3–5 frases sobre o que mudou; sem chave,
//               sem IA), grava `ia` na foto, cartão no CANAL DOS GESTORES
//               (TEAMS_GESTORES_WEBHOOK_URL; sem a env → não envia e diz na resposta),
//               MENSAGEM DIRETA a cada gerente de projeto (cfg.projGerentes) com as
//               pendências dos projetos dele (avisaTeamsDM — o mesmo caminho dos
//               convites, TEAMS_DM_WEBHOOK_URL) e marca `ultimoEnvioSemanal`.
// A foto tem dados por pessoa: EXIGE CRON_SECRET definido (503 se não houver, mesmo
// com dry=1) e correto (401 — o gate comum). Manual: ?tipo=semanal&fase=foto|envio
// &dry=1[&semana=AAAA-MM-DD] devolve a foto / o cartão e as mensagens sem gravar nem
// enviar. Horas e contagens apenas: valores em R$ e custos NUNCA saem do painel.
// ===========================================================================
const APP_URL = 'https://jirainsight.vercel.app';
const REL_SEMANAL_PADRAO = { ativo: false, dia: 5, hora: '16:00', parado: 5 };
const hDe = (s) => fmtH(Math.max(0, Math.round(Number(s) || 0)));
const pctDe = (v) => (v == null ? '—' : `${v}%`);
const nDe = (v) => String(v == null ? '—' : v);
// Δ vs a semana anterior já formatado: vazio quando não há anterior ou nada mudou.
const deltaTxt = (d, f) => (d == null || d === 0 ? '' : ` (${d > 0 ? '+' : '−'}${f(Math.abs(d))})`);
const pp = (x) => `${x} p.p.`;

// Os 5 maiores desvios da semana: pessoa = realizado − planejado (só quem tem plano),
// projeto = realizado − orçado (só quem tem Rentabilidade). Vêm prontos do comparaFotos.
function desviosSemanal(cmp) {
  const D = (cmp && cmp.desvios) || {};
  const sinal = (x) => `${x > 0 ? '+' : '−'}${hDe(Math.abs(x))}`;
  const linhas = [
    ...(D.pessoas || []).map((x) => ({ abs: Math.abs(x.desvio), txt: `👤 **${x.nome}** — realizou ${hDe(x.real)} de ${hDe(x.plan)} planejadas (${sinal(x.desvio)})` })),
    ...(D.projetos || []).map((x) => ({ abs: Math.abs(x.desvio), txt: `📁 **${x.nome}** — realizou ${hDe(x.real)} de ${hDe(x.orc)} orçadas (${sinal(x.desvio)})` })),
  ];
  return linhas.sort((a, b) => b.abs - a.abs).slice(0, 5).map((l) => l.txt);
}

// Cartão do canal dos gestores: números do time com Δ vs a semana anterior, reuniões,
// pendências, os 5 maiores desvios, o texto da IA e o link da tela.
function cartaoSemanal(foto, anterior, cmp, ia) {
  const T = foto.time || {}; const C = (cmp && cmp.time) || {};
  const d = (k) => (C[k] ? C[k].delta : null);
  const R = T.reunioes || {}; const Q = T.qualidade || {};
  const quando = new Date(foto.fotoEm || Date.now());
  const hora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(quando);
  const tetos = Object.entries(foto.truncado || {}).filter(([, v]) => v).map(([k]) => k);
  const desvios = desviosSemanal(cmp);
  const blocos = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', wrap: true, text: `📊 Relatório semanal — ${ddmmDe(foto.semana)} a ${ddmmDe(foto.ate)}` },
    { type: 'TextBlock', isSubtle: true, wrap: true, spacing: 'None', text: `Foto de ${ddmmDe(spDate(quando))} às ${hora} · ${nDe(T.pessoas)} pessoas (${nDe(T.pessoasComPlano)} com plano enviado)`
      + (anterior ? ` · Δ vs semana de ${ddmmDe(anterior.semana)}` : ' · sem semana anterior para comparar')
      + (tetos.length ? ` · ⚠ teto batido em: ${tetos.join(', ')}` : '') },
    { type: 'ColumnSet', spacing: 'Medium', columns: [
      kpiCol(hDe(T.plan), `planejado${deltaTxt(d('plan'), hDe)}`),
      kpiCol(hDe(T.orc), `orçado (vendido)${deltaTxt(d('orc'), hDe)}`),
      kpiCol(hDe(T.real), `realizado${deltaTxt(d('real'), hDe)}`),
      kpiCol(pctDe(T.exec), `execução do plano${deltaTxt(d('exec'), pp)}`),
    ] },
    { type: 'ColumnSet', columns: [
      kpiCol(pctDe(T.ader), `aderência${deltaTxt(d('ader'), pp)}`),
      kpiCol(pctDe(T.consumo), `consumo do orçado${deltaTxt(d('consumo'), pp)}`),
      kpiCol(`${nDe(T.criados)}/${nDe(T.concluidos)}`, `criados/concluídos · saldo ${T.saldo > 0 ? '+' : ''}${nDe(T.saldo)}${deltaTxt(d('saldo'), nDe)}`),
      kpiCol(nDe(Q.nota), `qualidade (0–100)${deltaTxt(C.nota ? C.nota.delta : null, nDe)}`),
    ] },
    { type: 'TextBlock', wrap: true, spacing: 'Medium', text: `📅 Reuniões: **${nDe(R.criadas)}** criadas${deltaTxt(C['reunioes.criadas'] && C['reunioes.criadas'].delta, nDe)} · **${hDe(R.horas)}** apontadas${deltaTxt(C['reunioes.horas'] && C['reunioes.horas'].delta, hDe)} · **${nDe(R.vencidasAbertas)}** vencidas em aberto` },
    { type: 'TextBlock', wrap: true, text: `🧭 Pendências nos abertos: **${nDe(T.vencidos)}** vencidos${deltaTxt(d('vencidos'), nDe)} · **${nDe(T.parados)}** parados há ≥ ${nDe(foto.parado)} dias${deltaTxt(d('parados'), nDe)} · **${nDe(T.semVenc)}** sem data · **${nDe(T.semResp)}** sem responsável · **${nDe(T.diasVazios)}** dias úteis sem apontamento${deltaTxt(d('diasVazios'), nDe)}` },
    { type: 'TextBlock', weight: 'Bolder', spacing: 'Medium', text: '🔺 Maiores desvios da semana' },
    { type: 'TextBlock', wrap: true, text: desvios.length ? desvios.join('\n\n') : '_Sem desvios a destacar: ninguém com plano enviado e nenhum projeto com horas vendidas — ou tudo bateu._' },
    ...(ia ? [
      { type: 'TextBlock', weight: 'Bolder', spacing: 'Medium', text: '🧠 O que mudou (IA)' },
      { type: 'TextBlock', wrap: true, text: ia },
    ] : []),
    { type: 'TextBlock', wrap: true, spacing: 'Medium', text: `[Abrir o relatório no app](${APP_URL}/?v=semanal) · cada gerente recebeu as pendências dos seus projetos no chat.` },
    { type: 'TextBlock', isSubtle: true, size: 'Small', wrap: true, text: 'Enviado automaticamente pelo Dexterity Hub — horas e contagens; valores ficam só no painel.' },
  ];
  return cartaoAdaptive(blocos);
}

// Uma mensagem por gerente de projeto (cfg.projGerentes, já carimbado em
// foto.projetos[K].gerentes pela foto): as pendências de CADA projeto dele, por pessoa —
// é a lista que ele cobra — e o link da tela 🧭 Pendências do projeto já filtrada.
function mensagensGerentes(foto) {
  const por = {};   // accountId → [KEY]
  Object.entries(foto.projetos || {}).forEach(([k, p]) => (p.gerentes || []).forEach((g) => { (por[g] = por[g] || []).push(k); }));
  const nomeDe = (a) => ((foto.pessoas || {})[a] || {}).nome || 'pessoa fora do elenco';
  const titulo = `🧭 Pendências dos seus projetos — semana de ${ddmmDe(foto.semana)} a ${ddmmDe(foto.ate)}`;
  return Object.keys(por).sort().map((a) => {
    const linhas = []; let pend = 0;
    por[a].sort().forEach((k) => {
      const p = foto.projetos[k];
      const n = (p.vencidos || 0) + (p.parados || 0) + (p.semVenc || 0) + (p.semResp || 0) + (p.reunioesVencidas || 0);
      pend += n;
      const partes = [];
      if (p.vencidos) partes.push(`**${p.vencidos}** vencido(s)`);
      if (p.parados) partes.push(`**${p.parados}** parado(s) há ≥ ${foto.parado} dias`);
      if (p.semVenc) partes.push(`**${p.semVenc}** sem data`);
      if (p.semResp) partes.push(`**${p.semResp}** sem responsável`);
      if (p.reunioesVencidas) partes.push(`**${p.reunioesVencidas}** reunião(ões) vencida(s)`);
      linhas.push(`${n ? '⚠' : '✓'} **${p.nome}** (${k}) — ${partes.length ? partes.join(' · ') : 'sem pendências'} · [ver e cobrar](${APP_URL}/?v=gp&proj=${encodeURIComponent(k)})`);
      Object.entries(p.porPessoa || {}).filter(([, x]) => x.vencidos || x.parados)
        .sort((x, y) => ((y[1].vencidos || 0) + (y[1].parados || 0)) - ((x[1].vencidos || 0) + (x[1].parados || 0))).slice(0, 8)
        .forEach(([pa, x]) => {
          const it = []; if (x.vencidos) it.push(`${x.vencidos} vencido(s)`); if (x.parados) it.push(`${x.parados} parado(s)`);
          linhas.push(`↳ ${nomeDe(pa)}: ${it.join(', ')}`);
        });
    });
    const texto = `${linhas.join('\n\n')}\n\n${pend ? 'Vale pedir data, status e apontamento até segunda.' : 'Nada pendente nos seus projetos esta semana.'} [Relatório completo](${APP_URL}/?v=semanal)`;
    const pessoa = (foto.pessoas || {})[a] || {};
    return { accountId: a, nome: pessoa.nome || '', email: pessoa.email || '', projetos: por[a].slice(), pendencias: pend, titulo, texto };
  });
}
const cartaoDM = (m) => cartaoAdaptive([
  { type: 'TextBlock', size: 'Medium', weight: 'Bolder', wrap: true, text: m.titulo },
  { type: 'TextBlock', wrap: true, text: m.texto },
]);

// IA: 3–5 frases sobre o que mudou vs a semana anterior (só com ANTHROPIC_API_KEY).
const IA_SCHEMA_SEMANAL = { type: 'object', additionalProperties: false, required: ['texto'], properties: { texto: { type: 'string' } } };
const IA_SISTEMA_SEMANAL = [
  'Você é analista de um time de consultoria de TI. Recebe os NÚMEROS agregados da semana (horas planejadas,',
  'orçadas/vendidas e realizadas, execução, aderência, tickets criados/concluídos, reuniões, qualidade da',
  'informação e pendências) e os da semana anterior, mais os maiores desvios por pessoa e por projeto.',
  'Horas vêm em SEGUNDOS: converta para horas ao escrever. Escreva de 3 a 5 frases, em português do Brasil,',
  'dizendo O QUE MUDOU em relação à semana anterior e o que merece a atenção dos gestores. Use só os números',
  'fornecidos (não invente nada), cite nomes só quando vierem nos desvios, seja factual e sem juízo de valor',
  'pessoal. Texto corrido, sem markdown e sem listas.',
].join('\n');
async function iaSemanal(foto, anterior, cmp) {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) return { texto: '', motivo: 'ANTHROPIC_API_KEY não configurada — cartão sem o texto da IA.' };
  const pega = (t) => (t ? {
    plan: t.plan, orc: t.orc, real: t.real, exec: t.exec, ader: t.ader, consumo: t.consumo, criados: t.criados, concluidos: t.concluidos, saldo: t.saldo,
    reunioes: t.reunioes, qualidade: t.qualidade && t.qualidade.nota, vencidos: t.vencidos, parados: t.parados, semVenc: t.semVenc, diasVazios: t.diasVazios,
    pessoas: t.pessoas, pessoasComPlano: t.pessoasComPlano,
  } : null);
  const payload = { semana: foto.semana, semanaAnterior: anterior ? anterior.semana : null, horasEm: 'segundos', atual: pega(foto.time), anterior: pega(anterior && anterior.time), desvios: (cmp && cmp.desvios) || {} };
  const r = await chamaClaude(apiKey, payload, { system: IA_SISTEMA_SEMANAL, schema: IA_SCHEMA_SEMANAL, prompt: `Números da semana (JSON):\n\n${JSON.stringify(payload)}` });
  return { texto: String((r && r.texto) || '').trim().slice(0, 1500) };
}

// Fase FOTO: monta e grava a foto da semana `seg` (segunda) e anota o realizado fechado na anterior.
async function semanalFoto({ cfg, seg, dry }) {
  const { foto, anterior } = await montaFotoSemanal({ seg, cfg });
  const resumo = { semana: foto.semana, pessoas: foto.time.pessoas, projetos: Object.keys(foto.projetos).length, truncado: foto.truncado };
  if (dry) return { dry: true, fase: 'foto', ...resumo, foto, anterior };
  const g = await gravaFoto(foto);
  const fechou = await marcaRealFechado(anterior.semana, anterior.realFechado);
  return { fase: 'foto', gravada: true, ...resumo, fotosGuardadas: g.total, podadas: g.apagadas, realFechadoAnterior: fechou ? anterior.semana : '' };
}
// Fase ENVIO: lê a foto (e a anterior), IA, cartão dos gestores, mensagem a cada gerente.
// `marcar` diz ao chamador se pode carimbar `ultimoEnvioSemanal`: entregou em algum canal,
// ou não há canal nenhum configurado (nada a tentar de novo — a resposta explica).
async function semanalEnvio({ cfg, seg, dry }) {
  const fotos = await leFotos({ ate: seg, n: 2 });
  const foto = fotos[0] && fotos[0].semana === seg ? fotos[0] : null;
  if (!foto) throw new Error(`Sem foto da semana ${seg} — a fase foto ainda não rodou (?tipo=semanal&fase=foto).`);
  const anterior = fotos[1] || null;
  const cmp = comparaFotos(foto, anterior);
  // O texto da IA é gravado na foto: uma reexecução (tique repetido, falha de envio) não paga de novo.
  let ia = { texto: String(foto.ia || '').trim() };
  if (!ia.texto) { try { ia = await iaSemanal(foto, anterior, cmp); } catch (e) { ia = { texto: '', erro: String(e && e.message ? e.message : e).slice(0, 200) }; } }
  const cartao = cartaoSemanal(foto, anterior, cmp, ia.texto);
  const dms = mensagensGerentes(foto);
  const base = { fase: 'envio', semana: seg, anterior: anterior ? anterior.semana : '', ia: !!ia.texto, ...(ia.motivo ? { iaMotivo: ia.motivo } : {}), ...(ia.erro ? { iaErro: ia.erro } : {}) };
  if (dry) return { dry: true, ...base, iaTexto: ia.texto, cartao, gerentes: dms.map((m) => ({ ...m, cartao: cartaoDM(m) })) };
  if (ia.texto && ia.texto !== foto.ia) await anotaFoto(seg, { ia: ia.texto });
  const wG = process.env.TEAMS_GESTORES_WEBHOOK_URL || '';
  const canal = wG ? await enviaCartao(wG, cartao) : { ok: false, motivo: 'TEAMS_GESTORES_WEBHOOK_URL não configurada — o cartão dos gestores não foi enviado.' };
  const dm = dms.length ? await avisaTeamsDM(dms.map((m) => ({ accountId: m.accountId, nome: m.nome, email: m.email })), (p) => {
    const m = dms.find((x) => x.accountId === p.accountId);
    return { semana: foto.semana, titulo: m.titulo, texto: m.texto, cartao: cartaoDM(m), projetos: m.projetos };
  }) : { enviados: 0, total: 0, semEmail: [], falhas: [] };
  const entregue = !!(canal.ok || (dm && dm.enviados > 0));
  const semCanal = !wG && dm === null;
  return {
    ...base, entregue, marcar: entregue || semCanal,
    canal: canal.ok ? { enviado: true, status: canal.status } : { enviado: false, ...(canal.motivo ? { motivo: canal.motivo } : { status: canal.status, erro: canal.erro }) },
    gerentes: dm === null ? { total: dms.length, enviados: 0, motivo: 'TEAMS_DM_WEBHOOK_URL não configurada — nenhum gerente recebeu a mensagem.' } : dm,
  };
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
      const titulo = String(av.titulo || 'Novidades no Dexterity Hub').slice(0, 150);
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

    // ---- 📊 Relatório semanal, chamada manual: ?tipo=semanal&fase=foto|envio[&dry=1][&semana=AAAA-MM-DD] ----
    // Não depende do TEAMS_WEBHOOK_URL (tem canais próprios), mas EXIGE o CRON_SECRET: sem a env
    // é 503 mesmo com dry=1 — a foto traz dados por pessoa. Com a env, o gate acima já deu 401.
    if (String(q.tipo || '') === 'semanal') {
      if (!segredo) return json(res, 503, { erro: 'CRON_SECRET não configurado — o relatório semanal tem dados por pessoa e só roda com o segredo do cron (defina a env na Vercel).' });
      const cfgS = await configCompartilhada();
      const hojeS = spDate(new Date());
      const segS = segundaDe(String(q.semana || '')) || segundaDe(hojeS);
      const fase = String(q.fase || '') === 'envio' ? 'envio' : 'foto';
      const out = fase === 'envio' ? await semanalEnvio({ cfg: cfgS, seg: segS, dry }) : await semanalFoto({ cfg: cfgS, seg: segS, dry });
      // O estado do agendador só muda para a semana CORRENTE: refazer uma semana passada à mão
      // não pode confundir o cron desta sexta.
      if (!dry && segS === segundaDe(hojeS)) {
        const estadoS = await teamsEstado();
        if (estadoS !== null) {
          if (fase === 'foto') await gravaTeamsEstado({ ultimaFotoSemanal: segS }, estadoS);
          else if (out.marcar) await gravaTeamsEstado({ ultimoEnvioSemanal: segS }, estadoS);
        }
      }
      return json(res, 200, out);
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
      // 📊 Relatório semanal de sexta (cfg.relSemanal: {ativo, dia, hora, parado}) — a foto no
      // primeiro tique ≥ hora no dia marcado, o envio no tique seguinte. As duas chaves do
      // teams_estado guardam a SEGUNDA da semana; sem Supabase não há onde gravar a foto.
      const scfg = Object.assign({}, REL_SEMANAL_PADRAO, cfg.relSemanal || {});
      const horaSem = /^\d{2}:\d{2}$/.test(String(scfg.hora || '')) ? scfg.hora : REL_SEMANAL_PADRAO.hora;
      if (!segredo) out.semanal = { enviado: false, motivo: 'CRON_SECRET não configurado (a foto tem dados por pessoa)' };
      else if (!scfg.ativo) out.semanal = { enviado: false, motivo: 'desativado no painel' };
      else if (diaSemana(hoje) !== Number(scfg.dia || 5)) out.semanal = { enviado: false, motivo: `só no dia ${scfg.dia} da semana` };
      else if (semSupabase) out.semanal = { enviado: false, motivo: 'Supabase não configurado (a foto precisa dele)' };
      else {
        const segSem = segundaDe(hoje);
        try {
          if (ult('ultimaFotoSemanal') !== segSem) {
            const gf = gateHorario(horaSem, agora, hoje, '');
            if (gf.pronto) {
              const m = await semanalFoto({ cfg, seg: segSem });
              await gravaTeamsEstado({ ultimaFotoSemanal: segSem }, estado);
              out.semanal = { enviado: false, ...m, proximo: 'envio no próximo tique do cron' };
            } else out.semanal = { enviado: false, motivo: gf.motivo, hora: horaSem };
          } else if (ult('ultimoEnvioSemanal') !== segSem) {
            const m = await semanalEnvio({ cfg, seg: segSem });
            if (m.marcar) await gravaTeamsEstado({ ultimoEnvioSemanal: segSem }, estado);
            out.semanal = { enviado: !!m.entregue, ...m };
          } else out.semanal = { enviado: false, motivo: `já enviado nesta semana (${segSem})` };
        } catch (e) { out.semanal = { enviado: false, erro: String(e && e.message ? e.message : e) }; }
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
