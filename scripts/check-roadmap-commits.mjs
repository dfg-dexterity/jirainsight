#!/usr/bin/env node
// Gate: TODO commit que mexe no app revisa o 🗺️ Roadmap.
// Pedido do usuário (2026-10-03): "de agora em diante sempre atualize o roadmap quando for fazer um commit".
//
// O check-entrega.mjs já garante que o roadmap não fica para trás da última NOVIDADE (por entrega).
// Este aqui olha COMMIT A COMMIT: cada commit do intervalo (o PR na CI; a branch × origin/main na
// máquina) que mexe em qualquer arquivo que não seja Markdown precisa mudar o array ROADMAP ou o
// carimbo ROADMAP_REV em public/js/05-novidades-roadmap.js. Revisou e nada mudou? Carimbe de novo:
// ROADMAP_REV aceita um sufixo para o mesmo dia ('2026-10-03.2', '.3'…).
//
// Só git e Node — sem dependência. Na CI o checkout precisa do histórico (fetch-depth: 0 no check.yml).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ARQ = 'public/js/05-novidades-roadmap.js';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim();
const tenta = (...a) => { try { return git(...a); } catch (e) { return null; } };

// Literal de `const NOME=<literal>;` (mesma leitura do check-entrega.mjs: respeita aspas, crases e escapes).
function literal(nome, src) {
  const i = src.indexOf(`const ${nome}=`);
  if (i < 0) return undefined;
  let p = i + `const ${nome}=`.length; const ini = p;
  let prof = 0; let aspa = ''; let escapa = false;
  for (; p < src.length; p += 1) {
    const c = src[p];
    if (escapa) { escapa = false; continue; }
    if (aspa) { if (c === '\\') escapa = true; else if (c === aspa) aspa = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { aspa = c; continue; }
    if (c === '[' || c === '{' || c === '(') prof += 1;
    else if (c === ']' || c === '}' || c === ')') prof -= 1;
    else if (c === ';' && prof === 0) break;
  }
  try { return new Function(`return (${src.slice(ini, p).trim()})`)(); } catch (e) { return undefined; }
}
// O que conta como "revisou o roadmap": a lista ou o carimbo mudou (as NOVIDADES sozinhas não contam).
const marca = (src) => (src == null ? null : JSON.stringify([literal('ROADMAP_REV', src), literal('ROADMAP', src)]));
// Só documentação em Markdown (README, CLAUDE.md…) dispensa a revisão; o resto do repositório pede.
const pedeRevisao = (f) => !/\.md$/i.test(f);

const naCI = !!process.env.CI;
if (tenta('rev-parse', '--is-inside-work-tree') !== 'true') {
  if (naCI) { console.error('✗ 🗺️ Roadmap por commit: não é um repositório git.'); process.exit(1); }
  console.log('🗺️ Roadmap por commit: ⚠ fora de um repositório git — conferência pulada.');
  process.exit(0);
}

// Base do intervalo: PR na CI → a branch de destino; push na CI → o "before" do evento;
// na máquina → origin/main (o que a branch tem a mais é o que vai virar PR).
let base = null; let origem = '';
const ev = process.env.GITHUB_EVENT_NAME || '';
if (process.env.GITHUB_BASE_REF) {
  base = tenta('merge-base', `origin/${process.env.GITHUB_BASE_REF}`, 'HEAD'); origem = `origin/${process.env.GITHUB_BASE_REF}`;
} else if (ev === 'push') {
  let antes = '';
  try { antes = (JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH || '', 'utf8')) || {}).before || ''; } catch (e) { /* sem evento */ }
  base = (antes && !/^0+$/.test(antes) && tenta('cat-file', '-e', `${antes}^{commit}`) !== null) ? antes : tenta('rev-parse', 'HEAD~1');
  origem = 'o push';
} else {
  base = tenta('merge-base', 'origin/main', 'HEAD'); origem = 'origin/main';
}
if (!base) {
  if (naCI) {
    console.error(`✗ 🗺️ Roadmap por commit: não achei a base (${origem || '?'}) — o checkout precisa do histórico (fetch-depth: 0).`);
    process.exit(1);
  }
  console.log(`🗺️ Roadmap por commit: ⚠ sem ${origem || 'base'} para comparar — conferência pulada (rode \`git fetch origin main\`).`);
  process.exit(0);
}

const commits = (tenta('rev-list', '--no-merges', '--reverse', `${base}..HEAD`) || '').split('\n').filter(Boolean);
const faltou = []; let conferidos = 0;
for (const c of commits) {
  const arqs = (tenta('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', c) || '').split('\n').filter(Boolean);
  if (!arqs.some(pedeRevisao)) continue;
  const antes = tenta('show', `${c}^:${ARQ}`); const depois = tenta('show', `${c}:${ARQ}`);
  if (antes === null || depois === null) continue;     // arquivo ainda não existia (histórico antigo)
  conferidos += 1;
  if (marca(antes) === marca(depois)) faltou.push(`${c.slice(0, 7)} «${tenta('log', '-1', '--format=%s', c) || ''}»`);
}

// Na máquina, avisa ANTES do commit: mudança no app ainda não commitada sem revisão do roadmap.
let aviso = '';
if (!naCI) {
  const sujos = (tenta('status', '--porcelain') || '').split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''));
  if (sujos.some(pedeRevisao)) {
    let atual = null; try { atual = readFileSync(ARQ, 'utf8'); } catch (e) { /* sem arquivo */ }
    if (marca(atual) === marca(tenta('show', `HEAD:${ARQ}`))) {
      aviso = `⚠ há mudanças no app ainda não commitadas e o 🗺️ Roadmap não foi revisado — antes do commit, revise o array ROADMAP em ${ARQ} e carimbe ROADMAP_REV (no mesmo dia: '.2', '.3'…).`;
    }
  }
}

if (faltou.length) {
  console.error([
    `✗ 🗺️ ROADMAP NÃO REVISADO EM ${faltou.length} COMMIT(S) (acordo de 2026-10-03: todo commit revisa o roadmap):`,
    ...faltou.map((x) => `     • ${x}`),
    `   Em cada commit que mexe no app, releia o array ROADMAP em ${ARQ} — tire o que foi entregue, mova o que`,
    '   mudou de estágio, acrescente o que surgiu — e carimbe ROADMAP_REV (no mesmo dia: \'AAAA-MM-DD.2\', \'.3\'…).',
    '   Para corrigir uma branch: um commit novo não conserta os anteriores — refaça o commit (git commit --amend /',
    '   rebase) ou junte tudo num commit só antes do PR.',
  ].join('\n'));
  if (aviso) console.error(aviso);
  process.exit(1);
}
console.log(`🗺️ Roadmap por commit: ✓ ${conferidos} commit(s) desde ${origem} mexendo no app, todos com o roadmap revisado`);
if (aviso) console.log(aviso);
