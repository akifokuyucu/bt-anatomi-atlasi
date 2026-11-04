// EKG simülasyonu: 3B kalp (ekg-heart.js) ile derivasyon şeritleri (ekg-model.js) aynı saatle çalışır.
import { DERIVASYONLAR, RITIMLER, AtimAkisi, vektor, nokta, faz, hizSinifi } from './ekg-model.js';

const $ = (id) => document.getElementById(id);
const durum = {
  ritim: 'sinus', lead: 'II', mod: 'tek', not: true, hiz: 1, calisiyor: true,
  p: { ritim: 'sinus', ...RITIMLER.sinus },
};
let T = 0;
let akis = new AtimAkisi(durum.p, T);
let kalp = null;

// --- Bağlantıdan durum ----------------------------------------------------
(function hashOku() {
  const q = new URLSearchParams(location.hash.slice(1));
  const r = q.get('r');
  if (r && RITIMLER[r]) { durum.ritim = r; durum.p = { ritim: r, ...RITIMLER[r] }; }
  const d = q.get('d');
  if (d && DERIVASYONLAR.some((x) => x.id === d)) durum.lead = d;
  if (q.get('m') === 'on2') durum.mod = 'on2';
  akis = new AtimAkisi(durum.p, T);
})();
function hashYaz() {
  const q = new URLSearchParams({ r: durum.ritim, d: durum.lead, m: durum.mod });
  try { history.replaceState(null, '', '#' + q); } catch { /* sorun değil */ }
}

// --- Denetimler -------------------------------------------------------------
$('ritim').innerHTML = Object.entries(RITIMLER).map(([k, v]) => `<option value="${k}">${v.ad}</option>`).join('');
$('leadler').innerHTML = DERIVASYONLAR.map((d) => `<button type="button" class="lchip" data-l="${d.id}">${d.id}</button>`).join('');

function ritimUygula(k, sifirla = true) {
  durum.ritim = k;
  durum.p = { ritim: k, ...RITIMLER[k] };
  $('ritim').value = k;
  $('r-ad').textContent = RITIMLER[k].ad;
  $('r-ozet').textContent = RITIMLER[k].ozet;
  $('r-ipuc').innerHTML = RITIMLER[k].ipuclari.map((s) => `<li>${s}</li>`).join('');
  sliderlariDoldur();
  if (sifirla) akis.kur(durum.p, T);
  hashYaz();
}
function sliderlariDoldur() {
  const { hr, pr, qrs, eksen, ritim } = durum.p;
  for (const [id, v] of [['hr', hr], ['pr', pr], ['qrs', qrs], ['eksen', eksen]]) { $('a-' + id).value = v; }
  $('a-pr').disabled = ritim === 'af';
  sliderYazilari();
}
function sliderYazilari() {
  const { hr, pr, qrs, eksen, ritim } = durum.p;
  $('v-hr').textContent = hr + ' /dk' + (ritim === 'af' ? ' (ort.)' : '');
  $('v-pr').textContent = ritim === 'af' ? '—' : pr + ' ms';
  $('v-qrs').textContent = qrs + ' ms';
  $('v-eksen').textContent = eksen + '°';
}
for (const id of ['hr', 'pr', 'qrs', 'eksen']) {
  $('a-' + id).addEventListener('input', (e) => {
    durum.p[id] = +e.target.value;
    sliderYazilari();
    akis.ayarla(durum.p, T);
  });
}
$('ritim').addEventListener('change', (e) => ritimUygula(e.target.value));
$('sifirla').addEventListener('click', () => ritimUygula(durum.ritim));

function leadSec(id) {
  durum.lead = id;
  document.querySelectorAll('#leadler .lchip').forEach((b) => b.classList.toggle('on', b.dataset.l === id));
  if (durum.mod === 'tek' && seritler.length) modUygula('tek');
  document.querySelectorAll('.strip').forEach((s) => s.classList.toggle('sec', s.dataset.l === id));
  hashYaz();
}
$('leadler').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b) leadSec(b.dataset.l); });

function segBagla(id, attr, fn) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    fn(b.dataset[attr]);
  });
}
segBagla('hiz', 'h', (v) => { durum.hiz = +v; });
segBagla('gorunum', 'g', (v) => kalp && kalp.gorunum(v));
segBagla('mod', 'm', (v) => modUygula(v));

function oynatDugme() {
  $('oynat').textContent = durum.calisiyor ? 'Duraklat' : 'Oynat';
  $('oynat').setAttribute('aria-label', durum.calisiyor ? 'Duraklat' : 'Oynat');
}
$('oynat').addEventListener('click', () => { durum.calisiyor = !durum.calisiyor; oynatDugme(); });
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName)) {
    e.preventDefault(); durum.calisiyor = !durum.calisiyor; oynatDugme();
  }
});
$('atim').addEventListener('click', () => {
  const i = akis.atimBul(T);
  const sonraki = akis.atimlar[Math.min(i + 1, akis.atimlar.length - 1)];
  T = sonraki.t0 - 200;
  akis.uret(T);
  if (durum.hiz === 1) { durum.hiz = 0.25; $('hiz').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.h === '0.25')); }
  durum.calisiyor = true; oynatDugme();
});
$('gez').addEventListener('input', (e) => {
  durum.calisiyor = false; oynatDugme();
  const [a, b] = atimAraligi();
  T = a + (e.target.value / 1000) * (b - a);
});
$('t-not').addEventListener('change', (e) => { durum.not = e.target.checked; });
$('t-etiket').addEventListener('change', (e) => kalp && kalp.etiketleriAyarla(e.target.checked));
$('t-iletim').addEventListener('change', (e) => kalp && kalp.iletimiAyarla(e.target.checked));
$('t-vektor').addEventListener('change', (e) => kalp && kalp.vektoruAyarla(e.target.checked));

function atimAraligi() {
  const b = akis.atimlar[akis.atimBul(T)];
  return [b.t0 - 60, b.q0 + b.qt + 160];
}

// --- Şeritler ---------------------------------------------------------------
const NOKTA = 320;
let seritler = [];
function modUygula(m) {
  durum.mod = m;
  $('mod').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.m === m));
  const kutu = $('seritler');
  kutu.className = 'seritler ' + m;
  kutu.innerHTML = '';
  const liste = m === 'tek' ? DERIVASYONLAR.filter((d) => d.id === durum.lead) : DERIVASYONLAR;
  seritler = liste.map((d) => {
    const kap = document.createElement('div');
    kap.className = 'strip';
    kap.dataset.l = d.id;
    kap.innerHTML = `<span class="strip-ad">${d.id}</span><canvas></canvas>`;
    kutu.appendChild(kap);
    if (m === 'on2') kap.addEventListener('click', () => { leadSec(d.id); });
    return { d, kap, cv: kap.querySelector('canvas'), ctx: kap.querySelector('canvas').getContext('2d') };
  });
  document.querySelectorAll('.strip').forEach((s) => s.classList.toggle('sec', s.dataset.l === durum.lead));
  hashYaz();
}
let renk = {};
function renkleriOku() {
  const s = getComputedStyle(document.documentElement);
  const v = (n, d) => (s.getPropertyValue(n).trim() || d);
  renk = { metin: v('--text', '#e8eaee'), vurgu: v('--accent', '#f2c14e'), cizgi: v('--line', '#262b33'), sus: v('--muted', '#8a919e'), iz: v('--ok', '#4cbb6c'), zemin: v('--panel-2', '#14171c') };
}

const sure = { tek: [4200, 0.36], on2: [3000, 0.4] };

function seritCiz(s, vs, n, t0, W, atim) {
  const cv = s.cv, ctx = s.ctx;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = s.kap.clientWidth, ch = s.kap.clientHeight;
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const [, simdiOran] = sure[durum.mod];
  const tek = durum.mod === 'tek';
  const pxMs = cw / W;
  const mvAralik = tek ? 3.6 : 3.4;
  const pxMv = ch / mvAralik;
  const taban = ch * (tek ? 0.62 : 0.58);
  const X = (t) => (t - t0) * pxMs;
  const Y = (mv) => taban - mv * pxMv;

  // Izgara: 40 ms / 0,1 mV küçük kare, 200 ms / 0,5 mV büyük kare
  ctx.lineWidth = 1;
  const sonKucuk = Math.ceil((t0 + W) / 40) * 40;
  for (let t = Math.floor(t0 / 40) * 40; t <= sonKucuk; t += 40) {
    const buyuk = Math.round(t / 40) % 5 === 0;
    if (!buyuk && !tek) continue;
    ctx.strokeStyle = renk.cizgi; ctx.globalAlpha = buyuk ? 0.9 : 0.35;
    ctx.beginPath(); ctx.moveTo(X(t) + 0.5, 0); ctx.lineTo(X(t) + 0.5, ch); ctx.stroke();
  }
  for (let mv = -2; mv <= 2.5; mv += 0.1) {
    const m5 = Math.abs(Math.round(mv * 10) % 5) === 0;
    if (!m5 && !tek) continue;
    ctx.strokeStyle = renk.cizgi; ctx.globalAlpha = m5 ? 0.9 : 0.35;
    ctx.beginPath(); ctx.moveTo(0, Y(mv) + 0.5); ctx.lineTo(cw, Y(mv) + 0.5); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Dalga bantları ve adları
  if (durum.not) {
    for (const b of akis.atimlar) {
      if (b.q0 + b.qt < t0 - 100 || b.t0 > t0 + W + 100) continue;
      const bant = (a, z, renkAd, ad) => {
        const x0 = X(a), x1 = X(z);
        ctx.globalAlpha = 0.1; ctx.fillStyle = renkAd; ctx.fillRect(x0, 0, x1 - x0, ch);
        ctx.globalAlpha = 0.85; ctx.fillStyle = renkAd; ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'center';
        if (tek) ctx.fillText(ad, (x0 + x1) / 2, 14);
        ctx.globalAlpha = 1;
      };
      if (b.tip !== 'af') bant(b.t0 + 12, b.t0 + b.pw, '#4cbb6c', 'P');
      bant(b.q0, b.q0 + b.W, renk.vurgu, 'QRS');
      bant(b.tc - 2.2 * b.tsig, b.tc + 2.4 * b.tsig, '#5b9bff', 'T');
    }
  }

  // İz: geçmiş canlı, gelecek soluk
  const simdiX = cw * simdiOran;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const ciz = (bas, son, alfa) => {
    ctx.globalAlpha = alfa; ctx.strokeStyle = renk.iz; ctx.lineWidth = tek ? 2.2 : 1.6;
    ctx.beginPath();
    let ilk = true;
    for (let i = bas; i <= son; i++) {
      const x = (i / (n - 1)) * cw;
      const y = Math.max(-4, Math.min(ch + 4, Y(nokta([vs[i * 3], vs[i * 3 + 1], vs[i * 3 + 2]], s.d))));
      if (ilk) { ctx.moveTo(x, y); ilk = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  const ni = Math.min(n - 1, Math.max(0, Math.round((simdiX / cw) * (n - 1))));
  ciz(0, ni, 1);
  ciz(ni, n - 1, 0.28);

  // Şimdi çizgisi ve baş noktası
  ctx.strokeStyle = renk.vurgu; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(simdiX, 0); ctx.lineTo(simdiX, ch); ctx.stroke();
  ctx.globalAlpha = 1;
  const yb = Y(nokta([vs[ni * 3], vs[ni * 3 + 1], vs[ni * 3 + 2]], s.d));
  ctx.fillStyle = renk.vurgu; ctx.beginPath(); ctx.arc(simdiX, Math.max(4, Math.min(ch - 4, yb)), tek ? 4 : 3, 0, 7); ctx.fill();

  // PR ve QT köprüleri (yalnızca tek derivasyon)
  if (tek && durum.not) {
    ctx.font = '500 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = renk.sus; ctx.strokeStyle = renk.sus; ctx.lineWidth = 1;
    const kopru = (a, z, y, ad) => {
      const x0 = X(a), x1 = X(z);
      if (x1 < 0 || x0 > cw) return;
      ctx.beginPath(); ctx.moveTo(x0, y - 4); ctx.lineTo(x0, y + 4); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y + 4); ctx.stroke();
      ctx.fillText(ad, (x0 + x1) / 2, y + 15);
    };
    const b = atim;
    if (b.tip !== 'af') kopru(b.t0, b.q0, ch - 50, `PR ${Math.round(b.pr)} ms`);
    kopru(b.q0, b.q0 + b.qt, ch - 22, `QT ${Math.round(b.qt)} ms`);
  }
  if (tek) {
    // Derivasyon değeri
    ctx.textAlign = 'right'; ctx.font = '500 12px "JetBrains Mono", ui-monospace, monospace'; ctx.fillStyle = renk.sus;
    const mv = nokta([vs[ni * 3], vs[ni * 3 + 1], vs[ni * 3 + 2]], s.d);
    ctx.fillText(`${mv >= 0 ? '+' : '−'}${Math.abs(mv).toFixed(2)} mV`, cw - 10, 18);
  }
}

// --- Frontal / yatay düzlem diyagramı ---------------------------------------
const hx = $('eksen'), hctx = hx.getContext('2d');
function eksenCiz(vek) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = hx.clientWidth || 320;
  if (hx.width !== Math.round(w * dpr)) { hx.width = Math.round(w * dpr); hx.height = Math.round(w * dpr); }
  hx.style.height = w + 'px';
  const c = hctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, w);
  const cx = w / 2, cy = w / 2, R = w * 0.38, olcek = R / 1.4;
  const secili = DERIVASYONLAR.find((d) => d.id === durum.lead);
  const yatay = secili.id.startsWith('V');
  // Yatay düzlemde (x, z) ekranda (x, -z); frontalde (x, y)
  const P = (v) => (yatay ? [v[0], -v[2]] : [v[0], v[1]]);
  c.lineWidth = 1; c.strokeStyle = renk.cizgi; c.globalAlpha = 0.9;
  c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
  c.font = '600 12px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const liste = DERIVASYONLAR.filter((d) => (yatay ? d.id.startsWith('V') : !d.id.startsWith('V')));
  for (const d of liste) {
    const [dx, dy] = P(d.yon);
    const n = Math.hypot(dx, dy) || 1;
    const ux = dx / n, uy = dy / n;
    const sec = d.id === durum.lead;
    c.strokeStyle = sec ? renk.vurgu : renk.sus; c.globalAlpha = sec ? 1 : 0.5; c.lineWidth = sec ? 2 : 1;
    c.beginPath(); c.moveTo(cx - ux * R, cy - uy * R); c.lineTo(cx + ux * R, cy + uy * R); c.stroke();
    c.fillStyle = sec ? renk.vurgu : renk.sus; c.globalAlpha = sec ? 1 : 0.85;
    c.fillText(d.id, cx + ux * (R + 17), cy + uy * (R + 17));
  }
  c.globalAlpha = 1;
  // Vektör ve gölgesi
  const [vx, vy] = P(vek);
  const tx = cx + vx * olcek, ty = cy + vy * olcek;
  const [dx, dy] = P(secili.yon); const dn = Math.hypot(dx, dy) || 1;
  const ux = dx / dn, uy = dy / dn;
  const iz = vx * ux + vy * uy;
  c.strokeStyle = renk.vurgu; c.lineWidth = 3; c.globalAlpha = 0.9;
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + ux * iz * olcek, cy + uy * iz * olcek); c.stroke();
  c.setLineDash([4, 4]); c.lineWidth = 1; c.strokeStyle = renk.sus;
  c.beginPath(); c.moveTo(tx, ty); c.lineTo(cx + ux * iz * olcek, cy + uy * iz * olcek); c.stroke();
  c.setLineDash([]);
  if (Math.hypot(vx, vy) > 0.02) {
    c.strokeStyle = '#2fe0c8'; c.fillStyle = '#2fe0c8'; c.lineWidth = 2.5; c.globalAlpha = 1;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(tx, ty); c.stroke();
    const a = Math.atan2(ty - cy, tx - cx);
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx - 9 * Math.cos(a - 0.4), ty - 9 * Math.sin(a - 0.4)); c.lineTo(tx - 9 * Math.cos(a + 0.4), ty - 9 * Math.sin(a + 0.4)); c.closePath(); c.fill();
  }
  c.fillStyle = renk.sus; c.font = '500 11px Inter, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText(yatay ? 'Yatay düzlem (üstten bakış)' : 'Frontal düzlem', 8, 14);
  if (yatay) { c.textAlign = 'center'; c.fillText('ön', cx, w - 4); c.textAlign = 'left'; }
}

// --- Ana döngü ----------------------------------------------------------------
const onbellek = {};
function yaz(id, v) { if (onbellek[id] !== v) { onbellek[id] = v; $(id).textContent = v; } }
function eksenSinifi(a) {
  if (a < -30 && a >= -90) return 'sol sapma';
  if (a > 90 && a <= 180) return 'sağ sapma';
  if (a < -90) return 'aşırı sapma';
  return 'normal';
}

// "Şimdi" kutusu: faz metinleri farklı uzunlukta olduğundan kutu her fazda büyüyüp küçülür ve altındaki her şeyi
// oynatır (telefonda belirgin). Tüm metinler (sinüs ve AF) bir ölçüm kopyasında denenir, kutu en uzununa sabitlenir.
function fazYuksekligiSabitle() {
  const kutu = $('faz');
  const metinler = new Map();
  for (const ritim of ['sinus', 'af']) {
    if (!RITIMLER[ritim]) continue;
    const ak = new AtimAkisi({ ritim, ...RITIMLER[ritim] }, 0);
    const b = ak.atimlar[Math.min(2, ak.atimlar.length - 1)];
    for (let t = b.t0 - 100; t < b.t0 + 2500; t += 5) { const f = faz(b, t); metinler.set(f.ad + f.metin, f); }
  }
  const olc = kutu.cloneNode(true);
  olc.removeAttribute('id'); olc.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  olc.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;min-height:0;width:${kutu.offsetWidth}px`;
  kutu.parentNode.appendChild(olc);
  let en = 0;
  for (const f of metinler.values()) {
    olc.querySelector('b').textContent = f.ad;
    olc.querySelector('p').textContent = f.metin;
    en = Math.max(en, olc.offsetHeight);
  }
  olc.remove();
  if (en) kutu.style.minHeight = en + 'px';
}
let fazGenislik = 0;
new ResizeObserver(() => {
  const w = $('faz').offsetWidth;
  if (w && w !== fazGenislik) { fazGenislik = w; fazYuksekligiSabitle(); }
}).observe($('faz'));
document.fonts?.ready.then(() => fazYuksekligiSabitle());

let son = performance.now(), sayac = 0;
function kare(now) {
  const dt = Math.min(100, now - son); son = now;
  if (durum.calisiyor) T += dt * durum.hiz;
  akis.uret(T);
  if (sayac++ % 20 === 0) renkleriOku();

  const bi = akis.atimBul(T);
  const atim = akis.atimlar[bi];
  const vek = vektor(akis, T);
  const [W, oran] = sure[durum.mod];
  const t0 = T - W * oran;
  const n = NOKTA;
  const vs = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = vektor(akis, t0 + (i / (n - 1)) * W); vs[i * 3] = v[0]; vs[i * 3 + 1] = v[1]; vs[i * 3 + 2] = v[2]; }
  for (const s of seritler) seritCiz(s, vs, n, t0, W, atim);
  eksenCiz(vek);
  if (kalp) kalp.guncelle(T, akis, vek);

  // Evre
  const f = faz(atim, T);
  yaz('faz-ad', f.ad);
  yaz('faz-metin', f.metin);

  // Ölçümler
  const onceki = akis.atimlar[bi - 1];
  let hr = durum.p.hr;
  if (onceki) hr = Math.round(60000 / (atim.q0 - onceki.q0));
  if (durum.p.ritim === 'af') hr = durum.p.hr;
  yaz('o-hr', String(hr));
  yaz('o-hs', durum.p.ritim === 'af' ? 'bpm · düzensiz' : `bpm · ${hizSinifi(hr).toLowerCase()}`);
  yaz('o-pr', durum.p.ritim === 'af' ? '—' : String(Math.round(atim.pr)));
  yaz('o-qrs', String(Math.round(atim.W)));
  yaz('o-qt', String(Math.round(atim.qt)));
  yaz('o-qtc', `/ ${durum.p.qtc} ms`);
  yaz('o-eksen', durum.p.eksen + '°');
  yaz('o-es', eksenSinifi(durum.p.eksen));
  // Gezgin
  if (durum.calisiyor) { const [a, b] = atimAraligi(); $('gez').value = Math.max(0, Math.min(1000, ((T - a) / (b - a)) * 1000)); }
  requestAnimationFrame(kare);
}

// --- Başlat -----------------------------------------------------------------
ritimUygula(durum.ritim, false);
akis.kur(durum.p, T);
renkleriOku();
leadSec(durum.lead);
modUygula(durum.mod);
oynatDugme();
requestAnimationFrame(kare);

(async () => {
  try {
    const { kalpSahnesi } = await import('./ekg-heart.js');
    kalp = await kalpSahnesi($('sahne'), $('etiketler'));
    kalp.etiketleriAyarla($('t-etiket').checked); kalp.iletimiAyarla($('t-iletim').checked); kalp.vektoruAyarla($('t-vektor').checked);
    $('yukleniyor').remove();
  } catch (e) {
    console.error(e);
    $('yukleniyor').textContent = '3B kalp yüklenemedi (internet bağlantısı gerekir). EKG simülasyonu çalışmaya devam eder.';
  }
})();
