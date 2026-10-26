// Ana sayfa: BT kartları data/cases.json'dan, laparoskopi kartları data/lapa_cases.json'dan üretilir.
import { araclariKur } from './araclar.js';

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

// Pano: pano/pano.json (branş, tür ve arama süzgeci)
const TUR = { site: 'Site', haber: 'Haber', kilavuz: 'Kılavuz', video: 'Video', arac: 'Araç', duyuru: 'Duyuru' };
const guvenliUrl = (u) => (/^(https?:\/\/|#|[\w./-]+\.html)/i.test(u) ? u : '#');
const tarihTr = (t) => new Date(t + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const yeniMi = (t) => (Date.now() - new Date(t + 'T00:00:00')) / 864e5 <= 14;

function panoKart(k) {
  const dis = /^https?:/i.test(k.url);
  const a = document.createElement('article');
  a.className = 'pano-kart' + (k.sabit ? ' sabit' : '');
  a.innerHTML =
    `<div class="pano-ust"><span class="badge tur-${esc(k.tur)}">${esc(TUR[k.tur] || k.tur)}</span>` +
    (k.sabit ? '<span class="badge soon">Sabit</span>' : '') +
    (yeniMi(k.tarih) ? '<span class="badge new">YENİ</span>' : '') + '</div>' +
    `<h3>${esc(k.baslik)}</h3><p>${esc(k.ozet)}</p>` +
    (k.yorum ? `<p class="yorum">${esc(k.yorum)}</p>` : '') +
    ((k.ozellikler || []).length ? `<ul>${k.ozellikler.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : '') +
    `<div class="pano-alt"><span class="muted">${esc(k.kaynak || '')} · ${esc(tarihTr(k.tarih))}</span>` +
    `<a class="btn" href="${esc(guvenliUrl(k.url))}"${dis ? ' target="_blank" rel="noopener"' : ''}>${dis ? 'Siteye git ↗' : 'Aç'}</a></div>` +
    `<div class="pano-etiket">${(k.branslar || []).map((b) => `<span>${esc(b)}</span>`).join('')}</div>`;
  return a;
}

async function panoyuKur() {
  const liste = document.getElementById('pano-liste');
  let kartlar;
  try {
    kartlar = await (await fetch('pano/pano.json', { cache: 'no-cache' })).json();
  } catch {
    liste.innerHTML = '<p class="muted">Pano yüklenemedi. Sayfayı yenileyin.</p>';
    return;
  }
  kartlar.sort((a, b) => (b.sabit ? 1 : 0) - (a.sabit ? 1 : 0) || b.tarih.localeCompare(a.tarih));
  const durum = { brans: '', tur: '', q: '' };
  const benzersiz = (f) => [...new Set(kartlar.flatMap(f))];

  const chipler = (id, degerler, etiket, anahtar) => {
    const box = document.getElementById(id);
    if (degerler.length < 2) { box.hidden = true; return; }
    const dugme = (v, ad) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = ad; b.setAttribute('aria-pressed', String(durum[anahtar] === v));
      b.onclick = () => { durum[anahtar] = v; box.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); ciz(); };
      box.appendChild(b);
    };
    dugme('', etiket);
    degerler.forEach((v) => dugme(v, etiket === 'Tüm türler' ? TUR[v] || v : v));
  };
  chipler('pano-bransler', benzersiz((k) => k.branslar || []), 'Tüm branşlar', 'brans');
  chipler('pano-turler', benzersiz((k) => [k.tur]), 'Tüm türler', 'tur');
  document.getElementById('pano-ara').addEventListener('input', (e) => { durum.q = e.target.value.trim().toLocaleLowerCase('tr'); ciz(); });

  function ciz() {
    liste.innerHTML = '';
    const sonuc = kartlar.filter((k) =>
      (!durum.brans || (k.branslar || []).includes(durum.brans)) &&
      (!durum.tur || k.tur === durum.tur) &&
      (!durum.q || [k.baslik, k.ozet, k.yorum, k.kaynak, ...(k.ozellikler || [])].join(' ').toLocaleLowerCase('tr').includes(durum.q)));
    if (!sonuc.length) liste.innerHTML = '<p class="muted">Bu süzgeçle eşleşen kart yok.</p>';
    sonuc.forEach((k) => liste.appendChild(panoKart(k)));
  }
  ciz();
}

panoyuKur();
araclariKur();
