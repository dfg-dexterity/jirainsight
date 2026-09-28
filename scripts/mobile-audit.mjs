// 📱 Auditoria mobile do Dexterity Hub — emula um celular DE VERDADE (isMobile + touch + DPR 3,
// user-agent de iPhone) e mede, tela a tela, o que faz o iPhone encolher a página ou atrapalhar o dedo:
//   · "ofens": elementos que passam da borda direita e não estão dentro de um contêiner que os
//     recorta (overflow-x auto/hidden/scroll/clip). A guarda .wrap{overflow-x:clip} do mobile.css
//     NÃO conta como recorte: ela esconde o sintoma, a auditoria continua apontando a causa.
//     É esse tipo de elemento que fazia o Safari dar zoom-out na página inteira. META: 0.
//   · alvos de toque < 44px (e < 32px, os graves) em botões/links/campos visíveis
//   · texto visível com fonte < 12px
//   · campos com fonte < 16px (o iOS dá zoom ao focar)
//
// Não roda na CI (precisa de Playwright + Chromium e de um servidor com dados). Uso local:
//   node scripts/mobile-audit.mjs <base-url> [larguras=393,360] [vistas=todas] [dirShots]
//   ex.: node scripts/mobile-audit.mjs http://localhost:3000 393 acoes,apontar shots/
//   env: OUT=arquivo.json (JSON completo, com os ofensores) · PLAYWRIGHT=<módulo> (padrão "playwright")
//        CHROMIUM=<executável> (opcional) · IDENT='{"nome":…,"email":…,"accountId":…}' (identidade de teste)
import { mkdirSync, writeFileSync } from 'node:fs';
const pw = (await import(process.env.PLAYWRIGHT || 'playwright')).default;

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const LARGURAS = (process.argv[3] || '393,360').split(',').map(Number);
const TODAS = ['acoes','inbox','mencoes','apontar','rateio','meudia','agenda','minhasemana','planrel','prioridades','roadmap',
  'visao','resumo','timesheet','ranking','tickets','qualidade','audit','analytics','relatorios','metricas','rentab','meutempo',
  'cronograma','projetos','planejar','ondecrio','reclassificar','reuvinc','gestao','alertas','ams','receita','controladoria',
  'admin','parcerias','config','uso'];
const VISTAS = process.argv[4] && process.argv[4] !== 'todas' ? process.argv[4].split(',') : TODAS;
const SHOTS = process.argv[5] || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const ID = process.env.IDENT ? JSON.parse(process.env.IDENT) : { nome: 'Teste Mobile', email: 'teste@dexterityit.com.br', token: 'x', accountId: 'a-teste' };

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
  // Um elemento só empurra a PÁGINA se nenhum ancestral o recorta na horizontal.
  const recortado = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      // a guarda .wrap{overflow-x:clip} do mobile.css NÃO conta: ela esconde o sintoma,
      // e a auditoria precisa continuar apontando a causa (conteúdo cortado na borda)
      if (p.classList.contains('wrap')) continue;
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
      if (getComputedStyle(p).position === 'fixed') return true;
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
  const conteudo = document.getElementById('conteudo') || document.body;
  const todos = [...document.body.querySelectorAll('*')];
  // ---- overflow ----
  const fora = todos.filter((el) => {
    if (!visivel(el)) return false;
    const r = el.getBoundingClientRect();
    return r.right > vw + 1 && !recortado(el) && getComputedStyle(el).position !== 'fixed';
  });
  const foraSet = new Set(fora);
  // folhas: nenhum filho também está fora (é onde está a causa)
  const folhas = fora.filter((el) => ![...el.children].some((c) => foraSet.has(c)));
  const ofensores = folhas.map((el) => {
    const r = el.getBoundingClientRect();
    return { el: caminho(el), direita: Math.round(r.right), largura: Math.round(r.width), txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) };
  }).sort((a, b) => b.direita - a.direita);
  // ---- alvos de toque ----
  const tocaveis = [...conteudo.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary, [data-hx-goto], [data-goto]')]
    .filter(visivel);
  const pequenos = tocaveis.map((el) => { const r = el.getBoundingClientRect(); return { el: nome(el), w: Math.round(r.width), h: Math.round(r.height), txt: (el.textContent || el.value || '').trim().slice(0, 30) }; })
    .filter((x) => x.h < 44 || x.w < 44);
  const graves = pequenos.filter((x) => x.h < 32 || x.w < 32);
  // ---- fontes ----
  const textos = [...conteudo.querySelectorAll('*')].filter((el) => {
    if (!visivel(el)) return false;
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  });
  const miudos = textos.map((el) => ({ el: nome(el), fs: parseFloat(getComputedStyle(el).fontSize), txt: el.textContent.trim().slice(0, 30) })).filter((x) => x.fs < 12);
  const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')]
    .filter(visivel).map((el) => ({ el: nome(el), fs: parseFloat(getComputedStyle(el).fontSize) })).filter((x) => x.fs < 16);
  return {
    vw, sw, overflow: sw - vw,
    ofensores: ofensores.slice(0, 12), nOfensores: ofensores.length,
    toques: { total: tocaveis.length, abaixo44: pequenos.length, abaixo32: graves.length, exemplos: graves.slice(0, 8) },
    fontes: { abaixo12: miudos.length, exemplos: miudos.slice(0, 6) },
    inputsZoom: { n: inputs.length, exemplos: inputs.slice(0, 5) },
    altura: document.documentElement.scrollHeight,
  };
}

const b = await pw.chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const saida = [];
for (const largura of LARGURAS) {
  const ctx = await b.newContext({
    viewport: { width: largura, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript((id) => { try { localStorage.setItem('dexterity_apontar_id_v1', JSON.stringify(id)); localStorage.removeItem('dexterity_insights_cfg_v1'); } catch (e) {} }, ID);
  for (const v of VISTAS) {
    const p = await ctx.newPage(); const erros = [];
    p.on('pageerror', (e) => erros.push(String(e.message || e).slice(0, 160)));
    try {
      await p.goto(`${BASE}/?v=${v}`, { waitUntil: 'load', timeout: 30000 });
      await p.waitForTimeout(2600);   // dados das fixtures chegam
      const m = await p.evaluate(mede);
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/${v}-${largura}.png`, fullPage: false });
      saida.push({ vista: v, largura, ...m, erros });
    } catch (e) { saida.push({ vista: v, largura, falha: String(e.message || e).slice(0, 200) }); }
    await p.close();
  }
  await ctx.close();
}
await b.close();
const arq = process.env.OUT || '';
if (arq) writeFileSync(arq, JSON.stringify(saida, null, 1));
// Resumo legível
for (const r of saida) {
  if (r.falha) { console.log(`✗ ${r.vista}@${r.largura} FALHOU: ${r.falha}`); continue; }
  // com a guarda do mobile.css o documento não rola mais para o lado: quem manda é "ofens"
  const flag = (r.overflow > 1 || r.nOfensores > 0) ? '⚠' : '✓';
  console.log(`${flag} ${r.vista.padEnd(14)}@${r.largura} overflow=${String(r.overflow).padStart(4)}px ofens=${String(r.nOfensores).padStart(3)} toque<44=${String(r.toques.abaixo44).padStart(3)}/${r.toques.total} <32=${String(r.toques.abaixo32).padStart(3)} fonte<12=${String(r.fontes.abaixo12).padStart(3)} inputZoom=${r.inputsZoom.n}${r.erros.length ? ' JS-ERR' : ''}`);
}
// sai com erro se alguma tela tem conteúdo cortado na borda (dá para usar como gate local)
process.exitCode = saida.some((r) => r.falha || r.overflow > 1 || r.nOfensores > 0) ? 1 : 0;
