#!/usr/bin/env node
// Gate de PARIDADE do cronograma (roda em `npm run check` e na CI).
//
// O 🌐 portal do projeto mostra ao cliente o MESMO semáforo que o time vê no 📅 Cronograma:
// status derivado por épico (concluído · atrasado · em risco · em andamento · não iniciado),
// previsão pelo ritmo, atraso em dias e o próximo marco. A fórmula nasceu no navegador
// (crLinhas em public/js/02b-cronograma.js e projMarcos em public/js/02-projetos.js) e foi
// portada para o servidor (api/_lib/cronograma.js). Sem build, um lado não importa do outro —
// então este script carrega as funções do FRONT num `vm` (com stubs mínimos: hojeSP/projHoje
// fixos, fmtHd) e compara com o `_lib` sobre TRÊS conjuntos de épicos:
//   1. fixtures nomeadas, uma por ramo da regra (com o status esperado de cada uma);
//   2. fixtures de FRONTEIRA — cada limiar da regra dos dois lados (marco a 0/14/15 dias, 69/70 %,
//      marco hoje / ontem, itens vencidos sem ritmo, corte das 8 semanas, 1 item restante);
//   3. ~300 épicos gerados por um PRNG SEMEADO (determinístico) com datas em hoje±120, contagens,
//      histórico mensal e vencimentos aleatórios — é o que faz uma mudança de regra em um só lado
//      (um `<=` que vira `<`, um ramo removido) ser reprovada aqui, não descoberta pelo cliente.
//
// Também confere a expressão "aguardando cliente": RE_AGUARDA_CLIENTE (api/_lib/portal.js) decide
// o que vira "pendência do cliente" no portal e é ESTRITA (precisa citar cliente/customer);
// GX_RE_AGUARDA_CLIENTE (20-gestao.js) é o preset largo da 🧰 Gestão. A regra é: o portal é um
// SUBCONJUNTO da Gestão (tudo o que o portal cobra do cliente aparece no preset do time), e o
// portal ACEITA/RECUSA a lista de status abaixo — "Aguardando deploy" nunca pode virar cobrança.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as acorn from 'acorn';

const erros = [];
const HOJE = '2026-09-28';                       // fixo: a comparação precisa ser determinística
const dia = (n) => { const d = new Date(`${HOJE}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mes = (n) => dia(n).slice(0, 7);
const mesAntes = (ym, k) => { const d = new Date(`${ym}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - k); return d.toISOString().slice(0, 7); };

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

// Um épico como agregaProjeto o entrega (todos os campos que crLinhas lê), com o que não foi dito zerado.
const EP = (o) => ({ k: '', resumo: '', sc: 'new', ini: '', fim: '', criado: dia(-30), resolvido: '', vencFilhos: '', iniItens: '', fimItens: '',
  nFilhos: 0, nConcluidos: 0, emAnd: 0, filhosAbertos: 0, filhosVenc: 0, filhosDepois: 0, estH: 0, gastoH: 0, porMes: {}, links: [], ...o });

// ---- 1. fixtures nomeadas: um épico por ramo da regra ----
const FIX = [
  // sem data limite (e sem vencimento nos filhos): em andamento, previsão pelo ritmo
  EP({ k: 'P-1', resumo: '1. Sem fim', sc: 'indeterminate', ini: dia(-27), iniItens: dia(-25), fimItens: dia(-3), nFilhos: 4, nConcluidos: 1, emAnd: 1, filhosAbertos: 3, estH: 10, gastoH: 4, porMes: { [mes(-30)]: { c: 4, d: 1 } } }),
  // com filhos vencidos: em risco mesmo com marco longe
  EP({ k: 'P-2', resumo: '2. Filhos vencidos', sc: 'indeterminate', ini: dia(-58), fim: dia(63), criado: dia(-60), vencFilhos: dia(63), iniItens: dia(-55), fimItens: dia(-10), nFilhos: 5, nConcluidos: 2, emAnd: 1, filhosAbertos: 3, filhosVenc: 2, estH: 20, gastoH: 9, porMes: { [mes(-60)]: { c: 5, d: 0 }, [mes(-10)]: { c: 0, d: 2 } } }),
  // marco em 10 dias com 50%: em risco
  EP({ k: 'P-3', resumo: '3. Marco perto', sc: 'indeterminate', ini: dia(-20), fim: dia(10), criado: dia(-22), vencFilhos: dia(10), iniItens: dia(-19), fimItens: dia(-2), nFilhos: 4, nConcluidos: 2, emAnd: 2, filhosAbertos: 2, estH: 8, gastoH: 5, porMes: { [mes(-20)]: { c: 4, d: 2 } } }),
  // tudo concluído (5 dias depois do marco): concluído com atraso de entrega
  EP({ k: 'P-4', resumo: '4. Concluído', sc: 'done', ini: dia(-90), fim: dia(-23), criado: dia(-92), resolvido: dia(-18), vencFilhos: dia(-23), iniItens: dia(-88), fimItens: dia(-19), nFilhos: 3, nConcluidos: 3, estH: 12, gastoH: 11, porMes: { [mes(-90)]: { c: 3, d: 0 }, [mes(-18)]: { c: 0, d: 3 } } }),
  // cancelado: nem status derivado, nem previsão
  EP({ k: 'P-5', resumo: '5. Cancelado', sc: 'cancel', ini: dia(-40), fim: dia(20), criado: dia(-41), nFilhos: 2 }),
  // marco passou e continua aberto: atrasado (13 dias)
  EP({ k: 'P-6', resumo: '6. Atrasado', sc: 'indeterminate', ini: dia(-50), fim: dia(-13), criado: dia(-52), vencFilhos: dia(-13), iniItens: dia(-49), fimItens: dia(-20), nFilhos: 6, nConcluidos: 4, emAnd: 1, filhosAbertos: 2, filhosVenc: 1, estH: 30, gastoH: 33, porMes: { [mes(-50)]: { c: 6, d: 1 }, [mes(-20)]: { c: 0, d: 3 } } }),
  // sem data limite própria, mas com vencimento nos filhos: fim derivado; nada começou
  EP({ k: 'P-7', resumo: '7. Fim derivado', criado: dia(-5), vencFilhos: dia(22), iniItens: dia(-5), nFilhos: 2, filhosAbertos: 2, estH: 6, porMes: { [mes(-5)]: { c: 2, d: 0 } } }),
  // marco longe, mas o ritmo diz que não chega: em risco só pela previsão
  EP({ k: 'P-8', resumo: '8. Ritmo lento', sc: 'indeterminate', ini: dia(-30), fim: dia(63), criado: dia(-31), vencFilhos: dia(60), iniItens: dia(-29), fimItens: dia(-1), nFilhos: 10, nConcluidos: 2, emAnd: 1, filhosAbertos: 8, estH: 50, gastoH: 12, porMes: { [mes(-30)]: { c: 10, d: 1 }, [mes(0)]: { c: 0, d: 1 } } }),
  // épico sem filhos já concluído: 100%
  EP({ k: 'P-9', resumo: '9. Sem filhos, feito', sc: 'done', ini: dia(-15), fim: dia(-8), criado: dia(-16), resolvido: dia(-9) }),
  // épico sem filhos com horas apontadas: em andamento (marco a 30 dias, sem risco)
  EP({ k: 'P-10', resumo: '10. Só horas', ini: dia(-3), fim: dia(30), criado: dia(-4), estH: 4, gastoH: 2 }),
];
const ESPERADO = { 'P-1': 'andamento', 'P-2': 'risco', 'P-3': 'risco', 'P-4': 'concluido', 'P-5': 'cancelado', 'P-6': 'atrasado', 'P-7': 'nao_iniciado', 'P-8': 'risco', 'P-9': 'concluido', 'P-10': 'andamento' };

// ---- 2. fixtures de FRONTEIRA: cada limiar dos dois lados (sem ritmo, para isolar o limiar testado) ----
const FRONT = [
  // marco a 0 / 14 / 15 dias com 50 %: risco · risco · andamento (diasAte <= 14)
  EP({ k: 'F-1', resumo: 'Marco hoje 50%', sc: 'indeterminate', ini: dia(-20), fim: dia(0), nFilhos: 4, nConcluidos: 2, emAnd: 1 }),
  EP({ k: 'F-2', resumo: 'Marco em 14 dias 50%', sc: 'indeterminate', ini: dia(-20), fim: dia(14), nFilhos: 4, nConcluidos: 2, emAnd: 1 }),
  EP({ k: 'F-3', resumo: 'Marco em 15 dias 50%', sc: 'indeterminate', ini: dia(-20), fim: dia(15), nFilhos: 4, nConcluidos: 2, emAnd: 1 }),
  // marco em 10 dias com 69 % / 70 %: risco · andamento (pct < 70)
  EP({ k: 'F-4', resumo: 'Marco em 10 dias 69%', sc: 'indeterminate', ini: dia(-20), fim: dia(10), nFilhos: 100, nConcluidos: 69, emAnd: 1 }),
  EP({ k: 'F-5', resumo: 'Marco em 10 dias 70%', sc: 'indeterminate', ini: dia(-20), fim: dia(10), nFilhos: 100, nConcluidos: 70, emAnd: 1 }),
  // marco em 10 dias com 75 % (não é risco por pct) — reprova quem afrouxar o 70 para 80
  EP({ k: 'F-6', resumo: 'Marco em 10 dias 75%', sc: 'indeterminate', ini: dia(-20), fim: dia(10), nFilhos: 4, nConcluidos: 3, emAnd: 1 }),
  // marco hoje / ontem, 80 %: andamento (fimRef < hoje é falso) · atrasado 1 dia
  EP({ k: 'F-7', resumo: 'Marco hoje 80%', sc: 'indeterminate', ini: dia(-20), fim: dia(0), nFilhos: 5, nConcluidos: 4, emAnd: 1 }),
  EP({ k: 'F-8', resumo: 'Marco ontem 80%', sc: 'indeterminate', ini: dia(-20), fim: dia(-1), nFilhos: 5, nConcluidos: 4, emAnd: 1 }),
  // itens vencidos, marco longe, 90 %, SEM ritmo: risco só pelo ramo filhosVenc
  EP({ k: 'F-9', resumo: 'Vencidos sem ritmo', sc: 'indeterminate', ini: dia(-20), fim: dia(90), nFilhos: 10, nConcluidos: 9, emAnd: 1, filhosVenc: 1 }),
  // corte das 8 semanas: só o mês do corte conta (o anterior, não) — previsão diferente se o corte mudar
  EP({ k: 'F-10', resumo: 'Corte 8 semanas', sc: 'indeterminate', ini: dia(-120), fim: dia(120), nFilhos: 20, nConcluidos: 7, emAnd: 1, porMes: { [mesAntes(dia(-56).slice(0, 7), 1)]: { c: 5, d: 5 }, [dia(-56).slice(0, 7)]: { c: 2, d: 2 } } }),
  // exatamente 1 item restante com ritmo: existe previsão (restantes > 0)
  EP({ k: 'F-11', resumo: 'Um restante', sc: 'indeterminate', ini: dia(-30), fim: dia(60), nFilhos: 5, nConcluidos: 4, emAnd: 1, porMes: { [mes(0)]: { c: 0, d: 4 } } }),
  // marco hoje em épico aberto: é o próximo marco (f >= hoje)
  EP({ k: 'F-12', resumo: 'Marco hoje planejado', ini: dia(-3), fim: dia(0), criado: dia(-4) }),
  // sem marco próprio, filhos vencendo ontem: atrasado pelo fim derivado
  EP({ k: 'F-13', resumo: 'Derivado ontem', sc: 'indeterminate', vencFilhos: dia(-1), nFilhos: 3, nConcluidos: 1, emAnd: 1 }),
  // concluído sem marco: sem atraso; concluído ANTES do marco: atraso 0
  EP({ k: 'F-14', resumo: 'Feito sem marco', sc: 'done', resolvido: dia(-2), nFilhos: 2, nConcluidos: 2 }),
  EP({ k: 'F-15', resumo: 'Feito adiantado', sc: 'done', fim: dia(5), resolvido: dia(-2), nFilhos: 2, nConcluidos: 2 }),
];
const ESPERADO_FRONT = { 'F-1': 'risco', 'F-2': 'risco', 'F-3': 'andamento', 'F-4': 'risco', 'F-5': 'andamento', 'F-6': 'andamento', 'F-7': 'andamento', 'F-8': 'atrasado', 'F-9': 'risco', 'F-13': 'atrasado', 'F-14': 'concluido', 'F-15': 'concluido' };

// ---- 3. ~300 épicos por PRNG semeado (mulberry32): determinístico, mas cobre combinações que ninguém escreveria à mão ----
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function geraEpicos(n, seed) {
  const r = prng(seed); const ri = (a, b) => a + Math.floor(r() * (b - a + 1)); const talvez = (p) => r() < p;
  const out = [];
  for (let i = 0; i < n; i++) {
    const sc = ['new', 'indeterminate', 'done', 'cancel'][ri(0, 3)];
    const nFilhos = talvez(0.2) ? 0 : ri(1, 12); const nConcluidos = sc === 'done' ? nFilhos : ri(0, nFilhos);
    const ini = talvez(0.8) ? dia(ri(-120, 60)) : ''; const fim = talvez(0.7) ? dia(ri(-60, 120)) : '';
    const porMes = {}; const nm = ri(0, 4); for (let j = 0; j < nm; j++) porMes[mes(-ri(0, 90))] = { c: ri(0, 5), d: ri(0, 4) };
    const pfx = talvez(0.6) ? `${ri(1, 9)}${talvez(0.3) ? '.' + ri(1, 5) : ''}. ` : '';
    out.push(EP({ k: `G-${i + 1}`, resumo: `${pfx}Épico ${i + 1}`, sc, ini, fim, criado: dia(ri(-150, 0)), resolvido: sc === 'done' && talvez(0.8) ? dia(ri(-60, 0)) : '',
      vencFilhos: nFilhos && talvez(0.6) ? dia(ri(-40, 100)) : '', iniItens: nFilhos && talvez(0.8) ? dia(ri(-120, 0)) : '', fimItens: nFilhos && talvez(0.6) ? dia(ri(-60, 0)) : '',
      nFilhos, nConcluidos, emAnd: ri(0, Math.max(0, nFilhos - nConcluidos)), filhosAbertos: nFilhos - nConcluidos, filhosVenc: talvez(0.2) ? ri(1, 3) : 0, filhosDepois: talvez(0.1) ? 1 : 0,
      estH: ri(0, 80), gastoH: ri(0, 90), porMes }));
  }
  return out;
}
const GER = geraEpicos(300, 20260928);
const TODOS = [...FIX, ...FRONT, ...GER];

// ---- "aguardando cliente": o que o portal DEVE aceitar e DEVE recusar ----
const ST_CLIENTE = ['Aguardando cliente', 'Aguardando o cliente', 'Aguardando resposta do cliente', 'Pendente com o cliente', 'Pendente cliente', 'Waiting for customer', 'Waiting for the client'];
const ST_INTERNO = ['Aguardando Dexterity', 'Aguardando deploy', 'Aguardando deploy interno', 'Waiting for approval', 'Aguardando janela', 'Em andamento', 'Tarefas pendentes', 'Cliente', 'Concluído', 'Em espera do cliente'];

// ---- front, num vm ----
const codigo = [
  extrai('public/js/02b-cronograma.js', ['crDias', 'crAddDias', 'crPrefixo', 'crCmpNums', 'crLinhas', 'crOrdena']),
  extrai('public/js/02-projetos.js', ['projMarcos']),
  extrai('public/js/20-gestao.js', ['GX_RE_AGUARDA_CLIENTE']),
].join('\n');
// O vm recebe as MESMAS fixtures (copiadas: o front devolve {...e} e não deve mexer nelas).
const ctx = vm.createContext({ hojeSP: () => HOJE, projHoje: () => HOJE, fmtHd: (h) => String(h), estado: {}, console, TODOS: JSON.parse(JSON.stringify(TODOS)) });
let front = null;
try {
  vm.runInContext(`${codigo}\nvar __saida={ linhas: crLinhas({ epicos: TODOS }), ordem: crOrdena(crLinhas({ epicos: TODOS }), '').map(r=>r.k), marcos: projMarcos({ epicos: TODOS }), re: GX_RE_AGUARDA_CLIENTE };`, ctx, { filename: 'front-cronograma.js' });
  front = ctx.__saida;
} catch (e) { erros.push(`não consegui executar as funções do front no vm: ${e.message}`); }

// ---- servidor ----
let srv = null;
try {
  const cr = await import(pathToFileURL('api/_lib/cronograma.js').href);
  const pt = await import(pathToFileURL('api/_lib/portal.js').href);
  srv = { linhas: cr.crLinhas(TODOS, HOJE), marcos: cr.projMarcos(TODOS, HOJE), cliente: cr.cronogramaDoProjeto(TODOS, HOJE), clienteFix: cr.cronogramaDoProjeto(FIX, HOJE), re: pt.RE_AGUARDA_CLIENTE };
} catch (e) { erros.push(`não consegui importar api/_lib: ${e.message}`); }

// ---- comparação ----
const CAMPOS = ['iniPlan', 'fimPlan', 'fimRef', 'fimDerivado', 'iniReal', 'fimReal', 'done', 'cancel', 'previsao', 'ritmo', 'restantes', 'pct', 'diasAte', 'st', 'atraso'];
if (front && srv) {
  let difs = 0;
  TODOS.forEach((e, i) => {
    const f = front.linhas[i]; const s = srv.linhas[i];
    if (!f || !s || f.k !== e.k || s.k !== e.k) { erros.push(`${e.k}: linha ausente de um dos lados`); return; }
    CAMPOS.forEach((c) => {
      if (JSON.stringify(f[c]) !== JSON.stringify(s[c])) { difs += 1; if (difs <= 12) erros.push(`${e.k} (${e.resumo}) · ${c}: front=${JSON.stringify(f[c])} servidor=${JSON.stringify(s[c])}`); }
    });
  });
  if (difs > 12) erros.push(`… e mais ${difs - 12} diferença(s) front × servidor`);
  if (JSON.stringify(front.marcos) !== JSON.stringify(srv.marcos)) erros.push(`projMarcos: front=${JSON.stringify(front.marcos)} servidor=${JSON.stringify(srv.marcos)}`);
  // Ordem em cascata: o cliente recebe os épicos na sequência do Cronograma (crOrdena padrão), sem os cancelados.
  const ordemSrv = srv.cliente.epicos.map((e) => e.k); const cancelados = new Set(TODOS.filter((e) => e.sc === 'cancel').map((e) => e.k));
  const ordemFront = front.ordem.filter((k) => !cancelados.has(k));
  if (JSON.stringify(ordemSrv) !== JSON.stringify(ordemFront)) erros.push(`ordem em cascata: front=${ordemFront.slice(0, 12).join(',')}… servidor=${ordemSrv.slice(0, 12).join(',')}…`);

  // "aguardando cliente": o portal aceita/recusa a lista, e é subconjunto do preset da Gestão.
  ST_CLIENTE.forEach((s) => { if (!srv.re.test(s)) erros.push(`"aguardando cliente" (portal): deveria aceitar o status "${s}"`); if (!front.re.test(s)) erros.push(`"aguardando cliente" (Gestão): o status "${s}" vira pendência no portal mas não aparece no preset do time`); });
  ST_INTERNO.forEach((s) => { if (srv.re.test(s)) erros.push(`"aguardando cliente" (portal): "${s}" NÃO é do cliente e viraria cobrança com o resumo interno exposto`); });
  [...ST_CLIENTE, ...ST_INTERNO, 'Aguardando', 'Waiting', 'Pendente', 'Cliente aguardando'].forEach((s) => { if (srv.re.test(s) && !front.re.test(s)) erros.push(`"aguardando cliente": o portal aceita "${s}" e a Gestão não — o portal precisa ser subconjunto do preset`); });

  // Os ramos que as fixtures existem para cobrir — se a regra mudar e uma fixture deixar de
  // exercitar o ramo, este bloco avisa em vez de a paridade passar "no vazio".
  const esp = { ...ESPERADO, ...ESPERADO_FRONT };
  srv.linhas.forEach((s) => { if (esp[s.k] && s.st !== esp[s.k]) erros.push(`${s.k}: a fixture deveria cair em "${esp[s.k]}", caiu em "${s.st}" — ajuste a fixture ou reveja a regra dos dois lados`); });
  const L = (k) => srv.linhas.find((s) => s.k === k) || {};
  if (!L('P-1').previsao) erros.push('P-1: a previsão pelo ritmo deveria existir');
  if (L('P-4').atraso !== 5) erros.push(`P-4: atraso de entrega deveria ser 5 dias (fimReal − fimPlan), veio ${L('P-4').atraso}`);
  if (L('P-6').atraso !== 13) erros.push(`P-6: atraso deveria ser 13 dias, veio ${L('P-6').atraso}`);
  if (!(L('P-7').fimDerivado && L('P-7').fimRef === dia(22))) erros.push('P-7: o fim deveria vir do maior vencimento dos filhos');
  if (L('F-8').atraso !== 1) erros.push(`F-8: marco ontem = 1 dia de atraso, veio ${L('F-8').atraso}`);
  if (L('F-10').previsao !== dia(Math.ceil(13 / (2 / 8) * 7))) erros.push(`F-10: só o mês do corte (8 semanas) conta no ritmo — previsão veio ${L('F-10').previsao}`);
  if (!L('F-11').previsao) erros.push('F-11: com 1 item restante e ritmo, a previsão deveria existir');
  if (srv.marcos.prox !== HOJE) erros.push(`projMarcos: um marco HOJE em épico aberto é o próximo marco (>= hoje), veio ${srv.marcos.prox}`);
  if (L('F-15').atraso !== 0) erros.push(`F-15: concluído antes do marco não tem atraso, veio ${L('F-15').atraso}`);

  // O que o cliente recebe (só as fixtures nomeadas): cancelado fora, status traduzido, KPIs coerentes com as linhas.
  const c = srv.clienteFix;
  if (c.epicos.some((e) => e.k === 'P-5')) erros.push('cronogramaDoProjeto: o épico cancelado não pode chegar ao cliente');
  if (c.epicos.find((e) => e.k === 'P-7').status !== 'planejado') erros.push('cronogramaDoProjeto: nao_iniciado deveria virar "planejado" para o cliente');
  if (c.resumo.semaforo !== 'atrasado') erros.push(`cronogramaDoProjeto: com um épico atrasado o semáforo é "atrasado", veio "${c.resumo.semaforo}"`);
  if (c.resumo.maiorAtrasoDias !== 13) erros.push(`cronogramaDoProjeto: maior atraso deveria ser 13, veio ${c.resumo.maiorAtrasoDias}`);
  const mkFix = srv.linhas.length && (await import(pathToFileURL('api/_lib/cronograma.js').href)).projMarcos(FIX, HOJE);
  if (!(c.resumo.marcos.proximo && c.resumo.marcos.proximo.data === mkFix.prox)) erros.push('cronogramaDoProjeto: o próximo marco deveria ser o de projMarcos');
  const tot = FIX.filter((e) => e.sc !== 'cancel').reduce((s, e) => s + e.nFilhos, 0); const conc = FIX.filter((e) => e.sc !== 'cancel').reduce((s, e) => s + e.nConcluidos, 0);
  if (c.resumo.itens.total !== tot || c.resumo.itens.concluidos !== conc || c.resumo.pct !== Math.round(conc / tot * 100)) erros.push(`cronogramaDoProjeto: progresso em itens deveria ser ${conc}/${tot}, veio ${JSON.stringify(c.resumo.itens)} (${c.resumo.pct}%)`);
  // previsão de término: nunca antes do último marco planejado; os dois campos viajam separados
  const R = c.resumo; const esperadoFim = R.previsaoRitmo > R.ultimoMarco ? R.previsaoRitmo : R.ultimoMarco;
  if (R.previsaoFim !== esperadoFim || R.previsaoFim < R.ultimoMarco) erros.push(`cronogramaDoProjeto: previsaoFim deveria ser max(ultimoMarco ${R.ultimoMarco}, previsaoRitmo ${R.previsaoRitmo}), veio ${R.previsaoFim}`);
  const R2 = srv.cliente.resumo;
  if (R2.previsaoFim < R2.ultimoMarco) erros.push(`cronogramaDoProjeto (gerados): previsaoFim ${R2.previsaoFim} anterior ao último marco ${R2.ultimoMarco}`);
  // O caso do revisor: o ritmo do épico mais lento (F-11: +14 dias) chega ANTES de um marco planejado (F-3: +15; F-11: +60)
  // → a previsão de término é o último marco (+60), não a do ritmo.
  const cr2 = await import(pathToFileURL('api/_lib/cronograma.js').href);
  const R3 = cr2.cronogramaDoProjeto(FRONT.filter((e) => e.k === 'F-11' || e.k === 'F-3'), HOJE).resumo;
  if (!(R3.ultimoMarco === dia(60) && R3.previsaoRitmo === dia(14) && R3.previsaoFim === dia(60))) erros.push(`cronogramaDoProjeto: ritmo (+14) antes do último marco (+60) → previsaoFim deveria ser ${dia(60)}; veio ${JSON.stringify({ previsaoFim: R3.previsaoFim, ultimoMarco: R3.ultimoMarco, previsaoRitmo: R3.previsaoRitmo })}`);
}

if (erros.length) {
  console.error('✗ Paridade do cronograma (front × servidor):');
  erros.forEach((e) => console.error('  ✗', e));
  process.exit(1);
}
console.log(`✓ Paridade do cronograma OK (${FIX.length} fixtures + ${FRONT.length} de fronteira + ${GER.length} geradas (seed) · ${CAMPOS.length} campos por épico · próximo marco · ordem · "aguardando cliente" ⊂ Gestão).`);
