#!/usr/bin/env node
// Imprime o corpo do POST /api/teams?tipo=roadmap-jira: { itens:[{id,s,t,d}] } lido do ROADMAP do app (mesmo parser da lib).
// Usado pela CI (.github/workflows/roadmap-notion.yml, job `jira`). ROADMAP_ARQ muda o arquivo (testes).
import { readFileSync } from 'node:fs';
import { leRoadmapApp } from '../api/_lib/roadmapJira.js';

const ARQ = process.env.ROADMAP_ARQ || 'public/js/05-novidades-roadmap.js';
try {
  process.stdout.write(JSON.stringify({ itens: leRoadmapApp(readFileSync(ARQ, 'utf8')) }));
} catch (e) { console.error('✗ roadmap-jira-payload:', e.message); process.exit(1); }
