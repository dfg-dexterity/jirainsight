#!/usr/bin/env node
// Gate de PARIDADE do cronograma (roda em `npm run check` e na CI).
//
// O 🌐 portal do projeto mostra ao cliente o MESMO semáforo que o time vê no 📅 Cronograma:
// status derivado por épico (concluído · atrasado · em risco · em andamento · não iniciado),
// previsão pelo ritmo, atraso em dias e o próximo marco. A fórmula nasceu no navegador
// (crLinhas em public/js/02b-cronograma.js e projMarcos em public/js/02-projetos.js) e foi
// portada para o servidor (api/_lib/cronograma.js). Sem build, um lado não importa do outro —
// então este script carrega as funções do FRONT num `vm` (com stubs mínimos: hojeSP/projHoje
// fixos, fmtHd) e compara com o `_lib` sobre fixtures que cobrem cada ramo da regra. Quem
// mudar a regra de um lado sem o outro é reprovado aqui, não descoberto pelo cliente.
//
// Também confere a expressão "aguardando cliente": GX_RE_AGUARDA_CLIENTE (20-gestao.js) e
// RE_AGUARDA_CLIENTE (api/_lib/portal.js) precisam ser idênticas — é ela que decide o que
// vira "pendência do cliente" no portal e o preset "Aguardando cliente" da 🧰 Gestão.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as acorn from 'acorn';

const erros = [];
const HOJE = '2026-09-28';                       // fixo: a comparação precisa ser determinística
const dia = (n) => { const d = new Date(`${HOJE}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mes = (n) => dia(n).slice(0, 7);

// Extrai do fonte do front só as declarações pedidas (função ou const), pelo parser — sem
// executar o resto do arquivo (listeners de DOM, fetch no carregamento).
function extrai(arquivo, nomes) {
  const src = readFileSync(arquivo, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  const partes = []; const achados = new Set();
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration' && nomes.includes(st.id.name)) { partes.push(src.slice(st.start, st.end)); achados.add(st.id.name); }
    if (st.type === 'VariableDeclaration') {
      for (const d of st.declarations) {
        if (d.id.type === 'Identifier' && nomes.includes(d.id.name)) { partes.push(`${st.kind} ${src.slice(d.start, d.end)};`); achados.add(d.id.name); }
      }
    }
  }
  const faltam = nomes.filter((n) => !achados.has(n));
  if (faltam.length) erros.push(`${arquivo}: não encontrei ${faltam.join(', ')} — a função mudou de nome? O servidor (api/_lib) depende dela.`);
  return partes.join('\n');
}

// ---- fixtures: épicos como agregaProjeto os entrega (um por ramo da regra) ----
const FIX = [
  // sem data limite (e sem vencimento nos filhos): em andamento, previsão pelo ritmo
  { k: 'P-1', resumo: '1. Sem fim', sc: 'indeterminate', ini: dia(-27), fim: '', criado: dia(-30), resolvido: '', vencFilhos: '', iniItens: dia(-25), fimItens: dia(-3),
    nFilhos: 4, nConcluidos: 1, emAnd: 1, filhosAbertos: 3, filhosVenc: 0, filhosDepois: 0, estH: 10, gastoH: 4, porMes: { [mes(-30)]: { c: 4, d: 1 } }, links: [] },
  // com filhos vencidos: em risco mesmo com marco longe
  { k: 'P-2', resumo: '2. Filhos vencidos', sc: 'indeterminate', ini: dia(-58), fim: dia(63), criado: dia(-60), resolvido: '', vencFilhos: dia(63), iniItens: dia(-55), fimItens: dia(-10),
    nFilhos: 5, nConcluidos: 2, emAnd: 1, filhosAbertos: 3, filhosVenc: 2, filhosDepois: 0, estH: 20, gastoH: 9, porMes: { [mes(-60)]: { c: 5, d: 0 }, [mes(-10)]: { c: 0, d: 2 } }, links: [] },
  // marco em 10 dias com 50%: em risco
  { k: 'P-3', resumo: '3. Marco perto', sc: 'indeterminate', ini: dia(-20), fim: dia(10), criado: dia(-22), resolvido: '', vencFilhos: dia(10), iniItens: dia(-19), fimItens: dia(-2),
    nFilhos: 4, nConcluidos: 2, emAnd: 2, filhosAbertos: 2, filhosVenc: 0, filhosDepois: 0, estH: 8, gastoH: 5, porMes: { [mes(-20)]: { c: 4, d: 2 } }, links: [] },
  // tudo concluído (5 dias depois do marco): concluído com atraso de entrega
  { k: 'P-4', resumo: '4. Concluído', sc: 'done', ini: dia(-90), fim: dia(-23), criado: dia(-92), resolvido: dia(-18), vencFilhos: dia(-23), iniItens: dia(-88), fimItens: dia(-19),
    nFilhos: 3, nConcluidos: 3, emAnd: 0, filhosAbertos: 0, filhosVenc: 0, filhosDepois: 0, estH: 12, gastoH: 11, porMes: { [mes(-90)]: { c: 3, d: 0 }, [mes(-18)]: { c: 0, d: 3 } }, links: [] },
  // cancelado: nem status derivado, nem previsão
  { k: 'P-5', resumo: '5. Cancelado', sc: 'cancel', ini: dia(-40), fim: dia(20), criado: dia(-41), resolvido: '', vencFilhos: '', iniItens: '', fimItens: '',
    nFilhos: 2, nConcluidos: 0, emAnd: 0, filhosAbertos: 0, filhosVenc: 0, filhosDepois: 0, estH: 0, gastoH: 0, porMes: {}, links: [] },
  // marco passou e continua aberto: atrasado (13 dias)
  { k: 'P-6', resumo: '6. Atrasado', sc: 'indeterminate', ini: dia(-50), fim: dia(-13), criado: dia(-52), resolvido: '', vencFilhos: dia(-13), iniItens: dia(-49), fimItens: dia(-20),
    nFilhos: 6, nConcluidos: 4, emAnd: 1, filhosAbertos: 2, filhosVenc: 1, filhosDepois: 0, estH: 30, gastoH: 33, porMes: { [mes(-50)]: { c: 6, d: 1 }, [mes(-20)]: { c: 0, d: 3 } }, links: [] },
  // sem data limite própria, mas com vencimento nos filhos: fim derivado; nada começou
  { k: 'P-7', resumo: '7. Fim derivado', sc: 'new', ini: '', fim: '', criado: dia(-5), resolvido: '', vencFilhos: dia(22), iniItens: dia(-5), fimItens: '',
    nFilhos: 2, nConcluidos: 0, emAnd: 0, filhosAbertos: 2, filhosVenc: 0, filhosDepois: 0, estH: 6, gastoH: 0, porMes: { [mes(-5)]: { c: 2, d: 0 } }, links: [] },
  // marco longe, mas o ritmo diz que não chega: em risco só pela previsão
  { k: 'P-8', resumo: '8. Ritmo lento', sc: 'indeterminate', ini: dia(-30), fim: dia(63), criado: dia(-31), resolvido: '', vencFilhos: dia(60), iniItens: dia(-29), fimItens: dia(-1),
    nFilhos: 10, nConcluidos: 2, emAnd: 1, filhosAbertos: 8, filhosVenc: 0, filhosDepois: 0, estH: 50, gastoH: 12, porMes: { [mes(-30)]: { c: 10, d: 1 }, [mes(0)]: { c: 0, d: 1 } }, links: [] },
  // épico sem filhos já concluído: 100%
  { k: 'P-9', resumo: '9. Sem filhos, feito', sc: 'done', ini: dia(-15), fim: dia(-8), criado: dia(-16), resolvido: dia(-9), vencFilhos: '', iniItens: '', fimItens: '',
    nFilhos: 0, nConcluidos: 0, emAnd: 0, filhosAbertos: 0, filhosVenc: 0, filhosDepois: 0, estH: 0, gastoH: 0, porMes: {}, links: [] },
  // épico sem filhos com horas apontadas: em andamento (marco a 30 dias, sem risco)
  { k: 'P-10', resumo: '10. Só horas', sc: 'new', ini: dia(-3), fim: dia(30), criado: dia(-4), resolvido: '', vencFilhos: '', iniItens: '', fimItens: '',
    nFilhos: 0, nConcluidos: 0, emAnd: 0, filhosAbertos: 0, filhosVenc: 0, filhosDepois: 0, estH: 4, gastoH: 2, porMes: {}, links: [] },
];

// ---- front, num vm ----
const codigo = [
  extrai('public/js/02b-cronograma.js', ['crDias', 'crAddDias', 'crPrefixo', 'crCmpNums', 'crLinhas', 'crOrdena']),
  extrai('public/js/02-projetos.js', ['projMarcos']),
  extrai('public/js/20-gestao.js', ['GX_RE_AGUARDA_CLIENTE']),
].join('\n');
// O vm recebe as MESMAS fixtures (copiadas: o front devolve {...e} e não deve mexer nelas).
const ctx = vm.createContext({ hojeSP: () => HOJE, projHoje: () => HOJE, fmtHd: (h) => String(h), estado: {}, console, FIX: JSON.parse(JSON.stringify(FIX)) });
let front = null;
try {
  vm.runInContext(`${codigo}\nvar __saida={ linhas: crLinhas({ epicos: FIX }), ordem: crOrdena(crLinhas({ epicos: FIX }), '').map(r=>r.k), marcos: projMarcos({ epicos: FIX }), re: GX_RE_AGUARDA_CLIENTE };`, ctx, { filename: 'front-cronograma.js' });
  front = ctx.__saida;
} catch (e) { erros.push(`não consegui executar as funções do front no vm: ${e.message}`); }

// ---- servidor ----
let srv = null;
try {
  const cr = await import(pathToFileURL('api/_lib/cronograma.js').href);
  const pt = await import(pathToFileURL('api/_lib/portal.js').href);
  srv = { linhas: cr.crLinhas(FIX, HOJE), marcos: cr.projMarcos(FIX, HOJE), cliente: cr.cronogramaDoProjeto(FIX, HOJE), re: pt.RE_AGUARDA_CLIENTE };
} catch (e) { erros.push(`não consegui importar api/_lib: ${e.message}`); }

// ---- comparação ----
const CAMPOS = ['iniPlan', 'fimPlan', 'fimRef', 'fimDerivado', 'iniReal', 'fimReal', 'done', 'cancel', 'previsao', 'ritmo', 'restantes', 'pct', 'diasAte', 'st', 'atraso'];
if (front && srv) {
  FIX.forEach((e, i) => {
    const f = front.linhas[i]; const s = srv.linhas[i];
    if (!f || !s || f.k !== e.k || s.k !== e.k) { erros.push(`${e.k}: linha ausente de um dos lados`); return; }
    CAMPOS.forEach((c) => {
      if (JSON.stringify(f[c]) !== JSON.stringify(s[c])) erros.push(`${e.k} (${e.resumo}) · ${c}: front=${JSON.stringify(f[c])} servidor=${JSON.stringify(s[c])}`);
    });
  });
  if (JSON.stringify(front.marcos) !== JSON.stringify(srv.marcos)) erros.push(`projMarcos: front=${JSON.stringify(front.marcos)} servidor=${JSON.stringify(srv.marcos)}`);
  // Ordem em cascata: o cliente recebe os épicos na sequência do Cronograma (crOrdena padrão), sem o cancelado.
  const ordemSrv = srv.cliente.epicos.map((e) => e.k); const ordemFront = front.ordem.filter((k) => k !== 'P-5');
  if (JSON.stringify(ordemSrv) !== JSON.stringify(ordemFront)) erros.push(`ordem em cascata: front=${ordemFront.join(',')} servidor=${ordemSrv.join(',')}`);
  if (front.re.source !== srv.re.source || front.re.flags !== srv.re.flags) {
    erros.push(`"aguardando cliente": GX_RE_AGUARDA_CLIENTE (20-gestao.js) = /${front.re.source}/${front.re.flags} ≠ RE_AGUARDA_CLIENTE (api/_lib/portal.js) = /${srv.re.source}/${srv.re.flags}`);
  }
  // Os ramos que as fixtures existem para cobrir — se a regra mudar e uma fixture deixar de
  // exercitar o ramo, este bloco avisa em vez de a paridade passar "no vazio".
  const esperado = { 'P-1': 'andamento', 'P-2': 'risco', 'P-3': 'risco', 'P-4': 'concluido', 'P-5': 'cancelado', 'P-6': 'atrasado', 'P-7': 'nao_iniciado', 'P-8': 'risco', 'P-9': 'concluido', 'P-10': 'andamento' };
  srv.linhas.forEach((s) => { if (esperado[s.k] && s.st !== esperado[s.k]) erros.push(`${s.k}: a fixture deveria cair em "${esperado[s.k]}", caiu em "${s.st}" — ajuste a fixture ou reveja a regra dos dois lados`); });
  const p1 = srv.linhas.find((s) => s.k === 'P-1'); const p4 = srv.linhas.find((s) => s.k === 'P-4'); const p6 = srv.linhas.find((s) => s.k === 'P-6'); const p7 = srv.linhas.find((s) => s.k === 'P-7');
  if (!(p1 && p1.previsao)) erros.push('P-1: a previsão pelo ritmo deveria existir');
  if (!(p4 && p4.atraso === 5)) erros.push(`P-4: atraso de entrega deveria ser 5 dias (fimReal − fimPlan), veio ${p4 && p4.atraso}`);
  if (!(p6 && p6.atraso === 13)) erros.push(`P-6: atraso deveria ser 13 dias, veio ${p6 && p6.atraso}`);
  if (!(p7 && p7.fimDerivado && p7.fimRef === dia(22))) erros.push('P-7: o fim deveria vir do maior vencimento dos filhos');
  // O que o cliente recebe: cancelado fora, status traduzido, KPIs coerentes com as linhas.
  const c = srv.cliente;
  if (c.epicos.some((e) => e.k === 'P-5')) erros.push('cronogramaDoProjeto: o épico cancelado não pode chegar ao cliente');
  if (c.epicos.find((e) => e.k === 'P-7').status !== 'planejado') erros.push('cronogramaDoProjeto: nao_iniciado deveria virar "planejado" para o cliente');
  if (c.resumo.semaforo !== 'atrasado') erros.push(`cronogramaDoProjeto: com um épico atrasado o semáforo é "atrasado", veio "${c.resumo.semaforo}"`);
  if (c.resumo.maiorAtrasoDias !== 13) erros.push(`cronogramaDoProjeto: maior atraso deveria ser 13, veio ${c.resumo.maiorAtrasoDias}`);
  if (!(c.resumo.marcos.proximo && c.resumo.marcos.proximo.data === srv.marcos.prox)) erros.push('cronogramaDoProjeto: o próximo marco deveria ser o de projMarcos');
  const tot = FIX.filter((e) => e.sc !== 'cancel').reduce((s, e) => s + e.nFilhos, 0); const conc = FIX.filter((e) => e.sc !== 'cancel').reduce((s, e) => s + e.nConcluidos, 0);
  if (c.resumo.itens.total !== tot || c.resumo.itens.concluidos !== conc || c.resumo.pct !== Math.round(conc / tot * 100)) erros.push(`cronogramaDoProjeto: progresso em itens deveria ser ${conc}/${tot}, veio ${JSON.stringify(c.resumo.itens)} (${c.resumo.pct}%)`);
}

if (erros.length) {
  console.error('✗ Paridade do cronograma (front × servidor):');
  erros.forEach((e) => console.error('  ✗', e));
  process.exit(1);
}
console.log(`✓ Paridade do cronograma OK (${FIX.length} fixtures · ${CAMPOS.length} campos por épico · próximo marco · "aguardando cliente").`);
