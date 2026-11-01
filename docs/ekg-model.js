// EKG modeli: kalbin elektrik vektörü (3 boyutlu) ve derivasyon eksenleri.
// Koordinat: x = hastanın solu, y = aşağı (inferior), z = ön. Süre ms, genlik mV.
// Her derivasyon, o andaki kalp vektörünün derivasyon yönüne izdüşümüdür; böylece
// "aynı olay, farklı derivasyonda neden farklı görünür" doğrudan modelden çıkar.

const rad = (a) => (a * Math.PI) / 180;
const fr = (a) => [Math.cos(rad(a)), Math.sin(rad(a)), 0];
const norm = (v) => { const n = Math.hypot(...v); return v.map((c) => c / n); };

export const DERIVASYONLAR = [
  { id: 'I', yon: fr(0), kaz: 1, aci: 0 },
  { id: 'II', yon: fr(60), kaz: 1, aci: 60 },
  { id: 'III', yon: fr(120), kaz: 1, aci: 120 },
  { id: 'aVR', yon: fr(-150), kaz: 1, aci: -150 },
  { id: 'aVL', yon: fr(-30), kaz: 1, aci: -30 },
  { id: 'aVF', yon: fr(90), kaz: 1, aci: 90 },
  { id: 'V1', yon: norm([-0.4, 0, 0.9]), kaz: 1.5 },
  { id: 'V2', yon: norm([-0.15, 0, 0.99]), kaz: 1.5 },
  { id: 'V3', yon: norm([0.2, 0.05, 0.97]), kaz: 1.5 },
  { id: 'V4', yon: norm([0.55, 0.08, 0.83]), kaz: 1.5 },
  { id: 'V5', yon: norm([0.8, 0.1, 0.58]), kaz: 1.5 },
  { id: 'V6', yon: norm([0.95, 0.1, 0.28]), kaz: 1.5 },
];

export const RITIMLER = {
  sinus: {
    ad: 'Normal sinüs ritmi', hr: 72, pr: 160, qrs: 90, qtc: 400, eksen: 55,
    ozet: 'Uyarı sinüs düğümünden doğar, normal yoldan iletilir. Her P dalgasını bir QRS izler.',
    ipuclari: ['P dalgası II\'de pozitif, aVR\'de negatif', 'PR 120–200 ms', 'QRS dar (<120 ms)', 'RR düzenli'],
  },
  avb1: {
    ad: '1. derece AV blok', hr: 70, pr: 280, qrs: 90, qtc: 400, eksen: 55,
    ozet: 'Uyarı AV düğümde normalden fazla gecikir ama her P\'yi bir QRS izler. Tek bulgu uzun PR\'dir.',
    ipuclari: ['PR > 200 ms ve sabit', 'Her P\'yi QRS izler', 'AV düğüm yavaş; His–Purkinje normal'],
  },
  af: {
    ad: 'Atriyal fibrilasyon', hr: 110, pr: 160, qrs: 90, qtc: 400, eksen: 55,
    ozet: 'Atriyumlar koordinesiz, çok hızlı uyarılır; AV düğüm bu uyarıların bir kısmını düzensiz geçirir.',
    ipuclari: ['P dalgası yok, yerinde ince f dalgaları', 'RR tümüyle düzensiz', 'QRS dar'],
  },
  ldb: {
    ad: 'Sol dal bloğu', hr: 72, pr: 170, qrs: 150, qtc: 440, eksen: 20,
    ozet: 'Sol dal iletmez; sol ventrikül miyokard içinden yavaşça, sağdan sola uyarılır. QRS genişler.',
    ipuclari: ['QRS ≥ 120 ms', 'V1\'de derin S/QS, V6\'da çentikli geniş R', 'T dalgası QRS\'e zıt (diskordan)'],
  },
  stemi: {
    ad: 'İnferior STEMI', hr: 80, pr: 160, qrs: 90, qtc: 410, eksen: 55,
    ozet: 'Alt duvarı besleyen damarın tıkanması: hasarlı bölgeye bakan derivasyonlarda ST yükselir.',
    ipuclari: ['II, III, aVF\'de ST yükselmesi (III ≥ II)', 'I ve aVL\'de resiprokal ST çökmesi', 'Hiperakut T dalgaları'],
  },
};

// Wikipedia/ders kitabı şeması: hız sınıfı
export function hizSinifi(hr) {
  if (hr < 60) return 'Bradikardi';
  if (hr > 100) return 'Taşikardi';
  return 'Normal hız';
}

// Mulberry32: tohumlu, tekrar üretilebilir rastgele sayı
function tohum(s) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tek bir atımın dalga bileşenleri. q0 = QRS başlangıcı (mutlak ms).
export function atimOlustur(p, q0) {
  const W = p.qrs;
  const a = rad(p.eksen);
  const rrS = 60 / p.hr;
  const qt = Math.min(p.qtc * Math.sqrt(rrS) + (W - 90) * 0.6, 0.85 * rrS * 1000);
  const tsig = 0.095 * qt;
  const tc = q0 + qt - 2.3 * tsig;
  const pw = 100;
  const af = p.ritim === 'af';
  const b = { q0, t0: q0 - p.pr, pr: p.pr, pw, W, qt, tsig, tc, tip: p.ritim, kom: [] };
  const g = (c, s, v) => b.kom.push({ c, s, v });

  if (!af) {
    // P: sağ atriyum (ön-sağ-aşağı) ardından sol atriyum (arka-sol)
    g(b.t0 + 0.35 * pw, 0.17 * pw, [-0.2 * 0.1, 0.8 * 0.1, 0.6 * 0.1]);
    g(b.t0 + 0.7 * pw, 0.17 * pw, [0.6 * 0.11, 0.4 * 0.11, -0.7 * 0.11]);
  }

  if (p.ritim === 'ldb') {
    g(q0 + 0.1 * W, 0.06 * W, [0.06, 0, -0.06]);
    g(q0 + 0.35 * W, 0.12 * W, [1.0, 0.35, -0.9]);
    g(q0 + 0.62 * W, 0.12 * W, [0.72, 0.24, -0.64]);
    g(b.tc, tsig, [-0.2, -0.1, 0.15]);
    g(q0 + W + 40, 50, [-0.05, -0.04, 0.03]);
  } else {
    const M = 1.15;
    g(q0 + 0.14 * W, 0.07 * W, [-0.135, 0.07, 0.25]);                       // septum soldan sağa
    g(q0 + 0.42 * W, 0.12 * W, [M * Math.cos(a), M * Math.sin(a), -0.5 * M]); // serbest duvarlar
    g(q0 + 0.78 * W, 0.09 * W, [-0.1, -0.14, -0.12]);                       // bazal bölgeler
    const tk = p.ritim === 'stemi' ? 1.5 : 1;
    g(b.tc, tsig, [0.4 * 0.55 * tk, 0.35 * 0.55 * tk, 0.15 * 0.55 * tk]);
    if (p.ritim === 'stemi') g(q0 + W + 80, 75, [-0.2 * 0.6, 0.6 * 0.6, 0.05 * 0.6]);
  }
  if (p.mi && p.mi.evre > 0) miEkle(b, p, g, q0, W);
  return b;
}

// Miyokard infarktüsü evreleri: ST yaralanma vektörü, T değişimi ve patolojik Q (vektör hasarlı bölgeye bakar).
// 0 normal, 1 hiperakut (dk–saat), 2 akut ST yükselmesi (saat), 3 evrimleşen (saat–gün), 4 kronik (hafta–ay)
export const MI_EVRE = {
  st: [0, 0.06, 0.3, 0.12, 0],
  t: [0, 0.55, 0.15, -0.45, -0.08],
  q: [0, 0, 0.12, 0.5, 0.5],
};
function miEkle(b, p, g, q0, W) {
  const e = p.mi.evre;
  const n = Math.hypot(...p.mi.yon) || 1;
  const u = p.mi.yon.map((c) => c / n);
  const k = (a, s) => u.map((c) => c * s * a);
  if (MI_EVRE.st[e]) g(q0 + W + 80, 75, k(MI_EVRE.st[e], 1));
  if (MI_EVRE.t[e]) g(b.tc, b.tsig * 1.1, k(MI_EVRE.t[e], 1));
  if (MI_EVRE.q[e]) g(q0 + 0.12 * W, 0.08 * W, k(MI_EVRE.q[e], -1));
  if (p.mi.sagVent && MI_EVRE.st[e]) g(q0 + W + 80, 75, [-0.8 * 0.6 * MI_EVRE.st[e], 0.2 * 0.6 * MI_EVRE.st[e], 0.5 * 0.6 * MI_EVRE.st[e]]);
}

export class AtimAkisi {
  constructor(p, simdi = 0) {
    this.rnd = tohum(11);
    this.n = 0;
    this.kur(p, simdi);
  }
  kur(p, simdi) {
    this.p = { ...p };
    this.af = p.ritim === 'af';
    this.atimlar = [];
    this.n = 0;
    this.sonQ0 = simdi - 4500;
    this.uret(simdi);
  }
  // Parametre değişince: başlamış atımlar kalır, gelecek atımlar yeni değerlerle yeniden üretilir
  ayarla(p, simdi) {
    this.p = { ...p };
    this.atimlar = this.atimlar.filter((b) => b.t0 <= simdi);
    this.sonQ0 = this.atimlar.length ? this.atimlar[this.atimlar.length - 1].q0 : simdi - 4500;
    this.uret(simdi);
  }
  rr() {
    const base = 60000 / this.p.hr;
    this.n++;
    if (this.af) return Math.max(320, (base * (0.55 + 0.95 * this.rnd())) / 1.025);
    return base * (1 + 0.02 * Math.sin(this.n * 0.8));
  }
  uret(simdi) {
    while (this.sonQ0 < simdi + 4500) {
      this.sonQ0 += this.rr();
      this.atimlar.push(atimOlustur(this.p, this.sonQ0));
    }
    // Çok eski atımları at
    while (this.atimlar.length > 2 && this.atimlar[1].q0 < simdi - 9000) this.atimlar.shift();
  }
  // t anındaki atım: P'si başlamış son atım (yoksa ilki)
  atimBul(t) {
    let i = 0;
    for (let k = 0; k < this.atimlar.length; k++) if (this.atimlar[k].t0 <= t) i = k;
    return i;
  }
}

// Atriyal fibrilasyondaki f dalgaları (tek yönlü küçük salınım)
function fDalga(t) {
  const s = 0.04 * (Math.sin(t * 0.0383) + 0.7 * Math.sin(t * 0.0459 + 1) + 0.5 * Math.sin(t * 0.0327 + 2));
  return [0.3 * s, 0.7 * s, 0.4 * s];
}

export function vektor(akis, t) {
  let x = 0, y = 0, z = 0;
  for (const b of akis.atimlar) {
    if (t < b.t0 - 150 || t > b.q0 + b.qt + 300) continue;
    for (const k of b.kom) {
      const d = (t - k.c) / k.s;
      if (d > 4.5 || d < -4.5) continue;
      const w = Math.exp(-0.5 * d * d);
      x += k.v[0] * w; y += k.v[1] * w; z += k.v[2] * w;
    }
  }
  if (akis.af) { const f = fDalga(t); x += f[0]; y += f[1]; z += f[2]; }
  return [x, y, z];
}

export const nokta = (v, d) => (v[0] * d.yon[0] + v[1] * d.yon[1] + v[2] * d.yon[2]) * d.kaz;

// Atımın o anki evresi: ad, açıklama, aralık (mutlak ms)
export function faz(b, t) {
  const af = b.tip === 'af';
  const { t0, q0, pw, W, tc, tsig } = b;
  const tT0 = tc - 2.2 * tsig, tT1 = tc + 2.4 * tsig;
  if (!af && t < t0 + 15) return { id: 'sa', ad: 'Sinüs düğümü ateşlenir', a: t0, b: t0 + 15, metin: 'Kalbin doğal pacemaker\'ı, sağ atriyumun üst-yan duvarındaki sinüs düğümüdür. Dakikada 60–100 kez kendiliğinden uyarı çıkarır. Bu anın yüzeyde karşılığı yoktur.' };
  if (!af && t < t0 + pw) return { id: 'p', ad: 'P dalgası: atriyal depolarizasyon', a: t0 + 15, b: t0 + pw, metin: 'Uyarı sağ atriyumdan sola, internodal yollar ve Bachmann demetiyle yayılır. Vektör aşağı ve sola bakar: II\'de pozitif, aVR\'de negatiftir. Atriyumlar kasılmaya başlar.' };
  if (af && t < q0 - 60) return { id: 'fib', ad: 'Atriyumlar fibrile olur', a: t0, b: q0 - 60, metin: 'Atriyumlar düzenli kasılmaz, çok sayıda dönen uyarı dalgası titreşir. Ortak bir P vektörü oluşmadığı için P yok, yerinde ince f dalgaları görülür. AV düğüm bu bombardımanın bir bölümünü rastgele geçirir.' };
  if (!af && t < q0 - 35) return { id: 'pr', ad: 'PR segmenti: AV düğüm gecikmesi', a: t0 + pw, b: q0 - 35, metin: 'AV düğümde iletim bilerek yavaştır. Bu gecikme atriyumların ventrikülleri doldurmasına zaman verir. Çok küçük bir doku olduğu için EKG\'de izoelektrik düz çizgi kalır. Uzarsa 1. derece AV blok olur.' };
  if (t < q0) return { id: 'his', ad: 'His–Purkinje iletimi', a: q0 - 35, b: q0, metin: 'Uyarı His demetinden sağ ve sol dallara, oradan Purkinje liflerine hızla yayılır. Yüzey EKG\'de görünmez ama QRS\'in hemen öncesidir.' };
  if (t < q0 + 0.28 * W) return { id: 'q', ad: 'QRS: septum depolarizasyonu', a: q0, b: q0 + 0.28 * W, metin: 'İnterventriküler septum soldan sağa uyarılır. Vektör sağa ve öne bakar: V1\'de küçük r, I ve V6\'da küçük septal q oluşturur.' };
  if (t < q0 + 0.66 * W) return { id: 'r', ad: 'QRS: serbest duvarlar (R)', a: q0 + 0.28 * W, b: q0 + 0.66 * W, metin: 'Büyük sol ventrikül kası apeksten tabana ve endokarddan epikarda uyarılır. Baskın vektör sola ve aşağıya bakar: II, aVF, V5–V6\'da yüksek R, V1\'de derin S.' };
  if (t < q0 + W) return { id: 's', ad: 'QRS: bazal bölgeler (S)', a: q0 + 0.66 * W, b: q0 + W, metin: 'Son uyarılan bölgeler ventrikülün arka-üst tabanıdır. Vektör yukarı ve arkaya bakar; I ve V6\'da S dalgası oluşabilir.' };
  if (t < tT0) return { id: 'st', ad: 'ST segmenti', a: q0 + W, b: tT0, metin: 'Ventrikül kası tümüyle depolarizedir (plato fazı); hücreler arasında potansiyel farkı yoktur ve çizgi izoelektriktir. Akut iskemide bu segment yükselir veya çöker.' };
  if (t < tT1) return { id: 't', ad: 'T dalgası: ventriküler repolarizasyon', a: tT0, b: tT1, metin: 'Repolarizasyon epikarddan endokarda ilerler; yani depolarizasyonun ters yönünde. İki ters işaret çarpılınca T, QRS ile aynı yöne bakar (concordant).' };
  return { id: 'tp', ad: 'TP: diyastol', a: tT1, b: t0 + 1e9, metin: af ? 'Bir sonraki ventriküler uyarı rastgele zamanda gelir; bu yüzden RR aralıkları eşit değildir.' : 'Ventriküller gevşer ve kanla dolar. Bir sonraki sinüs uyarısına kadar çizgi düzdür.' };
}
