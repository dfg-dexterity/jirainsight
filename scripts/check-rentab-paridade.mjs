#!/usr/bin/env node
// Gate de PARIDADE da Rentabilidade: o servidor (api/_lib/rentab.js) tem de dar o MESMO
// número que o painel (public/js/17b-rentabilidade.js) para as horas vendidas — é esse
// número que o 📊 relatório semanal usa como "orçado" do projeto. Roda em `npm run check`.
//
// Como: carrega o 01-nucleo.js (datas/feriados de verdade) e o 17b de verdade num `vm`
// com stubs mínimos de DOM/localStorage (o 17b só registra listeners no carregamento) e
// roda rpMeses/rpFim/rpVendPorMes/rpVendidas/rpVendAte dos dois lados sobre planos-fixture
// (horas por dia · total rateado · h/mês legado · fechado · interno · com e sem vendMan ·
// início/fim no meio do mês · feriado extra/removido · fim inválido · teto de 36 meses).
// Desde 2026-11-02 também confere o CUSTO PREVISTO por papel (execução · gestão · terceirizado interno com valor-hora de
// repasse): rpCustoH/rpRepH/rpCalcResumo (= rpCalc), rpPrevAte (= o "previsto até aqui" do rpReal) e rpStatusK (= rpStatus),
// com cfg.custosPessoa e cfg.pessoasPlanejadas IGUAIS dos dois lados e planos com terceirizado COM e SEM repasse.
// Desde 2026-11-02 (T2) também confere o CICLO DE FATURAMENTO do plano: rpCiclosDe (cliente cadastrado › contrato de parceria ›
// mês civil) e rpPeriodosFat (ym, datas do ciclo, dia da nota, dias úteis, horas e valor de cada período) dos dois lados, com
// cfg.clientes e cfg.parcerias IGUAIS — por isso o vm carrega também 16b-parcerias.js (pcPeriodo/pcPeriodos) e 16g-clientes-ciclo.js
// (clDe). Fixtures: plano com cliente (fecha dia 25 com ajuste), só com contrato, sem nada, cliente + contrato (precedência),
// cliente que não existe mais, ajustes inválidos, fechamento 31, plano começando no meio do ciclo e a soma das horas = as vendidas.
// Desde 2026-11-02 (T3) também confere o FATURAMENTO PELO VENDIDO: rpVendEntre (as horas vendidas num intervalo — painel × servidor direto, em
// vez de só por consistência), rpFatBase, rpFatManDe (horas do ciclo digitadas: válidas, zero, negativas, texto, órfãs), rpFracaoCiclo e rpFatAte
// (painel: rpFatCalc, com um porDia FIXO; servidor: rpFatAte com as horas por ciclo calculadas aqui, de forma independente), mais as invariantes
// (Σ horasAuto = horas vendidas; ciclo fechado conta inteiro; 'apontado' = hFat × valor-hora; depois do fim do contrato zero; leitores não criam
// p.fatMan). Fixtures: cliente, cliente + horas digitadas (com ciclo órfão e valores inválidos), apontado, contrato que acaba antes do plano, mês civil.
// Desde 2026-11-02 (T4) também confere o REALIZADO ATÉ UM DIA que as fotos diárias/semanais gravam (api/_lib/rentabFoto.js): rpRealAte (servidor) × rpReal
// (painel) — horas, faturáveis, custo do projeto e consolidado, terceirizado/repasse, previsto até o dia, receita até o dia, faturado por ciclo, margem, por dia
// e por pessoa — com os MESMOS worklogs nos dois lados, para planos de horas (cliente, contrato, apontado), fechado (marcos faturados), interno e terceirizado
// com e sem repasse; mais rpJanelaReal × rpRealChave (a janela lida no Clockwork), rpCenarioDe × rpCenario, rpCustoRealH e rpMarcosFaturado × rpMarcosCalc.
// Sem rede: nada aqui chama API.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as srv from '../api/_lib/rentab.js';

const erros = [];
const CFG = { feriadosExtra: { '2026-10-15': 'Feriado extra (fixture)' }, feriadosRemovidos: ['2026-11-20'] };
// custo/h das pessoas e vagas planejadas — a MESMA config nos dois lados (o painel lê cfg.*, o servidor recebe por parâmetro)
// ciclo de faturamento: clientes (16g) e contratos de parceria (16b) — a MESMA config nos dois lados
const CLIENTES = [
  { id: 'cl-ntt', nome: 'NTT', fatFecha: 25, fatDia: 0, inicio: '2025-12-26', ajustes: { '2026-03': { fecha: '2026-03-27' }, '2026-10': { fecha: '2026-10-22', nota: '2026-10-30' } } },
  { id: 'cl-31', nome: 'Fecha no último dia', fatFecha: 31, fatDia: 5, ajustes: {} },
  { id: 'cl-ruim', nome: 'Dados estranhos', fatFecha: 'x', fatDia: 'abc', ajustes: { '2026-09': 'texto', '2026-10': { fecha: 'amanhã', nota: 7 }, '2026-11': null, '2026-12': { fecha: '2026-12-18' } } },
  { id: 'cl-feb', nome: 'Fecha dia 30 (fevereiro)', fatFecha: 30, fatDia: 15, ajustes: {} },
  null, 'lixo', { nome: 'sem id' },
];
const PARCERIAS = [
  { id: 'pc-x', consultoria: 'Consultoria X', modalidade: 'horas', fatFecha: 25, fatDia: 30, ajustes: { '2026-08': { fecha: '2026-08-24', nota: '2026-08-28' } } },
  { id: 'pc-igual', consultoria: 'Igual ao NTT', modalidade: 'horas', fatFecha: 25, fatDia: 0, ajustes: { '2026-03': { fecha: '2026-03-27' }, '2026-10': { fecha: '2026-10-22', nota: '2026-10-30' } } },
  { id: 'pc-sem', consultoria: 'Sem fechamento', modalidade: 'horas' },
  { id: 'pc-fim', consultoria: 'Contrato que acaba antes do plano', modalidade: 'horas', fatFecha: 25, fatDia: 0, fim: '2026-10-10', ajustes: {} },
  { id: 'pc-fim2', consultoria: 'Contrato com fim inválido', modalidade: 'horas', fatFecha: 25, fim: 'amanhã' },
];
const CUSTOS = { 'a-ana': 95, 'a-bruno': 60, 'a-diego': 150, 'a-zero': 0, 'a-txt': '80', 'a-ruim': 'abc', 'plan_fantasma': 70 };
const PLANEJADAS = [{ id: 'plan_x1', nome: 'Vaga SAP', custoH: 110 }, { id: 'plan_x2', nome: 'Vaga sem custo', custoH: 'abc' }];
CFG.custosPessoa = CUSTOS; CFG.pessoasPlanejadas = PLANEJADAS; CFG.clientes = CLIENTES; CFG.parcerias = PARCERIAS;
const ALOC_BASE = [{ a: 'a-ana', papel: 'exec', h: { '2026-09': 100, '2026-10': 90, '2026-11': 80 } }, { a: 'a-diego', papel: 'gestao', h: { '2026-09': 10, '2026-10': 10, '2026-11': 10 } }];
const mkPlano = (id, nome, extra, aloc2) => ({ id, nome, tipo: 'horas', inicio: '2026-09-01', fim: '2026-11-30', modoCarga: 'dia', cargaDia: 8, valorHora: 200, ...extra,
  cenarios: [{ id: id + 'c1', nome: 'Base', aloc: JSON.parse(JSON.stringify(ALOC_BASE.concat(aloc2 || []))) }, { id: id + 'c2', nome: 'Outro', aloc: [] }], cenario: id + 'c1' });
// planos com ALOCAÇÃO (rpCalc): papel exec · gestão · terceirizado interno (com e sem repasse, repasse inválido, papel desconhecido, vaga planejada)
const PLANOS_CUSTO = [
  mkPlano('c1', 'só execução e gestão', {}, []),
  mkPlano('c2', 'terceirizado SEM repasse (= execução)', {}, [{ a: 'a-bruno', papel: 'terc', h: { '2026-09': 40, '2026-10': 40, '2026-11': 40 } }]),
  mkPlano('c2x', 'o mesmo, com o bruno em execução', {}, [{ a: 'a-bruno', papel: 'exec', h: { '2026-09': 40, '2026-10': 40, '2026-11': 40 } }]),
  mkPlano('c3', 'terceirizado COM repasse', {}, [{ a: 'a-bruno', papel: 'terc', rep: 120, h: { '2026-09': 40, '2026-10': 40, '2026-11': 40 } }]),
  mkPlano('c4', 'repasse abaixo do custo e vaga planejada', {}, [{ a: 'a-bruno', papel: 'terc', rep: 30, h: { '2026-09': 40 } }, { a: 'plan_x1', papel: 'terc', rep: 150, h: { '2026-10': 20, '2026-11': 20 } }]),
  mkPlano('c5', 'repasse inválido, string e papel desconhecido', {}, [{ a: 'a-bruno', papel: 'terc', rep: 0, h: { '2026-09': 10 } }, { a: 'a-ana', papel: 'terc', rep: '90', h: { '2026-10': 10 } },
    { a: 'a-txt', papel: 'terc', rep: -5, h: { '2026-09': 5 } }, { a: 'a-zero', papel: 'terc', rep: 80, h: { '2026-10': 5 } }, { a: 'a-ruim', papel: 'terc', rep: 'abc', h: { '2026-11': 5 } },
    { a: 'a-bruno', papel: 'x', rep: 999, h: { '2026-09': 7 } }, { a: 'a-ana', papel: 'TERC', h: { '2026-09': 3 } }, { a: 'plan_x2', papel: 'terc', h: { '2026-09': 4 } }, { a: 'plan_fantasma', papel: 'terc', rep: 100, h: { '2026-10': 4 } }]),
  mkPlano('c6', 'rep em quem NÃO é terceirizado é ignorado', {}, [{ a: 'a-bruno', papel: 'exec', rep: 500, h: { '2026-09': 20 } }, { a: 'a-ana', papel: 'gestao', rep: 500, h: { '2026-10': 20 } }]),
  mkPlano('c7', 'escopo fechado com marcos e terceirizado', { tipo: 'fechado', valorProjeto: 90000, marcos: [{ id: 'm1', nome: 'B', data: '2026-10-15', pct: 40 }, { id: 'm2', nome: 'A', data: '2026-10-15', pct: 10 }, { id: 'm3', nome: 'Go', data: '2026-11-20', pct: 50 }] },
    [{ a: 'a-bruno', papel: 'terc', rep: 100, h: { '2026-09': 30, '2026-10': 30 } }]),
  mkPlano('c8', 'interno com orçamento e terceirizado', { tipo: 'interno', orcamento: 50000, cargaDia: 0, valorHora: 0 }, [{ a: 'a-bruno', papel: 'terc', rep: 75, h: { '2026-09': 30 } }]),
  mkPlano('c9', 'início no meio do mês, vendMan e terceirizado', { inicio: '2026-09-15', fim: '2026-11-10', vendMan: { '2026-10': 120 } }, [{ a: 'a-bruno', papel: 'terc', rep: 66.5, h: { '2026-09': 12.5, '2026-11': 8 } }]),
  { id: 'c10', nome: 'sem tipo, sem cenário ativo e sem alocação', inicio: '2026-09-07', fim: '2026-09-11', modoCarga: 'dia', cargaDia: 8, cenarios: [{ id: 'c10c1', nome: 'Base' }], cenario: 'c10c1' },
];
const PLANOS = [
  { id: 'p1', nome: 'horas por dia útil', tipo: 'horas', inicio: '2026-09-01', fim: '2026-12-31', meses: 4, modoCarga: 'dia', cargaDia: 8 },
  { id: 'p2', nome: 'horas/dia com vendMan e início no meio do mês', tipo: 'horas', inicio: '2026-09-15', fim: '2026-11-10', modoCarga: 'dia', cargaDia: 6,
    vendMan: { '2026-10': 120, '2026-11': 0, '2027-01': 50, '2026-09': 'x' } },   // 0 = digitado zero · órfão · inválido
  { id: 'p3', nome: 'total rateado pelos dias úteis', tipo: 'horas', inicio: '2026-06-01', meses: 5, modoCarga: 'total', cargaTotal: 600 },
  { id: 'p4', nome: 'legado h/mês', tipo: 'horas', inicio: '2026-01-10', fim: '2026-03-20', modoCarga: 'mes', cargaMes: 100 },
  { id: 'p5', nome: 'escopo fechado', tipo: 'fechado', inicio: '2026-06-01', fim: '2026-11-30', modoCarga: 'total', cargaTotal: 600, valorProjeto: 120000 },
  { id: 'p6', nome: 'interno sem carga', tipo: 'interno', inicio: '2026-07-01', fim: '2026-12-31', cargaDia: 0 },
  { id: 'p7', nome: 'fim inválido (usa meses)', tipo: 'horas', inicio: '2026-11-01', fim: '2026-10-01', meses: 2, modoCarga: 'dia', cargaDia: 4 },
  { id: 'p8', nome: 'início inválido (usa hoje)', tipo: 'horas', inicio: '', meses: 2, modoCarga: 'dia', cargaDia: 4 },
  { id: 'p9', nome: 'mês com feriado extra e feriado removido', tipo: 'horas', inicio: '2026-10-01', fim: '2026-11-30', modoCarga: 'dia', cargaDia: 8 },
  { id: 'p10', nome: 'acima do teto de 36 meses', tipo: 'horas', inicio: '2024-01-01', fim: '2028-12-31', modoCarga: 'total', cargaTotal: 5000 },
  { id: 'p11', nome: 'sem tipo e com semana de feriado nacional', inicio: '2026-09-07', fim: '2026-09-11', modoCarga: 'dia', cargaDia: 8, vendMan: {} },
];
const DATAS = ['2025-01-01', '2026-01-15', '2026-09-10', '2026-09-30', '2026-10-15', '2026-11-20', '2026-12-31', '2027-06-01'];

// ---- carrega o painel de verdade num vm ----
const nada = () => {};
const el = () => ({ addEventListener: nada, style: {}, classList: { add: nada, remove: nada, toggle: nada }, appendChild: nada, setAttribute: nada, textContent: '' });
const sandbox = {
  console, setTimeout, clearTimeout, requestAnimationFrame: nada,
  document: { addEventListener: nada, getElementById: el, createElement: el, querySelector: () => null, querySelectorAll: () => [], body: el(), head: el() },
  localStorage: { getItem: () => null, setItem: nada, removeItem: nada },
  window: {}, navigator: {}, location: { search: '', href: '' }, fetch: () => Promise.reject(new Error('sem rede')),
  // voltaDias mora no 13-apontar.js (não carregado aqui); o rpRealChave do painel só precisa dele para o teto de 365 dias — mesma definição
  voltaDias: (s, n) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10); },
};
const ctx = vm.createContext(sandbox);
for (const arq of ['public/js/01-nucleo.js', 'public/js/16b-parcerias.js', 'public/js/16g-clientes-ciclo.js', 'public/js/17b-rentabilidade.js']) {
  try { new vm.Script(readFileSync(arq, 'utf8'), { filename: arq }).runInContext(ctx); }
  catch (e) { console.error(`✗ não consegui carregar ${arq} no vm: ${e.message}`); process.exit(1); }
}
// A config do painel (feriados) é a mesma passada ao servidor.
vm.runInContext(`cfg.feriadosExtra=${JSON.stringify(CFG.feriadosExtra)}; cfg.feriadosRemovidos=${JSON.stringify(CFG.feriadosRemovidos)}; cfg.custosPessoa=${JSON.stringify(CFG.custosPessoa)}; cfg.pessoasPlanejadas=${JSON.stringify(CFG.pessoasPlanejadas)}; cfg.clientes=${JSON.stringify(CFG.clientes)}; cfg.parcerias=${JSON.stringify(CFG.parcerias)};`, ctx);
const web = vm.runInContext('({ rpMeses, rpFim, rpVendPorMes, rpVendidas, rpVendAte, rpDiasUteis, RP_MAX_MESES, hojeSP, rpCalc, rpReal, rpStatus, rpCustoH, rpRepH, rpPapel, rpPapelRot, rpEsf, rpCustoRealH, rpCenario, rpCiclosDe, rpClienteDe, rpPeriodosFat, rpDivergeCiclo, pcPeriodos, pcPeriodo, rpVendEntre, rpFatBase, rpFatManDe, rpFatNum, rpFatManSet, rpFatManOrfaos, rpFracaoCiclo, rpFatAte, rpFatCalc, rpSemanas, rpMarcosCalc, rpRealChave, RP_EXPLICA, RP_GLOSSARIO })', ctx);
const hoje = srv.spHoje();
if (web.hojeSP() !== hoje) { console.error(`✗ hoje difere entre painel (${web.hojeSP()}) e servidor (${hoje}) — rode de novo`); process.exit(1); }

const perto = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : JSON.stringify(a) === JSON.stringify(b);
function igual(a, b) {
  if (a && b && typeof a === 'object' && !Array.isArray(a)) {
    const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
    if (ka.join() !== kb.join()) return false;
    return ka.every((k) => igual(a[k], b[k]));
  }
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => igual(x, b[i]));
  return perto(a, b);
}
const cmp = (p, rot, w, s) => { if (!igual(w, s)) erros.push(`${p.id} (${p.nome}) · ${rot}: painel=${JSON.stringify(w)} servidor=${JSON.stringify(s)}`); };

if (web.RP_MAX_MESES !== srv.RP_MAX_MESES) erros.push(`RP_MAX_MESES: painel=${web.RP_MAX_MESES} servidor=${srv.RP_MAX_MESES}`);
let n = 0;
for (const p of PLANOS) {
  const P = JSON.parse(JSON.stringify(p));   // cada lado recebe a sua cópia: nenhum deles pode criar p.vendMan
  const Q = JSON.parse(JSON.stringify(p));
  cmp(p, 'rpMeses', web.rpMeses(P), srv.rpMeses(Q, hoje)); n += 1;
  cmp(p, 'rpFim', web.rpFim(P), srv.rpFim(Q, hoje)); n += 1;
  cmp(p, 'rpVendPorMes', web.rpVendPorMes(P), srv.rpVendPorMes(Q, CFG, hoje)); n += 1;
  cmp(p, 'rpVendidas', web.rpVendidas(P), srv.rpVendidas(Q, CFG, hoje)); n += 1;
  for (const d of DATAS) { cmp(p, `rpVendAte(${d})`, web.rpVendAte(P, d), srv.rpVendAte(Q, d, CFG, hoje)); n += 1; }
  if (JSON.stringify(P) !== JSON.stringify(p) || JSON.stringify(Q) !== JSON.stringify(p)) erros.push(`${p.id}: o cálculo alterou o plano (criou vendMan?) — leitores não criam objeto`);
  // rpVendEntre não tem par no painel: confere por consistência com o que tem — do início até uma
  // data é o rpVendAte, e as fatias de um mês somam o mês inteiro.
  const v = srv.rpVendPorMes(Q, CFG, hoje); const ms = srv.rpMeses(Q, hoje); const fim = srv.rpFim(Q, hoje);
  // rpVendEntre: painel × servidor DIRETO, em intervalos antes do início, dentro, cruzando meses e depois do fim
  for (const [de, ate] of [['2025-01-01', '2025-02-01'], ['2026-01-01', '2026-01-31'], ['2026-01-01', '2026-06-30'], ['2026-05-30', '2026-06-02'], ['2026-09-01', '2026-09-30'], ['2026-09-10', '2026-10-20'], ['2026-09-14', '2026-09-14'], ['2026-09-20', '2026-09-13'],
    ['2026-10-12', '2026-11-12'], ['2026-11-01', '2026-12-31'], ['2026-12-15', '2027-02-01'], ['', '2026-10-01'], ['2026-10-01', '']]) {
    cmp(p, `rpVendEntre(${de},${ate}) painel × servidor`, web.rpVendEntre(P, de, ate), srv.rpVendEntre(Q, de, ate, CFG, hoje)); n += 1; }
  for (const d of DATAS) { if (d < (Q.inicio || hoje) || d > fim) continue; cmp(p, `rpVendEntre(início,${d}) = rpVendAte`, srv.rpVendAte(Q, d, CFG, hoje), srv.rpVendEntre(Q, Q.inicio || hoje, d, CFG, hoje)); n += 1; }
  for (const m of ms) {
    const a = m === ms[0] ? (Q.inicio || `${m}-01`) : `${m}-01`; const b = srv.rpUltimoDia(m) < fim ? srv.rpUltimoDia(m) : fim;
    let soma = 0; let d = a; let g = 0;
    while (d <= b && g++ < 40) { const f = srv.addDias(d, 6) < b ? srv.addDias(d, 6) : b; soma += srv.rpVendEntre(Q, d, f, CFG, hoje); d = srv.addDias(f, 1); }
    cmp(p, `rpVendEntre fatias de ${m} somam o mês`, v.porMes[m], soma); n += 1;
  }
}
for (const [a, b] of [['2026-09-07', '2026-09-11'], ['2026-10-12', '2026-10-16'], ['2026-11-16', '2026-11-20'], ['2026-12-21', '2027-01-05']]) {
  const w = vm.runInContext(`rpDiasUteis(${JSON.stringify(a)},${JSON.stringify(b)})`, ctx);
  cmp({ id: 'dias', nome: 'dias úteis' }, `rpDiasUteis(${a},${b})`, w, srv.rpDiasUteis(a, b, CFG)); n += 1;
}

// ---- 🔁 custo previsto por papel: rpCustoH/rpRepH, rpCalc = rpCalcResumo, rpReal(previsto até aqui) = rpPrevAte, rpStatus = rpStatusK ----
// Os 11 planos de horas acima também passam por rpStatusK (têm início/fim em casos de borda); os de custo, por tudo.
for (const a of [...Object.keys(CUSTOS), 'plan_x1', 'plan_x2', 'plan_naoexiste', 'a-sem-custo', '', undefined]) {
  cmp({ id: 'custo', nome: 'custo/h' }, `rpCustoH(${JSON.stringify(a)})`, web.rpCustoH(a), srv.rpCustoH(a, CFG)); n += 1;
}
for (const al of [{ a: 'a-bruno', papel: 'terc', rep: 120 }, { a: 'a-bruno', papel: 'terc' }, { a: 'a-bruno', papel: 'terc', rep: 0 }, { a: 'a-bruno', papel: 'terc', rep: -3 }, { a: 'a-bruno', papel: 'terc', rep: '95.5' },
  { a: 'a-bruno', papel: 'terc', rep: 'abc' }, { a: 'a-bruno', papel: 'exec', rep: 120 }, { a: 'a-bruno', papel: 'gestao', rep: 120 }, { a: 'a-bruno', rep: 120 }, { a: 'a-bruno', papel: 'x', rep: 120 }, { a: 'plan_x1', papel: 'terc', rep: 10 }, { a: 'plan_x1', papel: 'terc' }]) {
  cmp({ id: 'rep', nome: 'repasse' }, `rpRepH(${JSON.stringify(al)})`, web.rpRepH(al), srv.rpRepH(al, CFG)); n += 1;
  cmp({ id: 'rep', nome: 'papel' }, `rpPapel(${JSON.stringify(al)})`, web.rpPapel(al), srv.rpPapel(al)); n += 1;
}
// o rótulo de papel desconhecido não quebra (antes o painel lia RP_PAPEIS.find(...)[1] de um valor inexistente)
for (const v of ['exec', 'gestao', 'terc', 'x', '', null, undefined, 'TERC']) {
  let rot; try { rot = web.rpPapelRot(v); } catch (e) { erros.push(`rpPapelRot(${JSON.stringify(v)}) quebrou: ${e.message}`); continue; }
  if (typeof rot !== 'string' || !rot) erros.push(`rpPapelRot(${JSON.stringify(v)}) deveria devolver um rótulo`); n += 1;
}
const subc = (c, resumo) => {   // do rpCalc do painel, só os campos que o servidor devolve (os demais são UI)
  const o = {}; Object.keys(resumo).forEach((k) => { o[k] = c[k]; });
  o.porMes = {}; c.meses.forEach((m) => { const M = c.porMes[m]; o.porMes[m] = { exec: M.exec, gestao: M.gestao, terc: M.terc, custo: M.custo, custoTerc: M.custoTerc }; });
  o.porPessoa = c.porPessoa.map((x) => ({ i: x.i, a: x.a, papel: x.papel, ch: x.ch, rep: x.rep, h: x.h, custo: x.custo }));
  return o;
};
const TODOS = PLANOS_CUSTO.concat(PLANOS.map((p) => ({ ...p, cenarios: [{ id: p.id + 'c1', nome: 'Base', aloc: [] }], cenario: p.id + 'c1' })));
const resumos = {};
for (const p of TODOS) {
  const P = JSON.parse(JSON.stringify(p)); const Q = JSON.parse(JSON.stringify(p));
  cmp(p, 'rpStatus = rpStatusK', web.rpStatus(P)[0], srv.rpStatusK(Q, hoje)); n += 1;
  for (const cenW of P.cenarios) {
    const cenS = Q.cenarios.find((x) => x.id === cenW.id);
    const cw = web.rpCalc(P, cenW); const cs = srv.rpCalcResumo(Q, cenS, CFG, hoje);
    cmp(p, `rpCalc × rpCalcResumo (${cenW.nome})`, subc(cw, cs), cs); n += 1;
    // invariantes do modelo: esforço = soma dos três papéis · consolidado volta ao custo/h · sem repasse = execução
    const soma = cw.exec + cw.gestao + cw.terc;
    if (!perto(cw.esforco, soma)) erros.push(`${p.id}: esforço ${cw.esforco} ≠ exec+gestão+terc ${soma}`);
    if (!perto(cw.custo, cw.custoExec + cw.custoGestao + cw.custoTerc)) erros.push(`${p.id}: custo ≠ custoExec+custoGestao+custoTerc`);
    if (!perto(cw.margemCons, cw.margem + cw.resultadoCedente) && !perto(cw.margem, cw.margemCons + cw.resultadoCedente)) erros.push(`${p.id}: margem, margemCons e resultadoCedente não fecham`);
    resumos[`${p.id}|${cenW.id}`] = cs;
    // o "previsto até aqui" do rpReal (com a lista de worklogs vazia) em datas de antes, do meio e depois do prazo
    if (p.projeto || true) {
      for (const ate of ['2026-08-31', '2026-09-15', '2026-10-15', '2026-11-02', '2026-11-30', '2026-12-31']) {
        vm.runInContext(`var __ATE=${JSON.stringify(ate)}; rpRealChave=function(p){ return 'PX|'+(p.inicio||'')+'|'+__ATE; }; estado.rentab.tempo['PX|${P.inicio || ''}|${ate}']={ worklogs: [], pessoas: {} };`, ctx);
        const rw = web.rpReal(P, cw); const ps = srv.rpPrevAte(Q, cs, ate, CFG);
        cmp(p, `rpReal previsto até ${ate} = rpPrevAte (${cenW.nome})`, { prevAteHoje: rw.prevAteHoje, custoPrevAteHoje: rw.custoPrevAteHoje, custoRestante: rw.custoRestante, fMesAtual: rw.fMesAtual }, ps); n += 1;
      }
    }
  }
  if (JSON.stringify(P) !== JSON.stringify(p) || JSON.stringify(Q) !== JSON.stringify(p)) erros.push(`${p.id}: o cálculo de custo alterou o plano — leitores não criam objeto`);
}
// terceirizado SEM repasse dá os MESMOS números da execução (custo, margem, esforço) — é a promessa do papel
{
  const a = resumos['c2|c2c1']; const b = resumos['c2x|c2xc1'];
  for (const k of ['esforco', 'custo', 'margem', 'mgp', 'custoCons', 'margemCons']) { cmp({ id: 'c2', nome: 'terc sem repasse = exec' }, k, a[k], b[k]); n += 1; }
  cmp({ id: 'c2', nome: 'terc sem repasse = exec' }, 'exec + terc', a.exec + a.terc, b.exec); n += 1;
  cmp({ id: 'c2', nome: 'terc sem repasse = exec' }, 'resultadoCedente', a.resultadoCedente, 0); n += 1;
  const c3 = resumos['c3|c3c1'];   // com repasse: 120 h × 120 = 14.400 no projeto, 120 h × 60 = 7.200 na empresa
  cmp({ id: 'c3', nome: 'terc com repasse' }, 'custoTerc', c3.custoTerc, 14400); n += 1;
  cmp({ id: 'c3', nome: 'terc com repasse' }, 'resultadoCedente', c3.resultadoCedente, 7200); n += 1;
  cmp({ id: 'c3', nome: 'terc com repasse' }, 'custoCons = custo − resultadoCedente', c3.custoCons, c3.custo - c3.resultadoCedente); n += 1;
}
// o custo do REALIZADO: quem tem alocação terceirizada com repasse > 0 é custeado pelo repasse, os demais pelo custo/h
for (const [pid, cid, a, esp] of [['c3', 'c3c1', 'a-bruno', 120], ['c2', 'c2c1', 'a-bruno', 60], ['c3', 'c3c1', 'a-ana', 95], ['c5', 'c5c1', 'a-bruno', 60], ['c6', 'c6c1', 'a-bruno', 60], ['c4', 'c4c1', 'plan_x1', 150]]) {
  const P = JSON.parse(JSON.stringify(TODOS.find((x) => x.id === pid)));
  const w = web.rpCustoRealH(P, P.cenarios.find((x) => x.id === cid), a);
  cmp({ id: pid, nome: 'rpCustoRealH' }, `rpCustoRealH(${a})`, w, esp); n += 1;
}

// ---- 🗓 ciclo de faturamento: rpCiclosDe + rpPeriodosFat (cliente cadastrado › contrato de parceria › mês civil) ----
const PLANOS_CICLO = [
  mkPlano('k1', 'cliente NTT (fecha dia 25, dois ciclos ajustados)', { clienteId: 'cl-ntt' }),
  mkPlano('k2', 'só contrato (fecha 25, nota 30, agosto ajustado)', { contrato: 'pc-x' }),
  mkPlano('k3', 'sem cliente nem contrato (mês civil)', {}),
  mkPlano('k4', 'cliente + contrato: o cliente vale', { clienteId: 'cl-ntt', contrato: 'pc-x' }),
  mkPlano('k5', 'cliente que não existe mais cai no contrato', { clienteId: 'cl-sumiu', contrato: 'pc-x' }),
  mkPlano('k6', 'cliente que não existe mais e sem contrato = mês civil', { clienteId: 'cl-sumiu' }),
  mkPlano('k7', 'cliente que fecha no último dia', { clienteId: 'cl-31' }),
  mkPlano('k8', 'cliente com dados estranhos (fechamento e ajustes inválidos)', { clienteId: 'cl-ruim' }),
  mkPlano('k9', 'plano começa no meio do ciclo e acaba antes do fim dele', { clienteId: 'cl-ntt', inicio: '2026-09-10', fim: '2026-10-12' }),
  mkPlano('k10', 'fevereiro com cliente que fecha dia 30', { clienteId: 'cl-feb', inicio: '2026-01-05', fim: '2026-03-10' }),
  mkPlano('k11', 'cliente igual ao contrato (sem divergência)', { clienteId: 'cl-ntt', contrato: 'pc-igual' }),
  mkPlano('k12', 'contrato sem fechamento (usa o último dia)', { contrato: 'pc-sem' }),
  mkPlano('k13', 'total rateado e vendMan com cliente', { clienteId: 'cl-ntt', modoCarga: 'total', cargaTotal: 700, vendMan: { '2026-10': 90 } }),
  mkPlano('k14', 'início inválido com cliente (nenhum período)', { clienteId: 'cl-ntt', inicio: '' }),
  mkPlano('k15', 'contrato que não existe', { contrato: 'pc-fantasma' }),
  mkPlano('k16', 'plano de muitos ciclos (o limite de 60)', { clienteId: 'cl-ntt', inicio: '2022-01-01', fim: '2028-12-31' }),
];
const FONTE_ESPERADA = { k1: 'cliente', k2: 'contrato', k3: 'mes', k4: 'cliente', k5: 'contrato', k6: 'mes', k7: 'cliente', k8: 'cliente', k9: 'cliente', k10: 'cliente', k11: 'cliente', k12: 'contrato', k13: 'cliente', k14: 'cliente', k15: 'mes', k16: 'cliente' };
const DIVERGE_ESPERADO = { k4: true, k11: false, k1: false, k2: false };
for (const p of PLANOS_CICLO) {
  const P = JSON.parse(JSON.stringify(p)); const Q = JSON.parse(JSON.stringify(p));
  const cw = web.rpCalc(P, P.cenarios[0]); const cs = srv.rpCalcResumo(Q, Q.cenarios[0], CFG, hoje);
  const ciW = web.rpCiclosDe(P); const ciS = srv.rpCiclosDe(Q, CFG);
  cmp(p, 'rpCiclosDe (fonte e objeto)', { fonte: ciW.fonte, id: ciW.obj && ciW.obj.id }, { fonte: ciS.fonte, id: ciS.obj && ciS.obj.id }); n += 1;
  if (ciW.fonte !== FONTE_ESPERADA[p.id]) erros.push(`${p.id} (${p.nome}) · rpCiclosDe: fonte ${ciW.fonte}, esperava ${FONTE_ESPERADA[p.id]} (precedência cliente › contrato › mês civil)`);
  const perW = web.rpPeriodosFat(P, cw); const perS = srv.rpPeriodosFat(Q, cs, CFG, hoje); const perS0 = srv.rpPeriodosFat(Q, null, CFG, hoje);
  cmp(p, 'rpPeriodosFat', perW, perS); n += 1;
  cmp(p, 'rpPeriodosFat (servidor sem o calc pronto)', perS, perS0); n += 1;
  if (perW.some((x) => x.fonte !== FONTE_ESPERADA[p.id])) erros.push(`${p.id}: período com fonte diferente de ${FONTE_ESPERADA[p.id]}`);
  if (p.id in DIVERGE_ESPERADO) { const dv = !!web.rpDivergeCiclo(P); if (dv !== DIVERGE_ESPERADO[p.id]) erros.push(`${p.id} (${p.nome}) · rpDivergeCiclo: ${dv}, esperava ${DIVERGE_ESPERADO[p.id]}`); n += 1; }
  // invariantes: os períodos são contíguos e a soma das horas rateadas é a das horas vendidas (±0,05 de arredondamento por período)
  for (let i = 1; i < perS.length; i += 1) if (perS[i].iniPlano !== srv.proxDia(perS[i - 1].fimPlano)) erros.push(`${p.id} (${p.nome}): períodos não contíguos em ${perS[i - 1].ym} → ${perS[i].ym}`);
  if (perS.length) { const soma = perS.reduce((t, x) => t + x.horasAuto, 0); const vend = srv.rpVendidas(Q, CFG, hoje);
    if (Math.abs(soma - vend) > 0.05) erros.push(`${p.id} (${p.nome}): Σ horasAuto dos períodos ${soma} ≠ horas vendidas ${vend}`); n += 1; }
  else if (p.id !== 'k14') erros.push(`${p.id} (${p.nome}): nenhum período de faturamento`);
  if (JSON.stringify(P) !== JSON.stringify(p) || JSON.stringify(Q) !== JSON.stringify(p)) erros.push(`${p.id}: o cálculo dos ciclos alterou o plano — leitores não criam objeto`);
}
// o NTT: Jan/26 = 26/12/2025 → 25/01/2026 e Mar/26 = 26/02 → 27/03 (ajustado) — o exemplo do pedido, conferido nos dois lados
{
  const q = JSON.parse(JSON.stringify(PLANOS_CICLO[0])); q.inicio = '2025-12-01'; q.fim = '2026-04-30';
  const w = vm.runInContext('(cl)=>pcPeriodos(cl, "2025-12-01", "2026-04-30")', ctx)(CLIENTES[0]); const sv = srv.pcPeriodos(CLIENTES[0], '2025-12-01', '2026-04-30');
  cmp({ id: 'ntt', nome: 'NTT' }, 'pcPeriodos', w, sv); n += 1;
  const jan = sv.find((x) => x.ym === '2026-01'); const mar = sv.find((x) => x.ym === '2026-03');
  if (!jan || jan.ini !== '2025-12-26' || jan.fim !== '2026-01-25') erros.push(`NTT Jan/26 deveria ser 2025-12-26 → 2026-01-25 e deu ${JSON.stringify(jan)}`);
  if (!mar || mar.ini !== '2026-02-26' || mar.fim !== '2026-03-27' || !mar.ajustado) erros.push(`NTT Mar/26 (ajustado) deveria ser 2026-02-26 → 2026-03-27 e deu ${JSON.stringify(mar)}`);
}
// leitores do cadastro não criam cfg.clientes (a mescla da config compartilhada trata o que a sessão cria como mudança dela)
{
  const r = vm.runInContext('delete cfg.clientes; rpClienteDe({clienteId:"x"}); rpCiclosDe({clienteId:"x"}); clDe("x"); clLista(); clPlanosDe("x"); clContratosDe("x"); clEmUso("x"); typeof cfg.clientes', ctx);
  if (r !== 'undefined') erros.push(`os leitores de cfg.clientes criaram o objeto (typeof = ${r}) — só o setter pode criar`); n += 1;
  vm.runInContext(`cfg.clientes=${JSON.stringify(CLIENTES)};`, ctx);
  let quebrou = ''; try { srv.rpCiclosDe({ clienteId: 'x', contrato: 'y' }, {}); srv.rpCiclosDe({ clienteId: 'x' }, { clientes: 'texto', parcerias: 7 }); srv.rpPeriodosFat(PLANOS_CICLO[0], null, {}, hoje); } catch (e) { quebrou = e.message; }
  if (quebrou) erros.push(`o servidor quebrou com cfg sem clientes/parcerias ou com lixo: ${quebrou}`); n += 1;
}

// ---- 💰 faturamento pelo vendido: rpFatBase · rpFatManDe · rpFracaoCiclo · rpFatAte (painel: rpFatCalc) ----
const PLANOS_FAT = [
  mkPlano('f1', 'cliente NTT, vendido (padrão), sem horas digitadas', { clienteId: 'cl-ntt' }),
  mkPlano('f2', 'cliente NTT com horas digitadas (válida, zero, texto, negativa e um ciclo órfão)', { clienteId: 'cl-ntt', fatBase: 'vendido', fatMan: { '2026-10': 120, '2026-09': 0, '2026-11': 'x', '2026-12': -3, '2027-01': 5 } }),
  mkPlano('f3', 'cliente NTT, base apontado (a regra antiga)', { clienteId: 'cl-ntt', fatBase: 'apontado', fatMan: { '2026-10': 120 } }),
  mkPlano('f4', 'contrato que acaba antes do plano (ciclos depois dele valem zero)', { contrato: 'pc-fim' }),
  mkPlano('f5', 'mês civil, vendido', {}),
  mkPlano('f6', 'vendMan e horas digitadas juntos', { clienteId: 'cl-ntt', vendMan: { '2026-10': 90 }, fatMan: { '2026-09': 77.5 } }),
  mkPlano('f7', 'cliente + contrato que acaba antes (o contrato ligado manda no encerrado)', { clienteId: 'cl-ntt', contrato: 'pc-fim' }),
  mkPlano('f8', 'fatBase inválido (cai em vendido) e contrato com fim inválido', { clienteId: 'cl-ntt', fatBase: 'qualquer', contrato: 'pc-fim2' }),
  mkPlano('f9', 'plano começa no meio do ciclo e acaba no meio de outro', { clienteId: 'cl-ntt', inicio: '2026-09-10', fim: '2026-10-12', fatMan: { '2026-10': 40 } }),
];
// realizado FIXO por dia (segunda e quarta, de 29/06 a 27/11; mais um domingo antes do plano e um dia depois do fim, que caem fora de qualquer ciclo)
const PORDIA = {}; { let d = '2026-06-29'; let i = 0; while (d <= '2026-11-27') { const w = srv.diaSemana(d); if (w === 1 || w === 3) { i += 1; PORDIA[d] = { h: 4 + (i % 5), hFat: i % 4 === 0 ? 0 : 3 + (i % 3), custo: (4 + (i % 5)) * 80 }; } d = srv.proxDia(d); }
  PORDIA['2026-08-30'] = { h: 3, hFat: 3, custo: 240 }; PORDIA['2026-12-02'] = { h: 2, hFat: 2, custo: 160 }; }
const ATES = ['2026-08-15', '2026-09-01', '2026-09-10', '2026-09-25', '2026-09-30', '2026-10-12', '2026-11-02', '2026-11-30', '2027-02-01'];
for (const p of PLANOS_FAT) {
  const P = JSON.parse(JSON.stringify(p)); const Q = JSON.parse(JSON.stringify(p));
  const cw = web.rpCalc(P, P.cenarios[0]); const cs = srv.rpCalcResumo(Q, Q.cenarios[0], CFG, hoje);
  const perW = web.rpPeriodosFat(P, cw); const perS = srv.rpPeriodosFat(Q, cs, CFG, hoje);
  cmp(p, 'rpPeriodosFat (horasAuto, man, horas, valor, encerrado…)', perW, perS); n += 1;
  cmp(p, 'rpFatBase', web.rpFatBase(P), srv.rpFatBase(Q)); n += 1;
  for (const ym of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2099-01', '']) { cmp(p, `rpFatManDe(${ym})`, web.rpFatManDe(P, ym), srv.rpFatManDe(Q, ym)); n += 1; }
  const soma = perS.reduce((t, x) => t + x.horasAuto, 0); const vend = srv.rpVendidas(Q, CFG, hoje);
  if (Math.abs(soma - vend) > 0.05) erros.push(`${p.id} (${p.nome}): Σ horasAuto ${soma} ≠ horas vendidas ${vend}`); n += 1;
  perS.forEach((x) => { const esperado = srv.rpFatManDe(Q, x.ym); const h = esperado != null ? esperado : x.horasAuto;
    if (!perto(x.horas, h)) erros.push(`${p.id} ${x.ym}: horas ${x.horas}, esperava ${h} (digitada vale, senão a conta)`);
    if (!perto(x.valor, x.horas * cs.vh)) erros.push(`${p.id} ${x.ym}: valor ${x.valor} ≠ horas × valor-hora`);
    if (x.man !== (esperado != null)) erros.push(`${p.id} ${x.ym}: man=${x.man}`); n += 1; });
  for (const ate of ATES) {
    for (const x of perW) { cmp(p, `rpFracaoCiclo(${x.ym}, ${ate})`, web.rpFracaoCiclo(x, ate), srv.rpFracaoCiclo(x, ate, CFG)); n += 1; }
    // horas faturáveis por ciclo, calculadas AQUI (independente das duas implementações) a partir do mesmo porDia
    const gastasFat = perS.map((x) => Object.keys(PORDIA).filter((d) => d >= x.iniPlano && d <= x.fimPlano).reduce((t, d) => t + PORDIA[d].hFat, 0));
    const hFatTot = Object.keys(PORDIA).reduce((t, d) => t + PORDIA[d].hFat, 0);
    const fw = web.rpFatCalc(P, cw, PORDIA, ate); const fs = srv.rpFatAte(Q, cs, perS, ate, gastasFat, hFatTot, CFG);
    const proj = (f) => ({ fatAte: f.fatAte, horasAte: f.horasAte, por: f.por.map((x) => ({ ym: x.ym, fr: x.fr, horasAte: x.horasAte, valorAte: x.valorAte })) });
    cmp(p, `rpFatCalc × rpFatAte (até ${ate})`, proj(fw), proj(fs)); n += 1;
    cmp(p, `rpFatCalc gastasFat por ciclo (até ${ate})`, fw.por.map((x) => x.gastasFat), gastasFat); n += 1;
    const base = srv.rpFatBase(Q);
    if (base === 'apontado' && !perto(fs.fatAte, hFatTot * cs.vh)) erros.push(`${p.id} (até ${ate}): apontado deveria ser hFat × valor-hora = ${hFatTot * cs.vh}, deu ${fs.fatAte}`);
    if (base === 'vendido') {
      const esp = perS.reduce((t, x) => t + (x.encerrado ? 0 : x.valor * srv.rpFracaoCiclo(x, ate, CFG)), 0);
      if (!perto(fs.fatAte, esp)) erros.push(`${p.id} (até ${ate}): vendido deveria somar os ciclos (${esp}), deu ${fs.fatAte}`);
      // ciclo fechado conta INTEIRO; o que ainda não começou, zero; o encerrado (depois do fim do contrato), zero
      fs.por.forEach((x, i) => { if (perS[i].encerrado && x.valorAte !== 0) erros.push(`${p.id} ${x.ym}: ciclo encerrado deveria valer 0`);
        if (!perS[i].encerrado && x.fr === 1 && !perto(x.valorAte, perS[i].valor)) erros.push(`${p.id} ${x.ym}: ciclo fechado deveria valer o valor inteiro`);
        if (x.fr === 0 && x.valorAte !== 0) erros.push(`${p.id} ${x.ym}: ciclo que não começou deveria valer 0`); });
    }
    // plano inteiro decorrido e sem encerrado: o faturado é o valor total dos ciclos
    if (base === 'vendido' && ate > srv.rpFim(Q, hoje) && !perS.some((x) => x.encerrado) && !perto(fs.fatAte, perS.reduce((t, x) => t + x.valor, 0))) erros.push(`${p.id} (até ${ate}): plano encerrado deveria faturar Σ valor`);
    n += 1;
  }
  if (JSON.stringify(P) !== JSON.stringify(p) || JSON.stringify(Q) !== JSON.stringify(p)) erros.push(`${p.id}: o cálculo do faturamento alterou o plano (criou fatMan?) — leitores não criam objeto`);
}
// o contrato que acaba antes (pc-fim, 10/10): o ciclo que começa depois dele (26/10 em diante) é "encerrado"; o que contém o fim (26/09 → 25/10) não
{
  const per = srv.rpPeriodosFat(JSON.parse(JSON.stringify(PLANOS_FAT[3])), null, CFG, hoje);
  const enc = per.filter((x) => x.encerrado).map((x) => x.ym).join(); const nao = per.filter((x) => !x.encerrado).map((x) => x.ym).join();
  if (nao !== '2026-09,2026-10' || enc !== '2026-11,2026-12') erros.push(`pc-fim: encerrados=${enc} (esperava 2026-11,2026-12), vigentes=${nao} (esperava 2026-09,2026-10)`); n += 1;
}
// setter × leitores: digitar cria, apagar nunca cria, texto/negativo é ignorado, vírgula decimal vale, órfãos aparecem
{
  const q = JSON.parse(JSON.stringify(mkPlano('s1', 'setter', { clienteId: 'cl-ntt' }))); const antes = JSON.stringify(q);
  for (const [txt, esp] of [['', null], ['  ', null], ['abc', null], ['-1', null], ['12,5', 12.5], ['0', 0], ['143.756', 143.76], [null, null]]) { cmp({ id: 's1', nome: 'rpFatNum' }, `rpFatNum(${JSON.stringify(txt)})`, web.rpFatNum(txt), esp); n += 1; }
  web.rpFatManSet(q, '2026-10', ''); web.rpFatManSet(q, '2026-10', 'x');
  if (JSON.stringify(q) !== antes) erros.push('rpFatManSet com vazio/inválido num plano sem fatMan criou o objeto — só digitar um número pode criar'); n += 1;
  web.rpFatManSet(q, '2026-10', '120'); web.rpFatManSet(q, '2027-03', '8');
  cmp({ id: 's1', nome: 'setter' }, 'rpFatManDe depois de digitar', [web.rpFatManDe(q, '2026-10'), web.rpFatManDe(q, '2027-03')], [120, 8]); n += 1;
  cmp({ id: 's1', nome: 'órfãos' }, 'rpFatManOrfaos', web.rpFatManOrfaos(q), ['2027-03']); n += 1;
  web.rpFatManSet(q, '2026-10', ''); cmp({ id: 's1', nome: 'setter' }, 'apagar volta ao automático', web.rpFatManDe(q, '2026-10'), null); n += 1;
}
// o realizado de verdade (rpReal): porDia soma o MESMO que porMes, as semanas somam as horas e o 'vendido' fecha o plano em Σ valor dos ciclos
{
  const q = JSON.parse(JSON.stringify(mkPlano('r1', 'rpReal com worklogs', { clienteId: 'cl-ntt', projeto: 'PX', fatMan: { '2026-10': 120 } })));
  const wl = Object.keys(PORDIA).filter((d) => d >= '2026-09-01' && d <= '2026-11-27').map((d, i) => ({ p: 'PX', a: i % 2 ? 'a-ana' : 'a-bruno', d: `${d}T09:00:00-03:00`, s: PORDIA[d].h * 3600, f: PORDIA[d].hFat > 0 ? 1 : 0, k: 'PX-1' }));
  const total = wl.reduce((t, w) => t + w.s / 3600, 0); const totalFat = wl.reduce((t, w) => t + (w.f ? w.s / 3600 : 0), 0);
  for (const ate of ['2026-10-14', '2026-11-30']) {
    const wlA = wl.filter((w) => w.d.slice(0, 10) <= ate);   // o /api/tempo só devolve até a data lida
    vm.runInContext(`rpRealChave=function(p){ return 'PX|'+(p.inicio||'')+'|${ate}'; }; estado.rentab.tempo['PX|2026-09-01|${ate}']={ worklogs: ${JSON.stringify(wlA)}, pessoas: {} };`, ctx);
    const cw = web.rpCalc(q, q.cenarios[0]); const r = web.rpReal(q, cw); const esperaH = wlA.reduce((t, w) => t + w.s / 3600, 0);
    if (!perto(r.h, esperaH)) erros.push(`rpReal(${ate}): h ${r.h} ≠ ${esperaH}`);
    if (!perto(Object.values(r.porDia).reduce((t, x) => t + x.h, 0), r.h)) erros.push(`rpReal(${ate}): Σ porDia.h ≠ h`);
    if (!perto(Object.values(r.porDia).reduce((t, x) => t + x.hFat, 0), r.hFat)) erros.push(`rpReal(${ate}): Σ porDia.hFat ≠ hFat`);
    if (!perto(Object.values(r.porDia).reduce((t, x) => t + x.custo, 0), r.custo)) erros.push(`rpReal(${ate}): Σ porDia.custo ≠ custo`);
    const sem = web.rpSemanas(q, r, 99); const somaSem = sem.reduce((t, w) => t + w.gast, 0);
    if (!perto(somaSem, r.h)) erros.push(`rpReal(${ate}): as semanas somam ${somaSem}, o realizado é ${r.h}`);
    if (!perto(sem.reduce((t, w) => t + w.vend, 0), r.vendAteHoje)) erros.push(`rpReal(${ate}): Σ vendidas das semanas ${sem.reduce((t, w) => t + w.vend, 0)} ≠ vendidas até a data ${r.vendAteHoje}`);
    if (!perto(r.receitaReal, r.fat.fatAte)) erros.push(`rpReal(${ate}): receitaReal ≠ fat.fatAte`);
    const fim = web.rpFatCalc(q, cw, r.porDia, r.ate);
    if (!perto(fim.fatAte, r.receitaReal)) erros.push(`rpReal(${ate}): rpFatCalc ≠ receitaReal`);
    n += 7;
  }
  void total; void totalFat;
  q.fatBase = 'apontado'; const cw2 = web.rpCalc(q, q.cenarios[0]); const r2 = web.rpReal(q, cw2);
  if (!perto(r2.receitaReal, r2.hFat * cw2.vh)) erros.push(`apontado: receitaReal ${r2.receitaReal} ≠ hFat × valor-hora ${r2.hFat * cw2.vh} (o número de sempre)`); n += 1;
}
// ---- 📸 realizado até um dia: rpRealAte (servidor) × rpReal (painel) — a base das fotos diárias/semanais ----
{
  const proj = (p) => ({ ...p, projeto: 'PX' });
  const marcosFat = [{ id: 'm1', nome: 'B', data: '2026-10-15', pct: 40, status: 'faturado' }, { id: 'm2', nome: 'A', data: '2026-10-15', pct: 10, status: 'faturado' },
    { id: 'm3', nome: 'Go', data: '2026-11-20', pct: 50 }, { id: 'm4', nome: 'Z', data: '2026-09-01', pct: 'x', status: 'faturado' }, { id: 'm5', nome: 'Neg', data: '2026-09-02', pct: -10, status: 'faturado' }];
  const PL_REAL = [
    ...PLANOS_CUSTO.map(proj),
    ...PLANOS_CICLO.filter((p) => ['k1', 'k2', 'k4', 'k9', 'k13'].includes(p.id)).map(proj),
    ...PLANOS_FAT.map(proj),
    mkPlano('rf', 'fechado com marcos faturados', { tipo: 'fechado', valorProjeto: 90000, marcos: marcosFat, projeto: 'PX' }, [{ a: 'a-bruno', papel: 'terc', rep: 100, h: { '2026-09': 30, '2026-10': 30 } }]),
    mkPlano('ri', 'interno com orçamento', { tipo: 'interno', orcamento: 80000, cargaDia: 0, projeto: 'PX' }, [{ a: 'a-bruno', papel: 'terc', rep: 75, h: { '2026-09': 30, '2026-10': 30 } }]),
    (() => { const q = mkPlano('rc', 'cenário ATIVO é o segundo (com terceirizado)', { projeto: 'PX' }); q.cenarios[1].aloc = [{ a: 'a-ana', papel: 'exec', h: { '2026-09': 50, '2026-10': 50 } }, { a: 'a-bruno', papel: 'terc', rep: 90, h: { '2026-09': 25, '2026-10': 25 } }]; q.cenario = 'rcc2'; return q; })(),
    (() => { const q = mkPlano('rd', 'cenário ativo que não existe mais cai no primeiro', { projeto: 'PX' }, [{ a: 'a-bruno', papel: 'terc', rep: 70, h: { '2026-09': 10 } }]); q.cenario = 'nao-existe'; return q; })(),
    mkPlano('rv', 'vendMan, fatMan e terceirizado com repasse, a pessoa também em execução', { clienteId: 'cl-ntt', vendMan: { '2026-10': 90 }, fatMan: { '2026-09': 77.5 }, projeto: 'PX' }, [{ a: 'a-ana', papel: 'terc', rep: 130, h: { '2026-10': 20 } }]),
  ];
  // worklogs fixos: quatro pessoas (uma sem custo cadastrado), faturáveis ou não, um projeto de ruído, dias fora do plano e fora dos meses
  const PESS = ['a-ana', 'a-bruno', 'a-diego', 'a-zero', 'plan_fantasma'];
  const WL = []; { let d = '2026-08-17'; let i = 0; while (d <= '2026-12-20') { const w = srv.diaSemana(d); if (w >= 1 && w <= 5 || i % 7 === 0) { i += 1;
    WL.push({ p: 'PX', a: PESS[i % PESS.length], d: `${d}T09:00:00.000-0300`, s: (1 + (i % 4)) * 1800 + (i % 3) * 600, f: i % 3 === 0 ? 0 : 1, k: 'PX-' + (i % 9) });
    if (i % 4 === 0) WL.push({ p: 'PX', a: 'a-bruno', d: `${d}T14:00:00.000-0300`, s: 3600, f: 1, k: 'PX-1' });
    WL.push({ p: 'OUTRO', a: 'a-ana', d: `${d}T10:00:00.000-0300`, s: 7200, f: 1, k: 'OUTRO-1' }); } d = srv.proxDia(d); } }
  const SRV_DIAS = ['2026-08-31', '2026-09-01', '2026-09-15', '2026-09-30', '2026-10-14', '2026-10-26', '2026-11-02', '2026-11-30', '2026-12-31', '2027-03-01'];
  const subReal = (r) => ({ h: r.h, hFat: r.hFat, custo: r.custo, custoCons: r.custoCons, tercH: r.tercH, tercCusto: r.tercCusto, resultadoCedente: r.resultadoCedente,
    vendAteHoje: r.vendAteHoje, prevAteHoje: r.prevAteHoje, custoPrevAteHoje: r.custoPrevAteHoje, custoRestante: r.custoRestante, fMesAtual: r.fMesAtual,
    receitaAteHoje: r.receitaAteHoje, receitaReal: r.receitaReal, receitaBase: r.receitaBase, margemAteHoje: r.margemAteHoje, econReal: r.econReal, eficReal: r.eficReal,
    fat: r.fat ? { fatAte: r.fat.fatAte, horasAte: r.fat.horasAte, hFat: r.fat.hFat } : null, porDia: r.porDia });
  let comp = 0; let algumNaoZero = 0;
  for (const p of PL_REAL) {
    const P = JSON.parse(JSON.stringify(p)); const Q = JSON.parse(JSON.stringify(p));
    const cenW = web.rpCenario(P); const cenS = srv.rpCenarioDe(Q);
    cmp(p, 'rpCenarioDe × rpCenario (alocação do cenário ativo)', cenW.aloc || [], cenS.aloc || []); n += 1;
    const cw = web.rpCalc(P, cenW); const cs = srv.rpCalcResumo(Q, cenS, CFG, hoje);
    // marcos faturados (escopo fechado) — o valor que o painel soma em rpMarcosCalc(...).faturado
    if (p.tipo === 'fechado') { cmp(p, 'rpMarcosFaturado × rpMarcosCalc.faturado', web.rpMarcosCalc(P, cw.valorProj).faturado, srv.rpMarcosFaturado(Q, cs.valorProj)); n += 1; }
    for (const a of [...PESS, 'a-sem-custo', 'plan_x1']) { cmp(p, `rpCustoRealH(${a})`, web.rpCustoRealH(P, cenW, a), srv.rpCustoRealH(cenS, a, CFG)); n += 1; }
    for (const dia of SRV_DIAS) {
      const jan = srv.rpJanelaReal(Q, dia, hoje); if (!jan) continue;
      const lista = WL.filter((w) => { const d = w.d.slice(0, 10); return d >= jan.de && d <= jan.ate; });   // o que o /api/tempo devolve para a janela
      vm.runInContext(`var __K='PX|${jan.de}|${jan.ate}'; rpRealChave=function(p){ return __K; }; estado.rentab.tempo[__K]={ worklogs: ${JSON.stringify(lista)}, pessoas: {} };`, ctx);
      const rw = web.rpReal(P, cw); const rs = srv.rpRealAte(Q, cs, cenS, WL, jan, CFG, hoje, dia);
      cmp(p, `rpRealAte × rpReal até ${jan.ate}`, subReal(rw), subReal(rs)); n += 1;
      const pessW = {}; rw.pessoas.forEach((x) => { pessW[x.a] = { h: x.h, custo: x.custo }; });
      cmp(p, `rpRealAte × rpReal por pessoa até ${jan.ate}`, pessW, rs.pessoas); n += 1;
      // o que cada um apontou NO dia: conta independente (horas do dia × a taxa do realizado) — a foto diária
      const doDia = {}; lista.filter((w) => w.p === 'PX' && w.d.slice(0, 10) === dia && rw.porDia[dia]).forEach((w) => { const q = doDia[w.a] = doDia[w.a] || { h: 0, custo: 0 }; q.h += w.s / 3600; q.custo += w.s / 3600 * web.rpCustoRealH(P, cenW, w.a); });
      cmp(p, `rpRealAte.pessoasDia no dia ${dia}`, Object.keys(doDia).sort(), Object.keys(rs.pessoasDia).sort());
      Object.keys(doDia).forEach((a) => cmp(p, `rpRealAte.pessoasDia ${a} ${dia}`, doDia[a], rs.pessoasDia[a]));
      comp += 3; if (rs.h > 0) algumNaoZero += 1;
    }
    if (JSON.stringify(P.marcos) !== JSON.stringify(p.marcos) || JSON.stringify(Q) !== JSON.stringify(p)) erros.push(`${p.id}: o realizado alterou o plano — leitores não criam objeto`);
  }
  if (algumNaoZero < 40) erros.push(`rpRealAte: poucas comparações com horas de verdade (${algumNaoZero}) — o fixture ficou vazio?`);
  n += comp;
  // a janela lida no Clockwork: rpJanelaReal (hoje, fim no passado, início no futuro, mais de 365 dias, sem projeto) × rpRealChave do painel (hoje = hoje)
  const chave = (p, jan) => (jan ? `${p.projeto}|${jan.de}|${jan.ate}` : '');
  for (const p of [{ projeto: 'PX', inicio: '2026-09-01', fim: '2026-12-31', meses: 4 }, { projeto: 'PX', inicio: '2024-01-01', fim: '2028-12-31' }, { projeto: 'PX', inicio: '2026-01-10', fim: '2026-03-20', meses: 3 },
    { projeto: 'PX', inicio: '2031-01-01', fim: '2031-03-01' }, { projeto: 'PX', inicio: '2020-05-01', meses: 2 }, { inicio: '2026-09-01', fim: '2026-12-31' }, { projeto: 'PX', inicio: hoje, fim: hoje }, { projeto: 'PX', inicio: srv.addDias(hoje, -400), fim: srv.addDias(hoje, 100) }]) {
    cmp({ id: 'janela', nome: JSON.stringify(p) }, 'rpJanelaReal × rpRealChave', web.rpRealChave(p), chave(p, srv.rpJanelaReal(p, hoje, hoje))); n += 1;
  }
  // o servidor não cria nada ao ler um plano sem cenário (o painel cria um "Base")
  const sem = JSON.parse(JSON.stringify({ id: 'sc', inicio: '2026-09-01' })); srv.rpCenarioDe(sem);
  if (JSON.stringify(sem) !== JSON.stringify({ id: 'sc', inicio: '2026-09-01' })) erros.push('rpCenarioDe criou cenário no plano — leitores não criam objeto'); n += 1;
  let quebrou2 = ''; try { srv.rpMarcosFaturado({ marcos: [null, 'x', { pct: 10, status: 'faturado' }] }, 1000); srv.rpRealAte({ projeto: 'PX', inicio: '2026-09-01' }, srv.rpCalcResumo({ projeto: 'PX', inicio: '2026-09-01', meses: 2 }, { aloc: [] }, {}, hoje), { aloc: [] }, [null, { p: 'PX' }, { p: 'PX', d: '2026-09-03T09:00', s: 'x' }], { de: '2026-09-01', ate: '2026-09-30' }, {}, hoje, '2026-09-03'); } catch (e) { quebrou2 = e.message; }
  if (quebrou2) erros.push(`o servidor quebrou com marcos/worklogs de lixo: ${quebrou2}`); n += 1;
}
// as explicações: toda chave do glossário existe, toda entrada de RP_EXPLICA está num grupo e tem os quatro textos
{
  const E = web.RP_EXPLICA; const noGl = new Set(web.RP_GLOSSARIO.flatMap((g) => g[1]));
  for (const k of noGl) if (!E[k]) erros.push(`RP_GLOSSARIO cita "${k}", que não existe em RP_EXPLICA`);
  for (const k of Object.keys(E)) { if (!noGl.has(k)) erros.push(`RP_EXPLICA "${k}" não está em nenhum grupo do glossário`);
    for (const f of ['nome', 'oque', 'calc', 'ler']) if (!String(E[k][f] || '').trim()) erros.push(`RP_EXPLICA "${k}" sem ${f}`); n += 1; }
}

if (erros.length) {
  console.error('✗ Rentabilidade: servidor e painel divergem — api/_lib/rentab.js precisa acompanhar o 17b:');
  erros.forEach((e) => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log(`✓ Paridade da Rentabilidade OK (${PLANOS.length} planos de horas vendidas + ${PLANOS_CUSTO.length} de custo/papel + ${PLANOS_CICLO.length} de ciclo de faturamento + ${PLANOS_FAT.length} de faturamento pelo vendido + o realizado até um dia das fotos, ${n} comparações — servidor = painel).`);
