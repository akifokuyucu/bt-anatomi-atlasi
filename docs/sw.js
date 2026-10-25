// Yalnızca sürüm parametreli (?v=…) hacim dosyalarını önbelleğe alır; sayfa, betik ve JSON her zaman ağdan gelir.
const CACHE = 'btatlas-data-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.search.startsWith('?v=') || !url.pathname.endsWith('.bin.gz')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) {
      cache.put(e.request, res.clone());
      // Eski sürümleri temizle: aynı dosyanın başka ?v= kayıtları
      for (const k of await cache.keys()) {
        const u = new URL(k.url);
        if (u.pathname === url.pathname && u.search !== url.search) cache.delete(k);
      }
    }
    return res;
  })());
});
