// EKG: miyokard infarktüsü. Bölge ve evre seçilince 12 derivasyonlu sentetik EKG (ekg-model.js'te infarkt vektörleri),
// ST ölçümü, ölçüt denetimi ve 3B kalpte infarkt alanı gösterilir. Sınav kipinde bölgeyi tahmin edersiniz.
import { DERIVASYONLAR, RITIMLER, AtimAkisi, vektor, nokta } from './ekg-model.js';

const $ = (id) => document.getElementById(id);

const BOLGELER = {
  ant_sept: { ad: 'Anteroseptal', damar: 'LAD (septal ve diyagonal dallar)', yon: [0, 0.1, 1], gor: 'V1–V3 (V4)', bak: 'oblik', ilk: 'V2',
    metin: 'Septum ve ön duvar. V1–V2\'de ST yükselmesi ve r dalgası kaybı (QS) erken görülür. Septum tutulumu dal bloğu ve AV iletim sorunlarına yol açabilir.', resip: 'Belirgin resiprokal değişiklik beklenmez.' },
  ant_genis: { ad: 'Geniş ön (proksimal LAD)', damar: 'Proksimal LAD', yon: [0.45, -0.25, 0.85], gor: 'V1–V6, I, aVL', bak: 'oblik', ilk: 'V4',
    metin: 'Büyük miyokard alanı: ventrikül işlevi, kardiyojenik şok ve ritim bozukluğu riski yüksektir. ST yükselmesi hem I–aVL hem V1–V6\'dadır.', resip: 'II, III, aVF\'de ST çökmesi (inferior resiprokal).' },
  lat: { ad: 'Lateral', damar: 'Sirkumfleks (LCx), obtüz marjinal ya da diyagonal', yon: [1, -0.45, 0.1], gor: 'I, aVL, V5–V6', bak: 'sol', ilk: 'aVL',
    metin: 'Sirkumfleks tıkanıklıkları standart derivasyonda sessiz ya da zayıf kalabilir. Posterior ya da inferior tutulumla birlikte olabilir.', resip: 'III ve aVF\'de ST çökmesi; V1–V2\'de hafif çökme.' },
  inf: { ad: 'İnferior', damar: 'RCA (çoğunlukla, sağ dominant) ya da LCx (sol dominant)', yon: [-0.3, 1, 0.05], gor: 'II, III, aVF', bak: 'alt', ilk: 'III',
    metin: 'ST yükselmesi III\'te II\'den büyükse RCA, II ≥ III ve lateral katılım varsa LCx düşünülür (kesin değildir). AV blok ve bradikardi sık eşlik eder.', resip: 'I ve aVL\'de ST çökmesi.' },
  post: { ad: 'Posterior', damar: 'RCA\'nın posterior inen dalı ya da LCx', yon: [0.1, 0.3, -0.95], gor: 'V1–V3\'te ST çökmesi (ayna); V7–V9\'da ST yükselmesi', bak: 'arka', ilk: 'V2',
    metin: 'Standart derivasyonlar arka duvara bakmaz: ön derivasyonlardaki ST çökmesi, yüksek R ve dik T bir ayna görüntüsüdür. Arka derivasyonlarla (V7–V9) doğrulanır; çoğu kez inferior MI ile birliktedir ve STEMI eşdeğeri sayılır.', resip: 'Ön derivasyonlarda (V1–V3) ayna ST çökmesi.' },
  inf_rv: { ad: 'İnferior + sağ ventrikül', damar: 'Proksimal RCA', yon: [-0.3, 1, 0.05], sagVent: true, gor: 'II, III, aVF + V4R', bak: 'alt', ilk: 'III',
    metin: 'V4R\'de ST yükselmesi sağ ventrikül tutulumunu gösterir. Sağ ventrikül ön yüke bağımlıdır; nitrata duyarlı hipotansiyon klinik bir ipucudur.', resip: 'I ve aVL\'de ST çökmesi.' },
};
const EVRELER = [
  { ad: 'Normal', zaman: '', metin: 'İnfarkt yok: ST izoelektrik, T dalgası normal.' },
  { ad: 'Hiperakut', zaman: 'dakikalar – ilk saatler', metin: 'T dalgası uzun, geniş ve simetrik olur; ST henüz az yükselmiştir. Kaçırılması kolay evredir.' },
  { ad: 'Akut ST yükselmesi', zaman: 'saatler', metin: 'ST yükselir (dışbükey, "mezar taşı" biçimi), karşı derivasyonlarda çöker; T dalgası ST içinde kaybolur.' },
  { ad: 'Evrimleşen', zaman: 'saatler – günler', metin: 'Patolojik Q dalgası belirir, ST iner, T dalgası ters döner.' },
  { ad: 'Kronik (eski)', zaman: 'haftalar – aylar', metin: 'Patolojik Q kalıcıdır; ST ve T büyük ölçüde normale döner.' },
];
const SIDDET = [0, 0.35, 0.6, 0.9, 0.8];
const EK = [
  { id: 'V4R', yon: [-0.97, 0.12, 0.2], kaz: 1.5, esik: 1 },
  { id: 'V7', yon: [0.55, 0.1, -0.83], kaz: 1.5, esik: 0.5 },
  { id: 'V8', yon: [0.3, 0.1, -0.95], kaz: 1.5, esik: 0.5 },
  { id: 'V9', yon: [0.05, 0.1, -1], kaz: 1.5, esik: 0.5 },
];
const KOMSU = [['II', 'III'], ['II', 'aVF'], ['aVF', 'III'], ['I', 'aVL'], ['V1', 'V2'], ['V2', 'V3'], ['V3', 'V4'], ['V4', 'V5'], ['V5', 'V6'], ['V7', 'V8'], ['V8', 'V9']];

const durum = { bolge: 'inf', evre: 2, mod: 'incele', hasta: 'e40', ek: false, ipucu: true, lead: 'III', gizli: false, cevaplandi: true, skor: [0, 0], hedef: null };
let statik, canli, kalp = null, T = 0, olc = {};

// --- Bağlantıdan durum ----------------------------------------------------------
(function () {
  const q = new URLSearchParams(location.hash.slice(1));
  if (BOLGELER[q.get('b')]) durum.bolge = q.get('b');
  const e = +q.get('e');
  if (e >= 0 && e <= 4 && q.has('e')) durum.evre = e;
  durum.lead = BOLGELER[durum.bolge].ilk;
})();
function hashYaz() { try { history.replaceState(null, '', '#' + new URLSearchParams({ b: durum.bolge, e: durum.evre })); } catch { /* sorun değil */ } }

const esik = (d) => (d.esik != null ? d.esik : d.id === 'V2' || d.id === 'V3' ? { e40: 2, e39: 2.5, k: 1.5 }[durum.hasta] : 1);

function parametre(bolge, evre) {
  const b = BOLGELER[bolge];
  return { ritim: 'sinus', ...RITIMLER.sinus, hr: 75, mi: { yon: b.yon, evre, sagVent: !!b.sagVent } };
}
function kur() {
  const p = parametre(durum.bolge, durum.evre);
  statik = new AtimAkisi(p, 0);
  canli = new AtimAkisi(p, T);
  const i = statik.atimlar.findIndex((b) => b.q0 > 300);
  const b0 = statik.atimlar[i];
  olc.t0 = b0.q0 - p.pr - 280; olc.W = 2500; olc.ref = statik.atimlar[i + 1];
  // Ölçümler: J+60 ms ST, Q ve R/S
  olc.lead = {};
  for (const d of [...DERIVASYONLAR, ...EK]) {
    const r = olc.ref, base = nokta(vektor(statik, r.q0 - 30), d);
    const st = (nokta(vektor(statik, r.q0 + r.W + 60), d) - base) * 10;
    let rmax = -9, smin = 9, tR = r.q0;
    for (let t = r.q0; t <= r.q0 + r.W; t += 2) {
      const v = nokta(vektor(statik, t), d) - base;
      if (v > rmax) { rmax = v; tR = t; }
      smin = Math.min(smin, v);
    }
    let qmin = 0;
    for (let t = r.q0; t < tR; t += 2) qmin = Math.min(qmin, nokta(vektor(statik, t), d) - base);
    // Patolojik Q: R'den önce ≥ 1 mm ve R'nin ≥ %25'i derinlikte negatif sapma; ya da R olmayan (QS) kompleks
    const qs = rmax < 0.1 && smin < -0.3 && d.id !== 'aVL';
    olc.lead[d.id] = { st, q: d.id !== 'aVR' && ((-qmin >= 0.1 && -qmin >= 0.25 * Math.max(rmax, 0.01)) || qs), rs: (d.id === 'V1' || d.id === 'V2') && rmax > -smin && rmax > 0.5 };
  }
}

// --- Denetimler ------------------------------------------------------------------
$('bolgeler').innerHTML = Object.entries(BOLGELER).map(([k, v]) => `<button type="button" class="lchip" data-b="${k}">${v.ad}</button>`).join('');
$('evreler').innerHTML = EVRELER.map((v, i) => `<button type="button" class="lchip" data-e="${i}">${v.ad}</button>`).join('');
$('bolgeler').addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (b) bolgeSec(b.dataset.b); });
$('evreler').addEventListener('click', (e) => { const b = e.target.closest('[data-e]'); if (b) { durum.evre = +b.dataset.e; guncelle(); } });
$('hasta').addEventListener('change', (e) => { durum.hasta = e.target.value; ciz(); });
$('t-ek').addEventListener('change', (e) => { durum.ek = e.target.checked; ekGoster(); ciz(); });
$('t-ipucu').addEventListener('change', (e) => { durum.ipucu = e.target.checked; ciz(); });
$('gorunum').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $('gorunum').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  kalp && kalp.gorunum(b.dataset.g);
});
$('mod').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $('mod').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  durum.mod = b.dataset.m;
  if (durum.mod === 'sinav') yeniSoru(); else { durum.gizli = false; durum.cevaplandi = true; $('soru').hidden = true; guncelle(); }
});

function bolgeSec(k) {
  if (durum.mod === 'sinav' && durum.gizli) { cevapla(k); return; }
  durum.bolge = k; durum.hedef = null;
  durum.lead = BOLGELER[k].ilk;
  kalp && kalp.gorunum(BOLGELER[k].bak);
  $('gorunum').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.g === BOLGELER[k].bak));
  guncelle();
}

// --- Sınav ---------------------------------------------------------------------
function yeniSoru() {
  const k = Object.keys(BOLGELER);
  durum.bolge = k[Math.floor(Math.random() * k.length)];
  durum.evre = [2, 2, 2, 3][Math.floor(Math.random() * 4)];
  durum.lead = BOLGELER[durum.bolge].ilk;
  durum.gizli = true; durum.cevaplandi = false;
  $('soru').hidden = false; $('s-sonuc').hidden = true;
  $('s-skor').textContent = `Doğru: ${durum.skor[0]} / ${durum.skor[1]}`;
  $('bolgeler').querySelectorAll('button').forEach((b) => b.classList.remove('dogru', 'yanlis'));
  guncelle();
}
function cevapla(k) {
  if (durum.cevaplandi) return;
  durum.cevaplandi = true; durum.gizli = false;
  const dogru = k === durum.bolge;
  durum.skor[1]++; if (dogru) durum.skor[0]++;
  $('bolgeler').querySelectorAll('button').forEach((b) => { if (b.dataset.b === durum.bolge) b.classList.add('dogru'); else if (b.dataset.b === k) b.classList.add('yanlis'); });
  $('s-sonuc').hidden = false;
  const b = BOLGELER[durum.bolge];
  $('s-sonuc').innerHTML = `${dogru ? '✓ Doğru.' : '✗ Yanlış.'} Bu EKG <b>${b.ad}</b> infarkta ait (${EVRELER[durum.evre].ad}): ${b.gor}. ${b.resip}`;
  $('s-skor').textContent = `Doğru: ${durum.skor[0]} / ${durum.skor[1]}`;
  guncelle();
}
$('s-sonraki').addEventListener('click', yeniSoru);

// --- Çizim ---------------------------------------------------------------------
let renk = {};
function renkleriOku() {
  const s = getComputedStyle(document.documentElement);
  const v = (n, d) => (s.getPropertyValue(n).trim() || d);
  renk = { metin: v('--text', '#e8eaee'), vurgu: v('--accent', '#f2c14e'), cizgi: v('--line', '#262b33'), sus: v('--muted', '#8a919e'), iz: v('--ok', '#4cbb6c'), kotu: v('--bad', '#e63946') };
}
const MM_YUK = 30, ARTI = 17;   // mm: toplam yükseklik, taban çizgisinin üstündeki bölüm
const fmt = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1).replace('.', ',')}`;

function leadDurum(d) {
  const o = olc.lead[d.id], e = esik(d);
  return { o, yuk: o.st >= e, cok: o.st <= -0.5, e };
}

function serit(cv, d, buyuk) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 200;
  const pm = w / 62.5, h = MM_YUK * pm;
  cv.style.height = h + 'px';
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  const X = (t) => ((t - olc.t0) / olc.W) * w, base = ARTI * pm, Y = (mv) => base - mv * 10 * pm;
  for (let m = 0; m <= 62.5; m++) {
    const b5 = m % 5 === 0; if (!b5 && !buyuk && pm < 4) continue;
    c.strokeStyle = renk.cizgi; c.globalAlpha = b5 ? 0.9 : 0.3; c.beginPath(); c.moveTo(m * pm + 0.5, 0); c.lineTo(m * pm + 0.5, h); c.stroke();
  }
  for (let m = 0; m <= MM_YUK; m++) {
    const b5 = m % 5 === 0; if (!b5 && !buyuk && pm < 4) continue;
    c.strokeStyle = renk.cizgi; c.globalAlpha = b5 ? 0.9 : 0.3; c.beginPath(); c.moveTo(0, m * pm + 0.5); c.lineTo(w, m * pm + 0.5); c.stroke();
  }
  c.globalAlpha = 1;
  const r = olc.ref, tb = nokta(vektor(statik, r.q0 - 30), d);
  c.strokeStyle = renk.sus; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(0, Y(tb)); c.lineTo(w, Y(tb)); c.stroke(); c.setLineDash([]);
  c.strokeStyle = renk.iz; c.lineWidth = buyuk ? 2.4 : 1.6; c.lineJoin = 'round'; c.beginPath();
  const n = Math.round(w / 1.5);
  for (let i = 0; i <= n; i++) {
    const t = olc.t0 + (i / n) * olc.W, y = Math.max(-3, Math.min(h + 3, Y(nokta(vektor(statik, t), d))));
    if (i === 0) c.moveTo(0, y); else c.lineTo((i / n) * w, y);
  }
  c.stroke();
  // J+60 işareti (referans atım)
  const tj = r.q0 + r.W + 60, xj = X(tj), yj = Y(nokta(vektor(statik, tj), d));
  c.strokeStyle = renk.vurgu; c.lineWidth = 1; c.globalAlpha = 0.8; c.beginPath(); c.moveTo(xj, Math.min(yj, Y(tb)) - 6); c.lineTo(xj, Math.max(yj, Y(tb)) + 6); c.stroke(); c.globalAlpha = 1;
  c.fillStyle = renk.vurgu; c.beginPath(); c.arc(xj, yj, buyuk ? 4 : 2.5, 0, 7); c.fill();
  if (buyuk) { c.fillStyle = renk.sus; c.font = '500 11px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('J + 60 ms', xj, h - 6); c.textAlign = 'left'; c.fillText('taban çizgisi (PR)', 6, Y(tb) - 5); }
}

function kutu(d, buyuk) {
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'mi-strip'; el.dataset.l = d.id;
  el.innerHTML = `<span class="strip-ad">${d.id}</span><canvas></canvas><span class="rozet"></span>`;
  el.addEventListener('click', () => { durum.lead = d.id; ciz(); });
  return el;
}
function kurGrid() {
  const sira = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  $('izgara').innerHTML = ''; sira.forEach((id) => $('izgara').appendChild(kutu(DERIVASYONLAR.find((d) => d.id === id))));
  $('ek-izgara').innerHTML = ''; EK.forEach((d) => $('ek-izgara').appendChild(kutu(d)));
}
function ekGoster() { $('ek-izgara').hidden = !durum.ek; }

function ciz() {
  hashYaz();
  const gizli = durum.gizli;
  const tum = [...DERIVASYONLAR, ...EK];
  document.querySelectorAll('.mi-strip').forEach((el) => {
    const d = tum.find((x) => x.id === el.dataset.l);
    if (!d) return;
    serit(el.querySelector('canvas'), d, false);
    const s = leadDurum(d), rz = el.querySelector('.rozet');
    rz.textContent = `ST ${fmt(s.o.st)}${s.o.q ? ' · Q' : ''}${s.o.rs ? ' · R>S' : ''}`;
    el.classList.toggle('yuk', durum.ipucu && !gizli && s.yuk);
    el.classList.toggle('cok', durum.ipucu && !gizli && s.cok && !s.yuk);
    el.classList.toggle('sec', d.id === durum.lead);
  });
  const d = tum.find((x) => x.id === durum.lead), s = leadDurum(d);
  serit($('buyuk'), d, true);
  $('d-baslik').textContent = `Derivasyon: ${d.id}`;
  $('d-metin').textContent = `J + 60 ms'de ST ${fmt(s.o.st)} mm (eşik ≥ ${String(s.e).replace('.', ',')} mm). ${s.yuk ? 'Eşiği aşıyor.' : s.cok ? 'ST çökmesi.' : 'Eşiğin altında.'}${s.o.q ? ' Patolojik Q dalgası var.' : ''}${s.o.rs ? ' R dalgası S\'den büyük (V1–V2\'de arka duvar infarktında görülür).' : ''}`;
  bilgi(); ozetle(); sahneGuncelle();
}

function ozetle() {
  const el = $('ozet'), olcut = $('olcut');
  if (durum.gizli) { el.innerHTML = '<span class="muted">Ölçüt özeti, cevaptan sonra görünür.</span>'; olcut.innerHTML = '<li class="muted">Sınav sürüyor.</li>'; return; }
  const yuk = new Set(), tum = [...DERIVASYONLAR, ...(durum.ek ? EK : [])];
  tum.forEach((d) => { if (leadDurum(d).yuk) yuk.add(d.id); });
  const cift = KOMSU.filter(([a, b]) => yuk.has(a) && yuk.has(b));
  const bolgeAd = (a) => ['II', 'III', 'aVF'].includes(a) ? 'inferior' : ['I', 'aVL'].includes(a) ? 'yüksek lateral' : ['V7', 'V8', 'V9'].includes(a) ? 'posterior' : 'ön/lateral';
  const grup = [...new Set(cift.map(([a]) => bolgeAd(a)))];
  let s;
  if (cift.length) s = `<b class="ok-t">STEMI ölçütü sağlanıyor:</b> ${[...new Set(cift.flat())].join(', ')} (${grup.join(', ')}).`;
  else if (yuk.size) s = `<b>Tek derivasyonda yükselme var (${[...yuk].join(', ')}); iki komşu derivasyon ölçütü sağlanmıyor.</b>`;
  else s = '<b>Standart ölçüt sağlanmıyor:</b> iki komşu derivasyonda eşiği aşan ST yükselmesi yok.';
  const cokV = ['V1', 'V2', 'V3'].filter((id) => leadDurum(DERIVASYONLAR.find((d) => d.id === id)).cok);
  if (!cift.length && cokV.length >= 2) s += ` V1–V3'te ST çökmesi var: <b>posterior MI</b> düşünülmeli (V7–V9 ile doğrulanır).`;
  el.innerHTML = s;
  const E = EVRELER[durum.evre];
  olcut.innerHTML = [
    `<li><b>Evre:</b> ${E.ad}${E.zaman ? ` (${E.zaman})` : ''}. ${E.metin}</li>`,
    '<li><b>STEMI ölçütü:</b> iki komşu derivasyonda J noktasında yeni ST yükselmesi: V2–V3\'te erkek ≥ 40 yaş için ≥ 2 mm, erkek &lt; 40 için ≥ 2,5 mm, kadın için ≥ 1,5 mm; diğer derivasyonlarda ≥ 1 mm.</li>',
    '<li><b>Resiprokal değişiklik</b> destekleyicidir, zorunlu değildir; her infarkt göstermez.</li>',
    '<li><b>STEMI eşdeğerleri</b> (2022 ACC acil göğüs ağrısı yol haritası): posterior MI, dal bloğu veya ritim kaynağı pacemaker ise Sgarbossa ölçütleri, de Winter işareti, hiperakut T dalgaları.</li>',
    '<li><b>Normal bir EKG infarktı dışlamaz:</b> özellikle sirkumfleks ve posterior tıkanıklıkları sessiz kalabilir; seri EKG ve klinik esastır.</li>',
  ].join('');
}
function bilgi() {
  const k = $('bolge-kart');
  k.hidden = durum.gizli;
  const b = BOLGELER[durum.bolge], E = EVRELER[durum.evre];
  $('b-damar').textContent = ('Suçlu damar: ' + b.damar).toUpperCase();
  $('b-ad').textContent = `${b.ad} · ${E.ad}`;
  $('b-metin').textContent = `${b.metin} Yükselme: ${b.gor}. ${b.resip}`;
  document.querySelectorAll('#bolgeler .lchip').forEach((x) => x.classList.toggle('on', !durum.gizli && x.dataset.b === durum.bolge));
  document.querySelectorAll('#evreler .lchip').forEach((x) => { x.classList.toggle('on', +x.dataset.e === durum.evre); x.disabled = durum.gizli; });
  $('evre-not').textContent = durum.gizli ? '' : `${E.ad}${E.zaman ? ' · ' + E.zaman : ''}: ${E.metin}`;
  $('sahne-not').textContent = durum.gizli ? 'Bölge sınav bitince 3B kalpte görünür.' : 'Koyu bölge infarkt alanıdır: ölü doku depolarize olmaz, bu yüzden uyarı geldiğinde sarı yanmaz.';
}
function sahneGuncelle() {
  if (!kalp) return;
  const sid = durum.gizli ? 0 : SIDDET[durum.evre];
  kalp.infarkt(durum.bolge, sid, durum.evre === 4 ? '#e2dac8' : '#9577cc');
}
function guncelle() { kur(); ciz(); }

// --- Döngü ----------------------------------------------------------------------
let son = performance.now(), sayac = 0;
function kare(now) {
  const dt = Math.min(100, now - son); son = now;
  T += dt; canli.uret(T);
  if (sayac++ % 20 === 0) renkleriOku();
  if (kalp) kalp.guncelle(T, canli, vektor(canli, T));
  requestAnimationFrame(kare);
}
addEventListener('resize', () => ciz());

renkleriOku();
kurGrid(); ekGoster();
guncelle();
new ResizeObserver(() => ciz()).observe($('izgara'));
requestAnimationFrame(kare);
(async () => {
  try {
    const { kalpSahnesi } = await import('./ekg-heart.js');
    kalp = await kalpSahnesi($('sahne'), $('etiketler'));
    kalp.etiketleriAyarla(false);
    $('yukleniyor').remove();
    kalp.gorunum(BOLGELER[durum.bolge].bak);
    $('gorunum').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.g === BOLGELER[durum.bolge].bak));
    sahneGuncelle();
  } catch (e) {
    console.error(e);
    $('yukleniyor').textContent = '3B kalp yüklenemedi (internet bağlantısı gerekir). EKG şeritleri çalışmaya devam eder.';
  }
})();
