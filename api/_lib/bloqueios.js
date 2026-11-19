// 🚧 PENDÊNCIAS E BLOQUEIOS (issue #230 / JI-301, 2026-11-19): o bloqueio mora NO TICKET DO JIRA — um comentário com marcador na 1ª linha (um
// EVENTO por comentário: abrir · atualizar · resolver · reabrir) + o flag de impedimento do Jira + a label `bloqueio-aberto` (índice de leitura).
// O Hub LÊ do Jira (conta de serviço) e ESCREVE com o token da própria pessoa. Nada disto vive na `cfg`. Esta lib é a fonte ÚNICA: o servidor
// monta e interpreta o comentário (a tela nunca escreve o marcador à mão). Funções de cálculo PURAS; só as de Jira/Supabase falam com a rede e
// as dependências entram por BQ_DEPS (ganchos de teste, como DISC_DEPS em disciplina.js). Esta lib NÃO importa api/transicao.js nem api/teams.js
// (ciclo): a decisão de "nota interna" (projeto AMS) entra por parâmetro (`ehInterno`).
//
// ---------------------------------------------------------------------------------------
// FORMATO v1 DO COMENTÁRIO (um parágrafo ADF por linha)
// ---------------------------------------------------------------------------------------
//   ⛔ Bloqueio · 🔴 Crítico · #b7k2
//   Quem destrava: @Bia Souza @Caio Reis          (ou  Quem destrava: cliente: Acme Ltda  ·  em 🔵 Ciência: "Para ciência de: ")
//   Prazo: 25/11/2026
//   (linha em branco)
//   Texto livre do bloqueio.
//
//   evento      1ª linha                                       campos                          texto livre
//   abrir       ⛔ Bloqueio · <ic> <Nível> · #id                Quem + Prazo (obrig. em 🔴/🟡)   obrigatório (≥ 10)
//   atualizar   📝 Bloqueio atualizado · <ic> <Nível> · #id     só o que mudou (Quem/Prazo)     nota (obrigatória se nada mudou)
//   resolver    ✅ Desbloqueado · #id                           —                               resolução (≥ 3)
//   reabrir     🔁 Bloqueio reaberto · <ic> <Nível> · #id       Quem/Prazo opcionais            motivo (≥ 3)
//   Níveis: crit = 🔴 Crítico · imp = 🟡 Importante · cien = 🔵 Ciência. Sem emoji com seletor de variação no marcador. O id é `#` + 4–8 [a-z0-9]
//   (a tela gera); um ticket pode ter vários bloqueios. Em projeto AMS o comentário sai como 🔒 nota interna por padrão.
// PARSER TOLERANTE (`bqParseComentario`): lê o ADF, pula linhas vazias e uma 1ª linha só de menções ("@A @B —" do `comentar` genérico), decide o tipo
// pela PALAVRA (não pelo emoji) e NÃO confunde o marcador do status report ("📋 Status report · ⛔ Bloqueado…") com um evento.
// ESTADO (`bqEstado`): a sequência de eventos vira {bloqueios:[{id, st, nivel, quem, prazo, texto, abertoEm…, hist}], orfaos}.
// LEITURA: JQL `labels = "bloqueio-aberto" OR cf[flag] is not EMPTY` (conta de serviço) + índice de reserva `bloq_idx` (tickets em que a label não
// pôde ser gravada). ESCRITA: comentário → label → flag → avisos (Teams DM + Web Push). ESCALONAMENTO: fase `bloqueios` do cron do api/teams.js.
// Linhas no Supabase (jirainsight_config, nunca na cfg): `bloq_idx` {v:1, chaves:{K:{em,motivo}}} e `bloq_estado` {v:1, esc:{'K#id':{prazo,em,n}}, lemb:{'K#id':{prazo,em}}, em}.
import { jiraBase, jiraAuthHeader, jiraSearchAll, jiraUsuariosAtivos, configCompartilhada, cacheGet, cacheSetTTL } from './util.js';
import { addDias } from './rentab.js';
import { notificaPessoas } from './notifica.js';

export const BQ_V = 1;
export const BQ_NIVEIS = ['crit', 'imp', 'cien'];
export const BQ_NIVEL_INFO = { crit: { ic: '🔴', rot: 'Crítico' }, imp: { ic: '🟡', rot: 'Importante' }, cien: { ic: '🔵', rot: 'Ciência' } };
export const BQ_LABEL_ABERTO = 'bloqueio-aberto';
export const BQ_LABEL_HIST = 'bloqueio';
export const BQ_FLAG_NIVEIS = ['crit', 'imp'];
export const BQ_MAX_ITENS = 150;
export const BQ_MAX_COMENT = 300;
export const BQ_ESCALA_HORA = '09:00';
export const BQ_REESCALA_DIAS = 3;
export const BQ_ESCALA_MAX = 3;
export const BQ_CRITICO_AVISA_GERENTE = true;
export const BQ_AVISO_MS = 6000;
export const BQ_IDX_MAX = 200;
const TABELA = 'jirainsight_config';
const RE_ID = /^[a-z0-9]{4,8}$/;
const RE_ISSUE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const RE_ACC = /^[\w:-]{5,128}$/;

// Ganchos de teste: { fetch, sb, agora():Date, notifica, usuarios():{accountId:{nome,email}}, cfg():cfg, avisoMs }.
export const BQ_DEPS = {};
const F = (...a) => (BQ_DEPS.fetch || globalThis.fetch)(...a);
const agoraD = () => (BQ_DEPS.agora ? BQ_DEPS.agora() : new Date());
const FMT_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
export function bqDiaSP(iso) {
  let s = String(iso || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/[+-]\d{4}$/.test(s)) s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  else if (!/(Z|[+-]\d{2}:\d{2})$/.test(s)) s += '-03:00';
  const t = Date.parse(s);
  return Number.isFinite(t) ? FMT_SP.format(new Date(t)) : String(iso).slice(0, 10);
}
export const bqHoje = () => FMT_SP.format(agoraD());
const dataOk = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const ddmm = (iso) => (dataOk(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const ddmmaa = (iso) => (dataOk(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const corta = (s, n) => { const t = String(s || ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// ===========================================================================
// Montador (P1: só o servidor escreve o marcador)
// ===========================================================================
export function bqMarcador(tipo, nivel, id) {
  const n = BQ_NIVEL_INFO[nivel] || BQ_NIVEL_INFO.imp;
  const pn = `${n.ic} ${n.rot}`;
  if (tipo === 'resolver') return `✅ Desbloqueado · #${id}`;
  if (tipo === 'atualizar') return `📝 Bloqueio atualizado · ${pn} · #${id}`;
  if (tipo === 'reabrir') return `🔁 Bloqueio reaberto · ${pn} · #${id}`;
  return `⛔ Bloqueio · ${pn} · #${id}`;
}
const para = (content) => ({ type: 'paragraph', content });
const txt = (text) => ({ type: 'text', text });
/** {tipo,id,nivel,quem:{tipo:'time',pessoas:[{a,nome}]}|{tipo:'cliente',nome}|null,prazo:'AAAA-MM-DD',texto} → ADF. */
export function bqMontaADF({ tipo, id, nivel, quem, prazo, texto }) {
  const linhas = [para([txt(bqMarcador(tipo, nivel, id))])];
  if (tipo !== 'resolver') {
    if (quem && quem.tipo === 'time' && Array.isArray(quem.pessoas) && quem.pessoas.length) {
      const c = [txt(nivel === 'cien' ? 'Para ciência de: ' : 'Quem destrava: ')];
      quem.pessoas.forEach((p, i) => {
        if (i) c.push(txt(' '));
        c.push({ type: 'mention', attrs: { id: p.a, text: `@${String(p.nome || p.a).replace(/^@/, '')}` } });
      });
      linhas.push(para(c));
    } else if (quem && quem.tipo === 'cliente' && quem.nome) {
      linhas.push(para([txt(`${nivel === 'cien' ? 'Para ciência de: ' : 'Quem destrava: '}cliente: ${quem.nome}`)]));
    }
    if (prazo && dataOk(prazo)) linhas.push(para([txt(`Prazo: ${ddmmaa(prazo)}`)]));
  }
  const t = String(texto || '').trim();
  if (t) {
    if (linhas.length > 1) linhas.push(para([]));
    t.split('\n').forEach((l) => linhas.push(para(l ? [txt(l)] : [])));
  }
  return { type: 'doc', version: 1, content: linhas };
}

// ===========================================================================
// Parser tolerante
// ===========================================================================
// ADF → linhas [{t:texto, so:texto sem menções, m:[{id,nome}]}]
function linhasDoADF(body) {
  const out = [];
  const nova = () => ({ t: '', so: '', m: [] });
  let cur = null;
  const fecha = () => { if (cur) { out.push(cur); cur = null; } };
  const inline = (n) => {
    if (!n || typeof n !== 'object') return;
    if (!cur) cur = nova();
    if (n.type === 'text') { cur.t += n.text || ''; cur.so += n.text || ''; return; }
    if (n.type === 'mention') {
      const a = (n.attrs && n.attrs.id) || ''; const tx = (n.attrs && n.attrs.text) || '';
      cur.t += tx || '@'; if (a) cur.m.push({ id: String(a), nome: String(tx).replace(/^@/, '') });
      return;
    }
    if (n.type === 'hardBreak') { fecha(); cur = nova(); return; }
    if (n.type === 'emoji') { const e = (n.attrs && (n.attrs.text || n.attrs.shortName)) || ''; cur.t += e; cur.so += e; return; }
    if (n.type === 'inlineCard') { const u = (n.attrs && n.attrs.url) || ''; cur.t += u; cur.so += u; return; }
    (n.content || []).forEach(inline);
  };
  const bloco = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'paragraph' || n.type === 'heading') {
      cur = nova(); (n.content || []).forEach(inline); fecha(); return;
    }
    (n.content || []).forEach(bloco);   // listas, itens, blockquote, codeBlock…
  };
  if (body && typeof body === 'object') (body.content || []).forEach(bloco);
  return out;
}
function parsePrazo(s, ano) {
  const t = String(s || '').trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) { const iso = `${m[3]}-${m[2]}-${m[1]}`; return dataOk(iso) ? iso : ''; }
  m = /^(\d{2})\/(\d{2})$/.exec(t);
  if (m) { const iso = `${ano}-${m[2]}-${m[1]}`; return dataOk(iso) ? iso : ''; }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return dataOk(t) ? t : '';
  return '';
}
const RE_QUEM = /^(quem (destrava|resolve)|para ciencia de)\s*:/;
const RE_PRAZO = /^prazo\s*:/;

/** Comentário do Jira ({id, body, created, author, jsdPublic}) → evento ou null (não é um evento de bloqueio). */
export function bqParseComentario(c) {
  if (!c || typeof c !== 'object') return null;
  const ls = linhasDoADF(c.body);
  let i = 0;
  while (i < ls.length && !ls[i].t.trim()) i += 1;
  if (i < ls.length && ls[i].m.length && !ls[i].so.replace(/[\s—–-]+/g, '')) i += 1;   // "@A @B —" do comentar genérico
  while (i < ls.length && !ls[i].t.trim()) i += 1;
  if (i >= ls.length) return null;
  const prim = ls[i];
  const nt = norm(prim.t).trim();
  const ini = nt.replace(/^[^a-z0-9]+/, '');
  let tipo = null;
  if (ini.startsWith('desbloquead')) tipo = 'resolver';
  else if (ini.startsWith('bloqueio')) tipo = /reabert/.test(ini) ? 'reabrir' : (/atualiza/.test(ini) ? 'atualizar' : 'abrir');
  if (!tipo) return null;
  const mid = /#([a-z0-9]{3,8})\b/i.exec(prim.t);
  let id = mid ? mid[1].toLowerCase() : '';
  if (!id && tipo === 'abrir') id = `c${c.id}`;
  let nivel = null;
  if (/🔴/.test(prim.t) || /critic/.test(nt)) nivel = 'crit';
  else if (/🟡/.test(prim.t) || /importan/.test(nt)) nivel = 'imp';
  else if (/🔵/.test(prim.t) || /cienc/.test(nt)) nivel = 'cien';
  const em = c.created || '';
  const dia = bqDiaSP(em);
  let quem; let prazo;
  let j = i + 1;
  for (; j < ls.length; j += 1) {
    const l = ls[j]; const n = norm(l.t).trim();
    if (!n) continue;
    if (RE_QUEM.test(n)) {
      if (l.m.length) quem = { tipo: 'time', pessoas: l.m.slice(0, 5).map((x) => ({ a: x.id, nome: x.nome })) };
      else {
        const resto = l.t.replace(/^[^:]*:\s*/, '').replace(/^cliente\s*:\s*/i, '').trim();
        quem = resto ? { tipo: 'cliente', nome: resto.slice(0, 80) } : quem;
      }
    } else if (RE_PRAZO.test(n)) prazo = parsePrazo(l.t.replace(/^[^:]*:\s*/, ''), (dia || '').slice(0, 4));
    else break;
  }
  const texto = ls.slice(j).map((l) => l.t).join('\n').trim().slice(0, 1500);
  const ad = c.author || {};
  const interno = c.jsdPublic === false || (Array.isArray(c.properties) && c.properties.some((p) => p && p.key === 'sd.public.comment' && p.value && p.value.internal));
  return { tipo, id, nivel, quem, prazo, texto, em, dia, por: ad.displayName || '', porId: ad.accountId || '', cid: String(c.id == null ? '' : c.id), interno: !!interno };
}

// ===========================================================================
// Estado
// ===========================================================================
const RANK = { crit: 0, imp: 1, cien: 2 };
const semUndef = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
/** Comentários (cronológicos; `ordenar:false` quando já estão em ordem) → { bloqueios:[…], orfaos:n }. */
export function bqEstado(comentarios, { ordenar = true } = {}) {
  let lista = (Array.isArray(comentarios) ? comentarios : []).map((c, ix) => ({ c, ix }));
  if (ordenar) lista.sort((a, b) => (String((a.c || {}).created || '') < String((b.c || {}).created || '') ? -1 : (String((a.c || {}).created || '') > String((b.c || {}).created || '') ? 1 : a.ix - b.ix)));
  const mapa = new Map(); const ordem = []; let orfaos = 0;
  const limpa = (b) => { b.resolvidoEm = ''; b.resolvidoDia = ''; b.resolvidoPor = ''; b.resolvidoPorId = ''; b.resolucao = ''; };
  lista.forEach(({ c }) => {
    const ev = bqParseComentario(c);
    if (!ev) return;
    const h = semUndef({ tipo: ev.tipo, em: ev.em, dia: ev.dia, por: ev.por, porId: ev.porId, nivel: ev.nivel || undefined, quem: ev.quem, prazo: ev.prazo, texto: ev.texto });
    let b = ev.id ? mapa.get(ev.id) : null;
    if (!ev.id) {   // edição manual sem id: só se há exatamente UM bloqueio que aceita o evento
      const aceita = ordem.map((id) => mapa.get(id)).filter((x) => (ev.tipo === 'reabrir' ? x.st === 'resolvido' : x.st === 'aberto'));
      if (aceita.length === 1) b = aceita[0]; else { orfaos += 1; return; }
    }
    if (ev.tipo === 'abrir' && !b) {
      const nb = {
        id: ev.id, st: 'aberto', nivel: ev.nivel || 'imp', quem: ev.quem || null, prazo: ev.prazo || '', texto: ev.texto,
        abertoEm: ev.em, abertoDia: ev.dia, abertoPor: ev.por, abertoPorId: ev.porId, atualizadoEm: ev.em,
        resolvidoEm: '', resolvidoDia: '', resolvidoPor: '', resolvidoPorId: '', resolucao: '', reaberturas: 0, interno: ev.interno, hist: [h],
      };
      mapa.set(ev.id, nb); ordem.push(ev.id); return;
    }
    if (!b) { orfaos += 1; return; }
    b.hist.push(h); b.atualizadoEm = ev.em;
    const aplica = () => {
      if (ev.nivel) b.nivel = ev.nivel;
      if (ev.quem) b.quem = ev.quem;
      if (ev.prazo) b.prazo = ev.prazo;
    };
    if (ev.tipo === 'abrir' || ev.tipo === 'atualizar') { if (b.st === 'aberto') aplica(); return; }
    if (ev.tipo === 'resolver') {
      if (b.st === 'aberto') { b.st = 'resolvido'; b.resolvidoEm = ev.em; b.resolvidoDia = ev.dia; b.resolvidoPor = ev.por; b.resolvidoPorId = ev.porId; b.resolucao = ev.texto; }
      return;
    }
    if (ev.tipo === 'reabrir' && b.st === 'resolvido') {
      b.st = 'aberto'; b.reaberturas += 1; limpa(b); aplica(); if (ev.texto) b.texto = ev.texto;
    }
  });
  return { bloqueios: ordem.map((id) => mapa.get(id)), orfaos };
}
const lista_ = (est) => (Array.isArray(est) ? est : ((est && est.bloqueios) || []));
export const bqAbertos = (est) => lista_(est).filter((b) => b.st === 'aberto');
export const bqVencido = (b, hoje) => !!(b && b.st === 'aberto' && b.prazo && b.prazo < hoje);
export const bqDias = (b, hoje) => (b && b.abertoDia && hoje ? Math.max(0, diasEntre(b.abertoDia, hoje)) : 0);
export function bqOrdem(a, b, hoje) {
  const r = (RANK[a.nivel] ?? 9) - (RANK[b.nivel] ?? 9); if (r) return r;
  const v = Number(bqVencido(b, hoje)) - Number(bqVencido(a, hoje)); if (v) return v;
  const pa = a.prazo || '9999-99-99'; const pb = b.prazo || '9999-99-99';
  if (pa !== pb) return pa < pb ? -1 : 1;
  return String(a.abertoEm || '') < String(b.abertoEm || '') ? -1 : (String(a.abertoEm || '') > String(b.abertoEm || '') ? 1 : 0);
}
export function bqDesejado(est) {
  const ab = bqAbertos(est);
  return { labelAberto: ab.length > 0, flag: ab.some((b) => BQ_FLAG_NIVEIS.includes(b.nivel)) };
}
const quemTxt = (q) => {
  if (q && q.tipo === 'time') return (q.pessoas || []).map((p) => p.nome || p.a).join(', ');
  if (q && q.tipo === 'cliente') return `cliente: ${q.nome}`;
  return '—';
};
const quemIds = (q) => (q && q.tipo === 'time' ? (q.pessoas || []).map((p) => p.a).filter(Boolean) : []);

// ===========================================================================
// Validação do pedido de escrita (pura)
// ===========================================================================
/** → { erro } | { dados: {id, nivel, quem:{tipo:'time',pessoas:[accountId]}|{tipo:'cliente',nome}|null, prazo, texto, interno} } */
export function bqValida(acao, dados, hoje) {
  const d = (dados && typeof dados === 'object') ? dados : {};
  if (!['abrir', 'atualizar', 'resolver', 'reabrir'].includes(acao)) return { erro: 'Ação inválida (abrir, atualizar, resolver ou reabrir).' };
  const id = String(d.id || '').trim().toLowerCase();
  if (!RE_ID.test(id)) return { erro: 'Identificador do bloqueio inválido.' };
  const out = { id, nivel: null, quem: null, prazo: '', texto: '', interno: typeof d.interno === 'boolean' ? d.interno : undefined };
  if (d.nivel != null && d.nivel !== '') {
    if (!BQ_NIVEIS.includes(d.nivel)) return { erro: 'Nível inválido (crítico, importante ou ciência).' };
    out.nivel = d.nivel;
  }
  if ((acao === 'abrir' || acao === 'reabrir') && !out.nivel) return { erro: 'Escolha o nível do bloqueio.' };
  const texto = String(d.texto == null ? '' : d.texto).replace(/\r\n?/g, '\n').trim();
  if (texto.length > 1500) return { erro: 'Texto longo demais (máx. 1500 caracteres).' };
  out.texto = texto;
  if (acao === 'abrir' && texto.length < 10) return { erro: 'Descreva o bloqueio (mínimo de 10 caracteres).' };
  if ((acao === 'resolver' || acao === 'reabrir') && texto.length < 3) return { erro: acao === 'resolver' ? 'Diga como foi resolvido (mínimo de 3 caracteres).' : 'Diga o motivo da reabertura (mínimo de 3 caracteres).' };
  if (acao === 'resolver') return { dados: out };
  const rawPrazo = d.prazo == null ? '' : String(d.prazo).trim();
  if (rawPrazo) {
    if (!dataOk(rawPrazo)) return { erro: 'Prazo inválido.' };
    if (rawPrazo < hoje) return { erro: 'O prazo não pode estar no passado.' };
    out.prazo = rawPrazo;
  }
  const q = d.quem;
  if (q && typeof q === 'object') {
    if (q.tipo === 'time') {
      const ids = [...new Set((Array.isArray(q.pessoas) ? q.pessoas : []).map((x) => String((x && x.a) || x || '').trim()))].filter(Boolean);
      if (!ids.length || ids.length > 5) return { erro: 'Informe de 1 a 5 pessoas.' };
      if (ids.some((a) => !RE_ACC.test(a))) return { erro: 'Pessoa inválida.' };
      out.quem = { tipo: 'time', pessoas: ids };
    } else if (q.tipo === 'cliente') {
      const nome = String(q.nome || '').replace(/[\u0000-\u001f]+/g, ' ').trim();
      if (!nome || nome.length > 80) return { erro: 'Informe o nome do cliente (até 80 caracteres).' };
      out.quem = { tipo: 'cliente', nome };
    } else return { erro: 'Quem destrava: tipo inválido.' };
  }
  if (acao === 'abrir' && BQ_FLAG_NIVEIS.includes(out.nivel)) {
    if (!out.quem) return { erro: 'Diga quem destrava (uma pessoa do time ou o cliente).' };
    if (!out.prazo) return { erro: 'Informe o prazo para destravar.' };
  }
  if (acao === 'atualizar' && !out.nivel && !out.quem && !out.prazo && !texto) return { erro: 'Nada para atualizar: mude o nível, quem destrava, o prazo ou escreva uma nota.' };
  return { dados: out };
}

// ===========================================================================
// Destinatários dos avisos (pura) → accountIds
// ===========================================================================
function idsGerentes(cfg, proj, usuarios) {
  const idPorEmail = {};
  Object.entries(usuarios || {}).forEach(([a, u]) => { const e = String((u && u.email) || '').trim().toLowerCase(); if (e) idPorEmail[e] = a; });
  const norm1 = (x) => {
    const s = String((x && typeof x === 'object') ? (x.a || x.email || '') : (x || '')).trim();
    const e = s.toLowerCase();
    return e.includes('@') ? (idPorEmail[e] || '') : s;
  };
  const g = ((cfg || {}).projGerentes || {})[proj];
  let ids = (Array.isArray(g) ? g : (g ? [g] : [])).map(norm1).filter(Boolean);
  if (!ids.length) ids = (Array.isArray((cfg || {}).gestores) ? cfg.gestores : []).map(norm1).filter(Boolean);
  const ocultos = new Set(((cfg || {}).ocultos || []).map((o) => o && o.a).filter(Boolean));
  return [...new Set(ids)].filter((a) => !ocultos.has(a));
}
/** evento = {acao, id, nivelAntes?, novos?:[accountId]} · ticket = {respId, p} · ator = accountId. */
export function bqDestinatarios(evento, estNovo, ticket, ator, cfg, usuarios) {
  const b = lista_(estNovo).find((x) => x.id === evento.id);
  if (!b) return [];
  const quem = quemIds(b.quem);
  const resp = (ticket && ticket.respId) || '';
  let ids = [];
  if (evento.acao === 'resolver') ids = [resp, b.abertoPorId, ...quem];
  else if (quem.includes(ator)) ids = [resp, b.abertoPorId];
  else ids = quem.slice();
  if (evento.acao === 'atualizar' && Array.isArray(evento.novos)) ids = ids.concat(evento.novos);
  const subiu = evento.acao === 'atualizar' && evento.nivelAntes && evento.nivelAntes !== 'crit' && b.nivel === 'crit';
  if (BQ_CRITICO_AVISA_GERENTE && b.nivel === 'crit' && (evento.acao === 'abrir' || evento.acao === 'reabrir' || subiu)) {
    ids = ids.concat(idsGerentes(cfg, ticket && ticket.p, usuarios));
  }
  return [...new Set(ids.filter(Boolean))].filter((a) => a !== ator).slice(0, 8);
}

// ===========================================================================
// Escalonamento (pura)
// ===========================================================================
const pessoaDe = (a, usuarios) => ({ accountId: a, nome: (usuarios[a] && usuarios[a].nome) || a, email: (usuarios[a] && usuarios[a].email) || '' });
/** itens = itens de bqLista · estado = linha bloq_estado ({esc, lemb}). → {lembretes, escalas, novoEstado, conta} */
export function bqEscalaCalcula({ itens, estado, hoje, cfg, usuarios, truncado }) {
  const est = { esc: { ...((estado || {}).esc || {}) }, lemb: { ...((estado || {}).lemb || {}) } };
  const us = usuarios || {};
  const lemb = new Map(); const escs = new Map();
  const conta = { abertos: 0, vencidos: 0, lembrados: 0, escalados: 0 };
  const vivas = new Set();
  const poe = (mapa, a, item) => { if (!mapa.has(a)) mapa.set(a, { para: pessoaDe(a, us), itens: [] }); mapa.get(a).itens.push(item); };
  (itens || []).forEach((it) => {
    bqAbertos(it.bloqueios).forEach((b) => {
      conta.abertos += 1;
      const chave = `${it.k}#${b.id}`;
      if (b.prazo) vivas.add(chave);
      if (bqVencido(b, hoje)) conta.vencidos += 1;
      if (!b.prazo || b.prazo > hoje) return;
      const dados = { k: it.k, id: b.id, nivel: b.nivel, quem: quemTxt(b.quem), prazo: b.prazo, dias: Math.max(0, diasEntre(b.prazo, hoje)), p: it.p };
      if ((est.lemb[chave] || {}).prazo !== b.prazo) {
        const alvo = b.quem && b.quem.tipo === 'time' ? quemIds(b.quem) : [it.respId, b.abertoPorId];
        const ids = [...new Set(alvo.filter(Boolean))];
        if (ids.length) { ids.forEach((a) => poe(lemb, a, { ...dados, cliente: !(b.quem && b.quem.tipo === 'time') })); conta.lembrados += 1; }
        est.lemb[chave] = { prazo: b.prazo, em: hoje };
      }
      if (b.nivel !== 'cien' && b.prazo < hoje) {
        const e = est.esc[chave];
        const mudouPrazo = !e || e.prazo !== b.prazo;
        const reesc = e && e.prazo === b.prazo && diasEntre(e.em, hoje) >= BQ_REESCALA_DIAS && (e.n || 1) < BQ_ESCALA_MAX;
        if (mudouPrazo || reesc) {
          const ger = idsGerentes(cfg, it.p, us);
          if (ger.length) ger.forEach((a) => poe(escs, a, dados));
          conta.escalados += 1;
          est.esc[chave] = { prazo: b.prazo, em: hoje, n: mudouPrazo ? 1 : (e.n || 1) + 1 };
        }
      }
    });
  });
  if (!truncado) {
    Object.keys(est.esc).forEach((k) => { if (!vivas.has(k)) delete est.esc[k]; });
    Object.keys(est.lemb).forEach((k) => { if (!vivas.has(k)) delete est.lemb[k]; });
  }
  return { lembretes: [...lemb.values()], escalas: [...escs.values()], novoEstado: { v: 1, esc: est.esc, lemb: est.lemb, em: agoraD().toISOString() }, conta };
}

// ===========================================================================
// Jira (leitura)
// ===========================================================================
const hdrSvc = () => ({ Authorization: jiraAuthHeader(), Accept: 'application/json' });
/** Campo do flag de impedimento: env JIRA_CF_FLAGGED vence; senão acha pelo catálogo (cache 6 h, falha não guarda). '' = sem campo. */
export async function bqCampoFlag() {
  const env = String(process.env.JIRA_CF_FLAGGED || '').trim();
  if (/^customfield_\d+$/.test(env)) return env;
  const ck = 'campo:flag';
  const guardado = cacheGet(ck);
  if (guardado !== null && guardado !== undefined) return guardado;
  try {
    const rf = await F(`${jiraBase()}/rest/api/3/field`, { headers: hdrSvc() });
    if (!rf.ok) return '';
    const campos = await rf.json();
    const c = (Array.isArray(campos) ? campos : []).find((x) => x && /:multicheckboxes$/.test((x.schema && x.schema.custom) || '') && /^(flagged|sinalizad[oa]|marcad[oa]|impedimento)$/i.test(x.name || ''));
    return cacheSetTTL(ck, (c && c.id) || '', 360);
  } catch (e) { return ''; }
}
/** Todos os comentários do ticket (paginado, até BQ_MAX_COMENT). Lança Error com `.status` em falha HTTP. */
export async function bqComentarios(key, headers, base) {
  const b = base || jiraBase(); const h = headers || hdrSvc();
  const lista = []; let total = 0;
  for (let startAt = 0; lista.length < BQ_MAX_COMENT; startAt += 100) {
    const r = await F(`${b}/rest/api/3/issue/${encodeURIComponent(key)}/comment?orderBy=created&maxResults=100&startAt=${startAt}`, { headers: h });
    if (!r.ok) { const e = new Error(`Jira ${r.status} (comentários de ${key})`); e.status = r.status; throw e; }
    const j = await r.json();
    const cs = Array.isArray(j.comments) ? j.comments : [];
    total = Number(j.total) || (startAt + cs.length);
    cs.forEach((c) => lista.push(c));
    if (!cs.length || lista.length >= total) break;
  }
  return { lista: lista.slice(0, BQ_MAX_COMENT), truncado: total > BQ_MAX_COMENT };
}
const flagLigado = (v) => (Array.isArray(v) ? v.length > 0 : !!v);
function bqItem(it, est, cf, forca = {}) {
  const f = it.fields || {};
  const labels = Array.isArray(f.labels) ? f.labels : [];
  return {
    k: it.key, resumo: f.summary || '', p: (f.project && f.project.key) || String(it.key).split('-')[0], pNome: (f.project && f.project.name) || '',
    cat: (f.project && f.project.projectCategory && f.project.projectCategory.name) || '', t: (f.issuetype && f.issuetype.name) || '',
    status: (f.status && f.status.name) || '', statCat: (f.status && f.status.statusCategory && f.status.statusCategory.key) || '',
    venc: f.duedate || '', respId: (f.assignee && f.assignee.accountId) || '', resp: (f.assignee && f.assignee.displayName) || '', prio: (f.priority && f.priority.name) || '',
    flag: forca.flag !== undefined ? forca.flag : !!(cf && flagLigado(f[cf])), label: forca.label !== undefined ? forca.label : labels.includes(BQ_LABEL_ABERTO),
    bloqueios: est.bloqueios, orfaos: est.orfaos || 0, semRegistro: !!forca.semRegistro,
  };
}
const CAMPOS_BASE = ['summary', 'duedate', 'assignee', 'status', 'project', 'issuetype', 'priority', 'labels', 'updated'];

// ------------------------------- Supabase (bloq_idx e bloq_estado) -------------------------------
function sbDe() {
  if (BQ_DEPS.sb) return BQ_DEPS.sb;
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  return base && key ? { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } } : null;
}
async function leLinha(id) {
  const S = sbDe(); if (!S) return null;
  const r = await F(`${S.base}/rest/v1/${TABELA}?id=eq.${encodeURIComponent(id)}&select=data,updated_at`, { headers: S.headers });
  if (!r.ok) throw new Error(`Supabase ${r.status} (ler ${id})`);
  const rows = await r.json();
  const row = Array.isArray(rows) && rows[0];
  return row ? { data: row.data || {}, rev: row.updated_at || '' } : { data: null, rev: '' };
}
/** Lê-altera-grava com trava otimista pelo updated_at (3 tentativas). fn(dados|null) → dados novos, ou null para não gravar. */
async function mutaLinha(id, fn) {
  const S = sbDe(); if (!S) return { ok: false, semSupabase: true };
  for (let t = 0; t < 3; t += 1) {
    const cur = await leLinha(id);
    const novo = fn(cur.data);
    if (novo == null) return { ok: true, igual: true };
    const agora = new Date().toISOString();
    let r;
    if (cur.rev) {
      r = await F(`${S.base}/rest/v1/${TABELA}?id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(cur.rev)}`, { method: 'PATCH', headers: { ...S.headers, Prefer: 'return=representation' }, body: JSON.stringify({ data: novo, updated_at: agora }) });
    } else {
      r = await F(`${S.base}/rest/v1/${TABELA}`, { method: 'POST', headers: { ...S.headers, Prefer: 'return=representation' }, body: JSON.stringify({ id, data: novo, updated_at: agora }) });
      if (r.status === 409) continue;
    }
    if (!r.ok) throw new Error(`Supabase ${r.status} (gravar ${id})`);
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows) && rows.length) return { ok: true };
  }
  return { ok: false, erro: 'conflito de gravação (outra instância gravou no meio)' };
}
async function bqIdxLe() {
  try { const l = await leLinha('bloq_idx'); return (l && l.data && l.data.chaves) || {}; } catch (e) { return {}; }
}
/** Adiciona/remove chaves do índice de reserva. Nunca lança. */
async function bqIdxMuda({ add = [], remove = [] }) {
  try {
    return await mutaLinha('bloq_idx', (d) => {
      const chaves = { ...((d && d.chaves) || {}) }; let mudou = false;
      add.forEach((k) => { if (!chaves[k]) { chaves[k] = { em: new Date().toISOString(), motivo: 'label' }; mudou = true; } });
      remove.forEach((k) => { if (chaves[k]) { delete chaves[k]; mudou = true; } });
      if (!mudou) return null;
      const ks = Object.keys(chaves);
      if (ks.length > BQ_IDX_MAX) ks.sort((a, b) => String(chaves[a].em).localeCompare(String(chaves[b].em))).slice(0, ks.length - BQ_IDX_MAX).forEach((k) => delete chaves[k]);
      return { v: 1, chaves };
    });
  } catch (e) { return { ok: false, erro: String(e && e.message ? e.message : e).slice(0, 120) }; }
}

/** Lista os tickets com bloqueio (conta de serviço). { resolvidos:true } = os desbloqueados nos últimos 30 dias. */
export async function bqLista({ resolvidos = false } = {}) {
  const hoje = bqHoje();
  const cf = await bqCampoFlag();
  const campos = cf ? [...CAMPOS_BASE, cf] : CAMPOS_BASE;
  const num = cf ? String(cf).replace(/\D/g, '') : '';
  const meta = { v: 1, hoje, geradoEm: agoraD().toISOString(), total: 0, abertos: 0, vencidos: 0, truncado: { itens: false, comentarios: false }, flag: { campo: !!cf }, orfasLabel: 0, idx: 0 };
  let issues = []; let cortou = false;
  if (resolvidos) {
    const r = await jiraSearchAll({ jql: `labels = "${BQ_LABEL_HIST}" AND updated >= -30d ORDER BY updated DESC`, fields: campos, pageSize: 60, maxPages: 1 });
    issues = r.issues; cortou = r.truncado;
  } else {
    const jql = (comFlag) => `(labels = "${BQ_LABEL_ABERTO}"${comFlag ? ` OR cf[${num}] is not EMPTY` : ''}) AND statusCategory != Done ORDER BY updated DESC`;
    let r;
    try { r = await jiraSearchAll({ jql: jql(!!cf), fields: campos, pageSize: 100, maxPages: 2 }); }
    catch (e) {
      if (!cf || !/Jira 400/.test(String(e && e.message))) throw e;
      meta.flag.erro = true;
      r = await jiraSearchAll({ jql: jql(false), fields: campos, pageSize: 100, maxPages: 2 });
    }
    issues = r.issues; cortou = r.truncado;
  }
  if (issues.length > BQ_MAX_ITENS) { issues = issues.slice(0, BQ_MAX_ITENS); cortou = true; }
  meta.truncado.itens = cortou;
  // Índice de reserva: tickets cuja label não pôde ser gravada
  const tem = new Set(issues.map((i) => i.key));
  if (!resolvidos) {
    const idx = await bqIdxLe();
    const faltam = Object.keys(idx).filter((k) => !tem.has(k)).slice(0, 30);
    meta.idx = Object.keys(idx).length;
    const sai = [];
    for (let i = 0; i < faltam.length; i += 6) {
      await Promise.all(faltam.slice(i, i + 6).map(async (k) => {
        try {
          const r = await F(`${jiraBase()}/rest/api/3/issue/${encodeURIComponent(k)}?fields=${campos.join(',')}`, { headers: hdrSvc() });
          if (r.status === 404) { sai.push(k); return; }
          if (!r.ok) return;
          const it = await r.json();
          if (((it.fields || {}).status || {}).statusCategory && it.fields.status.statusCategory.key === 'done') return;
          issues.push(it);
        } catch (e) { /* o índice é reserva: falha não derruba a lista */ }
      }));
    }
    if (sai.length) await bqIdxMuda({ remove: sai });
  }
  // Comentários de cada ticket (8 por vez) → estado
  const itens = [];
  const limite = hoje;
  for (let i = 0; i < issues.length; i += 8) {
    await Promise.all(issues.slice(i, i + 8).map(async (it) => {
      let est; let erroComent = false;
      try { const c = await bqComentarios(it.key); est = bqEstado(c.lista); if (c.truncado) meta.truncado.comentarios = true; }
      catch (e) { est = { bloqueios: [], orfaos: 0 }; erroComent = true; meta.truncado.comentarios = true; }
      const f = it.fields || {};
      const flag = !!(cf && flagLigado(f[cf]));
      const abertos = bqAbertos(est);
      if (resolvidos) {
        const rs = est.bloqueios.filter((b) => b.st === 'resolvido' && b.resolvidoDia >= addDias(limite, -30));
        if (rs.length) itens.push({ ...bqItem(it, { bloqueios: rs, orfaos: est.orfaos }, cf), ...(erroComent ? { erroComent: true } : {}) });
        return;
      }
      if (abertos.length) itens.push({ ...bqItem(it, est, cf), ...(erroComent ? { erroComent: true } : {}) });
      else if (erroComent) itens.push({ ...bqItem(it, est, cf), erroComent: true });
      else if (flag) itens.push(bqItem(it, { bloqueios: [], orfaos: est.orfaos }, cf, { semRegistro: true }));
      else meta.orfasLabel += 1;
    }));
  }
  itens.sort((a, b) => {
    const ba = bqAbertos(a.bloqueios).sort((x, y) => bqOrdem(x, y, hoje))[0]; const bb = bqAbertos(b.bloqueios).sort((x, y) => bqOrdem(x, y, hoje))[0];
    if (ba && bb) return bqOrdem(ba, bb, hoje);
    return ba ? -1 : (bb ? 1 : String(a.k).localeCompare(String(b.k)));
  });
  meta.total = itens.length;
  itens.forEach((it) => { bqAbertos(it.bloqueios).forEach((b) => { meta.abertos += 1; if (bqVencido(b, hoje)) meta.vencidos += 1; }); });
  return { itens, meta };
}

// ===========================================================================
// Jira (escrita com o token da pessoa) + avisos
// ===========================================================================
const NIVEL_TIT = { crit: 'Bloqueio crítico', imp: 'Bloqueio importante', cien: 'Ciência de bloqueio' };
function mensagensAviso({ acao, b, issue, resumo, atorNome, painel }) {
  const link = `${painel}/?v=bloqueios&bqk=${encodeURIComponent(issue)}`;
  const tit = acao === 'resolver' ? `✅ Bloqueio destravado em ${issue}` : acao === 'atualizar' ? `📝 Bloqueio atualizado em ${issue}`
    : acao === 'reabrir' ? `🔁 Bloqueio reaberto em ${issue}` : `${b.nivel === 'cien' ? '🔵' : '⛔'} ${NIVEL_TIT[b.nivel] || 'Bloqueio'} em ${issue}`;
  const nv = BQ_NIVEL_INFO[b.nivel] || BQ_NIVEL_INFO.imp;
  const corpoTxt = acao === 'resolver' ? b.resolucao : (b.texto || '');
  const linhas = [`**${issue}**${resumo ? ` — ${resumo}` : ''}`, `${nv.ic} ${nv.rot} · quem destrava: ${quemTxt(b.quem)}${b.prazo ? ` · prazo ${ddmm(b.prazo)}` : ''}`,
    `${acao === 'resolver' ? 'Destravado' : (acao === 'atualizar' ? 'Atualizado' : 'Registrado')} por ${atorNome}`];
  if (corpoTxt) linhas.push(corta(corpoTxt, 200));
  const texto = `${linhas.join('\n\n')}\n\n[Abrir no painel](${link})`;
  const teams = () => ({
    issue, titulo: tit, texto,
    cartao: { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
      body: [{ type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: tit }, { type: 'TextBlock', wrap: true, text: texto }] } }] },
  });
  const verbo = acao === 'resolver' ? 'destravado' : (acao === 'atualizar' ? 'atualizado' : (acao === 'reabrir' ? 'reaberto' : 'registrado'));
  const ptit = acao === 'resolver' ? `✅ Bloqueio destravado · ${issue}` : acao === 'atualizar' ? `📝 Bloqueio atualizado · ${issue}`
    : acao === 'reabrir' ? `🔁 Bloqueio reaberto · ${issue}` : `${b.nivel === 'cien' ? '🔵 Ciência de bloqueio' : (b.nivel === 'crit' ? '⛔ Bloqueio crítico' : '⛔ Bloqueio importante')} · ${issue}`;
  const push = (p) => {
    const depende = quemIds(b.quem).includes(p.accountId);
    return { titulo: ptit, corpo: `${depende ? 'Depende de você' : 'Bloqueio'}${b.prazo ? ` até ${ddmm(b.prazo)}` : ''} — ${verbo} por ${atorNome}.`, url: `/?v=bloqueios&bqk=${encodeURIComponent(issue)}`, tag: `bloq-${issue}-${b.id}` };
  };
  return { teams, push };
}
async function bqAvisa({ acao, id, antes, estNovo, ticket, ator, issue, painel, resumo }) {
  const b = estNovo.bloqueios.find((x) => x.id === id);
  if (!b) return { teams: 0, push: 0 };
  const quemAntes = antes ? quemIds(antes.quem) : [];
  const novos = quemIds(b.quem).filter((a) => !quemAntes.includes(a));
  let cfg = null; let usuarios = {};
  try { usuarios = await (BQ_DEPS.usuarios || jiraUsuariosAtivos)(); } catch (e) { usuarios = {}; }
  const evento = { acao, id, nivelAntes: antes && antes.nivel, novos: acao === 'atualizar' ? novos : [] };
  const precisaCfg = BQ_CRITICO_AVISA_GERENTE && b.nivel === 'crit' && (acao === 'abrir' || acao === 'reabrir' || acao === 'atualizar');
  if (precisaCfg) { try { cfg = await (BQ_DEPS.cfg || configCompartilhada)(); } catch (e) { cfg = null; } }
  const ids = bqDestinatarios(evento, estNovo, ticket, ator.accountId, cfg, usuarios);
  if (!ids.length) return { teams: 0, push: 0 };
  const pessoas = ids.map((a) => pessoaDe(a, usuarios));
  const m = mensagensAviso({ acao, b, issue, resumo, atorNome: ator.displayName || 'alguém', painel });
  const r = await (BQ_DEPS.notifica || notificaPessoas)(pessoas, m.teams, { tipo: 'bloqueios', push: m.push });
  return { teams: (r && r.teams && r.teams.enviados) || 0, push: (r && r.push && r.push.enviados) || 0 };
}

const mesmoQuem = (a, b) => {
  if (!a || !b) return false;
  if (a.tipo !== b.tipo) return false;
  if (a.tipo === 'cliente') return String(a.nome) === String(b.nome);
  const x = quemIds(a).sort().join(','); const y = (b.pessoas || []).map((p) => (typeof p === 'string' ? p : p.a)).sort().join(',');
  return x === y;
};

/** Escreve UM evento de bloqueio no ticket com o token da pessoa (headers) e reconcilia label + flag + avisos. → { ok, http?, … } */
export async function bqEscreve({ issue, acao, dados, headers, base, ehInterno, painel }) {
  const hoje = bqHoje();
  const v = bqValida(acao, dados, hoje);
  if (v.erro) return { ok: false, http: 400, erro: v.erro };
  const d = v.dados;
  if (!RE_ISSUE.test(String(issue || ''))) return { ok: false, http: 400, erro: 'Ticket inválido.' };
  const b0 = base || jiraBase();
  const enc = encodeURIComponent(issue);
  const cf = await bqCampoFlag();
  const campos = cf ? [...CAMPOS_BASE, cf] : CAMPOS_BASE;
  const semPerm = { ok: false, erro: 'Sem permissão — token inválido/expirado ou sem acesso ao projeto.' };
  let rm; let rc; let ri;
  try {
    [rm, rc, ri] = await Promise.all([
      F(`${b0}/rest/api/3/myself`, { headers }),
      bqComentarios(issue, headers, b0).then((x) => ({ ok: true, x }), (e) => ({ ok: false, status: e.status || 0, msg: String(e && e.message ? e.message : e) })),
      F(`${b0}/rest/api/3/issue/${enc}?fields=${campos.join(',')}`, { headers }),
    ]);
  } catch (e) { return { ok: false, erro: `Não consegui falar com o Jira: ${String(e && e.message ? e.message : e).slice(0, 120)}` }; }
  if (rm.status === 401 || rm.status === 403) return semPerm;
  if (!rm.ok) return { ok: false, erro: `Jira ${rm.status} ao identificar você.` };
  if (ri.status === 404 || (!rc.ok && rc.status === 404)) return { ok: false, erro: `Ticket ${issue} não encontrado.` };
  if (ri.status === 401 || ri.status === 403 || (!rc.ok && (rc.status === 401 || rc.status === 403))) return semPerm;
  if (!rc.ok) return { ok: false, erro: `Não consegui ler os comentários do ticket (${rc.msg.slice(0, 100)}).` };
  if (!ri.ok) return { ok: false, erro: `Jira ${ri.status} ao ler o ticket.` };
  const ator = await rm.json().catch(() => ({}));
  const it = await ri.json().catch(() => ({}));
  if (!ator.accountId) return semPerm;
  const f = it.fields || {};
  const labels = Array.isArray(f.labels) ? f.labels : [];
  const flagAtual = !!(cf && flagLigado(f[cf]));
  const est = bqEstado(rc.x.lista);
  const atual = est.bloqueios.find((b) => b.id === d.id) || null;
  const confl = (erro) => ({ ok: false, conflito: true, erro, estado: bqItem(it, est, cf), item: bqItem(it, est, cf) });
  let ja = false;
  if (acao === 'abrir') ja = !!atual;
  else if (acao === 'atualizar' || acao === 'resolver') {
    if (!atual) return confl('Bloqueio não encontrado neste ticket.');
    if (atual.st !== 'aberto') return confl(`Este bloqueio já foi resolvido por ${atual.resolvidoPor || 'alguém'} em ${ddmm(atual.resolvidoDia) || '—'}.`);
  } else if (acao === 'reabrir') {
    if (!atual) return confl('Bloqueio não encontrado neste ticket.');
    if (atual.st !== 'resolvido') return confl('Este bloqueio já está aberto.');
  }
  // ---- campos do evento ----
  let quemADF = null; let prazoADF = d.prazo; let nivelADF = d.nivel || (atual && atual.nivel) || 'imp';
  if (!ja) {
    if (d.quem && d.quem.tipo === 'time') {
      let us;
      try { us = await (BQ_DEPS.usuarios || jiraUsuariosAtivos)(); } catch (e) { return { ok: false, erro: 'Não consegui ler o time no Jira — tente de novo em instantes.' }; }
      const faltou = d.quem.pessoas.find((a) => !us[a]);
      if (faltou) return { ok: false, http: 400, erro: 'Pessoa não encontrada no time (confira se a conta está ativa no Jira).' };
      quemADF = { tipo: 'time', pessoas: d.quem.pessoas.map((a) => ({ a, nome: us[a].nome || a })) };
    } else if (d.quem) quemADF = d.quem;
    if (acao === 'atualizar') {
      if (quemADF && atual && mesmoQuem(atual.quem, quemADF)) quemADF = null;
      if (prazoADF && atual && prazoADF === atual.prazo) prazoADF = '';
      const mudouNivel = d.nivel && d.nivel !== atual.nivel;
      if (!quemADF && !prazoADF && !mudouNivel && !d.texto) return { ok: false, http: 400, erro: 'Nada mudou: altere o nível, quem destrava, o prazo ou escreva uma nota.' };
    }
  }
  let interno = false; let passoComent = { ok: true, ja: true };
  let estNovo = est;
  if (!ja) {
    interno = false;
    try { interno = typeof ehInterno === 'function' ? !!(await ehInterno()) && d.interno !== false : false; } catch (e) { interno = false; }
    const adf = bqMontaADF({ tipo: acao, id: d.id, nivel: nivelADF, quem: quemADF, prazo: prazoADF, texto: d.texto });
    const payload = { body: adf };
    if (interno) payload.properties = [{ key: 'sd.public.comment', value: { internal: true } }];
    let rp;
    try { rp = await F(`${b0}/rest/api/3/issue/${enc}/comment`, { method: 'POST', headers, body: JSON.stringify(payload) }); }
    catch (e) { return { ok: false, erro: `Não consegui falar com o Jira: ${String(e && e.message ? e.message : e).slice(0, 120)}` }; }
    if (rp.status === 401 || rp.status === 403) return { ok: false, erro: 'Sem permissão para comentar neste chamado.' };
    if (rp.status === 404) return { ok: false, erro: `Ticket ${issue} não encontrado.` };
    if (!rp.ok) { const t = await rp.text().catch(() => ''); return { ok: false, erro: `Jira ${rp.status}: ${t.slice(0, 300)}` }; }
    const cj = await rp.json().catch(() => ({}));
    const falso = { id: cj.id || `novo-${d.id}`, created: cj.created || agoraD().toISOString(), author: { displayName: ator.displayName || '', accountId: ator.accountId }, body: adf, ...(interno ? { jsdPublic: false } : {}) };
    estNovo = bqEstado(rc.x.lista.concat([falso]), { ordenar: false });
    passoComent = { ok: true };
  }
  // ---- reconciliar label e flag ----
  const des = bqDesejado(estNovo);
  // histórico truncado (> BQ_MAX_COMENT): pode haver bloqueio aberto que não foi lido — nunca tira a label nem o impedimento
  if (rc.x.truncado) { if (labels.includes(BQ_LABEL_ABERTO)) des.labelAberto = true; if (flagAtual) des.flag = true; }
  const passos = { comentario: passoComent, label: { ok: true }, flag: { ok: true } };
  const ops = [];
  if (!labels.includes(BQ_LABEL_HIST)) ops.push({ add: BQ_LABEL_HIST });
  if (des.labelAberto && !labels.includes(BQ_LABEL_ABERTO)) ops.push({ add: BQ_LABEL_ABERTO });
  if (!des.labelAberto && labels.includes(BQ_LABEL_ABERTO)) ops.push({ remove: BQ_LABEL_ABERTO });
  let labelOk = true; let labelFinal = labels.includes(BQ_LABEL_ABERTO);
  if (ops.length) {
    try {
      const r = await F(`${b0}/rest/api/3/issue/${enc}`, { method: 'PUT', headers, body: JSON.stringify({ update: { labels: ops } }) });
      if (r.ok) labelFinal = des.labelAberto;
      else { labelOk = false; const t = await r.text().catch(() => ''); passos.label = { ok: false, erro: `Jira ${r.status}: ${t.slice(0, 160)}` }; }
    } catch (e) { labelOk = false; passos.label = { ok: false, erro: String(e && e.message ? e.message : e).slice(0, 160) }; }
  } else labelFinal = des.labelAberto ? labels.includes(BQ_LABEL_ABERTO) : false;
  if (labelOk || !des.labelAberto) await bqIdxMuda({ remove: [issue] });
  else await bqIdxMuda({ add: [issue] });
  let flagFinal = flagAtual;
  if (!cf) passos.flag = { ok: false, motivo: 'sem-campo' };
  else if (flagAtual !== des.flag) {
    const tenta = async (valor) => F(`${b0}/rest/api/3/issue/${enc}`, { method: 'PUT', headers, body: JSON.stringify({ fields: { [cf]: valor } }) });
    try {
      let r = await tenta(des.flag ? [{ value: 'Impediment' }] : null);
      if (!r.ok && r.status === 400) {
        const em = await F(`${b0}/rest/api/3/issue/${enc}/editmeta`, { headers }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        const campo = em && em.fields && em.fields[cf];
        if (!campo) passos.flag = { ok: false, motivo: 'campo-fora-da-tela' };
        else if (des.flag && Array.isArray(campo.allowedValues) && campo.allowedValues[0] && campo.allowedValues[0].id) {
          r = await tenta([{ id: campo.allowedValues[0].id }]);
          if (!r.ok) passos.flag = { ok: false, motivo: 'erro', erro: `Jira ${r.status}` };
        } else passos.flag = { ok: false, motivo: 'erro', erro: 'Jira 400' };
      } else if (!r.ok) passos.flag = { ok: false, motivo: r.status === 401 || r.status === 403 ? 'sem-permissao' : 'erro', erro: `Jira ${r.status}` };
      if (passos.flag.ok) flagFinal = des.flag;
    } catch (e) { passos.flag = { ok: false, motivo: 'erro', erro: String(e && e.message ? e.message : e).slice(0, 120) }; }
  }
  // ---- avisos (teto de 6 s; nunca derruba a ação) ----
  passos.aviso = { teams: 0, push: 0 };
  if (!ja) {
    const ticket = { respId: (f.assignee && f.assignee.accountId) || '', p: (f.project && f.project.key) || String(issue).split('-')[0] };
    const ms = BQ_DEPS.avisoMs || BQ_AVISO_MS;
    let timer;
    const limite = new Promise((res) => { timer = setTimeout(() => res({ esgotou: true }), ms); });
    try {
      const r = await Promise.race([bqAvisa({ acao, id: d.id, antes: atual, estNovo, ticket, ator, issue, painel: painel || 'https://jirainsight.vercel.app', resumo: f.summary || '' }), limite]);
      if (r && r.esgotou) passos.aviso = { teams: 0, push: 0, tempoEsgotado: true }; else passos.aviso = { teams: r.teams, push: r.push };
    } catch (e) { passos.aviso = { teams: 0, push: 0, erro: true }; } finally { clearTimeout(timer); }
  }
  const item = bqItem(it, estNovo, cf, { flag: flagFinal, label: labelFinal });
  return { ok: true, issue, id: d.id, acao, interno, ...(ja ? { ja: true } : {}), passos, item };
}

// ===========================================================================
// Cron: lembretes e escalonamento
// ===========================================================================
function msgEscala(grupo, tipo, painel) {
  const itens = grupo.itens;
  const n = itens.length; const crit = itens.filter((x) => x.nivel === 'crit').length;
  const link = tipo === 'lemb' && n === 1 ? `/?v=bloqueios&bqk=${encodeURIComponent(itens[0].k)}` : '/?v=bloqueios&bqe=time&bqv=1';
  const tit = tipo === 'lemb' ? (n === 1 ? `⏰ Bloqueio vence hoje · ${itens[0].k}` : `⏰ ${n} bloqueios dependem de você`) : `⏰ ${n} ${n === 1 ? 'bloqueio com prazo vencido' : 'bloqueios com prazo vencido'}`;
  const ls = itens.slice(0, 10).map((x) => `${x.k} · ${(BQ_NIVEL_INFO[x.nivel] || {}).ic || ''} · ${x.quem} · prazo ${ddmm(x.prazo)}${x.dias > 0 ? ` (há ${x.dias} ${x.dias === 1 ? 'dia' : 'dias'})` : ''}`);
  if (n > 10) ls.push(`e mais ${n - 10}`);
  const texto = `${ls.join('\n\n')}\n\n[Abrir no painel](${painel}${link})`;
  const teams = () => ({ titulo: tit, texto, cartao: { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
    body: [{ type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: tit }, { type: 'TextBlock', wrap: true, text: texto }] } }] } });
  const push = () => (tipo === 'lemb'
    ? { titulo: n === 1 ? `⏰ Bloqueio vence hoje · ${itens[0].k}` : '⏰ Bloqueios vencem hoje', corpo: n === 1 ? 'O prazo para destravar é hoje.' : `${n} bloqueios dependem de você e o prazo é hoje.`, url: link, tag: 'bloq-lemb' }
    : { titulo: '⏰ Bloqueios com prazo vencido', corpo: `${n} ${n === 1 ? 'bloqueio' : 'bloqueios'} nos seus projetos passaram do prazo${crit ? ` — ${crit} ${crit === 1 ? 'crítico' : 'críticos'}` : ''}.`, url: link, tag: 'bloq-escala' });
  return { teams, push };
}
/** Fase do cron: lê a lista, calcula, envia (1 mensagem agregada por destinatário) e grava `bloq_estado`. Só contagens (e `detalhe` no dry). */
export async function bqEscalaRoda({ cfg, hoje, dry = false, deps = {}, painel } = {}) {
  const D = { ...BQ_DEPS, ...deps };
  const h = hoje || bqHoje();
  const base = painel || 'https://jirainsight.vercel.app';
  let lista;
  try { lista = await bqLista(); } catch (e) { return { ok: false, feito: false, erro: `leitura do Jira falhou: ${String(e && e.message ? e.message : e).slice(0, 160)}` }; }
  let linha;
  try { linha = await leLinha('bloq_estado'); } catch (e) { return { ok: false, feito: false, erro: `bloq_estado ilegível: ${String(e && e.message ? e.message : e).slice(0, 120)}` }; }
  let usuarios = {};
  try { usuarios = await (D.usuarios || jiraUsuariosAtivos)(); } catch (e) { usuarios = {}; }
  const erroComent = (lista.itens || []).some((x) => x && x.erroComent);
  // ticket com comentários ilegíveis vem sem bloqueios: não pode podar o dedupe dele nem contar a rodada como completa
  const r = bqEscalaCalcula({ itens: lista.itens, estado: (linha && linha.data) || {}, hoje: h, cfg: cfg || {}, usuarios, truncado: !!(lista.meta.truncado.itens || lista.meta.truncado.comentarios || erroComent) });
  const destinos = new Set([...r.lembretes, ...r.escalas].map((g) => g.para.accountId));
  const out = { ok: true, feito: true, dry: !!dry, abertos: r.conta.abertos, vencidos: r.conta.vencidos, lembrados: r.conta.lembrados, escalados: r.conta.escalados, destinatarios: destinos.size, falhas: 0, semCanal: false, truncado: !!lista.meta.truncado.itens };
  if (dry) {
    out.detalhe = { lembretes: r.lembretes.map((g) => ({ para: g.para.nome, itens: g.itens.map((x) => x.k) })), escalas: r.escalas.map((g) => ({ para: g.para.nome, itens: g.itens.map((x) => x.k) })) };
    return out;
  }
  const notifica = D.notifica || notificaPessoas;
  // Por chave (ticket#bloqueio), quem efetivamente recebeu: só o que chegou a ALGUÉM fica marcado no dedupe —
  // aviso que não saiu por nenhum canal volta a ser tentado (no próximo tique quando houver canal; senão, no próximo dia).
  const entregue = { lemb: new Set(), esc: new Set() }; const tentado = { lemb: new Set(), esc: new Set() }; const faltou = { lemb: new Set(), esc: new Set() };
  let algumCanal = false; let transitoria = false;
  const envia = async (grupos, tipo) => {
    if (!grupos.length) return;
    // UMA chamada por destinatário: o resultado do push vem só somado (enviados), então é assim que se sabe QUEM recebeu
    await Promise.all(grupos.map(async (g) => {
      g.itens.forEach((x) => tentado[tipo].add(`${x.k}#${x.id}`));
      let res = null;
      try {
        res = await notifica([g.para], () => msgEscala(g, tipo, base).teams(), { tipo: 'bloqueios', push: () => msgEscala(g, tipo, base).push() });
      } catch (e) { out.falhas += 1; transitoria = true; g.itens.forEach((x) => faltou[tipo].add(`${x.k}#${x.id}`)); return; }
      const t = res && res.teams; const ps = res && res.push;
      if (t && Array.isArray(t.falhas)) out.falhas += t.falhas.length;
      if (ps && ps.falhas) out.falhas += ps.falhas;
      const tOk = !!(t && Number(t.enviados) > 0); const pOk = !!(ps && Number(ps.enviados) > 0);
      if (tOk || pOk) { algumCanal = true; g.itens.forEach((x) => entregue[tipo].add(`${x.k}#${x.id}`)); return; }
      g.itens.forEach((x) => faltou[tipo].add(`${x.k}#${x.id}`));
      if (!t || t.erro || (Array.isArray(t.falhas) && t.falhas.length) || (ps && ps.falhas)) transitoria = true; else out.semCanal = true;
    }));
  };
  await envia(r.lembretes, 'lemb'); await envia(r.escalas, 'esc');
  const novo = r.novoEstado;
  const antes = (linha && linha.data) || {};
  ['lemb', 'esc'].forEach((tipo) => {
    tentado[tipo].forEach((ch) => {
      if (entregue[tipo].has(ch) && !faltou[tipo].has(ch)) return;   // alguém sem aviso = a chave volta a valer (quem recebeu pode receber de novo — melhor que perder)
      const velho = (antes[tipo] || {})[ch];
      if (velho) novo[tipo][ch] = velho; else delete novo[tipo][ch];
    });
  });
  void algumCanal;
  const igual = JSON.stringify({ e: novo.esc, l: novo.lemb }) === JSON.stringify({ e: ((linha && linha.data) || {}).esc || {}, l: ((linha && linha.data) || {}).lemb || {} });
  if (!igual || !(linha && linha.data)) {
    try {
      const g = await mutaLinha('bloq_estado', () => novo);
      if (!g.ok) return { ...out, ok: false, feito: false, erro: `não gravou bloq_estado: ${String(g.erro || 'Supabase não configurado').slice(0, 120)}` };
    } catch (e) { return { ...out, ok: false, feito: false, erro: `não gravou bloq_estado: ${String(e && e.message ? e.message : e).slice(0, 120)}` }; }
  }
  // comentário ilegível ou aviso que falhou de passagem: o dedupe do que saiu está gravado, mas a rodada não está completa —
  // ok:false mantém o cursor do cron parado e o próximo tique tenta só o que faltou
  if (erroComent || transitoria) return { ...out, ok: false, feito: false, erro: erroComent ? 'comentários de algum ticket não puderam ser lidos — tento de novo no próximo tique' : 'algum aviso não saiu — tento de novo no próximo tique' };
  return out;
}
