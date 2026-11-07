// 📊 DASHBOARD DE KPIs — fotos semanais e mensais dos indicadores (pedido do usuário, 2026-11-06/07: "passe essa tela para os
// insights, crie diversas visões principalmente que possa comparar em uma linha de tempo os indicadores ... leve em consideração
// desempenho: hoje está lento quando eu vejo por ano").
//
// POR QUÊ: a 🏦 Controladoria lia o Clockwork inteiro (mais o enriquecimento de cada issue no Jira) a cada abertura — por ano são
// dezenas de segundos. A saída é a mesma das 📸 fotos da Rentabilidade e do 📊 relatório semanal: o SERVIDOR fotografa os indicadores
// por SEMANA e por MÊS (linhas `kpis_<segunda>` e `kpim_<AAAA-MM>` em jirainsight_config, nunca na cfg 'default') e as telas só LEEM a
// fatia (GET /api/config?kpis=1). As funções de cálculo são PURAS (calculaKpi*, kpiFinanceiro); só `montaKpi`/`fotosKpi` buscam as
// fontes, através de `deps` trocáveis (nos testes) — o mesmo padrão do montaFotoSemanal de semanal.js. Quem grava é o api/teams.js
// (fase `kpis` do ?cron=1 e `?tipo=kpis` manual) e quem lê é o api/config.js (`?kpis=1`, `POST ?kpis=1 {acao:'atualizar'}`).
//
// ---------------------------------------------------------------------------------------
// FORMATO DAS FOTOS (v1) — contrato com a tela (public/js/18c-dashboard.js) e com a 🏦 Controladoria rápida (ctDadosDeFotos)
// ---------------------------------------------------------------------------------------
// Horas em HORAS decimais (2 casas), R$ com 2 casas; percentuais NÃO são gravados (a tela calcula) — as únicas exceções são `time.exec`
// e `time.ader` (0–100 inteiro ou null), porque dependem de uma base que a foto não carrega (só o real de quem tem plano).
// `fin`/`horas` existem nas duas granularidades; `saude` e `time` SÓ na semanal (o mês é agregado pela tela a partir das semanas
// cuja segunda cai no mês — e a tela diz isso).
//   kpis_<segunda> / kpim_<AAAA-MM> = {
//     v:1, gran:'sem'|'mes', chave:'2026-11-02'|'2026-11', de, ate, fotoEm, parcial:bool (ate >= dia da foto), cfgRev,
//     truncado:{ worklogs, abertos, tickets },
//     fin:  { receita, custo, custoGest, semCusto:[accountId],                       // R$; semCusto = quem apontou SEM custo/h próprio
//             porCat:{ [cat]:{ h, hf, r, c, cg } },                                  // h horas · hf faturáveis · r receita · c custo · cg custo de gestão
//             porProj:{ [KEY]:{ nome, cat, h, hf, r, c, cg, vh, tipos:{[tipo]:h}, pessoas:[accountId] } },
//             porPessoa:{ [a]:{ nome, h, hf, c, gestor:bool, nivel:'junior|pleno|senior|' } } },
//     horas:{ real, fat, naoFat, vend,                                                // vend = horas vendidas rateadas no período (rpVendEntre dos planos da Rentabilidade com projeto)
//             porProj:{ [KEY]:{ h, hf, vend, nome, cat } },                          // nome/cat: ACRESCENTADOS para quem não recebe `fin` (consultor) saber o projeto
//             porCat:{ [cat]:{ h, hf } },                                            // idem: a quebra por categoria sem R$
//             porNivel:{ [nivel]:h }, porTipo:{ [tipo]:h } },
//     saude:{ vencidos, bugs, parados, semVenc, semResp, criados, concluidos, saldo,  // sobre os ABERTOS do momento da foto (criados/concluídos: a janela da semana)
//             semaforos:{ verde, amarelo, vermelho, sem },                           // linhas sr_<KEY> (campo saude) dos projetos ativos no Jira
//             exec:{ est, gasto },                                                   // horas estimadas × gastas dos tickets ABERTOS (o catálogo do Jira não traz esforço por projeto)
//             porProj:{ [KEY]:{ vencidos, bugs, parados, criados, concluidos, semaforo, est, gasto } },
//             retro?:true },                                                         // ver "foto retroativa" abaixo
//     time: { cap, plan, real, realFat, exec, ader,   // realFat pela MESMA regra de `horas.fat` (categoria), não pelo tipo do semanal.js semPlano, naoFeito, pessoasComPlano, pessoas, ausH,
//             porPessoa:{ [a]:{ nome, cap, plan, real } } }
//   }
// Regras (as MESMAS das telas de hoje — é isso que o gate scripts/check-kpi-paridade.mjs confere):
//   · faturável = `w.f` (tipo, do servidor) E categoria do projeto faturável (CAT_FATURAVEL do 01-nucleo; sem categoria, o prefixo
//     "XXX |" do nome) — `kpiFaturavel`, porte de fatSiglaDe/wFat.
//   · receita = Σ horas FATURÁVEIS × valorHora do contrato do projeto (o que TEM valorHora — ctContratoDe); sem contrato, 0 e `vh:0`.
//   · custo = Σ horas × custo/h da pessoa (rpCustoH = alocCustoH; sem custo próprio, cfg.ctrl.custoPadrao); custoGest = o de quem está
//     em cfg.gestores (accountId ou e-mail — ctGestoresSet). semCusto = sem custo PRÓPRIO (como o ctDados), mesmo que o padrão cubra.
//   · nivel = cfg.perfis[a].nivel (junior|pleno|senior, senão '').
//   · semana = segunda→domingo; mês civil. Fotos do `fin`/`horas` NÃO filtram cfg.ocultos (a Controladoria também não); o bloco `time` sim.
//   · 🕰 FOTO RETROATIVA: a foto de uma semana que JÁ ACABOU quando foi tirada (backfill do cron/manual) não tem como saber os abertos
//     daquela época — `saude` leva só criados/concluídos/saldo (JQL created/resolved na janela, que são históricos) e `retro:true`; os
//     campos de momento (vencidos, bugs, parados, semVenc, semResp, semaforos, exec) vão `null`. Semana FECHADA que já tinha foto
//     anterior COM retrato real (a parcial da sexta, ou uma completa) é refeita para fechar fin/horas/time e CONSERVA os campos de
//     MOMENTO dessa foto (vencidos, bugs, parados, semVenc, semResp, semaforos, exec e porProj.vencidos/bugs/parados/semaforo/est/gasto),
//     mas refaz criados/concluídos/saldo (e porProj.criados/concluidos) com a SEMANA INTEIRA — o fluxo de sexta 07:00 a domingo não pode
//     ficar cortado na foto de sexta (revisão de 2026-11-07). Uma foto anterior que já é `retro` NÃO vale como retrato.
//   · 🚦 SEMÁFORO: `saude.semaforos`/`porProj.semaforo` leem SÓ o semáforo MANUAL (campo `saude` das linhas sr_<KEY>, `leSemaforos`); a
//     sugestão automática da tela de Status report (srSaudeAuto) NÃO entra na foto — projeto sem semáforo manual conta como `sem`.
//   · Retenção KPIS_MAX=104 semanas · KPIM_MAX=36 meses (poda na gravação). Idempotente (upsert por id). cfgRev = updated_at da config.
// Estado do agendador (teams_estado): `ultimaFotoKpi` = último dia em que a semana e o mês CORRENTES foram refeitos.
import { jiraSearchAll, worklogsEnriquecidos, jiraUsuariosAtivos } from './util.js';
import { addDias, rpVendEntre, rpUltimoDia, pcYmSoma, rpCustoH } from './rentab.js';
import { buscaAbertos } from '../vencimentos.js';
import { carregaCatalogoProjetos } from './projetos.js';
import {
  dataValida, segundaDe, calculaTime, contaAbertos, lePlanos, veTudo, foraVigencia, uteisSemana, PARADO_PADRAO,
} from './semanal.js';
import { podaPrefixo, leCfgRev } from './rentabFoto.js';

export const KPI_V = 1;
export const KPIS_MAX = 104;           // semanas guardadas (2 anos)
export const KPIM_MAX = 36;            // meses guardados (3 anos)
export const KPI_HORA = '07:00';       // 1º tique do dia útil em que o cron fotografa (depois de rentab 06:00 e custos 06:30)
export const KPI_MAX_TIQUE = 3;        // fotos por tique do cron (o tique tem 60 s)
export const KPI_SEMANAS_BACKFILL = 52;
export const KPI_MESES_BACKFILL = 24;   // revisão de 2026-11-07: era 12 e "ano passado" na leitura rápida nunca fechava (a retenção já é 36)
export const KPI_MESES_POR_TIQUE = 1;   // meses fechados por tique (o mês é a foto mais cara: lê o mês inteiro do Clockwork)
export const KPI_FOTO_PRIMEIRA_MS = 15000;  // estimativa da 1ª foto do tique, antes de medir uma de verdade (orçamento)
export const RE_ID_KPIS = /^kpis_\d{4}-\d{2}-\d{2}$/;
export const RE_ID_KPIM = /^kpim_\d{4}-\d{2}$/;
const TABELA = 'jirainsight_config';
const RE_BUG = /bug|erro|defeito|incidente|falha/i;          // a régua do plano (o ?statusrep usa a variante com \b — outra tela, outra regra)
const RE_ARQUIVADO = /(^|[^A-Za-z])ARQ([^A-Za-z]|$)/;       // "ARQ" some do painel inteiro (api/projetos.js)
const NIVEIS = ['junior', 'pleno', 'senior'];
const SEMAFOROS = ['verde', 'amarelo', 'vermelho'];

// Ganchos de teste: o que for posto aqui vence as dependências padrão (os handlers de config/teams não recebem `deps`).
export const KPI_DEPS = {};

/**
 * Até onde o servidor fotografa para trás (revisão de 2026-11-07): `horizonteMes` ('AAAA-MM') = o mês fechado mais antigo e `horizonteSem`
 * ('AAAA-MM-DD') = a segunda mais antiga, a partir de `hoje` e das constantes de backfill — a tela usa isto em vez de copiar a constante.
 */
export function kpiHorizonte(hoje) {
  const h = String(hoje || '');
  const seg = segundaDe(h);
  return {
    horizonteMes: /^\d{4}-\d{2}/.test(h) ? pcYmSoma(h.slice(0, 7), -KPI_MESES_BACKFILL) : '',
    horizonteSem: seg ? addDias(seg, -7 * KPI_SEMANAS_BACKFILL) : '',
  };
}

// ---- porte do 01-nucleo.js (CAT_FATURAVEL/fatSiglaDe/wFat) e do relSiglaDe do 18-controladoria-relatorios.js ----
const CAT_FATURAVEL = { DEA: 'sim', DEF: 'sim', PEA: 'sim', PEF: 'sim', DAMS: 'sim', PAMS: 'sim', ARQ: 'na', IMI: 'nao', IPA: 'nao', ITPR: 'nao' };
const REL_SIGLAS = ['DEA', 'DEF', 'PEA', 'PEF', 'DAMS', 'PAMS', 'ARQ', 'IMI', 'IPA', 'ITPR'];
export function relSiglaDe(cat) {
  const c = String(cat || '').trim();
  const m = c.match(/^([A-Z]{2,5})\s*\|/);
  if (m && REL_SIGLAS.includes(m[1])) return m[1];
  const t = c.toLowerCase();
  if (/arquiv/.test(t)) return 'ARQ';
  if (/ams/.test(t)) return /parceria/.test(t) ? 'PAMS' : 'DAMS';
  if (/melhorias?\s+internas/.test(t)) return 'IMI';
  if (/produtos|acelerador/.test(t)) return 'IPA';
  if (/tarefas|processos|rotinas/.test(t)) return 'ITPR';
  if (/escopo\s+aberto/.test(t)) return /parceria/.test(t) ? 'PEA' : 'DEA';
  if (/escopo\s+fechado/.test(t)) return /parceria/.test(t) ? 'PEF' : 'DEF';
  return '';
}
/** Sigla da categoria (ou, sem categoria no Jira — ex.: o IMECI —, do prefixo "IMI | …" do nome). Aceita a própria sigla. */
export function fatSiglaDe(cat, nome) {
  const c = String(cat || '').trim(); if (CAT_FATURAVEL[c]) return c;
  let s = (c && c !== 'Sem categoria') ? relSiglaDe(c) : '';
  if (!s) { const m = String(nome || '').match(/^\s*([A-Z]{2,5})\s*\|/); if (m && CAT_FATURAVEL[m[1]]) s = m[1]; }
  return s;
}
/** O worklog conta como faturável? `w.f` (tipo) E projeto de categoria faturável — o wFat(w, cat) do painel. Sigla desconhecida = 'na' (não). */
export function kpiFaturavel(w, cat, nome) {
  if (!(w && w.f)) return false;
  return (CAT_FATURAVEL[fatSiglaDe(cat, nome)] || 'na') === 'sim';
}
/** Quem é GESTOR (cfg.gestores aceita accountId OU e-mail) — porte do ctGestoresSet; `pessoas` = {accountId:{email}}. */
export function kpiGestoresSet(cfg, pessoas) {
  const gs = ((cfg && cfg.gestores) || []).map((x) => String((x && (x.a || x.email)) || x || '').trim().toLowerCase()).filter(Boolean);
  const set = new Set();
  Object.entries(pessoas || {}).forEach(([a, p]) => {
    if (gs.includes(String(a).toLowerCase()) || (p && p.email && gs.includes(String(p.email).toLowerCase()))) set.add(a);
  });
  gs.forEach((g) => { if (/^[\w:-]{10,}$/.test(g)) set.add(g); });
  return set;
}
/** Contrato do projeto — se houver mais de um, prefere o que TEM valor-hora (ctContratoDe). */
export function kpiContratoDe(cfg, p) {
  const cs = ((cfg && cfg.contratos) || []).filter((c) => c && (c.projetos || []).includes(p));
  return cs.find((c) => Number(c.valorHora) > 0) || cs[0] || null;
}
export function kpiNivelDe(cfg, a) {
  const n = (((cfg && cfg.perfis) || {})[a] || {}).nivel;
  return NIVEIS.includes(n) ? n : '';
}

const r2 = (x) => { const v = Math.round((Number(x) || 0) * 100) / 100; return v === 0 ? 0 : v; };   // sem -0
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function spDate(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); }

// ---- chaves e períodos ----
export function kpiChaveValida(gran, chave) {
  const c = String(chave || '');
  if (gran === 'mes') return /^20\d{2}-(0[1-9]|1[0-2])$/.test(c);
  if (gran === 'sem') return dataValida(c) && segundaDe(c) === c;
  return false;
}
export const idKpi = (gran, chave) => `${gran === 'mes' ? 'kpim_' : 'kpis_'}${chave}`;
/** { de, ate } do período: semana = segunda→domingo · mês = dia 1→último dia. null se a chave é inválida. */
export function kpiPeriodo(gran, chave) {
  if (!kpiChaveValida(gran, chave)) return null;
  return gran === 'mes' ? { de: `${chave}-01`, ate: rpUltimoDia(chave) } : { de: chave, ate: addDias(chave, 6) };
}
/** A chave do período que contém a data (ou, se já for uma chave, ela mesma): segunda da semana · AAAA-MM. '' se inválida. */
export function kpiChaveDe(gran, dataOuChave) {
  const s = String(dataOuChave || '');
  if (gran === 'mes') { const ym = s.slice(0, 7); return kpiChaveValida('mes', ym) ? ym : ''; }
  return segundaDe(s.slice(0, 10));
}
/** As `n` chaves terminando no período que contém `ate`, em ordem cronológica (n limitado à retenção). */
export function kpiChaves(gran, ate, n) {
  const lim = gran === 'mes' ? KPIM_MAX : KPIS_MAX;
  const k = clamp(Math.floor(Number(n)) || (gran === 'mes' ? KPI_MESES_BACKFILL : KPI_SEMANAS_BACKFILL), 1, lim);
  const fim = kpiChaveDe(gran, ate); if (!fim) return [];
  const out = [];
  for (let i = k - 1; i >= 0; i -= 1) out.push(gran === 'mes' ? pcYmSoma(fim, -i) : addDias(fim, -7 * i));
  return out;
}

// ===========================================================================
// Cálculo PURO
// ===========================================================================
/**
 * `fin` e a parte de `horas` que vem dos worklogs (SEM `vend`, que vem dos planos). Pura. É o equivalente, para um período, do que o
 * ctDados() da 🏦 Controladoria soma em tela — o gate de paridade confere os dois lado a lado.
 * @param {Array} worklogs [{a,s(segundos),d,p,t,f}]  @param {object} cfg  @param {object} projMeta {KEY:{nome,categoria}}
 * @param {{pessoas?:object}} opts pessoas = {accountId:{nome,email}} (nome e e-mail para o custo de gestão)
 * @returns {{ fin:object, horas:object }}
 */
export function kpiFinanceiro(worklogs, cfg, projMeta, opts) {
  const C = cfg || {}; const meta = projMeta || {}; const pessoas = (opts && opts.pessoas) || {};
  const gest = kpiGestoresSet(C, pessoas);
  const custoPad = Math.max(0, Number((C.ctrl || {}).custoPadrao) || 0);
  const nomeDe = (a) => (pessoas[a] && pessoas[a].nome) || a;
  const contratos = {}; const semCusto = new Set();
  const porCat = {}; const porProj = {}; const porPessoa = {}; const porNivel = {}; const porTipo = {};
  let seg = 0; let segFat = 0; let custo = 0; let custoGest = 0; let rec = 0;
  (worklogs || []).forEach((w) => {
    if (!w || !w.a) return;
    const s = Number(w.s) || 0; const h = s / 3600;
    const pm = meta[w.p] || {}; const cat = pm.categoria || 'Sem categoria';
    const chBase = rpCustoH(w.a, C); const ch = chBase > 0 ? chBase : custoPad;
    if (!(chBase > 0)) semCusto.add(w.a);
    const cu = h * ch;
    if (!(w.p in contratos)) contratos[w.p] = kpiContratoDe(C, w.p);
    const ct = contratos[w.p]; const vh = ct ? (Number(ct.valorHora) || 0) : 0;
    const fa = kpiFaturavel(w, cat, pm.nome); const rc = (fa && vh) ? h * vh : 0;
    const ehGest = gest.has(w.a); const tipo = w.t || '—'; const nivel = kpiNivelDe(C, w.a);
    const K = porCat[cat] = porCat[cat] || { h: 0, hf: 0, r: 0, c: 0, cg: 0 };
    K.h += h; if (fa) K.hf += h; K.r += rc; K.c += cu; if (ehGest) K.cg += cu;
    const P = porProj[w.p] = porProj[w.p] || { nome: pm.nome || w.p, cat, h: 0, hf: 0, r: 0, c: 0, cg: 0, vh, tipos: {}, pessoas: new Set() };
    P.h += h; if (fa) P.hf += h; P.r += rc; P.c += cu; if (ehGest) P.cg += cu; P.tipos[tipo] = (P.tipos[tipo] || 0) + h; P.pessoas.add(w.a);
    const U = porPessoa[w.a] = porPessoa[w.a] || { nome: nomeDe(w.a), h: 0, hf: 0, c: 0, gestor: ehGest, nivel };
    U.h += h; if (fa) U.hf += h; U.c += cu;
    porNivel[nivel] = (porNivel[nivel] || 0) + h; porTipo[tipo] = (porTipo[tipo] || 0) + h;
    seg += h; if (fa) segFat += h; custo += cu; rec += rc; if (ehGest) custoGest += cu;
  });
  const mapa = (o, f) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, f(o[k])]));
  const fin = {
    receita: r2(rec), custo: r2(custo), custoGest: r2(custoGest), semCusto: [...semCusto].sort(),
    porCat: mapa(porCat, (K) => ({ h: r2(K.h), hf: r2(K.hf), r: r2(K.r), c: r2(K.c), cg: r2(K.cg) })),
    porProj: mapa(porProj, (P) => ({ nome: P.nome, cat: P.cat, h: r2(P.h), hf: r2(P.hf), r: r2(P.r), c: r2(P.c), cg: r2(P.cg), vh: r2(P.vh),
      tipos: mapa(P.tipos, r2), pessoas: [...P.pessoas].sort() })),
    porPessoa: mapa(porPessoa, (U) => ({ nome: U.nome, h: r2(U.h), hf: r2(U.hf), c: r2(U.c), gestor: U.gestor, nivel: U.nivel })),
  };
  const horas = {
    real: r2(seg), fat: r2(segFat), naoFat: r2(seg - segFat), vend: 0,
    porProj: mapa(porProj, (P) => ({ h: r2(P.h), hf: r2(P.hf), vend: 0, nome: P.nome, cat: P.cat })),
    porCat: mapa(porCat, (K) => ({ h: r2(K.h), hf: r2(K.hf) })),
    porNivel: mapa(porNivel, r2), porTipo: mapa(porTipo, r2),
  };
  return { fin, horas };
}

/** Horas vendidas rateadas em [de, ate] pelos planos da Rentabilidade COM projeto: { total, porProj:{KEY:h} } (plano com dado ruim é ignorado). */
export function kpiVend(cfg, de, ate, hoje) {
  const planos = ((cfg && cfg.rentab && Array.isArray(cfg.rentab.planos)) ? cfg.rentab.planos : []).filter((p) => p && typeof p === 'object' && p.projeto);
  const porProj = {}; let total = 0;
  planos.forEach((p) => {
    let h = 0; try { h = rpVendEntre(p, de, ate, cfg, hoje); } catch (e) { h = 0; }
    if (!(h > 0) || !Number.isFinite(h)) return;
    const k = String(p.projeto).toUpperCase(); porProj[k] = (porProj[k] || 0) + h; total += h;
  });
  return { total, porProj };
}
/** Junta o `vend` em `horas` (cria a linha do projeto que só tem plano). Muta e devolve `horas`. */
function comVend(horas, vend, metaDe) {
  horas.vend = r2(vend.total);
  Object.entries(vend.porProj).forEach(([k, h]) => {
    const L = horas.porProj[k] = horas.porProj[k] || { h: 0, hf: 0, vend: 0, nome: (metaDe(k) || {}).nome || k, cat: (metaDe(k) || {}).categoria || 'Sem categoria' };
    L.vend = r2(h);
  });
  return horas;
}

const arq = (k, meta) => k === 'ARQ' || RE_ARQUIVADO.test((meta && meta.nome) || '') || RE_ARQUIVADO.test((meta && meta.categoria) || '');

/**
 * `saude` de uma semana (pura). Abertos = os de HOJE (buscaAbertos); criados/concluídos = a janela da semana ([{k,p}]).
 * `semaforos` = {KEY:'verde|amarelo|vermelho'} das linhas sr_*; `catalogo` = [{key,nome,categoria}] (projetos ativos no Jira).
 */
export function calculaSaude({ abertos, criados, concluidos, hoje, parado, catalogo, semaforos }) {
  const N = Number(parado) > 0 ? Number(parado) : PARADO_PADRAO;
  const cat = {}; (catalogo || []).forEach((p) => { if (p && p.key) cat[p.key] = p; });
  const temCat = Object.keys(cat).length > 0;
  const fora = (k) => arq(k, cat[k]);
  const ab = (abertos || []).filter((t) => t && t.k && !fora(t.p));
  const cri = (criados || []).filter((x) => x && x.k && !fora(x.p));
  const conc = (concluidos || []).filter((x) => x && x.k && !fora(x.p));
  const sr = semaforos || {};
  const norm = (k) => (SEMAFOROS.includes(sr[k]) ? sr[k] : 'sem');
  const C = contaAbertos(ab, hoje, N);
  const bugs = ab.filter((t) => RE_BUG.test(t.t || '')).length;
  const porProj = {};
  const L = (k) => (porProj[k] = porProj[k] || { vencidos: 0, bugs: 0, parados: 0, criados: 0, concluidos: 0, semaforo: norm(k), est: 0, gasto: 0 });
  const porAb = {}; ab.forEach((t) => { (porAb[t.p] = porAb[t.p] || []).push(t); });
  let est = 0; let gasto = 0;
  Object.entries(porAb).forEach(([k, lista]) => {
    const c = contaAbertos(lista, hoje, N); const l = L(k);
    l.vencidos = c.vencidos; l.parados = c.parados; l.bugs = lista.filter((t) => RE_BUG.test(t.t || '')).length;
    l.est = r2(lista.reduce((s, t) => s + (Number(t.est) || 0), 0) / 3600); l.gasto = r2(lista.reduce((s, t) => s + (Number(t.seg) || 0), 0) / 3600);
    est += l.est; gasto += l.gasto;
  });
  cri.forEach((x) => { L(x.p).criados += 1; }); conc.forEach((x) => { L(x.p).concluidos += 1; });
  const base = temCat ? Object.keys(cat).filter((k) => !fora(k)) : Object.keys(porProj);
  const semaf = { verde: 0, amarelo: 0, vermelho: 0, sem: 0 };
  base.forEach((k) => { semaf[norm(k)] += 1; });
  const ord = {}; Object.keys(porProj).sort().forEach((k) => { ord[k] = porProj[k]; });
  return {
    vencidos: C.vencidos, bugs, parados: C.parados, semVenc: C.semVenc, semResp: C.semResp,
    criados: cri.length, concluidos: conc.length, saldo: cri.length - conc.length,
    semaforos: semaf, exec: { est: r2(est), gasto: r2(gasto) }, porProj: ord,
  };
}
/** `saude` de uma semana que JÁ ACABOU quando foi fotografada: só o que é histórico (criados/concluídos); o resto vai null + retro:true. */
export function calculaSaudeRetro({ criados, concluidos, catalogo }) {
  const cat = {}; (catalogo || []).forEach((p) => { if (p && p.key) cat[p.key] = p; });
  const ok = (x) => x && x.k && !arq(x.p, cat[x.p]);
  const cri = (criados || []).filter(ok); const conc = (concluidos || []).filter(ok);
  const porProj = {};
  const L = (k) => (porProj[k] = porProj[k] || { criados: 0, concluidos: 0 });
  cri.forEach((x) => { L(x.p).criados += 1; }); conc.forEach((x) => { L(x.p).concluidos += 1; });
  const ord = {}; Object.keys(porProj).sort().forEach((k) => { ord[k] = porProj[k]; });
  return {
    retro: true, vencidos: null, bugs: null, parados: null, semVenc: null, semResp: null,
    criados: cri.length, concluidos: conc.length, saldo: cri.length - conc.length,
    semaforos: null, exec: null, porProj: ord,
  };
}

/**
 * Refoto de semana fechada (revisão de 2026-11-07): une o `porProj` da foto anterior (campos de MOMENTO) com o do fluxo da semana inteira
 * (criados/concluídos). Projeto só no fluxo entra zerado nos campos de momento; projeto só no retrato fica com criados/concluídos 0.
 */
export function mesclaPorProj(antes, fluxo) {
  const A = antes || {}; const F = fluxo || {}; const out = {};
  Array.from(new Set([...Object.keys(A), ...Object.keys(F)])).sort().forEach((k) => {
    const a = A[k] || { vencidos: 0, bugs: 0, parados: 0, semaforo: 'sem', est: 0, gasto: 0 };
    const f = F[k] || {};
    out[k] = { ...a, criados: f.criados || 0, concluidos: f.concluidos || 0 };
  });
  return out;
}
/** Retrato de MOMENTO aproveitável: objeto de `saude` que não é, ele mesmo, retroativo. */
export const retratoValido = (s) => !!(s && typeof s === 'object' && !s.retro);

/** Horas de ausência (cfg.ausencias × meta/dia) nos dias úteis da semana — o que a capacidade deixou de ter. Fora da vigência não conta. */
export function kpiAusH(seg, cfg, accountIds) {
  const C = cfg || {}; const mp = C.metasPessoa || {};
  const uteis = uteisSemana(seg, C);
  let s = 0;
  (accountIds || []).forEach((a) => {
    const meta = Math.max(0, Number(mp[a] != null ? mp[a] : (C.metaGlobalH != null ? C.metaGlobalH : 8)) || 0);
    uteis.forEach((d) => {
      if (foraVigencia(a, d, C)) return;
      if ((C.ausencias || []).some((x) => x && x.a === a && d >= x.de && d <= x.ate)) s += meta;
    });
  });
  return r2(s);
}
/** O bloco `time` da foto semanal (horas): o calculaTime do relatório semanal + ausH, em horas decimais. */
export function kpiTime({ seg, fotoEm, cfg, planos, itens, worklogs, usuarios, projMeta }) {
  const T = calculaTime({ seg, ate: addDias(seg, 4), fotoEm, cfg, planos, itens, worklogs, usuarios });
  const h = (s) => r2((Number(s) || 0) / 3600);
  // O calculaFoto do relatório semanal chama de faturável só o TIPO do ticket (w.f); o dashboard usa a regra da categoria (kpiFaturavel) em
  // TODO lugar — senão `time.realFat` e `horas.fat` diriam números diferentes para a mesma semana. Mesma base do `real` (seg→dom, fora de cfg.ocultos).
  const ocultos = new Set((((cfg || {}).ocultos) || []).map((o) => o && o.a).filter(Boolean));
  const fatSeg = (worklogs || []).reduce((acc, w) => {
    if (!w || !w.a || ocultos.has(w.a)) return acc;
    const d = String(w.d || '').slice(0, 10); if (d < seg || d > addDias(seg, 6)) return acc;
    const pm = (projMeta || {})[w.p] || {};
    return kpiFaturavel(w, pm.categoria, pm.nome) ? acc + (Number(w.s) || 0) : acc;
  }, 0);
  const porPessoa = {};
  Object.keys(T.pessoas).sort().forEach((a) => { const p = T.pessoas[a]; porPessoa[a] = { nome: p.nome, cap: h(p.cap), plan: h(p.plan), real: h(p.real) }; });
  const t = T.time;
  return {
    cap: h(t.cap), plan: h(t.plan), real: h(t.real), realFat: h(fatSeg), exec: t.exec, ader: t.ader,
    semPlano: h(t.semPlano), naoFeito: h(t.naoFeito), pessoasComPlano: t.pessoasComPlano, pessoas: t.pessoas,
    ausH: kpiAusH(seg, cfg, Object.keys(T.pessoas)), porPessoa,
  };
}

/** Cabeçalho comum das fotos. */
function cabecalho(gran, chave, per, now, cfgRev, truncado) {
  return { v: KPI_V, gran, chave, de: per.de, ate: per.ate, fotoEm: now.toISOString(), parcial: per.ate >= spDate(now), cfgRev: String(cfgRev || ''), truncado };
}
/**
 * A foto SEMANAL (pura): fin + horas + saude + time. `inp`: chave (segunda), fotoEm, cfg, worklogs (já no período), pessoas (dos worklogs),
 * projMeta, usuarios (elenco ativo), planos/itens (Supabase), abertos/semaforos/criados/concluidos/catalogo, retro, saudeAntes, truncado.
 */
export function calculaKpiSemana(inp) {
  const per = kpiPeriodo('sem', inp.chave); if (!per) throw new Error(`Semana inválida: "${inp.chave}" (use a segunda-feira, AAAA-MM-DD).`);
  const C = inp.cfg || {}; const now = inp.fotoEm ? new Date(inp.fotoEm) : new Date(); const hoje = spDate(now);
  const { fin, horas } = kpiFinanceiro(inp.worklogs, C, inp.projMeta, { pessoas: { ...(inp.usuarios || {}), ...(inp.pessoas || {}) } });
  comVend(horas, kpiVend(C, per.de, per.ate, hoje), (k) => (inp.projMeta || {})[k]);
  const retro = hoje > per.ate;
  let saude;
  if (retro && retratoValido(inp.saudeAntes)) {
    // conserva o MOMENTO da foto anterior e troca o FLUXO pelo da semana inteira (a foto de sexta cortava criados/concluídos às 07:00)
    const fluxo = calculaSaudeRetro({ criados: inp.criados, concluidos: inp.concluidos, catalogo: inp.catalogo });
    saude = { ...inp.saudeAntes, criados: fluxo.criados, concluidos: fluxo.concluidos, saldo: fluxo.saldo, porProj: mesclaPorProj(inp.saudeAntes.porProj, fluxo.porProj) };
  } else if (retro) saude = calculaSaudeRetro({ criados: inp.criados, concluidos: inp.concluidos, catalogo: inp.catalogo });
  else saude = calculaSaude({ abertos: inp.abertos, criados: inp.criados, concluidos: inp.concluidos, hoje, parado: (C.relSemanal || {}).parado, catalogo: inp.catalogo, semaforos: inp.semaforos });
  const time = kpiTime({ seg: per.de, fotoEm: now.toISOString(), cfg: C, planos: inp.planos, itens: inp.itens, worklogs: inp.worklogs, usuarios: inp.usuarios || {}, projMeta: inp.projMeta });
  const tr = inp.truncado || {};
  return { ...cabecalho('sem', inp.chave, per, now, inp.cfgRev, { worklogs: !!tr.worklogs, abertos: !!tr.abertos, tickets: !!tr.tickets }), fin, horas, saude, time };
}
/** A foto MENSAL (pura): fin + horas. `inp`: chave (AAAA-MM), fotoEm, cfg, worklogs (já no período), pessoas, projMeta, truncado. */
export function calculaKpiMes(inp) {
  const per = kpiPeriodo('mes', inp.chave); if (!per) throw new Error(`Mês inválido: "${inp.chave}" (use AAAA-MM).`);
  const C = inp.cfg || {}; const now = inp.fotoEm ? new Date(inp.fotoEm) : new Date(); const hoje = spDate(now);
  const { fin, horas } = kpiFinanceiro(inp.worklogs, C, inp.projMeta, { pessoas: inp.pessoas });
  comVend(horas, kpiVend(C, per.de, per.ate, hoje), (k) => (inp.projMeta || {})[k]);
  const tr = inp.truncado || {};
  return { ...cabecalho('mes', inp.chave, per, now, inp.cfgRev, { worklogs: !!tr.worklogs, abertos: false, tickets: false }), fin, horas };
}

// ===========================================================================
// Recorte por papel (o servidor decide; a tela só esconde o aviso)
// ===========================================================================
/**
 * gestor/negócio/diretoria/admin (`veTudo`) recebem a foto inteira. Os demais NÃO recebem nenhum R$ (receita, custo, margem, custo/h):
 * `fin` fica só com a PRÓPRIA linha de `porPessoa` (horas, sem `c`); `horas` e `saude` seguem inteiros; `time.porPessoa` só a própria.
 */
export function recorteKpi(foto, { papeis, accountId } = {}) {
  if (!foto || veTudo(papeis)) return foto;
  const a = String(accountId || '');
  const out = { ...foto };
  const eu = ((foto.fin || {}).porPessoa || {})[a];
  if (foto.fin) {
    out.fin = { porPessoa: eu ? { [a]: { nome: eu.nome, h: eu.h, hf: eu.hf, gestor: false, nivel: eu.nivel } } : {} };
  }
  if (foto.time) {
    const ep = (foto.time.porPessoa || {})[a];
    out.time = { ...foto.time, porPessoa: ep ? { [a]: ep } : {} };
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

/** Grava (upsert) a foto em `kpis_<segunda>`/`kpim_<AAAA-MM>` e poda a retenção (104 semanas · 36 meses). Refazer o mesmo período troca a mesma linha. */
export async function gravaKpi(foto, sb) {
  const S = sbDe(sb); if (!S) throw new Error('Supabase não configurado — as fotos de KPI precisam dele.');
  if (!foto || foto.v !== KPI_V || !kpiChaveValida(foto.gran, foto.chave)) throw new Error('Foto de KPI inválida (v/gran/chave).');
  const id = idKpi(foto.gran, foto.chave);
  const r = await fetch(`${S.base}/rest/v1/${TABELA}?on_conflict=id`, {
    method: 'POST', headers: { ...S.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id, data: foto, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} (gravar foto de KPI): ${(await r.text()).slice(0, 200)}`);
  const poda = foto.gran === 'mes' ? await podaPrefixo('kpim_', KPIM_MAX, RE_ID_KPIM, sb) : await podaPrefixo('kpis_', KPIS_MAX, RE_ID_KPIS, sb);
  return { id, ...poda };
}
/** Mantém só as retenções (útil à parte da gravação: manual/testes). */
export function podaKpis(sb) {
  return Promise.all([podaPrefixo('kpis_', KPIS_MAX, RE_ID_KPIS, sb), podaPrefixo('kpim_', KPIM_MAX, RE_ID_KPIM, sb)]).then(([sem, mes]) => ({ sem, mes }));
}
/** As `n` fotos mais recentes até o período `ate` (chave), em ordem CRONOLÓGICA. */
export async function leKpis({ gran, ate, n } = {}, sb) {
  const S = sbDe(sb); if (!S) return [];
  const mes = gran === 'mes'; const pre = mes ? 'kpim_' : 'kpis_'; const re = mes ? RE_ID_KPIM : RE_ID_KPIS;
  const lim = clamp(Math.floor(Number(n)) || (mes ? KPI_MESES_BACKFILL : KPI_SEMANAS_BACKFILL), 1, mes ? KPIM_MAX : KPIS_MAX);
  const teto = kpiChaveValida(gran, ate || '') ? `&id=lte.${pre}${ate}` : '';
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.${pre}*${teto}&select=id,data&order=id.desc&limit=${lim}`, { headers: S.headers }), 'ler fotos de KPI');
  return (Array.isArray(rows) ? rows : []).filter((x) => re.test(String(x.id || '')) && x.data && x.data.v === KPI_V && x.data.chave)
    .map((x) => x.data).sort((a, b) => String(a.chave).localeCompare(String(b.chave)));
}
/** Uma foto pelo id (kpis_…/kpim_…) — null se não existe. */
export async function leUmKpi(gran, chave, sb) {
  const S = sbDe(sb); if (!S) return null;
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=eq.${idKpi(gran, chave)}&select=data`, { headers: S.headers }), 'ler foto de KPI');
  const d = Array.isArray(rows) && rows[0] && rows[0].data;
  return (d && d.v === KPI_V) ? d : null;
}
/** Quais períodos já têm foto (leve: só id e `parcial`): { sem:{chave:{parcial}}, mes:{chave:{parcial}} }. */
export async function leIdsKpi(sb) {
  const S = sbDe(sb); const out = { sem: {}, mes: {} };
  if (!S) return out;
  for (const [pre, re, dest, max] of [['kpis_', RE_ID_KPIS, out.sem, KPIS_MAX], ['kpim_', RE_ID_KPIM, out.mes, KPIM_MAX]]) {
    const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.${pre}*&select=id,parcial:data->parcial&order=id.desc&limit=${max + 10}`, { headers: S.headers }), 'listar fotos de KPI');
    (Array.isArray(rows) ? rows : []).forEach((x) => { const id = String(x.id || ''); if (re.test(id)) dest[id.slice(5)] = { parcial: x.parcial === true }; });
  }
  return out;
}
/** Semáforo de cada projeto nas linhas `sr_<KEY>` do 📋 Status report: { KEY:'verde|amarelo|vermelho' } (sem situação = ausente). */
export async function leSemaforos(sb) {
  const S = sbDe(sb); if (!S) return {};
  const rows = await sbRows(await fetch(`${S.base}/rest/v1/${TABELA}?id=like.sr_*&select=id,saude:data->saude&limit=2000`, { headers: S.headers }), 'ler semáforos');
  const out = {};
  (Array.isArray(rows) ? rows : []).forEach((x) => { const id = String(x.id || ''); if (/^sr_[A-Za-z][A-Za-z0-9_]*$/.test(id) && SEMAFOROS.includes(x.saude)) out[id.slice(3)] = x.saude; });
  return out;
}

// ===========================================================================
// Pendências (o que o cron ainda precisa fotografar)
// ===========================================================================
/**
 * Períodos FECHADOS (que já acabaram em `hoje`) sem foto — ou só com a foto PARCIAL (a da sexta/do último dia útil: precisa fechar fin/horas/time).
 * Semanas: da mais recente para trás, até `semanasMax` (52); meses: idem até `mesesMax` (12). O período corrente nunca é pendência (o passo
 * "corrente" o refaz todo dia). `existentes` = { sem:{chave:{parcial}}, mes:{chave:{parcial}} } (leIdsKpi).
 * @returns {{ semanas:[{chave,refoto}], meses:[{chave,refoto}], total:number }}
 */
export function kpisPendentes({ hoje, existentes, semanasMax, mesesMax } = {}) {
  const ex = existentes || {}; const exS = ex.sem || {}; const exM = ex.mes || {};
  const segHoje = segundaDe(hoje); const mesHoje = String(hoje || '').slice(0, 7);
  const semanas = []; const meses = [];
  if (!segHoje) return { semanas, meses, total: 0 };
  const nS = clamp(Math.floor(Number(semanasMax)) || KPI_SEMANAS_BACKFILL, 0, KPIS_MAX);
  const nM = clamp(Math.floor(Number(mesesMax)) || KPI_MESES_BACKFILL, 0, KPIM_MAX);
  for (let i = 1; i <= nS; i += 1) { const ch = addDias(segHoje, -7 * i); const e = exS[ch]; if (!e) semanas.push({ chave: ch, refoto: false }); else if (e.parcial) semanas.push({ chave: ch, refoto: true }); }
  for (let i = 1; i <= nM; i += 1) { const ch = pcYmSoma(mesHoje, -i); const e = exM[ch]; if (!e) meses.push({ chave: ch, refoto: false }); else if (e.parcial) meses.push({ chave: ch, refoto: true }); }
  return { semanas, meses, total: semanas.length + meses.length };
}

// ===========================================================================
// Orquestração: busca as fontes (através de `deps`) e monta a foto
// ===========================================================================
const depsPadrao = () => ({
  jiraSearchAll, worklogsEnriquecidos, jiraUsuariosAtivos, buscaAbertos, carregaCatalogoProjetos, lePlanos,
  leSemaforos, leCfgRev, gravaKpi, leIdsKpi, leUmKpi, relogio: () => Date.now(), ...KPI_DEPS,
});
const linhaTicket = (it, quem, campoData) => {
  const f = it.fields || {}; const u = f[quem] || {};
  return { k: it.key, p: (f.project && f.project.key) || String(it.key).split('-')[0], t: (f.issuetype && f.issuetype.name) || '', a: u.accountId || '', d: f[campoData] || '' };
};
/**
 * Monta a foto de UM período (`gran` 'sem' com a segunda em `chave`, ou 'mes' com AAAA-MM), buscando as fontes em PARALELO.
 * `leitura` = o resultado de um worklogsEnriquecidos já lido que COBRE o período (o cron lê UMA vez de min(segunda, 1º do mês) a hoje e
 * monta a semana e o mês correntes com ela); sem ele, lê o período. `saudeAntes` = o `saude` de uma foto parcial anterior (conserva o retrato).
 * @returns {Promise<object>} a foto (formato v1)
 */
export async function montaKpi({ chave, gran, cfg, deps, agora, leitura, sb, saudeAntes } = {}) {
  const D = { ...depsPadrao(), ...(deps || {}) };
  const g = gran === 'mes' ? 'mes' : 'sem';
  const per = kpiPeriodo(g, chave);
  if (!per) throw new Error(g === 'mes' ? `Mês inválido: "${chave}" (use AAAA-MM).` : `Semana inválida: "${chave}" (use a segunda-feira, AAAA-MM-DD).`);
  const now = agora ? new Date(agora) : new Date(); const hoje = spDate(now);
  if (per.de > hoje) throw new Error(`Período futuro (${chave}) — a foto só existe a partir do primeiro dia dele.`);
  const C = cfg || {}; const sem = g === 'sem'; const retro = hoje > per.ate;
  const nada = { issues: [], truncado: false };
  // Janela dos tickets criados/concluídos: da segunda 00:00 (SP) até agora (ou domingo 23:59 se a semana já acabou). A JQL só CERCA a janela
  // (fuso do perfil da conta de serviço); o corte exato é feito aqui pelos carimbos ISO — a mesma tática do montaFotoSemanal.
  const iniISO = `${per.de}T00:00:00-03:00`; const fimISO = retro ? `${per.ate}T23:59:59.999-03:00` : now.toISOString();
  const jqlDe = addDias(per.de, -1); const jqlAte = addDias(retro ? per.ate : hoje, 2);
  const t0 = Date.parse(iniISO); const t1 = Date.parse(fimISO);
  const naJanela = (x) => { const t = Date.parse(x.d || ''); return t >= t0 && t <= t1; };
  const precisaTickets = sem;   // revisão de 2026-11-07: a refoto também relê created/resolved com a janela inteira (o fluxo não se congela na sexta)
  const [wlTudo, cfgRev, catalogo, usuarios, planos, abR, semaforos, criRaw, concRaw] = await Promise.all([
    leitura ? Promise.resolve(leitura) : D.worklogsEnriquecidos(per.de, per.ate),
    Promise.resolve().then(() => D.leCfgRev(sb)).catch(() => ''),
    Promise.resolve().then(() => D.carregaCatalogoProjetos()).catch(() => []),
    sem ? D.jiraUsuariosAtivos() : Promise.resolve({}),
    sem ? D.lePlanos(per.de, sb) : Promise.resolve({ planos: [], itens: [] }),
    (sem && !retro) ? D.buscaAbertos({ ordem: 'asc' }) : Promise.resolve({ abertos: [], truncado: false }),
    (sem && !retro) ? Promise.resolve().then(() => D.leSemaforos(sb)).catch(() => ({})) : Promise.resolve({}),
    precisaTickets ? D.jiraSearchAll({ jql: `created >= "${jqlDe}" AND created < "${jqlAte}" ORDER BY created ASC`, fields: ['project', 'issuetype', 'reporter', 'created'], pageSize: 100, maxPages: 15 }) : Promise.resolve(nada),
    precisaTickets ? D.jiraSearchAll({ jql: `resolved >= "${jqlDe}" AND resolved < "${jqlAte}" ORDER BY resolved ASC`, fields: ['project', 'issuetype', 'assignee', 'resolutiondate'], pageSize: 100, maxPages: 15 }) : Promise.resolve(nada),
  ]);
  const cat = Array.isArray(catalogo) ? catalogo : [];
  // Metadados do projeto: o que veio JUNTO dos worklogs manda (é o que a Controladoria usa), o catálogo completa.
  const projMeta = {};
  cat.forEach((p) => { if (p && p.key) projMeta[p.key] = { nome: p.nome || p.key, categoria: p.categoria || 'Sem categoria' }; });
  Object.entries((wlTudo && wlTudo.projetos) || {}).forEach(([k, p]) => { projMeta[k] = { nome: (p && p.nome) || k, categoria: (p && p.categoria) || 'Sem categoria' }; });
  const wl = ((wlTudo && wlTudo.worklogs) || []).filter((w) => { const d = String((w && w.d) || '').slice(0, 10); return w && w.a && d >= per.de && d <= per.ate; });
  const base = { chave, cfg: C, fotoEm: now.toISOString(), worklogs: wl, pessoas: (wlTudo && wlTudo.pessoas) || {}, projMeta, cfgRev };
  if (!sem) return calculaKpiMes({ ...base, truncado: { worklogs: !!(wlTudo && wlTudo.truncado) } });
  return calculaKpiSemana({
    ...base, usuarios, planos: planos.planos, itens: planos.itens, catalogo: cat, saudeAntes,
    abertos: abR.abertos, semaforos,
    criados: (criRaw.issues || []).map((it) => linhaTicket(it, 'reporter', 'created')).filter(naJanela),
    concluidos: (concRaw.issues || []).map((it) => linhaTicket(it, 'assignee', 'resolutiondate')).filter(naJanela),
    truncado: { worklogs: !!(wlTudo && wlTudo.truncado), abertos: !!abR.truncado, tickets: !!(criRaw.truncado || concRaw.truncado) },
  });
}

/**
 * O que o cron (e o manual) fotografa, na ordem: (1) a semana e o mês CORRENTES (parciais, refeitos todo dia, UMA leitura do Clockwork de
 * min(segunda, 1º do mês) a hoje para as duas); (2) as semanas FECHADAS sem foto (ou só com a parcial), da mais recente para trás, até 52;
 * (3) os meses FECHADOS sem foto, até 24 (e no máximo 1 por tique). No máximo `max` fotos (padrão KPI_MAX_TIQUE=3, manual até 20); `orcamentoMs` interrompe ANTES de
 * começar uma foto nova quando (já gasto + duração da última foto; 15 s na 1ª) estouraria o orçamento. Uma foto que falha NÃO derruba as outras (`falhas:[chave]`). `dry` calcula sem gravar.
 * `chave` = só esse período (manual). `soCorrente` = só o passo (1) (o ↻ da tela). `devolve` = junta as fotos em `fotos` (só o ↻ da tela —
 * a resposta do cron NUNCA traz o conteúdo: tem R$ por pessoa).
 * @returns {Promise<{dry:boolean, feitas:[{gran,chave,parcial,bytes}], falhas:string[], correnteOk:boolean, pendentes:number, restam:number, truncado:boolean, fotos?:object[]}>}
 */
export async function fotosKpi({ cfg, deps, agora, sb, max, dry = false, corrente = true, soCorrente = false, existentes, chave, orcamentoMs, devolve = false } = {}) {
  const D = { ...depsPadrao(), ...(deps || {}) };
  const now = agora ? new Date(agora) : new Date(); const hoje = spDate(now);
  const teto = clamp(Math.floor(Number(max)) || KPI_MAX_TIQUE, 1, 20);
  const out = { dry: !!dry, feitas: [], falhas: [], correnteOk: false, pendentes: 0, restam: 0, truncado: false };
  const fila = [];
  let pend = { semanas: [], meses: [], total: 0 };
  if (chave) {
    const gran = /^\d{4}-\d{2}$/.test(String(chave)) ? 'mes' : 'sem';
    if (!kpiChaveValida(gran, chave)) throw new Error(`chave inválida: "${chave}" — use a segunda-feira (AAAA-MM-DD) ou o mês (AAAA-MM).`);
    fila.push({ gran, chave: String(chave) });
  } else {
    if (corrente || soCorrente) { fila.push({ gran: 'sem', chave: segundaDe(hoje), corrente: true }); fila.push({ gran: 'mes', chave: hoje.slice(0, 7), corrente: true }); }
    if (!soCorrente) {
      pend = kpisPendentes({ hoje, existentes: existentes || await D.leIdsKpi(sb) });
      out.pendentes = pend.total;
      pend.semanas.forEach((p) => fila.push({ gran: 'sem', chave: p.chave, refoto: p.refoto }));
      pend.meses.forEach((p) => fila.push({ gran: 'mes', chave: p.chave, refoto: p.refoto }));
    }
  }
  // meses fechados: no máximo KPI_MESES_POR_TIQUE por chamada do cron (o mês lê o Clockwork inteiro e estoura o tique); `chave` e ↻ não limitam
  let mesesNaFila = 0;
  const filaOk = chave || soCorrente ? fila : fila.filter((i) => { if (i.gran !== 'mes' || i.corrente) return true; mesesNaFila += 1; return mesesNaFila <= KPI_MESES_POR_TIQUE; });
  const lista = filaOk.slice(0, soCorrente ? 2 : teto);
  const t0 = D.relogio();
  let leitura = null; let leituraErro = null;
  const doisCorrentes = lista.filter((i) => i.corrente).length === 2;
  if (doisCorrentes) {
    const de = segundaDe(hoje) < `${hoje.slice(0, 7)}-01` ? segundaDe(hoje) : `${hoje.slice(0, 7)}-01`;
    try { leitura = await D.worklogsEnriquecidos(de, hoje); } catch (e) { leituraErro = e; }
  }
  let correntesFeitas = 0; let fechadasFeitas = 0; let parou = false;
  let durFoto = null;   // duração da ÚLTIMA foto (ms): só começa outra se coube no orçamento somando-a ao que já passou (revisão de 2026-11-07)
  const segHoje = segundaDe(hoje);
  if (devolve) out.fotos = [];
  for (const item of lista) {
    const tIni = D.relogio();
    if (orcamentoMs != null && (tIni - t0) + (durFoto != null ? durFoto : KPI_FOTO_PRIMEIRA_MS) > orcamentoMs) { parou = true; break; }
    try {
      if (item.corrente && leituraErro) throw leituraErro;
      let saudeAntes;
      // semana JÁ FECHADA (com ou sem `refoto`, inclusive `chave` manual): lê a foto anterior para não destruir o retrato de sexta; foto `retro` não vale
      if (item.gran === 'sem' && !item.corrente && item.chave < segHoje) {
        const antes = await Promise.resolve().then(() => D.leUmKpi('sem', item.chave, sb)).catch(() => null);
        saudeAntes = antes && retratoValido(antes.saude) ? antes.saude : undefined;
      }
      const foto = await montaKpi({ chave: item.chave, gran: item.gran, cfg, deps, agora, sb, saudeAntes, leitura: item.corrente ? leitura : undefined });
      if (!dry) await D.gravaKpi(foto, sb);
      out.feitas.push({ gran: item.gran, chave: item.chave, parcial: foto.parcial, bytes: JSON.stringify(foto).length });
      if (foto.truncado && (foto.truncado.worklogs || foto.truncado.abertos || foto.truncado.tickets)) out.truncado = true;
      if (devolve) out.fotos.push(foto);
      if (item.corrente) correntesFeitas += 1; else if (!chave) fechadasFeitas += 1;
      durFoto = D.relogio() - tIni;
    } catch (e) {
      durFoto = D.relogio() - tIni;
      out.falhas.push(item.chave);
      out.erro = String(e && e.message ? e.message : e).slice(0, 200);
    }
  }
  out.correnteOk = doisCorrentes && correntesFeitas === 2;
  out.restam = chave ? 0 : Math.max(0, out.pendentes - fechadasFeitas);
  if (parou) out.orcamento = 'estourado';
  return out;
}

