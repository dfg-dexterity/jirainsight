#!/usr/bin/env node
// Gate de sintaxe (sem build): valida os arquivos serverless e o JS embutido nos
// HTML estáticos. Roda em `npm run check` e na CI (.github/workflows/check.yml).
// Como public/index.html é um arquivo único e grande, um erro de sintaxe derruba
// a página inteira — este check pega isso antes do deploy.
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jicheck-'));
let fails = 0;

function check(label, code) {
  const f = join(dir, 'c' + Math.random().toString(36).slice(2) + '.mjs');
  writeFileSync(f, code);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); console.log('  ✓', label); }
  catch (e) { console.error('  ✗', label, '\n' + String((e.stderr || e.message || '')).trim()); fails += 1; }
}

// 1) Funções serverless (api/**/*.js)
function walk(d) {
  for (const name of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, name.name);
    if (name.isDirectory()) walk(p);
    else if (name.name.endsWith('.js')) check(p, readFileSync(p, 'utf8'));
  }
}
console.log('API serverless:');
walk('api');

// 2) JS embutido nos HTML estáticos (cada bloco <script> sem atributos)
for (const html of ['public/index.html', 'public/portal.html']) {
  console.log(html + ':');
  const src = readFileSync(html, 'utf8');
  const blocos = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocos.length) { console.warn('  ! nenhum bloco <script> inline encontrado'); continue; }
  blocos.forEach((code, i) => check(`${html} <script> #${i + 1} (${code.length} bytes)`, code));
}

if (fails) { console.error(`\n✗ ${fails} arquivo(s) com erro de sintaxe.`); process.exit(1); }
console.log('\n✓ Sintaxe OK.');
