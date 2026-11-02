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

  if (bolum) document.documentElement.dataset.bolum = bolum; // renk teması (shell.css); sayfa başındaki satır içi betik aynısını ilk boyamadan önce yapar

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

  // Atlas sayfalarına geçişte noise perdesi (gecis.js). Hareket azaltma açıksa, WebGL yoksa veya
  // yeni sekme/değiştirici tuş varsa hiçbir şey yapılmaz; bağlantı normal çalışır.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const gecis = () => import('./gecis.js');
    try {
      if (sessionStorage.getItem('btatlas.gecis')) {
        sessionStorage.removeItem('btatlas.gecis');
        gecis().then((m) => m.ac()).catch(() => {});
      }
    } catch { /* depolama kapalıysa perde açılışı atlanır */ }
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href]');
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
      const u = new URL(a.href, location.href);
      const dosya = u.pathname.split('/').pop();
      if (u.origin !== location.origin || !/^(atlas|lapa|lapav)\.html$/.test(dosya) || dosya === sayfa) return;
      e.preventDefault();
      const git = () => { location.href = a.href; };
      gecis().then((m) => m.kapat()).then((perdeVar) => {
        if (perdeVar) { try { sessionStorage.setItem('btatlas.gecis', '1'); } catch { /* sorun değil */ } }
        git();
      }).catch(git);
      setTimeout(git, 2500); // güvenlik: perde takılırsa yine de git
    });
  }

  // EKG sekmeleri: bağlam çubuğunun altına eklenir
  document.addEventListener('DOMContentLoaded', () => {
    if (!EKG.some(([href]) => href === sayfa)) return;
    const sekme = document.createElement('nav');
    sekme.className = 'alt-sekme';
    sekme.setAttribute('aria-label', 'EKG bölümleri');
    sekme.innerHTML = EKG.map(([href, ad]) => `<a href="${href}"${href === sayfa ? ' aria-current="page"' : ''}>${ad}</a>`).join('');
    document.querySelector('.topbar.ctx')?.after(sekme);
  });

  // Kalıcı site alt bilgisi: her sayfada aynı. Sayfaya özgü notlar (footer.foot) bu alt bilgiye taşınır;
  // veri ve yazılım atıfları sayfalarda değil, tek yerde (kaynaklar.html) durur.
  document.addEventListener('DOMContentLoaded', () => {
    const sayfaNotlari = [...document.querySelectorAll('footer.foot')];
    // Evrensel uyarı zaten alt bilgide: notların başındaki aynı kalın cümle tekrarlanmasın
    const tekrar = /<b>Eğitim (?:amaçlıdır, tanı için kullanılamaz|ve çalışma kolaylığı içindir)\.?<\/b>\s*/g;
    const notlar = sayfaNotlari.map((f) => f.innerHTML.replace(tekrar, '').replace(/<p>\s*<\/p>/g, '').trim()).filter(Boolean);
    sayfaNotlari.forEach((f) => f.remove());
    const GH = 'https://github.com/akifokuyucu/bt-anatomi-atlasi';
    const baglantilar = [
      ['kaynaklar.html', 'Yararlanılan kaynaklar'],
      ['gizlilik.html', 'Gizlilik ve Kullanım Koşulları'],
      ['gizlilik.html#iletisim', 'İletişim'],
      [`${GH}/issues`, 'Hata bildir / öneri', true],
      [GH, 'Kaynak kod', true],
    ];
    const foot = document.createElement('footer');
    foot.className = 'site-foot';
    foot.innerHTML =
      (notlar.length ? `<div class="sf-not">${notlar.join('')}</div>` : '') +
      '<div class="sf-alt">' +
        '<p class="sf-uyari"><b>Eğitim ve çalışma kolaylığı içindir; tanı için kullanılamaz.</b></p>' +
        '<nav class="sf-links" aria-label="Site bilgileri">' +
          baglantilar.map(([href, ad, dis]) => `<a href="${href}"${dis ? ' target="_blank" rel="noopener"' : ''}>${ad}${dis ? ' ↗' : ''}</a>`).join('') +
        '</nav>' +
      '</div>';
    document.body.appendChild(foot);
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
