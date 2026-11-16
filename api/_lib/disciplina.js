// 🧭 DISCIPLINA DO TIME — fotos diárias à meia-noite (pedido do usuário, 2026-11-16: "crie alguns indicadores e esses indicadores sejam
// enviados juntos com o aviso que é enviado no teams diariamente: se existe algum ticket que fica de um dia para outro vencido, se a pessoa
// usou o menu meu dia para fazer seu planejamento diário; tire uma foto a meia noite desses indicadores todo dia; é importante mostrar a
// evolução disso com o passar do tempo").
//
// POR QUÊ uma FOTO: "ticket vencido que virou o dia" é o estado do Jira NAQUELE momento — reprogramar a data ou trocar o responsável depois
// apaga o rastro, então o número só existe se alguém o tirar na hora. O SERVIDOR fotografa (fase `disciplina` do ?cron=1 do api/teams.js, no
// tique que cai entre 00:00 e 05:59 de SP do dia seguinte ao dia útil D) e as telas só LEEM (GET /api/config?disc=1 e o bloco 🧭 do cartão
// do ranking). As funções de cálculo são PURAS; só `fotoDisc` e as de Supabase falam com a rede, e o Jira entra por `deps` trocáveis
// (DISC_DEPS nos testes) — o mesmo padrão de kpi.js e rentabFoto.js. Esta lib NÃO importa api/teams.js nem api/config.js (ciclo).
//
// ---------------------------------------------------------------------------------------
// FORMATO DA FOTO (v1) — contrato com o cartão do Teams (api/teams.js) e a aba 🧭 Disciplina do time (public/js/18d-disciplina.js)
// ---------------------------------------------------------------------------------------
// Linha própria `disc_<AAAA-MM-DD>` (D = o dia útil fotografado) em jirainsight_config — nunca na cfg 'default'. Sem e-mail, sem chave/título
// de ticket, sem texto de item do 📆 Hoje, sem nota do dia. Percentuais NÃO são gravados (quem lê calcula plan/esp). Nomes ficam (o cartão
// lista nomes e a aba precisa dar nome a quem saiu do time depois).
//   disc_<D> = {
//     v:1, dia:D, anterior:Dprev (dia útil anterior), fotoEm:<ISO UTC>, modo:'noite'|'recuperada'|'retro', cfgRev, truncado:bool,
//     time:{ esp, plan, cedo, fech, usou, itens, feitos, venc, novos, comVenc },     // venc/novos/comVenc = null no modo retro
//     fora:{ semResp, ausentes, outros } | null,                                      // vencidos FORA do público (não entram no total); null no retro
//     porPessoa:{ [accountId]:{ nome, esp:1, plan, cedo, fech, usou, itens, feitos, venc, novos, vmax, plH, feH } }   // venc/novos/vmax null no retro
//   }
// Público do dia (`discPublico`, a MESMA regra do ranking de apontamento): ativos do Jira − cfg.ocultos − ausentes em D − quem tem meta 0.
// (a) vencidos que viraram o dia: tickets com duedate <= D que estavam ABERTOS à meia-noite de D (a régua do card "⚠ Meus tickets vencidos" da
//     Início: todos os tipos, sem filtro de projeto). `novos` = com duedate > Dprev (viraram vencidos NESTA noite); `vmax` = idade em dias do mais
//     antigo (D+1 − menor duedate, teto 999). Sem responsável / ausente / fora do público ficam em `fora` e fora dos totais.
// (b) planejou o dia no 📆 Hoje: carimbo `plan1` (do SERVIDOR, 1ª vez que a linha dia_<a>_<D> foi gravada planejada) ou, na falta, `planejadoEm`
//     (cliente); conta quando o dia SP do carimbo é <= D E o dia tem ≥ 1 item sem `movido`. `cedo` = plan e (carimbo em dia < D ou hora SP <= 12:00).
//     `usou` = linha com ≥ 1 item sem `movido` (mesmo em rascunho). `plH` = 'HH:MM' SP do carimbo quando é do dia D · 'antes' (dia anterior) · ''.
// (c) fechou o dia (🌙): carimbo `fech1` (servidor) ou `fechadoEm` (cliente) com dia SP <= D. Quem fechou e reabriu continua contando.
//     Planejar/fechar no dia SEGUINTE não conta para D. `feH` = 'HH:MM' SP do carimbo.
// MODOS: `noite` = o tique caiu em D+1 entre 00:00 e 05:59 SP · `recuperada` = depois disso e até 23:59 do próximo dia útil depois de D (a hora
// real fica em `fotoEm`) · `retro` = mais tarde: venc/novos/comVenc/vmax/fora = null (não se reconstrói o estado aberto/vencido de outro dia);
// planejou/fechou vêm dos carimbos, que são históricos. A foto `retro` usa os usuários ativos e a cfg de HOJE como público do dia antigo
// (aproximação: o elenco histórico não existe). Nunca se rebaixa: noite(3) > recuperada(2) > retro(1); só `forcar` troca por uma pior.
// Retenção DISC_MAX=400 linhas (poda na gravação). Idempotente (upsert por id).
// Estado do agendador (teams_estado): `ultimaFotoDisc` = último dia útil fotografado pelo cron · `discRetro` = último dia em que o backfill retro
// terminou.
import { jiraSearchAll, jiraUsuariosAtivos } from './util.js';
import { addDias, ehUtilBR } from './rentab.js';
import { podaPrefixo, leCfgRev } from './rentabFoto.js';
import { veTudo, segundaDe, dataValida } from './semanal.js';

export const DISC_V = 1;
export const DISC_MAX = 400;                 // linhas guardadas (~18 meses de dias úteis)
export const RE_ID_DISC = /^disc_\d{4}-\d{2}-\d{2}$/;
export const DISC_PLAN_ATE = '12:00';        // "planejou cedo"
export const DISC_NOITE_ATE = '06:00';       // a foto "da meia-noite" vale até aqui (SP)
export const DISC_RETRO_DIAS = 30;           // o backfill retro olha até 30 dias úteis para trás
export const DISC_RETRO_TIQUE = 5;           // fotos retro por tique do cron
export const DISC_HOJE_DESDE = '2026-10-21'; // o 📆 Hoje nasceu nesse dia: nada de retro antes
export const DISC_MEDIA_DIAS = 7;            // média dos dias úteis anteriores no cartão
const TABELA = 'jirainsight_config';
const MODO_RANK = { noite: 3, recuperada: 2, retro: 1 };

// Ganchos de teste: o que for posto aqui vence as dependências padrão (os handlers de config/teams não recebem `deps`).
export const DISC_DEPS = {};
const depsPadrao = () => ({ jiraSearchAll, jiraUsuariosAtivos, leCfgRev, ...DISC_DEPS });

export const idDisc = (dia) => `disc_${dia}`;
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r1 = (x) => Math.round(x * 10) / 10;

// ===========================================================================
// Datas (todas em America/Sao_Paulo; o Brasil não tem horário de verão = UTC−3 fixo)
// ===========================================================================
const FMT_SP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function partesSP(iso) {
  let s = String(iso || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { dia: s, hora: '00:00' };
  if (!/T/.test(s)) return null;
  // O Jira devolve o fuso SEM dois-pontos ("…00.000+0000", "…-0300"): normaliza. Sem fuso nenhum = hora de SP (como o cliente grava).
  if (/[+-]\d{4}$/.test(s)) s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  else if (!/(Z|[+-]\d{2}:\d{2})$/.test(s)) s += '-03:00';
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const o = {}; FMT_SP.formatToParts(new Date(t)).forEach((p) => { o[p.type] = p.value; });
  return { dia: `${o.year}-${o.month}-${o.day}`, hora: `${o.hour}:${o.minute}` };
}
/** 'AAAA-MM-DD' (dia de SP) de um ISO; '' se inválido. ISO sem fuso é lido como hora de SP. */
export function discDiaSP(iso) { const p = partesSP(iso); return p ? p.dia : ''; }
/** 'HH:MM' (hora de SP) de um ISO; '' se inválido. */
export function discHoraSP(iso) { const p = partesSP(iso); return p ? p.hora : ''; }
/** Dia útil (seg–sex sem feriado BR + cfg.feriadosExtra − cfg.feriadosRemovidos). */
export function discEhUtil(dia, cfg) { return dataValida(dia) && ehUtilBR(dia, cfg || {}); }
/** O dia útil anterior a `dia`. */
export function discUtilAnterior(dia, cfg) { let d = addDias(dia, -1); for (let i = 0; i < 20 && !ehUtilBR(d, cfg || {}); i += 1) d = addDias(d, -1); return d; }
/** O dia útil seguinte a `dia`. */
export function discUtilSeguinte(dia, cfg) { let d = addDias(dia, 1); for (let i = 0; i < 20 && !ehUtilBR(d, cfg || {}); i += 1) d = addDias(d, 1); return d; }
/** O dia que o cron fotografa: o último dia útil ANTES de `hoje`. */
export function discAlvo(hoje, cfg) { return discUtilAnterior(hoje, cfg); }
/** `n` chaves terminando em `fim`: dias úteis (gran 'dia') ou segundas-feiras (gran 'sem'), em ordem cronológica. */
export function discChaves(gran, fim, n, cfg) {
  const out = [];
  if (gran === 'sem') { const seg = segundaDe(fim); if (!seg) return out; for (let i = n - 1; i >= 0; i -= 1) out.push(addDias(seg, -7 * i)); return out; }
  if (!dataValida(fim)) return out;
  let d = fim; if (!ehUtilBR(d, cfg || {})) d = discUtilAnterior(d, cfg);
  for (let i = 0; i < n; i += 1) { out.unshift(d); d = discUtilAnterior(d, cfg); }
  return out;
}
/**
 * O modo da foto do dia útil `dia` se tirada em `agoraIso`: noite (00:00–05:59 de D+1) · recuperada (até 23:59 do próximo dia útil depois de D) ·
 * retro (depois disso). Antes da meia-noite de D (o dia ainda não fechou) devolve 'noite' — quem chama confere `dia < hoje`.
 */
export function discModo(dia, agoraIso, cfg) {
  const p = partesSP(agoraIso); if (!p) return 'retro';
  const d1 = addDias(dia, 1);
  if (p.dia < d1) return 'noite';
  if (p.dia === d1 && p.hora < DISC_NOITE_ATE) return 'noite';
  return p.dia <= discUtilSeguinte(dia, cfg) ? 'recuperada' : 'retro';
}

// ===========================================================================
// Cálculo PURO
// ===========================================================================
const metaSegDe = (cfg, a) => Math.max(0, Number(((cfg || {}).metasPessoa || {})[a] != null ? cfg.metasPessoa[a] : (cfg || {}).metaGlobalH) || 0) * 3600;
const ausenteEm = (cfg, a, dia) => ((cfg || {}).ausencias || []).some((x) => x && x.a === a && dia >= x.de && dia <= x.ate);
/**
 * O público do dia — quem é "esperado": ativos do Jira − cfg.ocultos − ausentes em `dia` − quem tem meta 0. A MESMA regra do ranking de
 * apontamento do Teams (montaRanking usa esta função). `pessoas` = jiraUsuariosAtivos() = { accountId:{nome,email} }; a ordem das chaves se mantém.
 * @returns {Array<{a:string,nome:string,metaSeg:number}>}
 */
export function discPublico(cfg, pessoas, dia) {
  const ocultos = new Set((((cfg || {}).ocultos) || []).map((o) => o && o.a));
  return Object.keys(pessoas || {})
    .filter((a) => !ausenteEm(cfg, a, dia) && !ocultos.has(a))
    .map((a) => ({ a, nome: (pessoas[a] && pessoas[a].nome) || a, metaSeg: metaSegDe(cfg, a) }))
    .filter((x) => x.metaSeg > 0);
}
/**
 * Planejou / fechou o dia — a leitura de UMA linha `dia_<a>_<D>` (o `data` dela, ou null). Ver o cabeçalho para as regras.
 * @returns {{plan:number,cedo:number,fech:number,usou:number,itens:number,feitos:number,plH:string,feH:string}}
 */
export function discPlanoPessoa(row, dia) {
  const r = (row && typeof row === 'object') ? row : null;
  const ativos = r && Array.isArray(r.itens) ? r.itens.filter((i) => i && typeof i === 'object' && !i.movido) : [];
  const out = { plan: 0, cedo: 0, fech: 0, usou: ativos.length >= 1 ? 1 : 0, itens: ativos.length, feitos: ativos.filter((i) => i.feito).length, plH: '', feH: '' };
  if (!r) return out;
  const cp = r.plan1 || r.planejadoEm || '';
  const dp = discDiaSP(cp);
  if (dp && dp <= dia && ativos.length >= 1) {
    out.plan = 1;
    out.cedo = (dp < dia || discHoraSP(cp) <= DISC_PLAN_ATE) ? 1 : 0;
    out.plH = dp < dia ? 'antes' : discHoraSP(cp);
  }
  const cf = r.fech1 || r.fechadoEm || '';
  const df = discDiaSP(cf);
  if (df && df <= dia) { out.fech = 1; out.feH = discHoraSP(cf); }
  return out;
}
/**
 * Vencidos que viraram o dia. `issues` = [{ resp (accountId|''), venc ('AAAA-MM-DD'), done (bool), resolvidoEm (ISO) }] — a leitura já tem
 * duedate <= dia. Fora: done resolvido até o fim de D (já estava fechado à meia-noite) e quem não tem duedate. `publicoSet`/`ausentesSet` = Set de accountId.
 * @returns {{ porPessoa:{[a]:{venc:number,novos:number,vmax:number}}, fora:{semResp:number,ausentes:number,outros:number} }}
 */
export function discVencidos(issues, publicoSet, ausentesSet, dia, anterior) {
  const porPessoa = {}; const fora = { semResp: 0, ausentes: 0, outros: 0 };
  const idadeDe = (venc) => Math.min(999, Math.max(0, Math.round((Date.parse(`${addDias(dia, 1)}T12:00:00Z`) - Date.parse(`${venc}T12:00:00Z`)) / 86400000)));
  (issues || []).forEach((it) => {
    if (!it || !/^\d{4}-\d{2}-\d{2}$/.test(String(it.venc || '')) || it.venc > dia) return;
    if (it.done) { const rd = discDiaSP(it.resolvidoEm); if (!rd || rd <= dia) return; }
    const a = String(it.resp || '');
    if (!a) { fora.semResp += 1; return; }
    if (publicoSet && publicoSet.has(a)) {
      const p = porPessoa[a] || (porPessoa[a] = { venc: 0, novos: 0, vmax: 0 });
      p.venc += 1; if (it.venc > anterior) p.novos += 1;
      p.vmax = Math.max(p.vmax, idadeDe(it.venc));
    } else if (ausentesSet && ausentesSet.has(a)) fora.ausentes += 1;
    else fora.outros += 1;
  });
  return { porPessoa, fora };
}
/**
 * A foto v1 (pura). `linhasDia` = { accountId: data da linha dia_ } · `issues` = lista de discVencidos ou null (modo retro: sem vencidos).
 */
export function calculaDisc({ dia, anterior, modo, fotoEm, cfgRev, cfg, pessoas, linhasDia, issues, truncado } = {}) {
  const publico = discPublico(cfg, pessoas, dia);
  const semVenc = modo === 'retro' || !Array.isArray(issues);
  const publicoSet = new Set(publico.map((x) => x.a));
  const ausentesSet = new Set(Object.keys(pessoas || {}).filter((a) => ausenteEm(cfg, a, dia)));
  const V = semVenc ? null : discVencidos(issues, publicoSet, ausentesSet, dia, anterior);
  const t = { esp: publico.length, plan: 0, cedo: 0, fech: 0, usou: 0, itens: 0, feitos: 0, venc: semVenc ? null : 0, novos: semVenc ? null : 0, comVenc: semVenc ? null : 0 };
  const porPessoa = {};
  publico.forEach(({ a, nome }) => {
    const pl = discPlanoPessoa((linhasDia || {})[a] || null, dia);
    const v = V ? (V.porPessoa[a] || { venc: 0, novos: 0, vmax: 0 }) : null;
    porPessoa[a] = {
      nome, esp: 1, plan: pl.plan, cedo: pl.cedo, fech: pl.fech, usou: pl.usou, itens: pl.itens, feitos: pl.feitos,
      venc: v ? v.venc : null, novos: v ? v.novos : null, vmax: v ? v.vmax : null, plH: pl.plH, feH: pl.feH,
    };
    ['plan', 'cedo', 'fech', 'usou', 'itens', 'feitos'].forEach((k) => { t[k] += pl[k]; });
    if (v) { t.venc += v.venc; t.novos += v.novos; if (v.venc > 0) t.comVenc += 1; }
  });
  return {
    v: DISC_V, dia, anterior, fotoEm, modo, cfgRev: String(cfgRev || ''), truncado: !!truncado,
    time: t, fora: V ? V.fora : null, porPessoa,
  };
}

const SOMA = ['esp', 'plan', 'cedo', 'fech', 'usou', 'itens', 'feitos'];
/** O bloco `disc` de UM dia (contrato do rec) a partir da foto e da foto do dia útil anterior (para o `saiu`). */
function blocoDia(foto, ant) {
  const t = foto.time || {};
  const bom = !!(ant && ant.time && ant.modo !== 'retro' && foto.modo !== 'retro');
  const saiuDe = (prev, atual) => (bom && prev && prev.venc != null && atual && atual.venc != null && atual.novos != null
    ? Math.max(0, prev.venc + atual.novos - atual.venc) : null);
  const porPessoa = {};
  Object.entries(foto.porPessoa || {}).forEach(([a, p]) => {
    porPessoa[a] = {
      nome: p.nome, esp: p.esp, plan: p.plan, cedo: p.cedo, fech: p.fech, usou: p.usou, itens: p.itens, feitos: p.feitos,
      venc: p.venc, novos: p.novos, saiu: saiuDe(((ant && ant.porPessoa) || {})[a], p), plH: p.plH || '', feH: p.feH || '',
    };
  });
  return {
    esp: t.esp, plan: t.plan, cedo: t.cedo, fech: t.fech, usou: t.usou, itens: t.itens, feitos: t.feitos,
    venc: t.venc, novos: t.novos, saiu: saiuDe(ant && ant.time, t), comVenc: t.comVenc, fora: foto.fora || null, porPessoa,
  };
}
/**
 * O bloco `disc` de uma SEMANA a partir das fotos dela (cronológicas): esp/plan/cedo/fech/usou/itens/feitos/novos/saiu = SOMA (viram pessoas-dia);
 * venc, comVenc e fora = os da última foto NÃO retro (estoque); por pessoa idem (esp = dias em que esteve no público). `opts.anteriorDe(foto)` dá a
 * foto do dia útil anterior (para o `saiu`; padrão: a que está na própria lista).
 */
export function discAgrega(fotos, opts) {
  const lista = (fotos || []).filter((f) => f && f.time);
  const mapa = {}; lista.forEach((f) => { mapa[f.dia] = f; });
  const anteriorDe = (opts && opts.anteriorDe) || ((f) => mapa[f.anterior] || null);
  const blocos = lista.map((f) => blocoDia(f, anteriorDe(f)));
  const out = { esp: 0, plan: 0, cedo: 0, fech: 0, usou: 0, itens: 0, feitos: 0, venc: null, novos: null, saiu: null, comVenc: null, fora: null, porPessoa: {} };
  const somaNN = (k) => { let s = null; blocos.forEach((b) => { if (b[k] != null) s = (s || 0) + b[k]; }); return s; };
  SOMA.forEach((k) => { out[k] = blocos.reduce((s, b) => s + num(b[k]), 0); });
  out.novos = somaNN('novos'); out.saiu = somaNN('saiu');
  let iUlt = -1; lista.forEach((f, i) => { if (f.modo !== 'retro') iUlt = i; });
  if (iUlt >= 0) { out.venc = blocos[iUlt].venc; out.comVenc = blocos[iUlt].comVenc; out.fora = blocos[iUlt].fora; }
  blocos.forEach((b, i) => {
    Object.entries(b.porPessoa).forEach(([a, p]) => {
      const o = out.porPessoa[a] || (out.porPessoa[a] = { nome: p.nome, esp: 0, plan: 0, cedo: 0, fech: 0, usou: 0, itens: 0, feitos: 0, venc: null, novos: null, saiu: null });
      o.nome = p.nome;
      SOMA.forEach((k) => { o[k] += num(p[k]); });
      if (p.novos != null) o.novos = (o.novos || 0) + p.novos;
      if (p.saiu != null) o.saiu = (o.saiu || 0) + p.saiu;
      if (lista[i].modo !== 'retro' && p.venc != null) o.venc = p.venc;
    });
  });
  return out;
}
/**
 * Os `rec`s que a tela consome: um por chave (dia útil ou segunda-feira), na ordem de `chaves`. `fotos` = fotos lidas (qualquer ordem; podem incluir
 * 1 anterior à primeira chave, para o `saiu`). Chave sem foto → { vazio:true, disc:null }.
 * @param {{gran:'dia'|'sem', chaves:string[], fotos:object[], anteriorDe?:function}} a
 */
export function discRecs({ gran, chaves, fotos, anteriorDe } = {}) {
  const lista = (fotos || []).filter((f) => f && f.time && f.dia);
  const mapa = {}; lista.forEach((f) => { mapa[f.dia] = f; });
  const antDe = anteriorDe || ((f) => mapa[f.anterior] || null);
  return (chaves || []).map((chave) => {
    if (gran === 'sem') {
      const ate = addDias(chave, 6);
      const doPeriodo = lista.filter((f) => f.dia >= chave && f.dia <= ate).sort((a, b) => (a.dia < b.dia ? -1 : 1));
      const base = { chave, gran, de: chave, ate, parcial: false };
      if (!doPeriodo.length) return { ...base, dias: 0, modo: '', vazio: true, disc: null };
      const modos = [...new Set(doPeriodo.map((f) => f.modo))];
      return { ...base, dias: doPeriodo.length, modo: modos.length === 1 ? modos[0] : 'misto', disc: discAgrega(doPeriodo, { anteriorDe: antDe }) };
    }
    const f = mapa[chave];
    const base = { chave, gran: 'dia', de: chave, ate: chave, parcial: false };
    if (!f) return { ...base, dias: 0, modo: '', vazio: true, disc: null };
    return { ...base, dias: 1, modo: f.modo, disc: blocoDia(f, antDe(f)) };
  });
}
/**
 * Compara a foto do dia com as anteriores (até 7, MAIS RECENTE PRIMEIRO) para o cartão do Teams: contra a foto anterior mais recente com o valor
 * (vencidos pulam as `retro`) e a média das anteriores (só com ≥ 3 fotos; senão null). `dAnt` = v − valor anterior; em plan/fech a unidade é
 * 'pessoas' quando o público (esp) é igual nos dois dias, senão 'pp' (pontos percentuais).
 */
export function discCompara(foto, anteriores) {
  const ants = (anteriores || []).filter((f) => f && f.time).slice(0, DISC_MEDIA_DIAS);
  const t = (foto && foto.time) || {};
  const pct = (n, e) => (e > 0 ? Math.round((100 * n) / e) : null);
  // vencidos
  const vencAnts = ants.filter((f) => f.time.venc != null);
  const antV = vencAnts[0] || null;
  const venc = { v: t.venc == null ? null : t.venc, antDia: antV ? antV.dia : '', dAnt: (t.venc != null && antV) ? t.venc - antV.time.venc : null, media: null, n: vencAnts.length };
  if (venc.n >= 3) venc.media = r1(vencAnts.reduce((s, f) => s + f.time.venc, 0) / venc.n);
  const bloco = (k) => {
    const esp = num(t.esp); const v = num(t[k]); const p = pct(v, esp);
    const ok = ants.filter((f) => num(f.time.esp) > 0);
    const ant = ok[0] || null;
    const o = { v, esp, pct: p, antDia: ant ? ant.dia : '', dAnt: null, unidade: 'pessoas', media: null, n: ok.length };
    if (ant && p != null) {
      if (num(ant.time.esp) === esp) { o.dAnt = v - num(ant.time[k]); o.unidade = 'pessoas'; }
      else { o.dAnt = p - pct(num(ant.time[k]), num(ant.time.esp)); o.unidade = 'pp'; }
    }
    if (o.n >= 3) o.media = Math.round(ok.reduce((s, f) => s + pct(num(f.time[k]), num(f.time.esp)), 0) / o.n);
    return o;
  };
  return { diaAnt: ants[0] ? ants[0].dia : '', venc, plan: bloco('plan'), fech: bloco('fech') };
}
/**
 * Recorte por papel: gestor/negócio/diretoria/admin veem o rec inteiro; os demais recebem os totais do time e só a PRÓPRIA linha em porPessoa.
 * Devolve um rec NOVO (não muda o original).
 */
export function recorteDisc(rec, { papeis, accountId } = {}) {
  if (!rec || !rec.disc || veTudo(papeis)) return rec;
  const a = String(accountId || '');
  const eu = (rec.disc.porPessoa || {})[a];
  return { ...rec, disc: { ...rec.disc, porPessoa: eu ? { [a]: eu } : {} } };
}
/**
 * Dias úteis que ainda não têm foto, do mais recente para o mais antigo, entre max(DISC_HOJE_DESDE, 30 dias úteis atrás) e o dia ANTERIOR ao alvo
 * (o alvo é o da fase principal). `existentes` = Set/array de dias que já têm foto.
 */
export function discPendentesRetro({ hoje, cfg, existentes } = {}) {
  const tem = new Set(existentes ? [...existentes] : []);
  const out = [];
  let d = discAlvo(hoje, cfg);
  for (let i = 0; i < DISC_RETRO_DIAS; i += 1) {
    d = discUtilAnterior(d, cfg);
    if (d < DISC_HOJE_DESDE) break;
    if (!tem.has(d)) out.push(d);
  }
  return out;
}

// ===========================================================================
// Supabase: linhas próprias da jirainsight_config (o GET /api/config só devolve `default`)
// ===========================================================================
function sbDe(sb) {
  if (sb && sb.base && sb.headers) return { base: sb.base, headers: { 'Content-Type': 'application/json', ...sb.headers } };
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
async function sbRows(r, rot) { if (!r.ok) throw new Error(`Supabase ${r.status} (${rot}): ${(await r.text()).slice(0, 200)}`); return r.json(); }

/** As linhas `dia_<accountId>_<D>` do dia D: { accountId: data }. (Limite 500 linhas — o time tem ~30 pessoas.) */
export async function leLinhasDia(dia, sb) {
  const S = sbDe(sb); if (!S) return {};
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.dia_*_${dia}&select=id,data&limit=500`, { headers: S.headers }), 'ler o dia do time');
  const out = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const m = /^dia_(.+)_(\d{4}-\d{2}-\d{2})$/.exec(String((r && r.id) || ''));
    if (m && m[2] === dia && r.data && typeof r.data === 'object') out[m[1]] = r.data;
  });
  return out;
}
async function modoExistente(dia, sb) {
  const S = sbDe(sb); if (!S) return '';
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=eq.${idDisc(dia)}&select=modo:data->modo`, { headers: S.headers }), 'ler a foto de disciplina');
  const m = Array.isArray(rows) && rows[0] ? rows[0].modo : '';
  return MODO_RANK[m] ? m : '';
}
/**
 * Grava (upsert) a foto em `disc_<D>` e poda a retenção. NUNCA rebaixa (noite > recuperada > retro): se já existe uma foto de modo igual ou
 * melhor devolve { mantida:true } sem gravar — salvo `forcar:true` (só a rota manual).
 */
export async function gravaDisc(foto, sb, { forcar = false } = {}) {
  const S = sbDe(sb); if (!S) throw new Error('Supabase não configurado — as fotos de disciplina precisam dele.');
  if (!foto || foto.v !== DISC_V || !RE_ID_DISC.test(idDisc(foto.dia || '')) || !MODO_RANK[foto.modo]) throw new Error('Foto de disciplina inválida (v/dia/modo).');
  const id = idDisc(foto.dia);
  if (!forcar) {
    const atual = await modoExistente(foto.dia, sb);
    if (atual && MODO_RANK[atual] >= MODO_RANK[foto.modo]) return { id, gravada: false, mantida: true, modoAtual: atual };
  }
  const r = await fetch(`${S.base}/rest/v1/${TABELA}?on_conflict=id`, {
    method: 'POST', headers: { ...S.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id, data: foto, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} (gravar foto de disciplina): ${(await r.text()).slice(0, 200)}`);
  const poda = await podaPrefixo('disc_', DISC_MAX, RE_ID_DISC, sb);
  return { id, gravada: true, mantida: false, ...poda };
}
/** As `n` fotos mais recentes até o dia `ate` (inclusive), em ordem CRONOLÓGICA. */
export async function leDisc({ ate, n } = {}, sb) {
  const S = sbDe(sb); if (!S) return [];
  const lim = Math.max(1, Math.min(DISC_MAX, Math.floor(Number(n)) || 30));
  const teto = dataValida(ate || '') ? `&id=lte.${idDisc(ate)}` : '';
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.disc_*${teto}&select=id,data&order=id.desc&limit=${lim}`, { headers: S.headers }), 'ler fotos de disciplina');
  return (Array.isArray(rows) ? rows : []).filter((x) => RE_ID_DISC.test(String(x.id || '')) && x.data && x.data.v === DISC_V && x.data.dia === String(x.id).slice(5))
    .map((x) => x.data).sort((a, b) => (a.dia < b.dia ? -1 : 1));
}
/** Uma foto pelo dia — null se não existe. */
export async function leUmDisc(dia, sb) {
  const S = sbDe(sb); if (!S) return null;
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=eq.${idDisc(dia)}&select=data`, { headers: S.headers }), 'ler foto de disciplina');
  const d = Array.isArray(rows) && rows[0] && rows[0].data;
  return (d && d.v === DISC_V) ? d : null;
}
/** Os dias que já têm foto (leve: só o id), de `desde` em diante: Set('AAAA-MM-DD'). */
export async function leIdsDisc(desde, sb) {
  const S = sbDe(sb); const out = new Set();
  if (!S) return out;
  const piso = dataValida(desde || '') ? `&id=gte.${idDisc(desde)}` : '';
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.disc_*${piso}&select=id&order=id.desc&limit=${DISC_MAX + 10}`, { headers: S.headers }), 'listar fotos de disciplina');
  (Array.isArray(rows) ? rows : []).forEach((x) => { const id = String((x && x.id) || ''); if (RE_ID_DISC.test(id)) out.add(id.slice(5)); });
  return out;
}

// ===========================================================================
// Orquestração: a foto de UM dia útil (NÃO lança)
// ===========================================================================
/**
 * Fotografa o dia útil `dia` (já fechado): usuários ativos + as linhas dia_ + (fora do modo retro) UMA busca de vencidos no Jira, e grava `disc_<dia>`.
 * Modo retro NÃO consulta o Jira. `dry` calcula e devolve a `foto` sem gravar. `forcar` permite trocar uma foto melhor por uma pior.
 * @returns {Promise<{ok:boolean, dia:string, modo?:string, gravada?:boolean, mantida?:boolean, time?:object, truncado?:boolean, ms:number, foto?:object, erro?:string}>}
 */
export async function fotoDisc({ cfg, dia, agora, sb, dry = false, forcar = false, deps } = {}) {
  const t0 = Date.now();
  const falha = (erro) => ({ ok: false, dia: String(dia || ''), erro: String(erro && erro.message ? erro.message : erro).slice(0, 300), ms: Date.now() - t0 });
  try {
    const D = { ...depsPadrao(), ...(deps || {}) };
    const agoraIso = agora || new Date().toISOString();
    if (!dataValida(dia)) return falha('dia inválido — use AAAA-MM-DD.');
    if (!ehUtilBR(dia, cfg || {})) return falha(`${dia} não é dia útil.`);
    const hojeSP = discDiaSP(agoraIso);
    if (dia >= hojeSP) return falha(`${dia} ainda não fechou — a foto só vale depois da meia-noite do dia.`);
    const modo = discModo(dia, agoraIso, cfg);
    if (!dry && !forcar) {
      const atual = await modoExistente(dia, sb);
      if (atual && MODO_RANK[atual] >= MODO_RANK[modo]) return { ok: true, dia, modo: atual, gravada: false, mantida: true, ms: Date.now() - t0 };
    }
    let cfgRev = ''; try { cfgRev = await D.leCfgRev(sb); } catch (e) { cfgRev = ''; }
    const anterior = discUtilAnterior(dia, cfg);
    const [pessoas, linhasDia] = await Promise.all([D.jiraUsuariosAtivos(), leLinhasDia(dia, sb)]);
    let issues = null; let truncado = false;
    if (modo !== 'retro') {
      const jql = `duedate <= "${dia}" AND (statusCategory != Done OR resolved >= "${addDias(dia, 1)}") ORDER BY duedate ASC`;
      const r = await D.jiraSearchAll({ jql, fields: ['duedate', 'assignee', 'status', 'issuetype', 'project', 'resolutiondate'], pageSize: 100, maxPages: 10 });
      truncado = !!(r && r.truncado);
      issues = ((r && r.issues) || []).map((it) => {
        const f = (it && it.fields) || {};
        return {
          resp: (f.assignee && f.assignee.accountId) || '', venc: String(f.duedate || '').slice(0, 10),
          done: !!(f.status && f.status.statusCategory && f.status.statusCategory.key === 'done'), resolvidoEm: f.resolutiondate || '',
        };
      });
    }
    const foto = calculaDisc({ dia, anterior, modo, fotoEm: agoraIso, cfgRev, cfg, pessoas, linhasDia, issues, truncado });
    if (dry) return { ok: true, dia, modo, gravada: false, mantida: false, time: foto.time, truncado: foto.truncado, foto, ms: Date.now() - t0 };
    const g = await gravaDisc(foto, sb, { forcar });
    return { ok: true, dia, modo: g.mantida ? g.modoAtual : modo, gravada: !!g.gravada, mantida: !!g.mantida, time: foto.time, truncado: foto.truncado, ms: Date.now() - t0 };
  } catch (e) { return falha(e); }
}
