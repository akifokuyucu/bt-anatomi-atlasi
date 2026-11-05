// Üçlü kesit (MPR), artı imleci ve 3B görünüm.
// app.js'ten hacimleri ve durumu alır (api nesnesi); kendi başına bir şey yüklemez.
// 3B yüzeyler etiket hacminden mesh-worker.js ile tarayıcıda üretilir (ek veri indirilmez); Three.js ilk kullanımda CDN'den yüklenir.
const PLANES = ['axial', 'coronal', 'sagittal'];
const AD = { axial: 'Aksiyel', coronal: 'Koronal', sagittal: 'Sagittal' };
const RENK = { axial: '#e8bb5a', coronal: '#5bc0eb', sagittal: '#f05a66' };
const TERCIH = 'btatlas.gorunum';
const dar = () => matchMedia('(max-width: 899px)').matches;

export function mprKur(api) {
  const { state } = api;
  const viewer = document.getElementById('viewer');
  const kok = document.createElement('div');
  kok.id = 'mpr';
  kok.hidden = true;
  const kesitHtml = (p) =>
    `<div class="mpr-pane" data-plane="${p}" style="--c:${RENK[p]}">` +
    `<div class="mpr-ust"><b>${AD[p]}</b><span class="mono" data-bilgi></span><span class="spacer"></span><button type="button" class="mpr-buyut" aria-label="${AD[p]} kesiti büyüt" aria-pressed="false">⤢</button></div>` +
    `<div class="mpr-sahne"><canvas aria-label="${AD[p]} kesit"></canvas><i class="mpr-cizgi v"></i><i class="mpr-cizgi h"></i></div>` +
    `<input type="range" class="mpr-surgu" min="0" max="0" value="0" aria-label="${AD[p]} kesit"></div>`;
  kok.innerHTML =
    '<div class="mpr-bar"><label class="toggle"><input type="checkbox" id="mprImlec" checked> Artı imleci</label>' +
    '<span class="muted">Bir kesite dokunun veya sürükleyin: diğer iki düzlem o noktaya atlar ve altındaki yapı seçilir.</span></div>' +
    '<div class="mpr-izgara">' + PLANES.map(kesitHtml).join('') +
    '<div class="mpr-pane mpr-3b"><div class="mpr-ust"><b>3B</b><span class="mono" id="mpr3bBilgi"></span><span class="spacer"></span>' +
    '<div class="seg mini" id="mprGorunum" role="group" aria-label="3B bakış yönü">' +
    ['on:Ön', 'arka:Arka', 'sag:Sağ', 'sol:Sol', 'ust:Üst', 'alt:Alt'].map((x) => `<button type="button" data-g="${x.split(':')[0]}">${x.split(':')[1]}</button>`).join('') + '</div><button type="button" class="mpr-3b-buyut" aria-label="3B görünümü büyüt" aria-pressed="false">⤢</button></div>' +
    '<div class="mpr-sahne mpr-3b-sahne" id="mpr3b"><div class="mpr-durum" id="mpr3bDurum"></div></div>' +
    '<div class="mpr-3b-alt"><label class="toggle"><input type="checkbox" id="mprDuzlem"> Kesit düzlemleri</label>' +
    '<button type="button" class="btn small" id="mpr3bOrtala">Ortala</button>' +
    '<button type="button" class="btn small accent" id="mpr3bYukle" hidden>3B\'yi yükle</button></div></div></div>';
  viewer.after(kok);

  // Telefonda 2×2 ızgara: bir pencere tam genişliğe büyütülebilir (aynı anda yalnızca biri)
  kok.addEventListener('click', (e) => {
    const b = e.target.closest('.mpr-buyut, .mpr-3b-buyut');
    if (!b) return;
    const pane = b.closest('.mpr-pane');
    const ac = !pane.classList.contains('buyuk');
    kok.querySelectorAll('.mpr-pane').forEach((x) => {
      x.classList.remove('buyuk');
      x.querySelector('.mpr-buyut, .mpr-3b-buyut')?.setAttribute('aria-pressed', 'false');
    });
    if (ac) { pane.classList.add('buyuk'); b.setAttribute('aria-pressed', 'true'); }
    pane.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const panes = {};
  for (const p of PLANES) {
    const el = kok.querySelector(`.mpr-pane[data-plane="${p}"]`);
    const canvas = el.querySelector('canvas');
    panes[p] = {
      el, canvas, ctx: canvas.getContext('2d'), sahne: el.querySelector('.mpr-sahne'), surgu: el.querySelector('.mpr-surgu'),
      bilgi: el.querySelector('[data-bilgi]'), v: el.querySelector('.mpr-cizgi.v'), h: el.querySelector('.mpr-cizgi.h'),
      img: null, labs: null, gray: null, les: null,
    };
  }
  const imlecKutu = kok.querySelector('#mprImlec');
  let aktif = false;
  let bekliyor = false;
  const istek = () => { if (bekliyor) return; bekliyor = true; requestAnimationFrame(() => { bekliyor = false; api.render(); }); };

  // ---------- Kesit çizimi ----------
  function kesitCiz(plane) {
    const P = panes[plane];
    const [w, h, , su, sv] = api.dimsOf(plane);
    if (P.canvas.width !== w || P.canvas.height !== h) {
      P.canvas.width = w;
      P.canvas.height = h;
      P.img = P.ctx.createImageData(w, h);
      P.labs = new Uint8Array(w * h);
      P.gray = new Uint8ClampedArray(w * h);
      P.les = new Uint8Array(w * h);
      P.sahne.style.setProperty('--oran', String((w * su) / (h * sv))); // en/boy oranı; mpr.css genişliği yükseklik sınırıyla birlikte hesaplar
    }
    const ct = api.ct(), lab = api.lab();
    const ov = api.overlayOn() ? api.ov() : null;
    const les = api.les() && state.lesOn ? api.les() : null;
    const [base, du, dv] = api.strides(plane, state.slices[plane]);
    const [WW, L0] = state.win;
    const lo = L0 - WW / 2, sc = 255 / WW;
    const { labs, gray, les: lesA } = P;
    for (let v = 0, p = 0; v < h; v++) {
      let idx = base + v * dv;
      for (let u = 0; u < w; u++, p++, idx += du) {
        gray[p] = (ct[idx] - lo) * sc;
        labs[p] = (ov && ov[idx]) || lab[idx];
        lesA[p] = les ? les[idx] : 0;
      }
    }
    const vis = api.visibleTable();
    const sel = state.selected;
    const dolgu = state.opacity;
    const rgb = api.rgb();
    const px = P.img.data;
    for (let v = 0, p = 0; v < h; v++) {
      for (let u = 0; u < w; u++, p++) {
        const g = gray[p];
        let r = g, gg = g, b = g;
        const l = labs[p];
        if (l && vis[l]) {
          const kenar = state.outline && ((u > 0 && labs[p - 1] !== l) || (u < w - 1 && labs[p + 1] !== l) || (v > 0 && labs[p - w] !== l) || (v < h - 1 && labs[p + w] !== l));
          let a;
          if (kenar) a = sel && l !== sel ? 0.45 : 0.95;
          else if (!sel) a = dolgu;
          else a = l === sel ? Math.max(0.6, dolgu + 0.2) : dolgu * 0.3;
          const c = rgb[l];
          r = g + (c[0] - g) * a; gg = g + (c[1] - g) * a; b = g + (c[2] - g) * a;
        }
        if (lesA[p]) { r += (235 - r) * 0.75; gg += (30 - gg) * 0.75; b += (50 - b) * 0.75; }
        const o = p * 4;
        px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
      }
    }
    P.ctx.putImageData(P.img, 0, 0);
  }

  // ---------- Artı imleci ----------
  // İmleç noktası: x = sagittal kesit, y = koronal kesit, z = aksiyel kesit (bellek indeksleri)
  const nokta = () => ({ x: state.slices.sagittal, y: state.slices.coronal, z: state.slices.axial });
  function imlecKonumla() {
    const [nx, ny, nz] = api.dims();
    const { x, y, z } = nokta();
    const ac = imlecKutu.checked;
    // [dikey çizgi: u konumu, rengi], [yatay çizgi: v konumu, rengi]
    const konum = {
      axial: [(nx - 1 - x + 0.5) / nx, 'sagittal', (ny - 1 - y + 0.5) / ny, 'coronal'],
      coronal: [(nx - 1 - x + 0.5) / nx, 'sagittal', (nz - 1 - z + 0.5) / nz, 'axial'],
      sagittal: [(ny - 1 - y + 0.5) / ny, 'coronal', (nz - 1 - z + 0.5) / nz, 'axial'],
    };
    for (const p of PLANES) {
      const P = panes[p];
      const [u, ru, v, rv] = konum[p];
      P.v.style.cssText = `left:${u * 100}%;--c:${RENK[ru]};display:${ac ? 'block' : 'none'}`;
      P.h.style.cssText = `top:${v * 100}%;--c:${RENK[rv]};display:${ac ? 'block' : 'none'}`;
    }
  }

  function noktadan(plane, e) {
    const [nx, ny, nz] = api.dims();
    const [w, h] = api.dimsOf(plane);
    const r = panes[plane].canvas.getBoundingClientRect();
    const u = Math.min(w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * w)));
    const v = Math.min(h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * h)));
    const c = nokta();
    if (plane === 'axial') { c.x = nx - 1 - u; c.y = ny - 1 - v; }
    else if (plane === 'coronal') { c.x = nx - 1 - u; c.z = nz - 1 - v; }
    else { c.y = ny - 1 - u; c.z = nz - 1 - v; }
    return c;
  }

  function dokun(plane, e, sec) {
    const c = noktadan(plane, e);
    if (imlecKutu.checked) { state.slices.sagittal = c.x; state.slices.coronal = c.y; state.slices.axial = c.z; }
    const [nx, ny] = api.dims();
    if (sec) {
      const ov = api.overlayOn() ? api.ov() : null;
      const idx = (c.z * ny + c.y) * nx + c.x;
      const l = (ov && ov[idx]) || api.lab()[idx];
      if (l && api.visibleTable()[l]) { api.select(l); return; }
    }
    istek();
  }

  for (const p of PLANES) {
    const P = panes[p];
    let surukle = false;
    P.sahne.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button) return;
      e.preventDefault();
      P.sahne.setPointerCapture(e.pointerId);
      surukle = true;
      dokun(p, e, true);
    });
    P.sahne.addEventListener('pointermove', (e) => { if (surukle && imlecKutu.checked) dokun(p, e, false); });
    const bit = () => { surukle = false; };
    P.sahne.addEventListener('pointerup', bit);
    P.sahne.addEventListener('pointercancel', bit);
    P.sahne.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [, , n] = api.dimsOf(p);
      const d = Math.sign(e.deltaY) * (p === 'axial' ? -1 : 1);
      state.slices[p] = Math.max(0, Math.min(n - 1, state.slices[p] + d));
      istek();
    }, { passive: false });
    P.surgu.addEventListener('input', () => {
      const [, , n] = api.dimsOf(p);
      const v = +P.surgu.value;
      state.slices[p] = p === 'axial' ? n - 1 - v : v;
      istek();
    });
  }
  imlecKutu.addEventListener('change', () => { imlecKonumla(); });

  // ---------- 3B ----------
  const sahne3 = kok.querySelector('#mpr3b');
  const durumEl = kok.querySelector('#mpr3bDurum');
  const yukleBtn = kok.querySelector('#mpr3bYukle');
  const duzlemKutu = kok.querySelector('#mprDuzlem');
  let t3 = null;
  let yukleniyor = false;
  const durum3 = (m) => { durumEl.textContent = m || ''; durumEl.hidden = !m; };

  async function ucB() {
    if (t3 || yukleniyor) return;
    yukleniyor = true;
    yukleBtn.hidden = true;
    durum3('3B yüzeyler hazırlanıyor…');
    try {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
      renderer.domElement.setAttribute('aria-label', '3B anatomi modeli; sürükleyerek döndürün, yapıya dokunarak seçin');
      sahne3.prepend(renderer.domElement);
      const scene = new THREE.Scene();
      const kam = new THREE.PerspectiveCamera(35, 1, 1, 6000);
      scene.add(kam);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x4a3a3a, 1.05));
      const isik = new THREE.DirectionalLight(0xffffff, 1.5);
      isik.position.set(1.5, 2.5, 3);
      kam.add(isik);
      const kont = new OrbitControls(kam, renderer.domElement);
      kont.enablePan = true;
      const grup = new THREE.Group();
      scene.add(grup);
      const duzlemler = new THREE.Group();
      duzlemler.visible = duzlemKutu.checked;
      scene.add(duzlemler);
      t3 = { THREE, renderer, scene, kam, kont, grup, duzlemler, meshes: new Map(), hazir: false, plan: {}, merkez: new THREE.Vector3(), boyut: 400 };

      let bekle3 = false;
      t3.ciz = () => { if (bekle3) return; bekle3 = true; requestAnimationFrame(() => { bekle3 = false; renderer.render(scene, kam); }); };
      kont.addEventListener('change', t3.ciz);
      new ResizeObserver(() => {
        const w = sahne3.clientWidth || 1, h = sahne3.clientHeight || 1;
        renderer.setSize(w, h, false);
        kam.aspect = w / h;
        kam.updateProjectionMatrix();
        t3.ciz();
      }).observe(sahne3);

      // Seçme: sürüklemeden bırakılan dokunuş ışın atar
      let bas = null;
      renderer.domElement.addEventListener('pointerdown', (e) => { bas = [e.clientX, e.clientY]; });
      renderer.domElement.addEventListener('pointerup', (e) => {
        if (!bas || Math.hypot(e.clientX - bas[0], e.clientY - bas[1]) > 5) return;
        const r = renderer.domElement.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), kam);
        const hedef = [...t3.meshes.values()].filter((m) => m.visible);
        const vur = ray.intersectObjects(hedef, false)[0];
        if (vur) api.select(vur.object.userData.id);
      });

      const worker = new Worker('mesh-worker.js');
      const kopya = api.lab().slice().buffer;
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.tip === 'ilerleme') { durum3(`3B yüzeyler hazırlanıyor… %${m.yuzde}`); return; }
        worker.terminate();
        try { agKur(m.ag); durum3(''); } catch (err) { console.error(err); durum3('3B yüzeyler kurulamadı.'); }
      };
      worker.onerror = (err) => { console.error(err); durum3('3B yüzey üretimi başarısız oldu.'); };
      worker.postMessage({ lab: kopya, dims: api.dims(), hedef: dar() ? 6e5 : 1.5e6 }, [kopya]);
    } catch (err) {
      console.error(err);
      t3 = null;
      yukleniyor = false;
      durum3('3B görünüm bu cihazda açılamadı (WebGL gerekir).');
    }
  }

  // Voksel indeksi → dünya (mm): X = sağ negatif, Y = üst, Z = ön
  function agKur(ag) {
    const { THREE, grup, duzlemler } = t3;
    const [nx, ny, nz] = api.dims();
    const [sx, sy, sz] = api.atlas().spacing;
    const yapi = api.struct(), rgb = api.rgb();
    let uc = 0;
    for (const m of ag) {
      const s = yapi[m.id];
      if (!s) continue;
      const n = m.pos.length / 3;
      const P = new Float32Array(m.pos.length);
      for (let i = 0; i < n; i++) {
        P[i * 3] = (nx / 2 - m.pos[i * 3] - 0.5) * sx;
        P[i * 3 + 1] = (m.pos[i * 3 + 2] + 0.5 - nz / 2) * sz;
        P[i * 3 + 2] = (m.pos[i * 3 + 1] + 0.5 - ny / 2) * sy;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const c = rgb[m.id];
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255), roughness: 0.6, metalness: 0, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.id = m.id;
      grup.add(mesh);
      t3.meshes.set(m.id, mesh);
      uc += m.idx.length / 3;
    }
    // Merkez ve boyut: hacmin kendisi (yapılar gizlenince kamera sıçramasın)
    const X = nx * sx, Y = nz * sz, Z = ny * sy;
    t3.merkez.set(0, 0, 0);
    t3.boyut = Math.max(X, Y, Z);
    t3.kont.target.copy(t3.merkez);
    t3.kont.maxDistance = t3.boyut * 4;
    t3.kont.minDistance = t3.boyut * 0.15;

    // Kesit düzlemleri: pencere tuvalleri doku olarak
    const dortgen = (kose, uv) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(kose.flat()), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv.flat()), 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      return g;
    };
    const x0 = -X / 2, x1 = X / 2, y0 = -Y / 2, y1 = Y / 2, z0 = -Z / 2, z1 = Z / 2;
    const geoler = {
      axial: dortgen([[x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0]], [[0, 1], [1, 1], [1, 0], [0, 0]]),
      coronal: dortgen([[x0, y1, 0], [x1, y1, 0], [x1, y0, 0], [x0, y0, 0]], [[0, 1], [1, 1], [1, 0], [0, 0]]),
      sagittal: dortgen([[0, y1, z1], [0, y1, z0], [0, y0, z0], [0, y0, z1]], [[0, 1], [1, 1], [1, 0], [0, 0]]),
    };
    for (const p of PLANES) {
      const doku = new THREE.CanvasTexture(panes[p].canvas);
      doku.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(geoler[p], new THREE.MeshBasicMaterial({ map: doku, side: THREE.DoubleSide, toneMapped: false }));
      duzlemler.add(mesh);
      t3.plan[p] = { mesh, doku };
    }
    t3.hazir = true;
    kok.querySelector('#mpr3bBilgi').textContent = `${t3.meshes.size} yapı · ${Math.round(uc / 1000)} bin üçgen`;
    gorunum('on');
    guncelle3();
  }

  function gorunum(ad) {
    if (!t3) return;
    const D = { on: [0, 0, 1], arka: [0, 0, -1], sag: [-1, 0, 0], sol: [1, 0, 0], ust: [0, 1, 0], alt: [0, -1, 0] }[ad];
    const yukari = ad === 'ust' || ad === 'alt' ? [0, 0, 1] : [0, 1, 0];
    const d = t3.boyut * 1.75;
    t3.kam.up.set(...yukari);
    t3.kam.position.set(t3.merkez.x + D[0] * d, t3.merkez.y + D[1] * d, t3.merkez.z + D[2] * d);
    t3.kont.target.copy(t3.merkez);
    t3.kont.update();
    t3.ciz();
    kok.querySelectorAll('#mprGorunum button').forEach((b) => b.classList.toggle('on', b.dataset.g === ad));
  }
  kok.querySelector('#mprGorunum').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) gorunum(b.dataset.g); });
  kok.querySelector('#mpr3bOrtala').addEventListener('click', () => gorunum('on'));
  yukleBtn.addEventListener('click', ucB);
  duzlemKutu.addEventListener('change', () => { if (t3) { t3.duzlemler.visible = duzlemKutu.checked; guncelle3(); } });

  // Durumu 3B sahneye yansıt: sistem açık/kapalı, gizlenen yapılar, seçim, kesit konumları
  function guncelle3() {
    if (!t3 || !t3.hazir) return;
    const sel = state.selected;
    const yapi = api.struct();
    for (const [id, mesh] of t3.meshes) {
      mesh.visible = api.isEnabled(yapi[id]);
      const mat = mesh.material;
      const secili = sel && id === sel;
      mat.opacity = sel && !secili ? 0.14 : 1;
      mat.depthWrite = mat.opacity > 0.99;
      mat.emissive.setScalar(0);
      if (secili) mat.emissive.copy(mat.color).multiplyScalar(0.3);
    }
    if (t3.duzlemler.visible) {
      const [nx, ny, nz] = api.dims();
      const [sx, sy, sz] = api.atlas().spacing;
      const { x, y, z } = nokta();
      t3.plan.axial.mesh.position.y = (z + 0.5 - nz / 2) * sz;
      t3.plan.coronal.mesh.position.z = (y + 0.5 - ny / 2) * sy;
      t3.plan.sagittal.mesh.position.x = (nx / 2 - x - 0.5) * sx;
      for (const p of PLANES) t3.plan[p].doku.needsUpdate = true;
    }
    t3.ciz();
  }

  // ---------- Mod ----------
  function guncelle() {
    if (!aktif) return;
    if (state.quiz) { modAyarla('tek'); return; } // sınav tek pencerede çalışır
    for (const p of PLANES) {
      kesitCiz(p);
      const P = panes[p];
      const [, , n] = api.dimsOf(p);
      const s = state.slices[p];
      const v = p === 'axial' ? n - 1 - s : s;
      P.surgu.max = n - 1;
      P.surgu.value = v;
      P.bilgi.textContent = `${v + 1} / ${n}`;
    }
    imlecKonumla();
    document.getElementById('planeInfo').textContent = 'ÜÇLÜ KESİT · 3B';
    guncelle3();
  }

  function modAyarla(mod, kaydet = true) {
    const uclu = mod === 'uclu';
    if (uclu === aktif) return;
    aktif = uclu;
    kok.hidden = !uclu;
    document.querySelector('.viewer-wrap').classList.toggle('mpr-aktif', uclu);
    document.body.classList.toggle('mpr-aktif', uclu);
    document.querySelectorAll('#viewMode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mod));
    if (kaydet) { try { localStorage.setItem(TERCIH, mod); } catch { /* sorun değil */ } }
    if (uclu) {
      if (dar()) { if (!t3) { yukleBtn.hidden = false; durum3('3B yüzeyleri telefonda isteğe bağlı yüklenir.'); } } else ucB();
    }
    api.render();
  }

  document.getElementById('viewMode')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) modAyarla(b.dataset.mode);
  });

  // Önceki tercih yalnızca geniş ekranda uygulanır
  try { if (localStorage.getItem(TERCIH) === 'uclu' && !dar() && !state.quiz) setTimeout(() => modAyarla('uclu', false), 0); } catch { /* sorun değil */ }

  return { guncelle, tekeDon: () => modAyarla('tek', false), get aktif() { return aktif; } };
}
