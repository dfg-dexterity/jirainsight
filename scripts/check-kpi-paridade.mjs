#!/usr/bin/env node
// Gate de PARIDADE do 📊 Dashboard de KPIs: o número financeiro/de horas que o SERVIDOR fotografa (api/_lib/kpi.js → kpiFinanceiro) tem de ser
// o MESMO que a 🏦 Controladoria soma em tela (public/js/18-controladoria-relatorios.js → ctDados), senão o dashboard e a Controladoria
// contariam histórias diferentes para o mesmo período. Roda em `npm run check`.
//
// Como: carrega o 01-nucleo.js (CAT_FATURAVEL/wFat/alocCustoH de verdade) e o 18 de verdade num `vm` com stubs mínimos de DOM/localStorage e,
// para cada fixture, põe os MESMOS worklogs/projetos/cfg nos dois lados: ctDados() (uma categoria por vez, como a tela) × kpiFinanceiro(). Confere
// por categoria (horas, faturáveis, custo, custo de gestão, receita), por projeto (idem + tipos de esforço + contrato/valor-hora) e no total
// (por pessoa, tipos, quem apontou sem custo próprio). Fixtures (≥ 8): categoria faturável/não faturável/ARQ, projeto sem categoria com prefixo
// "XXX |" no nome (faturável e não faturável) e sem prefixo, sub-tarefa/tipo não faturável (f:0), custo padrão, gestor por e-mail e por
// accountId, contrato sem valorHora, dois contratos no mesmo projeto, vaga planejada, semana que cruza o mês (o mês de setembro + o de outubro
// = a semana inteira) e período vazio. Também confere os invariantes do formato (fin ≡ horas, semCusto, soma dos meses = a semana).
// `ctDadosDeFotos` (a Controladoria rápida): se ela não existir o gate DIZ que pulou — nunca finge que passou — e, existindo, confere (revisão
// de 2026-11-07, que antes só olhava 5 totais com `tempo=null`) o caso MISTO que é o "por ano" de verdade: ctDadosDeFotos(fotos dos meses fechados,
// /api/tempo do mês corrente) ≡ ctDados(worklogs do mesmo intervalo) — seg, segFat, custo, custoGest, rec, temContrato, por[k] (com tipos e pessoas),
// porTipo, porMes e semCusto — e ctDadosDeFotos([], tempo) ≡ ctAgrega(tempo), o que prova a ctFotosDeTempo (a 3ª cópia da regra financeira, que roda
// no navegador sobre o /api/tempo). `porPessoa` fica de fora de propósito: nas fotos ele é de TODAS as categorias (pessoaGeral). Sem rede.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { kpiFinanceiro, calculaKpiMes, calculaKpiSemana, kpiFaturavel, kpiNivelDe } from '../api/_lib/kpi.js';

const erros = [];
let n = 0;

// ---- fixtures ----
const PROJETOS = {
  AMS1: { nome: 'AMS Cliente A', categoria: 'Dexterity - AMS' },                 // DAMS (sim)
  AMS2: { nome: 'AMS Cliente B', categoria: 'Parceria - AMS' },                  // PAMS (sim)
  EA1: { nome: 'Escopo aberto', categoria: 'DEA' },                              // a própria sigla (sim)
  EF1: { nome: 'Escopo fechado', categoria: 'Dexterity - Escopo Fechado' },      // DEF (sim)
  EP1: { nome: 'Parceria escopo aberto', categoria: 'Parceria - Escopo Aberto' },// PEA (sim)
  IMI1: { nome: 'Melhorias', categoria: 'Interno - Melhorias Internas' },        // IMI (não)
  IPA1: { nome: 'Aceleradores', categoria: 'Interno - Produtos e aceleradores' },// IPA (não)
  ITP1: { nome: 'Rotinas', categoria: 'Interno - Tarefas, Processos e Rotinas' },// ITPR (não)
  ARQ1: { nome: 'Velho', categoria: 'Arquivado' },                               // ARQ (na)
  SCPF: { nome: 'IMI | Sem categoria com prefixo', categoria: 'Sem categoria' }, // prefixo IMI → não
  SCPD: { nome: 'DEF | Sem categoria com prefixo', categoria: 'Sem categoria' }, // prefixo DEF → sim
  SCNO: { nome: 'Sem categoria e sem prefixo', categoria: 'Sem categoria' },     // desconhecido → na
};
const PESSOAS = {
  'a-ana': { nome: 'Ana', email: 'ana@dex.com' }, 'a-bruno': { nome: 'Bruno', email: 'bruno@dex.com' }, 'a-gestora-0000001': { nome: 'Gestora', email: 'gestora@dex.com' },
  'a-chefe': { nome: 'Chefe (gestor por e-mail)', email: 'chefe@dex.com' }, 'a-semcusto': { nome: 'Sem custo', email: 'sc@dex.com' }, 'plan_vaga1': { nome: 'Vaga', email: '' },
};
const CFG = {
  custosPessoa: { 'a-ana': 100, 'a-bruno': 60.5, 'a-gestora-0000001': 180, 'a-chefe': 200, 'a-zero': 0, 'plan_vaga1': 999 },
  pessoasPlanejadas: [{ id: 'plan_vaga1', nome: 'Vaga', custoH: 120 }],
  ctrl: { custoPadrao: 70 },
  gestores: [{ a: 'a-gestora-0000001' }, { email: 'CHEFE@dex.com' }, 'a-fantasma-0000001'],
  perfis: { 'a-ana': { nivel: 'senior' }, 'a-bruno': { nivel: 'pleno' }, 'a-chefe': { nivel: 'estagiario' }, 'a-gestora-0000001': { depto: 'x' } },
  contratos: [
    { id: 'c1', cliente: 'A', tipo: 'ams', valorHora: 250, projetos: ['AMS1'] },
    { id: 'c2', cliente: 'B', tipo: 'ams', valorHora: 0, projetos: ['AMS2'] },                 // sem valorHora → receita 0
    { id: 'c3', cliente: 'C', tipo: 'horas', valorHora: 0, projetos: ['EA1'] },                // dois contratos: o que TEM valorHora vence
    { id: 'c3b', cliente: 'C', tipo: 'horas', valorHora: 310.5, projetos: ['EA1', 'EF1'] },
    { id: 'c4', cliente: 'D', tipo: 'projeto', valorHora: 400, projetos: ['IMI1', 'SCPF', 'SCPD', 'SCNO', 'ARQ1'] },   // receita só entra se for faturável
    null, 'lixo', { id: 'c5', projetos: 'nao-lista', valorHora: 99 },
  ].filter((c) => !c || typeof c !== 'object' || Array.isArray(c.projetos) || c.projetos === undefined),
};
// worklogs: {a, s, d, p, t, f}; segundos fracionados de propósito
const wl = (a, p, d, h, t, f) => ({ a, p, d: `${d}T09:00:00.000-0300`, s: Math.round(h * 3600), t: t || 'Tarefa', f: f === undefined ? 1 : f, k: `${p}-1` });
const TIPO_NF = 'Tarefas ADM - Não Faturavel';
const WORKLOGS_BASE = [
  wl('a-ana', 'AMS1', '2026-09-29', 3.25), wl('a-ana', 'AMS1', '2026-09-30', 2), wl('a-bruno', 'AMS1', '2026-10-01', 1.5, 'Bug'), wl('a-bruno', 'AMS1', '2026-10-02', 2.75, TIPO_NF, 0),
  wl('a-bruno', 'AMS1', '2026-10-02', 1, 'Sub-tarefa', 0),                          // sub-tarefa de ticket não faturável (f:0)
  wl('a-ana', 'AMS2', '2026-10-05', 4), wl('a-gestora-0000001', 'AMS2', '2026-10-06', 1.1),
  wl('a-ana', 'EA1', '2026-09-30', 5.5), wl('a-chefe', 'EA1', '2026-10-01', 2), wl('a-semcusto', 'EA1', '2026-10-02', 3, 'Melhoria'),
  wl('a-bruno', 'EF1', '2026-10-07', 6), wl('a-chefe', 'EF1', '2026-10-08', 0.5), wl('a-gestora-0000001', 'EF1', '2026-10-08', 1.25),
  wl('a-ana', 'EP1', '2026-10-09', 2), wl('plan_vaga1', 'EP1', '2026-10-09', 3),
  wl('a-ana', 'IMI1', '2026-10-01', 4), wl('a-bruno', 'IPA1', '2026-10-02', 2.5), wl('a-semcusto', 'ITP1', '2026-10-03', 1.5, 'Reunião', 0),
  wl('a-ana', 'ARQ1', '2026-10-04', 1),
  wl('a-bruno', 'SCPF', '2026-10-05', 2), wl('a-ana', 'SCPD', '2026-10-05', 2.5), wl('a-ana', 'SCNO', '2026-10-06', 1.75),
  wl('a-zero', 'AMS1', '2026-10-07', 1),                                               // custo 0 → padrão; semCusto
];
const CENARIOS = [
  { id: 'todos', rot: 'todas as categorias, semana cruzando o mês', wl: WORKLOGS_BASE, de: '2026-09-28', ate: '2026-10-31' },
  { id: 'outubro', rot: 'só outubro (corta a semana que cruza)', wl: WORKLOGS_BASE.filter((w) => w.d.slice(0, 7) === '2026-10'), de: '2026-10-01', ate: '2026-10-31' },
  { id: 'setembro', rot: 'só setembro (a outra ponta da semana)', wl: WORKLOGS_BASE.filter((w) => w.d.slice(0, 7) === '2026-09'), de: '2026-09-01', ate: '2026-09-30' },
  { id: 'vazio', rot: 'período sem nenhum apontamento', wl: [], de: '2026-08-01', ate: '2026-08-31' },
  { id: 'so-nao-fat', rot: 'só horas não faturáveis', wl: WORKLOGS_BASE.filter((w) => ['IMI1', 'IPA1', 'ITP1', 'ARQ1', 'SCNO'].includes(w.p)), de: '2026-10-01', ate: '2026-10-31' },
];

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
for (const arq of ['public/js/01-nucleo.js', 'public/js/18-controladoria-relatorios.js']) {
  try { new vm.Script(readFileSync(arq, 'utf8'), { filename: arq }).runInContext(ctx); }
  catch (e) { console.error(`✗ não consegui carregar ${arq} no vm: ${e.message}`); process.exit(1); }
}
const roda = (js) => vm.runInContext(js, ctx);
const web = (obj) => { ctx.__fx = JSON.stringify(obj); return roda('JSON.parse(__fx)'); };
// a MESMA config dos dois lados
roda(`cfg.custosPessoa=${JSON.stringify(CFG.custosPessoa)}; cfg.pessoasPlanejadas=${JSON.stringify(CFG.pessoasPlanejadas)}; cfg.ctrl=${JSON.stringify(CFG.ctrl)}; cfg.gestores=${JSON.stringify(CFG.gestores)}; cfg.perfis=${JSON.stringify(CFG.perfis)}; cfg.contratos=${JSON.stringify(CFG.contratos)};`);

const perto = (a, b, tol = 0.0051) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol;
const cmp = (cen, rot, painel, servidor, tol) => { n += 1; if (!perto(painel, servidor, tol)) erros.push(`${cen} · ${rot}: painel=${painel} servidor=${servidor}`); };
const cmpTxt = (cen, rot, painel, servidor) => { n += 1; if (JSON.stringify(painel) !== JSON.stringify(servidor)) erros.push(`${cen} · ${rot}: painel=${JSON.stringify(painel)} servidor=${JSON.stringify(servidor)}`); };

// O resumo JSON puro de um `d` (do ctDados, do ctAgrega ou do ctDadosDeFotos): horas em h, R$. Definido DENTRO do vm para os três caminhos
// serem lidos pela mesma lente.
roda(`var __resumo=function(d,cat){
  const set=(s)=>[...s].sort();
  const por={}; Object.keys(d.por).forEach(k=>{ const P=d.por[k]; por[k]={seg:P.seg/3600,segFat:P.segFat/3600,custo:P.custo,custoGest:P.custoGest,rec:P.rec,vh:P.temC,tipos:Object.fromEntries(Object.entries(P.tipos).map(([t,s])=>[t,s/3600])),pessoas:set(P.pessoas)}; });
  const pp={}; Object.keys(d.porPessoa).forEach(a=>{ const U=d.porPessoa[a]; pp[a]={seg:U.seg/3600,custo:U.custo,gestor:U.gestor}; });
  const pt=Object.fromEntries(Object.entries(d.porTipo).map(([t,s])=>[t,s/3600]));
  const pm=Object.fromEntries(Object.entries(d.porMes).map(([m,x])=>[m,{seg:x.seg/3600,custo:x.custo,rec:x.rec}]));
  const pc={}; Object.keys(d.porCat).forEach(c=>{ const C=d.porCat[c]; pc[c]={seg:C.seg/3600,segFat:C.segFat/3600,custo:C.custo,rec:C.rec}; });
  return {cats:d.cats,cat:cat,seg:d.segTot/3600,segFat:d.segFat/3600,custo:d.custoTot,custoGest:d.custoGest,rec:d.recTot,temContrato:d.temContrato,por,pp,pt,pm,pc,semCusto:set(d.semCusto)};
};`);

// o /api/tempo de um cenário: só os projetos que TIVERAM apontamento (é de lá que a tela tira as categorias)
const tempoDe = (cen) => { const usados = new Set(cen.wl.map((w) => w.p)); return { worklogs: cen.wl, projetos: Object.fromEntries(Object.entries(PROJETOS).filter(([k]) => usados.has(k))), pessoas: PESSOAS, resumos: {} }; };

// Roda o ctDados() do painel para a categoria `cat` e devolve o resumo.
function painelPorCategoria(cen, cat) {
  const t = tempoDe(cen);
  ctx.__cen = JSON.stringify({ tempo: t, de: cen.de, ate: cen.ate, cat });
  return JSON.parse(roda(`(function(){
    const F=JSON.parse(__cen); const ct=estado.ctrl;
    estado.tempo={projetos:F.tempo.projetos,pessoas:F.tempo.pessoas,worklogs:F.tempo.worklogs};   // o fallback do wFat (fatProj) lê o catálogo daqui
    ct.tempo=F.tempo; ct.de=F.de; ct.ate=F.ate; ct.chaveT=F.de+'|'+F.ate; ct.cat=F.cat; ct.modo='';
    const d=ctDados(); if(!d) return JSON.stringify(null);
    return JSON.stringify(__resumo(d,ct.cat));
  })()`));
}
// O mesmo resumo pelo caminho das fotos: ctDadosDeFotos(fotos mensais, /api/tempo do trecho ao vivo | null).
function fotosPorCategoria(fotos, tempo, cat) {
  ctx.__fotos = JSON.stringify(fotos); ctx.__tempoV = JSON.stringify(tempo);
  return JSON.parse(roda(`(function(){ const ct=estado.ctrl; ct.cat=${JSON.stringify(cat)}; const d=ctDadosDeFotos(JSON.parse(__fotos), JSON.parse(__tempoV)); return JSON.stringify(d?__resumo(d,ct.cat):null); })()`));
}

for (const cen of CENARIOS) {
  const { fin, horas } = kpiFinanceiro(cen.wl, CFG, PROJETOS, { pessoas: PESSOAS });
  const id = cen.id;
  // as categorias que o painel mostra
  let cats = [];
  if (cen.wl.length) {
    const p0 = painelPorCategoria(cen, '');
    if (!p0) { erros.push(`${id}: ctDados() devolveu null (estado do vm incompleto)`); continue; }
    cats = p0.cats;
  }
  cmpTxt(id, 'categorias', cats, Object.keys(fin.porCat).sort((a, b) => a.localeCompare(b, 'pt')));
  const somaPessoa = {}; const somaTipo = {}; const semCusto = new Set(); let tSeg = 0; let tFat = 0; let tCusto = 0; let tRec = 0; let tGest = 0;
  for (const cat of cats) {
    const P = painelPorCategoria(cen, cat); const S = fin.porCat[cat];
    if (!S) { erros.push(`${id} · categoria "${cat}" só existe no painel`); continue; }
    cmp(id, `${cat} · horas`, P.seg, S.h); cmp(id, `${cat} · horas faturáveis`, P.segFat, S.hf);
    cmp(id, `${cat} · custo`, P.custo, S.c); cmp(id, `${cat} · custo de gestão`, P.custoGest, S.cg); cmp(id, `${cat} · receita`, P.rec, S.r);
    cmp(id, `${cat} · (🧭 todas as categorias) horas`, P.pc[cat].seg, S.h); cmp(id, `${cat} · (🧭) receita`, P.pc[cat].rec, S.r);
    tSeg += P.seg; tFat += P.segFat; tCusto += P.custo; tRec += P.rec; tGest += P.custoGest;
    for (const [k, pj] of Object.entries(P.por)) {
      const L = fin.porProj[k]; const H = horas.porProj[k];
      if (!L) { erros.push(`${id} · projeto ${k} só existe no painel`); continue; }
      cmp(id, `${k} · horas`, pj.seg, L.h); cmp(id, `${k} · faturáveis`, pj.segFat, L.hf); cmp(id, `${k} · custo`, pj.custo, L.c);
      cmp(id, `${k} · custo de gestão`, pj.custoGest, L.cg); cmp(id, `${k} · receita`, pj.rec, L.r);
      cmp(id, `${k} · horas.porProj ≡ fin.porProj (h)`, H.h, L.h); cmp(id, `${k} · horas.porProj ≡ fin.porProj (hf)`, H.hf, L.hf);
      cmpTxt(id, `${k} · pessoas`, pj.pessoas, L.pessoas); cmpTxt(id, `${k} · categoria`, cat, L.cat);
      cmpTxt(id, `${k} · tem valor-hora`, pj.vh, L.vh > 0);
      cmpTxt(id, `${k} · tipos`, Object.keys(pj.tipos).sort(), Object.keys(L.tipos).sort());
      for (const [t, h] of Object.entries(pj.tipos)) cmp(id, `${k} · tipo "${t}"`, h, L.tipos[t]);
    }
    for (const [a, u] of Object.entries(P.pp)) { const x = somaPessoa[a] = somaPessoa[a] || { seg: 0, custo: 0, gestor: u.gestor }; x.seg += u.seg; x.custo += u.custo; }
    for (const [t, h] of Object.entries(P.pt)) somaTipo[t] = (somaTipo[t] || 0) + h;
    P.semCusto.forEach((a) => semCusto.add(a));
  }
  cmp(id, 'total · horas', tSeg, horas.real); cmp(id, 'total · faturáveis', tFat, horas.fat); cmp(id, 'total · não faturáveis', tSeg - tFat, horas.naoFat);
  cmp(id, 'total · custo', tCusto, fin.custo); cmp(id, 'total · custo de gestão', tGest, fin.custoGest); cmp(id, 'total · receita', tRec, fin.receita);
  cmpTxt(id, 'pessoas', Object.keys(somaPessoa).sort(), Object.keys(fin.porPessoa).sort());
  for (const [a, u] of Object.entries(somaPessoa)) {
    cmp(id, `pessoa ${a} · horas`, u.seg, fin.porPessoa[a].h); cmp(id, `pessoa ${a} · custo`, u.custo, fin.porPessoa[a].c); cmpTxt(id, `pessoa ${a} · gestor`, u.gestor, fin.porPessoa[a].gestor);
    cmpTxt(id, `pessoa ${a} · nível`, ['senior', 'pleno', 'junior'].includes((CFG.perfis[a] || {}).nivel) ? CFG.perfis[a].nivel : '', fin.porPessoa[a].nivel);
  }
  cmpTxt(id, 'tipos de esforço', Object.keys(somaTipo).sort(), Object.keys(horas.porTipo).sort());
  for (const [t, h] of Object.entries(somaTipo)) cmp(id, `tipo "${t}"`, h, horas.porTipo[t]);
  cmpTxt(id, 'quem apontou sem custo próprio (semCusto)', [...semCusto].sort(), fin.semCusto);
  // invariantes do formato
  cmp(id, 'invariante · horas.real = Σ fin.porCat.h', Object.values(fin.porCat).reduce((s, c) => s + c.h, 0), horas.real, 0.011);
  cmp(id, 'invariante · fat + naoFat = real', horas.fat + horas.naoFat, horas.real, 0.011);
  cmp(id, 'invariante · receita = Σ porProj.r', Object.values(fin.porProj).reduce((s, c) => s + c.r, 0), fin.receita, 0.011);
  cmp(id, 'invariante · custo = Σ porPessoa.c', Object.values(fin.porPessoa).reduce((s, c) => s + c.c, 0), fin.custo, 0.011);
  cmp(id, 'invariante · Σ horas.porNivel = real', Object.values(horas.porNivel).reduce((s, h) => s + h, 0), horas.real, 0.011);
}

// ---- a regra do faturável, caso a caso (kpiFaturavel ≡ wFat) ----
const CASOS_FAT = [
  [{ f: 1 }, 'Dexterity - AMS', '', true], [{ f: 1 }, 'DAMS', '', true], [{ f: 0 }, 'Dexterity - AMS', '', false], [{ f: 1 }, 'Interno - Melhorias Internas', '', false],
  [{ f: 1 }, 'Arquivado', '', false], [{ f: 1 }, 'Sem categoria', 'IMI | x', false], [{ f: 1 }, 'Sem categoria', 'PEF | x', true], [{ f: 1 }, 'Sem categoria', 'sem prefixo', false],
  [{ f: 1 }, '', 'DEA | y', true], [{ f: 1 }, null, null, false], [null, 'DEA', '', false], [{ f: 1 }, 'Categoria desconhecida', 'DEF | z', true],
];
for (const [w, cat, nome, esp] of CASOS_FAT) { n += 1; if (kpiFaturavel(w, cat, nome) !== esp) erros.push(`kpiFaturavel(${JSON.stringify(w)}, ${JSON.stringify(cat)}, ${JSON.stringify(nome)}) deu ${!esp}, esperava ${esp}`); }
{
  // o painel diz o mesmo, caso a caso
  ctx.__casos = JSON.stringify(CASOS_FAT.filter(([w]) => w));
  const painel = JSON.parse(roda(`(function(){ estado.tempo={projetos:{}}; return JSON.stringify(JSON.parse(__casos).map(([w,cat,nome])=>{ estado.tempo={projetos:{XP:{nome:nome,categoria:cat||'Sem categoria'}}}; _fatMemo=null; return wFat(Object.assign({p:'XP'},w),(cat===null||cat==='')?undefined:cat); })); })()`));
  CASOS_FAT.filter(([w]) => w).forEach(([w, cat, nome, esp], i) => { n += 1; if (painel[i] !== esp) erros.push(`wFat(${JSON.stringify(w)}, ${JSON.stringify(cat)}) do painel deu ${painel[i]} para o projeto "${nome}", esperava ${esp}`); });
}
n += 1; if (kpiNivelDe(CFG, 'a-chefe') !== '' || kpiNivelDe(CFG, 'a-ana') !== 'senior' || kpiNivelDe({}, 'x') !== '') erros.push('kpiNivelDe: nível desconhecido tem de virar "" e o conhecido passar');

// ---- a semana que cruza o mês: Σ dos meses = a semana ----
{
  const fotoEm = '2026-11-07T10:00:00-03:00';
  const wlSem = WORKLOGS_BASE.filter((w) => w.d.slice(0, 10) >= '2026-09-28' && w.d.slice(0, 10) <= '2026-10-04');
  const base = { cfg: CFG, fotoEm, pessoas: PESSOAS, projMeta: PROJETOS, usuarios: PESSOAS, planos: [], itens: [] };
  const sem = calculaKpiSemana({ ...base, chave: '2026-09-28', worklogs: wlSem, abertos: [], criados: [], concluidos: [], catalogo: [], semaforos: {} });
  const set = calculaKpiMes({ ...base, chave: '2026-09', worklogs: wlSem.filter((w) => w.d.slice(0, 7) === '2026-09') });
  const out = calculaKpiMes({ ...base, chave: '2026-10', worklogs: wlSem.filter((w) => w.d.slice(0, 7) === '2026-10') });
  cmp('cruza-mes', 'horas.real: setembro + outubro = a semana', set.horas.real + out.horas.real, sem.horas.real, 0.011);
  cmp('cruza-mes', 'receita: setembro + outubro = a semana', set.fin.receita + out.fin.receita, sem.fin.receita, 0.011);
  cmp('cruza-mes', 'custo: setembro + outubro = a semana', set.fin.custo + out.fin.custo, sem.fin.custo, 0.011);
  cmpTxt('cruza-mes', 'a semana é de 28/09 a 04/10 (seg→dom)', [sem.de, sem.ate, set.de, set.ate, out.de, out.ate], ['2026-09-28', '2026-10-04', '2026-09-01', '2026-09-30', '2026-10-01', '2026-10-31']);
  cmpTxt('cruza-mes', 'foto de período fechado não é parcial', [sem.parcial, set.parcial, out.parcial], [false, false, false]);
  cmpTxt('cruza-mes', 'a foto mensal não tem saude nem time', ['saude' in out, 'time' in out], [false, false]);
}

// ---- ctDadosDeFotos (a 🏦 Controladoria rápida): preparado, nunca falso-verde ----
let pulados = 0;
if (roda("typeof ctDadosDeFotos") !== 'function') {
  pulados += 1;
  console.log('⏭ pulado: ctDadosDeFotos não existe no 18-controladoria-relatorios.js — quando existir, este gate passa a conferi-la (fotos × ctDados, misto e só-ao-vivo).');
} else {
  const fotoEm = '2026-11-07T10:00:00-03:00';
  const fotoMes = (ym, extra) => ({ ...calculaKpiMes({ cfg: CFG, fotoEm, chave: ym, worklogs: WORKLOGS_BASE.filter((w) => w.d.slice(0, 7) === ym), pessoas: PESSOAS, projMeta: PROJETOS }), ...(extra || {}) });
  const WL_SET = WORKLOGS_BASE.filter((w) => w.d.slice(0, 7) === '2026-09'); const WL_OUT = WORKLOGS_BASE.filter((w) => w.d.slice(0, 7) === '2026-10');
  const cenMeses = { id: 'set+out', wl: [...WL_SET, ...WL_OUT], de: '2026-09-01', ate: '2026-10-31' };
  const cenOut = { id: 'out', wl: WL_OUT, de: '2026-10-01', ate: '2026-10-31' };
  // compara dois resumos (P = painel/ctDados/ctAgrega, R = o caminho das fotos); `porPessoa` fica de fora de propósito (pessoaGeral)
  const cmpResumo = (id, P, R) => {
    cmpTxt(id, `${P.cat} · categorias`, R.cats, P.cats);
    cmp(id, `${P.cat} · horas`, P.seg, R.seg); cmp(id, `${P.cat} · faturáveis`, P.segFat, R.segFat); cmp(id, `${P.cat} · custo`, P.custo, R.custo);
    cmp(id, `${P.cat} · custo de gestão`, P.custoGest, R.custoGest); cmp(id, `${P.cat} · receita`, P.rec, R.rec, 0.011);
    cmpTxt(id, `${P.cat} · temContrato`, R.temContrato, P.temContrato); cmpTxt(id, `${P.cat} · semCusto`, R.semCusto, P.semCusto);
    cmpTxt(id, `${P.cat} · projetos`, Object.keys(R.por).sort(), Object.keys(P.por).sort());
    for (const [k, pj] of Object.entries(P.por)) {
      const q = R.por[k]; if (!q) continue;
      cmp(id, `${k} · horas`, pj.seg, q.seg); cmp(id, `${k} · faturáveis`, pj.segFat, q.segFat); cmp(id, `${k} · custo`, pj.custo, q.custo);
      cmp(id, `${k} · custo de gestão`, pj.custoGest, q.custoGest); cmp(id, `${k} · receita`, pj.rec, q.rec, 0.011);
      cmpTxt(id, `${k} · tem valor-hora`, q.vh, pj.vh); cmpTxt(id, `${k} · pessoas`, q.pessoas, pj.pessoas);
      cmpTxt(id, `${k} · tipos`, Object.keys(q.tipos).sort(), Object.keys(pj.tipos).sort());
      for (const [t, h] of Object.entries(pj.tipos)) cmp(id, `${k} · tipo "${t}"`, h, q.tipos[t]);
    }
    cmpTxt(id, `${P.cat} · tipos (porTipo)`, Object.keys(R.pt).sort(), Object.keys(P.pt).sort());
    for (const [t, h] of Object.entries(P.pt)) cmp(id, `${P.cat} · porTipo "${t}"`, h, R.pt[t]);
    cmpTxt(id, `${P.cat} · meses (porMes)`, Object.keys(R.pm).sort(), Object.keys(P.pm).sort());
    for (const [m, x] of Object.entries(P.pm)) { const y = R.pm[m] || {}; cmp(id, `${P.cat} · porMes ${m} horas`, x.seg, y.seg); cmp(id, `${P.cat} · porMes ${m} custo`, x.custo, y.custo); cmp(id, `${P.cat} · porMes ${m} receita`, x.rec, y.rec, 0.011); }
  };
  const catsDe = (cen) => (cen.wl.length ? painelPorCategoria(cen, '').cats : []);

  // (1) só fotos: setembro + outubro fotografados × ctDados() dos dois meses (como era, agora com todos os campos)
  for (const cat of catsDe(cenMeses)) {
    const P = painelPorCategoria(cenMeses, cat); let R = null;
    try { R = fotosPorCategoria([fotoMes('2026-09'), fotoMes('2026-10')], null, cat); } catch (e) { erros.push(`ctDadosDeFotos quebrou na categoria "${cat}": ${e.message}`); continue; }
    if (!R) { erros.push(`ctDadosDeFotos devolveu null na categoria "${cat}"`); continue; }
    cmpResumo('fotos', P, R);
  }
  // (2) MISTO — o "por ano" de verdade: setembro vem da foto, outubro (o mês corrente) do /api/tempo ao vivo. A fixture ao vivo tem a-zero e
  //     a-semcusto (custo padrão + semCusto), a-chefe (gestor por e-mail), a sub-tarefa f:0 do AMS1 e o tipo não faturável — o que as mutações do custo
  //     padrão, do faturável e do gestor derrubam.
  const vivo = tempoDe(cenOut);
  for (const cat of catsDe(cenMeses)) {
    const P = painelPorCategoria(cenMeses, cat); let R = null;
    try { R = fotosPorCategoria([fotoMes('2026-09')], vivo, cat); } catch (e) { erros.push(`misto: ctDadosDeFotos quebrou na categoria "${cat}": ${e.message}`); continue; }
    if (!R) { erros.push(`misto: ctDadosDeFotos devolveu null na categoria "${cat}"`); continue; }
    cmpResumo('misto', P, R);
  }
  // (3) só ao vivo: ctDadosDeFotos([], tempo) ≡ ctAgrega(tempo) — prova a ctFotosDeTempo sozinha (a 3ª cópia da regra no navegador)
  for (const cat of catsDe(cenOut)) {
    const P = painelPorCategoria(cenOut, cat); let R = null;
    try { R = fotosPorCategoria([], vivo, cat); } catch (e) { erros.push(`só-ao-vivo: ctDadosDeFotos quebrou na categoria "${cat}": ${e.message}`); continue; }
    if (!R) { erros.push(`só-ao-vivo: ctDadosDeFotos devolveu null na categoria "${cat}"`); continue; }
    cmpResumo('so-ao-vivo', P, R);
  }
  // (4) o aviso de foto truncada (revisão de 2026-11-07): vem das fotos fechadas, nunca do trecho ao vivo
  {
    const cat = catsDe(cenMeses)[0];
    ctx.__fotos = JSON.stringify([fotoMes('2026-09', { truncado: { worklogs: true, abertos: false, tickets: false } }), fotoMes('2026-10')]); ctx.__tempoV = JSON.stringify(vivo);
    const R = JSON.parse(roda(`(function(){ const ct=estado.ctrl; ct.cat=${JSON.stringify(cat)}; const d=ctDadosDeFotos(JSON.parse(__fotos), JSON.parse(__tempoV)); return JSON.stringify({t:d.truncados,n:d.nFotos}); })()`));
    cmpTxt('truncado', 'só a foto fechada truncada é apontada', R.t, ['2026-09']);
    cmpTxt('truncado', 'nFotos conta só as fotos (não o trecho ao vivo)', R.n, 2);
  }
}

if (erros.length) {
  console.error('✗ KPIs: servidor e Controladoria divergem — api/_lib/kpi.js precisa acompanhar o 18-controladoria-relatorios.js (ctDados) e o 01-nucleo.js (wFat):');
  erros.forEach((e) => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log(`✓ Paridade dos KPIs OK (${CENARIOS.length} cenários + ${CASOS_FAT.length} casos de faturável + a semana que cruza o mês, ${n} comparações — servidor = Controladoria${pulados ? `; ${pulados} parte(s) pulada(s): ctDadosDeFotos` : ''}).`);
