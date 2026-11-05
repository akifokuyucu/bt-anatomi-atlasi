// Ana sayfa: konu kartlarındaki sayılar ve son eklenenler. Vaka kartları bt.js ve laparoskopi.js, araç kartları araclar.js'dedir.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const json = (u) => fetch(u, { cache: 'no-cache' }).then((r) => r.json());

// Konu kartlarının alt satırı: içerik sayıları (BT vakası, ameliyat, modül…)
async function sayilariYaz() {
  const yaz = (k, t) => { const el = document.querySelector(`[data-konu="${k}"] .konu-say`); if (el) el.textContent = t; };
  try {
    const [bt, lap, araclar, sim] = await Promise.all([json('data/cases.json'), json('data/lapa_cases.json'), json('pano/araclar.json'), json('pano/simulasyon.json')]);
    const hazir = (l) => l.filter((c) => c.status === 'ready').length;
    const modul = (ad) => { const s = sim.find((x) => x.ad.startsWith(ad)); return s ? (s.bolumler || []).length || 1 : 0; };
    yaz('bt', `${hazir(bt)} vaka`);
    yaz('lapa', `${hazir(lap)} ameliyat`);
    yaz('ekg', `${modul('EKG')} bölüm`);
    yaz('gorme', `${modul('Görme')} bölüm`);
    { const h = araclar.filter((t) => t.durum !== 'yakinda').length; yaz('araclar', h ? `${h} araç` : 'Yakında'); }
  } catch { /* sayılar olmadan da kartlar çalışır */ }
}

// Son eklenenler: pano/pano.json'daki en yeni kartlar
const TUR = { site: 'Site', haber: 'Haber', kilavuz: 'Kılavuz', video: 'Video', arac: 'Araç', duyuru: 'Duyuru' };
const SON_KART = 4;
const guvenliUrl = (u) => (/^(https?:\/\/|#|[\w./-]+\.html)/i.test(u) ? u : '#');
const tarihTr = (t) => new Date(t + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const yeniMi = (t) => (Date.now() - new Date(t + 'T00:00:00')) / 864e5 <= 14;

function panoKart(k) {
  const dis = /^https?:/i.test(k.url);
  const a = document.createElement('article');
  a.className = 'pano-kart';
  a.innerHTML =
    `<div class="pano-ust"><span class="badge tur-${esc(k.tur)}">${esc(TUR[k.tur] || k.tur)}</span>` +
    (yeniMi(k.tarih) ? '<span class="badge new">YENİ</span>' : '') + '</div>' +
    `<h3>${esc(k.baslik)}</h3><p>${esc(k.ozet)}</p>` +
    `<div class="pano-alt"><span class="muted">${esc(tarihTr(k.tarih))}</span>` +
    `<a class="btn" href="${esc(guvenliUrl(k.url))}"${dis ? ' target="_blank" rel="noopener"' : ''}>${dis ? 'Siteye git ↗' : 'Aç'}</a></div>`;
  return a;
}

async function yenilikleriKur() {
  const liste = document.getElementById('yenilikler-liste');
  try {
    const kartlar = await json('pano/pano.json');
    kartlar.sort((a, b) => b.tarih.localeCompare(a.tarih));
    liste.innerHTML = '';
    kartlar.slice(0, SON_KART).forEach((k) => liste.appendChild(panoKart(k)));
  } catch {
    liste.innerHTML = '<p class="muted">Liste yüklenemedi. Sayfayı yenileyin.</p>';
  }
}

sayilariYaz();
yenilikleriKur();
