// Ana sayfa: BT kartları data/cases.json'dan, laparoskopi kartları data/lapa_cases.json'dan üretilir.
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
    `<span class="muted">${esc(meta(c))}</span></div>`;
  return a;
}

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
  (c) => `${c.n} yapı · ${c.mm} mm kesit`);

fill('data/lapa_cases.json',
  [['cases-laparoskopi', () => true]],
  (c) => `${c.page || 'lapa.html'}#c=${encodeURIComponent(c.id)}`,
  (c) => (c.dur ? `${c.dur} sn video · ${c.n} yapı` : `${c.frames} kare · ${c.n} yapı`));
