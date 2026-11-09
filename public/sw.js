// Service worker do PWA — POSTURA CONSERVADORA de propósito:
// rede primeiro em TUDO que importa (a página e os dados mudam a cada deploy);
// cache só dos estáticos imutáveis (ícones/manifest/logo) e como fallback offline.
//
// v2 (2026-09-06): o CSS e o JS do painel saíram do index.html para /css/*.css e
// /js/*.js (sem hash no nome — não há build). Eles seguem REDE PRIMEIRO (a Vercel
// responde 304 quando não mudaram), mas a última cópia boa fica guardada para o
// fallback offline funcionar de verdade: sem isso, a página cacheada abriria em
// branco por não achar os scripts.
//
// v3 (2026-11-09, camada iPad):
//  1) OFFLINE DE LEITURA — GET de uma lista FECHADA de /api/ (DADOS_ROTAS): rede primeiro; resposta 2xx < 2 MB vira cópia em
//     'ji-dados-v1'; se a REDE falhar (TypeError) devolve a cópia com o cabeçalho X-JI-Offline: <ISO de quando foi guardada>.
//     A cópia é POR PESSOA E POR CREDENCIAL: a chave leva o sha16 do PAR e-mail|token dos cabeçalhos x-jira-email/x-jira-token
//     (só o hash truncado entra no nome da entrada: o token NUNCA é guardado; token errado/ausente = outra chave = sem cópia).
//     Resposta com Cache-Control no-store/private do servidor NUNCA vira cópia (o servidor manda); kpis, rentabhist, semanal
//     e sr também ficam fora pela lista. Ao trocar/esquecer a identidade a página apaga o cache de dados (v1 e v2).
//     Nunca: POST/PUT/DELETE, /api/teams, ?uso= ?pcli= ?push= ?custos= ?portal=, resposta que já veio com X-JI-Offline.
//     Poda LRU: 150 entradas e 7 dias (no activate e a cada 50 gravações).
//  2) PUSH — 'push' mostra a notificação (só texto, sem HTML) e põe o selo no ícone; 'notificationclick' foca o app e manda
//     {tipo:'navegar', url} (ou abre a janela); 'pushsubscriptionchange' reinscreve com a chave pública guardada em 'ji-push'
//     e entrega a inscrição nova à página (a página tem a identidade; o SW não guarda token).
//  3) /icons/ (splash, selo) em cache-first por prefixo, só quando pedidos.
const VERSAO = 'ji-pwa-v3';
const DADOS = 'ji-dados-v2';
const PUSHC = 'ji-push';
const ESTATICOS = ['/manifest.webmanifest', '/logo.svg',
  '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];
const DADOS_ROTAS = ['/api/config', '/api/vencimentos', '/api/tempo', '/api/atividade', '/api/usuarios', '/api/projetos', '/api/reunioes', '/api/resumo'];
const DADOS_PARAM_PROIBIDO = ['uso', 'pcli', 'push', 'custos', 'portal', 'ct', 'ref', 'dec', 'kpis', 'rentabhist', 'semanal', 'sr'];
const DADOS_MAX_BYTES = 2 * 1024 * 1024;
const DADOS_MAX_ENTRADAS = 150;
const DADOS_MAX_IDADE_MS = 7 * 24 * 3600 * 1000;
let _gravacoes = 0;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // o 'ji-dados-v1' (chave só por e-mail, sem respeitar no-store) não está na lista abaixo: é apagado aqui
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== DADOS && k !== PUSHC).map(k => caches.delete(k))))
      .then(() => podaDados().catch(() => {}))
      .then(() => self.clients.claim())
  );
});

// ---------- dados de leitura ----------
function dadosElegivel(url) {
  if (!DADOS_ROTAS.includes(url.pathname)) return false;
  for (const p of DADOS_PARAM_PROIBIDO) if (url.searchParams.has(p)) return false;
  return true;
}
async function sha16(txt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(txt)));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
// Chave sintética: origem + hash da pessoa + caminho e query. Sem e-mail = "anon".
async function dadosChave(req, url) {
  const em = (req.headers.get('x-jira-email') || '').trim().toLowerCase();
  const tk = (req.headers.get('x-jira-token') || '').trim();
  const h = em ? await sha16(em + '|' + tk) : 'anon';
  return new Request(url.origin + '/__dados/' + h + url.pathname + url.search);
}
async function dadosGuarda(chave, resp) {
  try {
    if (resp.headers.has('X-JI-Offline')) return;                         // nunca cópia de cópia
    if (/\bno-store\b|\bprivate\b/i.test(resp.headers.get('Cache-Control') || '')) return;   // o servidor pediu: não persiste
    const buf = await resp.clone().arrayBuffer();
    if (buf.byteLength > DADOS_MAX_BYTES) return;
    const h = new Headers();
    h.set('Content-Type', resp.headers.get('Content-Type') || 'application/json; charset=utf-8');
    h.set('X-JI-Guardado', new Date().toISOString());
    const c = await caches.open(DADOS);
    await c.put(chave, new Response(buf, { status: 200, headers: h }));
    if (++_gravacoes % 50 === 0) podaDados().catch(() => {});
  } catch (_) { /* cache cheio / sem permissão: segue sem cópia */ }
}
async function podaDados() {
  const c = await caches.open(DADOS); const ks = await c.keys(); const lista = [];
  for (const k of ks) {
    const r = await c.match(k, { ignoreVary: true }); const t = r ? Date.parse(r.headers.get('X-JI-Guardado') || '') : NaN;
    if (!isFinite(t) || Date.now() - t > DADOS_MAX_IDADE_MS) await c.delete(k); else lista.push({ k, t });
  }
  lista.sort((a, b) => b.t - a.t);
  for (const x of lista.slice(DADOS_MAX_ENTRADAS)) await c.delete(x.k);
}
async function dadosRedePrimeiro(req, url) {
  const chave = await dadosChave(req, url);
  try {
    const resp = await fetch(req);
    if (resp.ok && resp.status >= 200 && resp.status < 300) dadosGuarda(chave, resp);
    return resp;
  } catch (err) {
    const c = await caches.open(DADOS); const cp = await c.match(chave, { ignoreVary: true });
    if (!cp) throw err;                                                    // sem cópia: a falha segue
    const h = new Headers(); h.set('Content-Type', cp.headers.get('Content-Type') || 'application/json; charset=utf-8');
    h.set('X-JI-Offline', cp.headers.get('X-JI-Guardado') || new Date().toISOString());
    h.set('Cache-Control', 'no-store');
    return new Response(await cp.arrayBuffer(), { status: 200, headers: h });
  }
}

// Rede primeiro; guarda a resposta boa; se a rede falhar, devolve a última cópia.
function redePrimeiro(req, chave) {
  return fetch(req)
    .then(resp => { if (resp.ok) { const cp = resp.clone(); caches.open(VERSAO).then(c => c.put(chave || req, cp)); } return resp; })
    .catch(() => caches.match(chave || req).then(r => r || Promise.reject(new Error('offline'))));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // CDN de fontes etc.: comportamento normal
  if (url.pathname.startsWith('/api/')) {              // dados: rede primeiro; cópia por pessoa só da lista fechada
    if (dadosElegivel(url)) e.respondWith(dadosRedePrimeiro(req, url));
    return;
  }

  // Navegação (a própria página): rede primeiro; se offline, última cópia boa.
  if (req.mode === 'navigate') {
    e.respondWith(
      redePrimeiro(req, '/').catch(() =>
        new Response('<meta charset="utf-8"><title>Sem conexão</title><p style="font-family:sans-serif;padding:24px">📡 Sem conexão. Abra novamente quando a internet voltar.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    );
    return;
  }

  // CSS e JS do painel: rede primeiro (304 barato), cópia guardada para o offline.
  if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) {
    e.respondWith(redePrimeiro(req));
    return;
  }

  // Ícones, telas de abertura e selo (/icons/): cache primeiro; o que ainda não está, entra quando pedido.
  if (url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(resp => {
      if (resp.ok) { const cp = resp.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); }
      return resp;
    })));
    return;
  }

  // Estáticos do app (manifest/logo): cache primeiro, rede como reserva.
  if (ESTATICOS.includes(url.pathname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
});

// ---------- 🔔 Web Push ----------
// A url vem do servidor/da notificação: só caminho relativo ("/…"), sem "//", sem barra invertida e sem controle.
function urlSegura(u) {
  if (typeof u !== 'string' || u[0] !== '/' || u.indexOf('//') >= 0 || u.indexOf('\\') >= 0 || /[\u0000-\u001f]/.test(u)) return '/';
  return u.slice(0, 400);
}
// Notificação é TEXTO PURO (o sistema não interpreta HTML): só tira controles e limita o tamanho.
function textoPuro(t, max) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { try { d = { corpo: e.data.text() }; } catch (__) { d = {}; } }
  if (!d || typeof d !== 'object') d = {};
  const titulo = textoPuro(d.titulo, 80) || 'Dexterity Hub';
  const ts = typeof d.em === 'number' ? d.em : Date.parse(d.em || '');
  const opcoes = {
    body: textoPuro(d.corpo, 240),
    icon: '/icons/icon-192.png', badge: '/icons/badge-96.png',
    tag: textoPuro(d.tag, 80) || undefined,
    data: { url: urlSegura(d.url), tipo: textoPuro(d.tipo, 20) },
    timestamp: isFinite(ts) ? ts : Date.now()
  };
  e.waitUntil((async () => {
    await self.registration.showNotification(titulo, opcoes);
    try {                                                                   // selo do ícone = notificações ainda abertas
      const n = (await self.registration.getNotifications()).length;
      if (self.navigator && typeof self.navigator.setAppBadge === 'function') await self.navigator.setAppBadge(n || 1);
    } catch (_) {}
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = urlSegura(e.notification.data && e.notification.data.url);
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = lista.find(x => { try { return new URL(x.url).origin === location.origin; } catch (_) { return false; } });
    if (c) {
      try { await c.focus(); } catch (_) {}
      c.postMessage({ tipo: 'navegar', url });
      return;
    }
    return self.clients.openWindow(url);
  })());
});

function chaveBytes(b64u) {
  const pad = '='.repeat((4 - b64u.length % 4) % 4); const b = atob((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
}
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(PUSHC); const r = await c.match('/__push/chave'); if (!r) return;
    const chave = (await r.text()).trim(); if (!chave) return;
    let sub; try { sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chave) }); } catch (_) { return; }
    const dados = { tipo: 'push-reinscrito', sub: typeof sub.toJSON === 'function' ? sub.toJSON() : sub };
    // O SW não tem identidade (o token não é guardado aqui): a página envia o `inscrever`. Com o app fechado fica pendente
    // no cache e a página o entrega na próxima abertura (31b: pshPendente).
    await c.put('/__push/pendente', new Response(JSON.stringify({ sub: dados.sub, em: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' } }));
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const cl of lista) { try { cl.postMessage(dados); } catch (_) {} }
  })());
});
