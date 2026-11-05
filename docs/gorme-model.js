// Görme yolları lif modeli. Three.js'e bağlı değildir (Node'da da çalışır: scripts/test_gorme.mjs).
// Her görme alanı noktası (göz, E, φ) için retinadan V1'e bir lif yolu üretilir; lezyon küreleri bu yolları keser,
// alan defekti de bir tablodan değil, kesilen liflerden hesaplanır. Bu yüzden serbest konulan lezyonda da sonuç tutarlıdır.
//
// Birimler mm, koordinat BodyParts3D (x = hastanın solu, y = arka, z = yukarı). Alan: x+ = hastanın sağı, y+ = yukarı, derece.
// Harita kaynakları: Horton ve Hoyt 1991 (V1: M = 17,3 / (E + 0,75) mm/°), Hoyt ve Luis 1962 (traktus/LGN yerleşimi),
// Frisén 1978-79 (LGN sektörleri), Horton 1997 (Wilbrand dizi tartışması). Radyasyon rotaları şematiktir.

export const HALKA = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
export const ACI_N = 72;
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// Evreler: lifin her örneği hangi durakta. Pupilla lifleri traktusun sonunda ayrılır (evre < 4 pupillayı etkiler).
export const EVRE = ['retina', 'sinir', 'kiazma', 'traktus', 'lgn', 'radyasyon', 'v1'];
export const EVRE_AD = { retina: 'Retina ve disk', sinir: 'Optik sinir', kiazma: 'Kiazma', traktus: 'Optik traktus', lgn: 'LGN', radyasyon: 'Optik radyasyon', v1: 'Görme korteksi (V1)' };

// V1 üzerindeki konum (kortikal büyütme: E logaritmik yayılır). Üst alan alt yarığa (lingual), alt alan üst yarığa (kuneus).
const LOGN = Math.log(1 + 90 / 0.75);
export const v1d = (E) => Math.log(1 + E / 0.75) / LOGN;
const KUTUP = [5, 6, 1549], ON_UC = [5, -34, 1558];
export function v1Nokta(h, E, phi) {
  const d = v1d(E);
  const s = Math.sin(phi), c = Math.abs(Math.cos(phi));
  const gen = 4 + 9 * Math.sin(Math.PI * Math.min(1, d * 1.05 + 0.08));
  const t = lerp3(KUTUP, ON_UC, d);
  return [h * (t[0] - 2 + 8 * c), t[1], t[2] - gen * s];
}

// Radyasyon ara noktaları (hastanın solu için; x, h ile aynalanır): Meyer halkası · merkez · paryetal demet
const RAD = {
  M: [[28, -92, 1534], [36, -101, 1530], [39, -84, 1532], [37, -52, 1541], [29, -16, 1547]],
  C: [[27, -70, 1544], [30, -62, 1547], [33, -50, 1550], [33, -30, 1552], [25, -10, 1553]],
  P: [[26, -72, 1552], [30, -66, 1560], [33, -50, 1567], [32, -28, 1565], [23, -8, 1560]],
};

// Catmull-Rom ile ara noktalar arasını örnekle
function ornekle(ara, evreler, altBol = 3) {
  const P = [], E = [];
  const n = ara.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ara[Math.max(0, i - 1)], p1 = ara[i], p2 = ara[i + 1], p3 = ara[Math.min(n - 1, i + 2)];
    for (let k = 0; k < altBol; k++) {
      const t = k / altBol, t2 = t * t, t3 = t2 * t;
      for (let a = 0; a < 3; a++) {
        P.push(0.5 * (2 * p1[a] + (p2[a] - p0[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t3));
      }
      E.push(evreler[i]);
    }
  }
  P.push(...ara[n - 1]); E.push(evreler[n - 1]);
  return { P: new Float32Array(P), E: new Uint8Array(E) };
}

export function modelKur(meta) {
  const T = { 1: meta.taraf.sol, '-1': meta.taraf.sag };

  // Tek lifin ara noktaları. e: göz (+1 sol, -1 sağ); E derece; phi radyan (alan açısı)
  function ara(e, E, phi) {
    const x = E * Math.cos(phi), y = E * Math.sin(phi);
    const h = x >= 0 ? 1 : -1;            // hedef yarıküre: sağ alan → sol yarıküre
    const capraz = h !== e;               // temporal alan = nazal retina = çaprazlaşır
    const rho = Math.sqrt(E / 90);
    const c = Math.cos(phi), s = Math.sin(phi);
    const g = T[e];
    const R = g.gozR + 1.2;
    const P = [], V = [];
    const ekle = (p, ev) => { P.push(p); V.push(ev); };

    // Retina: alan noktası ters ve aynalı düşer
    const a = E * Math.PI / 180;
    const ret = norm([Math.sin(a) * c, Math.cos(a), -Math.sin(a) * s]);
    const disk = norm([g.sinir[2][0] - g.goz[0], g.sinir[2][1] - g.goz[1], g.sinir[2][2] - g.goz[2]]);
    for (let i = 0; i <= 3; i++) { // retina yüzeyinde diske doğru yay
      const d = norm(lerp3(ret, disk, i / 3));
      ekle([g.goz[0] + R * d[0], g.goz[1] + R * d[1], g.goz[2] + R * d[2]], 0);
    }
    // Optik sinir: temporal retina lateralde, üst retina üstte (ox, x ile; oz, -y ile orantılı)
    const Rn = 1.8;
    for (let i = 2; i <= 6; i++) {
      const m = g.sinir[i], u = sm(2, 6, i);
      const ox = Rn * rho * c * (1 - 0.25 * u), oz = -Rn * rho * s * (1 - 0.25 * u);
      ekle([m[0] + ox, m[1], m[2] + oz], 1);
    }
    // Kiazma
    if (capraz) {
      // Alt-nazal lifler (üst temporal alan) önde ve aşağıda, makula arkada çaprazlaşır
      const zamp = 2.8 * (0.35 + 0.65 * rho);
      const ym = -105.3 + 2.8 * (1 - 2 * rho) - 1.2 * s;
      const zm = 1540 - zamp * s;
      ekle([e * 2.6, lerp(-110, ym, 0.5), lerp(1536.5, zm, 0.6)], 2);
      ekle([0, ym, zm], 2);
      // Wilbrand dizi: alt-nazal periferik lifler karşı sinire kısa bir kavis yapar (tartışmalı; bkz. arayüz notu)
      if (s > 0.25 && rho > 0.45) {
        ekle([h * 3.4, ym - 3.5, zm - 1.5], 2);
        ekle([h * 4.3, -112.4, 1535.6], 2);
        ekle([h * 4.6, -108, 1538], 2);
      }
      ekle([h * 4.9, lerp(ym, -102, 0.7), zm + 0.3], 2);
    } else {
      ekle([e * 7.2, -105.6, 1539.2 - 0.9 * s], 2);
      ekle([e * 7.8, -102.2, 1540.4 - 0.8 * s], 2);
    }
    // Optik traktus: üst alan lateralde, makula dorsalde; çapraz ve düz lifler henüz tam kaynaşmamıştır (inkonjüge)
    const Rt = 2.5;
    const kay = capraz ? 0.42 : -0.42;   // yaklaşık 24° göz farkı
    for (let i = 1; i <= 4; i++) {
      const m = T[h].traktus[i];
      const u = (i - 1) / 3;
      const f = lerp(1, 0.25, u);
      const s2 = Math.sin(Math.asin(s) + kay * f);
      const ox = h * Rt * s2 * (0.45 + 0.55 * rho) + h * (capraz ? 0.5 : -0.5) * f;
      const oz = Rt * 0.65 * (1 - 2 * rho) + (capraz ? -0.35 : 0.35) * f;
      ekle([m[0] + ox, m[1], m[2] + oz], 3);
    }
    // LGN: üst alan lateral, alt alan medial; makula arkada, periferi önde; gözler ayrı katmanlarda
    const L = T[h].lgn;
    const dE = v1d(E);
    const lgnX = h * 3.4 * s, lgnY = 4.5 - 9 * dE, lgnZ = capraz ? 0.5 : -0.5;
    ekle([L[0] + lgnX, L[1] + lgnY, L[2] + lgnZ], 4);
    ekle([L[0] + lgnX * 0.9, L[1] + 1.5 + lgnY * 0.5, L[2] + lgnZ * 0.5], 4);
    // Radyasyon: üst alan Meyer halkasından, alt alan paryetalden; makula merkezde
    const us = Math.abs(s);
    const per = sm(0.08, 0.5, rho);
    const agr = Math.pow(us, 0.75) * per;
    const dal = s >= 0 ? RAD.M : RAD.P;
    for (let i = 0; i < 5; i++) {
      const q = lerp3(RAD.C[i], dal[i], agr);
      ekle([h * q[0], q[1], q[2]], 5);
    }
    ekle(v1Nokta(h, E, phi), 6);
    return { P, V };
  }

  function lifYolu(e, E, phi, altBol = 3) {
    const { P, V } = ara(e, E, phi);
    return ornekle(P, V, altBol);
  }

  // Tüm ızgara lifleri: 2 göz × halka × açı
  const yollar = [];
  for (const e of [1, -1]) {
    for (const E of HALKA) {
      for (let j = 0; j < ACI_N; j++) yollar.push(lifYolu(e, E, (j + 0.5) / ACI_N * 2 * Math.PI));
    }
  }
  const lifN = HALKA.length * ACI_N;
  const lif = (g, i, j) => yollar[g * lifN + i * ACI_N + j];
  const YUM = 0.7; // lezyon kenarında yumuşak geçiş (mm)

  // Küre listesinin kestiği lifler. Dönüş: göz başına hasar [0..1], pupilla yolundaki hasar, ilk kesi evresi ve örneği
  function kes(kureler) {
    const n = lifN * 2;
    const D = new Float32Array(n), Dp = new Float32Array(n), kesi = new Int16Array(n).fill(-1);
    for (let f = 0; f < n; f++) {
      const { P, E } = yollar[f];
      let d = 0, dp = 0, ilk = -1;
      for (const [cx, cy, cz, r] of kureler) {
        const rd = r + YUM, rd2 = rd * rd;
        for (let k = 0, m = P.length / 3; k < m; k++) {
          const dx = P[3 * k] - cx, dy = P[3 * k + 1] - cy, dz = P[3 * k + 2] - cz;
          const q = dx * dx + dy * dy + dz * dz;
          if (q > rd2) continue;
          const v = 1 - sm(r - YUM, rd, Math.sqrt(q));
          if (v > d) d = v;
          if (E[k] < 4 && v > dp) dp = v;
          if (v > 0.5 && (ilk < 0 || k < ilk)) ilk = k;
        }
      }
      D[f] = d; Dp[f] = dp; kesi[f] = ilk;
    }
    return { D, Dp, kesi };
  }

  // Retinal/disk lezyonu: alan fonksiyonu olarak tanımlanır (lif yolu yerine doğrudan alan)
  function alanHasari(fn) {
    const D = new Float32Array(lifN * 2);
    let f = 0;
    for (const e of [1, -1]) {
      for (const E of HALKA) {
        for (let j = 0; j < ACI_N; j++) {
          const p = (j + 0.5) / ACI_N * 2 * Math.PI;
          D[f++] = Math.min(1, Math.max(0, fn(e, E * Math.cos(p), E * Math.sin(p), E)));
        }
      }
    }
    return D;
  }

  // Lezyon ({kureler, alan}) → sonuç
  function hesapla(lz) {
    const n = lifN * 2;
    const k = lz.kureler?.length ? kes(lz.kureler) : { D: new Float32Array(n), Dp: new Float32Array(n), kesi: new Int16Array(n).fill(-1) };
    if (lz.alan) {
      const a = alanHasari(lz.alan);
      for (let f = 0; f < n; f++) {
        if (a[f] > k.D[f]) k.D[f] = a[f];
        if (a[f] > k.Dp[f]) k.Dp[f] = a[f];
        if (a[f] > 0.5) k.kesi[f] = 0;
      }
    }
    return k;
  }

  // Bir alan noktasındaki hasar (polar ızgarada çift doğrusal)
  function hasarOku(D, g, x, y) {
    const E = Math.hypot(x, y);
    let i = 0;
    if (E >= HALKA[HALKA.length - 1]) i = HALKA.length - 2;
    else if (E > HALKA[0]) while (HALKA[i + 1] < E) i++;
    const tE = E <= HALKA[0] ? 0 : Math.min(1, (E - HALKA[i]) / (HALKA[i + 1] - HALKA[i]));
    let a = Math.atan2(y, x); if (a < 0) a += 2 * Math.PI;
    const ja = a / (2 * Math.PI) * ACI_N - 0.5;
    const j0 = Math.floor(ja), tA = ja - j0;
    const J0 = (j0 + ACI_N) % ACI_N, J1 = (j0 + 1 + ACI_N) % ACI_N;
    const o = g * lifN;
    const i1 = Math.min(i + 1, HALKA.length - 1);
    const v = (ii, jj) => D[o + ii * ACI_N + jj];
    return lerp(lerp(v(i, J0), v(i, J1), tA), lerp(v(i1, J0), v(i1, J1), tA), tE);
  }

  return { ara, lifYolu, lif, lifN, kes, hesapla, hasarOku, T };
}

// Bir gözün görme alanı sınırı (derece). n: nazal pozitif, y: üst pozitif
export function alanSiniri(e, x, y) {
  const n = x * e;
  const E = Math.hypot(x, y);
  if (E < 1e-6) return 90;
  const a = n > 0 ? 60 : 92, b = y > 0 ? 58 : 72;
  return 1 / Math.hypot((n / E) / a, (y / E) / b);
}
// Fizyolojik kör nokta: fiksasyonun ~15° temporalinde, hafif aşağıda
export function korNokta(e, x, y, kat = 1) {
  const n = x * e;
  return Math.hypot((n + 15) / (2.8 * kat), (y + 1.5) / (3.8 * kat));
}

// Pupilla yoluna giden afferent sürüş (0..1): merkez ağırlıklı, yalnızca traktusa kadar olan hasar sayılır
export function pupillaSurus(model, Dp) {
  const top = [0, 0], agr = [0, 0];
  for (let g = 0; g < 2; g++) {
    const e = g ? -1 : 1;
    for (let i = 0; i < HALKA.length; i++) {
      const E = HALKA[i];
      const dE = (HALKA[Math.min(i + 1, HALKA.length - 1)] - HALKA[Math.max(i - 1, 0)]) / 2;
      const w = dE * E / (E + 3);
      for (let j = 0; j < ACI_N; j++) {
        const p = (j + 0.5) / ACI_N * 2 * Math.PI;
        const x = E * Math.cos(p), y = E * Math.sin(p);
        if (E > alanSiniri(e, x, y)) continue;
        agr[g] += w;
        top[g] += w * (1 - Dp[g * model.lifN + i * ACI_N + j]);
      }
    }
  }
  return [top[0] / agr[0], top[1] / agr[1]];
}

// --- Patoloji kataloğu ------------------------------------------------------------
// h: lezyon tarafı (+1 sol, -1 sağ). kureler(h, k): [x, y, z, r] listesi; k boyut kaydırıcısıdır (1 = tipik).
// {L} lezyon tarafı, {K} karşı taraf olarak metne yerleşir. Alan fonksiyonları: (e, x, y, E) → hasar.
const hat = (h, a, b, n, r) => Array.from({ length: n }, (_, i) => {
  const t = n > 1 ? i / (n - 1) : 0;
  return [h * lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), r];
});
const nz = (e, x) => x * e; // nazal pozitif
const lezGoz = (h, e) => h === e;

export const PATOLOJI = [
  { id: 'normal', evre: 'normal', ad: 'Normal', alan_ad: 'Normal görme alanı',
    alan: () => 0,
    ozet: 'Her göz yaklaşık 60° nazal, 90° temporal görür. İki alan ortada binoküler olarak üst üste biner; yalnız en dıştaki temporal hilal tek gözlüdür. Kör nokta diğer gözün alanı içinde kaldığı için fark edilmez.',
    neden: [], eslik: 'Pupilla refleksleri simetrik, RAPD yok.', goruntu: '' },

  // Retina ve disk
  { id: 'amd', evre: 'retina', ad: 'Makula dejenerasyonu', tek: true, alan_ad: '{L} gözde santral skotom',
    alan: (h) => (e, x, y, E) => lezGoz(h, e) ? 1 - sm(7, 11, E) : 0,
    ozet: 'Fovea bozulur, periferik retina sağlamdır. Hasta çizgilerin eğri göründüğünü (metamorfopsi) ve okuma güçlüğünü anlatır. Amsler ızgarasıyla izlenir.',
    neden: ['Yaşa bağlı makula dejenerasyonu', 'Santral seröz koryoretinopati', 'Makula deliği'],
    eslik: 'RAPD genellikle yoktur veya çok hafiftir: pupilla sürüşünde periferik retina da yer alır.', goruntu: 'OCT, fundus otofloresans; yaş tipte FA/OCT-A.' },
  { id: 'crao', evre: 'retina', ad: 'Santral retinal arter tıkanıklığı', tek: true, alan_ad: '{L} gözde ani total kayıp',
    alan: (h) => (e) => (lezGoz(h, e) ? 1 : 0),
    ozet: 'Retinanın iç katları kanlanamaz. Ani, ağrısız, tek gözlü kayıp; fundusta soluk retina ve vişne kırmızısı makula. Göz inmesidir: dakikalar önemlidir.',
    neden: ['Karotis/kardiyak emboli', 'Dev hücreli arterit (yaşlı, başağrısı, yüksek CRP/ESH)'],
    eslik: 'Belirgin RAPD. Silioretinal arter varsa merkez korunabilir.', goruntu: 'Acil inme değerlendirmesi: BT/BTA veya MR/MRA, karotis Doppler, EKG/ekokardiyografi.' },
  { id: 'brao', evre: 'retina', ad: 'Üst dal retinal arter tıkanıklığı', tek: true, alan_ad: '{L} gözde alt altitudinal defekt',
    alan: (h) => (e, x, y) => (lezGoz(h, e) ? 1 - sm(-3, 1, y) : 0),
    ozet: 'Üst retinayı besleyen dal tıkanır; üst retina alt alanı gördüğü için defekt aşağıdadır. Görüntü retinaya ters düşer, bu yüzden yönler yer değiştirir.',
    neden: ['Kolesterol (Hollenhorst) veya kalsifik emboli', 'Susac sendromu (genç hasta)'],
    eslik: 'Hafif-orta RAPD. Fundusta embolus görülebilir.', goruntu: 'OCT, FA; emboli kaynağı taraması.' },
  { id: 'rd', evre: 'retina', ad: 'Retina dekolmanı', tek: true, alan_ad: '{L} gözde ilerleyen perde',
    alan: (h) => (e, x, y) => { if (!lezGoz(h, e)) return 0; const t = (-nz(e, x) * 0.7 + y * 0.7); return sm(14, 22, t); },
    ozet: 'Retina altına sıvı girer ve o bölge işlevini yitirir. Bu örnekte alt-nazal retina ayrılmıştır, bu yüzden perde üst temporal alandan iner. Uçuşan cisim ve ışık çakmaları habercidir.',
    neden: ['Regmatojen yırtık (miyopi, katarakt cerrahisi, travma)', 'Traksiyonel (diyabet)'],
    eslik: 'Makula tutulana dek santral görme korunur; makula tutulumu acildir.', goruntu: 'Dilate fundus, gerekirse oküler USG.' },
  { id: 'rp', evre: 'retina', ad: 'Retinitis pigmentosa', alan_ad: 'İki gözde tünel görme',
    alan: () => (e, x, y, E) => sm(13, 22, E),
    ozet: 'Çomaklar periferden başlayarak kaybolur; önce gece körlüğü, sonra halka skotom ve tünel görme. Merkez uzun süre korunur.',
    neden: ['Kalıtsal retinal distrofi', 'Benzer tünel: ileri glokom, vitamin A eksikliği, fonksiyonel'],
    eslik: 'Mumsu disk, kemik spikülü pigmentasyon, ince damarlar.', goruntu: 'ERG, otofloresans, genetik test.' },
  { id: 'glokom', evre: 'retina', ad: 'Glokom', tek: true, alan_ad: '{L} gözde arkuat skotom ve nazal basamak',
    alan: (h) => (e, x, y, E) => {
      if (!lezGoz(h, e)) return 0;
      if (y >= 0) return 0;                                        // alt sinir lifi demeti korunmuş varsayılır: yatay meridyene saygı
      const n = nz(e, x);
      const yay = 1 - sm(4, 8, Math.abs(Math.hypot(n + 15, y + 1.5) - 16));
      const basamak = n > 10 && y > -9 ? sm(18, 30, n) : 0;
      return Math.max(yay * (E > 7 ? 1 : 0), basamak);
    },
    ozet: 'Aksonlar disk kutuplarından kaybedilir. Sinir lifleri kör noktadan yay çizerek fiksasyonun etrafından dolaşıp yatay rafede biter; defekt bu yayı izler ve nazalde yatay meridyende basamak yapar. Merkez son tutulur, hasta uzun süre fark etmez.',
    neden: ['Primer açık açılı glokom', 'Açı kapanması', 'Normotansif glokom'],
    eslik: 'Disk çukurlaşması, RNFL incelmesi; asimetrikse RAPD.', goruntu: 'OCT RNFL, Humphrey 24-2, gonyoskopi. Diske uymayan solukluk veya meridyen sınırı varsa MR.' },
  { id: 'papilodem', evre: 'retina', ad: 'Papilödem', alan_ad: 'İki gözde büyümüş kör nokta',
    alan: () => (e, x, y) => 1 - sm(0.95, 1.15, korNokta(e, x, y, 3)),
    ozet: 'Kafa içi basıncı artınca disk şişer. Görme keskinliği uzun süre normaldir; erken bulgu büyümüş kör noktadır, geçici görme kararmaları eşlik eder. Kronikleşirse periferden daralma başlar.',
    neden: ['İdiyopatik intrakraniyal hipertansiyon', 'Kitle', 'Venöz sinüs trombozu'],
    eslik: 'Başağrısı, pulsatil tinnitus, VI. sinir felci olabilir. Erken dönemde RAPD beklenmez.', goruntu: 'Acil MR + MR venografi, sonra LP (açılış basıncı).' },

  // Optik sinir
  { id: 'norit', evre: 'sinir', ad: 'Optik nörit', tek: true, alan_ad: '{L} gözde santral skotom',
    alan: (h) => (e, x, y, E) => lezGoz(h, e) ? 1 - sm(10, 16, E) : 0,
    ozet: 'Papillomaküler demet tutulur. Genç erişkinde günler içinde kayıp, göz hareketiyle ağrı ve soluk renk (kırmızı desatürasyonu). Haftalar içinde çoğunlukla düzelir.',
    neden: ['Demiyelinizan (MS)', 'NMOSD, MOGAD', 'Sarkoidoz, enfeksiyon'],
    eslik: 'RAPD, renk görmede azalma; disk çoğu kez normaldir (retrobulber).', goruntu: 'Orbita ve beyin kontrastlı MR; AQP4 ve MOG antikoru.' },
  { id: 'naion', evre: 'sinir', ad: 'İskemik optik nöropati (NAION)', tek: true, alan_ad: '{L} gözde alt altitudinal defekt',
    alan: (h) => (e, x, y) => (lezGoz(h, e) ? 1 - sm(-4, 0, y) : 0),
    ozet: 'Diskin üst yarısı iskemiye girer; uyanınca fark edilen ağrısız kayıp. Küçük ve çukurluksuz disk risk faktörüdür. Yatay meridyene saygılı defekt retina/diski işaret eder, dikey meridyene saygı kiazmayı ve arkasını.',
    neden: ['NAION: HT, DM, uyku apnesi, küçük disk', 'AAION: dev hücreli arterit (acil steroid)'],
    eslik: 'RAPD, segmental disk ödemi.', goruntu: 'Klinik tanı; ESH, CRP ve trombosit (GCA için), MR atipikse.' },
  { id: 'toksik', evre: 'sinir', ad: 'Toksik veya beslenme optik nöropatisi', alan_ad: 'İki gözde sekosantral skotom',
    alan: () => (e, x, y) => {
      const n = nz(e, x);
      return 1 - sm(0.8, 1.2, Math.hypot((n + 8) / 13, (y + 0.5) / 8));
    },
    ozet: 'Papillomaküler demet iki gözde simetrik etkilenir; skotom fiksasyondan kör noktaya uzanır. Yavaş ve ağrısız kayıp, renk görmede erken bozulma.',
    neden: ['B12 ve folat eksikliği', 'Etambutol, metanol, tütün-alkol', 'Leber herediter optik nöropati (genç erkek, ardışık tutulum)'],
    eslik: 'Simetrik olduğundan RAPD beklenmez.', goruntu: 'B12, folat, ilaç öyküsü; mtDNA (LHON), MR kitle dışlamak için.' },
  { id: 'kesi', evre: 'sinir', ad: 'Optik sinir tam hasarı', tek: true, alan_ad: '{L} gözde total görme kaybı',
    kureler: (h, k) => { const m = h > 0 ? [14.8, -123.8, 1527.7] : [-16.3, -123.7, 1527.8]; return [[m[0], m[1], m[2], 5.5 * k]]; },
    ozet: 'Kiazmadan önce yalnız o gözün lifleri geçer; hasar tek gözlüdür ve diğer gözün alanı tamamen normaldir. Bu yüzden tek gözlü defekt kiazma öncesini gösterir.',
    neden: ['Travma, kanal kırığı', 'Optik sinir kılıfı meningiomu', 'Optik gliom (NF1)'],
    eslik: 'Belirgin RAPD. Etkilenen göze ışık tutulunca iki pupilla da daralmaz; karşı göze tutulunca ikisi de daralır.', goruntu: 'Kontrastlı orbita MR; travmada kanal için ince kesit BT.' },

  // Kiazma
  { id: 'junction', evre: 'kiazma', ad: 'Junctional skotom', tek: true, alan_ad: '{L} gözde santral/total defekt ve {K} gözde üst temporal defekt',
    kureler: (h, k) => [[h * 4.6, -113, 1535.2, 4.2 * k]],
    ozet: 'Lezyon sinirin kiazmaya girdiği köşededir: aynı taraf sinir ile karşı gözden gelen alt-nazal lifler birlikte etkilenir. Tek gözde kayıp varken diğer gözün üst temporal kadranını mutlaka bakın. Klasik açıklama Wilbrand dizidir; Horton 1997 bunun enükleasyon artefaktı olabileceğini gösterdi, tartışma sürüyor. Bulgunun lokalizasyon değeri ise geçerlidir.',
    neden: ['Tüberkülum sella meningiomu', 'Hipofiz adenomu', 'Anevrizma'],
    eslik: 'Aynı gözde RAPD, renk görmede bozulma.', goruntu: 'Sellar kontrastlı MR.' },
  { id: 'adenom', evre: 'kiazma', ad: 'Hipofiz adenomu', alan_ad: 'Bitemporal hemianopi, üst kadranlar önce',
    kureler: (h, k) => [[0, -104.5, 1532, 7.8 * k]],
    ozet: 'Çaprazlaşan nazal lifler orta hatta sıkışır; temporal alanlar kaybolur. Tümör alttan büyüdüğü için önce alt-nazal lifler, yani üst temporal kadranlar tutulur. Boyut kaydırıcısıyla büyümesini izleyin.',
    neden: ['Hipofiz makroadenomu', 'Rathke kisti', 'Apopleksi (ani başağrısı + kayıp)'],
    eslik: 'Hormonal bulgular (akromegali, prolaktin, Cushing). Simetrikse RAPD yok. Hemifield slide: derinlik algısı bozulabilir.', goruntu: 'Sellar kontrastlı MR, hipofiz hormon paneli.' },
  { id: 'kranio', evre: 'kiazma', ad: 'Kraniyofarenjiyom', alan_ad: 'Bitemporal hemianopi, alt kadranlar önce',
    kureler: (h, k) => [[0, -103.5, 1547.4, 7 * k]],
    ozet: 'Üstten basan kitle önce üst-nazal lifleri, yani alt temporal kadranları tutar. Defektin başladığı kadran kitlenin geldiği yönü söyler.',
    neden: ['Kraniyofarenjiyom', 'Üçüncü ventrikül kitlesi', 'Suprasellar meningiom'],
    eslik: 'Çocukta büyüme geriliği, diabetes insipidus, hidrosefali.', goruntu: 'MR ve kalsifikasyon için BT.' },
  { id: 'arka', evre: 'kiazma', ad: 'Arka kiazma lezyonu', alan_ad: 'Bitemporal santral (hemianopik) skotom',
    kureler: (h, k) => [[0, -102.2, 1540, 2.6 * k]],
    ozet: 'Makula lifleri kiazmanın arkasında çaprazlaşır. Arkadan gelen bası bitemporal fakat santral bir defekt yapar; periferik alan normal olabilir, gözden kaçabilir.',
    neden: ['Üçüncü ventrikül genişlemesi', 'Prefikse kiazma üzerinde adenom', 'Hipotalamik kitle'],
    eslik: 'Okumada satır kaybı, keskinlikte azalma.', goruntu: 'Sellar MR.' },
  { id: 'binazal', evre: 'kiazma', ad: 'Binazal defekt', alan_ad: 'Binazal hemianopi',
    kureler: (h, k) => [[9.8, -104.4, 1539.6, 3 * k], [-9.8, -104.4, 1539.6, 3 * k]],
    ozet: 'Çaprazlaşmayan temporal lifler kiazmanın iki yanındadır. Her iki yandan bası nazal alanları alır. Nadirdir ve gerçek kiazma lezyonundan çok, bilateral retina/disk hastalığı (glokom, optik disk druseni) ile karışır.',
    neden: ['Karotis sklerozu/dolikoektazi', 'Bilateral glokom veya disk druseni (taklitçi)'],
    eslik: 'Defekt dikey meridyene tam saygı göstermiyorsa disk kaynaklıdır.', goruntu: 'MR/MRA, disk OCT.' },

  // Traktus
  { id: 'traktus', evre: 'traktus', ad: 'Optik traktus lezyonu', tek: true, alan_ad: '{K} homonim hemianopi, inkonjüge',
    kureler: (h, k) => [[h * 21.6, -91.5, 1540.2, 3.1 * k]],
    ozet: 'Bir traktusta aynı yarıküreye giden iki gözün lifleri vardır; bu yüzden karşı taraf homonimdir. Karşılık gelen lifler henüz yan yana dizilmediği için iki gözün defekti birbirine benzemez (inkonjüge). Pupilla lifleri de buradan geçtiği için, kiazma sonrası görme alanı defekti yapan lezyonlar arasında RAPD veren tek yer budur.',
    neden: ['Kraniyofarenjiyom, tümör', 'MS plağı', 'Anevrizma, anterior koroidal arter infarktı'],
    eslik: 'Karşı gözde (temporal alanı kaybeden gözde) hafif RAPD; aylar içinde papiller ve bant atrofisi.', goruntu: 'Kontrastlı beyin MR, ince kesit sellar/parasellar.' },

  // LGN
  { id: 'lgn_lat', evre: 'lgn', ad: 'LGN: lateral koroidal arter', tek: true, alan_ad: '{K} kama şeklinde sektöranopi',
    kureler: (h, k) => { const m = h > 0 ? [20.98, -75.94, 1540.3] : [-20.29, -74.9, 1540.16]; return hat(1, [m[0], m[1] - 5.5, m[2]], [m[0], m[1] + 5.5, m[2]], 6, 1.5 * k); },
    ozet: 'LGN\'nin hilusu yatay meridyeni taşır ve lateral koroidal arterden beslenir. İnfarkt, fiksasyona doğru sivrilen, yatay meridyen üzerinde oturan konjüge bir kama bırakır.',
    neden: ['Lateral koroidal arter (PCA dalı) infarktı', 'Kanama, tümör, demiyelinizasyon'],
    eslik: 'Talamik bulgular. Pupilla lifleri LGN\'ye girmeden ayrıldığından RAPD beklenmez.', goruntu: 'DWI\'li beyin MR. Radyasyon lezyonu aynı defekti taklit edebilir.' },
  { id: 'lgn_ant', evre: 'lgn', ad: 'LGN: anterior koroidal arter', tek: true, alan_ad: '{K} dörtlü sektöranopi (kum saati)',
    kureler: (h, k) => { const m = h > 0 ? [20.98, -75.94, 1540.3] : [-20.29, -74.9, 1540.16]; return [...hat(1, [m[0] + 3.7, m[1] - 5.5, m[2]], [m[0] + 3.7, m[1] + 5.5, m[2]], 6, 1.5 * k), ...hat(1, [m[0] - 3.7, m[1] - 5.5, m[2]], [m[0] - 3.7, m[1] + 5.5, m[2]], 6, 1.5 * k)]; },
    ozet: 'Anterior koroidal arter LGN\'nin iki ucunu besler. İnfarkt üst ve alt sektörleri alır, yatay meridyen çevresini korur: lateral koroidal kamanın tam tersi. Bu görüntü neredeyse LGN\'ye özgüdür.',
    neden: ['Anterior koroidal arter infarktı', 'Anterior temporal lobektomi sonrası'],
    eslik: 'Kontralateral hemiparezi ve hemisensoryal kayıp eşlik edebilir (kapsül arka bacak).', goruntu: 'DWI\'li beyin MR.' },

  // Radyasyon
  { id: 'meyer', evre: 'radyasyon', ad: 'Temporal lob: Meyer halkası', tek: true, alan_ad: '{K} üst kadranopi ("pie in the sky")',
    kureler: (h, k) => [[h * 37, -97, 1530.5, 8.5 * k]],
    ozet: 'Alt retinadan gelen lifler (üst alan) temporal boynuzun önünde kıvrılır. Temporal lob lezyonu üst kadranı alır; defekt fiksasyona yaklaştıkça incelir ve gözler arasında biraz fark gösterebilir.',
    neden: ['Temporal lobektomi (epilepsi cerrahisi)', 'Tümör, apse', 'HSV ensefaliti'],
    eslik: 'Nöbet, koku/tat halüsinasyonu, baskın yarıkürede afazi. RAPD yok.', goruntu: 'Beyin MR; epilepsi cerrahisinde traktografi.' },
  { id: 'parietal', evre: 'radyasyon', ad: 'Parietal lob: üst radyasyon', tek: true, alan_ad: '{K} alt kadranopi ("pie on the floor")',
    kureler: (h, k) => [[h * 33, -45, 1568, 8 * k]],
    ozet: 'Üst retinadan gelen lifler (alt alan) parietal derin beyaz cevherden doğrudan geçer. Defekt altta ve daha konjügedir. Eşlik eden ihmal hastanın defektten habersiz olmasına yol açabilir.',
    neden: ['MCA alt/üst dal infarktı', 'Tümör, kanama'],
    eslik: 'Optokinetik nistagmus asimetrisi, ihmal (sağ parietal) veya Gerstmann bulguları (sol parietal).', goruntu: 'Beyin MR veya BT.' },
  { id: 'genis', evre: 'radyasyon', ad: 'Geniş radyasyon lezyonu', tek: true, alan_ad: '{K} tam homonim hemianopi',
    kureler: (h, k) => [[h * 32.5, -37, 1553, 15 * k]],
    ozet: 'Temporal ve parietal demetler sagital stratumda birleşir. Burada geniş bir lezyon tam, konjüge hemianopi yapar. Makula korunması genellikle beklenmez: lezyon korteks öncesindedir.',
    neden: ['MCA infarktı', 'Putaminal/talamik kanama', 'Glial tümör'],
    eslik: 'Hemiparezi, hemihipoestezi. RAPD yok.', goruntu: 'Acil BT/BTA, MR.' },

  // Korteks
  { id: 'pca', evre: 'v1', ad: 'PCA infarktı: makula korunmuş', tek: true, alan_ad: '{K} homonim hemianopi, makula korunmuş',
    kureler: (h, k) => hat(h, [8, -18, 1553], [8, -28, 1556], 3, 12.5 * k),
    ozet: 'Kalkarin korteksin çoğu PCA\'dan beslenir, oksipital kutupta MCA katkısı vardır. Bu nedenle santral birkaç derece kurtulabilir ve iki gözde birebir aynıdır. Hasta çoğu kez sadece "çarpıyorum" der.',
    neden: ['PCA embolisi (AF, vertebrobaziler)', 'Oksipital kanama, AVM', 'Tümör'],
    eslik: 'Sol PCA + splenyum: agrafisiz aleksi (yazabilir ama okuyamaz). Pupillalar normal, OKN simetrik.', goruntu: 'BT/BTA, MR-DWI; kardiyak emboli taraması. Sürüş ehliyeti sorulmalı.' },
  { id: 'kuneus', evre: 'v1', ad: 'Üst kalkarin kıyı (kuneus)', tek: true, alan_ad: '{K} alt kadranopi, konjüge',
    kureler: (h, k) => [[h * 6, -22, 1567, 12.5 * k]],
    ozet: 'Kalkarin yarığın üst kıyısı alt alanı taşır. Sınırı yatay meridyene keskin biçimde uyar (radyasyondan farkı) ve iki gözde tamamen konjügedir.',
    neden: ['PCA kalkarin dalı infarktı', 'Travma', 'Metastaz'],
    eslik: 'Merdiven inmede zorlanma.', goruntu: 'Beyin MR.' },
  { id: 'lingual', evre: 'v1', ad: 'Alt kalkarin kıyı (lingual)', tek: true, alan_ad: '{K} üst kadranopi, konjüge',
    kureler: (h, k) => [[h * 6, -22, 1543, 11.5 * k]],
    ozet: 'Alt kıyı üst alanı taşır. Yakınındaki fusiform girus tutulursa renk (akromatopsi) ve yüz tanıma (prozopagnozi) bozulabilir.',
    neden: ['PCA alt dal infarktı', 'Tümör'],
    eslik: 'Akromatopsi, prozopagnozi, topografik yönelim kaybı.', goruntu: 'Beyin MR.' },
  { id: 'kutup', evre: 'v1', ad: 'Oksipital kutup', tek: true, alan_ad: '{K} homonim santral skotom',
    kureler: (h, k) => [[h * 5, -2, 1550, 13 * k]],
    ozet: 'Kortikal büyütme nedeniyle V1\'in yarısına yakını merkez 10°\'yi temsil eder. Küçük bir kutup lezyonu iki gözde aynı küçük parasantral skotom yapar, okumayı ciddi bozar ve perimetride 24-2 yerine 10-2 ister.',
    neden: ['Künt travma', 'Sınır bölge iskemisi (hipotansiyon)', 'Embolik küçük infarkt'],
    eslik: 'Keskinlik ancak çift taraflı tutulumda düşer.', goruntu: 'Beyin MR-DWI.' },
  { id: 'hilal', evre: 'v1', ad: 'Ön kalkarin: temporal hilal', tek: true, alan_ad: '{K} gözde yalnız temporal hilal kaybı',
    kureler: (h, k) => [[h * 7, -37, 1558, 7 * k]],
    ozet: 'Kalkarinin en ön kısmı 60° ötesini, karşıdaki gözün tek gözlü temporal hilalini taşır. Kiazma arkasında tek gözlü defekt yapabilen tek lezyondur. Standart 24-2 taraması bunu göremez.',
    neden: ['Küçük PCA dalı infarktı', 'Tümör, kavernom'],
    eslik: 'Çoğu kez belirsiz: "bir yanımdan çarpıyorum".', goruntu: 'Periferik perimetri (Goldmann, 60-4), MR.' },
  { id: 'bilateral', evre: 'v1', ad: 'Çift taraflı oksipital (kortikal körlük)', alan_ad: 'İki taraflı hemianopi, merkez kurtulabilir',
    kureler: (h, k) => [...hat(1, [8, -18, 1553], [8, -28, 1556], 3, 12.5 * k), ...hat(-1, [8, -18, 1553], [8, -28, 1556], 3, 12.5 * k)],
    ozet: 'İki PCA birlikte tıkanınca görme merkezi tek başına kapanır: keskinlik düşer fakat pupillalar ve fundus normaldir. Anton sendromunda hasta körlüğünü inkâr eder; bazen farkında olmadan hareket algılar (blindsight).',
    neden: ['Baziler tepe embolisi', 'Hipoksik iskemik hasar', 'PRES, kortikal venöz tromboz'],
    eslik: 'Pupillalar normal, OKN yok. Baziler tepe sendromu: uyku hali, göz hareket bozukluğu.', goruntu: 'Acil BT/BTA, MR-DWI.' },
];
