// Ortak site kabuğu: her sayfada aynı sabit üst menü (Atlaslar · Simülasyon · Araçlar) ve "nerede olduğunu" gösteren konum izi.
// Klasik betik (defer); ui.js'den önce yüklenir, tema düğmesi bu menüdeki .top-actions'a eklenir.
(() => {
  const ico = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const IC = {
    araclar: ico('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>'),
    atlaslar: ico('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
    simulasyon: ico('<path d="M3 12h4l2-6 4 12 2-6h6"/>'),
  };

  const sayfa = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const anaSayfa = sayfa === 'index.html';
  // Hangi menü öğesi bu sayfaya ait
  const bolum =
    anaSayfa ? '' :
    /^(araclar|devir|tahlil|form)\.html$/.test(sayfa) ? 'araclar' :
    /^(atlaslar|atlas|lapa|lapav)\.html$/.test(sayfa) ? 'atlaslar' :
    /^(sim|ekg|derivasyon|mi)\.html$/.test(sayfa) ? 'simulasyon' : '';

  const OGE = [
    ['atlaslar', 'Atlaslar', 'atlaslar.html'],
    ['simulasyon', 'Simülasyon', 'sim.html'],
    ['araclar', 'Araçlar', 'araclar.html'],
  ];

  // Tek konunun bölümleri: EKG sayfaları arasında sekme çubuğu
  const EKG = [['ekg.html', 'Ritim ve iletim'], ['derivasyon.html', 'Derivasyonlar'], ['mi.html', 'Miyokard infarktüsü']];

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

  // EKG sekmeleri: bağlam çubuğunun altına eklenir
  document.addEventListener('DOMContentLoaded', () => {
    if (!EKG.some(([href]) => href === sayfa)) return;
    const sekme = document.createElement('nav');
    sekme.className = 'alt-sekme';
    sekme.setAttribute('aria-label', 'EKG bölümleri');
    sekme.innerHTML = EKG.map(([href, ad]) => `<a href="${href}"${href === sayfa ? ' aria-current="page"' : ''}>${ad}</a>`).join('');
    document.querySelector('.topbar.ctx')?.after(sekme);
  });

  // Gizlilik bağlantısı: her alt sayfanın altında; alt bilgi yoksa (atlas ekranları hariç) oluşturulur
  document.addEventListener('DOMContentLoaded', () => {
    if (sayfa === 'gizlilik.html' || /^(atlas|lapa|lapav)\.html$/.test(sayfa)) return;
    let foot = document.querySelector('footer.foot');
    if (!foot) {
      if (anaSayfa) return;
      foot = document.createElement('footer');
      foot.className = 'foot';
      document.body.appendChild(foot);
    }
    if (!foot.querySelector('a[href="gizlilik.html"]')) {
      const p = document.createElement('p');
      p.innerHTML = '<a href="gizlilik.html">Gizlilik ve Kullanım Koşulları</a>';
      foot.appendChild(p);
    }
  });

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
