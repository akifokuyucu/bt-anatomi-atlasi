// İki iş yapar:
// 1) ?v= sürümlü .bin.gz hacimlerini kalıcı önbelleğe alır (önce önbellek).
// 2) Sayfa, betik, stil, JSON ve görselleri önce ağdan ister; ağ yoksa son görülen kopyayı verir (çevrimdışı açılış).
const CACHE = 'btatlas-data-v1';
const SHELL = 'btatlas-shell-v1';
const TUR = /\.(html|js|css|json|webmanifest|png|jpg|svg)$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || e.request.headers.has('range')) return;

  if (url.search.startsWith('?v=') && url.pathname.endsWith('.bin.gz')) {
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
    return;
  }

  // Hacim verisi ve video burada önbelleğe alınmaz
  if (url.pathname.endsWith('/') || TUR.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch {
        return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
      }
    })());
  }
});
