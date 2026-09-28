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
// Sem rede: nada aqui chama API.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as srv from '../api/_lib/rentab.js';

const erros = [];
const CFG = { feriadosExtra: { '2026-10-15': 'Feriado extra (fixture)' }, feriadosRemovidos: ['2026-11-20'] };
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
for (const arq of ['public/js/01-nucleo.js', 'public/js/17b-rentabilidade.js']) {
  try { new vm.Script(readFileSync(arq, 'utf8'), { filename: arq }).runInContext(ctx); }
  catch (e) { console.error(`✗ não consegui carregar ${arq} no vm: ${e.message}`); process.exit(1); }
}
// A config do painel (feriados) é a mesma passada ao servidor.
vm.runInContext(`cfg.feriadosExtra=${JSON.stringify(CFG.feriadosExtra)}; cfg.feriadosRemovidos=${JSON.stringify(CFG.feriadosRemovidos)};`, ctx);
const web = vm.runInContext('({ rpMeses, rpFim, rpVendPorMes, rpVendidas, rpVendAte, rpDiasUteis, RP_MAX_MESES, hojeSP })', ctx);
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

if (erros.length) {
  console.error('✗ Rentabilidade: servidor e painel divergem — api/_lib/rentab.js precisa acompanhar o 17b:');
  erros.forEach((e) => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log(`✓ Paridade da Rentabilidade OK (${PLANOS.length} planos, ${n} comparações — servidor = painel).`);
