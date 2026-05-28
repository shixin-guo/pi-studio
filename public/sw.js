// Pi Studio Service Worker — minimal, just enables PWA install
// No aggressive caching since Pi Studio connects to a live local server

const CACHE_NAME = 'pi-studio-v1';

// Cache only the app shell on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/cost',
        '/cost.html',
        '/cost.css',
        '/cost.js',
        '/style.css',
        '/app.js',
        '/state.js',
        '/themes.js',
        '/markdown.js',
        '/message-renderer.js',
        '/tool-card.js',
        '/dialogs.js',
        '/session-sidebar.js',
        '/websocket-client.js',
        '/manifest.json',
      ]);
    })
  );
  self.skipWaiting();
});

// Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Network-first strategy — always try live server, fall back to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache API/WebSocket requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache with fresh response
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(event.request).then((cached) => {
          return cached || new Response('Pi Studio is offline — start your pi session to connect.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        });
      })
  );
});
