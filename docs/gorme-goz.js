// Göz ve görüntü simülasyonu: indirgenmiş göz modeliyle odak, kırma kusurları, uyum, pupilla etkisi ve göz hastalıklarında görüntü.
// Hesap: U = V + P (diyoptri), retinadaki gereken verjans n/L. Bulanıklık açısı (dk) = 3,44 × pupilla (mm) × |odak hatası (D)|.
const $ = (id) => document.getElementById(id);
const N = 1.336, F0 = 60, L0 = 1336 / 60; // indirgenmiş göz: 24 mm anatomik uzunluk = 22,27 mm indirgenmiş
const tr = (v, d = 2) => v.toFixed(d).replace('.', ',');
const isaretli = (v, d = 2) => (v > 0 ? '+' : '') + tr(v, d);

const VARS = { al: 24, uzak: 0, yas: 30, pup: 4, sil: 0, eks: 90, cam: 0, kat: 0 };
const ONAYAR = [
  { id: 'emetrop', ad: 'Normal göz', tur: 'Referans', d: {},
    ozet: 'Uzaktaki ışınlar uyum olmadan tam retinaya odaklanır. Yakına bakınca lens kalınlaşır (uyum) ve odak yine retinada kalır. Bakılan uzaklığı değiştirip lensi izleyin.',
    neden: '', yon: '' },
  { id: 'miyopi', ad: 'Miyopi', tur: 'Kırma kusuru', d: { al: 25.2 },
    ozet: 'Göz, gücüne göre fazla uzundur; uzak ışınlar retinanın önünde odaklanır. Yakın net, uzak bulanıktır. Her 1 mm uzama yaklaşık 2,7 D miyopi yapar. İçbükey (eksi) cam odağı retinaya geri taşır; "Doğru camı tak" ile deneyin.',
    neden: 'Eksen uzaması (çocuklukta yakın çalışma, az dış ortam, kalıtım). Dejeneratif miyopi: retina dekolmanı, makula hastalığı ve glokom riski artar.', yon: 'Refraksiyon. İlerleyen çocuk miyopisinde düşük doz atropin, özel lensler. Yüksek miyopide düzenli fundus muayenesi.' },
  { id: 'hipermetropi', ad: 'Hipermetropi', tur: 'Kırma kusuru', d: { al: 22.8, yas: 45 },
    ozet: 'Göz kısadır; odak retinanın arkasındadır. Genç hasta uyumla bunu kapatır, yani net görür ama yorulur. Yaş ilerleyip uyum azalınca önce yakın, sonra uzak bulanıklaşır. Yaş kaydırıcısını gezdirin.',
    neden: 'Kısa eksen. Çocukta akomodatif şaşılık ve ambliyopi nedeni. Dar açı yapısı: açı kapanması glokomu riski.', yon: 'Dışbükey (artı) cam. Çocukta sikloplejik refraksiyon şarttır.' },
  { id: 'astigmat', ad: 'Astigmatizma', tur: 'Kırma kusuru', d: { sil: 2.5, eks: 180 },
    ozet: 'Kornea küre değil, yumurta gibidir: iki dik meridyenin gücü farklıdır. Tek odak yerine iki odak çizgisi oluşur (Sturm konoidi). Görüntü her uzaklıkta bir yönde bulanıktır; ekseni çevirip yönün değişimini izleyin.',
    neden: 'Kornea eğrilik farkı, keratokonus (ilerleyen düzensiz astigmat), cerrahi sonrası, pterjium.', yon: 'Silindirik cam veya torik lens. İlerleyen genç astigmatta kornea topografisi: keratokonus.' },
  { id: 'presbiyopi', ad: 'Presbiyopi', tur: 'Yaşlanma', d: { yas: 58, uzak: 2.5 },
    ozet: 'Lens sertleştikçe uyum azalır (yaklaşık 45 yaşından sonra belirgin). Uzak normal olsa bile 40 cm\'deki yazı bulanıklaşır, kol uzatınca düzelir. Bu örnekte hasta yakına bakıyor.',
    neden: 'Lensin yaşa bağlı sertleşmesi; hastalık değildir.', yon: 'Okuma gözlüğü veya multifokal lens (yaklaşık +1 ile +2,5 D).' },
  { id: 'katarakt', ad: 'Katarakt', tur: 'Ortam kesafeti', d: { yas: 72, kat: 0.7 }, etki: 'katarakt',
    ozet: 'Lens saydamlığını kaybeder: görüntü soluk, sararmış ve puslu olur, karşıdan gelen ışıkta kamaşma artar. Görme alanı daralmaz, tüm alan puslanır. Pupilla ve fundus kırmızı yansıması değerlendirilir.',
    neden: 'Yaş, diyabet, steroid, travma, UV, üveit.', yon: 'Günlük yaşamı etkiliyorsa fakoemülsifikasyon ve göz içi lens.' },
  { id: 'amd', ad: 'Makula dejenerasyonu', tur: 'Retina', d: { yas: 76 }, etki: 'amd',
    ozet: 'Merkezdeki koni fotoreseptörleri bozulur: okunan kelime kaybolur, düz çizgiler eğrilir (metamorfopsi). Çevre korunduğu için hasta odada dolaşabilir, ama yüz tanıyamaz.',
    neden: 'Yaş, sigara, kalıtım. Kuru tip: drusen, atrofi. Yaş tip: koroid neovaskülarizasyon.', yon: 'OCT, OCT-A. Yaş tipte anti-VEGF: ani kayıp acildir. Ev takibinde Amsler.' },
  { id: 'dr', ad: 'Diyabetik retinopati', tur: 'Retina', d: { yas: 54 }, etki: 'dr',
    ozet: 'Damar duvarı bozulur: mikroanevrizma, kanama ve eksuda. Makula ödemi merkezi bulanıklık yapar; vitreus kanamasında siyah yüzen lekeler ve perde görülür. Erken dönemde hasta belirti vermez.',
    neden: 'Süre ve glisemik kontrol, hipertansiyon, nefropati, gebelik.', yon: 'Yıllık dilate fundus. Glisemi ve TA kontrolü; ödemde anti-VEGF, proliferatif tipte panretinal fotokoagülasyon.' },
  { id: 'protan', ad: 'Protanopi', tur: 'Renk görme', d: {}, etki: 'protan',
    ozet: 'L konileri yoktur: kırmızı koyu görünür ve yeşille karışır. Trafik lambası konumdan okunur. X\'e bağlı kalıtılır, erkeklerde sıktır.',
    neden: 'OPN1LW gen hatası (doğuştan). Edinilmiş renk kaybı optik sinir hastalığını düşündürür.', yon: 'Ishihara testi. Tek gözde yeni başlayan renk soluklaşması (kırmızı desatürasyonu) optik nöropati için alarmdır.' },
  { id: 'deutan', ad: 'Döteranopi', tur: 'Renk görme', d: {}, etki: 'deutan',
    ozet: 'M konileri yoktur; kırmızı-yeşil ayrımı bozulur fakat kırmızının parlaklığı korunur. Doğuştan renk kusurlarının en sık biçimidir.',
    neden: 'OPN1MW gen hatası (X\'e bağlı).', yon: 'Ishihara, anomaloskop. Mesleki danışmanlık (pilotluk, elektrik).' },
  { id: 'tritan', ad: 'Tritanopi', tur: 'Renk görme', d: {}, etki: 'tritan',
    ozet: 'S konileri yoktur; mavi-sarı ayrımı bozulur. Nadirdir ve doğuştansa otozomal dominanttır. Edinilmiş biçimi sık görülür: diyabet, glokom, katarakt ve bazı ilaçlar.',
    neden: 'OPN1SW gen hatası; edinilmiş retina ve optik sinir hastalığı.', yon: 'Mavi-sarı kusur edinilmişse altta yatan hastalık aranır (Farnsworth D-15).' },
];
let onayar = ONAYAR[0];

// --- Model ---------------------------------------------------------------------
function hesap() {
  const L = (L0 + (VARS.al - 24)) / 1000;
  const hedef = N / L;
  const Rx = hedef - F0;                       // uzak için gereken cam
  const Amax = Math.max(0, 18.5 - 0.3 * VARS.yas);
  const V = -VARS.uzak + VARS.cam;             // göze gelen verjans (cam dahil)
  const A = Math.min(Amax, Math.max(0, hedef - F0 - V));
  const U = V + F0 + A;
  const hata = U - hedef;                      // + odak önde, - odak arkada
  const h1 = hata + VARS.sil / 2, h2 = hata - VARS.sil / 2;
  const bulanik = (d) => 3.44 * VARS.pup * Math.abs(d); // dk
  const b1 = bulanik(h1), b2 = bulanik(h2);
  const mar = Math.max(1, 0.22 * Math.max(b1, b2, (b1 + b2) / 2)) * (1 + 2.2 * VARS.kat);
  return { L, hedef, Rx, Amax, V, A, U, hata, h1, h2, b1, b2, mar };
}

// --- Sahne (16° geniş): solda yol ve renkler, sağda Snellen ---------------------------
const SW = 1200, SH = Math.round(SW / 1.45), PX_DAK = SW / (16 * 60);
const kay = document.createElement('canvas');
kay.width = SW; kay.height = SH;
(function sahne() {
  const g = kay.getContext('2d');
  const gok = g.createLinearGradient(0, 0, 0, SH * .55);
  gok.addColorStop(0, '#79b2e3'); gok.addColorStop(1, '#e5f1f8');
  g.fillStyle = gok; g.fillRect(0, 0, SW, SH * .55);
  g.fillStyle = '#6e9460'; g.fillRect(0, SH * .55, SW, SH * .45);
  g.fillStyle = '#8fa9c4'; g.beginPath(); g.moveTo(0, SH * .55);
  for (let x = 0; x <= 620; x += 16) g.lineTo(x, SH * .55 - 90 * (0.6 + 0.4 * Math.sin(x / 70) * Math.sin(x / 31)));
  g.lineTo(620, SH * .55); g.fill();
  g.fillStyle = '#4b4f55'; g.beginPath(); g.moveTo(280, SH * .55); g.lineTo(310, SH * .55); g.lineTo(600, SH); g.lineTo(-20, SH); g.fill();
  g.fillStyle = '#ffd34d'; for (let i = 0; i < 8; i++) { const t = Math.pow(i / 8, 2); const y = SH * .55 + t * SH * .45; g.fillRect(295 - 1 - t * 3, y, 2 + t * 6, 6 + t * 26); }
  // Trafik lambası ve renkli meyveler: renk görme için
  g.fillStyle = '#22252a'; g.fillRect(84, 150, 58, 158); g.fillRect(108, 306, 10, 160);
  for (const [c, y] of [['#e33131', 178], ['#f4c21c', 228], ['#29b34a', 278]]) { g.fillStyle = c; g.beginPath(); g.arc(113, y, 20, 0, 7); g.fill(); }
  for (const [c, x, y, r] of [['#d92b2b', 400, 560, 40], ['#3aa53a', 470, 575, 38], ['#e8c21a', 540, 562, 36], ['#e26b1d', 340, 600, 32], ['#2a56c6', 200, 590, 36], ['#8c3fb5', 130, 620, 30]]) {
    g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - r * .3, y - r * .35, r * .25, 0, 7); g.fill();
  }
  // Snellen levhası: harf yüksekliği 5 dk / keskinlik
  const X0 = 640;
  g.fillStyle = '#f7f6f1'; g.fillRect(X0, 26, SW - X0 - 26, SH - 52);
  g.strokeStyle = '#555'; g.strokeRect(X0, 26, SW - X0 - 26, SH - 52);
  g.fillStyle = '#121418'; g.textBaseline = 'middle';
  const SIR = [[0.1, 'E'], [0.16, 'F P'], [0.2, 'T O Z'], [0.25, 'L P E D'], [0.33, 'P E C F D'], [0.5, 'E D F C Z P'], [0.67, 'F E L O P Z D'], [1, 'D E F P O T E C']];
  let y = 62;
  const cx = X0 + (SW - X0 - 26) / 2;
  for (const [v, t] of SIR) {
    const h = (5 / v) * PX_DAK * 1.0;
    g.font = `700 ${Math.max(5, h * 1.3)}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.fillText(t, cx, y + h / 2);
    g.font = '13px Arial, sans-serif'; g.textAlign = 'right';
    g.fillStyle = '#5a5f68'; g.fillText(tr(v, v < 1 ? 2 : 1), SW - 36, y + h / 2);
    g.fillStyle = '#121418';
    y += h + 20;
  }
})();

// --- Görüntü işleme: Safari'de de çalışması için çoklu çizimle yönlü bulanıklık ---------
const ara1 = document.createElement('canvas'), ara2 = document.createElement('canvas');
function yonlu(kaynak, hedef, dx, dy, adim) {
  const g = hedef.getContext('2d');
  g.globalAlpha = 1;
  g.clearRect(0, 0, hedef.width, hedef.height);
  g.imageSmoothingEnabled = true;
  for (let i = 0; i < adim; i++) {
    const t = adim > 1 ? i / (adim - 1) - 0.5 : 0;
    g.globalAlpha = 1 / (i + 1);
    g.drawImage(kaynak, t * dx, t * dy, hedef.width, hedef.height);
  }
  g.globalAlpha = 1;
}
const lin = new Float32Array(256).map((_, i) => { const s = i / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
const srgb = (v) => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
const RENK = { // Machado ve ark. 2009, şiddet 1,0
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};
function renkUygula(g, w, h, m) {
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = lin[d[i]], gg = lin[d[i + 1]], b = lin[d[i + 2]];
    d[i] = srgb(m[0] * r + m[1] * gg + m[2] * b);
    d[i + 1] = srgb(m[3] * r + m[4] * gg + m[5] * b);
    d[i + 2] = srgb(m[6] * r + m[7] * gg + m[8] * b);
  }
  g.putImageData(im, 0, 0);
}
function tohumlu(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function gorCiz(h) {
  const c = $('gor');
  const r = c.getBoundingClientRect();
  const o = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(10, Math.round(r.width * o)), yk = Math.max(10, Math.round(r.height * o));
  if (c.width !== w || c.height !== yk) { c.width = w; c.height = yk; }
  for (const a of [ara1, ara2]) if (a.width !== w || a.height !== yk) { a.width = w; a.height = yk; }
  const pxDak = w / (16 * 60);
  const g = c.getContext('2d');
  // Astigmat: h1 meridyeni eksene göre, h2 ona dik. Tekdüze disk yerine iki geçişli kutu
  const a = VARS.eks * Math.PI / 180;
  const u1 = h.b1 * pxDak, u2 = h.b2 * pxDak;
  const adim = (u) => Math.min(25, Math.max(1, Math.ceil(u / 1.2)));
  if (u1 < 0.5 && u2 < 0.5) {
    ara2.getContext('2d').drawImage(kay, 0, 0, w, yk);
  } else {
    yonlu(kay, ara1, Math.cos(a) * u1, -Math.sin(a) * u1, adim(u1));
    yonlu(ara1, ara2, Math.sin(a) * u2, Math.cos(a) * u2, adim(u2));
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const etki = onayar.etki;
  if (etki === 'amd') {
    // Merkezde dalgalanma (metamorfopsi): yatay şeritler kaydırılır, sonra merkez karartılır
    const b = yk / 60;
    for (let i = 0; i < 60; i++) {
      const y = i * b;
      const d = (y - yk / 2) / (yk * .42);
      const m = Math.max(0, 1 - d * d);
      const kaym = Math.sin(i * .9) * 14 * o * m;
      g.drawImage(ara2, 0, y, w, b + 1, kaym, y, w, b + 1);
    }
    const gr = g.createRadialGradient(w / 2, yk / 2, 0, w / 2, yk / 2, yk * .26);
    gr.addColorStop(0, 'rgba(38,34,30,.97)'); gr.addColorStop(.62, 'rgba(50,46,40,.82)'); gr.addColorStop(1, 'rgba(50,46,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, yk);
  } else {
    g.drawImage(ara2, 0, 0);
  }
  if (etki === 'dr') {
    const t = tohumlu(77);
    // Makula ödemi: merkez pusu; kanama ve yüzen lekeler
    const gr = g.createRadialGradient(w / 2, yk / 2, 0, w / 2, yk / 2, yk * .3);
    gr.addColorStop(0, 'rgba(120,110,95,.5)'); gr.addColorStop(1, 'rgba(120,110,95,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, yk);
    for (let i = 0; i < 55; i++) {
      const x = t() * w, y = t() * yk, s = (1 + t() * t() * 22) * o;
      g.fillStyle = `rgba(${20 + t() * 60},${6 + t() * 10},${6 + t() * 10},${.35 + t() * .55})`;
      g.beginPath(); g.ellipse(x, y, s, s * (.5 + t() * .6), t() * 3, 0, 7); g.fill();
    }
  }
  if (VARS.kat > 0) {
    const k = VARS.kat;
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(255,${Math.round(255 - 62 * k)},${Math.round(255 - 160 * k)})`;
    g.fillRect(0, 0, w, yk);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgba(214,206,186,${0.5 * k})`;
    g.fillRect(0, 0, w, yk);
    g.globalCompositeOperation = 'screen';
    const gr = g.createRadialGradient(w * .095, yk * .3, 0, w * .095, yk * .3, w * (.1 + .3 * k));
    gr.addColorStop(0, `rgba(255,250,225,${.85 * k})`); gr.addColorStop(1, 'rgba(255,250,225,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, yk);
    g.globalCompositeOperation = 'source-over';
  }
  // Pupilla retinaya düşen ışığı değiştirir: 4 mm'ye göre hafif parlaklık
  const par = Math.log2((VARS.pup * VARS.pup) / 16) * 0.09;
  if (Math.abs(par) > 0.01) { g.fillStyle = par > 0 ? `rgba(255,255,255,${par})` : `rgba(0,0,0,${-par})`; g.fillRect(0, 0, w, yk); }
  if (RENK[etki]) renkUygula(g, w, yk, RENK[etki]);
  // Retinadaki ters görüntü
  const t = $('ters');
  const tr_ = t.getBoundingClientRect();
  const tw = Math.max(10, Math.round(tr_.width * o)), th = Math.max(10, Math.round(tr_.height * o));
  if (t.width !== tw || t.height !== th) { t.width = tw; t.height = th; }
  const tg = t.getContext('2d');
  tg.save();
  tg.clearRect(0, 0, tw, th);
  tg.beginPath(); tg.ellipse(tw / 2, th / 2, tw / 2 - o, th / 2 - o, 0, 0, 7); tg.clip();
  tg.fillStyle = '#7a2a1c'; tg.fillRect(0, 0, tw, th);
  tg.translate(tw, th); tg.scale(-1, -1);
  tg.globalAlpha = .96;
  tg.drawImage(c, 0, 0, tw, th);
  tg.restore();
  tg.strokeStyle = 'rgba(255,255,255,.75)'; tg.lineWidth = 1.2 * o;
  tg.beginPath(); tg.arc(tw / 2, th / 2, 7 * o, 0, 7); tg.stroke();
  tg.fillStyle = '#fff'; tg.font = `600 ${10 * o}px Inter, sans-serif`; tg.textAlign = 'center';
  tg.fillText('Fovea', tw / 2, th / 2 + 19 * o);
}

// --- Işın diyagramı --------------------------------------------------------------
function isinCiz(h) {
  const c = $('isin');
  const r = c.getBoundingClientRect();
  const o = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(r.width * o), yk = Math.round(r.height * o);
  if (!w || !yk) return;
  if (c.width !== w || c.height !== yk) { c.width = w; c.height = yk; }
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, yk);
  const cy = yk / 2;
  const Lmm = VARS.al;
  const olc = Math.min(w * .5 / 30, yk * .78 / 25);   // px/mm
  const X_K = w * .46;                                // kornea tepesi
  const X_H = X_K + 1.7 * olc;                        // asal düzlem
  const X_R = X_K + Lmm * olc;                        // retina
  const Rg = Math.min(Lmm, 26) / 2 * olc * .98;
  const gx = (X_K + X_R) / 2;
  // Göz: sklera
  g.fillStyle = 'rgba(190,215,235,.08)';
  g.strokeStyle = 'rgba(235,235,225,.75)'; g.lineWidth = 2.5 * o;
  g.beginPath(); g.ellipse(gx, cy, (X_R - X_K) / 2, Rg, 0, 0, 7); g.fill(); g.stroke();
  // Retina
  g.strokeStyle = '#d1503f'; g.lineWidth = 3.5 * o;
  g.beginPath(); g.ellipse(gx, cy, (X_R - X_K) / 2, Rg, 0, -1.05, 1.05); g.stroke();
  // Kornea
  g.strokeStyle = '#a8d8ff'; g.lineWidth = 3 * o;
  g.beginPath(); g.ellipse(X_K + 5.2 * olc, cy, 5.8 * olc, 6.2 * olc, 0, Math.PI - 0.95, Math.PI + 0.95); g.stroke();
  // İris ve lens
  const ry = VARS.pup / 2 * olc;
  g.strokeStyle = '#5f8fb0'; g.lineWidth = 3.5 * o; g.beginPath();
  g.moveTo(X_K + 3.4 * olc, cy - ry); g.lineTo(X_K + 3.4 * olc, cy - 6.1 * olc);
  g.moveTo(X_K + 3.4 * olc, cy + ry); g.lineTo(X_K + 3.4 * olc, cy + 6.1 * olc); g.stroke();
  const kal = (1.75 + h.A * 0.09) * olc;
  g.fillStyle = `rgba(${240 - VARS.kat * 40},${232 - VARS.kat * 90},${215 - VARS.kat * 170},${.22 + VARS.kat * .65})`;
  g.strokeStyle = 'rgba(240,235,220,.85)'; g.lineWidth = 1.5 * o;
  g.beginPath(); g.ellipse(X_K + 5.4 * olc, cy, kal, 4.6 * olc, 0, 0, 7); g.fill(); g.stroke();
  // Cam
  const X_C = X_K - 2.6 * olc * 2;
  if (Math.abs(VARS.cam) > 0.01) {
    g.strokeStyle = '#b9f2c7'; g.lineWidth = 2.5 * o; g.beginPath();
    const e = VARS.cam < 0 ? -1 : 1, dy = 8 * olc, b = Math.min(7, Math.abs(VARS.cam)) * .55 * olc * .6;
    g.moveTo(X_C - 3 * o, cy - dy); g.quadraticCurveTo(X_C - e * b * 1.5 - 3 * o, cy, X_C - 3 * o, cy + dy);
    g.moveTo(X_C + 3 * o, cy - dy); g.quadraticCurveTo(X_C + e * b * 1.5 + 3 * o, cy, X_C + 3 * o, cy + dy);
    g.moveTo(X_C - 3 * o, cy - dy); g.lineTo(X_C + 3 * o, cy - dy);
    g.moveTo(X_C - 3 * o, cy + dy); g.lineTo(X_C + 3 * o, cy + dy); g.stroke();
  }
  // Işınlar: yükseklik y (mm) pupilla içinde; eğim verjansla. Astigmatta iki renk, iki odak
  const demet = (hata, renk, yon, yaz) => {
    const U = h.hedef + hata;
    const i_mm = N / U * 1000;
    const Xf = X_H + i_mm * olc;
    g.strokeStyle = renk; g.lineWidth = 1.3 * o; g.globalAlpha = .9;
    for (const q of [-1, -.5, .5, 1]) {
      const y = q * VARS.pup / 2;                       // mm, asal düzlemde
      const Y = cy + yon * y * olc;
      // Dışarıda: cama kadar V0 = -uzak, camdan sonra V
      const V0 = -VARS.uzak;
      const eg = (V) => -V * y / 1000;                  // y mm başına eğim (mm/mm)
      const yc = y + (X_H - X_C) / olc * eg(h.V) * -1;  // camdaki yükseklik
      const Yc = cy + yon * yc * olc;
      const var0 = Math.abs(VARS.cam) > .01 ? yc : y;
      const xs = 0, Ys = cy + yon * (var0 - (X_C - xs) / olc * -(-V0 * var0 / 1000)) * olc;
      g.beginPath();
      if (Math.abs(VARS.cam) > .01) { g.moveTo(xs, Ys); g.lineTo(X_C, Yc); g.lineTo(X_H, Y); }
      else { g.moveTo(xs, Ys); g.lineTo(X_H, Y); }
      // Odak retinanın önündeyse ışın orada kesişip devam eder
      const Yr = cy + yon * y * (1 - (X_R - X_H) / (Xf - X_H)) * olc;
      g.lineTo(X_R, Yr);
      g.stroke();
      if (Xf > X_R && Xf < w) { g.setLineDash([3 * o, 4 * o]); g.beginPath(); g.moveTo(X_R, Yr); g.lineTo(Xf, cy); g.stroke(); g.setLineDash([]); }
    }
    g.globalAlpha = 1;
    if (Xf > X_H && Xf < w) {
      g.fillStyle = renk; g.beginPath(); g.arc(Math.min(Xf, w - 4 * o), cy, 3.2 * o, 0, 7); g.fill();
      if (yaz) { g.font = `${10 * o}px Inter, sans-serif`; g.textAlign = 'center'; g.fillText(yaz, Math.min(Xf, w - 30 * o), cy - 10 * o); }
    }
    return Xf;
  };
  if (VARS.sil > 0.05) {
    demet(h.h1, '#7fd4ff', -1, '');
    demet(h.h2, '#ffb36b', 1, '');
  } else {
    demet(h.hata, '#ffe27a', 1, Math.abs(h.hata) > .15 ? 'Odak' : '');
    demet(h.hata, '#ffe27a', -1, '');
  }
  // Retinadaki bulanıklık halkası
  const bl = Math.abs(Math.max(Math.abs(h.h1), Math.abs(h.h2))) / Math.max(h.hedef, 1) * VARS.pup * olc * 1.2;
  if (bl > 1) { g.strokeStyle = '#ff4d5e'; g.lineWidth = 4 * o; g.beginPath(); g.moveTo(X_R + 4 * o, cy - bl / 2); g.lineTo(X_R + 4 * o, cy + bl / 2); g.stroke(); }
  // Yazılar
  g.fillStyle = '#c9ced8'; g.font = `${10.5 * o}px Inter, sans-serif`; g.textAlign = 'center';
  g.fillText('Kornea', X_K, cy - Rg - 6 * o);
  g.fillText('Lens', X_K + 5.4 * olc, cy + 6.4 * olc);
  g.fillStyle = '#ee8b7b'; g.fillText('Retina', Math.min(X_R, w - 26 * o), cy - Rg - 6 * o);
  g.fillStyle = '#a7aebb'; g.textAlign = 'left';
  const uzakY = VARS.uzak < 0.02 ? 'Uzak (paralel ışın)' : `Cisim ${tr(100 / VARS.uzak, 0)} cm`;
  g.fillText(uzakY, 8 * o, 16 * o);
  if (Math.abs(VARS.cam) > .01) { g.fillStyle = '#b9f2c7'; g.textAlign = 'center'; g.fillText(`${isaretli(VARS.cam)} D`, X_C, cy - 8 * olc - 6 * o); }
}

// --- Arayüz -----------------------------------------------------------------------
const AYAR = [
  ['al', (v) => `${tr(v, 1)} mm`], ['uzak', (v) => (v < 0.02 ? 'Uzak (∞)' : `${tr(100 / v, 0)} cm`)], ['yas', (v) => `${v}`], ['pup', (v) => `${tr(v, 1)} mm`],
  ['sil', (v) => `${tr(v, 2)} D`], ['eks', (v) => `${v}°`], ['cam', (v) => `${isaretli(v)} D`], ['kat', (v) => (v < 0.02 ? 'Yok' : `%${Math.round(v * 100)}`)],
];
const SIFIR = { al: 24, uzak: 0, yas: 30, pup: 4, sil: 0, eks: 90, cam: 0, kat: 0 };

let bekle = false;
function guncelle() {
  for (const [k, f] of AYAR) { $(`a-${k}`).value = VARS[k]; $(`v-${k}`).textContent = f(VARS[k]); }
  const h = hesap();
  $('o-rx').textContent = isaretli(h.Rx);
  $('o-uyum').textContent = tr(h.A, 1);
  $('o-uyum-k').textContent = `/ ${tr(h.Amax, 1)} D`;
  $('o-hata').textContent = isaretli(h.hata);
  const dec = 1 / h.mar;
  $('o-va').textContent = tr(Math.min(1, dec), dec < .1 ? 2 : 1);
  $('o-snellen').textContent = `20/${Math.round(20 * h.mar)}`;
  const a = Math.abs(h.hata);
  let m;
  if (VARS.sil > 0.05) m = `İki meridyen farklı yerde odaklanır (mavi ve turuncu ışınlar). Fark: ${tr(VARS.sil)} D. Tek bir net nokta yoktur.`;
  else if (a < 0.13) m = h.A > 0.1 ? `Odak retinada. Lens ${tr(h.A, 1)} D uyum yapıyor${h.Rx > .2 && VARS.uzak < .02 ? ': hipermetropi uyumla kapatılıyor, göz yorulur' : ''}.` : 'Odak tam retinada; uyum gerekmiyor.';
  else if (h.hata > 0) m = `Odak retinanın ${tr(a)} D önünde: miyopik bulanıklık. Küçük pupilla ve eksi cam yardım eder.`;
  else m = `Odak retinanın ${tr(a)} D arkasında: uyum yetmiyor${h.A >= h.Amax - .01 ? ` (genlik ${tr(h.Amax, 1)} D, tümü kullanılıyor)` : ''}. Artı cam yardım eder.`;
  if (Math.abs(VARS.cam) > .01 && a < .13 && VARS.sil < .05) m += ' Cam odağı retinaya taşıdı.';
  $('odak-metin').textContent = m;
  $('gor-rozet').textContent = `Bulanıklık ≈ ${tr(Math.max(h.b1, h.b2), 0)} dk`;
  if (bekle) return;
  bekle = true;
  requestAnimationFrame(() => { bekle = false; const q = hesap(); isinCiz(q); gorCiz(q); });
}

function onayarSec(p) {
  onayar = p;
  Object.assign(VARS, SIFIR, p.d);
  $('onayar').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === p.id));
  $('b-tur').textContent = p.tur.toLocaleUpperCase('tr');
  $('b-ad').textContent = p.ad;
  $('b-ozet').textContent = p.ozet;
  $('b-neden').textContent = p.neden; $('b-neden-k').hidden = !p.neden;
  $('b-yon').textContent = p.yon; $('b-yon-k').hidden = !p.yon;
  try { history.replaceState(null, '', '#d=' + p.id); } catch { /* sorun değil */ }
  guncelle();
}

$('onayar').innerHTML = ONAYAR.map((p) => `<button type="button" class="gy-chip" data-p="${p.id}">${p.ad}</button>`).join('');
$('onayar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) onayarSec(ONAYAR.find((p) => p.id === b.dataset.p)); });
for (const [k] of AYAR) $(`a-${k}`).addEventListener('input', (e) => { VARS[k] = +e.target.value; guncelle(); });
$('duzelt').addEventListener('click', () => { VARS.cam = Math.round(hesap().Rx * 4) / 4; VARS.uzak = 0; guncelle(); });
$('cam-cikar').addEventListener('click', () => { VARS.cam = 0; guncelle(); });
new ResizeObserver(() => guncelle()).observe($('isin'));
onayarSec(ONAYAR.find((p) => p.id === new URLSearchParams(location.hash.slice(1)).get('d')) || ONAYAR[0]);
