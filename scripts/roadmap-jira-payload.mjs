#!/usr/bin/env node
// Imprime o corpo do POST /api/teams?tipo=roadmap-jira: { itens:[{id,s,t,d}], saidas:['R###'] } lido do ROADMAP do app (mesmo parser da lib).
// `saidas` = ids que estavam no ROADMAP de --antes REF (padrão HEAD^) e já não estão: é a ÚNICA lista de itens que podem virar Entregue/Cancelado
// no Jira (um item sem História no array e fora de `saidas` só gera aviso). Se o REF não existe (clone raso) `saidas` vai vazia — nada é encerrado.
// Usado pela CI (.github/workflows/roadmap-notion.yml, job `jira`). ROADMAP_ARQ muda o arquivo (testes).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { leRoadmapApp } from '../api/_lib/roadmapJira.js';

const ARQ = process.env.ROADMAP_ARQ || 'public/js/05-novidades-roadmap.js';
const i = process.argv.indexOf('--antes');
const ANTES = i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'HEAD^';
try {
  const itens = leRoadmapApp(readFileSync(ARQ, 'utf8'));
  let saidas = [];
  try {
    const antes = execFileSync('git', ['show', `${ANTES}:${ARQ}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    const agora = new Set(itens.map((x) => x.id));
    saidas = leRoadmapApp(antes).map((x) => x.id).filter((id) => !agora.has(id));
  } catch (e) { console.error(`::warning::roadmap-jira-payload: sem o ROADMAP de ${ANTES} — saidas vazia (nada será entregue/cancelado nesta rodada).`); }
  process.stdout.write(JSON.stringify({ itens, saidas }));
} catch (e) { console.error('✗ roadmap-jira-payload:', e.message); process.exit(1); }
