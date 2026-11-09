#!/usr/bin/env node
// 🍎 Gera as telas de abertura do iOS/iPadOS (apple-touch-startup-image) e o badge das notificações.
// Roda À MÃO (precisa do Chromium do Playwright) — como o scripts/mobile-audit.mjs; o resultado fica commitado:
//   public/icons/splash/<w>x<h>[-dark].png   (w×h em PIXELS do aparelho; paisagem = dimensões trocadas)
//   public/icons/badge-96.png                (logo branco sobre transparente, para o badge do push)
// Determinístico: mesmo logo (public/logo.svg), mesmas cores, sem relógio. Saída: o bloco de <link> para o index.html.
//   node scripts/gera-splash.mjs            # grava os PNGs e imprime os <link>
//   node scripts/gera-splash.mjs --links    # só imprime os <link> (não abre o navegador)
// Env: PLAYWRIGHT (caminho do módulo, se não achar `playwright`) · CHROMIUM (executável).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Aparelhos (largura × altura em px CSS, em pé; dpr) — §2.4 do plano. iPad: retrato E paisagem; iPhone: só em pé.
export const APARELHOS = [
  { nome: 'iPad mini 6', w: 744, h: 1133, dpr: 2, paisagem: true },
  { nome: 'iPad 9ª', w: 810, h: 1080, dpr: 2, paisagem: true },
  { nome: 'iPad 10ª / Air 11', w: 820, h: 1180, dpr: 2, paisagem: true },
  { nome: 'iPad Pro 11', w: 834, h: 1194, dpr: 2, paisagem: true },
  { nome: 'iPad Pro 11 (M4)', w: 834, h: 1210, dpr: 2, paisagem: true },
  { nome: 'iPad Pro 12,9', w: 1024, h: 1366, dpr: 2, paisagem: true },
  { nome: 'iPad Pro 13 (M4)', w: 1032, h: 1376, dpr: 2, paisagem: true },
  { nome: 'iPhone 390', w: 390, h: 844, dpr: 3, paisagem: false },
  { nome: 'iPhone 393', w: 393, h: 852, dpr: 3, paisagem: false },
  { nome: 'iPhone 430', w: 430, h: 932, dpr: 3, paisagem: false },
];
const TEMAS = { claro: { fundo: '#F5F6F7', grafite: '#4D4D4D', texto: '#2B2B2B', sub: '#5E6B76' },
  escuro: { fundo: '#0E1726', grafite: '#D7DDE6', texto: '#E8ECF2', sub: '#93A1B3' } };

// Todas as combinações (arquivo, media do <link>), na ordem estável: aparelho → orientação → claro/escuro.
export function combinacoes() {
  const out = [];
  for (const a of APARELHOS) {
    for (const ori of a.paisagem ? ['portrait', 'landscape'] : ['portrait']) {
      for (const esc of [false, true]) {
        const [cw, ch] = ori === 'portrait' ? [a.w, a.h] : [a.h, a.w];
        out.push({ ap: a, ori, escuro: esc, cw, ch, pw: cw * a.dpr, ph: ch * a.dpr,
          arq: `${cw * a.dpr}x${ch * a.dpr}${esc ? '-dark' : ''}.png`,
          media: `(device-width: ${a.w}px) and (device-height: ${a.h}px) and (-webkit-device-pixel-ratio: ${a.dpr}) and (orientation: ${ori})${esc ? ' and (prefers-color-scheme: dark)' : ''}` });
      }
    }
  }
  return out;
}
export function linksHtml() {
  return combinacoes().map((c) => `<link rel="apple-touch-startup-image" href="/icons/splash/${c.arq}" media="${c.media}">`).join('\n');
}

const logoSvg = (grafite) => readFileSync(path.join(RAIZ, 'public/logo.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/fill="#4D4D4D"/g, `fill="${grafite}"`).replace(/<svg /, '<svg width="100%" height="100%" ');
const pagina = (c) => {
  const t = c.escuro ? TEMAS.escuro : TEMAS.claro; const lado = Math.round(Math.min(c.cw, c.ch) * 0.2);
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${c.cw}px;height:${c.ch}px;background:${t.fundo};overflow:hidden}
.c{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(lado * 0.16)}px;
font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;padding-bottom:6%;box-sizing:border-box}
.l{width:${lado}px;height:${lado}px}.n{font-size:${Math.round(lado * 0.22)}px;font-weight:700;color:${t.texto};letter-spacing:.2px}
.s{font-size:${Math.round(lado * 0.1)}px;color:${t.sub};margin-top:-${Math.round(lado * 0.08)}px}</style>
<div class="c"><div class="l">${logoSvg(t.grafite)}</div><div class="n">Dexterity Hub</div><div class="s">Jira + Clockwork + Odoo</div></div>`;
};
const paginaBadge = () => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:96px;height:96px;background:transparent}.l{width:96px;height:96px;padding:8px;box-sizing:border-box}</style>
<div class="l">${logoSvg('#fff').replace(/fill="#009994"/g, 'fill="#fff"')}</div>`;

if (process.argv.includes('--links')) { console.log(linksHtml()); process.exit(0); }

const require = createRequire(import.meta.url);
let pw; try { pw = require(process.env.PLAYWRIGHT || 'playwright'); } catch (e) { console.error('Playwright não encontrado (defina PLAYWRIGHT=/caminho/do/modulo).'); process.exit(2); }
mkdirSync(path.join(RAIZ, 'public/icons/splash'), { recursive: true });
const nav = await pw.chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let total = 0;
for (const c of combinacoes()) {
  const ctx = await nav.newContext({ viewport: { width: c.cw, height: c.ch }, deviceScaleFactor: c.ap.dpr });
  const p = await ctx.newPage(); await p.setContent(pagina(c));
  const buf = await p.screenshot({ type: 'png', omitBackground: false });
  writeFileSync(path.join(RAIZ, 'public/icons/splash', c.arq), buf); total += buf.length; await ctx.close();
}
{ const ctx = await nav.newContext({ viewport: { width: 96, height: 96 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); await p.setContent(paginaBadge());
  writeFileSync(path.join(RAIZ, 'public/icons/badge-96.png'), await p.screenshot({ type: 'png', omitBackground: true })); await ctx.close(); }
await nav.close();
console.error(`gera-splash: ${combinacoes().length} telas de abertura (${(total / 1024).toFixed(0)} KB) + badge-96.png (${statSync(path.join(RAIZ, 'public/icons/badge-96.png')).size} B)`);
console.log(linksHtml());
