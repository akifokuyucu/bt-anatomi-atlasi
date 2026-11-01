// Atlaslar sayfası: BT kartları data/cases.json'dan, laparoskopi kartları data/lapa_cases.json'dan üretilir.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// href: hazır vakanın açılacağı sayfa; meta: kartın alt satırı
function card(c, href, meta) {
  if (c.status !== 'ready') {
    const d = document.createElement('div');
    d.className = 'case planned';
    d.innerHTML =
      `<div class="ph" aria-hidden="true"><span>${esc(c.eyebrow)}</span></div>` +
      `<div class="case-body"><span class="caption">${esc(c.eyebrow)}</span><b>${esc(c.title)}</b>` +
      `<span class="muted">${esc(c.text || '')}</span><span class="badge soon">Hazırlanıyor</span></div>`;
    return d;
  }
  const a = document.createElement('a');
  a.className = 'case';
  a.href = href(c);
  a.innerHTML =
    `<img src="${esc(c.img)}" alt="" loading="lazy" width="640" height="468">` +
    `<div class="case-body"><span class="caption">${esc(c.eyebrow)}</span><b>${esc(c.title)}</b>` +
    (c.text ? `<span class="muted">${esc(c.text)}</span>` : '') +
    `<div class="rozetler">${meta(c).map((m) => `<span class="mini">${esc(m)}</span>`).join('')}${c.yeni ? '<span class="mini yeni">YENİ</span>' : ''}</div></div>`;
  const im = a.querySelector('img');
  const goster = () => im.classList.add('yuklendi');
  if (im.complete) goster(); else { im.addEventListener('load', goster); im.addEventListener('error', goster); }
  return a;
}

const iskelet = (n) => Array.from({ length: n }, () => '<div class="skel-kart" aria-hidden="true"><i class="g"></i><i class="s1"></i><i class="s2"></i></div>').join('');
['cases-saglikli', 'cases-patoloji', 'cases-laparoskopi'].forEach((id) => { const b = document.getElementById(id); if (b) b.innerHTML = iskelet(3); });

async function fill(url, groups, href, meta) {
  try {
    const cases = await (await fetch(url, { cache: 'no-cache' })).json();
    for (const [id, filter] of groups) {
      const box = document.getElementById(id);
      box.innerHTML = '';
      const list = cases.filter(filter);
      if (!list.length) box.innerHTML = '<p class="muted">Bu kategoride henüz vaka yok.</p>';
      list.forEach((c) => box.appendChild(card(c, href, meta)));
    }
  } catch {
    for (const [id] of groups) {
      document.getElementById(id).innerHTML = '<p class="muted">Vakalar yüklenemedi. Sayfayı yenileyin.</p>';
    }
  }
}

fill('data/cases.json',
  ['saglikli', 'patoloji'].map((cat) => [`cases-${cat}`, (c) => c.category === cat]),
  (c) => `atlas.html#c=${encodeURIComponent(c.id)}`,
  (c) => [`${c.n} yapı`, `${c.mm} mm kesit`]);

fill('data/lapa_cases.json',
  [['cases-laparoskopi', () => true]],
  (c) => `${c.page || 'lapa.html'}#c=${encodeURIComponent(c.id)}`,
  (c) => (c.dur ? [`${c.dur} sn video`, `${c.n} yapı`] : [`${c.frames} kare`, `${c.n} yapı`]));

// Karşılaştırma sürgüsü: sahnede sürükleme veya klavye için alttaki aralık kutusu
(() => {
  const sahne = document.getElementById('kiyas-sahne');
  const surgu = document.getElementById('kiyas-surgu');
  if (!sahne || !surgu) return;
  const ayarla = (y) => {
    const k = Math.min(100, Math.max(0, y));
    sahne.style.setProperty('--k', `${k}%`);
    surgu.value = String(k);
  };
  surgu.addEventListener('input', () => ayarla(+surgu.value));
  const sur = (e) => { const r = sahne.getBoundingClientRect(); ayarla(((e.clientX - r.left) / r.width) * 100); };
  sahne.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button) return;
    sahne.setPointerCapture(e.pointerId);
    sur(e);
    const git = (ev) => sur(ev);
    const bit = () => { sahne.removeEventListener('pointermove', git); sahne.removeEventListener('pointerup', bit); sahne.removeEventListener('pointercancel', bit); };
    sahne.addEventListener('pointermove', git);
    sahne.addEventListener('pointerup', bit);
    sahne.addEventListener('pointercancel', bit);
  });
  ayarla(50);
})();

// Normal BT, patoloji ve laparoskopi bölümleri sekme gibi; aynı anda biri görünür.
// #saglikli, #patoloji, #laparoskopi bağlantıları doğrudan ilgili sekmeyi açar.
(() => {
  const ids = ['saglikli', 'patoloji', 'laparoskopi'];
  const nav = document.querySelector('.areas');
  if (!nav) return;
  nav.setAttribute('role', 'tablist');
  const tabs = [...nav.querySelectorAll('.area')];
  tabs.forEach((a) => a.setAttribute('role', 'tab'));
  function sec(id) {
    ids.forEach((k) => { document.getElementById(k).hidden = k !== id; });
    tabs.forEach((a) => {
      const on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('on', on);
      a.setAttribute('aria-selected', String(on));
      a.tabIndex = on ? 0 : -1;
    });
  }
  tabs.forEach((a, i) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('href').slice(1);
      sec(id);
      history.replaceState(null, '', '#' + id);
    });
    a.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      const n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus(); n.click();
    });
  });
  function hash() {
    const id = location.hash.slice(1);
    if (ids.includes(id)) sec(id);
  }
  sec('saglikli');
  hash();
  addEventListener('hashchange', hash);
})();
