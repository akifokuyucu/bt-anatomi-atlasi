// Site içi arama paneli (Ctrl+K): sayfalar, BT ve laparoskopi vakaları, araçlar, pano kartları.
// Atlas içi yapı araması atlasın kendi arama kutusundadır.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Türkçe harfleri sadeleştir: "karaciğer" ve "karaciger" aynı eşleşsin
const duz = (t) => String(t || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
const json = (u) => fetch(u).then((r) => (r.ok ? r.json() : [])).catch(() => []);

const SAYFALAR = [
  ['Pano', 'Seçilmiş siteler, kılavuzlar ve haberler', 'index.html#pano'],
  ['Araçlar', 'Klinik çalışmada işe yarayan küçük araçlar', 'araclar.html'],
  ['BT atlası', 'Normal toraks, abdomen ve kraniyal BT', 'index.html#saglikli'],
  ['Patoloji BT atlası', 'Lezyonu işaretli vakalar, tanı kartı', 'index.html#patoloji'],
  ['Laparoskopi atlası', 'Ameliyat görüntüsünde anatomi', 'index.html#laparoskopi'],
];

async function kayitlariYukle() {
  const [bt, lap, araclar, pano] = await Promise.all([
    json('data/cases.json'), json('data/lapa_cases.json'), json('pano/araclar.json'), json('pano/pano.json'),
  ]);
  const k = SAYFALAR.map(([ad, alt, href]) => ({ grup: 'Sayfa', ad, alt, href }));
  bt.filter((c) => c.status === 'ready').forEach((c) => k.push({ grup: c.category === 'patoloji' ? 'Patoloji BT' : 'BT atlası', ad: c.title, alt: `${c.eyebrow} · ${c.n} yapı`, href: `atlas.html#c=${encodeURIComponent(c.id)}` }));
  lap.filter((c) => c.status === 'ready').forEach((c) => k.push({ grup: 'Laparoskopi', ad: c.title, alt: c.text || c.eyebrow, href: `${c.page || 'lapa.html'}#c=${encodeURIComponent(c.id)}` }));
  araclar.forEach((t) => k.push({ grup: 'Araç', ad: t.ad, alt: t.aciklama || '', href: t.url }));
  pano.forEach((p) => k.push({ grup: 'Pano', ad: p.baslik, alt: p.ozet || '', href: p.url, dis: /^https?:/i.test(p.url) }));
  return k.map((x) => ({ ...x, kok: duz(`${x.ad} ${x.alt} ${x.grup}`) }));
}

export function aramaPaneli() {
  const kap = document.createElement('div');
  kap.className = 'srch';
  kap.hidden = true;
  kap.innerHTML =
    '<div class="srch-scrim" data-kapat></div>' +
    '<div class="srch-box" role="dialog" aria-modal="true" aria-label="Site içi arama">' +
      '<input class="srch-in" type="search" placeholder="Vaka, araç veya pano kartı ara…" aria-label="Ara" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="srch-list">' +
      '<ul class="srch-list" id="srch-list" role="listbox"></ul>' +
      '<div class="srch-foot"><span><kbd>↑</kbd><kbd>↓</kbd> gez</span><span><kbd>Enter</kbd> aç</span><span><kbd>Esc</kbd> kapat</span></div>' +
    '</div>';
  document.body.appendChild(kap);
  const girdi = kap.querySelector('.srch-in');
  const liste = kap.querySelector('.srch-list');
  let kayit = null, sonuc = [], sec = 0, onceki = null;

  function ciz() {
    const q = duz(girdi.value.trim()).split(/\s+/).filter(Boolean);
    sonuc = (kayit || []).filter((x) => q.every((w) => x.kok.includes(w))).slice(0, 30);
    sec = Math.min(sec, Math.max(0, sonuc.length - 1));
    if (!kayit) liste.innerHTML = '<li class="srch-bos">Yükleniyor…</li>';
    else if (!sonuc.length) liste.innerHTML = '<li class="srch-bos">Eşleşen sonuç yok.</li>';
    else liste.innerHTML = sonuc.map((x, i) =>
      `<li role="option" id="srch-${i}" aria-selected="${i === sec}" data-i="${i}"><span class="srch-grup">${esc(x.grup)}</span>` +
      `<span class="srch-ad">${esc(x.ad)}</span><span class="srch-alt">${esc(x.alt)}</span></li>`).join('');
    girdi.setAttribute('aria-activedescendant', sonuc.length ? 'srch-' + sec : '');
  }
  function isaretle() {
    liste.querySelectorAll('[role=option]').forEach((li, i) => li.setAttribute('aria-selected', String(i === sec)));
    liste.querySelector(`#srch-${sec}`)?.scrollIntoView({ block: 'nearest' });
    girdi.setAttribute('aria-activedescendant', sonuc.length ? 'srch-' + sec : '');
  }
  function git(i) {
    const x = sonuc[i];
    if (!x) return;
    kapat();
    if (x.dis) window.open(x.href, '_blank', 'noopener');
    else location.href = x.href;
  }
  function kapat() {
    kap.hidden = true;
    document.body.style.overflow = '';
    onceki?.focus?.();
  }

  girdi.addEventListener('input', () => { sec = 0; ciz(); });
  kap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); kapat(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sec = Math.min(sec + 1, sonuc.length - 1); isaretle(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sec = Math.max(sec - 1, 0); isaretle(); }
    else if (e.key === 'Enter') { e.preventDefault(); git(sec); }
    else if (e.key === 'Tab') { e.preventDefault(); girdi.focus(); } // odak panelden çıkmasın
  });
  liste.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) git(+li.dataset.i); });
  liste.addEventListener('pointermove', (e) => { const li = e.target.closest('[data-i]'); if (li && +li.dataset.i !== sec) { sec = +li.dataset.i; isaretle(); } });
  kap.querySelector('[data-kapat]').addEventListener('click', kapat);

  return {
    async ac() {
      onceki = document.activeElement;
      kap.hidden = false;
      document.body.style.overflow = 'hidden';
      girdi.value = '';
      sec = 0;
      ciz();
      girdi.focus();
      if (!kayit) { kayit = await kayitlariYukle(); ciz(); }
    },
  };
}
