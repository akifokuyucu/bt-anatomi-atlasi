// Ortak site kabuğu: her sayfada aynı sabit üst menü (Pano · Araçlar · Atlaslar) ve "nerede olduğunu" gösteren konum izi.
// Klasik betik (defer); ui.js'den önce yüklenir, tema düğmesi bu menüdeki .top-actions'a eklenir.
(() => {
  const ico = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const IC = {
    pano: ico('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    araclar: ico('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>'),
    atlaslar: ico('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
  };

  const sayfa = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const anaSayfa = sayfa === 'index.html';
  // Hangi menü öğesi bu sayfaya ait
  const bolum =
    anaSayfa ? '' :
    /^(araclar|devir)\.html$/.test(sayfa) ? 'araclar' :
    /^(atlas|lapa|lapav)\.html$/.test(sayfa) ? 'atlaslar' : '';

  const OGE = [
    ['pano', 'Pano', 'index.html#pano'],
    ['araclar', 'Araçlar', 'araclar.html'],
    ['atlaslar', 'Atlaslar', 'index.html#atlaslar'],
  ];

  const nav = document.createElement('header');
  nav.className = 'sitenav';
  nav.innerHTML =
    '<div class="sitenav-in">' +
      '<a class="sn-brand" href="index.html" title="Klinik Atlas ana sayfa" aria-label="Klinik Atlas, ana sayfa">' +
        '<span class="logo" aria-hidden="true">◐</span><span class="sn-ad">Klinik Atlas</span></a>' +
      '<nav class="sn-links" aria-label="Ana menü">' +
        OGE.map(([id, ad, href]) =>
          `<a class="sn-link" href="${href}" data-sn="${id}"${bolum === id ? ' aria-current="page"' : ''}>${IC[id]}<span>${ad}</span></a>`).join('') +
      '</nav>' +
      '<div class="top-actions sn-actions"></div>' +
    '</div>';
  document.body.prepend(nav);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* önbelleksiz de çalışır */ });
  }
  document.body.classList.add('has-sitenav');

  // Klavye ve ekran okuyucu: içeriğe atla bağlantısı
  const ana = document.querySelector('main') || document.querySelector('.layout');
  if (ana) {
    ana.id = ana.id || 'icerik';
    ana.tabIndex = -1;
    const atla = document.createElement('a');
    atla.className = 'skip-link';
    atla.href = '#' + ana.id;
    atla.textContent = 'İçeriğe geç';
    atla.addEventListener('click', (e) => { e.preventDefault(); ana.focus(); ana.scrollIntoView(); });
    document.body.prepend(atla);
  }

  // Arama: düğme ve Ctrl+K / "/" kısayolu; arama paneli ilk kullanımda yüklenir (search.js)
  const ara = document.createElement('button');
  ara.type = 'button';
  ara.className = 'btn sn-search';
  ara.setAttribute('aria-label', 'Ara (Ctrl+K)');
  ara.title = 'Ara (Ctrl+K)';
  ara.innerHTML = ico('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>') + '<span class="sn-search-ad">Ara</span><kbd>Ctrl K</kbd>';
  nav.querySelector('.sn-actions').appendChild(ara);
  let panel;
  const ac = async () => { panel = panel || (await import('./search.js')).aramaPaneli(); panel.ac(); };
  ara.addEventListener('click', ac);
  addEventListener('keydown', (e) => {
    const yazi = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !yazi)) { e.preventDefault(); ac(); }
  });

  // Ana sayfada kaydırdıkça hangi bölümdeysek o menü öğesi vurgulansın
  if (anaSayfa && 'IntersectionObserver' in window) {
    const bag = new Map(OGE.map(([id]) => [id, nav.querySelector(`[data-sn="${id}"]`)]));
    const gor = new Set();
    const guncelle = () => {
      const ilk = ['pano', 'araclar', 'atlaslar'].find((k) => gor.has(k)) || '';
      bag.forEach((el, k) => (k === ilk ? el.setAttribute('aria-current', 'location') : el.removeAttribute('aria-current')));
    };
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting ? gor.add(e.target.dataset.sn) : gor.delete(e.target.dataset.sn)));
      guncelle();
    }, { rootMargin: '-30% 0px -55% 0px' });
    document.addEventListener('DOMContentLoaded', () => {
      // atlaslar: BT, patoloji ve laparoskopi bölümleri hep birlikte "Atlaslar" sayılır
      const harita = { pano: 'pano', araclar: 'araclar', atlaslar: 'atlaslar', saglikli: 'atlaslar', patoloji: 'atlaslar', laparoskopi: 'atlaslar' };
      Object.entries(harita).forEach(([id, sn]) => {
        const s = document.getElementById(id);
        if (s) { s.dataset.sn = sn; io.observe(s); }
      });
    });
  }

  // Alt sayfalarda konum izi: Klinik Atlas › Araçlar › Devir Listesi gibi; ".crumbs" yer tutucusu doldurulur
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-crumbs]').forEach((el) => {
      const adimlar = el.dataset.crumbs.split('|').map((s) => s.split('=')); // ad=href, sonuncusu href'siz
      el.setAttribute('aria-label', 'Konum');
      el.innerHTML = '<ol>' + adimlar.map(([ad, href], i) =>
        i < adimlar.length - 1
          ? `<li><a href="${href}">${ad}</a></li>`
          : `<li aria-current="page">${ad}</li>`).join('') + '</ol>';
    });
  });
})();
