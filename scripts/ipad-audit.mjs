// 🍎 Auditoria iPad do Dexterity Hub — emula um iPad DE VERDADE no Chromium (viewport + isMobile + touch + DPR 2 + user-agent
// de iPad; não há WebKit neste ambiente, então o que só o Safari mostra fica para o teste manual no aparelho) e mede, tela a tela:
//   · ofens        elementos que passam da borda direita e não estão num contêiner que os recorta (a guarda
//                  .wrap{overflow-x:clip} NÃO conta: ela esconde o sintoma, a auditoria aponta a causa). META: 0.
//   · alvos44      controles primários (button, a, [role=button], input, select, .navtab, .navg-menu button, .aba) com
//                  menos de 44 px de largura ou de altura; alvos32 = os graves (< 32 px). Link no meio de texto (inline)
//                  não conta; checkbox/radio contam pelo <label> que os envolve.
//   · fontes12     texto visível com fonte < 12 px
//   · campos16     campos com fonte < 16 px (o iOS dá zoom ao focar)
//   · espacoMorto  grade de cartões (.cards/.grid/.dsh-tiles/.vg-hero/.sm) com 1 coluna e largura > 900 px
//   · scrollX      a PÁGINA rola para o lado (scrollWidth > clientWidth)
//   · erros        pageerror e console.error
//
// Não roda na CI (precisa de Playwright + Chromium e de um servidor com dados). Uso:
//   node scripts/ipad-audit.mjs <base-url> [presets=todos] [vistas=todas] [dirShots]
//   presets  (separados por vírgula): ipad-pro-11 (834×1194 e 1194×834) · ipad-12-9 (1024×1366 e 1366×1024) · ipad-mini (744×1133)
//            · split-2-3 (678×1024) · split-1-2 (507×1024) · todos. Também aceita LxA solto (ex.: 820x1180).
//   vistas   slugs separados por vírgula, ou "todas" (as 52 de VISTAS em public/js/29-url-topo.js, lidas do arquivo).
//   env: OUT=arquivo.json (um registro por preset×tamanho×vista: {preset, vista, w, h, orient, ofens[], alvos44[], alvos32[],
//        fontes12[], campos16[], espacoMorto[], scrollX, erros[], falha?}) · IDENT='{"nome":…,"email":…,"token":…,"accountId":…}'
//        (padrão: ANA da fixture servidor-ipad.mjs) · CONC=4 (páginas em paralelo) · ESPERA=1200 (ms após o carregamento)
//        STRICT=1 (sai com 1 se alguma meta furar) · PLAYWRIGHT=<módulo> · CHROMIUM=<executável> · REPO=<checkout que tem public/js>
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
// Playwright: import ESM e, se o módulo só existe no NODE_PATH (CommonJS), cai no require.
const pw = await (async () => { const nome = process.env.PLAYWRIGHT || 'playwright'; try { return (await import(nome)).default; } catch (e) { return createRequire(import.meta.url)(nome); } })();

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const PRESETS = {
  'ipad-pro-11': [[834, 1194, 'retrato'], [1194, 834, 'paisagem']],
  'ipad-12-9': [[1024, 1366, 'retrato'], [1366, 1024, 'paisagem']],
  'ipad-mini': [[744, 1133, 'retrato']],
  'split-2-3': [[678, 1024, 'retrato']],
  'split-1-2': [[507, 1024, 'retrato']],
};
PRESETS['ipad-12.9'] = PRESETS['ipad-12-9'];
const escolhidos = !process.argv[3] || process.argv[3] === 'todos' ? ['ipad-pro-11', 'ipad-12-9', 'ipad-mini', 'split-2-3', 'split-1-2'] : process.argv[3].split(',');
const TAMANHOS = [];
for (const nome of escolhidos) {
  if (PRESETS[nome]) PRESETS[nome].forEach(([w, h, orient]) => TAMANHOS.push({ preset: nome === 'ipad-12.9' ? 'ipad-12-9' : nome, w, h, orient }));
  else { const m = /^(\d+)x(\d+)$/.exec(nome); if (m) TAMANHOS.push({ preset: nome, w: +m[1], h: +m[2], orient: +m[1] > +m[2] ? 'paisagem' : 'retrato' }); else { console.error('preset desconhecido: ' + nome); process.exit(2); } }
}
// As 52 vistas: lidas do 29-url-topo.js do checkout (REPO), para a auditoria nunca ficar atrás do app.
const REPO = process.env.REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vistasDoApp = () => { const src = readFileSync(path.join(REPO, 'public/js/29-url-topo.js'), 'utf8'); const m = /const VISTAS=\[([^\]]*)\]/.exec(src); return m ? [...m[1].matchAll(/'([a-z0-9]+)'/g)].map((x) => x[1]) : []; };
const VISTAS = process.argv[4] && process.argv[4] !== 'todas' ? process.argv[4].split(',') : vistasDoApp();
const SHOTS = process.argv[5] || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const ID = process.env.IDENT ? JSON.parse(process.env.IDENT) : { nome: 'Ana Lima', email: 'ana@dexterityit.com.br', token: 'x', accountId: 'acc-ana' };
const CONC = Math.max(1, Number(process.env.CONC) || 4);
const ESPERA = Number(process.env.ESPERA) || 1200;
// telas que pedem um parâmetro próprio para abrir com dados
const EXTRA = { statusrep: '&srproj=ACME', gp: '&gproj=ACME', portal: '&pproj=ACME' };
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// Roda DENTRO da página: devolve as medidas.
function mede() {
  const vw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  const visivel = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const recortado = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (p.classList.contains('wrap')) continue;
      const cs = getComputedStyle(p); const ox = cs.overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
      if (cs.position === 'fixed') return true;
    }
    return false;
  };
  const nome = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cl = [...el.classList].slice(0, 3).join('.');
    if (cl) s += '.' + cl;
    const da = [...el.attributes].map((a) => a.name).find((n) => n.startsWith('data-'));
    if (da) s += `[${da}]`;
    return s;
  };
  const caminho = (el) => { const out = []; for (let e = el, i = 0; e && i < 4 && e !== document.body; e = e.parentElement, i++) out.unshift(nome(e)); return out.join(' > '); };
  const todos = [...document.body.querySelectorAll('*')].filter((el) => !/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|SVG|PATH)$/i.test(el.tagName) && !el.closest('svg'));
  // ---- ofens (transbordo) ----
  const fora = todos.filter((el) => { if (!visivel(el)) return false; const r = el.getBoundingClientRect(); return r.right > vw + 1 && !recortado(el) && getComputedStyle(el).position !== 'fixed'; });
  const foraSet = new Set(fora);
  const ofens = fora.filter((el) => ![...el.children].some((c) => foraSet.has(c))).map((el) => {
    const r = el.getBoundingClientRect();
    return { el: caminho(el), direita: Math.round(r.right), largura: Math.round(r.width), txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) };
  }).sort((a, b) => b.direita - a.direita);
  // ---- alvos de toque (controles primários) ----
  const SEL = 'button, a[href], a[data-goto], [role=button], input:not([type=hidden]), select, .navtab, .navg-menu button, .aba, summary';
  const prim = [...document.body.querySelectorAll(SEL)].filter(visivel).filter((el) => {
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return false;   // link no meio de texto (isento)
    if (el.closest('.tela-erro') && false) return false;
    return true;
  });
  const caixa = (el) => {
    const t = (el.getAttribute('type') || '').toLowerCase();
    if ((t === 'checkbox' || t === 'radio') && el.closest('label')) return el.closest('label').getBoundingClientRect();
    return el.getBoundingClientRect();
  };
  const medidos = prim.map((el) => { const r = caixa(el); return { el: nome(el), w: Math.round(r.width), h: Math.round(r.height), txt: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30) }; });
  const alvos44 = medidos.filter((x) => x.h < 44 || x.w < 44);
  const alvos32 = medidos.filter((x) => x.h < 32 || x.w < 32);
  // ---- fontes ----
  const textos = todos.filter((el) => visivel(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  const fontes12 = textos.map((el) => ({ el: nome(el), fs: parseFloat(getComputedStyle(el).fontSize), txt: el.textContent.trim().slice(0, 30) })).filter((x) => x.fs < 12);
  const campos16 = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), select, textarea')]
    .filter(visivel).map((el) => ({ el: nome(el), fs: parseFloat(getComputedStyle(el).fontSize) })).filter((x) => x.fs < 16);
  // ---- espaço morto: grade de cartões com 1 coluna num conteúdo largo ----
  const espacoMorto = [...document.querySelectorAll('.cards, .grid, .dsh-tiles, .vg-hero, .sm')].filter(visivel).map((el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (!/grid/.test(cs.display) || r.width <= 900) return null;
    const cols = cs.gridTemplateColumns.split(' ').filter((x) => x && x !== 'none').length;
    return cols <= 1 ? { el: nome(el), largura: Math.round(r.width), colunas: cols, filhos: el.children.length } : null;
  }).filter(Boolean);
  return { vw, sw, scrollX: sw > vw + 1, ofens: ofens.slice(0, 12), nOfens: ofens.length, nControles: medidos.length, alvos44: alvos44.slice(0, 40), nAlvos44: alvos44.length,
    alvos32: alvos32.slice(0, 40), nAlvos32: alvos32.length, fontes12: fontes12.slice(0, 20), nFontes12: fontes12.length, campos16: campos16.slice(0, 20), nCampos16: campos16.length,
    espacoMorto, modo: document.body.className.slice(0, 80), altura: document.documentElement.scrollHeight };
}

const b = await pw.chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const saida = [];
for (const tam of TAMANHOS) {
  const ctx = await b.newContext({ viewport: { width: tam.w, height: tam.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD });
  await ctx.addInitScript((id) => {
    try { localStorage.setItem('dexterity_apontar_id_v1', JSON.stringify(id)); localStorage.removeItem('dexterity_insights_cfg_v1'); localStorage.setItem('jirainsight_tour_prioridades', '1'); } catch (e) {}
  }, ID);
  const fila = [...VISTAS];
  const trab = async () => {
    for (let v = fila.shift(); v; v = fila.shift()) {
      const p = await ctx.newPage(); const erros = [];
      const reg = { preset: tam.preset, vista: v, w: tam.w, h: tam.h, orient: tam.orient };
      p.on('pageerror', (e) => erros.push('pageerror: ' + String(e.message || e).slice(0, 160)));
      // recurso EXTERNO que o ambiente não alcança (fontes/analytics atrás do proxy) não é erro do app: conta à parte (redeExterna)
      p.on('console', (m) => { if (m.type() !== 'error') return; const t = m.text(); if (/net::ERR_(TUNNEL|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|PROXY|CONNECTION)/.test(t)) reg.redeExterna = (reg.redeExterna || 0) + 1; else erros.push('console: ' + t.slice(0, 160)); });
      try {
        await p.goto(`${BASE}/?v=${v}${EXTRA[v] || ''}`, { waitUntil: 'load', timeout: 30000 });
        await p.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        await p.waitForTimeout(ESPERA);   // dados da fixture chegam e a tela se desenha
        const m = await p.evaluate(mede);
        if (SHOTS) await p.screenshot({ path: `${SHOTS}/${v}-${tam.w}x${tam.h}.png`, fullPage: false });
        Object.assign(reg, m, { erros });
      } catch (e) { Object.assign(reg, { falha: String(e.message || e).slice(0, 200), erros }); }
      saida.push(reg);
      await p.close();
    }
  };
  await Promise.all(Array.from({ length: CONC }, trab));
  await ctx.close();
}
await b.close();
const ordem = (r) => VISTAS.indexOf(r.vista);
saida.sort((a, c) => (a.w - c.w) || (a.h - c.h) || (ordem(a) - ordem(c)));
const arq = process.env.OUT || '';
if (arq) writeFileSync(arq, JSON.stringify(saida, null, 1));

// ---- resumo legível ----
const pontos = (r) => r.falha ? 1e6 : (r.nOfens * 5 + (r.scrollX ? 20 : 0) + r.nAlvos32 + r.nAlvos44 * 0.25 + r.nFontes12 + r.nCampos16 + r.espacoMorto.length * 5 + r.erros.length * 5);
for (const r of saida) {
  if (r.falha) { console.log(`✗ ${r.preset} ${r.w}x${r.h} ${r.vista} FALHOU: ${r.falha}`); continue; }
  const furou = r.nOfens > 0 || r.scrollX || r.nAlvos44 > 0 || r.nFontes12 > 0 || r.nCampos16 > 0 || r.espacoMorto.length > 0 || r.erros.length > 0;
  console.log(`${furou ? '⚠' : '✓'} ${r.preset.padEnd(11)}${String(r.w).padStart(5)}x${String(r.h).padEnd(5)} ${r.vista.padEnd(13)} ofens=${String(r.nOfens).padStart(2)} scrollX=${r.scrollX ? 'S' : 'n'} alvo<44=${String(r.nAlvos44).padStart(3)}/${r.nControles} <32=${String(r.nAlvos32).padStart(3)} fonte<12=${String(r.nFontes12).padStart(3)} campo<16=${String(r.nCampos16).padStart(2)} morto=${r.espacoMorto.length} erros=${r.erros.length}`);
}
console.log('\n===== 10 piores por preset (tela × tamanho) =====');
for (const nome of [...new Set(saida.map((r) => r.preset + ' ' + r.w + 'x' + r.h))]) {
  const rs = saida.filter((r) => r.preset + ' ' + r.w + 'x' + r.h === nome);
  console.log(`\n-- ${nome} --`);
  rs.map((r) => ({ r, s: pontos(r) })).sort((a, c) => c.s - a.s).slice(0, 10).forEach(({ r, s }, i) => {
    if (r.falha) { console.log(`${i + 1}. ${r.vista}: FALHOU ${r.falha}`); return; }
    const pior = (r.ofens[0] && `ofensor ${r.ofens[0].el}`) || (r.alvos32[0] && `alvo ${r.alvos32[0].el} ${r.alvos32[0].w}x${r.alvos32[0].h}`) || (r.espacoMorto[0] && `morto ${r.espacoMorto[0].el}`) || (r.erros[0] || '');
    console.log(`${i + 1}. ${r.vista.padEnd(13)} pts=${String(Math.round(s)).padStart(4)} ofens=${r.nOfens} scrollX=${r.scrollX ? 'S' : 'n'} <44=${r.nAlvos44} <32=${r.nAlvos32} fonte=${r.nFontes12} campo=${r.nCampos16} morto=${r.espacoMorto.length} erros=${r.erros.length} | ${pior}`);
  });
}
const falhou = saida.some((r) => r.falha || r.nOfens > 0 || r.scrollX || r.erros.length);
console.log(`\nTOTAL ${saida.length} medições · ${saida.filter((r) => !r.falha && !(r.nOfens > 0 || r.scrollX || r.nAlvos44 > 0 || r.nFontes12 > 0 || r.nCampos16 > 0 || r.espacoMorto.length > 0 || r.erros.length > 0)).length} sem nenhum ponto`);
if (process.env.STRICT === '1') process.exitCode = falhou ? 1 : 0;
