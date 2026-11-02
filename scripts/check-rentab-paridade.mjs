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
};
const ctx = vm.createContext(sandbox);
for (const arq of ['public/js/01-nucleo.js', 'public/js/16b-parcerias.js', 'public/js/16g-clientes-ciclo.js', 'public/js/17b-rentabilidade.js']) {
  try { new vm.Script(readFileSync(arq, 'utf8'), { filename: arq }).runInContext(ctx); }
  catch (e) { console.error(`✗ não consegui carregar ${arq} no vm: ${e.message}`); process.exit(1); }
}
// A config do painel (feriados) é a mesma passada ao servidor.
vm.runInContext(`cfg.feriadosExtra=${JSON.stringify(CFG.feriadosExtra)}; cfg.feriadosRemovidos=${JSON.stringify(CFG.feriadosRemovidos)}; cfg.custosPessoa=${JSON.stringify(CFG.custosPessoa)}; cfg.pessoasPlanejadas=${JSON.stringify(CFG.pessoasPlanejadas)}; cfg.clientes=${JSON.stringify(CFG.clientes)}; cfg.parcerias=${JSON.stringify(CFG.parcerias)};`, ctx);
const web = vm.runInContext('({ rpMeses, rpFim, rpVendPorMes, rpVendidas, rpVendAte, rpDiasUteis, RP_MAX_MESES, hojeSP, rpCalc, rpReal, rpStatus, rpCustoH, rpRepH, rpPapel, rpPapelRot, rpEsf, rpCustoRealH, rpCenario, rpCiclosDe, rpClienteDe, rpPeriodosFat, rpDivergeCiclo, pcPeriodos, pcPeriodo })', ctx);
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
  if (perS.length) { const soma = perS.reduce((t, x) => t + x.horas, 0); const vend = srv.rpVendidas(Q, CFG, hoje);
    if (Math.abs(soma - vend) > 0.05) erros.push(`${p.id} (${p.nome}): Σ horas dos períodos ${soma} ≠ horas vendidas ${vend}`); n += 1; }
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

if (erros.length) {
  console.error('✗ Rentabilidade: servidor e painel divergem — api/_lib/rentab.js precisa acompanhar o 17b:');
  erros.forEach((e) => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log(`✓ Paridade da Rentabilidade OK (${PLANOS.length} planos de horas vendidas + ${PLANOS_CUSTO.length} de custo/papel + ${PLANOS_CICLO.length} de ciclo de faturamento, ${n} comparações — servidor = painel).`);
