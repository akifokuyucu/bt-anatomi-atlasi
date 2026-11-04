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
  // Menü konuya göre: kullanıcı "ne çalışacağını" seçer (BT, EKG…); içerik türü (atlas/simülasyon/araç) sorulmaz.
  const konu =
    anaSayfa ? '' :
    /^(araclar|devir|tahlil|form)\.html$/.test(sayfa) ? 'araclar' :
    /^(bt|atlas|atlaslar)\.html$/.test(sayfa) ? 'bt' :
    /^(laparoskopi|lapa|lapav)\.html$/.test(sayfa) ? 'lapa' :
    /^(ekg|derivasyon|mi|sim)\.html$/.test(sayfa) ? 'ekg' :
    /^(gorme|gorme-goz|gorme-pupil)\.html$/.test(sayfa) ? 'gorme' : '';
  // Renk ailesi (shell.css): görüntü atlasları mavi, simülasyonlar sarı, araçlar kırmızı
  const bolum = { bt: 'atlaslar', lapa: 'atlaslar', ekg: 'simulasyon', gorme: 'simulasyon', araclar: 'araclar' }[konu] || '';

  if (bolum) document.documentElement.dataset.bolum = bolum; // renk teması (shell.css); sayfa başındaki satır içi betik aynısını ilk boyamadan önce yapar

  const IC_KONU = {
    bt: IC.atlaslar,
    lapa: ico('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>'),
    ekg: IC.simulasyon,
    gorme: ico('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    araclar: IC.araclar,
  };
  // Tek kaynak: ana sayfa kartları, menü ve arama bu listeyi kullanır
  const KONU_LISTESI = [
    { id: 'bt', ad: 'BT', href: 'bt.html', ozet: 'Toraks, abdomen-pelvis ve kraniyal BT; normal ve patolojik vakalar, Türkçe etiketli yapılar, sınav modu.' },
    { id: 'lapa', ad: 'Laparoskopi', href: 'laparoskopi.html', ozet: 'Ameliyat adıyla kayıtlı laparoskopik ve robotik görüntülerde anatomi; video modu.' },
    { id: 'ekg', ad: 'EKG', href: 'ekg.html', ozet: '3B kalpte uyarı iletimi, 12 derivasyon ve miyokard infarktüsü; parametreyi değiştirin.' },
    { id: 'gorme', ad: 'Görme', href: 'gorme.html', ozet: 'Lezyonu yerleştirin; görme alanı hesaplanır; pupilla testi ve göz hastalıklarında görüntü ayrı sekmelerde.' },
    { id: 'araclar', ad: 'Araçlar', href: 'araclar.html', ozet: 'Vizit notu, devir listesi, tahlil takibi: günlük klinik iş için küçük yardımcılar.' },
  ];
  window.KONU_LISTESI = KONU_LISTESI;
  const OGE = KONU_LISTESI.map((k) => [k.id, k.ad, k.href]);
  const IC_OGE = IC_KONU;

  // Tek konunun bölümleri: aynı konunun sayfaları arasında sekme çubuğu
  const KONULAR = [
    ['EKG bölümleri', [['ekg.html', 'Ritim ve iletim'], ['derivasyon.html', 'Derivasyonlar'], ['mi.html', 'Miyokard infarktüsü']]],
    ['Görme bölümleri', [['gorme.html', 'Yollar ve görme alanı'], ['gorme-pupil.html', 'Pupilla'], ['gorme-goz.html', 'Göz ve görüntü']]],
  ];

  const nav = document.createElement('header');
  nav.className = 'sitenav';
  nav.innerHTML =
    '<div class="sitenav-in">' +
      '<a class="sn-brand" href="index.html" title="Klinik Atlas ana sayfa" aria-label="Klinik Atlas, ana sayfa">' +
        '<span class="logo" aria-hidden="true"></span><span class="sn-ad">Klinik Atlas</span></a>' +
      '<nav class="sn-links" aria-label="Ana menü">' +
        OGE.map(([id, ad, href]) =>
          `<a class="sn-link" href="${href}" data-sn="${id}"${konu === id ? ' aria-current="page"' : ''}>${IC_OGE[id]}<span>${ad}</span></a>`).join('') +
      '</nav>' +
      '<div class="top-actions sn-actions"></div>' +
    '</div>';
  document.body.prepend(nav);
  // Telefonda menü yana kayar: etkin konu görünür alana getirilir
  nav.querySelector('.sn-link[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
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

  // Konu sekmeleri: bağlam çubuğunun altına eklenir
  document.addEventListener('DOMContentLoaded', () => {
    const konu = KONULAR.find(([, liste]) => liste.some(([href]) => href === sayfa));
    if (!konu) return;
    const sekme = document.createElement('nav');
    sekme.className = 'alt-sekme';
    sekme.setAttribute('aria-label', konu[0]);
    sekme.innerHTML = konu[1].map(([href, ad]) => `<a href="${href}"${href === sayfa ? ' aria-current="page"' : ''}>${ad}</a>`).join('');
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
    const GH = 'https://github.com/akifokuyucu/klinik-atlas';
    const BLOG = 'https://ahmetin-blogu.akif-okuyucu.workers.dev'; // kişisel merkez; alan adı alınınca yalnızca burası değişir
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
      '</div>' +
      '<p class="sf-imza">Dr. Ahmet Akif Okuyucu tarafından geliştirilmiştir · ' +
        `<a href="${BLOG}/portfolyo/" target="_blank" rel="noopener">Geliştirici &amp; Portfolyo</a> · ` +
        `<a href="${BLOG}/" target="_blank" rel="noopener">Yazılar</a></p>`;
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
