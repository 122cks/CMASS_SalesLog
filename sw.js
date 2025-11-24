const CACHE_NAME = 'cmass-sales-v3';
const ASSETS = [
  '/input',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  // Be resilient: fetch each asset and cache only successful responses.
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const asset of ASSETS) {
      try {
        const resp = await fetch(asset, { cache: 'no-store' });
        if (resp && resp.ok) {
          await cache.put(asset, resp.clone());
        } else {
          console.warn('sw: failed to fetch asset for caching', asset, resp && resp.status);
        }
      } catch (err) {
        console.warn('sw: error fetching asset', asset, err && err.message);
      }
    }
  })());
});
self.addEventListener('fetch', (e) => {
  const reqUrl = new URL(e.request.url);

  // Do not intercept cross-origin requests. Let the browser handle CORS and
  // avoid the service worker generating opaque/failing responses for other
  // origins (like run.app). For same-origin requests, use cache-first then
  // network with graceful fallback.
  if (reqUrl.origin !== self.location.origin) {
    e.respondWith(
      fetch(e.request).catch(async () => {
        // Network failed for cross-origin request; try to return a cached copy
        // if present, otherwise return a generic error response.
        const cached = await caches.match(e.request);
        return cached || Response.error();
      })
    );
    return;
  }

  e.respondWith((async () => {
    // Prefer cache for same-origin GETs, fall back to network. For non-GET
    // requests (POST for APIs), try network first and fall back to cached
    // resources if available.
    try {
      if (e.request.method === 'GET') {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        const net = await fetch(e.request);
        if (net && net.ok) {
          try { const cache = await caches.open(CACHE_NAME); cache.put(e.request, net.clone()); } catch(_){}
        }
        return net;
      } else {
        // POST/PUT/etc: prefer network
        try {
          return await fetch(e.request);
        } catch (err) {
          const cached = await caches.match(e.request);
          if (cached) return cached;
          return new Response(JSON.stringify({ ok: false, msg: 'Network error (service worker)' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
      }
    } catch (err) {
      // Fallback: try cache or return a generic response
      const cached = await caches.match(e.request);
      return cached || new Response('Service Unavailable', { status: 503 });
    }
  })());
});
// remove old caches on activate to force fresh fetches
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
  })());
});
