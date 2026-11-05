// Görme yolları simülasyonu: lezyon seçimi, görme alanları ve birleşik görüş. Pupilla testi gorme-pupil.js'tedir.
// Durum bağlantıda: #p=patoloji&t=1|-1&k=boyut (serbest lezyonda &x=..&y=..&z=..)
import { modelKur, PATOLOJI, EVRE_AD, HALKA, ACI_N, alanSiniri, korNokta } from './gorme-model.js';
import { gormeSahnesi, KADRAN, kadranRenk } from './gorme-3d.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DURAK = [['normal', 'Normal'], ['retina', 'Retina ve disk'], ['sinir', 'Optik sinir'], ['kiazma', 'Kiazma'], ['traktus', 'Traktus'], ['lgn', 'LGN'], ['radyasyon', 'Radyasyon'], ['v1', 'Korteks']];
const yan = (h) => (h > 0 ? 'sol' : 'sağ');
const buyuk = (t) => t.charAt(0).toLocaleUpperCase('tr') + t.slice(1);
const metin = (t, h) => buyuk(String(t).replaceAll('{L}', yan(h)).replaceAll('{K}', yan(-h)));

const durum = { p: 'normal', t: 1, k: 1, serbest: null, yerlestir: false, sahne: 'perimetri', kapsam: 30, sahneElle: false, durak: 'normal' };
// Defekti 30° dışında kalan patolojiler: perimetri kendiliğinden geniş açılır (kullanıcı sahne seçmediyse)
const GENIS = new Set(['rp', 'rd', 'hilal']);
// Lezyonun yaptığı kayıp koyu bordo; doğal alan sınırı ve kör nokta siyah kalır, ikisi karışmasın
const KAYIP = [70, 18, 30], SINIR = [11, 13, 18];
let model, sahne3b = null, sonuc = null, kureler = [], alanFn = null;

// --- Sahneler: 180°×135° dünya tuvali (8 px/°) ---------------------------------------
const PX = 8;
const DUNYA_G = 180 * PX, DUNYA_Y = 135 * PX;
const dunya = {};
function dunyaCiz(ad) {
  if (dunya[ad]) return dunya[ad];
  const c = document.createElement('canvas');
  c.width = DUNYA_G; c.height = DUNYA_Y;
  const g = c.getContext('2d');
  const W = DUNYA_G, H = DUNYA_Y, ufuk = H * 0.46;
  if (ad === 'yol') {
    const gok = g.createLinearGradient(0, 0, 0, ufuk);
    gok.addColorStop(0, '#6aa6dc'); gok.addColorStop(1, '#dfeef7');
    g.fillStyle = gok; g.fillRect(0, 0, W, ufuk);
    // Bulutlar
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (const [x, y, r] of [[.18, .14, 70], [.24, .15, 95], [.3, .14, 60], [.62, .09, 80], [.68, .1, 110], [.75, .09, 60], [.45, .22, 50], [.5, .23, 70]]) { g.beginPath(); g.ellipse(x * W, y * H, r * 1.7, r * .55, 0, 0, 7); g.fill(); }
    // Dağlar
    const dag = (renk, ust, gen, faz) => {
      g.fillStyle = renk; g.beginPath(); g.moveTo(0, ufuk);
      for (let x = 0; x <= W; x += 12) g.lineTo(x, ufuk - ust * (0.55 + 0.45 * Math.sin(x / gen + faz) * Math.sin(x / (gen * .37) + faz * 2)));
      g.lineTo(W, ufuk); g.fill();
    };
    dag('#8fa9c4', 150, 170, 1); dag('#6d8f7e', 95, 120, 2.4); dag('#4c7a4d', 50, 80, .6);
    // Zemin
    const zem = g.createLinearGradient(0, ufuk, 0, H);
    zem.addColorStop(0, '#6aa24f'); zem.addColorStop(1, '#3f7a35');
    g.fillStyle = zem; g.fillRect(0, ufuk, W, H - ufuk);
    // Yol
    const ox = W * .5;
    g.fillStyle = '#4b4f55'; g.beginPath(); g.moveTo(ox - 8, ufuk); g.lineTo(ox + 8, ufuk); g.lineTo(ox + W * .34, H); g.lineTo(ox - W * .34, H); g.fill();
    g.strokeStyle = '#f4f4f0'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(ox - 8, ufuk); g.lineTo(ox - W * .33, H); g.moveTo(ox + 8, ufuk); g.lineTo(ox + W * .33, H); g.stroke();
    g.fillStyle = '#ffd34d';
    for (let i = 0; i < 12; i++) {
      const a = Math.pow(i / 12, 2.2), b = Math.pow((i + .5) / 12, 2.2);
      const y0 = ufuk + a * (H - ufuk), y1 = ufuk + b * (H - ufuk), w0 = 1 + a * 13, w1 = 1 + b * 13;
      g.beginPath(); g.moveTo(ox - w0, y0); g.lineTo(ox + w0, y0); g.lineTo(ox + w1, y1); g.lineTo(ox - w1, y1); g.fill();
    }
    // Ağaçlar
    const agac = (x, taban, s) => {
      g.fillStyle = '#5a3f28'; g.fillRect(x - s * .07, taban - s * .4, s * .14, s * .4);
      g.fillStyle = '#2f6b3a'; g.beginPath(); g.ellipse(x, taban - s * .72, s * .34, s * .46, 0, 0, 7); g.fill();
      g.fillStyle = '#3b8247'; g.beginPath(); g.ellipse(x - s * .08, taban - s * .8, s * .2, s * .28, 0, 0, 7); g.fill();
    };
    for (const [x, t, s] of [[.08, .66, 190], [.17, .58, 110], [.26, .53, 70], [.33, .5, 42], [.92, .66, 190], [.83, .58, 110], [.74, .53, 70], [.67, .5, 42], [.03, .8, 280], [.97, .8, 280]]) agac(x * W, t * H, s);
    // Arabalar: biri sağda, biri solda (hemianopide kaybolan tehlike)
    const araba = (x, y, s, renk) => {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - s * .52, y + s * .24, s * 1.04, s * .08);
      g.fillStyle = renk; g.beginPath(); g.roundRect(x - s * .5, y - s * .02, s, s * .28, s * .05); g.fill();
      g.beginPath(); g.roundRect(x - s * .36, y - s * .28, s * .72, s * .3, s * .08); g.fill();
      g.fillStyle = '#bfe0ef'; g.fillRect(x - s * .28, y - s * .23, s * .56, s * .19);
      g.fillStyle = '#fff1a8'; g.fillRect(x - s * .46, y + s * .06, s * .13, s * .07); g.fillRect(x + s * .33, y + s * .06, s * .13, s * .07);
    };
    araba(ox + W * .07, ufuk + H * .1, 92, '#d3322f');
    araba(ox - W * .15, ufuk + H * .22, 190, '#2d62c8');
    // Yaya ve tabela
    g.fillStyle = '#d8a15d'; g.beginPath(); g.arc(ox + W * .3, ufuk + H * .1, 13, 0, 7); g.fill();
    g.fillStyle = '#7b3fa0'; g.fillRect(ox + W * .3 - 11, ufuk + H * .1 + 12, 22, 44);
    g.fillStyle = '#26292f'; g.fillRect(ox - W * .29, ufuk + H * .02, 8, 66);
    g.fillStyle = '#e03a3a'; g.beginPath(); g.arc(ox - W * .29 + 4, ufuk + H * .02, 28, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 26px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('50', ox - W * .29 + 4, ufuk + H * .02);
  } else if (ad === 'okuma') {
    g.fillStyle = '#f5f1e8'; g.fillRect(0, 0, W, H);
    const yazi = 'Görme yolları retinada başlar. Nazal retinadan gelen lifler kiazmada çaprazlaşır, temporal retinadan gelenler aynı tarafta kalır. Böylece sağdaki her şey sol yarıküreye, soldaki her şey sağ yarıküreye taşınır. Sağ homonim hemianopide okunmakta olan kelimenin devamı görünmez, bu yüzden hasta satırı ağır ağır, tek tek heceleyerek izler. Sol hemianopide ise bir sonraki satırın başını bulmak zorlaşır. Merkezi tutan bir skotomda harfler kaybolur ama sayfanın kenarları seçilebilir. '.repeat(14);
    g.fillStyle = '#20242a'; g.font = '500 19px Georgia, serif'; g.textBaseline = 'top'; g.textAlign = 'left';
    const kel = yazi.split(' ');
    let x = 26, y = 20;
    for (const k of kel) {
      const w = g.measureText(k + ' ').width;
      if (x + w > W - 20) { x = 26; y += 30; if (y > H - 30) break; }
      g.fillText(k, x, y); x += w;
    }
  } else { // amsler
    g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2d3036'; g.lineWidth = 1.2;
    const ad_ = 5 * PX;
    for (let i = DUNYA_G / 2 % ad_; i < W; i += ad_) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); }
    for (let i = DUNYA_Y / 2 % ad_; i < H; i += ad_) { g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
    g.fillStyle = '#111'; g.beginPath(); g.arc(W / 2, H / 2, 5, 0, 7); g.fill();
  }
  dunya[ad] = c;
  return c;
}

// --- Görme alanı çizimi ---------------------------------------------------------------
const KAT_N = 170;
const kat = document.createElement('canvas');
kat.width = KAT_N; kat.height = KAT_N;
const katG = kat.getContext('2d');
const katV = katG.createImageData(KAT_N, KAT_N);

function olc(c) {
  const r = c.getBoundingClientRect();
  const o = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(10, Math.round(r.width * o)), h = Math.max(10, Math.round(r.height * o));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return { w, h, o };
}

function alanCiz(c, g) {
  const { w, o } = olc(c);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, w);
  const R = w / 2 - 2 * o, cx = w / 2, cy = w / 2;
  const Em = durum.kapsam;
  const e = g ? -1 : 1;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, w, w);
  const pxDeg = R / Em;
  if (durum.sahne !== 'perimetri') {
    const s = pxDeg / PX;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dunyaCiz(durum.sahne), cx - DUNYA_G / 2 * s, cy - DUNYA_Y / 2 * s, DUNYA_G * s, DUNYA_Y * s);
    // Sınır, kör nokta ve defekt: küçük tuvalde hesaplanıp büyütülür
    const v = katV.data;
    for (let j = 0; j < KAT_N; j++) {
      for (let i = 0; i < KAT_N; i++) {
        const x = ((i + 0.5) / KAT_N * 2 - 1) * Em, y = (1 - (j + 0.5) / KAT_N * 2) * Em;
        const q = 4 * (j * KAT_N + i);
        const E = Math.hypot(x, y);
        let a = 0;
        const sin = alanSiniri(e, x, y);
        if (E > sin) a = 1; else a = Math.max(0, 1 - (sin - E) / 2.5);
        const kn = korNokta(e, x, y);
        if (kn < 1) a = Math.max(a, 1 - Math.max(0, kn - 0.7) / 0.3);
        const d = sonuc ? Math.min(1, model.hasarOku(sonuc.D, g, x, y) * 1.4) : 0;
        const r = d > a ? KAYIP : SINIR;
        v[q] = r[0]; v[q + 1] = r[1]; v[q + 2] = r[2]; v[q + 3] = Math.max(a, d) * 248;
      }
    }
    katG.putImageData(katV, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(kat, cx - R, cy - R, 2 * R, 2 * R);
  } else {
    // Perimetri çıktısı: 6° ızgara, gri ton hassasiyet
    const ad = Em === 30 ? 6 : 12;
    const n = Math.ceil(Em / ad);
    ctx.fillStyle = '#f2f2ee'; ctx.fillRect(0, 0, w, w);
    for (let a = -n; a < n; a++) {
      for (let b = -n; b < n; b++) {
        const x = (a + .5) * ad, y = (b + .5) * ad;
        const E = Math.hypot(x, y);
        if (E > alanSiniri(e, x, y)) continue;
        let d = sonuc ? model.hasarOku(sonuc.D, g, x, y) : 0;
        if (korNokta(e, x, y) < 1.2) d = 1;
        const px = cx + a * ad * pxDeg, py = cy - (b + 1) * ad * pxDeg, s = ad * pxDeg;
        ctx.fillStyle = `rgb(${Array(3).fill(Math.round(232 - 222 * d)).join(',')})`;
        ctx.fillRect(px + .5, py + .5, s - 1, s - 1);
      }
    }
  }
  // Kadran renkleri: fare/dokunma izi
  if (izNokta) {
    const px = cx + izNokta.x * pxDeg, py = cy - izNokta.y * pxDeg;
    ctx.strokeStyle = kadranRenk(izNokta.x, izNokta.y);
    ctx.lineWidth = 2.5 * o;
    ctx.beginPath(); ctx.arc(px, py, 7 * o, 0, 7); ctx.stroke();
  }
  // Izgara
  const isikli = durum.sahne !== 'yol';
  ctx.strokeStyle = isikli ? 'rgba(90,110,140,.55)' : 'rgba(255,255,255,.4)';
  ctx.lineWidth = o;
  const halkalar = Em === 30 ? [10, 20, 30] : [30, 60, 90];
  for (const r of halkalar) { ctx.beginPath(); ctx.arc(cx, cy, r * pxDeg, 0, 7); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(200,205,215,.65)';
  ctx.lineWidth = 1.5 * o;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  // Fiksasyon ve yön yazıları
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath(); ctx.arc(cx, cy, 2.6 * o, 0, 7); ctx.fill();
  ctx.font = `600 ${11 * o}px Inter, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const yaz = (t, x, y) => {
    ctx.fillStyle = 'rgba(8,10,14,.68)'; const m = ctx.measureText(t).width + 8 * o;
    ctx.fillRect(x - m / 2, y - 8 * o, m, 16 * o);
    ctx.fillStyle = '#fff'; ctx.fillText(t, x, y);
  };
  const nasalSag = e > 0; // sol gözde nazal sağda
  yaz('Temporal', nasalSag ? cx - R * .68 : cx + R * .68, cy + R * .09);
  yaz('Nazal', nasalSag ? cx + R * .72 : cx - R * .72, cy + R * .09);
  ctx.font = `${10 * o}px Inter, sans-serif`;
  yaz(`${halkalar[1]}°`, cx + 3 * o, cy - halkalar[1] * pxDeg);
}

function birlesikCiz() {
  if (!$('birlesik').open) return; // kapalıyken tuvalin boyutu yok
  const c = $('alan-iki');
  const { w, h } = olc(c);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, w, h);
  const sh = durum.sahne === 'perimetri' ? 'yol' : durum.sahne;
  const yuks = w / 2.1;
  // Sahne 180° genişliğe sığar; yükseklik orantılı kırpılır
  ctx.drawImage(dunyaCiz(sh), 0, (DUNYA_Y - yuks / w * DUNYA_G) / 2, DUNYA_G, yuks / w * DUNYA_G, 0, 0, w, h);
  const NX = 220, NY = 105;
  if (!birlesikCiz.k) { birlesikCiz.k = document.createElement('canvas'); birlesikCiz.k.width = NX; birlesikCiz.k.height = NY; }
  const k = birlesikCiz.k, kg = k.getContext('2d');
  const im = kg.createImageData(NX, NY), v = im.data;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const x = ((i + .5) / NX * 2 - 1) * 90, y = (1 - (j + .5) / NY * 2) * (90 * NY / NX);
      const E = Math.hypot(x, y);
      let en = 1, kayip = false;
      for (const [g, e] of [[0, 1], [1, -1]]) {
        const sin = alanSiniri(e, x, y);
        const dis = E > sin ? 1 : Math.max(0, 1 - (sin - E) / 3);
        const kn = korNokta(e, x, y);
        const kor = kn < 1 ? 1 : 0;
        const d = sonuc ? Math.min(1, model.hasarOku(sonuc.D, g, x, y) * 1.4) : 0;
        const t = Math.max(dis, kor, d);
        if (t < en) { en = t; kayip = d > Math.max(dis, kor); }
      }
      const q = 4 * (j * NX + i), r = kayip ? KAYIP : SINIR;
      v[q] = r[0]; v[q + 1] = r[1]; v[q + 2] = r[2]; v[q + 3] = en * 248;
    }
  }
  kg.putImageData(im, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(k, 0, 0, w, h);
  ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 3 * (window.devicePixelRatio || 1), 0, 7); ctx.fill();
}

// --- Lezyon hesabı ---------------------------------------------------------------------------
function patoloji(id) { return PATOLOJI.find((p) => p.id === id); }

function hesapla() {
  kapsamAyarla();
  const p = patoloji(durum.p);
  kureler = []; alanFn = null;
  if (durum.serbest) kureler = [[...durum.serbest, 4.5 * durum.k]];
  else if (p.kureler) kureler = p.kureler(durum.t, durum.k);
  else if (p.alan) alanFn = p.alan(durum.t);
  if (durum.p === 'normal' && !durum.serbest) alanFn = null;
  sonuc = model.hesapla({ kureler, alan: alanFn });
  sahne3b?.lezyon({ kureler, alanFn, sonuc });
  ciz();
  bilgi();
  bagBaglantiya();
}

let cizBekliyor = false;
function ciz() {
  if (cizBekliyor) return;
  cizBekliyor = true;
  requestAnimationFrame(() => {
    cizBekliyor = false;
    alanCiz($('alan-sol'), 0);
    alanCiz($('alan-sag'), 1);
    birlesikCiz();
    $('alan-lejant').innerHTML = durum.sahne === 'perimetri'
      ? '<span><i class="lj-kayip-p"></i>Koyu kare: görülmeyen nokta</span><span><i class="lj-normal-p"></i>Açık kare: normal</span>' + (durum.kapsam === 30 ? '<span>Merkez 30°; periferik defekt için geniş perimetriyi seçin</span>' : '')
      : '<span><i class="lj-kayip"></i>Lezyonun yaptığı kayıp</span><span><i class="lj-sinir"></i>Normal alan sınırı ve kör nokta</span>';
  });
}

function bilgi() {
  const p = patoloji(durum.p);
  const serbest = !!durum.serbest;
  $('boyut').disabled = !serbest && !p.kureler;
  $('boyut').closest('.gy-boyut').classList.toggle('kapali', $('boyut').disabled);
  $('v-boyut').textContent = serbest ? `${(4.5 * durum.k).toFixed(1)} mm` : `${Math.round(durum.k * 100)}%`;
  const tarafAnlamli = !serbest && p.tek;
  $('taraf').hidden = !tarafAnlamli;
  $('taraf').querySelectorAll('button').forEach((b) => { b.disabled = !tarafAnlamli; b.classList.toggle('on', +b.dataset.t === durum.t); });
  $('taraf-not').textContent = tarafNotu(p, serbest);
  const ad = serbest ? 'Serbest lezyon' : p.ad;
  $('alan-baslik').textContent = serbest ? serbestOzet() : metin(p.alan_ad, durum.t);
  $('b-yer').textContent = serbest ? 'SİZ YERLEŞTİRDİNİZ' : p.evre === 'normal' ? 'REFERANS' : EVRE_AD[p.evre].toLocaleUpperCase('tr');
  $('b-ad').textContent = ad;
  $('b-ozet').textContent = serbest
    ? 'Bu defekt tablodan alınmadı; lezyonun kestiği liflerden hesaplandı. Lezyonu yol boyunca taşıyın: kiazma önünde tek gözlü, kiazmada heteronim, kiazma arkasında homonim olur ve geriye gittikçe iki gözün defekti birbirine benzer.'
    : metin(p.ozet, durum.t);
  const ls = serbest ? [] : p.neden || [];
  $('b-neden').innerHTML = ls.map((n) => `<li>${esc(n)}</li>`).join('');
  $('b-neden-k').hidden = !ls.length;
  $('b-eslik').textContent = serbest ? '' : p.eslik || '';
  $('b-eslik-k').hidden = serbest || !p.eslik;
  $('b-goruntu').textContent = serbest ? '' : p.goruntu || '';
  $('b-goruntu-k').hidden = serbest || !p.goruntu;
}

// Taraf seçiminin anlamı: lezyon nerede, defekt hangi yanda
function tarafNotu(p, serbest) {
  if (serbest) return 'Serbest lezyonda taraf, konduğu yerden belirlenir';
  if (p.evre === 'normal') return 'Lezyon yok';
  if (!p.tek) return 'İki taraflı tutulum';
  const L = yan(durum.t), K = yan(-durum.t);
  if (p.evre === 'retina' || p.evre === 'sinir') return `→ ${L} gözde defekt`;
  if (p.evre === 'kiazma') return `→ ${L} gözde kayıp, ${K} gözde üst temporal defekt`;
  if (p.id === 'hilal') return `→ ${L} yarıküre, ${K} gözün temporal hilali`;
  return `→ ${L} yarıküre, defekt ${K} alanda`;
}

// Defekt 30° dışındaysa perimetri geniş açılır
function kapsamAyarla() {
  if (durum.sahneElle || durum.sahne !== 'perimetri') return;
  durum.kapsam = GENIS.has(durum.p) && !durum.serbest ? 90 : 30;
  $('sahne-sec').value = `perimetri:${durum.kapsam}`;
}

// Serbest lezyonun defektine ad verir: hangi gözde hangi bölge kayıp
function serbestOzet() {
  const o = [[0, 0], [0, 0]], s = [[0, 0], [0, 0]];
  HALKA.forEach((E, i) => {
    if (E > 58) return;
    for (let j = 0; j < ACI_N; j++) {
      const f = (j + .5) / ACI_N * 2 * Math.PI, x = E * Math.cos(f);
      for (const g of [0, 1]) {
        const v = sonuc.D[g * model.lifN + i * ACI_N + j];
        const ix = x >= 0 ? 1 : 0;
        o[g][ix] += v; s[g][ix]++;
      }
    }
  });
  const y = (g, ix) => o[g][ix] / s[g][ix];
  const L = y(0, 0) + y(0, 1), R = y(1, 0) + y(1, 1);
  if (L + R < 0.04) return 'Bu noktada kayda değer bir defekt yok';
  const es = 0.06;
  if (L < es) return 'Yalnız sağ gözde defekt: kiazma öncesi';
  if (R < es) return 'Yalnız sol gözde defekt: kiazma öncesi';
  const hom0 = y(0, 0) + y(1, 0), hom1 = y(0, 1) + y(1, 1);
  if (y(0, 0) > .05 && y(1, 1) > .05 && y(0, 1) < es && y(1, 0) < es) return 'İki temporal alanda defekt: heteronim (kiazma)';
  if (y(0, 1) > .05 && y(1, 0) > .05 && y(0, 0) < es && y(1, 1) < es) return 'İki nazal alanda defekt: heteronim';
  if (hom0 > hom1 * 3) return 'Sol alanda homonim defekt: sağ retrokiazmal';
  if (hom1 > hom0 * 3) return 'Sağ alanda homonim defekt: sol retrokiazmal';
  return 'İki tarafı tutan karışık defekt';
}

function bagBaglantiya() {
  const q = new URLSearchParams();
  q.set('p', durum.serbest ? 'serbest' : durum.p);
  q.set('t', durum.t);
  q.set('k', durum.k);
  if (durum.serbest) { q.set('x', durum.serbest[0].toFixed(1)); q.set('y', durum.serbest[1].toFixed(1)); q.set('z', durum.serbest[2].toFixed(1)); }
  history.replaceState(null, '', '#' + q);
  $('pupil-link').href = 'gorme-pupil.html#' + q; // aynı lezyonla pupilla sayfasına geç
}
function baglantidanOku() {
  const q = new URLSearchParams(location.hash.slice(1));
  const p = q.get('p');
  if (q.has('t')) durum.t = +q.get('t') < 0 ? -1 : 1;
  if (q.has('k')) durum.k = Math.min(1.6, Math.max(.5, +q.get('k') || 1));
  durum.serbest = null;
  if (p === 'serbest' && q.has('x')) { durum.serbest = [+q.get('x'), +q.get('y'), +q.get('z')]; durum.p = 'normal'; $('gelismis').open = true; }
  else if (patoloji(p)) durum.p = p;
  durum.durak = patoloji(durum.p).evre;
  $('boyut').value = durum.k;
}

// --- Seçim şeridi ---------------------------------------------------------------------------
function duraklariKur() {
  $('duraklar').innerHTML = DURAK.map(([id, ad]) => `<li><button type="button" data-d="${id}">${ad}</button></li>`).join('');
  $('duraklar').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    durum.durak = b.dataset.d;
    durum.serbest = null;
    const ilk = PATOLOJI.find((p) => p.evre === durum.durak);
    durum.p = ilk.id; durum.k = 1; $('boyut').value = 1;
    secimCiz(); hesapla();
  });
  $('chipler').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    durum.p = b.dataset.p; durum.serbest = null; durum.k = 1; $('boyut').value = 1;
    secimCiz(); hesapla();
  });
}
function secimCiz() {
  $('duraklar').querySelectorAll('button').forEach((b) => b.classList.toggle('on', !durum.serbest && b.dataset.d === durum.durak));
  const ser = $('duraklar'), etkin = ser.querySelector('.on'); // dar ekranda etkin durak görünür kalsın
  if (etkin) ser.scrollLeft = etkin.parentElement.offsetLeft - ser.offsetLeft - (ser.clientWidth - etkin.offsetWidth) / 2;
  const ls = PATOLOJI.filter((p) => p.evre === durum.durak);
  $('chipler').innerHTML = ls.length > 1 || durum.durak !== 'normal'
    ? ls.map((p) => `<button type="button" class="gy-chip${!durum.serbest && p.id === durum.p ? ' on' : ''}" data-p="${p.id}">${esc(p.ad)}</button>`).join('')
    : '<span class="muted not">Bir durak seçin ya da "Serbest lezyon" ile yolun herhangi bir yerine lezyon koyun.</span>';
}

function segKur(id, ad, fn) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    fn(b.dataset[ad]);
  });
}

// --- Alanda iz sürme ----------------------------------------------------------------------------
let izNokta = null;
function izBagla(c, g) {
  const oku = (ev) => {
    const r = c.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width * 2 - 1) * durum.kapsam * (r.width / (r.width - 4));
    const y = (1 - (ev.clientY - r.top) / r.height * 2) * durum.kapsam * (r.width / (r.width - 4));
    const E = Math.hypot(x, y);
    const e = g ? -1 : 1;
    if (E > durum.kapsam || E > alanSiniri(e, x, y)) return;
    izNokta = { x, y };
    const phi = Math.atan2(y, x);
    const Eg = Math.max(1, E);
    sahne3b?.iz([{ e: 1, E: Eg, phi, renk: g === 0 ? '#ffffff' : '#9fa8b8' }, ...(E <= alanSiniri(-1, x, y) ? [{ e: -1, E: Eg, phi, renk: g === 1 ? '#ffffff' : '#9fa8b8' }] : [])]);
    const capraz = (x >= 0 ? 1 : -1) !== e;
    const hed = x >= 0 ? 'Sol' : 'Sağ';
    const kiyi = y >= 0 ? 'alt kıyı (lingual)' : 'üst kıyı (kuneus)';
    const hasar = sonuc ? model.hasarOku(sonuc.D, g, x, y) : 0;
    const ret = `${y >= 0 ? 'alt' : 'üst'} ${x * e > 0 ? 'temporal' : 'nazal'} retina`;
    $('alan-bilgi').innerHTML = `<b>${g ? 'Sağ' : 'Sol'} göz, ${Math.round(E)}°:</b> ${ret} → ${capraz ? 'kiazmada çaprazlaşır' : 'çaprazlaşmaz'} → ${hed} LGN → ${y >= 0 && E > 8 ? 'Meyer halkası' : y < 0 && E > 8 ? 'paryetal demet' : 'merkez demet'} → ${hed} V1 ${kiyi}${hasar > 0.5 ? ' · <b style="color:var(--bad)">bu lif kesik</b>' : ''}`;
    ciz();
  };
  c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); oku(e); });
  c.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') oku(e); });
}

// --- Serbest lezyon ------------------------------------------------------------------------------------
function yerlestirmeModu(ac) {
  durum.yerlestir = ac;
  $('serbest').setAttribute('aria-pressed', ac ? 'true' : 'false');
  $('sahne').classList.toggle('yerlestir', ac);
  $('ipucu').hidden = !ac;
  sahne3b?.orbit(!ac);
  if (ac) $('gelismis').open = true;
  if (ac && !durum.serbest) { durum.k = 1; $('boyut').value = 1; }
}
function sahneBagla() {
  const koy = (ev) => {
    const p = sahne3b.liftenNokta(ev.clientX, ev.clientY);
    if (!p) return;
    durum.serbest = p;
    secimCiz();
    hesapla();
  };
  const t = sahne3b.tuval;
  t.addEventListener('pointerdown', (e) => { if (!durum.yerlestir) return; t.setPointerCapture(e.pointerId); koy(e); });
  t.addEventListener('pointermove', (e) => { if (durum.yerlestir && e.buttons) koy(e); });
}

// --- Açılış -----------------------------------------------------------------------------------------------
// Açılır menüler (Gelişmiş, Görünüm): dışına tıklayınca ya da Esc ile kapanır
function menuleriKur() {
  const menuler = [...document.querySelectorAll('details.gy-gorunum, details.gy-gelismis')];
  document.addEventListener('pointerdown', (e) => { for (const m of menuler) if (m.open && !m.contains(e.target)) m.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const m of menuler) m.open = false; });
}

async function basla() {
  const meta = await fetch('data/optik/optik.json').then((r) => r.json());
  model = modelKur(meta);
  menuleriKur();
  duraklariKur();
  baglantidanOku();
  secimCiz();
  $('anahtar').innerHTML = [['su', 'Sağ üst alan'], ['sa', 'Sağ alt alan'], ['lu', 'Sol üst alan'], ['la', 'Sol alt alan']]
    .map(([k, ad]) => `<span><i style="background:${KADRAN[k]}"></i>${ad}</span>`).join('') + '<span class="muted">Parlak: makula · Kırmızı: kesik lif</span>';

  segKur('taraf', 't', (v) => { durum.t = +v; hesapla(); });
  $('sahne-sec').addEventListener('change', (e) => {
    const [sahne, kapsam] = e.target.value.split(':');
    durum.sahne = sahne; durum.kapsam = +kapsam; durum.sahneElle = true;
    ciz();
  });
  $('birlesik').addEventListener('toggle', () => ciz());
  // Bağlantı elle değişince (geri tuşu, paylaşılan bağlantı) sayfa güncellenir
  window.addEventListener('hashchange', () => { baglantidanOku(); secimCiz(); hesapla(); });
  segKur('gorunum', 'g', (v) => sahne3b?.gorunum(v));
  $('boyut').addEventListener('input', () => { durum.k = +$('boyut').value; hesapla(); });
  $('serbest').addEventListener('click', () => yerlestirmeModu(!durum.yerlestir));
  izBagla($('alan-sol'), 0);
  izBagla($('alan-sag'), 1);
  new ResizeObserver(() => ciz()).observe($('alan-sol'));

  // Alanlar 3B modeli beklemez; sahne yüklenince lezyon yansıtılır
  hesapla();
  try {
    sahne3b = await gormeSahnesi($('sahne'), $('etiketler'), model);
    $('yukleniyor').hidden = true;
    $('yukleniyor').remove();
    sahneBagla();
    const k = (id, fn) => $(id).addEventListener('change', (e) => fn(e.target.checked));
    k('t-etiket', sahne3b.etiket); k('t-kabuk', sahne3b.kabuk); k('t-lif', sahne3b.lifler); k('t-sinyal', sahne3b.sinyal);
    hesapla();
  } catch (hata) {
    console.error(hata);
    $('yukleniyor').textContent = '3B model yüklenemedi. Görme alanları çalışmaya devam eder.';
  }
}
basla();
