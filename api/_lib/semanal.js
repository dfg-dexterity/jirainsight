// 📊 RELATÓRIO SEMANAL DE SEXTA — fonte única dos cálculos (pedido do usuário, 2026-09-28).
// "Toda sexta: planejado × orçado × realizado, reuniões, tickets criados, qualidade da
// informação, comparável com semanas anteriores, atividade de cada pessoa e a visão do
// gerente do projeto (parados, vencidos por pessoa)."
//
// Este arquivo NÃO fala com a rede sozinho: as funções de cálculo são PURAS (recebem os
// dados, devolvem números) e só `montaFotoSemanal` busca as fontes — em paralelo, com
// tetos, através de `deps` (trocáveis nos testes). Quem grava/envia é o api/teams.js
// (`?tipo=semanal`, cron de 30 min) e quem lê é o api/config.js (`?semanal=1`).
//
// ---------------------------------------------------------------------------------------
// FORMATO DA FOTO (v1) — contrato com o front (public/js/18b-relatorio-semanal.js)
// ---------------------------------------------------------------------------------------
// Uma foto por semana, id `semanal_<segunda>` na tabela jirainsight_config (`id`, `data`,
// `updated_at`), no máximo SEMANAL_MAX (104) — a poda acontece na gravação. Horas sempre em
// SEGUNDOS; percentuais em 0–100 (ou null quando não há base para calcular).
// {
//   v:1, semana:'2026-09-21' (segunda), ate:'2026-09-25' (sexta), fotoEm:'2026-09-25T19:00:12.000Z',
//   parado:5,                                        // N dias sem atualização usado nesta foto
//   truncado:{ atividade, abertos, worklogs, tickets },   // true quando algum teto foi batido
//   time:{ plan, orc, cap, real, realFat, exec, ader, semPlano, naoFeito, consumo,
//          pessoasComPlano, pessoas, criados, concluidos, saldo,
//          reunioes:{ criadas, horas, vencidasAbertas },
//          qualidade:{ nota, comp:{ wlCom, wlEspecifico, diasCheios, venc, naoVencido, atualizado, estimado, descricao, planoEnviado, aderencia } },
//          vencidos, parados, semVenc, semResp, estZero, semDesc, diasVazios },
//   pessoas:{ [accountId]:{ nome, email, plan, planoStatus, cap, real, realFat, exec, ader,
//          criados, concluidos, transicoes, comentarios, reunioes:{ criadas, horas }, diasVazios,
//          vencidos, parados, semVenc, qualidade:{ nota, comp }, projetos:[{ p, real }] } },
//   projetos:{ [KEY]:{ nome, gerentes:[accountId], plan, orc, real, realFat, consumo, criados, concluidos, saldo,
//          vencidos, parados, semVenc, semResp, estZero, semDesc, reunioesVencidas,
//          qualidade:{ nota, comp }, porPessoa:{ [accountId]:{ real, vencidos, parados } } } },
//   realFechado:{ time:{ real, realFat }, pessoas:{…}, projetos:{…} } | ausente,   // gravado pela execução SEGUINTE
//   ia:'…' | ausente                                                                  // 3–5 frases da fase de envio
// }
// Definições (o que cada número é):
//   plan        Σ horas_planejadas dos planos VIGENTES (maior versão por pessoa/semana) com status
//               enviado|aprovado. Rascunho (elaboracao) só aparece em planoStatus. Projeto: itens daquele projeto.
//   orc         Σ planos da 💹 Rentabilidade do projeto → horas vendidas da semana (rpVendEntre: pro rata
//               pelos dias úteis, como o rpVendAte). time.orc = Σ projetos.
//   cap         capacidade = meta/dia (cfg.metasPessoa/metaGlobalH, zerada por ausência e fora da
//               🪪 vigência) × dias úteis da semana — o critério do mpCapSem.
//   real/realFat  worklogs da semana de SEGUNDA A DOMINGO (realFat = faturáveis) — o plano aceita item
//               de sábado/domingo (04-meu-planejamento: dias 0..6) e o 📋 Planejado × realizado conta o
//               real até domingo; contar só até sexta daria exec < 100% numa semana cumprida. Na foto
//               viva (sexta) o fim de semana ainda não aconteceu; no realFechado ele entra.
//               Sempre por worklogsEnriquecidos.
//   exec        real ÷ plan — no time, só o real de quem tem plano (senão as horas de quem não
//               planejou inflam a execução). ader = Σ min(real, plan) por chave pessoa|dia|projeto ÷ real
//               (mesma base); semPlano = real em chaves sem plano; naoFeito = plan em chaves sem real.
//   consumo     projeto: real ÷ orc · pessoa: real ÷ cap · time: real dos projetos COM orçado ÷ orc.
//   criados     tickets criados na semana (JQL created), por relator/projeto/tipo; concluidos = resolved;
//               saldo = criados − concluidos. NUNCA por `updated`. Por pessoa: criados = relator,
//               concluidos = responsável no fechamento.
//   reuniões    criadas = criados de tipo /reuni/i · horas = worklogs de tipo /reuni/i · vencidasAbertas =
//               abertos de tipo reunião com vencimento < dia da foto. (Só o Jira; sem ler agenda.)
//   qualidade   0–100 com pesos: Apontamento 40 (wlCom 15 · wlEspecifico 10 · diasCheios 15) + Tickets
//               abertos 45 (venc 10 · naoVencido 10 · atualizado 10 · estimado 10 · descricao 5) + Plano 15
//               (planoEnviado 10 · aderencia 5, ader ≥ 70). Componente sem base (ex.: nenhum ticket aberto)
//               fica null e SAI do peso — a nota é reescalada sobre o que se aplica. Projeto: só a parte
//               de tickets. Cada comp vem em % (0–100) ou null.
//   vencidos/parados/semVenc/semResp/estZero/semDesc  sobre os ABERTOS de hoje (a mesma base do
//               ?analytics=1) com as definições dos ANL_CHECKS do painel: vencido = venc < hoje; parado =
//               em andamento sem `up` há ≥ N dias; semVenc = sem due date fora épico/história; semResp =
//               sem responsável; estZero = em andamento sem estimativa (fora épico/história, reunião e
//               rotina); semDesc = descrição < 40 caracteres (fora épico/história).
//   diasVazios  dias úteis da semana, ANTES do dia da foto, sem worklog e sem ausência (o dia da foto
//               ainda está em curso — mesma regra do calcTimesheet, que não conta o "hoje").
//   pessoas     usuários ATIVOS do Jira fora de cfg.ocultos (o elenco do ranking do teams.js).
//   truncado.tickets  cobre criados/concluídos (teto da JQL); abertos/atividade/worklogs, os seus tetos.
//   Foto de uma semana PASSADA (?semana=): worklogs/criados/concluídos são da semana pedida, mas os
//   abertos são os de HOJE — não há como voltar no tempo nos tickets.
// Estado do agendador (teams_estado): `ultimaFotoSemanal` e `ultimoEnvioSemanal` (= segunda da semana).
// ---------------------------------------------------------------------------------------
import { jiraSearchAll, worklogsEnriquecidos, jiraUsuariosAtivos } from './util.js';
import { coletaAtividade } from './atividade.js';
import { ehUtilBR, addDias, diaSemana, rpVendEntre } from './rentab.js';
import { buscaAbertos } from '../vencimentos.js';
import { carregaCatalogoProjetos } from '../projetos.js';

export const SEMANAL_V = 1;
export const SEMANAL_MAX = 104;        // fotos guardadas (2 anos de sextas)
export const PARADO_PADRAO = 5;        // dias sem atualização
export const RE_REUNIAO = /reuni/i;
export const RE_AGRUP = /hist[óo]ria|story|épico|epic/i;
export const RE_ROTINA = /rotina/i;
// Comentário de worklog GENÉRICO — a mesma regex do ⏳ Como estou gastando meu tempo
// (MTP_RE_GENERICO, 09b-meu-tempo.js); comentário com menos de 8 caracteres também é genérico.
export const RE_GENERICO = /^(reuni[aã]o|reunioes|ajustes?|diversos|trabalho|atividades?|dev|desenvolvimento|suporte|an[aá]lise|tarefas?|teste|ok|feito|apontamento|horas?|acompanhamento|gest[aã]o|projeto|continua[cç][aã]o|idem|\.+|-+)\.?$/i;
const RE_ARQUIVADO = /(^|[^A-Za-z])ARQ([^A-Za-z]|$)/;   // projetos "ARQ" somem do painel inteiro (api/projetos.js)
const PESOS = { wlCom: 15, wlEspecifico: 10, diasCheios: 15, venc: 10, naoVencido: 10, atualizado: 10, estimado: 10, descricao: 5, planoEnviado: 10, aderencia: 5 };
const PESOS_PROJ = { venc: 10, naoVencido: 10, atualizado: 10, estimado: 10, descricao: 5 };
const TABELA = 'jirainsight_config';
const T_PLAN = 'jirainsight_plan_semana';
const T_ITENS = 'jirainsight_plan_itens';
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
// Tetos por execução (o cron tem 60 s): páginas de 100 issues.
const TETO_ATIVIDADE = 25;
const TETO_TICKETS = 15;
// O teto dos worklogs é o do clockworkRaw (200 000 linhas BRUTAS): worklogsEnriquecidos devolve
// `truncado` comparando o BRUTO com o teto — a lista enriquecida é menor (linhas sem autor saem)
// e por isso não serve de medida.

// ---- datas ----
function spDate(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); }
/**
 * Data válida de verdade (AAAA-MM-DD que existe no calendário, entre 2000 e 2099): a ida-e-volta
 * pelo Date.UTC recusa 2026-02-30, 2026-13-45 e 0000-01-01 — antes `addDias` transbordava e uma
 * `?semana=` errada virava linha-lixo (semanal_1900-01-01) e JQL com data absurda.
 */
export function dataValida(iso) {
  if (!RE_DATA.test(iso || '')) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (y < 2000 || y > 2099) return false;
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === iso;
}
/** Segunda-feira (AAAA-MM-DD) da semana de uma data; '' se a data for inválida ou impossível. */
export function segundaDe(iso) { if (!dataValida(iso)) return ''; return addDias(iso, -((diaSemana(iso) + 6) % 7)); }
/**
 * Dia da FOTO da semana `seg`: o último dia útil até o dia marcado (1=seg … 5=sex) — quinta quando
 * a sexta é feriado (20/11, 25/12, 01/01, Sexta-feira Santa…). '' se a semana não tem dia útil.
 */
export function diaFotoSemana(seg, dia, cfg) {
  const n = Math.min(5, Math.max(1, Number(dia) || 5));
  for (let i = n - 1; i >= 0; i -= 1) { const d = addDias(seg, i); if (ehUtilBR(d, cfg)) return d; }
  return '';
}
/** Dias úteis (seg–sex sem feriado BR + cfg.feriadosExtra − cfg.feriadosRemovidos) entre a segunda e `ate` (padrão: a sexta). */
export function uteisSemana(seg, cfg, ate) {
  const fim = ate || addDias(seg, 4); const out = [];
  for (let d = seg, g = 0; d <= fim && g < 14; d = addDias(d, 1), g += 1) if (ehUtilBR(d, cfg)) out.push(d);
  return out;
}
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);
const diasDesde = (hoje, iso) => {
  const d = String(iso || '').slice(0, 10);
  if (!RE_DATA.test(d)) return null;
  return Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86400000));
};

// ---- pessoa: ausência, vigência, meta e capacidade (01-nucleo.js: ehAusencia/metaSegDe) ----
export function foraVigencia(a, dia, cfg) {
  const v = ((cfg && cfg.vigencias) || {})[a];
  if (!v || !dia) return false;
  return !!((v.ini && dia < v.ini) || (v.fim && dia > v.fim));
}
export function ehAusencia(a, dia, cfg) {
  if (foraVigencia(a, dia, cfg)) return true;
  return ((cfg && cfg.ausencias) || []).some((x) => x && x.a === a && dia >= x.de && dia <= x.ate);
}
/** Meta diária em SEGUNDOS da pessoa no dia: override individual ou meta global; 0 em ausência/fora da vigência. */
export function metaSegDe(a, dia, cfg) {
  const c = cfg || {};
  if (dia && ehAusencia(a, dia, c)) return 0;
  const mp = c.metasPessoa || {};
  const h = (a && mp[a] != null) ? mp[a] : (c.metaGlobalH != null ? c.metaGlobalH : 8);
  return Math.max(0, Number(h) || 0) * 3600;
}
/** Capacidade (segundos) = Σ meta/dia nos dias úteis dados — o mpCapSem do 📋 Meu Planejamento. */
export function capacidade(a, dias, cfg) { return (dias || []).reduce((s, d) => s + metaSegDe(a, d, cfg), 0); }
export function ehGenerico(c) { const s = String(c || '').trim(); return !s || s.length < 8 || RE_GENERICO.test(s); }
/** Nota 0–100 a partir dos componentes (% ou null) e dos pesos; componente null sai do peso. */
export function notaDe(comp, pesos) {
  let s = 0; let pt = 0;
  for (const k of Object.keys(pesos)) { const v = comp[k]; if (v == null) continue; s += v * pesos[k]; pt += pesos[k]; }
  return pt ? Math.round(s / pt) : null;
}
// Plano VIGENTE quando há mais de uma linha por pessoa/semana (mpPlanoMaisNovo do painel).
function maisNovo(a, b) {
  const va = Number(a.versao) || 1; const vb = Number(b.versao) || 1;
  if (va !== vb) return va > vb ? a : b;
  const qa = String(a.atualizadoEm || a.enviadoEm || ''); const qb = String(b.atualizadoEm || b.enviadoEm || '');
  if (qa !== qb) return qa > qb ? a : b;
  return String(a.id || '') >= String(b.id || '') ? a : b;
}
// Contagens dos ANL_CHECKS sobre uma lista de abertos (base dos indicadores e da qualidade).
function contaAbertos(lista, hoje, N) {
  const c = { n: 0, nNaoAgrup: 0, comVenc: 0, vencidos: 0, parados: 0, semVenc: 0, semResp: 0, estZero: 0, semDesc: 0, atualizados: 0, emAnd: 0, emAndEst: 0, desc40: 0, reuVenc: 0 };
  for (const t of lista) {
    const agrup = RE_AGRUP.test(t.t || ''); const reu = RE_REUNIAO.test(t.t || '');
    const emAnd = t.statCat === 'indeterminate'; const dUp = diasDesde(hoje, t.up);
    c.n += 1; if (!agrup) c.nNaoAgrup += 1;
    if (t.venc) { if (!agrup) c.comVenc += 1; if (t.venc < hoje) { c.vencidos += 1; if (reu) c.reuVenc += 1; } }
    else if (!agrup) c.semVenc += 1;
    if (emAnd && (dUp == null ? 999 : dUp) >= N) c.parados += 1;
    if (!t.respId) c.semResp += 1;
    if (dUp != null && dUp < N) c.atualizados += 1;
    if (emAnd && !agrup && !reu && !RE_ROTINA.test(t.t || '')) { c.emAnd += 1; if (Number(t.est) > 0) c.emAndEst += 1; else c.estZero += 1; }
    if (!agrup) { if (Number(t.descLen) >= 40) c.desc40 += 1; else c.semDesc += 1; }
  }
  return c;
}
function compTickets(c) {
  return { venc: pct(c.comVenc, c.nNaoAgrup), naoVencido: pct(c.n - c.vencidos, c.n), atualizado: pct(c.atualizados, c.n), estimado: pct(c.emAndEst, c.emAnd), descricao: pct(c.desc40, c.nNaoAgrup) };
}

/**
 * Calcula a foto da semana a partir dos dados já buscados (função PURA).
 * @param {object} inp
 *  seg (segunda), ate (sexta; padrão seg+4), fotoEm (ISO; padrão agora), cfg (config compartilhada),
 *  planos [{id, accountId, nome, email, semana, status, versao, atualizadoEm, enviadoEm}],
 *  itens [{planId, data, projeto, horas}], worklogs [{a,s,d,p,t,f,k,c}] (worklogsEnriquecidos com comentários),
 *  abertos [{k,p,t,statCat,venc,respId,est,up,descLen,…}] (buscaAbertos), atividade {eventos:[{a,e,k,p,t,d}]},
 *  criados [{k,p,t,a,d}] (a = relator), concluidos [{k,p,t,a,d}] (a = responsável),
 *  usuarios {[accountId]:{nome,email}}, projetosCat {[KEY]:{nome,categoria}}, parado (N dias),
 *  truncado {atividade, abertos, worklogs, tickets}
 */
export function calculaFoto(inp) {
  const cfg = inp.cfg || {};
  const seg = inp.seg; const ate = inp.ate || addDias(seg, 4);
  const fotoEm = inp.fotoEm || new Date().toISOString();
  const hoje = spDate(new Date(fotoEm));                       // dia da foto (SP)
  const N = Number(inp.parado) > 0 ? Number(inp.parado) : (Number((cfg.relSemanal || {}).parado) > 0 ? Number(cfg.relSemanal.parado) : PARADO_PADRAO);
  const ocultos = new Set((cfg.ocultos || []).map((o) => o && o.a).filter(Boolean));
  const uteis = uteisSemana(seg, cfg, ate);
  const uteisFechados = uteis.filter((d) => d < hoje);          // o dia da foto ainda está em curso
  const projGer = (cfg.projGerentes && typeof cfg.projGerentes === 'object') ? cfg.projGerentes : {};
  const cat = inp.projetosCat || {};
  const usuarios = inp.usuarios || {};
  const nomeDe = (a) => (usuarios[a] && usuarios[a].nome) || a;
  // cfg.projGerentes aceita e-mail além do accountId (como cfg.gestores): normaliza pelo elenco,
  // senão a DM do gerente cadastrado por e-mail some em silêncio (cai em "sem e-mail").
  const idPorEmail = {};
  Object.entries(usuarios).forEach(([a, u]) => { const e = String((u && u.email) || '').trim().toLowerCase(); if (e) idPorEmail[e] = a; });
  const gerenteId = (x) => { const s = String(x || '').trim(); const e = s.toLowerCase(); return (e.includes('@') && idPorEmail[e]) ? idPorEmail[e] : s; };
  const fimSem = addDias(seg, 6);                                 // domingo: plano e realizado cobrem seg→dom

  // ---- planos vigentes → planejado por chave pessoa|dia|projeto ----
  const vig = {};
  (inp.planos || []).forEach((p) => {
    if (!p || !p.accountId || ocultos.has(p.accountId)) return;
    if (p.semana && p.semana !== seg) return;
    vig[p.accountId] = vig[p.accountId] ? maisNovo(p, vig[p.accountId]) : p;
  });
  const itensPorPlano = {};
  (inp.itens || []).forEach((i) => { if (i && i.planId != null) (itensPorPlano[i.planId] = itensPorPlano[i.planId] || []).push(i); });
  const planChave = {}; const planPessoa = {}; const planProj = {}; const statusPessoa = {}; let planTot = 0;
  Object.values(vig).forEach((p) => {
    statusPessoa[p.accountId] = String(p.status || '');
    if (!['enviado', 'aprovado'].includes(p.status)) return;
    (itensPorPlano[p.id] || []).forEach((i) => {
      const d = String(i.data || '').slice(0, 10);
      if (d < seg || d > fimSem) return;
      const pj = String(i.projeto || '').toUpperCase() || '—';
      const s = Math.round((Number(i.horas) || 0) * 3600);
      if (!(s > 0)) return;
      const k = `${p.accountId}|${d}|${pj}`;
      planChave[k] = (planChave[k] || 0) + s; planPessoa[p.accountId] = (planPessoa[p.accountId] || 0) + s;
      planProj[pj] = (planProj[pj] || 0) + s; planTot += s;
    });
  });
  const temPlano = (a) => ['enviado', 'aprovado'].includes(statusPessoa[a] || '');

  // ---- worklogs da semana (seg→dom, a mesma janela do plano) → realizado por chave, pessoa, projeto; dias com apontamento; comentários ----
  const wl = (inp.worklogs || []).filter((w) => { const d = String((w && w.d) || '').slice(0, 10); return w && w.a && d >= seg && d <= fimSem && !ocultos.has(w.a); });
  const realChave = {}; const realPessoa = {}; const realFatPessoa = {}; const realProj = {}; const realFatProj = {};
  const realPessoaProj = {}; const diasPessoa = {}; const reuHorasPessoa = {}; const wlPessoa = {};
  let realTot = 0; let realFatTot = 0; let reuHoras = 0;
  const W0 = () => ({ n: 0, com: 0, gen: 0 });
  const wlTot = W0();
  wl.forEach((w) => {
    const s = Number(w.s) || 0; const d = w.d.slice(0, 10); const pj = w.p || '—'; const k = `${w.a}|${d}|${pj}`;
    realChave[k] = (realChave[k] || 0) + s; realPessoa[w.a] = (realPessoa[w.a] || 0) + s; realProj[pj] = (realProj[pj] || 0) + s; realTot += s;
    if (w.f) { realFatPessoa[w.a] = (realFatPessoa[w.a] || 0) + s; realFatProj[pj] = (realFatProj[pj] || 0) + s; realFatTot += s; }
    (realPessoaProj[w.a] = realPessoaProj[w.a] || {})[pj] = ((realPessoaProj[w.a] || {})[pj] || 0) + s;
    (diasPessoa[w.a] = diasPessoa[w.a] || new Set()).add(d);
    if (RE_REUNIAO.test(w.t || '')) { reuHoras += s; reuHorasPessoa[w.a] = (reuHorasPessoa[w.a] || 0) + s; }
    const c = String(w.c || '').trim(); const com = c.length >= 3; const gen = com && ehGenerico(c);
    const P = wlPessoa[w.a] = wlPessoa[w.a] || W0();
    P.n += 1; wlTot.n += 1; if (com) { P.com += 1; wlTot.com += 1; } if (gen) { P.gen += 1; wlTot.gen += 1; }
  });

  // ---- aderência por chave (só quem tem plano enviado/aprovado entra na base) ----
  const aderP = {}; let minTot = 0; let semPlanoTot = 0; let naoFeitoTot = 0; let realComPlano = 0;
  new Set([...Object.keys(planChave), ...Object.keys(realChave)]).forEach((k) => {
    const a = k.split('|')[0]; if (!temPlano(a)) return;
    const pl = planChave[k] || 0; const re = realChave[k] || 0; const m = Math.min(pl, re);
    const A = aderP[a] = aderP[a] || { min: 0, semPlano: 0, naoFeito: 0 };
    A.min += m; minTot += m; realComPlano += re;
    if (!pl) { semPlanoTot += re; A.semPlano += re; }
    if (!re) { naoFeitoTot += pl; A.naoFeito += pl; }
  });

  // ---- tickets: abertos (hoje), criados e concluídos (semana), atividade ----
  const ab = (inp.abertos || []).filter((t) => t && t.k);
  const cri = (inp.criados || []).filter((x) => x && x.k && !ocultos.has(x.a || ''));
  const conc = (inp.concluidos || []).filter((x) => x && x.k && !ocultos.has(x.a || ''));
  const atv = {};
  (((inp.atividade || {}).eventos) || []).forEach((e) => {
    if (!e || !e.a || ocultos.has(e.a)) return;
    const A = atv[e.a] = atv[e.a] || { transicoes: 0, comentarios: 0 };
    if (e.e === 'transicao') A.transicoes += 1; else if (e.e === 'comentario') A.comentarios += 1;
  });
  const abPessoa = {}; const abProj = {}; const criPessoa = {}; const criProj = {}; const concPessoa = {}; const concProj = {};
  const reuCriPessoa = {}; let reuCri = 0;
  ab.forEach((t) => { if (t.respId) (abPessoa[t.respId] = abPessoa[t.respId] || []).push(t); (abProj[t.p] = abProj[t.p] || []).push(t); });
  cri.forEach((x) => { if (x.a) criPessoa[x.a] = (criPessoa[x.a] || 0) + 1; criProj[x.p] = (criProj[x.p] || 0) + 1; if (RE_REUNIAO.test(x.t || '')) { reuCri += 1; if (x.a) reuCriPessoa[x.a] = (reuCriPessoa[x.a] || 0) + 1; } });
  conc.forEach((x) => { if (x.a) concPessoa[x.a] = (concPessoa[x.a] || 0) + 1; concProj[x.p] = (concProj[x.p] || 0) + 1; });

  // ---- pessoas (elenco: ativos do Jira fora de ocultos) ----
  const pessoas = {}; let capTot = 0; let diasVaziosTot = 0; let diasEspTot = 0; let diasComTot = 0; let comPlano = 0;
  Object.keys(usuarios).filter((a) => !ocultos.has(a)).sort((x, y) => nomeDe(x).localeCompare(nomeDe(y), 'pt')).forEach((a) => {
    const semDados = !realPessoa[a] && !vig[a] && !abPessoa[a] && !criPessoa[a] && !concPessoa[a] && !atv[a];
    if (semDados && uteis.length && uteis.every((d) => foraVigencia(a, d, cfg))) return;   // ainda não entrou / já saiu
    const cap = capacidade(a, uteis, cfg); capTot += cap;
    const plan = planPessoa[a] || 0; const real = realPessoa[a] || 0; const realFat = realFatPessoa[a] || 0;
    const ok = temPlano(a); if (ok) comPlano += 1;
    const A = aderP[a]; const ader = (ok && real > 0) ? pct(A ? A.min : 0, real) : null;
    const diasEsp = uteisFechados.filter((d) => !ehAusencia(a, d, cfg));
    const diasCom = diasEsp.filter((d) => diasPessoa[a] && diasPessoa[a].has(d)).length;
    const diasVazios = diasEsp.length - diasCom;
    diasVaziosTot += diasVazios; diasEspTot += diasEsp.length; diasComTot += diasCom;
    const W = wlPessoa[a] || W0(); const C = contaAbertos(abPessoa[a] || [], hoje, N);
    const comp = {
      wlCom: pct(W.com, W.n), wlEspecifico: pct(W.com - W.gen, W.com), diasCheios: pct(diasCom, diasEsp.length),
      ...compTickets(C), planoEnviado: ok ? 100 : 0, aderencia: ader == null ? null : (ader >= 70 ? 100 : 0),
    };
    const projetos = Object.entries(realPessoaProj[a] || {}).map(([p, r]) => ({ p, real: r })).sort((x, y) => y.real - x.real).slice(0, 3);
    pessoas[a] = {
      nome: nomeDe(a), email: (usuarios[a] && usuarios[a].email) || '',
      plan, planoStatus: statusPessoa[a] || '', cap, real, realFat, exec: ok ? pct(real, plan) : null, ader,
      criados: criPessoa[a] || 0, concluidos: concPessoa[a] || 0,
      transicoes: (atv[a] || {}).transicoes || 0, comentarios: (atv[a] || {}).comentarios || 0,
      reunioes: { criadas: reuCriPessoa[a] || 0, horas: reuHorasPessoa[a] || 0 },
      diasVazios, vencidos: C.vencidos, parados: C.parados, semVenc: C.semVenc,
      qualidade: { nota: notaDe(comp, PESOS), comp }, projetos,
    };
  });

  // ---- projetos: tudo que teve horas, plano, ticket aberto/criado/concluído ou orçado na semana ----
  const rentab = ((cfg.rentab && Array.isArray(cfg.rentab.planos)) ? cfg.rentab.planos : []).filter((p) => p && p.projeto);
  const orcProj = {};
  rentab.forEach((p) => { const k = String(p.projeto).toUpperCase(); orcProj[k] = (orcProj[k] || 0) + Math.round(rpVendEntre(p, seg, ate, cfg, hoje) * 3600); });
  const keys = new Set([...Object.keys(realProj), ...Object.keys(planProj), ...Object.keys(abProj), ...Object.keys(criProj), ...Object.keys(concProj), ...Object.keys(orcProj).filter((k) => orcProj[k] > 0)]);
  const projetos = {}; let orcTot = 0; let realOrcado = 0;
  [...keys].filter((k) => k && k !== '—').sort().forEach((k) => {
    const meta = cat[k] || {};
    if (k === 'ARQ' || RE_ARQUIVADO.test(meta.nome || '') || RE_ARQUIVADO.test(meta.categoria || '')) return;
    const orc = orcProj[k] || 0; const real = realProj[k] || 0; orcTot += orc; if (orc > 0) realOrcado += real;
    const lista = abProj[k] || []; const C = contaAbertos(lista, hoje, N); const comp = compTickets(C);
    const porPessoa = {};
    wl.forEach((w) => { if ((w.p || '—') !== k) return; const P = porPessoa[w.a] = porPessoa[w.a] || { real: 0, vencidos: 0, parados: 0 }; P.real += Number(w.s) || 0; });
    lista.forEach((t) => { if (!t.respId) return; const P = porPessoa[t.respId] = porPessoa[t.respId] || { real: 0, vencidos: 0, parados: 0 };
      if (t.venc && t.venc < hoje) P.vencidos += 1;
      if (t.statCat === 'indeterminate' && (diasDesde(hoje, t.up) == null ? 999 : diasDesde(hoje, t.up)) >= N) P.parados += 1; });
    const criados = criProj[k] || 0; const concluidos = concProj[k] || 0;
    const ger = Array.isArray(projGer[k]) ? [...new Set(projGer[k].map(gerenteId).filter(Boolean))] : [];
    projetos[k] = {
      nome: meta.nome || k, gerentes: ger, plan: planProj[k] || 0, orc, real, realFat: realFatProj[k] || 0,
      consumo: pct(real, orc), criados, concluidos, saldo: criados - concluidos,
      vencidos: C.vencidos, parados: C.parados, semVenc: C.semVenc, semResp: C.semResp, estZero: C.estZero, semDesc: C.semDesc,
      reunioesVencidas: C.reuVenc, qualidade: { nota: notaDe(comp, PESOS_PROJ), comp }, porPessoa,
    };
  });

  // ---- time ----
  const nPessoas = Object.keys(pessoas).length;
  const CT = contaAbertos(ab, hoje, N);
  const aderTime = realComPlano > 0 ? pct(minTot, realComPlano) : null;
  const compT = {
    wlCom: pct(wlTot.com, wlTot.n), wlEspecifico: pct(wlTot.com - wlTot.gen, wlTot.com), diasCheios: pct(diasComTot, diasEspTot),
    ...compTickets(CT), planoEnviado: pct(comPlano, nPessoas), aderencia: aderTime == null ? null : (aderTime >= 70 ? 100 : 0),
  };
  const time = {
    plan: planTot, orc: orcTot, cap: capTot, real: realTot, realFat: realFatTot,
    exec: pct(realComPlano, planTot), ader: aderTime, semPlano: semPlanoTot, naoFeito: naoFeitoTot, consumo: pct(realOrcado, orcTot),
    pessoasComPlano: comPlano, pessoas: nPessoas, criados: cri.length, concluidos: conc.length, saldo: cri.length - conc.length,
    reunioes: { criadas: reuCri, horas: reuHoras, vencidasAbertas: CT.reuVenc },
    qualidade: { nota: notaDe(compT, PESOS), comp: compT },
    vencidos: CT.vencidos, parados: CT.parados, semVenc: CT.semVenc, semResp: CT.semResp, estZero: CT.estZero, semDesc: CT.semDesc, diasVazios: diasVaziosTot,
  };
  const tr = inp.truncado || {};
  return {
    v: SEMANAL_V, semana: seg, ate, fotoEm, parado: N,
    truncado: { atividade: !!tr.atividade, abertos: !!tr.abertos, worklogs: !!tr.worklogs, tickets: !!tr.tickets },
    time, pessoas, projetos,
  };
}

/**
 * Realizado FECHADO de uma semana (calculado na execução seguinte, quando ninguém mais aponta nela).
 * Cobre segunda a DOMINGO (`ate` padrão = seg+6), como o plano e o 📋 Meu Planejamento.
 */
export function calculaRealFechado({ worklogs, seg, ate, cfg }) {
  const fim = ate || addDias(seg, 6);
  const ocultos = new Set((((cfg || {}).ocultos) || []).map((o) => o && o.a).filter(Boolean));
  const out = { time: { real: 0, realFat: 0 }, pessoas: {}, projetos: {} };
  (worklogs || []).forEach((w) => {
    const d = String((w && w.d) || '').slice(0, 10);
    if (!w || !w.a || d < seg || d > fim || ocultos.has(w.a)) return;
    const s = Number(w.s) || 0; const pj = w.p || '—';
    const P = out.pessoas[w.a] = out.pessoas[w.a] || { real: 0, realFat: 0 };
    const J = out.projetos[pj] = out.projetos[pj] || { real: 0, realFat: 0 };
    out.time.real += s; P.real += s; J.real += s;
    if (w.f) { out.time.realFat += s; P.realFat += s; J.realFat += s; }
  });
  return out;
}

const CHAVES_TIME = ['plan', 'orc', 'cap', 'real', 'realFat', 'exec', 'ader', 'semPlano', 'naoFeito', 'consumo', 'pessoasComPlano', 'pessoas',
  'criados', 'concluidos', 'saldo', 'vencidos', 'parados', 'semVenc', 'semResp', 'estZero', 'semDesc', 'diasVazios'];
const CHAVES_PESSOA = ['plan', 'cap', 'real', 'realFat', 'exec', 'ader', 'criados', 'concluidos', 'transicoes', 'comentarios', 'diasVazios', 'vencidos', 'parados', 'semVenc'];
const CHAVES_PROJ = ['plan', 'orc', 'real', 'realFat', 'consumo', 'criados', 'concluidos', 'saldo', 'vencidos', 'parados', 'semVenc', 'semResp', 'estZero', 'semDesc', 'reunioesVencidas'];
const numOu = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const delta = (a, b) => ((a == null || b == null) ? null : a - b);
function comparaObj(A, B, chaves) {
  const out = {};
  chaves.forEach((k) => { const a = numOu(A && A[k]); const b = numOu(B && B[k]); out[k] = { atual: a, anterior: b, delta: delta(a, b) }; });
  const qa = numOu(A && A.qualidade && A.qualidade.nota); const qb = numOu(B && B.qualidade && B.qualidade.nota);
  out.nota = { atual: qa, anterior: qb, delta: delta(qa, qb) };
  return out;
}
/**
 * Compara duas fotos (a atual e a da semana anterior; `anterior` pode ser null).
 * Devolve Δ por indicador (time, pessoas, projetos), os maiores DESVIOS da semana
 * (pessoa: real − plan · projeto: real − orc) e as maiores VARIAÇÕES vs a semana anterior —
 * é o que o cartão do Teams e a tela usam; nada aqui olha para R$.
 */
export function comparaFotos(atual, anterior) {
  const A = atual || {}; const B = anterior || {};
  const time = comparaObj(A.time, B.time, CHAVES_TIME);
  ['criadas', 'horas', 'vencidasAbertas'].forEach((k) => {
    const a = numOu(A.time && A.time.reunioes && A.time.reunioes[k]); const b = numOu(B.time && B.time.reunioes && B.time.reunioes[k]);
    time[`reunioes.${k}`] = { atual: a, anterior: b, delta: delta(a, b) };
  });
  const pessoas = {}; const projetos = {};
  Object.keys(A.pessoas || {}).forEach((a) => { pessoas[a] = comparaObj(A.pessoas[a], (B.pessoas || {})[a], CHAVES_PESSOA); });
  Object.keys(A.projetos || {}).forEach((k) => { projetos[k] = comparaObj(A.projetos[k], (B.projetos || {})[k], CHAVES_PROJ); });
  const top = (arr) => arr.filter((x) => x.desvio !== 0).sort((x, y) => Math.abs(y.desvio) - Math.abs(x.desvio)).slice(0, 5);
  const desvios = {
    pessoas: top(Object.entries(A.pessoas || {}).filter(([, p]) => p.plan > 0).map(([a, p]) => ({ a, nome: p.nome, plan: p.plan, real: p.real, desvio: p.real - p.plan }))),
    projetos: top(Object.entries(A.projetos || {}).filter(([, p]) => p.orc > 0).map(([k, p]) => ({ p: k, nome: p.nome, orc: p.orc, real: p.real, desvio: p.real - p.orc }))),
  };
  const variacoes = {
    pessoas: top(Object.entries(pessoas).map(([a, c]) => ({ a, nome: (A.pessoas[a] || {}).nome, chave: 'real', desvio: c.real.delta == null ? 0 : c.real.delta }))),
    projetos: top(Object.entries(projetos).map(([k, c]) => ({ p: k, nome: (A.projetos[k] || {}).nome, chave: 'real', desvio: c.real.delta == null ? 0 : c.real.delta }))),
  };
  return { semana: A.semana || '', anterior: B.semana || '', time, pessoas, projetos, desvios, variacoes };
}

// ---- papel no servidor (porte do papeisDe/souAprovador de 01-nucleo.js) ----
const PAPEIS = ['consultor', 'gestor', 'negocio', 'diretoria', 'admin'];
const VE_TUDO = ['gestor', 'negocio', 'diretoria', 'admin'];
function ehAprovador(cfg, quem) {
  const gs = (((cfg || {}).gestores) || []).map((x) => String((x && (x.a || x.email)) || x || '').trim().toLowerCase()).filter(Boolean);
  if (gs.length) return gs.includes(String(quem.accountId || '').toLowerCase()) || gs.includes(String(quem.email || '').toLowerCase());
  return /diego/i.test(`${quem.nome || ''} ${quem.email || ''}`);   // aprovador legado, como no painel e no planejamento
}
/** Papéis da pessoa (cfg.papeis por accountId/e-mail + cfg.gestores) — LENTE, nunca permissão; aqui decide o recorte da foto. */
export function papeisDe(cfg, quem) {
  const q = quem || {};
  const m = (cfg && cfg.papeis && typeof cfg.papeis === 'object') ? cfg.papeis : {};
  const chaves = [String(q.accountId || ''), String(q.email || '')].map((x) => x.trim().toLowerCase()).filter(Boolean);
  let ps = [];
  Object.keys(m).forEach((k) => { if (chaves.includes(String(k).trim().toLowerCase())) ps = ps.concat(Array.isArray(m[k]) ? m[k] : String(m[k] || '').split(',')); });
  ps = ps.map((x) => String(x || '').trim().toLowerCase()).filter((x) => PAPEIS.includes(x));
  const aprov = ehAprovador(cfg, q);
  if (!ps.length) ps = [aprov ? 'gestor' : 'consultor'];
  else if (aprov && !ps.includes('gestor') && !ps.includes('admin')) ps.push('gestor');
  return [...new Set(ps)];
}
export function veTudo(papeis) { return (papeis || []).some((p) => VE_TUDO.includes(p)); }
/** Projetos em que a pessoa é gerente (cfg.projGerentes) — leitor, não cria o objeto. */
export function meusProjetos(cfg, accountId) {
  const m = (cfg && cfg.projGerentes && typeof cfg.projGerentes === 'object') ? cfg.projGerentes : {};
  return Object.keys(m).filter((k) => Array.isArray(m[k]) && m[k].map(String).includes(String(accountId || ''))).sort();
}
/**
 * Recorte da foto por papel: gestor/negocio/diretoria/admin veem tudo; os demais recebem o
 * `time`, a PRÓPRIA linha em `pessoas` e só os `projetos` em que são gerentes (com o porPessoa
 * desses projetos — é a lista que o gerente cobra); nenhum outro projeto (e o porPessoa dos
 * outros) viaja. `realFechado` e `ia` seguem a mesma regra.
 * Aceita `papeis` (a lista do papeisDe) ou `papel` (um só, em texto).
 */
export function recorteParaPapel(foto, { papeis, papel, accountId } = {}) {
  const ps = Array.isArray(papeis) ? papeis : (papel ? [String(papel)] : []);
  if (!foto || veTudo(ps)) return foto;
  const a = String(accountId || '');
  const so = (obj, cond) => Object.fromEntries(Object.entries(obj || {}).filter(([k, v]) => cond(k, v)));
  const gerente = (k) => Array.isArray(((foto.projetos || {})[k] || {}).gerentes) && foto.projetos[k].gerentes.map(String).includes(a);
  const out = { ...foto, pessoas: so(foto.pessoas, (k) => k === a), projetos: so(foto.projetos, (k) => gerente(k)) };
  if (foto.realFechado) {
    out.realFechado = { time: foto.realFechado.time, pessoas: so(foto.realFechado.pessoas, (k) => k === a), projetos: so(foto.realFechado.projetos, (k) => gerente(k)) };
  }
  return out;
}

// ---- Supabase: fotos guardadas em linhas próprias da jirainsight_config (o GET /api/config só devolve `default`) ----
function sbDe(sb) {
  if (sb && sb.base && sb.headers) return sb;
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
async function sbRows(r, rot) { if (!r.ok) throw new Error(`Supabase ${r.status} (${rot}): ${(await r.text()).slice(0, 200)}`); return r.json(); }
export const idFoto = (seg) => `semanal_${seg}`;

/** Planos da semana (todas as pessoas) já normalizados para o calculaFoto. Sem Supabase → vazio. */
export async function lePlanos(seg, sb) {
  const S = sbDe(sb); if (!S) return { planos: [], itens: [] };
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${T_PLAN}?semana_inicio=eq.${seg}&select=id,account_id,usuario_nome,usuario_email,semana_inicio,status,versao,updated_at,enviado_em`, { headers: S.headers }), 'planos');
  const planos = (Array.isArray(rows) ? rows : []).map((p) => ({ id: p.id, accountId: p.account_id, nome: p.usuario_nome || '', email: p.usuario_email || '', semana: p.semana_inicio, status: p.status, versao: p.versao, atualizadoEm: p.updated_at, enviadoEm: p.enviado_em }));
  let itens = [];
  const ids = planos.map((p) => p.id).filter(Boolean);
  if (ids.length) {
    const ri = await sbRows(await fetch(`${S.base}/rest/v1/${T_ITENS}?planejamento_id=in.(${ids.join(',')})&select=planejamento_id,data,projeto,horas_planejadas`, { headers: S.headers }), 'itens');
    itens = (Array.isArray(ri) ? ri : []).map((i) => ({ planId: i.planejamento_id, data: i.data, projeto: i.projeto, horas: Number(i.horas_planejadas) || 0 }));
  }
  return { planos, itens };
}
/** Grava (upsert) a foto em `semanal_<seg>` e poda o histórico a SEMANAL_MAX. */
export async function gravaFoto(foto, sb) {
  const S = sbDe(sb); if (!S) throw new Error('Supabase não configurado — a foto semanal precisa dele.');
  const r = await fetch(`${S.base}/rest/v1/${TABELA}?on_conflict=id`, {
    method: 'POST', headers: { ...S.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id: idFoto(foto.semana), data: foto, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} (gravar foto): ${(await r.text()).slice(0, 200)}`);
  const poda = await podaFotos(S);
  return { id: idFoto(foto.semana), ...poda };
}
/** Mantém só as SEMANAL_MAX fotos mais recentes (o id `semanal_AAAA-MM-DD` ordena por data). */
export async function podaFotos(sb, max) {
  const S = sbDe(sb); if (!S) return { total: 0, apagadas: 0 };
  const teto = max || SEMANAL_MAX;
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.semanal_*&select=id&order=id.asc`, { headers: S.headers }), 'listar fotos');
  const ids = (Array.isArray(rows) ? rows : []).map((x) => x.id).filter((id) => /^semanal_\d{4}-\d{2}-\d{2}$/.test(id));
  const sobra = ids.length - teto;
  if (sobra <= 0) return { total: ids.length, apagadas: 0 };
  const velhas = ids.slice(0, sobra);
  const r = await fetch(`${S.base}/rest/v1/${TABELA}?id=in.(${velhas.map(encodeURIComponent).join(',')})`, { method: 'DELETE', headers: { ...S.headers, Prefer: 'return=minimal' } });
  if (!r.ok) throw new Error(`Supabase ${r.status} (podar fotos)`);
  return { total: ids.length - velhas.length, apagadas: velhas.length };
}
/** As `n` fotos mais recentes até a semana `ate` (segunda), mais recente primeiro. */
export async function leFotos({ ate, n } = {}, sb) {
  const S = sbDe(sb); if (!S) return [];
  const lim = Math.max(1, Math.min(52, Number(n) || 8));
  const teto = RE_DATA.test(ate || '') ? `&id=lte.${idFoto(ate)}` : '';
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.semanal_*${teto}&select=id,data&order=id.desc&limit=${lim}`, { headers: S.headers }), 'ler fotos');
  return (Array.isArray(rows) ? rows : []).map((x) => x.data).filter((f) => f && f.v === SEMANAL_V && f.semana);
}
/**
 * Anota campos na foto já gravada da semana `seg` (merge raso sobre `data`: `realFechado`, `ia`).
 * Lê-modifica-grava a linha inteira porque o PostgREST não faz merge de JSON; o resto da foto
 * fica como está. false = não havia foto (nunca cria uma).
 */
export async function anotaFoto(seg, patch, sb) {
  const S = sbDe(sb); if (!S) return false;
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=eq.${idFoto(seg)}&select=data`, { headers: S.headers }), 'ler foto');
  const atual = Array.isArray(rows) && rows[0] && rows[0].data;
  if (!atual) return false;
  const r = await fetch(`${S.base}/rest/v1/${TABELA}?id=eq.${idFoto(seg)}`, {
    method: 'PATCH', headers: { ...S.headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ data: { ...atual, ...(patch || {}) }, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} (anotar foto: ${Object.keys(patch || {}).join(',')})`);
  return true;
}
/** Anota o realizado FECHADO na foto da semana `seg` (a execução seguinte chama isto). false = não havia foto. */
export function marcaRealFechado(seg, realFechado, sb) { return anotaFoto(seg, { realFechado }, sb); }

// ---- orquestrador: busca as fontes em paralelo (com tetos) e monta a foto ----
const depsPadrao = () => ({ jiraSearchAll, worklogsEnriquecidos, coletaAtividade, jiraUsuariosAtivos, buscaAbertos, carregaCatalogoProjetos, lePlanos });
// Uma issue do Jira → linha {k,p,t,a,d}: `quem` é o campo da pessoa (reporter nos criados,
// assignee nos concluídos) e `campoData` o carimbo que define a janela (created/resolutiondate).
const linhaTicket = (it, quem, campoData) => {
  const f = it.fields || {}; const u = f[quem] || {};
  return { k: it.key, p: (f.project && f.project.key) || String(it.key).split('-')[0], pNome: (f.project && f.project.name) || '', t: (f.issuetype && f.issuetype.name) || '', a: u.accountId || '', d: f[campoData] || '' };
};
/**
 * Monta a foto da semana `seg` (segunda; qualquer data da semana serve) buscando as fontes em
 * PARALELO: Jira (criados/concluídos por created/resolved, abertos, atividade), Clockwork
 * (worklogs desta semana E da anterior, numa leitura só) e Supabase (planos). Devolve também o
 * realizado FECHADO da semana anterior, para o chamador gravar na foto dela.
 * @returns {{ foto:object, anterior:{ semana:string, realFechado:object } }}
 */
export async function montaFotoSemanal({ seg, cfg, deps, agora } = {}) {
  const D = { ...depsPadrao(), ...(deps || {}) };
  const now = agora ? new Date(agora) : new Date();
  const segunda = segundaDe(seg || spDate(now));
  if (!segunda) throw new Error('Semana inválida.');
  // `ate` (sexta) é o fim da janela dos TICKETS e o rótulo da foto; os WORKLOGS vão até o domingo
  // (fimSem), como o plano — e o realizado FECHADO da semana anterior vai até o domingo dela (ateAnt).
  const ate = addDias(segunda, 4); const fimSem = addDias(segunda, 6); const segAnt = addDias(segunda, -7); const ateAnt = addDias(segunda, -1);
  const fotoEm = now.toISOString(); const diaFoto = spDate(now);
  // Janela dos tickets: da segunda 00:00 (SP) até o momento da foto — ou até a sexta 23:59, quando
  // a foto é de uma semana passada. A JQL compara datas no FUSO DO PERFIL da conta de serviço, e
  // por isso ela só CERCA a janela, com um dia de folga de cada lado; o corte exato é feito aqui,
  // pelos carimbos ISO (com offset) que o Jira devolve — a mesma tática do coletaAtividade.
  const iniISO = `${segunda}T00:00:00-03:00`;
  const fimISO = diaFoto <= ate ? fotoEm : `${ate}T23:59:59.999-03:00`;
  const jqlDe = addDias(segunda, -1); const jqlAte = addDias(diaFoto <= ate ? diaFoto : ate, 2);
  const t0 = Date.parse(iniISO); const t1 = Date.parse(fimISO);
  const naJanela = (x) => { const t = Date.parse(x.d || ''); return t >= t0 && t <= t1; };
  const C = cfg || {};

  const [wlTudo, criRaw, concRaw, ab, atv, usuarios, planos, catalogo] = await Promise.all([
    D.worklogsEnriquecidos(segAnt, fimSem, { comentarios: true }),
    D.jiraSearchAll({ jql: `created >= "${jqlDe}" AND created < "${jqlAte}" ORDER BY created ASC`, fields: ['project', 'issuetype', 'reporter', 'created'], pageSize: 100, maxPages: TETO_TICKETS }),
    D.jiraSearchAll({ jql: `resolved >= "${jqlDe}" AND resolved < "${jqlAte}" ORDER BY resolved ASC`, fields: ['project', 'issuetype', 'assignee', 'resolutiondate'], pageSize: 100, maxPages: TETO_TICKETS }),
    // Os abertos vêm com os PARADOS primeiro (updated ASC): se o teto de páginas for batido, o que
    // sobra é justamente a lista que o gerente cobra — com updated DESC o corte apagava os mais parados.
    D.buscaAbertos({ ordem: 'asc' }),
    D.coletaAtividade({ startDate: segunda, startISO: iniISO, endISO: fimISO, maxPages: TETO_ATIVIDADE }),
    D.jiraUsuariosAtivos(),
    D.lePlanos(segunda),
    D.carregaCatalogoProjetos().catch(() => []),   // sem catálogo a foto sai com a chave como nome
  ]);
  const projetosCat = {};
  (Array.isArray(catalogo) ? catalogo : []).forEach((p) => { if (p && p.key) projetosCat[p.key] = { nome: p.nome || p.key, categoria: p.categoria || '' }; });
  Object.entries((wlTudo && wlTudo.projetos) || {}).forEach(([k, p]) => { if (!projetosCat[k]) projetosCat[k] = { nome: (p && p.nome) || k, categoria: (p && p.categoria) || '' }; });
  const worklogs = (wlTudo && wlTudo.worklogs) || [];
  const foto = calculaFoto({
    seg: segunda, ate, fotoEm, cfg: C, planos: planos.planos, itens: planos.itens,
    worklogs, abertos: ab.abertos, atividade: atv,
    criados: (criRaw.issues || []).map((it) => linhaTicket(it, 'reporter', 'created')).filter(naJanela),
    concluidos: (concRaw.issues || []).map((it) => linhaTicket(it, 'assignee', 'resolutiondate')).filter(naJanela),
    usuarios, projetosCat, parado: (C.relSemanal || {}).parado,
    truncado: { atividade: !!atv.truncado, abertos: !!ab.truncado, worklogs: !!(wlTudo && wlTudo.truncado), tickets: !!(criRaw.truncado || concRaw.truncado) },
  });
  const anterior = { semana: segAnt, realFechado: calculaRealFechado({ worklogs, seg: segAnt, ate: ateAnt, cfg: C }) };
  return { foto, anterior };
}
