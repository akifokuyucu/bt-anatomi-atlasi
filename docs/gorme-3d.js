// Görme yolları 3B sahnesi (Three.js): BodyParts3D anatomisi üzerinde lif demetleri, V1 yaması ve lezyon küreleri.
// Model: BodyParts3D, © The Database Center for Life Science, CC BY 4.0 (scripts/build_optik.py ile üretilir).
// Radyasyon lifleri ve V1 yaması veri setinde yoktur; gorme-model.js haritasından çizilir.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { v1Nokta } from './gorme-model.js';

const GORUNUM = {
  ust: [1.1, 9.2, -3.1], alt: [0.5, -9.6, -1.2], yan: [10, 0.8, 0.2], on: [0, 1.1, 10], arka: [0, 1.8, -10],
};
// Kadran renkleri: alan yönüne göre (arayüzdeki renk anahtarıyla aynı)
export const KADRAN = { su: '#ffb347', sa: '#ff5f7e', lu: '#3fd6ff', la: '#8f8bff' };
export const kadranRenk = (x, y) => (x >= 0 ? (y >= 0 ? KADRAN.su : KADRAN.sa) : (y >= 0 ? KADRAN.lu : KADRAN.la));

const ETIKETLER = [
  ['Sol göz', [29, -166, 1518]], ['Sağ göz', [-30, -166, 1518]],
  ['Optik sinir', [17, -128, 1527]], ['Kiazma', [0, -105, 1544]], ['Hipofiz', [0, -106, 1524]],
  ['Optik traktus', [-24, -91, 1541]], ['LGN', [24, -74, 1540]],
  ['Meyer halkası', [40, -100, 1529]], ['Optik radyasyon', [-34, -40, 1552]], ['V1', [8, -12, 1556], 'v1'],
];

export async function gormeSahnesi(kutu, etiketKutu, model) {
  const [gltf, meta] = await Promise.all([
    new GLTFLoader().loadAsync('data/optik/optik.glb'),
    fetch('data/optik/optik.json').then((r) => r.json()),
  ]);
  const C = meta.merkez, S = meta.olcek;
  const sah = (p) => new THREE.Vector3((p[0] - C[0]) / S, (p[2] - C[2]) / S, -(p[1] - C[1]) / S);
  const mm = (v) => [v.x * S + C[0], -v.z * S + C[1], v.y * S + C[2]];

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  kutu.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3B görme yolu modeli; sürükleyerek döndürün');
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  cam.position.set(...GORUNUM.ust);
  scene.add(cam);
  const kont = new OrbitControls(cam, renderer.domElement);
  kont.target.set(0, 0.05, 0);
  kont.enableDamping = true;
  kont.enablePan = false;
  kont.minDistance = 1.2;
  kont.maxDistance = 13;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x303848, 1.1));
  const isik = new THREE.DirectionalLight(0xffffff, 1.5);
  isik.position.set(2, 3, 4);
  cam.add(isik);

  // --- Anatomi ---------------------------------------------------------------
  const STIL = {
    kabuk: { color: '#c7b6ae', opacity: 0.055, depthWrite: false },
    sinir: { color: '#e8d48a', opacity: 0.3 }, kiazma: { color: '#e8d48a', opacity: 0.3 }, traktus: { color: '#e8d48a', opacity: 0.3 },
    lgn: { color: '#f2a65a', opacity: 0.55 },
    talamus: { color: '#8ea0b8', opacity: 0.12, depthWrite: false },
    orta_beyin: { color: '#8ea0b8', opacity: 0.14, depthWrite: false },
    hipofiz: { color: '#d78fb0', opacity: 0.6 },
    vitreus: { color: '#bcd8ee', opacity: 0.22, depthWrite: false },
    lens: { color: '#f4efe2', opacity: 0.75 },
    iris: { color: '#5a7f9c', opacity: 0.85 },
  };
  const grup = new THREE.Group();
  scene.add(grup);
  const parca = {};
  gltf.scene.traverse((n) => {
    if (!n.isMesh) return;
    const ad = n.name;
    const kok = ad.replace(/_(sol|sag)$/, '');
    n.geometry.computeVertexNormals();
    n.material = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.65, metalness: 0, ...(STIL[kok] || { color: '#999', opacity: 0.3 }) });
    n.renderOrder = kok === 'kabuk' ? 5 : 1;
    parca[ad] = n;
  });
  grup.add(gltf.scene);
  // Sklera: göz duvarı parçaları ağır olduğu için yarısaydam küre
  for (const ad of ['sol', 'sag']) {
    const t = meta.taraf[ad];
    const m = new THREE.Mesh(new THREE.SphereGeometry((t.gozR + 1.4) / S, 32, 24), new THREE.MeshStandardMaterial({ color: '#f2f0ea', transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.4 }));
    m.position.copy(sah(t.goz));
    grup.add(m);
  }

  // --- Lifler -----------------------------------------------------------------
  const RING = [3, 10, 25, 50, 78];
  const ACI = 20;
  const lifler = [];
  const poz = [], faz = [], renk = [], lifNo = [];
  const c = new THREE.Color(), beyaz = new THREE.Color('#ffffff');
  for (const [g, e] of [[0, 1], [1, -1]]) {
    for (const E of RING) {
      for (let j = 0; j < ACI; j++) {
        const phi = (j + 0.5) / ACI * 2 * Math.PI;
        const x = E * Math.cos(phi), y = E * Math.sin(phi);
        const { P } = model.lifYolu(e, E, phi);
        const m = P.length / 3;
        const no = lifler.length;
        lifler.push({ g, e, E, phi, x, y, P, m });
        c.set(kadranRenk(x, y)).lerp(beyaz, E < 5 ? 0.45 : 0);
        for (let k = 0; k < m - 1; k++) {
          for (const q of [k, k + 1]) {
            const v = sah([P[3 * q], P[3 * q + 1], P[3 * q + 2]]);
            poz.push(v.x, v.y, v.z);
            faz.push(q / (m - 1));
            renk.push(c.r, c.g, c.b);
            lifNo.push(no);
          }
        }
      }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(poz, 3));
  lg.setAttribute('aFaz', new THREE.Float32BufferAttribute(faz, 1));
  lg.setAttribute('aRenk', new THREE.Float32BufferAttribute(renk, 3));
  const kesiAttr = new THREE.Float32BufferAttribute(new Float32Array(faz.length).fill(2), 1);
  lg.setAttribute('aKesi', kesiAttr);
  const lm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uZaman: { value: 0 }, uSinyal: { value: 1 } },
    vertexShader: `
      attribute float aFaz; attribute vec3 aRenk; attribute float aKesi;
      varying float vFaz; varying vec3 vRenk; varying float vKesi;
      void main() { vFaz = aFaz; vRenk = aRenk; vKesi = aKesi; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uZaman; uniform float uSinyal;
      varying float vFaz; varying vec3 vRenk; varying float vKesi;
      void main() {
        float kesik = step(vKesi, vFaz);
        float dalga = pow(0.5 + 0.5 * sin((vFaz * 9.0 - uZaman * 1.1) * 6.2832), 10.0) * uSinyal;
        vec3 r = mix(vRenk * (0.34 + dalga * 1.5), vec3(0.32, 0.05, 0.08), kesik);
        gl_FragColor = vec4(r, mix(0.62, 0.3, kesik));
      }`,
  });
  const cizgi = new THREE.LineSegments(lg, lm);
  cizgi.renderOrder = 3;
  grup.add(cizgi);

  // --- V1 yaması ---------------------------------------------------------------
  const v1 = {};
  for (const h of [1, -1]) {
    const NE = 30, NA = 20;
    const pos = [], rk = [], idx = [], alan = [];
    for (let i = 0; i <= NE; i++) {
      const d = i / NE;
      const E = 0.75 * (Math.exp(d * Math.log(121)) - 1);
      for (let j = 0; j <= NA; j++) {
        const psi = -Math.PI / 2 + j / NA * Math.PI;
        const phi = h > 0 ? psi : Math.PI - psi;
        const v = sah(v1Nokta(h, E, phi));
        pos.push(v.x, v.y, v.z);
        const x = E * Math.cos(phi), y = E * Math.sin(phi);
        alan.push([x, y]);
        c.set(kadranRenk(x, y)).lerp(beyaz, Math.max(0, 0.5 - d));
        rk.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NE; i++) {
      for (let j = 0; j < NA; j++) {
        const a = i * (NA + 1) + j, b = a + 1, d = a + NA + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(rk, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, transparent: true, opacity: 0.85 }));
    m.renderOrder = 2;
    grup.add(m);
    v1[h] = { m, alan, taban: Float32Array.from(rk) };
  }

  // --- Lezyon ve iz -------------------------------------------------------------
  const lezyonGrup = new THREE.Group();
  grup.add(lezyonGrup);
  const lezMat = new THREE.MeshStandardMaterial({ color: '#ff3b4e', emissive: '#7a0c18', transparent: true, opacity: 0.42, roughness: 0.4, depthWrite: false });
  const lezKure = new THREE.SphereGeometry(1, 24, 18);
  const izGrup = new THREE.Group();
  grup.add(izGrup);

  // Retinal lezyonlarda gözün üstünde küçük halka
  function halka(p, r) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r / S, 0.012, 8, 28), new THREE.MeshBasicMaterial({ color: '#ff3b4e' }));
    m.position.copy(sah(p));
    m.lookAt(sah([p[0], p[1] - 10, p[2]]));
    return m;
  }

  function lezyon({ kureler, alanFn, sonuc }) {
    while (lezyonGrup.children.length) lezyonGrup.remove(lezyonGrup.children[0]);
    for (const [x, y, z, r] of kureler || []) {
      const m = new THREE.Mesh(lezKure, lezMat);
      m.position.copy(sah([x, y, z]));
      m.scale.setScalar(r / S);
      m.renderOrder = 6;
      lezyonGrup.add(m);
    }
    if (alanFn) {
      for (const [g, ad] of [[0, 'sol'], [1, 'sag']]) {
        const e = g ? -1 : 1;
        if (alanFn(e, 0, 0, 0) > 0.5 || alanFn(e, 30, 0, 30) > 0.5 || alanFn(e, -30, 0, 30) > 0.5 || alanFn(e, 0, -30, 30) > 0.5 || alanFn(e, 0, 30, 30) > 0.5 || alanFn(e, 15 * -e, -1.5, 15) > 0.5) {
          const t = meta.taraf[ad];
          lezyonGrup.add(halka([t.goz[0], t.goz[1] - t.gozR - 7, t.goz[2]], 13));
        }
      }
    }
    // Lif kesileri: küreden geçen ilk örnek; retinal lezyonda baştan
    const kes = new Float32Array(lifler.length).fill(2);
    lifler.forEach((l, i) => {
      if (alanFn && alanFn(l.e, l.x, l.y, l.E) > 0.5) { kes[i] = 0; return; }
      for (const [x, y, z, r] of kureler || []) {
        const r2 = r * r;
        for (let k = 0; k < l.m; k++) {
          const dx = l.P[3 * k] - x, dy = l.P[3 * k + 1] - y, dz = l.P[3 * k + 2] - z;
          if (dx * dx + dy * dy + dz * dz < r2) { const t = k / (l.m - 1); if (t < kes[i]) kes[i] = t; break; }
        }
      }
    });
    const a = kesiAttr.array;
    for (let i = 0; i < a.length; i++) a[i] = kes[lifNo[i]];
    kesiAttr.needsUpdate = true;
    // V1 yaması: hasarlı bölge koyulaşır
    for (const h of [1, -1]) {
      const { m, alan, taban } = v1[h];
      const rk = m.geometry.attributes.color;
      alan.forEach(([x, y], i) => {
        const v = sonuc ? Math.max(model.hasarOku(sonuc.D, 0, x, y), model.hasarOku(sonuc.D, 1, x, y)) * 0.5 + Math.min(model.hasarOku(sonuc.D, 0, x, y), model.hasarOku(sonuc.D, 1, x, y)) * 0.5 : 0;
        for (let q = 0; q < 3; q++) rk.array[3 * i + q] = taban[3 * i + q] * (1 - 0.86 * v);
      });
      rk.needsUpdate = true;
    }
  }

  // Bir alan noktasının lifini parlak bir tüp olarak göster
  function iz(listesi) {
    while (izGrup.children.length) {
      const o = izGrup.children[0];
      o.geometry.dispose();
      izGrup.remove(o);
    }
    for (const { e, E, phi, renk: r } of listesi) {
      const { P } = model.lifYolu(e, E, phi, 2);
      const nok = [];
      for (let k = 0; k < P.length; k += 3) nok.push(sah([P[k], P[k + 1], P[k + 2]]));
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(nok), Math.min(200, nok.length * 2), 0.014, 6, false);
      izGrup.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: r || '#ffffff' })));
    }
  }

  // --- Etiketler ------------------------------------------------------------------
  const etiketler = ETIKETLER.map(([ad, p, tur]) => {
    const d = document.createElement('div');
    d.className = 'kalp-etiket' + (tur ? ' ' + tur : '');
    d.textContent = ad;
    etiketKutu.appendChild(d);
    return { d, v: sah(p) };
  });
  let etiketAcik = true;
  const gecici = new THREE.Vector3();
  function etiketCiz(w, h) {
    for (const e of etiketler) {
      if (!etiketAcik) { e.d.style.display = 'none'; continue; }
      gecici.copy(e.v).project(cam);
      e.d.style.display = '';
      e.d.style.transform = `translate(-50%,-50%) translate(${(gecici.x * 0.5 + 0.5) * w}px,${(-gecici.y * 0.5 + 0.5) * h}px)`;
    }
  }

  // --- Yerleştirme: işaretçiye en yakın lif noktası ---------------------------------
  const ray = new THREE.Raycaster();
  function liftenNokta(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), cam);
    let eniyi = null, ed = 0.16;
    const v = new THREE.Vector3();
    for (const l of lifler) {
      for (let k = 0; k < l.m; k += 1) {
        v.copy(sah([l.P[3 * k], l.P[3 * k + 1], l.P[3 * k + 2]]));
        const d = ray.ray.distanceToPoint(v);
        if (d < ed) { ed = d; eniyi = v.clone(); }
      }
    }
    return eniyi ? mm(eniyi) : null;
  }

  // --- Döngü -----------------------------------------------------------------------
  const hareketYok = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (hareketYok) lm.uniforms.uSinyal.value = 0;
  function boyut() {
    const w = kutu.clientWidth, h = kutu.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    kirliYap?.();
  }
  let kirliYap = null;
  new ResizeObserver(boyut).observe(kutu);
  boyut();
  let gorunur = true;
  new IntersectionObserver(([g]) => { gorunur = g.isIntersecting; }).observe(kutu);
  // Zayıf cihazda sürekli çizim yerine yalnız değişiklikte çizilir: sinyal animasyonu durur, sahne akıcı kalır
  const saat = new THREE.Clock();
  let surekli = !hareketYok, kirli = true, son = 0, yavas = 0, oge = 0;
  kont.addEventListener('change', () => { kirli = true; });
  const yeniCiz = () => { kirli = true; };
  kirliYap = yeniCiz;
  document.addEventListener('visibilitychange', () => { son = 0; yavas = 0; oge = 0; });
  renderer.setAnimationLoop((t) => {
    if (!gorunur || document.hidden) { son = 0; kirli = true; return; }
    kont.update();
    if (son && surekli) {
      oge++;
      if (t - son > 55) yavas++;
      if (oge >= 40) {
        if (yavas > 28) { surekli = false; lm.uniforms.uSinyal.value = 0; kirli = true; }
        oge = 0; yavas = 0;
      }
    }
    son = t;
    if (!surekli && !kirli) return;
    kirli = false;
    lm.uniforms.uZaman.value = saat.getElapsedTime();
    renderer.render(scene, cam);
    etiketCiz(kutu.clientWidth, kutu.clientHeight);
  });

  return {
    lezyon(a) { lezyon(a); yeniCiz(); }, iz(a) { iz(a); yeniCiz(); }, liftenNokta,
    gorunum(ad) { cam.position.set(...GORUNUM[ad]); kont.target.set(0, 0.05, 0); kont.update(); },
    kabuk(acik) { parca.kabuk_sol.visible = parca.kabuk_sag.visible = acik; yeniCiz(); },
    lifler(acik) { cizgi.visible = acik; yeniCiz(); },
    sinyal(acik) { surekli = acik && !hareketYok; lm.uniforms.uSinyal.value = surekli ? 1 : 0; oge = 0; yavas = 0; yeniCiz(); },
    etiket(acik) { etiketAcik = acik; yeniCiz(); },
    orbit(acik) { kont.enabled = acik; },
    tuval: renderer.domElement,
  };
}
