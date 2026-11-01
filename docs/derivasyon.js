// EKG derivasyonları: her derivasyon kalbe farklı bir açıdan bakan bir kameradır.
// 3B sahne (ekg-heart.js) + kalp vektörü modeli (ekg-model.js); canlı atım, serbest vektör ve sınav kipleri.
import { DERIVASYONLAR, RITIMLER, AtimAkisi, vektor, nokta } from './ekg-model.js';

const $ = (id) => document.getElementById(id);
const ORG = [0.3, -0.2, 0];   // kalbin elektriksel merkezi (sahne koordinatı)
const MESAFE = 3.7;           // elektrotların merkezden uzaklığı

const BILGI = {
  I: { kutup: 'Sağ kol (−) → sol kol (+)', bolge: 'Lateral duvar', metin: 'Kalbe soldan yatay bakar. Normalde P, QRS ve T pozitiftir. Sol ventrikül ve yüksek lateral duvarı görür.' },
  II: { kutup: 'Sağ kol (−) → sol bacak (+)', bolge: 'Alt (inferior) duvar', metin: 'Normal uyarı yönüne (sinüs düğümünden apekse) en yakın eksendir; P ve QRS burada en belirgindir. Ritim şeridi için en çok kullanılan derivasyondur.' },
  III: { kutup: 'Sol kol (−) → sol bacak (+)', bolge: 'Alt (inferior) duvar', metin: 'Kalbi aşağıdan ve soldan görür. Alt duvar infarktında II ve aVF ile birlikte değişir.' },
  aVR: { kutup: 'Sağ kolun gözü (+)', bolge: 'Sağ üst boşluk, sağ atriyum', metin: 'Kalbe sağ-yukarıdan bakar; normal uyarı ondan uzaklaştığı için P, QRS ve T negatiftir. Bu, bir derivasyon yanlış bağlandı mı kontrolünde de kullanılır.' },
  aVL: { kutup: 'Sol kolun gözü (+)', bolge: 'Yüksek lateral duvar', metin: 'Kalbe sol-yukarıdan bakar. Normalde ince ya da iki fazlıdır; eksen sola kayarsa yükselir.' },
  aVF: { kutup: 'Sol bacağın gözü (+)', bolge: 'Alt (inferior) duvar', metin: 'Kalbe doğrudan aşağıdan bakar. II ve III ile birlikte alt duvarı oluşturur.' },
  V1: { kutup: '4. kosta aralığı, sternumun sağ kenarı', bolge: 'Septum, sağ ventrikül', metin: 'Sağ-önden bakar. Septum soldan sağa uyarılırken ona doğru gelir (küçük r), ardından asıl vektör sola-arkaya gidip uzaklaşır (derin S).' },
  V2: { kutup: '4. kosta aralığı, sternumun sol kenarı', bolge: 'Septum, ön duvar', metin: 'V1 gibi rS görünümündedir; ön duvar infarktında ST ilk burada yükselir, arka duvar infarktında ayna görüntüyle çöker.' },
  V3: { kutup: 'V2 ile V4\'ün ortası', bolge: 'Ön duvar', metin: 'Geçiş (transizyon) bölgesi çoğunlukla V3–V4 arasındadır: R ve S yaklaşık eşitleşir.' },
  V4: { kutup: '5. kosta aralığı, midklaviküler hat', bolge: 'Ön duvar, apeks', metin: 'Apekse bakar. Burada R dalgası S\'den büyük olmaya başlar.' },
  V5: { kutup: 'V4 düzeyinde, ön aksiller hat', bolge: 'Lateral duvar', metin: 'Sol ventrikülün yan duvarına bakar; asıl QRS vektörüne en yakın göğüs derivasyonlarından biridir (yüksek R).' },
  V6: { kutup: 'V4 düzeyinde, orta aksiller hat', bolge: 'Lateral duvar', metin: 'Kalbe soldan, yatay düzlemde bakar. Septal depolarizasyon ondan uzaklaştığı için küçük septal q görülebilir.' },
};

const durum = { lead: 'II', mod: 'canli', kamera: 'serbest', hiz: 1, calisiyor: true, isin: true, iz: true, p: { ritim: 'sinus', ...RITIMLER.sinus }, soru: null, skor: [0, 0] };
let T = 0;
let akis = new AtimAkisi(durum.p, T);
let kalp = null;
let manuel = [0, 0, 0];
let cevaplandi = false;

const lead = (id) => DERIVASYONLAR.find((d) => d.id === id);
const gogus = (id) => id.startsWith('V');

// --- Denetimler ------------------------------------------------------------------
$('lead-ekst').innerHTML = DERIVASYONLAR.filter((d) => !gogus(d.id)).map((d) => `<button type="button" class="lchip" data-l="${d.id}">${d.id}</button>`).join('');
$('lead-gogus').innerHTML = DERIVASYONLAR.filter((d) => gogus(d.id)).map((d) => `<button type="button" class="lchip" data-l="${d.id}">${d.id}</button>`).join('');
document.querySelectorAll('.lchip').forEach((b) => b.addEventListener('click', () => leadSec(b.dataset.l)));

function seg(id, attr, fn) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    fn(b.dataset[attr]);
  });
}
seg('hiz', 'h', (v) => { durum.hiz = +v; });
seg('kamera', 'k', (v) => { durum.kamera = v; sahneGuncelle(); kameraUygula(); });
seg('mod', 'm', (v) => modUygula(v));
$('t-isin').addEventListener('change', (e) => { durum.isin = e.target.checked; sahneGuncelle(); });
$('t-vektor').addEventListener('change', (e) => kalp && kalp.vektoruAyarla(e.target.checked));
$('t-iz').addEventListener('change', (e) => { durum.iz = e.target.checked; sahneGuncelle(); });

function oynatDugme() { $('oynat').textContent = durum.calisiyor ? 'Duraklat' : 'Oynat'; }
$('oynat').addEventListener('click', () => { durum.calisiyor = !durum.calisiyor; oynatDugme(); });
$('a-eksen').addEventListener('input', (e) => {
  durum.p.eksen = +e.target.value; $('v-eksen').textContent = durum.p.eksen + '°';
  akis.ayarla(durum.p, T);
});
$('gez').addEventListener('input', (e) => {
  durum.calisiyor = false; oynatDugme();
  const b = akis.atimlar[akis.atimBul(T)];
  const a = b.t0 - 60, z = b.q0 + b.qt + 160;
  T = a + (e.target.value / 1000) * (z - a);
});
function manuelGuncelle() {
  const th = (+$('a-aci').value * Math.PI) / 180, ph = (+$('a-on').value * Math.PI) / 180, M = (1.2 * +$('a-buy').value) / 100;
  manuel = [M * Math.cos(ph) * Math.cos(th), M * Math.cos(ph) * Math.sin(th), M * Math.sin(ph)];
  $('s-aci').textContent = $('a-aci').value + '°';
  $('s-on').textContent = ($('a-on').value > 0 ? 'öne ' : $('a-on').value < 0 ? 'arkaya ' : '') + Math.abs($('a-on').value) + '°';
  $('s-buy').textContent = (M).toFixed(2) + ' mV';
}
for (const id of ['a-aci', 'a-on', 'a-buy']) $(id).addEventListener('input', manuelGuncelle);
document.querySelectorAll('[data-on]').forEach((b) => b.addEventListener('click', () => {
  const [a, o] = b.dataset.on.split(',');
  $('a-aci').value = a; $('a-on').value = o; $('a-buy').value = 100; manuelGuncelle();
}));

function modUygula(m) {
  durum.mod = m;
  $('mod').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.m === m));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== m; });
  $('iz-kap').hidden = m === 'serbest';
  if (m === 'sinav') { yeniSoru(); }
  else if (m === 'canli') { durum.p = { ritim: 'sinus', ...RITIMLER.sinus, eksen: +$('a-eksen').value }; akis.kur(durum.p, T); durum.calisiyor = true; oynatDugme(); $('iz-gizli').hidden = true; cevaplandi = true; }
  if (m === 'serbest') manuelGuncelle();
}

// --- Sınav ----------------------------------------------------------------------
const FAZLAR = [
  { id: 'P', ad: 'P dalgasının tepesinde (atriyal depolarizasyon)', zaman: (b) => b.t0 + b.pw * 0.52 },
  { id: 'QRS', ad: 'QRS\'in ortasında (ventriküler depolarizasyon)', zaman: (b) => b.q0 + 0.42 * b.W },
  { id: 'T', ad: 'T dalgasının tepesinde (ventriküler repolarizasyon)', zaman: (b) => b.tc },
];
function siniflandir(v, d) {
  const n = Math.hypot(...v) || 1;
  const u = (v[0] * d.yon[0] + v[1] * d.yon[1] + v[2] * d.yon[2]) / n;
  return { u, sinif: u > 0.25 ? 'poz' : u < -0.25 ? 'neg' : 'duz' };
}
function yeniSoru() {
  const eksenler = [-30, 0, 30, 55, 75, 100];
  for (let deneme = 0; deneme < 30; deneme++) {
    const d = DERIVASYONLAR[Math.floor(Math.random() * 12)];
    const f = FAZLAR[Math.floor(Math.random() * 3)];
    durum.p = { ritim: 'sinus', ...RITIMLER.sinus, eksen: eksenler[Math.floor(Math.random() * eksenler.length)] };
    akis.kur(durum.p, T);
    const b = akis.atimlar[akis.atimBul(T) + 1];
    const t = f.zaman(b);
    const v = vektor(akis, t);
    const s = siniflandir(v, d);
    if (Math.abs(s.u) < 0.12 || Math.abs(s.u) > 0.4) { durum.soru = { d, f, t, v, ...s }; break; }
  }
  const q = durum.soru;
  leadSec(q.d.id);
  T = q.t; durum.calisiyor = false; oynatDugme();
  cevaplandi = false;
  $('iz-gizli').hidden = false;
  $('s-metin').innerHTML = `Kalp vektörü şu anda <b>${q.f.ad}</b>. <b>${q.d.id}</b> derivasyonunda çizgi nasıl sapar? <span class="muted">(QRS ekseni ${durum.p.eksen}°)</span>`;
  $('s-sonuc').hidden = true;
  $('s-sec').querySelectorAll('button').forEach((b) => { b.disabled = false; b.classList.remove('dogru', 'yanlis'); });
  $('s-skor').textContent = `Doğru: ${durum.skor[0]} / ${durum.skor[1]}`;
}
$('s-sec').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || cevaplandi) return;
  cevaplandi = true;
  const q = durum.soru, dogru = b.dataset.c === q.sinif;
  durum.skor[1]++; if (dogru) durum.skor[0]++;
  $('s-sec').querySelectorAll('button').forEach((x) => { x.disabled = true; if (x.dataset.c === q.sinif) x.classList.add('dogru'); });
  if (!dogru) b.classList.add('yanlis');
  const aci = Math.round((Math.acos(Math.max(-1, Math.min(1, q.u))) * 180) / Math.PI);
  const ad = { poz: 'yukarı', neg: 'aşağı', duz: 'düz ya da iki fazlı' }[q.sinif];
  const neden = q.sinif === 'poz' ? 'Vektör derivasyonun kamerasına doğru gidiyor (açı 90°\'den küçük).' : q.sinif === 'neg' ? 'Vektör kameradan uzaklaşıyor (açı 90°\'den büyük).' : 'Vektör kameranın bakışına neredeyse dik; çizgi çok az sapar.';
  $('s-sonuc').hidden = false;
  $('s-sonuc').innerHTML = `${dogru ? '✓ Doğru.' : '✗ Yanlış.'} Çizgi <b>${ad}</b> sapar. Vektör ile ${q.d.id} ekseni arasındaki açı yaklaşık <b>${aci}°</b>. ${neden}`;
  $('s-skor').textContent = `Doğru: ${durum.skor[0]} / ${durum.skor[1]}`;
  $('iz-gizli').hidden = true;
  T = q.t - 500; durum.hiz = 0.5; durum.calisiyor = true; oynatDugme();
  $('hiz').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.h === '0.5'));
});
$('s-sonraki').addEventListener('click', yeniSoru);

// --- 3B nesneler: elektrotlar, ışınlar, koni, gölge -------------------------------
let nesne = null;
function sahneKur() {
  const { THREE, scene } = kalp;
  const org = new THREE.Vector3(...ORG);
  const grup = new THREE.Group();
  scene.add(grup);
  const etiketKutu = $('etiketler');
  const girdiler = DERIVASYONLAR.map((d) => {
    const dir = new THREE.Vector3(d.yon[0], -d.yon[1], d.yon[2]).normalize();
    const poz = org.clone().add(dir.clone().multiplyScalar(MESAFE));
    const renk = gogus(d.id) ? 0x4cbb6c : 0x5b9bff;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: renk, depthTest: false, transparent: true }));
    marker.position.copy(poz); marker.renderOrder = 20;
    const cizgi = new THREE.Line(new THREE.BufferGeometry().setFromPoints([org, poz]), new THREE.LineBasicMaterial({ color: renk, transparent: true, opacity: 0.4, depthTest: false }));
    cizgi.renderOrder = 19;
    grup.add(marker, cizgi);
    const el = document.createElement('span');
    el.className = 'kalp-etiket drv-etiket'; el.textContent = d.id; el.hidden = true;
    etiketKutu.appendChild(el);
    return { d, dir, poz, marker, cizgi, el, renk };
  });
  // Düzlem halkaları
  const halka = (donus) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(MESAFE - 0.012, MESAFE + 0.012, 96), new THREE.MeshBasicMaterial({ color: 0x8a919e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthTest: false }));
    m.position.copy(org); m.rotation.copy(donus); m.renderOrder = 18; grup.add(m); return m;
  };
  const frontal = halka(new THREE.Euler(0, 0, 0));
  const yatay = halka(new THREE.Euler(-Math.PI / 2, 0, 0));
  // Bakış konisi: tepe elektrotta, taban kalbin arkasında
  const L = MESAFE + 0.4;
  const koniGeo = new THREE.ConeGeometry(1.7, L, 40, 1, true);
  const koni = new THREE.Mesh(koniGeo, new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  grup.add(koni);
  const gol = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), org, 1, 0x4cbb6c, 0.22, 0.14);
  gol.line.material.depthTest = false; gol.cone.material.depthTest = false; gol.line.renderOrder = 21; gol.cone.renderOrder = 21;
  gol.line.material.linewidth = 3;
  grup.add(gol);
  nesne = { THREE, org, girdiler, frontal, yatay, koni, gol, L };
  kalp.etiketleriAyarla(false);
  kalp.vektoruAyarla(true);
  sahneGuncelle();
}
function sahneGuncelle() {
  if (!nesne) return;
  const { THREE, org, girdiler, frontal, yatay, koni, L } = nesne;
  const sec = lead(durum.lead), g = gogus(sec.id);
  frontal.visible = !g; yatay.visible = g;
  for (const e of girdiler) {
    const ayni = gogus(e.d.id) === g;
    const secili = e.d.id === sec.id;
    e.marker.visible = ayni && !(secili && durum.kamera === 'goz'); e.cizgi.visible = ayni;
    e.marker.scale.setScalar(secili ? 1.9 : 1);
    e.marker.material.color.set(secili ? 0xf2c14e : e.renk);
    e.cizgi.material.opacity = secili ? 1 : 0.28;
    e.el.classList.toggle('sec', secili);
  }
  const e = girdiler.find((x) => x.d.id === sec.id);
  koni.visible = durum.isin;
  koni.position.copy(org).add(e.dir.clone().multiplyScalar(MESAFE - L / 2));
  koni.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), e.dir);
  nesne.gol.visible = durum.iz;
}
function kameraUygula() {
  if (!kalp || !nesne) return;
  if (durum.kamera === 'goz') {
    const e = nesne.girdiler.find((x) => x.d.id === durum.lead);
    const p = e.dir.clone().multiplyScalar(6.3).add(nesne.org);
    p.x += 0.001; p.z += 0.001;
    kalp.konum([p.x, p.y, p.z]);
  } else kalp.gorunum('on');
}

function leadSec(id) {
  durum.lead = id;
  document.querySelectorAll('.lchip').forEach((b) => b.classList.toggle('on', b.dataset.l === id));
  const b = BILGI[id];
  $('l-kutup').textContent = b.kutup.toUpperCase();
  $('l-ad').textContent = `${id} · ${b.bolge}`;
  $('l-metin').textContent = b.metin;
  $('iz-ad').textContent = id;
  sahneGuncelle();
  kameraUygula();
}

// --- 2B çizimler ----------------------------------------------------------------
let renk = {};
function renkleriOku() {
  const s = getComputedStyle(document.documentElement);
  const v = (n, d) => (s.getPropertyValue(n).trim() || d);
  renk = { metin: v('--text', '#e8eaee'), vurgu: v('--accent', '#f2c14e'), cizgi: v('--line', '#262b33'), sus: v('--muted', '#8a919e'), iz: v('--ok', '#4cbb6c'), kotu: v('--bad', '#e63946') };
}
function tuval(cv, kare = false) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 300, h = kare ? w : cv.clientHeight || 200;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  if (kare) cv.style.height = w + 'px';
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  return [c, w, h];
}

const IZ_PENCERE = 3500, IZ_ORAN = 0.4, N = 280;
function izCiz(vs) {
  const [c, w, h] = tuval($('iz'));
  const d = lead(durum.lead), t0 = T - IZ_PENCERE * IZ_ORAN;
  const X = (t) => ((t - t0) / IZ_PENCERE) * w, taban = h * 0.6, pxMv = h / 3.4, Y = (mv) => taban - mv * pxMv;
  for (let t = Math.floor(t0 / 40) * 40; t < t0 + IZ_PENCERE; t += 40) {
    const b = Math.round(t / 40) % 5 === 0;
    c.strokeStyle = renk.cizgi; c.globalAlpha = b ? 0.9 : 0.35;
    c.beginPath(); c.moveTo(X(t) + 0.5, 0); c.lineTo(X(t) + 0.5, h); c.stroke();
  }
  for (let mv = -2; mv <= 2.5; mv += 0.1) {
    const b = Math.abs(Math.round(mv * 10) % 5) === 0;
    c.strokeStyle = renk.cizgi; c.globalAlpha = b ? 0.9 : 0.35;
    c.beginPath(); c.moveTo(0, Y(mv) + 0.5); c.lineTo(w, Y(mv) + 0.5); c.stroke();
  }
  c.globalAlpha = 1;
  c.strokeStyle = renk.sus; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(0, taban); c.lineTo(w, taban); c.stroke(); c.setLineDash([]);
  if (durum.mod === 'sinav' && !cevaplandi) return;
  const simdi = w * IZ_ORAN, ni = Math.round(IZ_ORAN * (N - 1));
  const ciz = (a, z, al) => {
    c.globalAlpha = al; c.strokeStyle = renk.iz; c.lineWidth = 2.2; c.lineJoin = 'round'; c.beginPath();
    for (let i = a; i <= z; i++) {
      const y = Math.max(-4, Math.min(h + 4, Y(nokta([vs[i * 3], vs[i * 3 + 1], vs[i * 3 + 2]], d))));
      if (i === a) c.moveTo((i / (N - 1)) * w, y); else c.lineTo((i / (N - 1)) * w, y);
    }
    c.stroke(); c.globalAlpha = 1;
  };
  ciz(0, ni, 1); ciz(ni, N - 1, 0.28);
  c.strokeStyle = renk.vurgu; c.lineWidth = 1.2; c.beginPath(); c.moveTo(simdi, 0); c.lineTo(simdi, h); c.stroke();
  const v = nokta([vs[ni * 3], vs[ni * 3 + 1], vs[ni * 3 + 2]], d);
  c.fillStyle = renk.vurgu; c.beginPath(); c.arc(simdi, Math.max(4, Math.min(h - 4, Y(v))), 4, 0, 7); c.fill();
  c.fillStyle = renk.sus; c.font = '500 12px "JetBrains Mono", ui-monospace, monospace'; c.textAlign = 'right';
  c.fillText(`${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} mV`, w - 10, 18);
}

function diyagramCiz(vek) {
  const [c, w] = tuval($('eksen'), true);
  const d = lead(durum.lead), yatay = gogus(d.id);
  const cx = w / 2, R = w * 0.38, olcek = R / 1.4;
  const P = (v) => (yatay ? [v[0], -v[2]] : [v[0], v[1]]);
  c.lineWidth = 1; c.strokeStyle = renk.cizgi; c.beginPath(); c.arc(cx, cx, R, 0, 7); c.stroke();
  c.font = '600 12px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const l of DERIVASYONLAR.filter((x) => gogus(x.id) === yatay)) {
    const [dx, dy] = P(l.yon), n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n, s = l.id === d.id;
    c.strokeStyle = s ? renk.vurgu : renk.sus; c.globalAlpha = s ? 1 : 0.5; c.lineWidth = s ? 2 : 1;
    c.beginPath(); c.moveTo(cx - ux * R, cx - uy * R); c.lineTo(cx + ux * R, cx + uy * R); c.stroke();
    c.fillStyle = s ? renk.vurgu : renk.sus; c.globalAlpha = s ? 1 : 0.85; c.fillText(l.id, cx + ux * (R + 17), cx + uy * (R + 17));
  }
  c.globalAlpha = 1;
  const [vx, vy] = P(vek), tx = cx + vx * olcek, ty = cx + vy * olcek;
  const [dx, dy] = P(d.yon), dn = Math.hypot(dx, dy) || 1, ux = dx / dn, uy = dy / dn, iz = vx * ux + vy * uy;
  c.strokeStyle = iz >= 0 ? renk.iz : renk.kotu; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, cx); c.lineTo(cx + ux * iz * olcek, cx + uy * iz * olcek); c.stroke();
  c.setLineDash([4, 4]); c.lineWidth = 1; c.strokeStyle = renk.sus; c.beginPath(); c.moveTo(tx, ty); c.lineTo(cx + ux * iz * olcek, cx + uy * iz * olcek); c.stroke(); c.setLineDash([]);
  const L = Math.hypot(vx, vy);
  if (L > 0.02) {
    c.strokeStyle = c.fillStyle = '#2fe0c8'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(cx, cx); c.lineTo(tx, ty); c.stroke();
    const a = Math.atan2(ty - cx, tx - cx);
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx - 9 * Math.cos(a - 0.4), ty - 9 * Math.sin(a - 0.4)); c.lineTo(tx - 9 * Math.cos(a + 0.4), ty - 9 * Math.sin(a + 0.4)); c.closePath(); c.fill();
  }
  c.fillStyle = renk.sus; c.font = '500 11px Inter, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText(yatay ? 'Yatay düzlem (üstten bakış)' : 'Frontal düzlem', 8, 14);
  if (yatay) { c.textAlign = 'center'; c.fillText('ön', cx, w - 4); }
  $('d-baslik').textContent = yatay ? 'Yatay düzlem' : 'Frontal düzlem';
  const va = (Math.atan2(vy, vx) * 180) / Math.PI, la = (Math.atan2(dy, dx) * 180) / Math.PI;
  const fark = Math.round(Math.abs(((va - la + 540) % 360) - 180));
  $('d-not').textContent = L > 0.06 ? `Vektör ${Math.round(va)}°, ${d.id} ekseni ${Math.round(la)}°: aradaki açı ${fark}° → ${fark < 80 ? 'kameraya doğru, yukarı' : fark > 100 ? 'kameradan uzağa, aşağı' : 'yaklaşık dik, düz'}.` : 'Vektör şu anda çok küçük (izoelektrik).';
}

function cubukCiz(vek) {
  const [c, w, h] = tuval($('cubuk'), true);
  const sat = h / 12, orta = w * 0.55, olcek = (w * 0.38) / 1.8;
  c.font = '600 12px Inter, sans-serif'; c.textBaseline = 'middle';
  DERIVASYONLAR.forEach((d, i) => {
    const y = i * sat + sat / 2, v = nokta(vek, d), sec = d.id === durum.lead;
    if (sec) { c.fillStyle = renk.vurgu; c.globalAlpha = 0.12; c.fillRect(0, i * sat, w, sat); c.globalAlpha = 1; }
    c.fillStyle = sec ? renk.vurgu : renk.sus; c.textAlign = 'left'; c.fillText(d.id, 8, y);
    c.fillStyle = v >= 0 ? renk.iz : renk.kotu; c.fillRect(Math.min(orta, orta + v * olcek), y - sat * 0.28, Math.abs(v * olcek), sat * 0.56);
    c.fillStyle = renk.sus; c.textAlign = 'right'; c.font = '500 11px "JetBrains Mono", ui-monospace, monospace'; c.fillText(`${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`, w - 6, y); c.font = '600 12px Inter, sans-serif';
  });
  c.strokeStyle = renk.sus; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(orta, 0); c.lineTo(orta, h); c.stroke(); c.globalAlpha = 1;
}
$('cubuk').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  leadSec(DERIVASYONLAR[Math.max(0, Math.min(11, Math.floor(((e.clientY - r.top) / r.height) * 12)))].id);
});

function etiketleriKonumla() {
  if (!nesne) return;
  const { cam, THREE } = kalp, k = $('sahne'), w = k.clientWidth, h = k.clientHeight, v = new THREE.Vector3();
  const g = gogus(durum.lead);
  for (const e of nesne.girdiler) {
    if (gogus(e.d.id) !== g) { e.el.hidden = true; continue; }
    v.copy(e.poz).project(cam);
    e.el.hidden = v.z > 1;
    e.el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h - 14}px)`;
  }
}

// --- Ana döngü ------------------------------------------------------------------
let son = performance.now(), sayac = 0;
function kare(now) {
  const dt = Math.min(100, now - son); son = now;
  if (durum.mod !== 'serbest' && durum.calisiyor) T += dt * durum.hiz;
  akis.uret(T);
  if (sayac++ % 20 === 0) renkleriOku();
  const d = lead(durum.lead);
  const vek = durum.mod === 'serbest' ? manuel : vektor(akis, T);
  const vs = new Float32Array(N * 3);
  if (durum.mod !== 'serbest') for (let i = 0; i < N; i++) { const v = vektor(akis, T - IZ_PENCERE * IZ_ORAN + (i / (N - 1)) * IZ_PENCERE); vs[i * 3] = v[0]; vs[i * 3 + 1] = v[1]; vs[i * 3 + 2] = v[2]; }
  if (durum.mod !== 'serbest') izCiz(vs);
  diyagramCiz(vek); cubukCiz(vek);
  if (kalp) {
    const b = akis.atimlar[akis.atimBul(T)];
    const bosT = b.tc + 3.2 * b.tsig + 60;
    kalp.guncelle(durum.mod === 'serbest' ? bosT : T, akis, vek);
    if (nesne) {
      const u = nokta(vek, { yon: d.yon, kaz: 1 });
      const dir = nesne.girdiler.find((x) => x.d.id === d.id).dir;
      const n = Math.abs(u);
      nesne.gol.visible = durum.iz && n > 0.02;
      nesne.gol.setDirection(u >= 0 ? dir : dir.clone().negate());
      nesne.gol.setLength(Math.max(0.05, n * 1.1 + 0.001), 0.22, 0.14);
      nesne.gol.setColor(u >= 0 ? 0x4cbb6c : 0xe63946);
      etiketleriKonumla();
    }
  }
  if (durum.mod === 'canli') {
    const b = akis.atimlar[akis.atimBul(T)], a = b.t0 - 60, z = b.q0 + b.qt + 160;
    if (durum.calisiyor) $('gez').value = Math.max(0, Math.min(1000, ((T - a) / (z - a)) * 1000));
  }
  requestAnimationFrame(kare);
}

// --- Başlat ---------------------------------------------------------------------
$('v-eksen').textContent = durum.p.eksen + '°';
manuelGuncelle();
renkleriOku();
leadSec('II');
modUygula('canli');
oynatDugme();
requestAnimationFrame(kare);

(async () => {
  try {
    const { kalpSahnesi } = await import('./ekg-heart.js');
    kalp = await kalpSahnesi($('sahne'), $('etiketler'));
    $('yukleniyor').remove();
    sahneKur();
  } catch (e) {
    console.error(e);
    $('yukleniyor').textContent = '3B kalp yüklenemedi (internet bağlantısı gerekir). 2B şemalar çalışmaya devam eder.';
  }
})();
