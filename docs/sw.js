// İki iş yapar:
// 1) ?v= sürümlü .bin.gz hacimlerini kalıcı önbelleğe alır (önce önbellek).
// 2) Sayfa, betik, stil, JSON ve görselleri önce ağdan ister; ağ yoksa son görülen kopyayı verir (çevrimdışı açılış).
const CACHE = 'btatlas-data-v1';
const SHELL = 'btatlas-shell-v1';
const TUR = /\.(html|js|css|json|webmanifest|png|jpg|svg|py)$/;
// Çevrimdışı çalışma: sık kullanılan sayfalar kurulumda, araç kütüphaneleri (CDN) ilk kullanımda önbelleğe alınır.
// Önbelleğe yalnızca site dosyaları ve genel kütüphaneler girer; kullanıcının yazdığı/yüklediği hiçbir şey girmez.
const CDN = 'btatlas-cdn-v1';
const CDN_YOL = [
  'https://cdn.jsdelivr.net/pyodide/',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/',
];
const ONYUKLE = [
  './', 'index.html', 'araclar.html', 'form.html', 'form.js', 'form.css', 'formlar/index.json', 'formlar/vizit.json',
  'formlar/nobet.json', 'formlar/konsultasyon.json', 'tahlil.html', 'tahlil.js', 'tahlil.css', 'tahlil/parse.py',
  'devir.html', 'devir.js', 'devir.css', 'gizlilik.html', 'style.css', 'home.css', 'home.js', 'premium.css', 'shell.css',
  'shell.js', 'ui.js', 'search.js', 'araclar.js', 'manifest.webmanifest', 'pano/araclar.json', 'pano/pano.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.allSettled(ONYUKLE.map((u) => cache.add(u))); // biri yoksa kurulum bozulmasın
    await self.skipWaiting();
  })());
});

async function cdnOnbellek(req) {
  const cache = await caches.open(CDN);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && CDN_YOL.some((p) => e.request.url.startsWith(p)) && !e.request.headers.has('range')) {
    e.respondWith(cdnOnbellek(e.request));
    return;
  }
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
