#!/usr/bin/env node
// Gate da ❓ AJUDA com a documentação do Notion (2026-11-22). Roda em `npm run check` e na CI.
//
// O que ele garante, por máquina e não por memória:
//   1. TODA vista de VISTAS (29-url-topo.js) tem uma entrada em AJUDA_MAPA (public/js/25c-ajuda-painel.js) e o mapa não
//      cita vista que não existe mais (tela nova = linha no mapa; tela aposentada = linha fora);
//   2. todo `cod` do mapa existe em AJUDA_FONTES (api/_lib/ajuda.js) e não é `soLink` (o TI-14-001 é só link);
//   3. AJUDA_FONTES sem `cod`/`arq`/`id` repetido, `id` com 32 hex e `arq` = cod em minúsculas;
//   4. o mermaid do painel só vem com VERSÃO EXATA (mermaid@x.y.z) e SRI sha384 válido (AJD_MERMAID_URL/AJD_MERMAID_SRI);
//   5. o service worker (public/sw.js) NUNCA guarda cópia da ajuda: 'ajuda' em DADOS_PARAM_PROIBIDO;
//   6. o conteúdo do Notion não volta ao repositório: public/ajuda/ não pode existir;
//   7. o conteúdo vem de fora: no módulo do painel, innerHTML/insertAdjacentHTML/outerHTML só nas linhas marcadas
//      `// ajd:casca` (texto fixo do app) e dentro de `ajdMermaidPinta` (o SVG que a lib mermaid sanitiza em `strict`).
// Modo opcional `--titulos <arquivo.json>` ({ "ti-14-007": ["título da seção", …] }): confere que a palavra-chave de cada
// entrada do mapa casa com ALGUMA seção do processo (só dos processos que estão no arquivo). O conteúdo real mora no banco do
// painel — este modo é para a conferência na entrega e para quem quiser rodar com os títulos lidos do Notion.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { AJUDA_FONTES } from '../api/_lib/ajuda.js';

const ARQ = 'public/js/25c-ajuda-painel.js';
const erros = [];

// Extrai o literal de `const NOME=<literal>;` (mesma leitura do check-guias).
function literalDe(nome, fonte) {
  const re = new RegExp(`const ${nome}\\s*=`);
  const m = re.exec(fonte);
  if (!m) return null;
  let p = m.index + m[0].length;
  const ini = p;
  let prof = 0; let aspa = ''; let escapa = false;
  for (; p < fonte.length; p += 1) {
    const c = fonte[p];
    if (escapa) { escapa = false; continue; }
    if (aspa) { if (c === '\\') escapa = true; else if (c === aspa) aspa = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { aspa = c; continue; }
    if (c === '[' || c === '{' || c === '(') prof += 1;
    else if (c === ']' || c === '}' || c === ')') prof -= 1;
    else if (c === ';' && prof === 0) break;
  }
  try { return new Function(`return (${fonte.slice(ini, p).trim()})`)(); }
  catch (e) { erros.push(`${nome}: não consegui ler o literal (${e.message}).`); return null; }
}

let src = '';
try { src = readFileSync(ARQ, 'utf8'); } catch (e) { erros.push(`📘 ${ARQ} não existe.`); }
const VISTAS = literalDe('VISTAS', readFileSync('public/js/29-url-topo.js', 'utf8')) || [];
const MAPA = literalDe('AJUDA_MAPA', src) || {};
const MERMAID_URL = literalDe('AJD_MERMAID_URL', src);
const MERMAID_SRI = literalDe('AJD_MERMAID_SRI', src);

if (!VISTAS.length) erros.push('📘 VISTAS não encontrado em 29-url-topo.js.');
if (!Object.keys(MAPA).length) erros.push(`📘 AJUDA_MAPA não encontrado em ${ARQ}.`);

// 3. fontes
const vistos = { cod: new Set(), arq: new Set(), id: new Set() };
AJUDA_FONTES.forEach((f) => {
  ['cod', 'arq', 'id'].forEach((k) => {
    if (vistos[k].has(f[k])) erros.push(`📘 AJUDA_FONTES: ${k} repetido (${f[k]}).`);
    vistos[k].add(f[k]);
  });
  if (!/^[0-9a-f]{32}$/.test(String(f.id))) erros.push(`📘 AJUDA_FONTES ${f.cod}: id deve ter 32 caracteres hexadecimais (sem hífens).`);
  if (String(f.arq) !== String(f.cod).toLowerCase()) erros.push(`📘 AJUDA_FONTES ${f.cod}: arq deve ser o cod em minúsculas (${String(f.cod).toLowerCase()}).`);
  if (!/^TI-14-\d{3}$/.test(String(f.cod))) erros.push(`📘 AJUDA_FONTES: cod inválido (${f.cod}).`);
});
const fonteDoCod = new Map(AJUDA_FONTES.map((f) => [f.cod, f]));

// 1 e 2. o mapa
VISTAS.forEach((v) => { if (!(v in MAPA)) erros.push(`📘 AJUDA_MAPA: a tela "${v}" não tem entrada — acrescente \`${v}:['TI-14-0NN',null],\` em ${ARQ} (null = abre o Resumo do processo).`); });
Object.keys(MAPA).forEach((v) => {
  if (!VISTAS.includes(v)) erros.push(`📘 AJUDA_MAPA "${v}": não é uma vista de VISTAS — tela aposentada? tire a linha.`);
  const e = MAPA[v];
  if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string' || !(e[1] === null || (typeof e[1] === 'string' && e[1].trim()))) {
    erros.push(`📘 AJUDA_MAPA "${v}": use ['TI-14-0NN', 'palavra-chave'|null].`); return;
  }
  const f = fonteDoCod.get(e[0]);
  if (!f) erros.push(`📘 AJUDA_MAPA "${v}": ${e[0]} não está em AJUDA_FONTES (api/_lib/ajuda.js).`);
  else if (f.soLink) erros.push(`📘 AJUDA_MAPA "${v}": ${e[0]} é só link (soLink) — não há texto para abrir; aponte para outro processo.`);
  else if (f.publicar === false) erros.push(`📘 AJUDA_MAPA "${v}": ${e[0]} não é publicado (publicar:false).`);
  if (typeof e[1] === 'string' && e[1] !== e[1].toLowerCase()) erros.push(`📘 AJUDA_MAPA "${v}": a palavra-chave deve estar em minúsculas e sem acento ("${e[1]}").`);
  if (typeof e[1] === 'string' && e[1].normalize('NFD').replace(/[̀-ͯ]/g, '') !== e[1]) erros.push(`📘 AJUDA_MAPA "${v}": a palavra-chave deve estar sem acento ("${e[1]}").`);
});

// 4. mermaid: versão exata + SRI
if (typeof MERMAID_URL !== 'string') erros.push(`📘 AJD_MERMAID_URL não encontrado em ${ARQ}.`);
else {
  if (!/^https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@\d+\.\d+\.\d+\/dist\/[\w.-]+\.js$/.test(MERMAID_URL)) erros.push(`📘 AJD_MERMAID_URL precisa de versão EXATA (mermaid@x.y.z) no jsDelivr: "${MERMAID_URL}".`);
}
if (typeof MERMAID_SRI !== 'string' || !/^sha384-[A-Za-z0-9+/]{64}$/.test(MERMAID_SRI)) erros.push(`📘 AJD_MERMAID_SRI ausente ou inválido (esperado sha384-<base64 de 64 caracteres>, calculado do arquivo do npm pack).`);

// 5. service worker
try {
  const sw = readFileSync('public/sw.js', 'utf8');
  const m = sw.match(/DADOS_PARAM_PROIBIDO\s*=\s*([^;]*);/);
  if (!m) erros.push('📘 sw.js: DADOS_PARAM_PROIBIDO não encontrado.');
  else if (!/['"]ajuda['"]/.test(m[1])) erros.push("📘 sw.js: 'ajuda' fora de DADOS_PARAM_PROIBIDO — o service worker guardaria cópia da documentação no aparelho (a ajuda é só para quem está identificado).");
} catch (e) { erros.push('📘 sw.js não encontrado.'); }

// 6. nada de conteúdo no repositório
if (existsSync('public/ajuda') && statSync('public/ajuda').isDirectory()) erros.push('📘 public/ajuda/ existe — o conteúdo do Notion mora no banco do painel e NÃO pode voltar ao repositório. Apague a pasta.');

// 7. innerHTML só onde marcado
const linhas = src.split('\n');
let mIni = -1; let mFim = -1;
linhas.forEach((l, i) => { if (mIni < 0 && /function\s+ajdMermaidPinta\b/.test(l)) mIni = i; });
if (mIni >= 0) {
  let prof = 0; let abriu = false;
  for (let i = mIni; i < linhas.length; i += 1) {
    for (const c of linhas[i]) { if (c === '{') { prof += 1; abriu = true; } else if (c === '}') prof -= 1; }
    if (abriu && prof <= 0) { mFim = i; break; }
  }
}
linhas.forEach((l, i) => {
  if (/^\s*\/\//.test(l)) return;   // linha só de comentário
  if (!/\b(innerHTML|insertAdjacentHTML|outerHTML)\b/.test(l)) return;
  if (/\/\/\s*ajd:casca\b/.test(l)) return;
  if (mIni >= 0 && i >= mIni && i <= mFim) return;
  erros.push(`📘 ${ARQ}:${i + 1}: innerHTML/insertAdjacentHTML/outerHTML fora de uma linha marcada \`// ajd:casca\` (texto fixo do app) ou de ajdMermaidPinta — conteúdo vindo de fora só entra por createElement + textContent.`);
});
if (/\bdocument\.write\b/.test(src)) erros.push(`📘 ${ARQ}: document.write não é permitido.`);

// modo opcional --titulos
const iT = process.argv.indexOf('--titulos');
let nTit = 0;
if (iT > 0) {
  let T = null;
  try { T = JSON.parse(readFileSync(process.argv[iT + 1], 'utf8')); } catch (e) { erros.push(`📘 --titulos: não consegui ler ${process.argv[iT + 1]} (${e.message}).`); }
  const sa = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (T) {
    Object.keys(MAPA).forEach((v) => {
      const [cod, kw] = MAPA[v] || [];
      const f = fonteDoCod.get(cod); if (!f || !kw) return;
      const lista = T[f.arq]; if (!Array.isArray(lista)) return;   // processo que não está no arquivo: não confere
      nTit += 1;
      if (!lista.some((t) => sa(t).includes(kw))) erros.push(`📘 AJUDA_MAPA "${v}": a palavra-chave "${kw}" não casa com nenhuma seção de ${cod} (${lista.length} títulos conferidos).`);
    });
  }
}

console.log('Ajuda (❓ painel · 📘 manual do Notion):');
if (erros.length) {
  erros.forEach((e) => console.error('  ✗ ' + e));
  console.error(`\n✗ ${erros.length} problema(s) na ajuda.`);
  process.exit(1);
}
const nFontes = AJUDA_FONTES.filter((f) => !f.soLink).length;
console.log(`  ✓ ${VISTAS.length} telas mapeadas · ${nFontes} fontes${nTit ? ` · ${nTit} palavras-chave conferidas com os títulos` : ''} · mermaid com versão exata e SRI · sw sem cópia · sem public/ajuda/`);
