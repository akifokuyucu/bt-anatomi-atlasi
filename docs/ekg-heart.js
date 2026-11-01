// 3B kalp sahnesi (Three.js): BodyParts3D kalp modeli (heart.glb) üzerinde uyarı iletimi.
// Odaların köşe renkleri o anki atımın zamanına göre boyanır: depolarize bölge sarı yanar, repolarize olunca söner.
// Model: BodyParts3D, © The Database Center for Life Science, CC BY 4.0 (scripts/build_heart.py ile üretilir).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

const RENK = {
  atriyum: new THREE.Color('#c9786d'),
  ventrikul: new THREE.Color('#b0504a'),
  aktif: new THREE.Color('#ffb83d'),
  yol: new THREE.Color('#7a6428'),
  nabiz: new THREE.Color('#fff2a8'),
  blok: new THREE.Color('#d8343e'),
};

// İletim yolları: zaman penceresi (atıma göre ms); noktalar heart.json'dan gelir
const ZAMAN = {
  sa: (b) => [b.t0, b.t0 + 40],
  inter: (b) => [b.t0 + 10, b.t0 + b.pw], inter2: (b) => [b.t0 + 10, b.t0 + b.pw], inter3: (b) => [b.t0 + 10, b.t0 + b.pw],
  bach: (b) => [b.t0 + 12, b.t0 + b.pw * 0.95],
  av: (b) => [b.t0 + b.pw * 0.8, b.q0 - 38],
  his: (b) => [b.q0 - 38, b.q0 - 24],
  sag: (b) => [b.q0 - 26, b.q0 - 6],
  sol: (b) => [b.q0 - 26, b.q0 - 12],
  laf: (b) => [b.q0 - 14, b.q0 - 2], lpf: (b) => [b.q0 - 14, b.q0 - 2],
  pk1: (b) => [b.q0 - 6, b.q0 + b.W * 0.45], pk2: (b) => [b.q0 - 6, b.q0 + b.W * 0.45], pk3: (b) => [b.q0 - 6, b.q0 + b.W * 0.45],
};
const ETIKET_TUR = { 'Sinüs düğümü': 'iletim', 'AV düğüm': 'iletim', 'His demeti': 'iletim', 'Sağ dal': 'iletim', 'Sol dal': 'iletim', 'Purkinje ağı': 'iletim', 'Bachmann demeti': 'iletim' };

const GORUNUM = {
  on: [0.3, 0.2, 7.2], sol: [7.2, 0.2, 0.3], sag: [-7.2, 0.2, 0.3], alt: [0.3, -7.2, 0.6], arka: [0.3, 0.3, -7.2], oblik: [5.2, 0.4, 5.2],
};

export async function kalpSahnesi(kutu, etiketKutu) {
  const [gltf, meta] = await Promise.all([
    new GLTFLoader().loadAsync('data/heart/heart.glb'),
    fetch('data/heart/heart.json').then((r) => r.json()),
  ]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  kutu.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3B kalp modeli; sürükleyerek döndürün');
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  cam.position.set(...GORUNUM.on);
  scene.add(cam);
  const kont = new OrbitControls(cam, renderer.domElement);
  kont.target.set(0.25, 0.1, 0);
  kont.enableDamping = true;
  kont.enablePan = false;
  kont.minDistance = 3.4;
  kont.maxDistance = 12;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a4040, 1.0));
  const isik = new THREE.DirectionalLight(0xffffff, 1.6);
  isik.position.set(2, 3, 4);
  cam.add(isik);
  const kenar = new THREE.DirectionalLight(0xaec2ff, 0.55);
  kenar.position.set(-3, -1, -2);
  cam.add(kenar);

  const grup = new THREE.Group();
  scene.add(grup);

  // --- Parçalar ---------------------------------------------------------------
  const parca = {};
  gltf.scene.traverse((o) => { if (o.isMesh) parca[o.name || o.parent?.name] = o; });
  // GLTFLoader düğüm adını mesh'e taşır; yoksa üst düğüme bak
  for (const o of gltf.scene.children) if (o.isMesh) parca[o.name] = o;
  const gec = (ad, renk, ekstra = {}) => {
    const m = parca[ad];
    m.geometry.computeVertexNormals();
    m.material = new THREE.MeshPhysicalMaterial({ color: renk, roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4, transparent: true, ...ekstra });
    grup.add(m);
    return m;
  };
  gec('aorta', '#c9483f'); gec('pulm', '#5a80cc'); gec('pv', '#c9524a'); gec('svc', '#4a74c4'); gec('ivc', '#4a74c4');
  const koroner = Object.keys(meta.koroner);
  for (const k of koroner) gec('cor_' + k, '#e23a2e', { emissive: new THREE.Color('#000000') });
  gec('corV', '#33589f');
  for (const ad of ['lvc', 'rvc']) { parca[ad].visible = false; }
  const damarlar = ['aorta', 'pulm', 'pv', 'svc', 'ivc', 'corV', ...koroner.map((k) => 'cor_' + k)].map((a) => parca[a]);

  // --- Odalar -------------------------------------------------------------------
  const lvc = parca.lvc.geometry.attributes.position, rvc = parca.rvc.geometry.attributes.position;
  const apeks = V(...meta.apeks), sa = V(...meta.sa), laG = V(...meta.laGiris);
  const septumNk = [];
  for (let i = 0; i < meta.septum.length - 1; i++) {
    const a = V(...meta.septum[i]), b = V(...meta.septum[i + 1]);
    for (let k = 0; k < 8; k++) septumNk.push(a.clone().lerp(b, k / 8));
  }
  septumNk.push(V(...meta.septum[meta.septum.length - 1]));

  function oda(ad, tip, yan, renk) {
    const mesh = gec(ad, renk, { vertexColors: true });
    const geo = mesh.geometry, pos = geo.attributes.position, n = pos.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const nk = new Float32Array(n * 3);
    const apeksD = new Float32Array(n), septum = new Float32Array(n), yanal = new Float32Array(n), siraA = new Float32Array(n), faz = new Float32Array(n), taraf = new Uint8Array(n), doku = new Float32Array(n), gur = new Float32Array(n);
    const p = V(0, 0, 0), q = V(0, 0, 0);
    let maxD = 0;
    for (let i = 0; i < n; i++) { p.fromBufferAttribute(pos, i); maxD = Math.max(maxD, p.distanceTo(tip === 'A' ? (yan === 'R' ? sa : laG) : apeks)); }
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      if (tip === 'V') {
        apeksD[i] = Math.min(1, p.distanceTo(apeks) / maxD);
        let dm = 9;
        for (const s of septumNk) dm = Math.min(dm, p.distanceTo(s));
        septum[i] = Math.exp(-((dm / 0.3) ** 2));
        yanal[i] = Math.min(1, Math.max(0, (p.x - bb.min.x) / (bb.max.x - bb.min.x)));
        let dl = 9, dr = 9;
        for (let k = 0; k < lvc.count; k++) { q.fromBufferAttribute(lvc, k); dl = Math.min(dl, p.distanceToSquared(q)); }
        for (let k = 0; k < rvc.count; k++) { q.fromBufferAttribute(rvc, k); dr = Math.min(dr, p.distanceToSquared(q)); }
        taraf[i] = dl <= dr ? 1 : 0; // 1 = sol ventrikül
      } else {
        const d = p.distanceTo(yan === 'R' ? sa : laG) / maxD;
        siraA[i] = yan === 'R' ? Math.min(1, d) : 0.55 + 0.45 * Math.min(1, d);
      }
      nk[i * 3] = (p.x - (bb.min.x + bb.max.x) / 2) / ((bb.max.x - bb.min.x) / 2);
      nk[i * 3 + 1] = (p.y - (bb.min.y + bb.max.y) / 2) / ((bb.max.y - bb.min.y) / 2);
      nk[i * 3 + 2] = (p.z - (bb.min.z + bb.max.z) / 2) / ((bb.max.z - bb.min.z) / 2);
      faz[i] = Math.random() * 6.28;
      doku[i] = 0.9 + 0.2 * (0.5 + 0.5 * Math.sin(p.x * 23 + p.y * 17) * Math.cos(p.z * 19 + p.x * 11));
      // İnfarkt sınırını tırtıklı yapan sabit gürültü (0..1); evre ilerledikçe sınır bu gürültü boyunca yayılır
      gur[i] = 0.5 + 0.25 * Math.sin(p.x * 41 + p.y * 29) * Math.cos(p.z * 37 - p.x * 23) + 0.25 * Math.sin(p.y * 67 + p.z * 53 + p.x * 31);
    }
    const merkez = bb.getCenter(V(0, 0, 0));
    return { tip, yan, mesh, geo, n, nk, inf: null, apeksD, septum, yanal, siraA, faz, taraf, doku, gur, merkez, rest: renk === 'a' ? RENK.atriyum : (tip === 'A' ? RENK.atriyum : RENK.ventrikul) };
  }
  const odalar = [
    oda('ra', 'A', 'R', '#c9786d'),
    oda('la', 'A', 'L', '#c9786d'),
    oda('vent', 'V', 'V', '#b0504a'),
  ];

  // --- İletim sistemi -----------------------------------------------------------
  const iletim = new THREE.Group();
  iletim.visible = false;
  grup.add(iletim);
  const yollar = meta.yollar.map((y) => {
    const pts = y.n.map((n) => V(...n));
    const geo = y.dugum ? new THREE.SphereGeometry(y.r * 0.7, 18, 14) : new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, y.r * 0.55, 6, false);
    const sayi = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sayi * 3), 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    mesh.renderOrder = 10;
    if (y.dugum) mesh.position.copy(pts[0]);
    iletim.add(mesh);
    return { ...y, z: ZAMAN[y.id], geo, mesh, sayi, halka: y.dugum ? 0 : 29, radyal: y.dugum ? 0 : 7 };
  });

  // --- Kalp vektörü oku ---------------------------------------------------------
  const ok = new THREE.ArrowHelper(V(0, 1, 0), V(0.3, -0.2, 0), 1, 0x2fe0c8, 0.28, 0.16);
  ok.visible = false;
  ok.line.material.depthTest = false; ok.cone.material.depthTest = false;
  ok.line.renderOrder = 11; ok.cone.renderOrder = 11;
  scene.add(ok);

  // --- Etiketler ----------------------------------------------------------------
  const etiketler = Object.entries(meta.etiket).map(([ad, p]) => {
    const el = document.createElement('span');
    const t = ETIKET_TUR[ad] || 'yapi';
    el.className = 'kalp-etiket ' + t;
    el.textContent = ad;
    el.hidden = true;
    etiketKutu.appendChild(el);
    return { ad, p: V(...p), t, el };
  });
  let etiketAcik = true, iletimAcik = false, vektorAcik = false;

  // --- Koroner arter ipucu: fareyle üzerine gelince (dokunmada dokununca) adı ve bölgesi ---------
  const ipucu = document.createElement('div');
  ipucu.className = 'kalp-ipucu';
  ipucu.hidden = true;
  etiketKutu.appendChild(ipucu);
  const korNokta = koroner.map((k) => {
    const pos = parca['cor_' + k].geometry.attributes.position, adim = 3, dizi = [];
    for (let i = 0; i < pos.count; i += adim) dizi.push(V(0, 0, 0).fromBufferAttribute(pos, i));
    return { k, dizi };
  });
  const engeller = ['vent', 'ra', 'la', 'aorta', 'pulm', 'svc', 'ivc', 'pv'].map((a) => parca[a]);
  const isin = new THREE.Raycaster();
  let ipucuKor = null;
  function korVurgula(k) {
    if (ipucuKor === k) return;
    if (ipucuKor) parca['cor_' + ipucuKor].material.emissive.set('#000000');
    ipucuKor = k;
    if (k) parca['cor_' + k].material.emissive.set('#ff8a3d');
    renderer.domElement.style.cursor = k ? 'pointer' : '';
  }
  function korBul(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    const ex = cx - r.left, ey = cy - r.top;
    let en = 1e9, bul = null;
    for (const g of korNokta) for (const p of g.dizi) {
      tmpV.copy(p).applyMatrix4(grup.matrixWorld).project(cam);
      if (tmpV.z > 1) continue;
      const d = Math.hypot((tmpV.x + 1) / 2 * r.width - ex, (1 - tmpV.y) / 2 * r.height - ey);
      if (d < en) { en = d; bul = { k: g.k, p: p }; }
    }
    if (!bul || en > 14) return null;
    // Önünde heykelin kendisi varsa (arka yüzdeki damar) seçme
    tmpV.copy(bul.p).applyMatrix4(grup.matrixWorld);
    const yon = tmpV.clone().sub(cam.position), uz = yon.length();
    isin.set(cam.position, yon.normalize());
    const vur = isin.intersectObjects(engeller, false)[0];
    return vur && vur.distance < uz - 0.12 ? null : bul.k;
  }
  function korIpucuGoster(cx, cy) {
    const k = korBul(cx, cy);
    korVurgula(k);
    if (!k) { ipucu.hidden = true; return; }
    const m = meta.koroner[k], r = etiketKutu.getBoundingClientRect();
    ipucu.innerHTML = '<b></b><span></span>';
    ipucu.firstChild.textContent = m.ad;
    ipucu.lastChild.textContent = m.bolge;
    ipucu.hidden = false;
    const x = Math.min(Math.max(cx - r.left, 80), r.width - 80);
    ipucu.style.transform = `translate(-50%,0) translate(${x}px,${Math.max(8, cy - r.top - 58)}px)`;
  }
  const kd = renderer.domElement;
  let basla = null;
  kd.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && e.buttons === 0) korIpucuGoster(e.clientX, e.clientY); });
  kd.addEventListener('pointerleave', () => { korVurgula(null); ipucu.hidden = true; });
  kd.addEventListener('pointerdown', (e) => { basla = { x: e.clientX, y: e.clientY }; if (e.pointerType === 'mouse') ipucu.hidden = true; });
  kd.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse' && basla && Math.hypot(e.clientX - basla.x, e.clientY - basla.y) < 8) korIpucuGoster(e.clientX, e.clientY);
    basla = null;
  });

  function boyutla() {
    const w = kutu.clientWidth || 300, h = kutu.clientHeight || 300;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    cam.aspect = w / h;
    cam.fov = w / h < 0.9 ? 40 : 32;
    cam.updateProjectionMatrix();
  }
  new ResizeObserver(boyutla).observe(kutu);
  boyutla();

  // --- Büyüt: sahne ekranın ortasında büyük açılır (Esc veya tekrar basınca kapanır) ---------------
  const buyutDugme = document.createElement('button');
  buyutDugme.type = 'button';
  buyutDugme.className = 'sahne-buyut';
  const IKON_BUYUT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  const IKON_KUCUK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 10l7-7M3 21l7-7M14 10V4M14 10h6M10 14v6M10 14H4"/></svg>';
  const yerTutucu = document.createElement('div');
  let buyuk = false;
  function buyut(a) {
    if (a === buyuk) return;
    buyuk = a;
    if (a) {
      yerTutucu.style.height = kutu.offsetHeight + 'px';
      kutu.parentNode.insertBefore(yerTutucu, kutu);
    } else yerTutucu.remove();
    kutu.classList.toggle('buyuk', a);
    document.body.classList.toggle('sahne-acik', a);
    buyutDugme.innerHTML = a ? IKON_KUCUK : IKON_BUYUT;
    buyutDugme.setAttribute('aria-label', a ? 'Küçült' : 'Büyüt');
    buyutDugme.title = a ? 'Küçült (Esc)' : 'Büyüt';
    boyutla();
  }
  buyutDugme.innerHTML = IKON_BUYUT;
  buyutDugme.setAttribute('aria-label', 'Büyüt');
  buyutDugme.title = 'Büyüt';
  buyutDugme.addEventListener('click', () => buyut(!buyuk));
  buyutDugme.addEventListener('pointerdown', (e) => e.stopPropagation());
  kutu.appendChild(buyutDugme);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && buyuk) buyut(false); });

  let hedef = null;
  function gorunum(ad) {
    const g = GORUNUM[ad];
    if (g) hedef = V(...g);
  }

  // --- Kare güncelleme ----------------------------------------------------------
  const tmp = new THREE.Color();
  let infSiddet = 0, infHedef = 0, infT = performance.now();
  const azHareket = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const infRenk = new THREE.Color('#5a3a5c');
  const tmpV = new THREE.Vector3(), dir = new THREE.Vector3();

  function odaGuncelle(o, akis, t, bi) {
    const a = akis.atimlar[bi], ö = akis.atimlar[bi - 1];
    const col = o.geo.attributes.color, arr = col.array;
    const ldb = a.tip === 'ldb';
    const hesapla = (b, i) => {
      if (o.tip === 'A') {
        if (b.tip === 'af') return 0.4 * (0.5 + 0.5 * Math.sin(t * 0.022 + o.faz[i])) * (0.5 + 0.5 * Math.sin(t * 0.013 + o.faz[i] * 2.3));
        const ta = b.t0 + 12 + (b.pw - 12) * o.siraA[i];
        const tr = b.q0 + 40 + 50 * o.siraA[i];
        return sm((t - ta) / 14) * (1 - sm((t - tr) / 45));
      }
      const sol = o.taraf[i] === 1;
      let sira;
      if (ldb) sira = sol ? 0.35 + 0.65 * o.yanal[i] : 0.45 * o.apeksD[i];
      else sira = (1 - o.septum[i]) * o.apeksD[i] * 0.92 + o.septum[i] * 0.06;
      const ta = b.q0 + b.W * sira;
      const tr = b.tc - b.tsig * 1.7 + b.tsig * 3.4 * Math.min(1, Math.max(0, o.apeksD[i] * (ldb ? 0.7 : 1)));
      return sm((t - ta) / 12) * (1 - sm((t - tr) / 28));
    };
    for (let i = 0; i < o.n; i++) {
      let act = hesapla(a, i);
      if (ö) act = Math.max(act, hesapla(ö, i));
      // İnfarkt: bölge ağırlığı gürültüyle bozulur, eşik evre şiddetiyle düşer; sınır tırtıklı yayılır
      let iw = 0;
      if (o.inf && infSiddet > 0.002) {
        const f0 = o.inf[i];
        const alan = f0 + (o.gur[i] - 0.5) * 3.2 * f0 * (1 - f0);
        iw = sm((alan - (1 - infSiddet)) / 0.16 + 0.5) * Math.min(1, f0 * 4) * (0.55 + 0.45 * infSiddet);
      }
      act *= 1 - iw; // ölü doku depolarize olmaz
      tmp.copy(o.rest).multiplyScalar(o.doku[i]).lerp(RENK.aktif, act * 0.85);
      if (iw > 0) tmp.lerp(infRenk, Math.min(1, iw));
      arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
    }
    col.needsUpdate = true;

    // Kasılma: yumuşak zarf ile hafif küçülme (odanın merkezine doğru)
    const env = (b) => {
      if (o.tip === 'A') return b.tip === 'af' ? 0 : sm((t - (b.t0 + b.pw * 0.8)) / 50) * (1 - sm((t - (b.q0 + 20)) / 80));
      return sm((t - (b.q0 + b.W + 10)) / 70) * (1 - sm((t - (b.tc + b.tsig)) / 90));
    };
    const k = Math.max(env(a), ö ? env(ö) : 0);
    const s = 1 - (o.tip === 'A' ? 0.06 : 0.08) * k;
    o.mesh.scale.setScalar(s);
    o.mesh.position.copy(o.merkez).multiplyScalar(1 - s);
  }

  function yolGuncelle(y, akis, t, bi) {
    const a = akis.atimlar[bi], ö = akis.atimlar[bi - 1];
    const af = a.tip === 'af', ldb = a.tip === 'ldb';
    const col = y.geo.attributes.color, arr = col.array;
    const deger = (b, u) => {
      if (b.tip === 'af' && ['sa', 'inter', 'inter2', 'inter3', 'bach'].includes(y.id)) return 0;
      const [s, e] = y.z(b);
      if (b.tip === 'af' && y.id === 'av') return 0.35 + 0.65 * Math.abs(Math.sin(t * 0.03 + b.q0)) * (t > b.q0 - 150 && t < b.q0 - 38 ? 1 : 0.2);
      const p = (t - s) / (e - s);
      if (p < 0) return 0;
      const son = 1 - sm((t - e) / 90);
      if (y.dugum) return Math.max(Math.sin(Math.PI * Math.min(1, p)) * (p <= 1 ? 1 : 0), 0.45 * son * (p > 1 ? 1 : 0));
      const iz = u <= p ? 0.4 * son : 0;
      const nabiz = Math.exp(-(((u - p) / 0.14) ** 2)) * (p <= 1.15 ? 1 : 0);
      return Math.min(1, iz + nabiz);
    };
    const bloke = ldb && (y.id === 'sol' || y.id === 'laf' || y.id === 'lpf');
    for (let i = 0; i < y.sayi; i++) {
      const u = y.dugum ? 0 : Math.min(1, Math.floor(i / y.radyal) / (y.halka - 1));
      let w = deger(a, u);
      if (ö) w = Math.max(w, deger(ö, u));
      if (bloke) tmp.copy(RENK.blok).multiplyScalar(0.75);
      else tmp.copy(RENK.yol).lerp(RENK.nabiz, w);
      if (!bloke && y.id === 'sa' && af) tmp.copy(RENK.yol).multiplyScalar(0.5);
      arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
    }
    col.needsUpdate = true;
  }

  function guncelle(t, akis, vek) {
    // Evre değişince infarkt alanı yumuşakça genişler/daralır
    const simdi = performance.now();
    const dt = Math.min(0.1, (simdi - infT) / 1000);
    infT = simdi;
    infSiddet = azHareket ? infHedef : infSiddet + (infHedef - infSiddet) * (1 - Math.exp(-dt * 4));
    const bi = akis.atimBul(t);
    for (const o of odalar) odaGuncelle(o, akis, t, bi);
    if (iletimAcik) for (const y of yollar) yolGuncelle(y, akis, t, bi);
    if (vektorAcik && vek) {
      const [x, y, z] = vek;
      dir.set(x, -y, z);
      const L = dir.length();
      if (L > 0.03) { ok.setDirection(dir.clone().normalize()); ok.setLength(Math.min(2.4, 0.25 + L * 1.1), 0.28, 0.16); ok.visible = true; }
      else ok.visible = false;
    } else ok.visible = false;

    if (hedef) {
      cam.position.lerp(hedef, 0.12);
      if (cam.position.distanceTo(hedef) < 0.03) hedef = null;
    }
    kont.update();
    renderer.render(scene, cam);

    const w = kutu.clientWidth, h = kutu.clientHeight;
    for (const e of etiketler) {
      const goster = e.t === 'iletim' ? iletimAcik && etiketAcik : etiketAcik && !iletimAcik;
      if (!goster) { e.el.hidden = true; continue; }
      tmpV.copy(e.p).project(cam);
      e.el.hidden = tmpV.z > 1;
      e.el.style.transform = `translate(-50%,-50%) translate(${((tmpV.x + 1) / 2) * w}px,${((1 - tmpV.y) / 2) * h}px)`;
      tmpV.copy(e.p).sub(kont.target);
      e.el.classList.toggle('arka', tmpV.dot(dir.copy(cam.position).sub(kont.target).normalize()) < -0.1);
    }
  }

  function etiketleriAyarla(a) { etiketAcik = a; }
  function iletimiAyarla(a) {
    iletimAcik = a; iletim.visible = a;
    for (const o of odalar) { o.mesh.material.opacity = a ? 0.38 : 1; o.mesh.material.depthWrite = !a; }
    for (const d of damarlar) d.material.opacity = a ? 0.3 : 1;
  }
  function vektoruAyarla(a) { vektorAcik = a; }

  // İnfarkt bölgesi: ventrikül duvarı köşelerine bölgeye göre ağırlık verir (0..1)
  function infarkt(bolge, siddet, renk) {
    infHedef = siddet || 0;
    if (renk) infRenk.set(renk);
    const o = odalar.find((x) => x.tip === 'V');
    if (!bolge || !siddet) { o.inf = null; infSiddet = 0; return; }
    const w = new Float32Array(o.n);
    const lc = V(0, 0, 0), rc = V(0, 0, 0), pp = V(0, 0, 0), uu = V(0, 0, 0), q2 = V(0, 0, 0);
    for (let k = 0; k < lvc.count; k++) lc.add(q2.fromBufferAttribute(lvc, k));
    lc.multiplyScalar(1 / lvc.count);
    for (let k = 0; k < rvc.count; k++) rc.add(q2.fromBufferAttribute(rvc, k));
    rc.multiplyScalar(1 / rvc.count);
    const D = { as: V(-0.25, 0.1, 0.96).normalize(), an: V(0.2, 0.1, 0.97).normalize(), la: V(0.98, 0.1, 0.1).normalize(), al: V(0.05, -0.97, -0.1).normalize(), po: V(0.1, 0.1, -0.98).normalize(), rv: V(0, -1, 0.1).normalize() };
    const kap = (d, e0) => sm((d - e0) / 0.3);
    const pos = o.geo.attributes.position;
    for (let i = 0; i < o.n; i++) {
      pp.fromBufferAttribute(pos, i);
      const sol = o.taraf[i] === 1;
      uu.copy(pp).sub(sol ? lc : rc).normalize();
      let v = 0;
      if (bolge === 'ant_sept') v = sol ? kap(uu.dot(D.as), 0.45) : o.septum[i] * 0.6 * kap(uu.dot(D.an), 0.2);
      else if (bolge === 'ant_genis') v = sol ? Math.max(kap(uu.dot(D.an), 0.4), kap(uu.dot(D.la), 0.5) * 0.9, kap(uu.dot(D.as), 0.45)) : 0;
      else if (bolge === 'lat') v = sol ? kap(uu.dot(D.la), 0.45) : 0;
      else if (bolge === 'inf') v = sol ? kap(uu.dot(D.al), 0.45) : kap(uu.dot(D.rv), 0.55) * 0.5;
      else if (bolge === 'post') v = sol ? kap(uu.dot(D.po), 0.45) : 0;
      else if (bolge === 'inf_rv') v = sol ? kap(uu.dot(D.al), 0.45) : kap(uu.dot(D.rv), 0.4);
      w[i] = Math.min(1, v);
    }
    o.inf = w;
  }
  function konum(a) { hedef = V(...a); }
  function hedefAyarla(a) { kont.target.set(...a); }

  return { guncelle, gorunum, infarkt, konum, hedefAyarla, etiketleriAyarla, iletimiAyarla, vektoruAyarla, scene, cam, kont, THREE };
}
