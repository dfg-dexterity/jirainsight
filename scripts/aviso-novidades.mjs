#!/usr/bin/env node
// 📣 Publica no Teams as ✨ NOVIDADES que entraram NESTE merge (acordo do CLAUDE.md:
// "a cada melhoria publicada, publicar um aviso no canal Avisos Gerais").
//
// Antes disso o aviso era manual: alguém montava o curl e lembrava de rodar — e por
// isso três entregas seguidas ficaram sem anúncio. Agora o GitHub Actions chama este
// script a cada push na main (.github/workflows/novidades-teams.yml).
//
// COMO ELE SABE O QUE É NOVO, sem guardar estado em lugar nenhum: compara o
// 05-novidades-roadmap.js do commit atual com o do commit ANTERIOR (git show). O que
// aparece agora e não existia antes é o que vai para o cartão. Consequências boas:
//  · commit que não mexe nas Novidades (correção, refactor, doc) não manda nada;
//  · reverter a novidade desfaz o anúncio do próximo merge;
//  · rodar duas vezes o mesmo commit manda a mesma coisa — nunca o histórico inteiro.
//
// Uso:
//   node scripts/aviso-novidades.mjs --dry     # mostra o que enviaria, não envia
//   node scripts/aviso-novidades.mjs           # envia
// Variáveis: TEAMS_URL (padrão https://jirainsight.vercel.app/api/teams)
//            CRON_SECRET (opcional; se a Vercel exigir, vai como Bearer)
//            BASE_REF (commit de comparação; padrão HEAD~1)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ARQ = 'public/js/05-novidades-roadmap.js';
const DRY = process.argv.includes('--dry');
const URL_TEAMS = process.env.TEAMS_URL || 'https://jirainsight.vercel.app/api/teams';
const LINK_APP = process.env.APP_URL || 'https://jirainsight.vercel.app';
const MAX_LINHAS = 6;        // o cartão fica ilegível com mais que isso
const MAX_CHARS = 300;       // por linha

// Lê NOVIDADES e NOV_VER de um conteúdo do arquivo (o mesmo parser do gate de entrega:
// o array é literal, então dá para avaliá-lo isoladamente sem carregar o app).
function leNovidades(src) {
  if (!src) return { ver: '', itens: [] };
  const mArr = src.match(/const NOVIDADES\s*=\s*(\[[\s\S]*?\n\]);/);
  const mVer = src.match(/const NOV_VER\s*=\s*'([^']+)'/);
  let itens = [];
  if (mArr) {
    try { itens = JSON.parse(mArr[1].replace(/,(\s*\])/g, '$1').replace(/'/g, '"')); }
    catch (e) {
      // As novidades usam aspas simples e podem conter " no texto — o caminho seguro
      // é avaliar o literal, que é dado nosso, versionado e sem interpolação.
      try { itens = new Function(`return ${mArr[1]}`)(); } catch (e2) { itens = []; }
    }
  }
  return { ver: (mVer && mVer[1]) || '', itens: Array.isArray(itens) ? itens : [] };
}

// Lê o arquivo num commit, separando DOIS casos que não podem ser confundidos:
//  · o commit não está neste clone (checkout raso) → ERRO. Tratar isso como "não havia
//    nada antes" publicaria o histórico INTEIRO no canal (159 novidades, na prática);
//  · o commit existe e o arquivo ainda não existia nele → legítimo: tudo é novo.
// Foi um review da Vercel no PR #182 que apontou o primeiro caso, com fetch-depth: 2.
function gitShow(ref) {
  try { execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], { stdio: 'ignore' }); }
  catch (e) {
    return { erro: `o commit "${ref}" não está neste clone — um checkout raso não o tem. `
      + 'Use fetch-depth: 0 no workflow (ou um ref que exista aqui).' };
  }
  try { return { src: execFileSync('git', ['show', `${ref}:${ARQ}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }; }
  catch (e) { return { src: '' } ; }
}

// HTML das novidades → texto do cartão. O Adaptive Card aceita markdown simples.
function paraTexto(html) {
  return String(html || '')
    .replace(/<\/?b>/g, '**').replace(/<\/?strong>/g, '**')
    .replace(/<code>([^<]*)<\/code>/g, '`$1`')
    .replace(/<\/?i>|<\/?em>/g, '_')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
// O texto de uma novidade é um parágrafo longo, e a PRIMEIRA FRASE já é o resumo (é
// assim que elas são escritas: "🔐 Área do cliente: cada pessoa entra com e-mail e
// senha…"). Então o cartão leva frases inteiras enquanto couberem — nunca um corte no
// meio de uma palavra, que foi o que a primeira versão fazia.
const MIN_CHARS = 60;
function resume(txt) {
  if (txt.length <= MAX_CHARS) return txt;
  const frases = txt.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const f of frases) {
    if (out && (`${out} ${f}`).length > MAX_CHARS) break;
    out = out ? `${out} ${f}` : f;
    if (out.length >= MIN_CHARS) break;   // uma frase que já diz o recado basta
  }
  if (!out) out = txt;                    // parágrafo sem pontuação: cai no corte abaixo
  if (out.length > MAX_CHARS) {           // frase única gigante: corta no último espaço
    const c = out.slice(0, MAX_CHARS);
    out = `${c.slice(0, c.lastIndexOf(' ')).trimEnd()}…`;
  }
  return out;
}

const atual = leNovidades(readFileSync(ARQ, 'utf8'));
const base = gitShow(process.env.BASE_REF || 'HEAD~1');
// Sem base confiável não se publica nada: o modo de falha seguro aqui é ficar calado,
// nunca mandar o histórico todo para o canal da empresa.
if (base.erro) { console.error(`✗ Não consigo saber o que é novo: ${base.erro}`); process.exit(1); }
const anterior = leNovidades(base.src);

if (!atual.itens.length) { console.log('Sem NOVIDADES no arquivo — nada a anunciar.'); process.exit(0); }
if (anterior.ver && anterior.ver === atual.ver) {
  console.log(`NOV_VER não mudou (${atual.ver}) — este merge não trouxe novidade. Nada enviado.`);
  process.exit(0);
}

// Novo = o que não existia no commit anterior (compara pelo par data+texto).
const antes = new Set(anterior.itens.map((x) => `${x[0]}|${x[1]}`));
const novas = atual.itens.filter((x) => !antes.has(`${x[0]}|${x[1]}`));
if (!novas.length) { console.log('Nenhuma novidade nova em relação ao commit anterior. Nada enviado.'); process.exit(0); }

const linhas = novas.slice(0, MAX_LINHAS).map((x) => resume(paraTexto(x[1])));
const sobra = novas.length - linhas.length;
if (sobra > 0) linhas.push(`… e mais ${sobra} melhoria(s) — veja a lista completa em ⋯ Mais › ✨ Novidades.`);

const corpo = {
  aviso: {
    titulo: novas.length === 1 ? '✨ Novidade no Dexterity Hub' : `✨ ${novas.length} novidades no Dexterity Hub`,
    linhas,
    link: LINK_APP,
  },
};

if (DRY) {
  console.log(`(dry) ${novas.length} novidade(s) desde ${anterior.ver || '(sem base)'} → ${atual.ver}`);
  console.log(JSON.stringify(corpo, null, 2));
  process.exit(0);
}

const headers = { 'Content-Type': 'application/json' };
if (process.env.CRON_SECRET) headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
const r = await fetch(URL_TEAMS, { method: 'POST', headers, body: JSON.stringify(corpo) });
const txt = await r.text();
console.log(`POST ${URL_TEAMS} → HTTP ${r.status}`);
console.log(txt.slice(0, 600));
// O endpoint responde 200 com {enviado:false, erro} quando o webhook não está configurado:
// isso é falha de verdade para o workflow, senão o aviso "some" sem ninguém perceber.
let ok = r.ok;
try { const j = JSON.parse(txt); if (j && j.enviado === false) ok = false; } catch (e) {}
if (!ok) { console.error('✗ O aviso NÃO foi publicado.'); process.exit(1); }
console.log(`✓ ${novas.length} novidade(s) publicada(s) no Teams.`);
