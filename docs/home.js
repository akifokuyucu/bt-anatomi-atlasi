// Ana sayfa: kartlar data/cases.json'dan, kategoriye göre ayrı bölümlere üretilir.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function card(c) {
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
  a.href = `atlas.html#c=${encodeURIComponent(c.id)}`;
  a.innerHTML =
    `<img src="${esc(c.img)}" alt="" loading="lazy" width="640" height="468">` +
    `<div class="case-body"><span class="caption">${esc(c.eyebrow)}</span><b>${esc(c.title)}</b>` +
    `<span class="muted">${c.n} yapı · ${c.mm} mm kesit</span></div>`;
  return a;
}

try {
  const cases = await (await fetch('data/cases.json', { cache: 'no-cache' })).json();
  for (const cat of ['saglikli', 'patoloji']) {
    const box = document.getElementById(`cases-${cat}`);
    box.innerHTML = '';
    const list = cases.filter((c) => c.category === cat);
    if (!list.length) box.innerHTML = '<p class="muted">Bu kategoride henüz vaka yok.</p>';
    list.forEach((c) => box.appendChild(card(c)));
  }
} catch {
  document.querySelectorAll('.cards').forEach((b) => {
    b.innerHTML = '<p class="muted">Vakalar yüklenemedi. <a href="atlas.html">Atlası doğrudan açın.</a></p>';
  });
}
