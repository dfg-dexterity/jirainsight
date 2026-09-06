#!/usr/bin/env node
// Gate de SINTAXE + ORDEM DE CARREGAMENTO (sem build). Roda em `npm run check` e na CI
// (.github/workflows/check.yml) antes do deploy na Vercel.
//
// O que confere:
//  1) api/**/*.js — sintaxe (node --check, ESM).
//  2) public/js/*.js — os módulos do painel. São SCRIPTS CLÁSSICOS carregados em ordem
//     pelo index.html (<script defer src>), num escopo global compartilhado. Aqui:
//     a) cada arquivo passa no node --check como script clássico (cópia .cjs);
//     b) a lista de <script src="/js/…"> do index.html bate 1:1 com os arquivos da pasta
//        (nada sobrando, nada faltando);
//     c) ORDEM DE CARREGAMENTO: nenhuma instrução EXECUTADA no carregamento (chamada
//        solta, addEventListener, IIFE, `const x = f()`) usa uma função/const declarada
//        só num arquivo POSTERIOR (ReferenceError) ou mais abaixo no mesmo arquivo
//        quando é const/let (TDZ). Também acusa nomes globais declarados duas vezes.
//        Isso é o que permite dividir o app em arquivos sem bundler com segurança.
//  3) blocos <script> inline dos HTML estáticos (index/portal/voz).
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import * as acorn from 'acorn';

const dir = mkdtempSync(join(tmpdir(), 'jicheck-'));
let fails = 0;

function check(label, code, ext = '.mjs') {
  const f = join(dir, 'c' + Math.random().toString(36).slice(2) + ext);
  writeFileSync(f, code);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); console.log('  ✓', label); }
  catch (e) { console.error('  ✗', label, '\n' + String((e.stderr || e.message || '')).trim()); fails += 1; }
}

// ---------------------------------------------------------------------------
// 1) Funções serverless (api/**/*.js)
// ---------------------------------------------------------------------------
function walk(d) {
  for (const name of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, name.name);
    if (name.isDirectory()) walk(p);
    else if (name.name.endsWith('.js')) check(p, readFileSync(p, 'utf8'));
  }
}
console.log('API serverless:');
walk('api');

// ---------------------------------------------------------------------------
// 2) Módulos do painel (public/js/*.js) — sintaxe, lista e ordem de carregamento
// ---------------------------------------------------------------------------
console.log('public/js (módulos do painel):');
const html = readFileSync('public/index.html', 'utf8');
const noHtml = [...html.matchAll(/<script\s+defer\s+src="\/js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
const naPasta = readdirSync('public/js').filter((n) => n.endsWith('.js')).sort();
const sobrando = naPasta.filter((n) => !noHtml.includes(n));
const faltando = noHtml.filter((n) => !naPasta.includes(n));
if (sobrando.length) { console.error('  ✗ arquivo(s) em public/js sem <script> no index.html:', sobrando.join(', ')); fails += 1; }
if (faltando.length) { console.error('  ✗ <script> no index.html sem arquivo em public/js:', faltando.join(', ')); fails += 1; }
if (!noHtml.length) { console.error('  ✗ nenhum <script defer src="/js/…"> encontrado no index.html'); fails += 1; }

for (const n of noHtml) check(`public/js/${n}`, readFileSync(join('public/js', n), 'utf8'), '.cjs');

// Ordem de carregamento (parser real — acorn — em vez de regex).
const GLOBAIS = new Set(['window', 'document', 'location', 'navigator', 'localStorage', 'sessionStorage', 'console', 'fetch',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Promise',
  'JSON', 'Math', 'Date', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Map', 'Set', 'WeakMap', 'WeakSet', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'Intl', 'URL', 'URLSearchParams', 'Blob', 'FormData', 'Headers', 'Request', 'Response',
  'AbortController', 'history', 'performance', 'crypto', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'undefined', 'NaN', 'Infinity', 'globalThis', 'self', 'alert', 'confirm',
  'prompt', 'matchMedia', 'getComputedStyle', 'CustomEvent', 'Event', 'KeyboardEvent', 'MutationObserver',
  'IntersectionObserver', 'ResizeObserver', 'Notification', 'speechSynthesis', 'SpeechSynthesisUtterance',
  'webkitSpeechRecognition', 'SpeechRecognition', 'structuredClone', 'queueMicrotask', 'atob', 'btoa', 'TextEncoder',
  'TextDecoder', 'Symbol', 'Reflect', 'Proxy', 'Element', 'HTMLElement', 'Node', 'NodeList', 'DOMParser', 'XMLSerializer',
  'Image', 'Audio', 'open', 'close', 'print', 'scrollTo', 'scroll', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'screen',
  'caches', 'indexedDB', 'arguments', 'eval', 'Function', 'Uint8Array', 'ArrayBuffer', 'DataView', 'File', 'FileReader',
  'ClipboardItem', 'AudioContext', 'webkitAudioContext', 'MediaRecorder', 'getSelection', 'va', 'vaq']);

function verificaOrdem(arquivos) {
  const decl = new Map();                 // nome → {arquivo, ordem, linha, tipo}
  const asts = [];
  const problemas = [];
  arquivos.forEach((a, ordem) => {
    const src = readFileSync(join('public/js', a), 'utf8');
    let ast;
    try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true }); }
    catch (e) { problemas.push(`${a}: ${e.message}`); return; }
    asts.push({ a, ordem, ast });
    for (const st of ast.body) {
      const nomes = [];
      if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') nomes.push([st.id.name, st.type === 'FunctionDeclaration' ? 'function' : 'class']);
      else if (st.type === 'VariableDeclaration') {
        const colhe = (p) => { if (!p) return; if (p.type === 'Identifier') nomes.push([p.name, st.kind]);
          else if (p.type === 'ObjectPattern') p.properties.forEach((pr) => colhe(pr.value || pr.argument));
          else if (p.type === 'ArrayPattern') p.elements.forEach(colhe);
          else if (p.type === 'AssignmentPattern') colhe(p.left); else if (p.type === 'RestElement') colhe(p.argument); };
        st.declarations.forEach((d) => colhe(d.id));
      }
      for (const [n, tipo] of nomes) {
        if (decl.has(n)) { const d = decl.get(n); problemas.push(`declaração global duplicada: "${n}" em ${d.arquivo}:${d.linha} e ${a}:${st.loc.start.line}`); }
        decl.set(n, { arquivo: a, ordem, linha: st.loc.start.line, tipo });
      }
    }
  });
  // Identificadores lidos IMEDIATAMENTE por uma instrução (fora de corpos de função,
  // exceto IIFEs, que rodam na hora).
  function refsImediatas(no) {
    const saida = new Set();
    const filhos = (v, f) => { if (Array.isArray(v)) v.forEach((x) => anda(x, f)); else if (v && typeof v.type === 'string') anda(v, f); };
    function anda(n, dentro) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'Identifier') { if (!dentro) saida.add(n.name); return; }
      if (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration') {
        if (n._iife) for (const k of Object.keys(n)) { if (k !== 'id' && k !== 'params') filhos(n[k], false); }
        return;
      }
      if (n.type === 'CallExpression' && (n.callee.type === 'FunctionExpression' || n.callee.type === 'ArrowFunctionExpression')) n.callee._iife = true;
      if (n.type === 'MemberExpression') { anda(n.object, dentro); if (n.computed) anda(n.property, dentro); return; }
      if (n.type === 'Property' && !n.computed && !n.shorthand) { anda(n.value, dentro); return; }
      if (n.type === 'VariableDeclarator') { anda(n.init, dentro); return; }
      for (const k of Object.keys(n)) { if (k === 'loc' || k === 'type' || k === '_iife') continue; filhos(n[k], dentro); }
    }
    anda(no, false);
    return saida;
  }
  let executaveis = 0;
  for (const { a, ordem, ast } of asts) {
    for (const st of ast.body) {
      if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') continue;
      executaveis += 1;
      for (const n of refsImediatas(st)) {
        if (GLOBAIS.has(n)) continue;
        const d = decl.get(n);
        if (!d) continue;
        if (d.ordem > ordem) problemas.push(`${a}:${st.loc.start.line} executa no carregamento e usa "${n}", declarado só em ${d.arquivo} (carregado depois) — mova a instrução para depois ou a declaração para antes`);
        else if (d.ordem === ordem && d.linha > st.loc.end.line && d.tipo !== 'function') problemas.push(`${a}:${st.loc.start.line} usa "${n}" (${d.tipo}) antes da declaração na linha ${d.linha} (TDZ)`);
      }
    }
  }
  return { problemas, globais: decl.size, executaveis };
}
if (noHtml.length && !faltando.length) {
  const r = verificaOrdem(noHtml);
  if (r.problemas.length) { r.problemas.forEach((p) => console.error('  ✗', p)); fails += r.problemas.length; }
  else console.log(`  ✓ ordem de carregamento segura (${noHtml.length} arquivos, ${r.globais} globais, ${r.executaveis} instruções executadas no carregamento)`);
}

// ---------------------------------------------------------------------------
// 3) JS embutido nos HTML estáticos (cada bloco <script> sem atributos)
// ---------------------------------------------------------------------------
for (const arq of ['public/index.html', 'public/portal.html', 'public/voz.html']) {
  console.log(arq + ':');
  const src = readFileSync(arq, 'utf8');
  const blocos = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocos.length) { console.warn('  ! nenhum bloco <script> inline encontrado'); continue; }
  blocos.forEach((code, i) => check(`${arq} <script> #${i + 1} (${code.length} bytes)`, code));
}

if (fails) { console.error(`\n✗ ${fails} problema(s) de sintaxe/ordem.`); process.exit(1); }
console.log('\n✓ Sintaxe e ordem de carregamento OK.');
void basename;
