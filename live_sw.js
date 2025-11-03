// Bump cache name to force clients to update when this file changes
const CACHE_NAME = 'saleslog-cache-v6';
// Service worker version log (helps diagnose client versions)
console.log('[service-worker] version: v5');
const ASSETS_TO_CACHE = [
  '/',
  '/input',
  '/manifest.json',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  // activate new SW immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  // remove old caches during activation and take control of clients
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // network-first for API calls, cache-first for others
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});




