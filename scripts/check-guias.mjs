#!/usr/bin/env node
// Gate dos 🧭 GUIAS INTERATIVOS e do 🗺 TOUR (acordo com o usuário de 2026-10-02: "toda modificação
// atualiza as etapas; todas as telas atuais têm o guia pronto"). Roda em `npm run check` e na CI.
//
// O que ele garante, por máquina e não por memória:
//   1. TODA vista de VISTAS tem um guia em GUIAS (título + ao menos 3 passos com título e texto);
//   2. TODA vista está no 🗺 tour completo (TOUR_TELAS, um passo `vai` por tela);
//   3. TODA vista tem a sua linha na lista "TODAS as telas" da ❓ Ajuda (data-aj-goto);
//   4. nenhum guia/passo aponta para tela que não existe mais (guia órfão);
//   5. os seletores dos passos (`s`, `sel`) só usam ids, classes e data-atributos que EXISTEM no
//      HTML/JS do app — um passo com seletor morto nunca ancora e vira tarja "livre" para sempre;
//   6. GUIAS_REV (a data da última revisão dos guias) acompanha a última entrada de NOVIDADES —
//      entrega nova sem reler os guias reprova, como o ROADMAP_REV faz com o roadmap.
import { readFileSync, readdirSync } from 'node:fs';

const ARQ = 'public/js/25-ajuda-guias.js';
const src = readFileSync(ARQ, 'utf8');
const erros = [];
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Extrai o literal de `const NOME=<literal>;` respeitando aspas, crases e escapes (mesma leitura do check-entrega).
function literalDe(nome, fonte) {
  const i = fonte.indexOf(`const ${nome}=`);
  if (i < 0) return null;
  let p = i + `const ${nome}=`.length;
  const ini = p;
  let prof = 0; let aspa = ''; let escapa = false;
  for (; p < fonte.length; p += 1) {
    const c = fonte[p];
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
  const bruto = fonte.slice(ini, p).trim();
  try { return new Function(`return (${bruto})`)(); }
  catch (e) { erros.push(`${nome}: não consegui ler o literal (${e.message}).`); return null; }
}

const GUIAS = literalDe('GUIAS', src) || {};
const TOUR_TELAS = literalDe('TOUR_TELAS', src) || [];
const TOUR = literalDe('TOUR', src) || [];
const GUIAS_REV = literalDe('GUIAS_REV', src);
const VISTAS = literalDe('VISTAS', readFileSync('public/js/29-url-topo.js', 'utf8')) || [];
const NOVIDADES = literalDe('NOVIDADES', readFileSync('public/js/05-novidades-roadmap.js', 'utf8')) || [];

if (!VISTAS.length) erros.push('🧭 VISTAS não encontrado em 29-url-topo.js.');
if (!Object.keys(GUIAS).length) erros.push(`🧭 GUIAS não encontrado em ${ARQ}.`);
if (!TOUR_TELAS.length) erros.push(`🗺 TOUR_TELAS não encontrado em ${ARQ}.`);

// 1. toda vista tem guia completo
const texto = (x) => String(x || '').trim();
VISTAS.forEach((v) => {
  const g = GUIAS[v];
  if (!g) { erros.push(`🧭 GUIAS: a tela "${v}" NÃO TEM GUIA — acrescente \`${v}:{t:'…',p:[{s:'…',ti:'…',tx:'…'},…]}\` em ${ARQ} (toda tela tem guia pronto).`); return; }
  if (!texto(g.t)) erros.push(`🧭 GUIAS "${v}": título (t) vazio.`);
  if (!Array.isArray(g.p) || g.p.length < 3) erros.push(`🧭 GUIAS "${v}": precisa de ao menos 3 passos (tem ${Array.isArray(g.p) ? g.p.length : 0}) — um guia explica a tela inteira.`);
  (Array.isArray(g.p) ? g.p : []).forEach((pp, i) => {
    if (!pp || typeof pp !== 'object') { erros.push(`🧭 GUIAS "${v}" passo ${i + 1}: inválido.`); return; }
    if (!texto(pp.ti)) erros.push(`🧭 GUIAS "${v}" passo ${i + 1}: título (ti) vazio.`);
    if (!texto(pp.tx)) erros.push(`🧭 GUIAS "${v}" passo ${i + 1} ("${texto(pp.ti).slice(0, 30)}"): texto (tx) vazio.`);
  });
});
// 4. guia órfão (tela aposentada)
Object.keys(GUIAS).forEach((v) => { if (!VISTAS.includes(v)) erros.push(`🧭 GUIAS "${v}": não é uma vista de VISTAS — tela aposentada? tire o guia (ou use o slug novo).`); });

// 2. toda vista no tour completo
const noTour = new Set(TOUR_TELAS.map((x) => x && x.vai).filter(Boolean));
VISTAS.forEach((v) => { if (!noTour.has(v)) erros.push(`🗺 TOUR_TELAS: a tela "${v}" não está no tour completo — acrescente \`{vai:'${v}',titulo:'…',texto:'…'}\` na ordem do menu em ${ARQ}.`); });
TOUR_TELAS.forEach((x, i) => {
  if (!x || typeof x !== 'object') { erros.push(`🗺 TOUR_TELAS[${i}]: inválido.`); return; }
  if (!texto(x.titulo)) erros.push(`🗺 TOUR_TELAS[${i}]: título vazio.`);
  if (!texto(x.texto)) erros.push(`🗺 TOUR_TELAS[${i}] ("${texto(x.titulo).slice(0, 30)}"): texto vazio.`);
  if (x.vai && !VISTAS.includes(x.vai)) erros.push(`🗺 TOUR_TELAS[${i}]: vai:'${x.vai}' não é uma vista de VISTAS.`);
});

// 3. toda vista na lista "TODAS as telas" da Ajuda
VISTAS.forEach((v) => {
  if (!src.includes(`data-aj-goto="${v}"`)) erros.push(`❓ Ajuda: a tela "${v}" não está na lista "TODAS as telas" (abreAjuda em ${ARQ}) — acrescente a linha com data-aj-goto="${v}" e o botão 🧭 data-aj-guia="${v}".`);
});

// 5. seletores vivos: ids, classes e data-atributos citados nos passos existem no app
const fontes = ['public/index.html'].concat(readdirSync('public/js').filter((f) => f.endsWith('.js') && !f.startsWith('_') && f !== '25-ajuda-guias.js').map((f) => 'public/js/' + f))
  .map((f) => readFileSync(f, 'utf8')).join('\n');
const existe = (tok) => new RegExp('(^|[^\\w-])' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])').test(fontes);
function conferePasso(sel, onde) {
  String(sel).split(',').forEach((simples) => {
    const s = simples.trim(); if (!s) return;
    const mortos = [];
    for (const m of s.matchAll(/#([\w-]+)/g)) if (!existe(m[1])) mortos.push('#' + m[1]);
    for (const m of s.matchAll(/\[data-([\w-]+)/g)) if (!existe('data-' + m[1])) mortos.push('[data-' + m[1] + ']');
    for (const m of s.matchAll(/(?<![\w-])\.([a-zA-Z_][\w-]*)/g)) if (!existe(m[1])) mortos.push('.' + m[1]);
    if (mortos.length) erros.push(`🧭 ${onde}: seletor "${s}" aponta para ${mortos.join(', ')}, que não existe no HTML/JS do app — o passo nunca ancora (seletor morto: atualize o passo ou use \`quando\` sem seletor).`);
  });
}
Object.keys(GUIAS).forEach((v) => (Array.isArray(GUIAS[v].p) ? GUIAS[v].p : []).forEach((pp, i) => { if (pp && pp.s) conferePasso(pp.s, `GUIAS "${v}" passo ${i + 1} ("${texto(pp.ti).slice(0, 30)}")`); }));
TOUR_TELAS.forEach((x, i) => { if (x && x.sel) conferePasso(x.sel, `TOUR_TELAS[${i}] ("${texto(x.titulo).slice(0, 30)}")`); });
TOUR.forEach((x, i) => { if (x && x.sel) conferePasso(x.sel, `TOUR[${i}] ("${texto(x.titulo).slice(0, 30)}")`); });

// 6. GUIAS_REV acompanha a última novidade (mesma regra do ROADMAP_REV)
const ULTIMA = (NOVIDADES.length && RE_DATA.test(String(NOVIDADES[0][0]))) ? String(NOVIDADES[0][0]) : '';
if (typeof GUIAS_REV !== 'string') {
  erros.push(`🧭 GUIAS_REV não encontrado em ${ARQ} — acrescente \`const GUIAS_REV='AAAA-MM-DD';\` logo acima de \`const GUIAS={\`.`);
} else if (!RE_DATA.test(GUIAS_REV)) {
  erros.push(`🧭 GUIAS_REV inválido ("${GUIAS_REV}") — use AAAA-MM-DD.`);
} else if (ULTIMA && GUIAS_REV < ULTIMA) {
  erros.push([
    `🧭 GUIAS NÃO REVISADOS NESTA ENTREGA: a última novidade é de ${ULTIMA} e os guias foram revisados em ${GUIAS_REV}.`,
    `     Antes de fechar a entrega, releia em ${ARQ}:`,
    '       • o 🧭 guia (GUIAS) de cada tela que esta entrega mexeu — passo novo para o que entrou, texto novo para o que mudou;',
    '       • o passo da tela no 🗺 tour completo (TOUR_TELAS) e, se a barra/áreas mudaram, o ▶ tour rápido (TOUR);',
    '       • a linha da tela na lista "TODAS as telas" da ❓ Ajuda;',
    `       • e carimbe \`const GUIAS_REV='${ULTIMA}';\` — mesmo que nada mude, a data confirma que os guias foram relidos.`,
  ].join('\n'));
} else if (ULTIMA && GUIAS_REV > ULTIMA) {
  erros.push(`🧭 GUIAS_REV (${GUIAS_REV}) é posterior à última novidade (${ULTIMA}) — revise a data: as duas andam juntas.`);
}

console.log('Guias e tour (🧭 por tela · 🗺 completo · ❓ Ajuda):');
if (erros.length) {
  erros.forEach((e) => console.error('  ✗ ' + e));
  console.error(`\n✗ ${erros.length} problema(s) nos guias/tour.`);
  process.exit(1);
}
const nPassos = Object.values(GUIAS).reduce((s, g) => s + g.p.length, 0);
console.log(`  ✓ ${VISTAS.length} telas, todas com guia (${nPassos} passos), no tour completo (${TOUR_TELAS.length} passos) e na Ajuda · seletores vivos · guias revisados em ${GUIAS_REV}`);
