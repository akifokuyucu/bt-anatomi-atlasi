// Pupilla: sallanan ışık testi. Lezyon, görme yolları sayfasıyla aynı modelde (gorme-model.js) kesilen liflerden hesaplanır;
// pupilla sürüşü ve RAPD buradan çıkar. Durum bağlantıda: #p=patoloji&t=1|-1&k=boyut (serbest lezyonda &x=..&y=..&z=..)
import { modelKur, PATOLOJI, EVRE_AD, pupillaSurus } from './gorme-model.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// gorme.js ile aynı: duraklar ve {L}/{K} yan yer tutucuları
const DURAK = [['normal', 'Normal'], ['retina', 'Retina ve disk'], ['sinir', 'Optik sinir'], ['kiazma', 'Kiazma'], ['traktus', 'Traktus'], ['lgn', 'LGN'], ['radyasyon', 'Radyasyon'], ['v1', 'Korteks']];
const yan = (h) => (h > 0 ? 'sol' : 'sağ');
const buyuk = (t) => t.charAt(0).toLocaleUpperCase('tr') + t.slice(1);
const metin = (t, h) => buyuk(String(t).replaceAll('{L}', yan(h)).replaceAll('{K}', yan(-h)));

const durum = { p: 'normal', t: 1, k: 1, serbest: null, isik: 'sallan', durak: 'normal' };
let model, sonuc = null, kureler = [], alanFn = null;
const patoloji = (id) => PATOLOJI.find((p) => p.id === id);

// --- Pupilla çizimi (gorme.js ile aynı) -------------------------------------------------------
const pup = { cap: [6.4, 6.4], surus: [1, 1], t: 0, son: 0, gorunur: true };
function olc(c) {
  const r = c.getBoundingClientRect();
  const o = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(10, Math.round(r.width * o)), h = Math.max(10, Math.round(r.height * o));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return { w, h, o };
}
function pupilCiz(now) {
  requestAnimationFrame(pupilCiz);
  if (!pup.gorunur || document.hidden) { pup.son = now; return; }
  const dt = Math.min(.1, (now - (pup.son || now)) / 1000);
  pup.son = now; pup.t += dt;
  let kay = -1;
  if (durum.isik === 'sol') kay = 0;
  else if (durum.isik === 'sag') kay = 1;
  else if (durum.isik === 'sallan') {
    const f = (pup.t % 4.4) / 4.4;
    kay = f < 0.42 ? 0 : f < 0.5 ? -2 : f < 0.92 ? 1 : -2; // -2: göz arası geçiş
  }
  const hedef = kay >= 0 ? 6.4 - 3.8 * pup.surus[kay] : kay === -2 ? pup.cap[0] : 6.4;
  const hiz = kay >= 0 && hedef < pup.cap[0] ? 3.5 : 1.1;
  pup.cap = pup.cap.map((v) => v + (hedef - v) * Math.min(1, dt * hiz));
  const c = $('pupil');
  const { w, h, o } = olc(c);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const Ry = h * .3, Rx = Ry * 1.75;
  [[w * .27, 0], [w * .73, 1]].forEach(([x, g]) => {
    const y = h * .47;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - Rx, y); ctx.quadraticCurveTo(x, y - Ry * 1.55, x + Rx, y); ctx.quadraticCurveTo(x, y + Ry * 1.55, x - Rx, y);
    ctx.fillStyle = '#ece8e0'; ctx.fill(); ctx.clip();
    const ir = Ry * 1.02;
    const gr = ctx.createRadialGradient(x, y, ir * .15, x, y, ir);
    gr.addColorStop(0, '#6a8fa8'); gr.addColorStop(1, '#2f4a5e');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, ir, 0, 7); ctx.fill();
    ctx.fillStyle = '#04050a'; ctx.beginPath(); ctx.arc(x, y, ir * pup.cap[g] / 8.6, 0, 7); ctx.fill();
    ctx.restore();
    if (kay === g) {
      ctx.fillStyle = 'rgba(255,240,160,.22)'; ctx.beginPath(); ctx.arc(x, y, Rx * 1.05, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.arc(x + ir * .25, y - ir * .25, 3.2 * o, 0, 7); ctx.fill();
    }
    ctx.font = `600 ${11 * o}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#dfe3ea';
    ctx.fillText(g ? 'Sağ göz' : 'Sol göz', x, h - 6 * o);
    ctx.font = `${10 * o}px var(--mono, monospace)`; ctx.fillStyle = '#a7aebb';
    ctx.fillText(`${pup.cap[g].toFixed(1)} mm`, x, 13 * o);
  });
}

function rapdYaz() {
  const yol = sonuc ? pupillaSurus(model, sonuc.Dp) : [1, 1];
  pup.surus = yol;
  const dif = yol[0] - yol[1];
  const a = Math.abs(dif);
  let t;
  if (a < 0.05) {
    t = yol[0] < 0.75
      ? '<b>RAPD yok.</b> Afferent kayıp iki gözde simetrik; karşılaştırmalı test farkı göstermez, ama iki gözün ışık yanıtı azalmıştır.'
      : sonuc && (kureler.length || alanFn) && durum.p !== 'normal' && yol[0] > 0.97
        ? '<b>RAPD yok, pupillalar normal.</b> Pupilla lifleri traktusun sonunda mezensefalona ayrılır; bu lezyon o noktadan sonradır.'
        : '<b>RAPD yok.</b> Dikkat: sürüş iki gözde birbirine yakın.';
  } else {
    const g = dif > 0 ? 'Sağ' : 'Sol';
    const d = a < 0.2 ? 'hafif' : a < 0.5 ? 'orta' : 'belirgin';
    t = `<b>${g} gözde ${d} RAPD.</b> Işık bu göze geçince iki pupilla da genişler, çünkü bu gözden gelen afferent sinyal daha zayıftır. Sürüş: sol %${Math.round(yol[0] * 100)}, sağ %${Math.round(yol[1] * 100)}.`;
  }
  $('rapd').innerHTML = t;
}

// --- Lezyon ----------------------------------------------------------------------------------
function hesapla() {
  const p = patoloji(durum.p);
  kureler = []; alanFn = null;
  if (durum.serbest) kureler = [[...durum.serbest, 4.5 * durum.k]];
  else if (p.kureler) kureler = p.kureler(durum.t, durum.k);
  else if (p.alan) alanFn = p.alan(durum.t);
  if (durum.p === 'normal' && !durum.serbest) alanFn = null;
  sonuc = model.hesapla({ kureler, alan: alanFn });
  rapdYaz();
  bilgi();
  baglantiYaz();
}

function bilgi() {
  const p = patoloji(durum.p), serbest = !!durum.serbest;
  const tarafAnlamli = !serbest && p.tek;
  $('taraf').style.opacity = tarafAnlamli ? '' : '.4';
  $('taraf').querySelectorAll('button').forEach((b) => { b.disabled = !tarafAnlamli; b.classList.toggle('on', +b.dataset.t === durum.t); });
  $('b-yer').textContent = serbest ? 'SERBEST LEZYON' : p.evre === 'normal' ? 'REFERANS' : EVRE_AD[p.evre].toLocaleUpperCase('tr');
  $('b-ad').textContent = serbest ? 'Görme yolları sayfasında yerleştirilen lezyon' : p.ad;
  $('b-ozet').textContent = serbest ? 'Lezyon, görme yolları sayfasında 3B modele elle yerleştirildi; pupilla yanıtı kestiği liflerden hesaplandı.' : metin(p.ozet, durum.t);
}

function baglantiParam() {
  const q = new URLSearchParams();
  q.set('p', durum.serbest ? 'serbest' : durum.p);
  q.set('t', durum.t);
  q.set('k', durum.k);
  if (durum.serbest) { q.set('x', durum.serbest[0].toFixed(1)); q.set('y', durum.serbest[1].toFixed(1)); q.set('z', durum.serbest[2].toFixed(1)); }
  return q;
}
function baglantiYaz() {
  const q = baglantiParam();
  history.replaceState(null, '', '#' + q);
  $('yol-baglanti').href = 'gorme.html#' + q; // aynı lezyonla yollar sayfasına geç
}
function baglantidanOku() {
  const q = new URLSearchParams(location.hash.slice(1));
  const p = q.get('p');
  if (q.has('t')) durum.t = +q.get('t') < 0 ? -1 : 1;
  if (q.has('k')) durum.k = Math.min(1.6, Math.max(.5, +q.get('k') || 1));
  if (p === 'serbest' && q.has('x')) { durum.serbest = [+q.get('x'), +q.get('y'), +q.get('z')]; durum.p = 'normal'; }
  else if (patoloji(p)) durum.p = p;
  durum.durak = patoloji(durum.p).evre;
}

// --- Seçim şeridi ----------------------------------------------------------------------------
function secimKur() {
  $('duraklar').innerHTML = DURAK.map(([id, ad]) => `<li><button type="button" data-d="${id}">${ad}</button></li>`).join('');
  $('duraklar').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    durum.durak = b.dataset.d; durum.serbest = null; durum.k = 1;
    durum.p = PATOLOJI.find((p) => p.evre === durum.durak).id;
    secimCiz(); hesapla();
  });
  $('chipler').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    durum.p = b.dataset.p; durum.serbest = null; durum.k = 1;
    secimCiz(); hesapla();
  });
  $('taraf').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    durum.t = +b.dataset.t; hesapla();
  });
  $('isik').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $('isik').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    durum.isik = b.dataset.i; pup.t = 0;
  });
}
function secimCiz() {
  $('duraklar').querySelectorAll('button').forEach((b) => b.classList.toggle('on', !durum.serbest && b.dataset.d === durum.durak));
  const ser = $('duraklar'), etkin = ser.querySelector('.on'); // dar ekranda etkin durak görünür kalsın
  if (etkin) ser.scrollLeft = etkin.parentElement.offsetLeft - ser.offsetLeft - (ser.clientWidth - etkin.offsetWidth) / 2;
  const ls = PATOLOJI.filter((p) => p.evre === durum.durak);
  $('chipler').innerHTML = ls.length > 1 || durum.durak !== 'normal'
    ? ls.map((p) => `<button type="button" class="gy-chip${!durum.serbest && p.id === durum.p ? ' on' : ''}" data-p="${p.id}">${esc(p.ad)}</button>`).join('')
    : '<span class="muted not">Bir durak seçin: lezyonun yerine göre pupilla yanıtı değişir.</span>';
}

// --- Açılış ----------------------------------------------------------------------------------
(async () => {
  try {
    model = modelKur(await fetch('data/optik/optik.json').then((r) => r.json()));
  } catch (e) {
    console.error(e);
    $('rapd').textContent = 'Model yüklenemedi. Sayfayı yenileyin.';
    return;
  }
  secimKur();
  baglantidanOku();
  secimCiz();
  hesapla();
  new IntersectionObserver(([g]) => { pup.gorunur = g.isIntersecting; }).observe($('pupil'));
  requestAnimationFrame(pupilCiz);
})();
