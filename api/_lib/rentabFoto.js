// 📸 FOTOS DIÁRIAS E SEMANAIS DA 💹 RENTABILIDADE (pedido do usuário, 2026-11-02: "gravar um registro por dia e por semana").
// Fonte única dos números gravados: NADA é recalculado aqui — a foto usa os portes do painel em api/_lib/rentab.js (rpCalcResumo, rpPrevAte,
// rpVendEntre, rpPeriodosFat/rpFatAte, rpRealAte…), que o gate de paridade (scripts/check-rentab-paridade.mjs, em `npm run check`) confere contra
// o 17b. Por isso o número da foto de um dia é o MESMO que a tela mostraria naquele dia. Este arquivo só escolhe os planos, lê o Clockwork UMA vez,
// monta as linhas e grava. As funções de montagem são PURAS (montaFotoDia/montaFotoSemana); `rentabFotos` busca as fontes através de `deps`
// (trocáveis nos testes — mesmo padrão do montaFotoSemanal de semanal.js). Quem grava é o api/teams.js (fase `rentab` do cron de 30 min e
// `?tipo=rentab` manual) e quem lê é o api/config.js (`GET ?rentabhist=1`).
//
// ---------------------------------------------------------------------------------------
// FORMATO DAS LINHAS (v1) — contrato com a tela (public/js/17b-rentabilidade.js, seção 📈 Histórico)
// ---------------------------------------------------------------------------------------
// Linhas próprias da tabela jirainsight_config (`id`, `data`, `updated_at`) — NUNCA na cfg 'default' (que desce inteira para o navegador de todo o
// time; a foto tem custo e R$). Horas em HORAS DECIMAIS e R$ com 2 casas (a tela fala em horas, não em segundos como o semanal.js); percentuais
// não são gravados. Tudo é "até aquele dia" (acumulado desde o início do plano) ou "do próprio dia", como o nome diz.
//
// `rpdia_<AAAA-MM-DD>` — uma por DIA CORRIDO (sábado, domingo e feriado também: a semana soma 7 linhas), todos os planos juntos:
// { v:1, dia, fotoEm, cfgRev, truncado, falhas?:{[planoId]:'erro'},
//   planos:{ [planoId]:{
//     nome, projeto, cliente, clienteId, tipo:'horas|fechado|interno', st:'planejado|andamento|encerrado', inicio, fim,
//     vh, vhRef, fatBase:'vendido|apontado', fonteCiclo:'cliente|contrato|mes',
//     vendTot, vendAte, vendDia,                       // horas vendidas: no plano todo · até o dia · só no dia (rpVendEntre)
//     esfPrev, esfPrevAte, esfPrevDia,                 // esforço PREVISTO (exec + gestão + terceirizado): plano · até o dia · no dia
//     custoPrev, custoPrevAte, custoTercPrev,          // custo previsto do projeto (R$) · até o dia · parte do repasse interno
//     receitaPrev, receitaAte, fatAte,                 // receita prevista · reconhecida até o dia · FATURADO até o dia (por fatBase; fechado = marcos faturados)
//     realH, realHFat, realCusto, realCustoCons,       // apontado até o dia: horas · faturáveis · custo do projeto · custo consolidado (custo/h real)
//     realDia, realDiaFat, realDiaCusto,               // apontado no PRÓPRIO dia
//     tercH, tercRep,                                  // horas e custo (repasse) das pessoas com alocação terceirizada
//     margemAte,                                       // receita base − realCusto, como a tela: horas = fatAte · fechado/interno = receitaAte
//     deltaH, deltaR,                                  // vendido × gasto até o dia: vendAte − realH · × vhRef (valor-hora; fechado = valor ÷ horas vendidas)
//     pessoasDia:{[accountId]:h}, pessoasDiaCusto:{[accountId]:R$}, pessoasAte:{[accountId]:{h,custo}}   // só quem apontou (h > 0)
//   } } }
// `rpsem_<segunda>` — uma por SEMANA (seg → dom), gravada quando o lote cruza o DOMINGO (ou refeita se já existia) = a soma das `rpdia` da semana
// + o acumulado da última linha existente:
// { v:1, semana, ate:<domingo>, fotoEm, dias:<linhas rpdia usadas>, parcial:<dias < 7>,
//   planos:{ [planoId]:{ vendSem, realSem, realSemFat, custoSem, esfPrevSem, deltaH, deltaR,
//     pessoas:{[accountId]:{h,custo}}, dias:<linhas com o plano>,
//     fim:{ dia, vendAte, realH, realCusto, fatAte, margemAte } } } }
//
// O QUE ENTRA NA FOTO DE UM DIA: planos de cfg.rentab.planos COM projeto, início válido, que já começaram (início ≤ dia) e que não terminaram
// há mais de 30 dias (dia ≤ fim + 30). Dia sem plano nenhum não gera linha. O realizado é o do projeto do plano no Clockwork desde o início
// (no máximo 365 dias para trás — a mesma janela da tela) até o menor entre o dia e o fim do plano.
//
// ♻ IDEMPOTÊNCIA: refazer um dia recalcula das mesmas fontes e faz upsert na mesma linha (nunca duplica). A foto CONGELA o plano como ele
// estava configurado QUANDO foi tirada (alocação, valor-hora, ciclo do cliente…) e os apontamentos que existiam então; refazer um dia PASSADO à
// mão usa a config e o Clockwork DE HOJE — se alguém mexeu no plano ou lançou horas atrasadas, o número muda (de propósito: é a correção). O cron
// só avança: nunca refaz um dia que já fotografou.
//
// ✂ ARREDONDAMENTO: cada linha guarda 2 casas; a semana soma as linhas já arredondadas (diferença de no máximo 0,035 h em relação à conta exata).
// 🧹 RETENÇÃO: RPDIA_MAX (400) e RPSEM_MAX (104) linhas — a poda acontece na gravação (o id ordena por data).
// ⏱ ORÇAMENTO: no máximo RPFOTO_DIAS_MAX (10) dias por execução e UMA leitura do Clockwork, reaproveitada por todos os dias do lote.
// Estado do agendador (teams_estado): `ultimaFotoRentab` = último dia fotografado (AAAA-MM-DD).
import { worklogsEnriquecidos } from './util.js';
import { dataValida, segundaDe } from './semanal.js';
import {
  addDias, rpFim, rpStatusK, rpCalcResumo, rpPrevAte, rpVendEntre, rpCiclosDe, rpFatBase, rpCenarioDe, rpJanelaReal, rpRealAte,
} from './rentab.js';

export const RPFOTO_V = 1;
export const RPDIA_MAX = 400;          // ~13 meses de dias corridos
export const RPSEM_MAX = 104;          // 2 anos de semanas (como o SEMANAL_MAX)
export const RPFOTO_DIAS_MAX = 10;     // dias por execução (o cron tem 60 s)
export const RPFOTO_ENCERRADO_DIAS = 30;   // plano encerrado há mais que isto sai das fotos
const TABELA = 'jirainsight_config';
export const RE_ID_PLANO = /^rp[a-z0-9]+$/;
export const RE_ID_DIA = /^rpdia_\d{4}-\d{2}-\d{2}$/;
export const RE_ID_SEM = /^rpsem_\d{4}-\d{2}-\d{2}$/;
export const idDia = (dia) => `rpdia_${dia}`;
export const idSemana = (seg) => `rpsem_${seg}`;

const r2 = (x) => { const v = Math.round((Number(x) || 0) * 100) / 100; return v === 0 ? 0 : v; };   // sem -0
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** Os planos que entram na foto do dia: com projeto, id válido, início válido, já iniciados e não encerrados há mais de 30 dias. */
export function planosDoDia(cfg, dia) {
  const lista = (cfg && cfg.rentab && Array.isArray(cfg.rentab.planos)) ? cfg.rentab.planos : [];
  return lista.filter((p) => {
    if (!p || typeof p !== 'object' || !RE_ID_PLANO.test(String(p.id || ''))) return false;
    if (!String(p.projeto || '').trim() || !dataValida(p.inicio)) return false;
    if (dia < p.inicio) return false;
    return dia <= addDias(rpFim(p, dia), RPFOTO_ENCERRADO_DIAS);
  });
}
/** worklogs → Map(projeto → [worklog…]) preservando a ordem de leitura (a soma tem de sair na mesma ordem do painel). */
export function indexaPorProjeto(worklogs) {
  const m = new Map();
  (worklogs || []).forEach((w) => { if (!w || !w.p) return; if (!m.has(w.p)) m.set(w.p, []); m.get(w.p).push(w); });
  return m;
}
const mapaH = (src, f) => { const o = {}; Object.keys(src).forEach((a) => { if (src[a].h > 0) o[a] = f(src[a]); }); return o; };

// A foto de UM plano num dia (todos os números "até `dia`", exceto os que dizem "Dia").
function fotoPlano(p, dia, cfg, wls) {
  const hoje = dia;
  const cen = rpCenarioDe(p);
  const calc = rpCalcResumo(p, cen, cfg, hoje);
  const jan = rpJanelaReal(p, dia, hoje);
  const R = rpRealAte(p, calc, cen, wls, jan, cfg, hoje, dia);
  const ontem = addDias(dia, -1);
  const prevOntem = ontem < p.inicio ? 0 : rpPrevAte(p, calc, ontem, cfg).prevAteHoje;
  const dd = R.porDia[dia] || { h: 0, hFat: 0, custo: 0 };
  const vhRef = calc.tipo === 'fechado' ? (calc.vend > 0 ? calc.valorProj / calc.vend : 0) : calc.vh;   // o valor-hora do Δ (rpVgCalc do painel)
  const deltaH = R.vendAteHoje - R.h;
  return {
    nome: String(p.nome || ''), projeto: String(p.projeto), cliente: String(p.cliente || ''), clienteId: String(p.clienteId || ''),
    tipo: calc.tipo, st: rpStatusK(p, dia), inicio: p.inicio, fim: rpFim(p, hoje), vh: r2(calc.vh), vhRef: r2(vhRef),
    fatBase: rpFatBase(p), fonteCiclo: rpCiclosDe(p, cfg).fonte,
    vendTot: r2(calc.vend), vendAte: r2(R.vendAteHoje), vendDia: r2(rpVendEntre(p, dia, dia, cfg, hoje)),
    esfPrev: r2(calc.esforco), esfPrevAte: r2(R.prevAteHoje), esfPrevDia: r2(R.prevAteHoje - prevOntem),
    custoPrev: r2(calc.custo), custoPrevAte: r2(R.custoPrevAteHoje), custoTercPrev: r2(calc.custoTerc),
    receitaPrev: r2(calc.receita), receitaAte: r2(R.receitaAteHoje), fatAte: r2(R.receitaReal),
    realH: r2(R.h), realHFat: r2(R.hFat), realCusto: r2(R.custo), realCustoCons: r2(R.custoCons),
    realDia: r2(dd.h), realDiaFat: r2(dd.hFat), realDiaCusto: r2(dd.custo), tercH: r2(R.tercH), tercRep: r2(R.tercCusto),
    margemAte: r2(R.margemAteHoje), deltaH: r2(deltaH), deltaR: r2(deltaH * vhRef),
    pessoasDia: mapaH(R.pessoasDia, (x) => r2(x.h)), pessoasDiaCusto: mapaH(R.pessoasDia, (x) => r2(x.custo)),
    pessoasAte: mapaH(R.pessoas, (x) => ({ h: r2(x.h), custo: r2(x.custo) })),
  };
}
/**
 * A foto do DIA (linha `rpdia_<dia>`), pura: `worklogs` = lista do worklogsEnriquecidos (ou `porProjeto` já indexado, para reaproveitar entre dias).
 * null = nenhum plano entra neste dia. Um plano com dado ruim não derruba os outros: vai para `falhas`.
 */
export function montaFotoDia({ dia, cfg, worklogs, porProjeto, agora, cfgRev, truncado } = {}) {
  if (!dataValida(dia)) throw new Error(`Dia inválido: "${dia}".`);
  const C = cfg || {}; const idx = porProjeto || indexaPorProjeto(worklogs);
  const planos = {}; const falhas = {};
  planosDoDia(C, dia).forEach((p) => {
    try { planos[p.id] = fotoPlano(p, dia, C, idx.get(String(p.projeto)) || []); }
    catch (e) { falhas[p.id] = String(e && e.message ? e.message : e).slice(0, 160); }
  });
  if (!Object.keys(planos).length && !Object.keys(falhas).length) return null;
  const foto = { v: RPFOTO_V, dia, fotoEm: (agora ? new Date(agora) : new Date()).toISOString(), cfgRev: String(cfgRev || ''), truncado: !!truncado, planos };
  if (Object.keys(falhas).length) foto.falhas = falhas;
  return foto;
}
/**
 * A foto da SEMANA (linha `rpsem_<seg>`), pura: `linhas` = as `data` das `rpdia_` da semana (as de fora de seg..dom são ignoradas).
 * Semana = soma dos dias + o acumulado da última linha de cada plano. null = nenhuma linha utilizável.
 */
export function montaFotoSemana(seg, linhas, { agora } = {}) {
  if (!dataValida(seg)) throw new Error(`Semana inválida: "${seg}".`);
  const dom = addDias(seg, 6);
  const rows = (linhas || []).filter((r) => r && r.v === RPFOTO_V && typeof r.dia === 'string' && r.dia >= seg && r.dia <= dom && r.planos && typeof r.planos === 'object')
    .sort((a, b) => a.dia.localeCompare(b.dia));
  if (!rows.length) return null;
  const acc = {};
  rows.forEach((r) => Object.entries(r.planos).forEach(([id, P]) => {
    if (!P || typeof P !== 'object') return;
    const A = acc[id] = acc[id] || { vendSem: 0, realSem: 0, realSemFat: 0, custoSem: 0, esfPrevSem: 0, deltaR: 0, pessoas: {}, dias: 0, ult: null, ultDia: '' };
    A.vendSem += num(P.vendDia); A.realSem += num(P.realDia); A.realSemFat += num(P.realDiaFat); A.custoSem += num(P.realDiaCusto); A.esfPrevSem += num(P.esfPrevDia);
    A.deltaR += (num(P.vendDia) - num(P.realDia)) * num(P.vhRef);   // o valor-hora DE CADA DIA (a config pode ter mudado no meio da semana)
    Object.entries(P.pessoasDia || {}).forEach(([a, h]) => { const X = A.pessoas[a] = A.pessoas[a] || { h: 0, custo: 0 }; X.h += num(h); X.custo += num((P.pessoasDiaCusto || {})[a]); });
    A.dias += 1; A.ult = P; A.ultDia = r.dia;
  }));
  const planos = {};
  Object.entries(acc).forEach(([id, A]) => {
    const pessoas = {}; Object.keys(A.pessoas).forEach((a) => { pessoas[a] = { h: r2(A.pessoas[a].h), custo: r2(A.pessoas[a].custo) }; });
    planos[id] = { vendSem: r2(A.vendSem), realSem: r2(A.realSem), realSemFat: r2(A.realSemFat), custoSem: r2(A.custoSem), esfPrevSem: r2(A.esfPrevSem),
      deltaH: r2(A.vendSem - A.realSem), deltaR: r2(A.deltaR), pessoas, dias: A.dias,
      fim: { dia: A.ultDia, vendAte: num(A.ult.vendAte), realH: num(A.ult.realH), realCusto: num(A.ult.realCusto), fatAte: num(A.ult.fatAte), margemAte: num(A.ult.margemAte) } };
  });
  return { v: RPFOTO_V, semana: seg, ate: dom, fotoEm: (agora ? new Date(agora) : new Date()).toISOString(), dias: rows.length, parcial: rows.length < 7, planos };
}

// ---- Supabase: linhas próprias da jirainsight_config (o GET /api/config só devolve `default`) ----
function sbDe(sb) {
  if (sb && sb.base && sb.headers) return sb;
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
async function sbRows(r, rot) { if (!r.ok) throw new Error(`Supabase ${r.status} (${rot}): ${(await r.text()).slice(0, 200)}`); return r.json(); }
/** Upsert de várias linhas numa chamada só (merge-duplicates = refazer um dia troca a mesma linha, nunca duplica). */
export async function gravaRpRows(linhas, sb) {
  const S = sbDe(sb); if (!S) throw new Error('Supabase não configurado — as fotos da Rentabilidade precisam dele.');
  if (!linhas.length) return 0;
  const agora = new Date().toISOString();
  const r = await fetch(`${S.base}/rest/v1/${TABELA}?on_conflict=id`, {
    method: 'POST', headers: { ...S.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(linhas.map((l) => ({ id: l.id, data: l.data, updated_at: agora }))),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} (gravar fotos): ${(await r.text()).slice(0, 200)}`);
  return linhas.length;
}
export const gravaRpRow = (id, data, sb) => gravaRpRows([{ id, data }], sb);
/** Mantém só as `max` linhas mais recentes com o prefixo (`rpdia_`/`rpsem_`; o id `…_AAAA-MM-DD` ordena por data). */
export async function podaPrefixo(prefixo, max, regexId, sb) {
  const S = sbDe(sb); if (!S) return { total: 0, apagadas: 0 };
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.${prefixo}*&select=id&order=id.asc`, { headers: S.headers }), `listar ${prefixo}`);
  const ids = (Array.isArray(rows) ? rows : []).map((x) => x.id).filter((id) => regexId.test(id)).sort();
  const sobra = ids.length - max;
  if (sobra <= 0) return { total: ids.length, apagadas: 0 };
  const velhas = ids.slice(0, sobra);
  const r = await fetch(`${S.base}/rest/v1/${TABELA}?id=in.(${velhas.map(encodeURIComponent).join(',')})`, { method: 'DELETE', headers: { ...S.headers, Prefer: 'return=minimal' } });
  if (!r.ok) throw new Error(`Supabase ${r.status} (podar ${prefixo})`);
  return { total: ids.length - velhas.length, apagadas: velhas.length };
}
// As `data` das rpdia_ de uma semana (seg..dom) — faixa gte/lte sobre o id (mesmo prefixo e mesmo formato de data em todas as linhas).
async function leDiasDaSemana(seg, sb) {
  const S = sbDe(sb); if (!S) return [];
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=gte.${idDia(seg)}&id=lte.${idDia(addDias(seg, 6))}&select=id,data&order=id.asc&limit=8`, { headers: S.headers }), 'ler dias da semana');
  return (Array.isArray(rows) ? rows : []).filter((x) => RE_ID_DIA.test(String(x.id || ''))).map((x) => x.data).filter((d) => d && d.v === RPFOTO_V);
}
async function existeSemana(seg, sb) {
  const S = sbDe(sb); if (!S) return false;
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=eq.${idSemana(seg)}&select=id`, { headers: S.headers }), 'ler semana');
  return Array.isArray(rows) && rows.length > 0;
}
/** A revisão da config compartilhada no momento da foto (updated_at da linha 'default') — só para saber, depois, se o plano mudou entre duas fotos. */
export async function leCfgRev(sb) {
  const S = sbDe(sb); if (!S) return '';
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=eq.default&select=updated_at`, { headers: S.headers }), 'ler revisão da config');
  return (Array.isArray(rows) && rows[0] && rows[0].updated_at) || '';
}
const depsPadrao = () => ({ worklogsEnriquecidos, leCfgRev });

/**
 * Fotografa os dias de `de` a `ate` (no máximo `max` ≤ 10 por execução): UMA leitura do Clockwork (do início mais antigo dos planos até o último
 * dia do lote), uma linha `rpdia_` por dia que tenha plano e uma `rpsem_` para cada semana cujo DOMINGO entrou no lote (ou que já existia e foi
 * tocada). `dry` calcula e devolve sem gravar nem podar. Falha de leitura/gravação NÃO lança: volta em `erro` (o chamador não carimba o agendador).
 * @returns {Promise<{de:string, ate:string, dias:number, feitos:string[], linhas:string[], semanas:string[], restam:number, proximo:string,
 *   truncado:boolean, vazios:number, planos:number, dry:boolean, podadas?:object, amostra?:object, erro?:string}>}
 */
export async function rentabFotos({ cfg, de, ate, max, dry = false, deps, agora, sb } = {}) {
  const D = { ...depsPadrao(), ...(deps || {}) };
  if (!dataValida(de) || !dataValida(ate)) throw new Error('Intervalo inválido — use AAAA-MM-DD (datas que existam).');
  const out = { de, ate: '', dias: 0, feitos: [], linhas: [], semanas: [], restam: 0, proximo: '', truncado: false, vazios: 0, planos: 0, dry: !!dry };
  if (ate < de) return out;
  const teto = Math.max(1, Math.min(RPFOTO_DIAS_MAX, Math.floor(Number(max)) || RPFOTO_DIAS_MAX));
  const dias = []; for (let d = de; d <= ate && dias.length < teto; d = addDias(d, 1)) dias.push(d);
  const ultimo = dias[dias.length - 1];
  out.ate = ultimo; out.dias = dias.length; out.feitos = dias;
  for (let d = addDias(ultimo, 1); d <= ate && out.restam < 4000; d = addDias(d, 1)) out.restam += 1;
  out.proximo = out.restam ? addDias(ultimo, 1) : '';
  const now = agora ? new Date(agora) : new Date();
  const C = cfg || {};
  try {
    // ---- 1 leitura do Clockwork para o lote inteiro ----
    const quais = new Map(); dias.forEach((d) => planosDoDia(C, d).forEach((p) => quais.set(p.id, p)));
    const piso = addDias(dias[0], -365);
    const readDe = [...quais.values()].map((p) => (p.inicio < piso ? piso : p.inicio)).sort()[0];
    let wl = { worklogs: [], truncado: false };
    if (readDe) wl = await D.worklogsEnriquecidos(readDe, ultimo);
    out.truncado = !!(wl && wl.truncado);
    const porProjeto = indexaPorProjeto(wl && wl.worklogs);
    let cfgRev = ''; try { cfgRev = await D.leCfgRev(sb); } catch (e) { cfgRev = ''; }
    // ---- as linhas dos dias ----
    const linhas = [];
    dias.forEach((d) => {
      const data = montaFotoDia({ dia: d, cfg: C, porProjeto, agora: now, cfgRev, truncado: out.truncado });
      if (!data) { out.vazios += 1; return; }
      linhas.push({ id: idDia(d), data }); out.planos = Math.max(out.planos, Object.keys(data.planos).length);
    });
    out.linhas = linhas.map((l) => l.id);
    if (!dry) await gravaRpRows(linhas, sb);
    // ---- as semanas: o DOMINGO entrou no lote, ou a semana já tinha linha e foi tocada (refazer à mão não deixa a soma velha) ----
    const noLote = new Map(linhas.map((l) => [l.data.dia, l.data]));
    const segs = [...new Set(dias.map((d) => segundaDe(d)))];
    const semanas = [];
    for (const seg of segs) {
      const domingo = addDias(seg, 6);
      if (!(dias.includes(domingo) || await existeSemana(seg, sb))) continue;
      const doBanco = await leDiasDaSemana(seg, sb);
      const porDia = new Map(doBanco.map((r) => [r.dia, r])); noLote.forEach((r, d) => { if (d >= seg && d <= domingo) porDia.set(d, r); });
      const sem = montaFotoSemana(seg, [...porDia.values()], { agora: now });
      if (sem) semanas.push({ id: idSemana(seg), data: sem });
    }
    out.semanas = semanas.map((s) => s.id);
    if (!dry) {
      await gravaRpRows(semanas, sb);
      out.podadas = { dias: await podaPrefixo('rpdia_', RPDIA_MAX, RE_ID_DIA, sb), semanas: await podaPrefixo('rpsem_', RPSEM_MAX, RE_ID_SEM, sb) };
    } else if (linhas.length) {
      const l = linhas[0]; const k = Object.keys(l.data.planos)[0];
      out.amostra = { id: l.id, plano: k, foto: l.data.planos[k] };
    }
  } catch (e) { out.erro = String(e && e.message ? e.message : e).slice(0, 300); }
  return out;
}

/**
 * Leitura de UM plano: as `n` linhas mais recentes (até o dia/semana `ate`) já recortadas para o plano, em ordem CRONOLÓGICA (da mais antiga para a mais
 * nova). gran 'dia' → [{ dia, …campos do plano }] · 'semana' → [{ semana, ate, dias, …campos do plano }]. Linha em que o plano não aparece não entra
 * (plano encerrado há mais de 30 dias: passe `ate` = fim + 30, senão as n linhas mais recentes não o contêm). Lê a linha inteira e recorta aqui —
 * ainda não há seleção por caminho do JSON no PostgREST em uso.
 */
export async function leFotosRentab({ gran, ate, n, plano } = {}, sb) {
  const S = sbDe(sb); if (!S) return [];
  const sem = gran === 'semana';
  const pre = sem ? 'rpsem_' : 'rpdia_'; const re = sem ? RE_ID_SEM : RE_ID_DIA;
  const lim = Math.max(1, Math.min(sem ? RPSEM_MAX : RPDIA_MAX, Math.floor(Number(n)) || (sem ? 12 : 30)));
  const teto = dataValida(ate || '') ? `&id=lte.${pre}${ate}` : '';
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.${pre}*${teto}&select=id,data&order=id.desc&limit=${lim}`, { headers: S.headers }), 'ler fotos da rentabilidade');
  return (Array.isArray(rows) ? rows : []).filter((x) => re.test(String(x.id || '')) && x.data && x.data.v === RPFOTO_V && x.data.planos && Object.prototype.hasOwnProperty.call(x.data.planos, plano))
    .map((x) => (sem ? { semana: x.data.semana, ate: x.data.ate, dias: x.data.dias, ...x.data.planos[plano] } : { dia: x.data.dia, ...x.data.planos[plano] }))
    .sort((a, b) => String(a.dia || a.semana).localeCompare(String(b.dia || b.semana)));
}
