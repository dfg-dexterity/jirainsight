// Service worker do PWA — POSTURA CONSERVADORA de propósito:
// rede primeiro em TUDO que importa (a página e os dados mudam a cada deploy);
// cache só dos estáticos imutáveis (ícones/manifest/logo) e como fallback offline.
// NUNCA intercepta /api/ — dados e escritas vão sempre à rede.
const VERSAO = 'ji-pwa-v1';
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // CDN de fontes etc.: comportamento normal
  if (url.pathname.startsWith('/api/')) return;        // dados: sempre rede, sem cache

  // Navegação (a própria página): rede primeiro; se offline, última cópia boa.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(resp => { if (resp.ok) { const cp = resp.clone(); caches.open(VERSAO).then(c => c.put('/', cp)); } return resp; })
        .catch(() => caches.match('/').then(r => r ||
          new Response('<meta charset="utf-8"><title>Sem conexão</title><p style="font-family:sans-serif;padding:24px">📡 Sem conexão. Abra novamente quando a internet voltar.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
    );
    return;
  }

  // Estáticos do app (ícones/manifest/logo): cache primeiro, rede como reserva.
  if (ESTATICOS.includes(url.pathname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
});
