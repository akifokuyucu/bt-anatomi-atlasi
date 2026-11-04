// BT ve laparoskopi listelerinin ortak vaka kartı (bt.js, laparoskopi.js).
export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// href: hazır vakanın açılacağı sayfa; meta: kartın alt satırı; etiket: [metin, rozet sınıfı] (isteğe bağlı)
export function vakaKarti(c, href, meta, etiket) {
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
    `<div class="rozetler">${etiket ? `<span class="badge ${esc(etiket[1])}">${esc(etiket[0])}</span>` : ''}${meta(c).map((m) => `<span class="mini">${esc(m)}</span>`).join('')}${c.yeni ? '<span class="mini yeni">YENİ</span>' : ''}</div></div>`;
  const im = a.querySelector('img');
  const goster = () => im.classList.add('yuklendi');
  if (im.complete) goster(); else { im.addEventListener('load', goster); im.addEventListener('error', goster); }
  return a;
}

export const iskelet = (n) => Array.from({ length: n }, () => '<div class="skel-kart" aria-hidden="true"><i class="g"></i><i class="s1"></i><i class="s2"></i></div>').join('');
