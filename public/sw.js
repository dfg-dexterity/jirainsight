// Service worker do PWA — POSTURA CONSERVADORA de propósito:
// rede primeiro em TUDO que importa (a página e os dados mudam a cada deploy);
// cache só dos estáticos imutáveis (ícones/manifest/logo) e como fallback offline.
// NUNCA intercepta /api/ — dados e escritas vão sempre à rede.
//
// v2 (2026-09-06): o CSS e o JS do painel saíram do index.html para /css/*.css e
// /js/*.js (sem hash no nome — não há build). Eles seguem REDE PRIMEIRO (a Vercel
// responde 304 quando não mudaram), mas a última cópia boa fica guardada para o
// fallback offline funcionar de verdade: sem isso, a página cacheada abriria em
// branco por não achar os scripts.
const VERSAO = 'ji-pwa-v2';
const ESTATICOS = ['/manifest.webmanifest', '/logo.svg',
  '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

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
  if (url.pathname.startsWith('/api/')) return;        // dados: sempre rede, sem cache

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

  // Estáticos do app (ícones/manifest/logo): cache primeiro, rede como reserva.
  if (ESTATICOS.includes(url.pathname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
});
