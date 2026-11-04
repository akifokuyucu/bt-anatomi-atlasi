// BT ve laparoskopi listelerinin ortak vaka kartı (bt.js, laparoskopi.js).
export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Kart kapakları: vaka kimliği → gerçek kesit/kare + organ konturu (JPG), veri olmayan vakalarda vektör çizim (SVG); scripts/build_kapak.py → img/kapak/.
// Tabloda olmayan vaka, vaka verisindeki kendi görseline (c.img) döner.
const KAPAK = {
  s0139: 'img/kapak/bt-abdomen.jpg',
  s0372: 'img/kapak/bt-toraks.jpg',
  s0103: 'img/kapak/bt-kraniyal.jpg',
  pe01: 'img/kapak/bt-pe.jpg',
  ileus: 'img/kapak/bt-ileus.svg',
  ich: 'img/kapak/bt-ich.svg',
  lapav01: 'img/kapak/lapa-safra-torsiyonu.jpg',
  'lapa-pelvis': 'img/kapak/lapa-pelvis.svg',
  'lapa-chole': 'img/kapak/lapa-kalot.svg',
};

// href: hazır vakanın açılacağı sayfa; meta: kartın alt satırı; etiket: [metin, rozet sınıfı] (isteğe bağlı)
export function vakaKarti(c, href, meta, etiket) {
  const hazir = c.status === 'ready';
  const kapak = KAPAK[c.id] || c.img;
  if (!hazir && !kapak) {
    const d = document.createElement('div');
    d.className = 'case planned';
    d.innerHTML =
      `<div class="ph" aria-hidden="true"><span>${esc(c.eyebrow)}</span></div>` +
      `<div class="case-body"><span class="caption">${esc(c.eyebrow)}</span><b>${esc(c.title)}</b>` +
      `<span class="muted">${esc(c.text || '')}</span><span class="badge soon">Hazırlanıyor</span></div>`;
    return d;
  }
  const a = document.createElement(hazir ? 'a' : 'div');
  a.className = hazir ? 'case' : 'case planned';
  if (hazir) a.href = href(c);
  a.innerHTML =
    `<img src="${esc(kapak)}" alt="" loading="lazy">` +
    `<div class="case-body"><span class="caption">${esc(c.eyebrow)}</span><b>${esc(c.title)}</b>` +
    (c.text ? `<span class="muted">${esc(c.text)}</span>` : '') +
    (hazir
      ? `<div class="rozetler">${etiket ? `<span class="badge ${esc(etiket[1])}">${esc(etiket[0])}</span>` : ''}${meta(c).map((m) => `<span class="mini">${esc(m)}</span>`).join('')}${c.yeni ? '<span class="mini yeni">YENİ</span>' : ''}</div>`
      : '<span class="badge soon">Hazırlanıyor</span>') +
    '</div>';
  const im = a.querySelector('img');
  const goster = () => im.classList.add('yuklendi');
  if (im.complete) goster(); else { im.addEventListener('load', goster); im.addEventListener('error', goster); }
  return a;
}

export const iskelet = (n) => Array.from({ length: n }, () => '<div class="skel-kart" aria-hidden="true"><i class="g"></i><i class="s1"></i><i class="s2"></i></div>').join('');
