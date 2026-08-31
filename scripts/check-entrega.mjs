#!/usr/bin/env node
// Gate de ENTREGA: garante que cada entrega revise o 🗺️ Roadmap e as ✨ Novidades
// (acordo com o usuário — CLAUDE.md). Roda em `npm run check` e na CI a cada PR.
//
// Sem build e sem framework, o roadmap é só um array em public/index.html — fácil
// de esquecer. Aqui ele deixa de depender de memória: se entrou novidade e a data
// de revisão do roadmap ficou para trás, a verificação falha e o PR fica vermelho.
import { readFileSync } from 'node:fs';

const ARQ = 'public/index.html';
const src = readFileSync(ARQ, 'utf8');
const erros = [];
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Extrai o literal de `const NOME=<literal>;` respeitando aspas, crases e escapes
// (os textos das novidades têm HTML, aspas e parênteses à vontade).
function literalDe(nome) {
  const i = src.indexOf(`const ${nome}=`);
  if (i < 0) return null;
  let p = i + `const ${nome}=`.length;
  const ini = p;
  let prof = 0; let aspa = ''; let escapa = false;
  for (; p < src.length; p += 1) {
    const c = src[p];
    if (escapa) { escapa = false; continue; }
    if (aspa) {
      if (c === '\\') escapa = true;
      else if (c === aspa) aspa = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { aspa = c; continue; }
    if (c === '[' || c === '{' || c === '(') prof += 1;
    else if (c === ']' || c === '}' || c === ')') prof -= 1;
    else if (c === ';' && prof === 0) break;
  }
  const bruto = src.slice(ini, p).trim();
  try { return new Function(`return (${bruto})`)(); }
  catch (e) { erros.push(`${nome}: não consegui ler o literal (${e.message}).`); return null; }
}

const NOVIDADES = literalDe('NOVIDADES');
const ROADMAP = literalDe('ROADMAP');
const NOV_VER = literalDe('NOV_VER');
const ROADMAP_REV = literalDe('ROADMAP_REV');

if (!Array.isArray(NOVIDADES) || !NOVIDADES.length) erros.push('NOVIDADES não encontrado (ou vazio) em ' + ARQ);
if (!Array.isArray(ROADMAP) || !ROADMAP.length) erros.push('ROADMAP não encontrado (ou vazio) em ' + ARQ);
if (typeof NOV_VER !== 'string') erros.push('NOV_VER não encontrado em ' + ARQ);
if (typeof ROADMAP_REV !== 'string') {
  erros.push('ROADMAP_REV não encontrado em ' + ARQ
    + ' — acrescente `const ROADMAP_REV=\'AAAA-MM-DD\';` logo acima de `const ROADMAP=[`.');
}

if (Array.isArray(NOVIDADES) && NOVIDADES.length) {
  NOVIDADES.forEach((n, i) => {
    if (!Array.isArray(n) || n.length < 2) { erros.push(`NOVIDADES[${i}]: use o formato ['AAAA-MM-DD','texto'].`); return; }
    if (!RE_DATA.test(String(n[0]))) erros.push(`NOVIDADES[${i}]: data inválida "${n[0]}" (use AAAA-MM-DD).`);
    if (!String(n[1] || '').trim()) erros.push(`NOVIDADES[${i}]: texto vazio.`);
  });
  for (let i = 1; i < NOVIDADES.length; i += 1) {
    if (String(NOVIDADES[i - 1][0]) < String(NOVIDADES[i][0])) {
      erros.push(`NOVIDADES fora de ordem: ${NOVIDADES[i - 1][0]} vem antes de ${NOVIDADES[i][0]} — a mais recente fica no topo.`);
      break;
    }
  }
}

const ULTIMA = (Array.isArray(NOVIDADES) && NOVIDADES.length && RE_DATA.test(String(NOVIDADES[0][0])))
  ? String(NOVIDADES[0][0]) : '';

// --- A GARANTIA: entrega nova ⇒ roadmap revisado na mesma data ---
if (ULTIMA && typeof ROADMAP_REV === 'string') {
  if (!RE_DATA.test(ROADMAP_REV)) {
    erros.push(`ROADMAP_REV inválido ("${ROADMAP_REV}") — use AAAA-MM-DD.`);
  } else if (ROADMAP_REV < ULTIMA) {
    erros.push([
      `🗺️ ROADMAP NÃO REVISADO NESTA ENTREGA: a última novidade é de ${ULTIMA} e o roadmap foi revisado em ${ROADMAP_REV}.`,
      '     Antes de fechar a entrega, releia o array ROADMAP em public/index.html:',
      '       • tire (ou mova) o que esta entrega concluiu;',
      '       • mova o que mudou de estágio entre fazendo / planejado / avaliacao;',
      '       • acrescente os pedidos novos do usuário;',
      `       • e carimbe \`const ROADMAP_REV='${ULTIMA}';\` — mesmo que nada mais mude, a data confirma que a lista foi revista.`,
    ].join('\n'));
  } else if (ROADMAP_REV > ULTIMA) {
    erros.push(`ROADMAP_REV (${ROADMAP_REV}) é posterior à última novidade (${ULTIMA}) — revise a data: as duas andam juntas.`);
  }
}

// NOV_VER precisa acompanhar a última novidade (é o que reacende o indicador ✨).
if (ULTIMA && typeof NOV_VER === 'string' && !NOV_VER.startsWith(ULTIMA)) {
  erros.push(`NOV_VER ("${NOV_VER}") não corresponde à última novidade (${ULTIMA}) — use "${ULTIMA}.1" (ou .2, .3… no mesmo dia).`);
}

// Sanidade do roadmap: estágio válido, título e descrição preenchidos, sem repetidos.
if (Array.isArray(ROADMAP)) {
  const ESTAGIOS = new Set(['fazendo', 'planejado', 'avaliacao']);
  const vistos = new Set();
  ROADMAP.forEach((x, i) => {
    if (!x || typeof x !== 'object') { erros.push(`ROADMAP[${i}]: item inválido.`); return; }
    if (!ESTAGIOS.has(x.s)) erros.push(`ROADMAP[${i}] ("${String(x.t || '').slice(0, 40)}"): estágio "${x.s}" inválido — use fazendo, planejado ou avaliacao.`);
    if (!String(x.t || '').trim()) erros.push(`ROADMAP[${i}]: título (t) vazio.`);
    if (!String(x.d || '').trim()) erros.push(`ROADMAP[${i}] ("${String(x.t || '').slice(0, 40)}"): descrição (d) vazia — explique o que é, para quem lê o roadmap na tela.`);
    const chave = String(x.t || '').trim().toLowerCase();
    if (chave && vistos.has(chave)) erros.push(`ROADMAP: item repetido — "${x.t}".`);
    vistos.add(chave);
  });
}

console.log('Entrega (Novidades + Roadmap):');
if (erros.length) {
  erros.forEach((e) => console.error('  ✗ ' + e));
  console.error(`\n✗ ${erros.length} problema(s) na entrega.`);
  process.exit(1);
}
const porEstagio = ROADMAP.reduce((a, x) => { a[x.s] = (a[x.s] || 0) + 1; return a; }, {});
console.log(`  ✓ última novidade ${ULTIMA} · NOV_VER ${NOV_VER}`);
console.log(`  ✓ roadmap revisado em ${ROADMAP_REV} — ${ROADMAP.length} item(ns): `
  + `${porEstagio.fazendo || 0} em desenvolvimento, ${porEstagio.planejado || 0} planejado(s), ${porEstagio.avaliacao || 0} em avaliação`);
