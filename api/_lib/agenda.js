// 📅 Agenda — peças compartilhadas entre /api/reunioes (a tela) e /api/teams (o agendador de 30 em 30 min).
//
// 🔒 TRAVA DO TICKET DE REUNIÃO (2026-10-27, a pedido do usuário: "a criação de tickets de eventos da agenda está
// uma bagunça — o organizador demora, todo mundo fica sem apontar, e se outra pessoa cria não existe trava; os
// eventos que envolvem pessoas da Dexterity podem ser criados por qualquer pessoa, mas se uma pessoa cria não é
// possível que outra crie o mesmo evento; e um alerta no fim do dia, só para o organizador, se ninguém criou").
//
// Por que o vínculo antigo não bastava: ele mora na config compartilhada pela chave `id` do evento no Outlook — e
// esse id é DIFERENTE na agenda de cada convidado. Quem não criou não enxergava o ticket do colega (só pela
// conferência de título + dia no Jira), e duas pessoas podiam criar ao mesmo tempo. A chave comum a todas as agendas
// é o `iCalUId` do Graph ("unique across calendars", e diferente para cada ocorrência de uma recorrente).
//
// A trava é UMA linha por reunião em `jirainsight_config` (id `agtk_<sha256(iCalUId)>`), nunca na config `default`
// (que desce inteira para o navegador e se mescla em três vias). O INSERT é a trava: a chave primária faz o Supabase
// recusar (409) a segunda pessoa — não há corrida. Estados: `criando` (reservada por alguém, vale 3 min — se o
// navegador morrer no meio, outra pessoa assume depois) e `ok` (com o ticket). Quem assume uma reserva vencida
// confere antes no Jira pela LABEL `agenda-uid-<hash>` que todo ticket criado pela Agenda leva: se o ticket nasceu e
// só a confirmação se perdeu, a reunião fica com ele em vez de ganhar um segundo.
//
// ⏰ ALERTA DE FIM DO DIA: `alertaFimDoDia` lê a agenda de cada pessoa ativa do Jira (Graph, em lotes `$batch`),
// separa as reuniões que ELA organizou, com pelo menos mais uma pessoa da Dexterity, já começadas e sem ticket
// (trava, vínculo antigo, ignorada pelo organizador, ou ticket achado no Jira pelo título + dia / pela label) e grava
// o aviso no 📥 Inbox SÓ do organizador (linha `agal_<sha256(email)>`) + mensagem direta no Teams quando o fluxo
// estiver configurado. Nada de alerta para quem foi só convidado.
import { createHash, randomUUID } from 'node:crypto';
import { cacheGet, cacheSetTTL, jiraSearchAll } from './util.js';

// ------------------------------- Microsoft Graph -------------------------------
// Movida do api/reunioes.js (que a reexporta para o 🌐 portal): credenciais de APLICATIVO (client credentials).
export async function graphToken() {
  const c = cacheGet('graph:token');
  if (c) return c;
  const r = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error(`Autenticação no Microsoft Graph falhou (${r.status}): ${String(j.error_description || j.error || '').slice(0, 200)}`);
  }
  return cacheSetTTL('graph:token', j.access_token, 45);
}
export const graphConfigurado = () => !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);

// ------------------------------- Supabase (tabela de config) -------------------------------
function sb() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  return base && key ? { base, key } : null;
}
async function sbFetch(caminho, opts = {}) {
  const s = sb();
  const headers = { apikey: s.key, Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) };
  return fetch(`${s.base}/rest/v1/${caminho}`, { ...opts, headers });
}
async function sbRows(r) {
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}
export const travaDisponivel = () => !!sb();

// ------------------------------- 🔒 Trava -------------------------------
export const TRAVA_TTL_MS = 3 * 60 * 1000;          // reserva sem confirmação vale 3 min — depois outra pessoa assume
const RE_UID = /^[\x21-\x7e]{8,400}$/;                 // iCalUId: texto longo sem espaço (hex na prática)
export const uidOk = (u) => typeof u === 'string' && RE_UID.test(u);
const hash = (s) => createHash('sha256').update(String(s)).digest('hex');
export const travaId = (uid) => `agtk_${hash(uid).slice(0, 40)}`;
export const travaRotulo = (uid) => `agenda-uid-${hash(uid).slice(0, 12)}`;
const alertaId = (email) => `agal_${hash(String(email).toLowerCase()).slice(0, 40)}`;
const msDe = (iso) => { const t = Date.parse(String(iso || '')); return Number.isFinite(t) ? t : 0; };
const limpaTxt = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

// O que a tela recebe de cada trava (sem o uid cru — o cliente já o tem). Estados: 'criando' (reservada), 'ok' (com
// ticket) e 'nao' (✂ desvinculada: a reunião está livre, MAS o vínculo antigo da config — guardado pela chave da agenda
// de quem vinculou — não pode ressuscitá-la; é uma lápide, não uma reserva).
const estadoDe = (d) => (d.estado === 'ok' ? 'ok' : d.estado === 'nao' ? 'nao' : 'criando');
const pub = (d) => ({
  estado: estadoDe(d),
  k: d.k || '', em: d.em || '',
  por: { acc: (d.por && d.por.acc) || '', nome: (d.por && d.por.nome) || '' },
  vencida: estadoDe(d) === 'criando' && Date.now() - msDe(d.em) > TRAVA_TTL_MS,
});

async function travaLe(uid) {
  const rows = await sbRows(await sbFetch(`jirainsight_config?id=eq.${travaId(uid)}&select=id,data,updated_at`));
  return rows[0] || null;
}
// Lê as travas de várias reuniões de uma vez (a tela pede ao carregar a agenda e antes de abrir o 📝).
export async function travasLer(uids) {
  const out = {};
  if (!sb()) return out;
  const lista = [...new Set((uids || []).filter(uidOk))].slice(0, 200);
  const porId = Object.fromEntries(lista.map((u) => [travaId(u), u]));
  const ids = Object.keys(porId);
  for (let i = 0; i < ids.length; i += 60) {
    const rows = await sbRows(await sbFetch(`jirainsight_config?id=in.(${ids.slice(i, i + 60).join(',')})&select=id,data,updated_at`));
    rows.forEach((r) => { const u = porId[r.id]; if (u && r.data) out[u] = pub(r.data); });
  }
  return out;
}

// Ticket que já nasceu para a reunião (mesmo que a confirmação tenha se perdido): procura pela label da Agenda.
// Devolve o ticket, null (procurou e não há) ou {falhou:true} — a busca que falha NÃO pode valer como "não há"
// (revisão de 2026-10-27: com o Jira fora, a tomada da reserva vencida seguia e o segundo ticket nascia).
async function ticketPelaLabel(uid) {
  try {
    const { issues } = await jiraSearchAll({ jql: `labels = "${travaRotulo(uid)}" ORDER BY created ASC`, fields: ['summary', 'creator', 'created'], pageSize: 5, maxPages: 1 });
    const it = issues[0];
    if (!it) return null;
    const f = it.fields || {};
    return { k: it.key, por: { acc: (f.creator && f.creator.accountId) || '', nome: (f.creator && f.creator.displayName) || '' }, em: f.created || '' };
  } catch (e) { return { falhou: true }; }
}

const meta = (m) => ({
  uid: m.uid, titulo: limpaTxt(m.titulo, 200), dia: /^\d{4}-\d{2}-\d{2}$/.test(String(m.dia || '')) ? m.dia : '',
  org: { email: limpaTxt(m.org && m.org.email, 120).toLowerCase(), nome: limpaTxt(m.org && m.org.nome, 120) },
});

// Reserva a reunião para quem vai criar/vincular o ticket. Devolve:
//   {ok:true, reservado:true, rotulo, tok}               → pode criar (põe a `rotulo` no ticket e devolve a `tok` ao confirmar/soltar)
//   {ok:false, ja:{k, por, em}}                          → alguém já criou: use esse ticket
//   {ok:false, criando:{por, em, minha}}                 → alguém (ou você, noutra aba/aparelho) está criando agora
//   {ok:false, erro}                                     → não deu para conferir (Jira fora na tomada de reserva vencida)
//   {ok:true, semTrava:true, rotulo}                     → Supabase não configurado: segue sem trava (a tela avisa)
// A `tok` (ficha da reserva) é o que diz "esta reserva é desta tentativa": a mesma pessoa em duas abas não
// passa por cima de si mesma, e confirmar/soltar sem a ficha não mexe numa reserva viva (revisão de 2026-10-27).
export async function travaReservar(m, quem, tentativa = 0) {
  const rotulo = travaRotulo(m.uid);
  if (!sb()) return { ok: true, semTrava: true, rotulo };
  const agora = new Date().toISOString();
  const tok = randomUUID();
  const dados = { ...meta(m), estado: 'criando', k: '', por: { acc: quem.acc, nome: limpaTxt(quem.nome, 120) }, em: agora, tok };
  const r = await sbFetch('jirainsight_config', { method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id: travaId(m.uid), data: dados, updated_at: agora }) });
  if (r.ok) return { ok: true, reservado: true, rotulo, tok };
  if (r.status !== 409) throw new Error(`Supabase ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const atual = await travaLe(m.uid);
  if (!atual) return tentativa < 1 ? travaReservar(m, quem, tentativa + 1) : { ok: false, erro: 'A reserva mudou no meio — tente de novo.' };
  const d = atual.data || {};
  if (d.estado === 'ok' && d.k) return { ok: false, ja: pub(d) };
  const livre = d.estado === 'nao';                    // ✂ desvinculada: livre para quem chegar (sem conferir label)
  const vencida = livre || Date.now() - msDe(d.em) > TRAVA_TTL_MS;
  if (!vencida) return { ok: false, criando: { ...pub(d), minha: !!(d.por && d.por.acc === quem.acc) } };
  // Reserva vencida (o navegador de quem reservou morreu no meio — inclusive o seu): o ticket pode ter nascido e só a
  // confirmação se perdido — a label diz. Sem conseguir conferir, NÃO assume (o segundo ticket seria pior).
  if (!livre) {
    const achado = await ticketPelaLabel(m.uid);
    if (achado && achado.falhou) return { ok: false, erro: 'Não consegui conferir no Jira se o ticket desta reunião já foi criado — tente de novo em instantes.' };
    if (achado) {
      const ok = { ...d, ...meta({ ...m, ...d, uid: m.uid }), estado: 'ok', k: achado.k, por: achado.por.acc ? achado.por : d.por, em: new Date().toISOString(), viaLabel: true, tok: '' };
      await sbFetch(`jirainsight_config?id=eq.${travaId(m.uid)}&updated_at=eq.${encodeURIComponent(atual.updated_at)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ data: ok, updated_at: new Date().toISOString() }) });
      return { ok: false, ja: pub(ok) };
    }
  }
  // Assume só se ninguém mexeu desde a leitura (updated_at igual) — duas pessoas assumindo ao mesmo tempo: uma ganha.
  const rp = await sbFetch(`jirainsight_config?id=eq.${travaId(m.uid)}&updated_at=eq.${encodeURIComponent(atual.updated_at)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: dados, updated_at: agora }) });
  const rows = await sbRows(rp);
  if (rows.length) return { ok: true, reservado: true, rotulo, tok, ...(livre ? {} : { assumida: true }) };
  const nova = await travaLe(m.uid);
  const nd = (nova && nova.data) || {};
  return nd.estado === 'ok' && nd.k ? { ok: false, ja: pub(nd) } : { ok: false, criando: { ...pub(nd), minha: !!(nd.por && nd.por.acc === quem.acc) } };
}

// Ticket criado/vinculado: a reunião passa a ter dono. Regras (revisão de 2026-10-27):
//  · já há OUTRO ticket confirmado → não troca, devolve `ja`;
//  · há uma reserva VIVA que não é a desta tentativa (`tok` diferente) → não passa por cima, devolve `criando` — é o que
//    impede o "✓ usar este ticket", as 📞 Ligações ou outra aba de sobrescrever quem está criando;
//  · a escrita é condicional: INSERT quando não há linha (409 = alguém chegou antes → relê) e PATCH filtrado pelo
//    updated_at lido (ninguém mexeu no meio);
//  · `migracao` (vínculo ANTIGO da config indo para a trava) só vale com a reunião SEM linha nenhuma — só INSERT.
export async function travaConfirmar(m, k, quem, opts = {}, tentativa = 0) {
  if (!sb()) return { ok: true, semTrava: true };
  const agora = new Date().toISOString();
  const atual = await travaLe(m.uid);
  const d = (atual && atual.data) || {};
  const dados = { ...meta({ ...d, ...m, uid: m.uid }), estado: 'ok', k, por: { acc: quem.acc, nome: limpaTxt(quem.nome, 120) }, em: agora, tok: '' };
  const insere = async () => {
    const r = await sbFetch('jirainsight_config', { method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id: travaId(m.uid), data: dados, updated_at: agora }) });
    if (r.ok) { podaDeVezEmQuando(); return { ok: true, trava: pub(dados) }; }
    if (r.status !== 409) throw new Error(`Supabase ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
    return null;   // alguém criou a linha entre a leitura e o INSERT
  };
  if (opts.migracao) {
    if (atual) return { ok: false, existe: true, trava: pub(d) };
    return (await insere()) || { ok: false, existe: true };
  }
  if (!atual) {
    const r = await insere();
    if (r) return r;
    return tentativa < 1 ? travaConfirmar(m, k, quem, opts, tentativa + 1) : { ok: false, erro: 'A reunião mudou no meio — tente de novo.' };
  }
  if (d.estado === 'ok' && d.k) return d.k === k ? { ok: true, trava: pub(d) } : { ok: false, ja: pub(d) };
  const viva = estadoDe(d) === 'criando' && Date.now() - msDe(d.em) <= TRAVA_TTL_MS;
  if (viva && !(opts.tok && d.tok === opts.tok)) return { ok: false, criando: { ...pub(d), minha: !!(d.por && d.por.acc === quem.acc) } };
  const rows = await sbRows(await sbFetch(`jirainsight_config?id=eq.${travaId(m.uid)}&updated_at=eq.${encodeURIComponent(atual.updated_at)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: dados, updated_at: agora }) }));
  if (rows.length) { podaDeVezEmQuando(); return { ok: true, trava: pub(dados) }; }
  const nova = await travaLe(m.uid);
  const nd = (nova && nova.data) || {};
  if (nd.estado === 'ok' && nd.k) return nd.k === k ? { ok: true, trava: pub(nd) } : { ok: false, ja: pub(nd) };
  return { ok: false, criando: { ...pub(nd), minha: !!(nd.por && nd.por.acc === quem.acc) } };
}

// Solta a reunião. Sem `desvincular`: só a MINHA reserva em andamento (a criação falhou) — a linha sai. Com
// `desvincular` (✂ na tela, qualquer pessoa identificada, como já era): a reunião com ticket vira LÁPIDE (estado 'nao'):
// livre para criar de novo, e o vínculo antigo de alguém na config não a traz de volta.
export async function travaLiberar(uid, quem, desvincular, tok) {
  if (!sb()) return { ok: true, semTrava: true };
  const atual = await travaLe(uid);
  if (!atual) return { ok: true, nada: true };
  const d = atual.data || {};
  const filtro = `jirainsight_config?id=eq.${travaId(uid)}&updated_at=eq.${encodeURIComponent(atual.updated_at)}`;
  if (desvincular && d.estado === 'ok') {
    const lapide = { ...d, estado: 'nao', por: { acc: quem.acc, nome: limpaTxt(quem.nome, 120) }, em: new Date().toISOString() };
    const r = await sbFetch(filtro, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ data: lapide, updated_at: new Date().toISOString() }) });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
    return { ok: true };
  }
  // só a reserva DESTA tentativa (a ficha bate): outra aba sua que está criando agora não é solta por engano
  const minhaReserva = estadoDe(d) === 'criando' && d.por && d.por.acc === quem.acc && (!d.tok || d.tok === tok);
  if (!minhaReserva) return { ok: false, erro: d.estado === 'ok' ? 'A reunião já tem ticket — use ✂ desvincular.' : d.estado === 'nao' ? 'A reunião já está livre.' : 'A reserva é de outra pessoa.' };
  const r = await sbFetch(filtro, { method: 'DELETE' });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return { ok: true };
}

// Higiene: travas e alertas com mais de 120 dias saem (uma vez por partida a frio da função, na 1ª confirmação).
let _podou = false;
function podaDeVezEmQuando() {
  if (_podou || !sb()) return;
  _podou = true;
  const corte = new Date(Date.now() - 120 * 86400000).toISOString();
  ['agtk_', 'agal_'].forEach((p) => {
    sbFetch(`jirainsight_config?id=like.${p}*&updated_at=lt.${encodeURIComponent(corte)}`, { method: 'DELETE' }).catch(() => {});
  });
}

// ------------------------------- ⏰ Alertas do organizador (📥 Inbox) -------------------------------
const ALERTA_MAX = 30;
const ALERTA_DIAS = 14;
async function alertasLeTudo(email) {
  const rows = await sbRows(await sbFetch(`jirainsight_config?id=eq.${alertaId(email)}&select=id,data,updated_at`));
  const d = (rows[0] && rows[0].data) || {};
  return { avisos: Array.isArray(d.avisos) ? d.avisos : [], vistos: Array.isArray(d.vistos) ? d.vistos : [] };
}
async function alertasGrava(email, avisos, vistos) {
  const agora = new Date().toISOString();
  const r = await sbFetch('jirainsight_config', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: alertaId(email), data: { email: String(email).toLowerCase(), avisos, vistos: (vistos || []).slice(-300) }, updated_at: agora }) });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
}
// Os alertas DESTA pessoa — sem os que alguém já resolveu (a reunião ganhou ticket depois do aviso) e sem os velhos.
// Some também a reunião que o organizador ignorou ou vinculou pelo jeito antigo depois do alerta (o alerta guarda o id
// da reunião NA AGENDA DELE, que é a chave dessas duas listas da config).
export async function alertasLer(email, cfg) {
  if (!sb()) return { avisos: [], semTrava: true };
  const corte = Date.now() - ALERTA_DIAS * 86400000;
  const ign = (cfg && cfg.agendaIgnorar) || {}; const vinc = (cfg && cfg.agendaTickets) || {};
  const avisos = (await alertasLeTudo(email)).avisos.filter((a) => a && uidOk(a.uid) && msDe(a.quando) >= corte
    && !(a.evId && ((vinc[a.evId] && vinc[a.evId].t) || ign[`e:${a.evId}`])) && !(a.serie && ign[`s:${a.serie}`]));
  const travas = await travasLer(avisos.map((a) => a.uid));
  return { avisos: avisos.filter((a) => !(travas[a.uid] && travas[a.uid].estado === 'ok')) };
}
// ✕ dispensar: sai da lista, mas o uid fica em `vistos` — a próxima varredura não traz o alerta de volta.
export async function alertasDispensar(email, uid) {
  if (!sb()) return { ok: true };
  const { avisos, vistos } = await alertasLeTudo(email);
  await alertasGrava(email, avisos.filter((a) => a && a.uid !== uid), vistos.includes(uid) ? vistos : vistos.concat(uid));
  return { ok: true };
}
async function alertasAcrescenta(email, novos) {
  const { avisos, vistos } = await alertasLeTudo(email);
  const ja = new Set(vistos.concat(avisos.map((a) => a.uid)));
  const entra = novos.filter((a) => !ja.has(a.uid));
  if (!entra.length) return 0;
  await alertasGrava(email, avisos.concat(entra).slice(-ALERTA_MAX), vistos.concat(entra.map((a) => a.uid)));
  return entra.length;
}

// ------------------------------- 🔎 Ticket da reunião no Jira (título + dia) -------------------------------
// O MESMO critério do "já existe um ticket desta reunião" da tela (conferirTickets): resumo igual (com ou sem o
// prefixo "Reunião: ") e VENCIMENTO exatamente no dia da reunião; entre iguais, o mais antigo. `pares` =
// [{chave, q (título limpo), dia}] (até 8 por chamada). Devolve {chave: {k, resumo, status, dia, criadoEm, venc, exato, criadoPor}}.
const diaSPde = (iso) => { const t = Date.parse(String(iso || '')); return Number.isFinite(t) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(t)) : ''; };
export async function achaTicketsReuniao(pares, porDia = true) {
  if (!pares.length) return {};
  const jql = '(' + pares.map((p) => porDia
    ? `(summary ~ "\\"${p.q}\\"" AND duedate = "${p.dia}")`
    : `summary ~ "\\"${p.q}\\""`).join(' OR ') + (porDia ? '' : ') AND created >= -90d') + (porDia ? ')' : '') + ' ORDER BY created DESC';
  const { issues } = await jiraSearchAll({ jql, fields: ['summary', 'issuetype', 'status', 'created', 'duedate', 'creator'], pageSize: 50, maxPages: 1 });
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const semPrefixo = (s) => norm(s).replace(/^reuniao:\s*/, '');
  const achados = {};
  pares.forEach(({ chave, q, dia }) => {
    const nq = semPrefixo(q);
    const cands = issues.map((it) => {
      const f = it.fields || {}; const ns = semPrefixo(f.summary);
      const criadoEm = diaSPde(f.created); const venc = String(f.duedate || '').slice(0, 10);
      const mesmoDia = !dia || venc === dia;
      const exato = ns === nq; const contem = exato || ns.includes(nq);
      return { it, f, criadoEm, venc, mesmoDia, exato, contem };
    }).filter((c) => c.mesmoDia && c.contem)
      .sort((a, b2) => (Number(b2.exato) - Number(a.exato)) || (Number(b2.venc === dia) - Number(a.venc === dia)) || String(a.f.created || '').localeCompare(String(b2.f.created || '')));
    const hit = cands[0];
    if (hit) {
      const cr = hit.f.creator || {};
      achados[chave] = {
        k: hit.it.key, resumo: hit.f.summary || '',
        status: (hit.f.status && hit.f.status.name) || '',
        dia: dia || '', criadoEm: hit.criadoEm, venc: hit.venc, exato: hit.exato,
        criadoPor: { id: cr.accountId || '', nome: cr.displayName || '' },
      };
    }
  });
  return achados;
}
export const tituloBusca = (t) => String(t || '').replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

// ------------------------------- ⏰ Varredura de fim do dia -------------------------------
// `desde`/`ate` = "AAAA-MM-DDTHH:MM" em São Paulo (a janela desde a última varredura). `ativos` = usuários ativos do
// Jira ({accountId: {nome, email}}), `cfg` = config compartilhada (vínculos antigos e reuniões ignoradas), `dm` =
// avisaTeamsDM (injeção, para a lib não depender de outra função da Vercel). `dry` = só conta e devolve, sem gravar.
const graphSP = { Prefer: 'outlook.timezone="America/Sao_Paulo"' };
export async function alertaFimDoDia({ desde, ate, ativos, cfg, dm, dry, painel }) {
  const out = { usuarios: 0, lidos: 0, errosLeitura: 0, reunioes: 0, semTicket: 0, organizadores: 0, avisosNovos: 0, dm: null, detalhe: [] };
  if (!graphConfigurado()) return { ...out, motivo: 'Outlook não configurado (MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET).' };
  if (!sb()) return { ...out, motivo: 'Sem Supabase não há trava nem Inbox para o alerta.' };
  const porEmail = {};
  Object.entries(ativos || {}).forEach(([acc, u]) => { const e = String((u && u.email) || '').toLowerCase(); if (e) porEmail[e] = { acc, nome: (u && u.nome) || e }; });
  const emails = Object.keys(porEmail);
  out.usuarios = emails.length;
  if (!emails.length) return { ...out, motivo: 'Nenhum usuário ativo do Jira com e-mail.' };
  const tok = await graphToken();
  // Graph $batch: até 20 agendas por pedido, 3 pedidos em paralelo.
  const sel = 'id,iCalUId,subject,organizer,start,end,attendees,isCancelled,isAllDay,sensitivity,seriesMasterId,type,isOrganizer';
  const url = (e) => `/users/${encodeURIComponent(e)}/calendarView?startDateTime=${encodeURIComponent(`${desde}:00-03:00`)}&endDateTime=${encodeURIComponent(`${ate}:59-03:00`)}&$top=100&$select=${sel}`;
  const lotes = [];
  for (let i = 0; i < emails.length; i += 20) lotes.push(emails.slice(i, i + 20));
  const eventos = [];
  const leLote = async (lote) => {
    const r = await fetch('https://graph.microsoft.com/v1.0/$batch', {
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ requests: lote.map((e, i) => ({ id: String(i), method: 'GET', url: url(e), headers: graphSP })) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { out.errosLeitura += lote.length; out.erroLeitura = `Graph $batch ${r.status}`; return; }
    (j.responses || []).forEach((resp) => {
      const e = lote[Number(resp.id)];
      if (!e || resp.status !== 200 || !resp.body) {
        out.errosLeitura += 1;
        // 429/5xx = passageiro: a varredura NÃO carimba o dia (o próximo tique refaz a janela); 404 (sem caixa) não segura
        if (!resp || resp.status === 429 || resp.status >= 500) out.erroLeitura = `Graph ${resp ? resp.status : '?'} em ${e || '?'}`;
        return; }
      out.lidos += 1;
      (resp.body.value || []).forEach((ev) => eventos.push({ dono: e, ev }));
    });
  };
  for (let i = 0; i < lotes.length; i += 3) await Promise.all(lotes.slice(i, i + 3).map(leLote));

  const orgDe = (ev) => String((ev.organizer && ev.organizer.emailAddress && ev.organizer.emailAddress.address) || '').toLowerCase();
  const inicioDe = (ev) => String((ev.start && ev.start.dateTime) || '').slice(0, 16);
  const fimDe = (ev) => String((ev.end && ev.end.dateTime) || '').slice(0, 16);
  const vinc = (cfg && cfg.agendaTickets) || {};
  const ign = (cfg && cfg.agendaIgnorar) || {};
  const porUid = {};
  eventos.forEach(({ dono, ev }) => {
    if (!ev || !uidOk(ev.iCalUId)) return;
    // Só a cópia do ORGANIZADOR: o `isOrganizer` da própria agenda manda (o e-mail do Outlook pode ser um apelido do
    // e-mail do Jira); o alerta vai para o DONO da agenda lida, que é a pessoa do Jira.
    const orgEv = orgDe(ev);
    if (!(ev.isOrganizer === true || (ev.isOrganizer === undefined && orgEv === dono))) return;
    const org = dono;
    if (ev.isCancelled || ev.isAllDay || (ev.sensitivity && ev.sensitivity !== 'normal')) return;
    // A janela vale pelo FIM da reunião, aberta no começo: (desde, ate]. Reunião ainda em andamento na varredura fica
    // para a próxima (a janela seguinte começa no `ate` desta) — e nenhuma reunião é varrida duas vezes.
    const ini = inicioDe(ev); const fim = fimDe(ev) || ini;
    if (!ini || !(fim > desde && fim <= ate)) return;
    const outros = (ev.attendees || []).filter((a) => a.type !== 'resource')
      .map((a) => String((a.emailAddress && a.emailAddress.address) || '').toLowerCase())
      .filter((e) => e && e !== org && e !== orgEv && porEmail[e]);
    if (!outros.length) return;                                              // precisa envolver mais alguém da Dexterity
    if (vinc[ev.id] && vinc[ev.id].t) return;                                // vínculo antigo (pela agenda do organizador)
    const serieT = (ev.type === 'occurrence' || ev.type === 'exception') && !ev.seriesMasterId ? `s:t:${String(ev.subject || '').trim().toLowerCase()}` : '';
    if ((ev.seriesMasterId && ign[`s:${ev.seriesMasterId}`]) || ign[`e:${ev.id}`] || (serieT && ign[serieT])) return;   // o organizador ignorou
    porUid[ev.iCalUId] = { uid: ev.iCalUId, titulo: ev.subject || '(sem título)', dia: ini.slice(0, 10), inicio: ini, org, outros: outros.length,
      evId: String(ev.id || ''), serie: String(ev.seriesMasterId || '') };
  });
  let cand = Object.values(porUid);
  out.reunioes = cand.length;
  if (!cand.length) return out;
  // 1) trava: com ticket (ou alguém criando agora) → fora
  const travas = await travasLer(cand.map((c) => c.uid));
  cand = cand.filter((c) => { const t = travas[c.uid]; return !(t && (t.estado === 'ok' || (t.estado === 'criando' && !t.vencida))); });
  // ✂ desvinculada (lápide): o ticket recusado ainda tem a label e o título — não pode valer como "tem ticket"
  cand.forEach((c) => { if (travas[c.uid] && travas[c.uid].estado === 'nao') c.livre = true; });
  // 2) ticket criado FORA da trava: pela label da Agenda e pelo título + dia no Jira (o mesmo critério da tela)
  if (cand.length) {
    try {
      const rot = cand.filter((c) => !c.livre).map((c) => travaRotulo(c.uid));
      const { issues } = await jiraSearchAll({ jql: `labels in (${rot.map((x) => `"${x}"`).join(',')})`, fields: ['labels'], pageSize: 100, maxPages: 1 });
      const tem = new Set(); issues.forEach((it) => ((it.fields && it.fields.labels) || []).forEach((l) => tem.add(l)));
      cand = cand.filter((c) => c.livre || !tem.has(travaRotulo(c.uid)));
    } catch (e) { /* sem a busca pela label, a conferência por título ainda corta o que já existe */ }
  }
  const aConferir = cand.filter((c) => !c.livre);
  for (let i = 0; i < aConferir.length; i += 8) {
    const lote = aConferir.slice(i, i + 8);
    try {
      const ach = await achaTicketsReuniao(lote.map((c) => ({ chave: c.uid, q: tituloBusca(c.titulo), dia: c.dia })).filter((p) => p.q.length >= 4));
      lote.forEach((c) => { if (ach[c.uid]) c.temTicket = true; });
    } catch (e) { /* Jira fora: na dúvida, avisa (o organizador vê o ticket pelo 🎫 se existir) */ }
  }
  cand = cand.filter((c) => !c.temTicket);
  out.semTicket = cand.length;
  const porOrg = {};
  cand.forEach((c) => { (porOrg[c.org] = porOrg[c.org] || []).push(c); });
  out.organizadores = Object.keys(porOrg).length;
  out.detalhe = Object.entries(porOrg).map(([org, l]) => ({ org, reunioes: l.map((c) => ({ titulo: c.titulo, inicio: c.inicio })) }));
  if (dry) return out;
  const quando = new Date().toISOString();
  const comNovo = [];   // a mensagem do Teams vai SÓ para quem ganhou alerta novo nesta varredura (refazer a janela não repete)
  for (const [org, l] of Object.entries(porOrg)) {
    try {
      const n = await alertasAcrescenta(org, l.map((c) => ({ uid: c.uid, titulo: limpaTxt(c.titulo, 200), dia: c.dia, inicio: c.inicio, quando, evId: c.evId, serie: c.serie })));
      out.avisosNovos += n; if (n) comNovo.push(org);
    } catch (e) { out.erroGravar = String(e.message || e).slice(0, 160); }
  }
  if (dm && comNovo.length && process.env.AGENDA_ALERTA_TEAMS !== '0') {
    const pend = comNovo.map((org) => ({ accountId: porEmail[org].acc, nome: porEmail[org].nome, email: org }));
    const link = `${painel || 'https://jirainsight.vercel.app'}/?v=inbox`;
    out.dm = await dm(pend, (p) => {
      const l = porOrg[p.email] || [];
      const linhas = l.map((c) => `• **${c.titulo}** — ${c.inicio.slice(8, 10)}/${c.inicio.slice(5, 7)} ${c.inicio.slice(11, 16)}`).join('\n');
      return { titulo: `⏰ Reunião sua sem ticket (${l.length})`,
        texto: `Ninguém criou o ticket ${l.length > 1 ? 'destas reuniões que você organizou' : 'desta reunião que você organizou'} — o time não consegue apontar as horas:\n\n${linhas}\n\n[Abrir o 📥 Inbox e criar com 1 clique](${link})` };
    });
  }
  return out;
}
