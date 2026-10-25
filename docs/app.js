// BT Anatomi Atlası — bağımlılıksız 2B görüntüleyici.
// Hacimler bellekte [z][y][x] sırasıyla tutulur ve RAS yönündedir (build_atlas.py).

const $ = (id) => document.getElementById(id);

const PLANE_TR = { axial: 'Aksiyel', coronal: 'Koronal', sagittal: 'Sagittal' };
const PLANE_LOC = { axial: 'Aksiyelde', coronal: 'Koronalde', sagittal: 'Sagittalde' };
// [üst, alt, sol, sağ] ekran kenarındaki yön etiketleri (radyolojik görünüm)
const ORIENT = {
  axial: ['Ön', 'Arka', 'Sağ', 'Sol'],
  coronal: ['Üst', 'Alt', 'Sağ', 'Sol'],
  sagittal: ['Üst', 'Alt', 'Ön', 'Arka'],
};

const state = {
  plane: 'axial',
  slices: {},
  systemsOn: new Set(),
  hidden: new Set(),
  lesOn: true,
  lesion: 0,
  labels: true,
  outline: true,
  opacity: 0.45,
  win: [400, 40],
  selected: 0,
  zoom: 1,
  pan: [0, 0],
  tool: 'scroll',
  onlySlice: false,
  search: '',
  quiz: null,
};

let atlas, ct, lab, ov, les, nx, ny, nz;
let hiddenByOverlay = new Set();
let structById = [];
let rgbById = [];
let systemName = {};

const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
let sliceLabels = new Uint8Array(0);
let sliceArea = new Uint32Array(0);
let sliceLes = new Uint8Array(0);
let sliceLesArea = new Uint32Array(0);
let labelHits = [];

// ---------- Yükleme ----------

async function fetchBin(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(got, total);
  }
  let blob = new Blob(chunks);
  // Sunucu gzip'i zaten açmışsa ikinci kez açma
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  }
  return blob.arrayBuffer();
}

async function load() {
  const text = $('loadingText');
  // Küçük dizin dosyaları her açılışta doğrulanır; büyük hacimler sürüm parametresiyle önbelleğe alınır
  const cases = (await (await fetch('data/cases.json', { cache: 'no-cache' })).json()).filter((c) => c.status === 'ready');
  caseId = pickCase(cases);
  const dir = `data/${caseId}`;
  buildCaseSelect(cases);
  atlas = await (await fetch(`${dir}/atlas.json`, { cache: 'no-cache' })).json();
  [nx, ny, nz] = atlas.dims;
  const v = atlas.v ? `?v=${atlas.v}` : '';
  text.textContent = 'BT yükleniyor…';
  const [ctBuf, labBuf, ovBuf, lesBuf] = await Promise.all([
    fetchBin(`${dir}/ct.bin.gz${v}`, (got, total) => {
      text.textContent = total
        ? `BT yükleniyor… %${Math.min(100, Math.round((got / total) * 100))}`
        : `BT yükleniyor… ${(got / 1e6).toFixed(1)} MB`;
    }),
    fetchBin(`${dir}/labels.bin.gz${v}`),
    atlas.overlay ? fetchBin(`${dir}/${atlas.overlay.file}${v}`) : null,
    atlas.lesions ? fetchBin(`${dir}/${atlas.lesions.file}${v}`) : null,
  ]);
  ct = new Int16Array(ctBuf);
  lab = new Uint8Array(labBuf);
  if (ct.length !== nx * ny * nz || lab.length !== ct.length) throw new Error('Hacim boyutu atlas.json ile uyuşmuyor');
  if (lesBuf) {
    les = new Uint8Array(lesBuf);
    if (les.length !== ct.length) throw new Error('Lezyon hacmi boyutu uyuşmuyor');
  }
  if (ovBuf) {
    ov = new Uint8Array(ovBuf);
    if (ov.length !== ct.length) throw new Error('Katman hacmi boyutu uyuşmuyor');
    hiddenByOverlay = new Set(atlas.structures.filter((s) => atlas.overlay.hides.includes(s.key)).map((s) => s.id));
  }

  for (const s of atlas.structures) {
    structById[s.id] = s;
    rgbById[s.id] = hexToRgb(s.color);
  }
  for (const sys of atlas.systems) {
    systemName[sys.id] = sys.name;
    if (sys.default) state.systemsOn.add(sys.id);
  }

  const byKey = (k) => atlas.structures.find((s) => s.key === k);
  const anchor = byKey(atlas.start) || atlas.structures[0];
  if (atlas.win) {
    state.win = atlas.win.split(',').map(Number);
    $('windowSel').value = atlas.win;
  }
  $('eyebrow').textContent = atlas.eyebrow;
  if (atlas.lesions) {
    // Patoloji vakası: ilk açılışta en büyük lezyonun kesitleri
    Object.assign(state.slices, atlas.lesions.items[0].focus);
    $('lesToggle').hidden = false;
  }
  state.slices.axial = anchor.focus.axial;
  state.slices.coronal = anchor.focus.coronal;
  state.slices.sagittal = (byKey('aorta') || anchor).focus.sagittal;

  $('title').textContent = atlas.title;
  $('credit').innerHTML =
    `Veri: <a href="${atlas.sourceUrl || 'https://zenodo.org/records/10047292'}" target="_blank" rel="noopener">${atlas.source}</a>. ` +
    'Segmentasyonlar otomatik/yarı otomatiktir. Eğitim amaçlıdır, tanı için kullanılamaz.';

  readHash();
  buildSystems();
  buildList();
  buildDx();
  bindEvents();
  setPlane(state.plane, true);
  $('loading').hidden = true;
}

// ---------- Dil: yapı adları Türkçe, İngilizce veya Latince ----------

const LANGS = ['tr', 'en', 'la'];
try { state.lang = LANGS.includes(localStorage.getItem('btatlas.lang')) ? localStorage.getItem('btatlas.lang') : 'tr'; } catch { state.lang = 'tr'; }

// Latince adı olmayan yapılarda İngilizce'ye düşer
const nm = (s) => (state.lang === 'en' ? s.en : state.lang === 'la' ? s.la || s.en : s.tr);

function setLang(lang) {
  state.lang = lang;
  try { localStorage.setItem('btatlas.lang', lang); } catch { /* yoksay */ }
  document.querySelectorAll('#lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  buildList();
  buildDx();
  if (state.quiz) quizNew(); else render();
}

// ---------- Vaka seçimi ----------
// Vaka değişince sayfa yeniden yüklenir; veri vaka başına klasörde (data/<vaka>/)

let caseId = '';

function pickCase(cases) {
  const ids = cases.map((c) => c.id);
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('c');
  let saved = null;
  try { saved = localStorage.getItem('btatlas.case'); } catch { /* yoksay */ }
  return [fromHash, saved].find((id) => ids.includes(id)) || ids[0];
}

function buildCaseSelect(cases) {
  const sel = $('caseSel');
  sel.hidden = cases.length < 2;
  const cats = { saglikli: 'Sağlıklı anatomi', patoloji: 'Patoloji' };
  sel.innerHTML = Object.entries(cats)
    .map(([k, name]) => [name, cases.filter((c) => c.category === k)])
    .filter(([, list]) => list.length)
    .map(([name, list]) => `<optgroup label="${name}">${list.map((c) => `<option value="${c.id}">${c.title}</option>`).join('')}</optgroup>`)
    .join('');
  sel.value = caseId;
  sel.addEventListener('change', () => {
    try { localStorage.setItem('btatlas.case', sel.value); } catch { /* yoksay */ }
    location.hash = `c=${sel.value}`;
    location.reload();
  });
}

// ---------- Paylaşılabilir bağlantı ----------
// Durum URL'nin # kısmında: p=düzlem, s=kesit, y=yapı, sys=sistemler, z=yakınlaştırma, w=pencere

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (!q.size) return;
  const p = q.get('p');
  if (PLANE_TR[p]) state.plane = p;
  const s = parseInt(q.get('s'), 10);
  if (Number.isInteger(s)) state.slices[state.plane] = Math.max(0, Math.min(dimsOf(state.plane)[2] - 1, s));
  const st = atlas.structures.find((x) => x.key === q.get('y'));
  if (st) state.selected = st.id;
  if (q.has('sys')) {
    const ids = new Set(atlas.systems.map((x) => x.id));
    state.systemsOn = new Set(q.get('sys').split('.').filter((x) => ids.has(x)));
  }
  const l = parseInt(q.get('l'), 10);
  if (atlas.lesions && l >= 1 && l <= atlas.lesions.items.length) state.lesion = l;
  const z = parseFloat(q.get('z'));
  if (z >= 1 && z <= 8) state.zoom = z;
  const w = q.get('w');
  const opt = [...$('windowSel').options].find((o) => o.value === w);
  if (opt) { state.win = w.split(',').map(Number); $('windowSel').value = w; }
}

let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    if (state.quiz) return;
    const q = new URLSearchParams({ c: caseId, p: state.plane, s: state.slices[state.plane] });
    if (state.selected) q.set('y', structById[state.selected].key);
    if (state.lesion) q.set('l', state.lesion);
    q.set('sys', [...state.systemsOn].join('.'));
    if (state.zoom !== 1) q.set('z', state.zoom.toFixed(2));
    q.set('w', state.win.join(','));
    history.replaceState(null, '', `#${q}`);
  }, 250);
}

async function copyLink() {
  writeHash();
  await new Promise((r) => setTimeout(r, 300));
  const st = structById[state.selected];
  const [, , n] = dimsOf(state.plane);
  const v = sliderToSlice(state.plane, state.slices[state.plane]);
  const text = `${st ? `${nm(st)} · ` : ''}${PLANE_TR[state.plane]} ${v + 1}/${n} — BT Anatomi Atlası\n${location.href}`;
  const btn = $('shareBtn');
  try {
    await navigator.clipboard.writeText(text);
    btn.innerHTML = '✓<span class="lbl"> Kopyalandı</span>';
  } catch {
    prompt('Bağlantıyı kopyalayın:', text);
  }
  setTimeout(() => { btn.innerHTML = '🔗<span class="lbl"> Bağlantıyı kopyala</span>'; }, 1800);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------- Geometri ----------

// [genişlik, yükseklik, kesit sayısı, piksel aralığı u, piksel aralığı v]
function dimsOf(plane) {
  const [sx, sy, sz] = atlas.spacing;
  if (plane === 'axial') return [nx, ny, nz, sx, sy];
  if (plane === 'coronal') return [nx, nz, ny, sx, sz];
  return [ny, nz, nx, sy, sz];
}

// Ekran pikseli (u, v) -> bellek indeksi: base + u*du + v*dv
function strides(plane, s) {
  const P = nx * ny;
  if (plane === 'axial') return [s * P + (ny - 1) * nx + nx - 1, -1, -nx];
  if (plane === 'coronal') return [(nz - 1) * P + s * nx + nx - 1, -1, -P];
  return [(nz - 1) * P + (ny - 1) * nx + s, -nx, -P];
}

// Aksiyelde kaydırıcı yukarıdan aşağı ilerlesin (PACS alışkanlığı)
const sliderToSlice = (plane, v) => (plane === 'axial' ? nz - 1 - v : v);

function layout() {
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  const [w, h, , su, sv] = dimsOf(state.plane);
  const showLabels = state.labels && !state.quiz;
  const gutter = showLabels ? Math.min(200, Math.max(74, cw * 0.21)) : 14;
  const fit = Math.min(Math.max(60, cw - 2 * gutter) / (w * su), (ch - 28) / (h * sv));
  const k = fit * state.zoom;
  const dw = w * su * k;
  const dh = h * sv * k;
  return {
    cw, ch, w, h, dw, dh, gutter,
    ku: su * k,
    kv: sv * k,
    x0: (cw - dw) / 2 + state.pan[0],
    y0: (ch - dh) / 2 + state.pan[1],
  };
}

function screenToPixel(x, y) {
  const L = layout();
  const u = Math.floor((x - L.x0) / L.ku);
  const v = Math.floor((y - L.y0) / L.kv);
  if (u < 0 || v < 0 || u >= L.w || v >= L.h) return null;
  return [u, v];
}

// ---------- Görünürlük ----------

const overlayOn = () => Boolean(ov) && state.systemsOn.has(atlas.overlay.system);

// Sistemi açık ve katman tarafından gizlenmemiş yapı
const isEnabled = (s) => state.systemsOn.has(s.system) && !state.hidden.has(s.id) && !(overlayOn() && hiddenByOverlay.has(s.id));

function visibleTable() {
  const vis = new Uint8Array(atlas.structures.length + 1);
  if (state.quiz) {
    vis[state.quiz.target.id] = 1;
    return vis;
  }
  for (const s of atlas.structures) if (isEnabled(s)) vis[s.id] = 1;
  return vis;
}

// ---------- Çizim ----------

function renderSlice() {
  const [w, h] = dimsOf(state.plane);
  const s = state.slices[state.plane];
  if (off.width !== w || off.height !== h) {
    off.width = w;
    off.height = h;
  }
  const [base, du, dv] = strides(state.plane, s);
  const [W, L] = state.win;
  const lo = L - W / 2;
  const scale = 255 / W;
  const n = w * h;
  const gray = new Uint8ClampedArray(n);
  sliceLabels = new Uint8Array(n);
  sliceArea = new Uint32Array(atlas.structures.length + 1);
  const useOv = overlayOn();
  const showLes = Boolean(les) && state.lesOn && !state.quiz;
  sliceLes = new Uint8Array(showLes ? n : 0);
  sliceLesArea = new Uint32Array(showLes ? atlas.lesions.items.length + 1 : 0);
  for (let v = 0, p = 0; v < h; v++) {
    let idx = base + v * dv;
    for (let u = 0; u < w; u++, p++, idx += du) {
      gray[p] = (ct[idx] - lo) * scale;
      const l = (useOv && ov[idx]) || lab[idx];
      sliceLabels[p] = l;
      sliceArea[l]++;
      if (showLes) {
        const q = les[idx];
        sliceLes[p] = q;
        sliceLesArea[q]++;
      }
    }
  }

  const vis = visibleTable();
  const sel = state.quiz ? state.quiz.target.id : state.selected;
  const fillA = state.quiz ? 0.55 : state.opacity;
  const img = offCtx.createImageData(w, h);
  const px = img.data;
  for (let v = 0, p = 0; v < h; v++) {
    for (let u = 0; u < w; u++, p++) {
      const g = gray[p];
      const l = sliceLabels[p];
      let r = g, gg = g, b = g;
      if (l && vis[l]) {
        const edge = state.outline && (
          (u > 0 && sliceLabels[p - 1] !== l) || (u < w - 1 && sliceLabels[p + 1] !== l) ||
          (v > 0 && sliceLabels[p - w] !== l) || (v < h - 1 && sliceLabels[p + w] !== l));
        let a;
        if (edge) a = sel && l !== sel ? 0.45 : 0.95;
        else if (!sel) a = fillA;
        else a = l === sel ? Math.max(0.6, fillA + 0.2) : fillA * 0.3;
        const c = rgbById[l];
        r = g + (c[0] - g) * a;
        gg = g + (c[1] - g) * a;
        b = g + (c[2] - g) * a;
      }
      if (showLes && sliceLes[p]) {
        // Lezyon: yapıların üstünde kırmızı dolgu; seçili lezyonun konturu beyaz
        const q = sliceLes[p];
        const edge = (u > 0 && sliceLes[p - 1] !== q) || (u < w - 1 && sliceLes[p + 1] !== q) ||
          (v > 0 && sliceLes[p - w] !== q) || (v < h - 1 && sliceLes[p + w] !== q);
        if (edge && q === state.lesion) {
          r = 255; gg = 255; b = 255;
        } else {
          const a = edge ? 1 : (state.lesion && q !== state.lesion ? 0.5 : 0.8);
          r += (235 - r) * a;
          gg += (30 - gg) * a;
          b += (50 - b) * a;
        }
      }
      const o = p * 4;
      px[o] = r;
      px[o + 1] = gg;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
  }
  offCtx.putImageData(img, 0, 0);
}

// Dar ekranda görüntüleyici yüksekliğini kesitin en-boy oranına uydur (boş siyah alanı azaltır)
function fitViewerHeight() {
  const viewer = $('viewer');
  if (window.innerWidth >= 900) {
    viewer.style.height = '';
    return;
  }
  const [w, h, , su, sv] = dimsOf(state.plane);
  const L = layout();
  const imgW = Math.max(60, L.cw - 2 * L.gutter);
  const want = Math.round(Math.min(window.innerHeight * 0.72, Math.max(240, (imgW * h * sv) / (w * su) + 60)));
  if (Math.abs(viewer.clientHeight - want) > 2) viewer.style.height = `${want}px`;
}

function draw() {
  fitViewerHeight();
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  const L = layout();
  ctx.imageSmoothingEnabled = L.ku < 4;
  ctx.drawImage(off, L.x0, L.y0, L.dw, L.dh);
  labelHits = [];
  if (state.labels && !state.quiz) drawLabels(L);
}

function ellipsize(text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function drawLabels(L) {
  const s = state.slices[state.plane];
  const vis = visibleTable();
  const entries = (atlas.anchors[state.plane][s] || []).filter(([id]) => vis[id]);
  if (!entries.length) return;
  const fontPx = L.cw < 520 ? 10 : 12;
  const lh = fontPx + 6;
  ctx.font = `500 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';

  const pts = entries.map(([id, u, v]) => ({
    id,
    x: L.x0 + (u + 0.5) * L.ku,
    y: L.y0 + (v + 0.5) * L.kv,
    area: sliceArea[id],
  })).filter((p) => p.x > -20 && p.x < L.cw + 20 && p.y > -20 && p.y < L.ch + 20);

  const mid = L.x0 + L.dw / 2;
  const maxN = Math.max(1, Math.floor((L.ch - 16) / lh));
  const colW = Math.max(60, L.gutter - 14);
  const sides = [
    { pts: pts.filter((p) => p.x < mid), left: true },
    { pts: pts.filter((p) => p.x >= mid), left: false },
  ];

  for (const side of sides) {
    let col = side.pts
      .sort((a, b) => (b.id === state.selected) - (a.id === state.selected) || b.area - a.area)
      .slice(0, maxN)
      .sort((a, b) => a.y - b.y);
    // Üst üste binmeyi önle: önce aşağı, taşarsa yukarı it
    let y = 8 + lh / 2;
    for (const p of col) { p.ly = Math.max(p.y, y); y = p.ly + lh; }
    y = L.ch - 8 - lh / 2;
    for (let i = col.length - 1; i >= 0; i--) { col[i].ly = Math.min(col[i].ly, y); y = col[i].ly - lh; }

    for (const p of col) {
      const st = structById[p.id];
      const text = ellipsize(nm(st), colW);
      const tw = ctx.measureText(text).width;
      const tx = side.left
        ? Math.max(6, Math.min(L.x0 - 12, L.gutter - 6) - tw)
        : Math.min(L.cw - tw - 6, Math.max(L.x0 + L.dw + 12, L.cw - L.gutter + 6));
      const lineX = side.left ? tx + tw + 4 : tx - 4;
      const isSel = p.id === state.selected;
      const dim = state.selected && !isSel;
      const c = st.color;

      ctx.globalAlpha = dim ? 0.45 : 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = isSel ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(lineX, p.ly);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSel ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = isSel ? c : 'rgba(0,0,0,.6)';
      ctx.fillRect(tx - 3, p.ly - lh / 2 + 1, tw + 6, lh - 2);
      ctx.fillStyle = isSel ? '#0b0d10' : c;
      ctx.fillText(text, tx, p.ly + 0.5);
      ctx.globalAlpha = 1;
      labelHits.push({ id: p.id, x: tx - 3, y: p.ly - lh / 2, w: tw + 6, h: lh });
    }
  }
}

function render() {
  renderSlice();
  draw();
  updateSliceInfo();
  updateListPresence();
  updateInfo();
  updateDx();
  writeHash();
}

// ---------- Arayüz ----------

function updateSliceInfo() {
  const [, , n] = dimsOf(state.plane);
  const s = state.slices[state.plane];
  const v = sliderToSlice(state.plane, s);
  const slider = $('slider');
  slider.max = n - 1;
  slider.value = v;
  $('sliceInfo').textContent = `${PLANE_TR[state.plane]} ${v + 1} / ${n}`;
  const [w, h] = dimsOf(state.plane);
  $('planeInfo').textContent = `${PLANE_TR[state.plane].toLocaleUpperCase('tr')} · ${w}×${h} · ${atlas.spacing[0]} mm`;
  $('zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
}

function setPlane(plane, keepSlice = false) {
  state.plane = plane;
  state.pan = [0, 0];
  if (state.selected && !state.quiz && !keepSlice) state.slices[plane] = structById[state.selected].focus[plane];
  document.querySelectorAll('#planes button').forEach((b) => b.classList.toggle('on', b.dataset.plane === plane));
  const [t, b, l, r] = ORIENT[plane];
  $('oTop').textContent = t;
  $('oBottom').textContent = b;
  $('oLeft').textContent = l;
  $('oRight').textContent = r;
  if (state.quiz) quizNew(); else render();
}

function setSlice(s) {
  const [, , n] = dimsOf(state.plane);
  s = Math.max(0, Math.min(n - 1, s));
  if (s === state.slices[state.plane]) return;
  state.slices[state.plane] = s;
  render();
}

// Kaydırıcı yönünde bir adım (aksiyelde aşağı = kaudal)
function step(delta) {
  const s = state.slices[state.plane];
  setSlice(state.plane === 'axial' ? s - delta : s + delta);
}

function select(id, { focus = false } = {}) {
  state.selected = id;
  if (id) {
    const st = structById[id];
    state.hidden.delete(id);
    if (!state.systemsOn.has(st.system)) state.systemsOn.add(st.system);
    // Katmanın gizlediği yapı (ör. bütün karaciğer) seçilirse katmanı kapat
    if (overlayOn() && hiddenByOverlay.has(id)) state.systemsOn.delete(atlas.overlay.system);
    syncSystems();
    if (focus) state.slices[state.plane] = st.focus[state.plane];
  }
  render();
  if (id) {
    const el = document.querySelector(`.item[data-id="${id}"]`);
    el?.closest('details')?.setAttribute('open', '');
    el?.scrollIntoView({ block: 'nearest' });
  }
}

function buildSystems() {
  const wrap = $('systems');
  wrap.innerHTML = '';
  for (const sys of atlas.systems) {
    const members = atlas.structures.filter((s) => s.system === sys.id);
    if (!members.length) continue;
    const colors = [...new Set(members.map((m) => m.color))].slice(0, 4);
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.sys = sys.id;
    b.style.setProperty('--c', colors[0]);
    b.innerHTML = `<span class="dots">${colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${sys.name}`;
    b.title = `${members.length} yapı`;
    b.addEventListener('click', () => {
      if (state.systemsOn.has(sys.id)) state.systemsOn.delete(sys.id); else state.systemsOn.add(sys.id);
      if (state.selected && !isEnabled(structById[state.selected])) state.selected = 0;
      syncSystems();
      if (state.quiz) quizNew(); else render();
    });
    wrap.appendChild(b);
  }
  syncSystems();
}

function syncSystems() {
  document.querySelectorAll('.chip').forEach((c) => {
    const on = state.systemsOn.has(c.dataset.sys);
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', on);
  });
  document.querySelectorAll('.item').forEach((el) => {
    const st = structById[+el.dataset.id];
    el.classList.toggle('off', !isEnabled(st));
    el.classList.toggle('hid', state.hidden.has(st.id));
  });
}

const norm = (t) => t.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

function itemRow(s) {
  const row = document.createElement('div');
  row.className = 'item';
  row.dataset.id = s.id;
  row.dataset.q = norm(`${s.tr} ${s.en} ${s.la || ''} ${s.key}`);
  row.innerHTML =
    `<span class="dot" style="background:${s.color}"></span><button class="iname">${nm(s)}</button>` +
    '<span class="here"></span><button class="eye" aria-label="Göster / gizle" title="Göster / gizle">👁</button>';
  row.querySelector('.iname').addEventListener('click', () => {
    if (state.quiz) return;
    select(s.id, { focus: true });
  });
  row.querySelector('.eye').addEventListener('click', () => toggleHidden([s.id]));
  return row;
}

// Yapıları tek tek (ya da grup halinde) gizle/göster; hepsi gizliyse hepsini göster
function toggleHidden(ids) {
  if (state.quiz) return;
  const allHidden = ids.every((id) => state.hidden.has(id));
  for (const id of ids) { if (allHidden) state.hidden.delete(id); else state.hidden.add(id); }
  if (state.selected && !isEnabled(structById[state.selected])) state.selected = 0;
  syncSystems();
  render();
}

// Sistem -> alt grup -> yapı; tek üyeli gruplar düz listelenir
function buildList() {
  const list = $('list');
  list.innerHTML = '';
  for (const sys of atlas.systems) {
    const members = atlas.structures.filter((s) => s.system === sys.id);
    if (!members.length) continue;
    const title = document.createElement('div');
    title.className = 'group-title';
    title.dataset.sys = sys.id;
    title.textContent = sys.name;
    list.appendChild(title);
    const groups = new Map();
    for (const s of members) {
      const g = s.group && members.filter((m) => m.group === s.group).length > 1 ? s.group : '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }
    for (const [g, items] of groups) {
      let host = list;
      if (g) {
        host = document.createElement('details');
        host.className = 'grp';
        host.innerHTML = `<summary><span class="gname">${g}</span><span class="gcount"></span><button class="eye" aria-label="Grubu göster / gizle" title="Grubu göster / gizle">👁</button></summary>`;
        host.querySelector('.eye').addEventListener('click', (e) => {
          e.preventDefault();
          toggleHidden(items.map((i) => i.id));
        });
        list.appendChild(host);
      }
      for (const s of items) host.appendChild(itemRow(s));
    }
  }
  syncSystems();
}

function updateListPresence() {
  const q = norm(state.search.trim());
  const visibleSys = new Set();
  document.querySelectorAll('.item').forEach((el) => {
    const id = +el.dataset.id;
    // Test modunda "bu kesitte" bilgisi cevabı ele verir
    const here = !state.quiz && sliceArea[id] > 0;
    el.classList.toggle('absent', !state.quiz && !here);
    el.classList.toggle('sel', id === state.selected);
    el.querySelector('.here').textContent = here ? '●' : '';
    const show = (!q || el.dataset.q.includes(q)) && (!state.onlySlice || here);
    el.hidden = !show;
    if (show) visibleSys.add(structById[id].system);
  });
  document.querySelectorAll('.grp').forEach((d) => {
    const items = [...d.querySelectorAll('.item')];
    const shown = items.filter((el) => !el.hidden);
    d.hidden = !shown.length;
    d.querySelector('.gcount').textContent = shown.length;
    d.classList.toggle('hid', items.every((el) => el.classList.contains('hid')));
    if (q && shown.length) d.open = true;
  });
  document.querySelectorAll('.group-title').forEach((t) => { t.hidden = !visibleSys.has(t.dataset.sys); });
}

// "Etiket: metin" satırlarında etiketi kalın yazar; satırlar \n ile ayrılır
function noteHtml(note) {
  return note.split('\n').map((line) => line.replace(/^([^:]{2,20}):/, '<b>$1:</b>')).join('<br>');
}

function updateInfo() {
  const box = $('info');
  if (state.quiz) {
    box.className = 'info empty';
    box.textContent = 'Test modunda yapı adları gizlidir.';
    return;
  }
  const st = structById[state.selected];
  if (!st) {
    box.className = 'info empty';
    box.textContent = 'Görüntüde bir yapıya veya etikete dokunun.';
    return;
  }
  const here = sliceArea[st.id] > 0;
  box.className = 'info';
  box.innerHTML = `
    <div class="name"><span class="swatch" style="background:${st.color}"></span>${nm(st)}</div>
    ${[...new Set([st.tr, st.en, st.la].filter((x) => x && x !== nm(st)))].map((x) => `<div class="en${x === st.la ? ' la' : ''}">${x}</div>`).join('')}
    ${st.note ? `<p class="note">${noteHtml(st.note)}</p>` : ''}
    <div class="meta">
      <span class="tag">${systemName[st.system]}</span>
      <span class="tag">~${st.volumeMl} mL</span>
      <span class="tag">${here ? 'Bu kesitte görünüyor' : 'Bu kesitte yok'}</span>
    </div>
    <div class="actions">
      ${['axial', 'coronal', 'sagittal'].map((p) => `<button class="btn small" data-go="${p}">${PLANE_LOC[p]} odakla</button>`).join('')}
      <button class="btn small" data-go="clear">Seçimi kaldır</button>
    </div>`;
  box.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.go === 'clear') return select(0);
    state.slices[b.dataset.go] = st.focus[b.dataset.go];
    if (b.dataset.go === state.plane) render(); else setPlane(b.dataset.go);
  }));
}

// ---------- Tanı kartı (patoloji vakaları) ----------

function selectLesion(id) {
  state.lesion = id;
  render();
  if (id) document.querySelector(`.les-item[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function goLesion(id) {
  const it = atlas.lesions.items[id - 1];
  for (const p of ['axial', 'coronal', 'sagittal']) state.slices[p] = it.focus[p];
  selectLesion(id);
}

function buildDx() {
  const card = $('dxCard');
  const dx = atlas.diagnosis;
  card.hidden = !dx;
  if (!dx) return;
  const list = (arr) => `<ul>${arr.map((t) => `<li>${t}</li>`).join('')}</ul>`;
  const main = state.lang === 'en' ? dx.en : state.lang === 'la' ? dx.la : dx.tr;
  const others = [dx.tr, dx.en, dx.la].filter((x) => x !== main);
  card.innerHTML = `
    <div class="caption dx-cap">PATOLOJİ · TANI</div>
    <div class="dx-name">${main}</div>
    ${others.map((x) => `<div class="en${x === dx.la ? ' la' : ''}">${x}</div>`).join('')}
    ${dx.draft ? '<span class="tag draft">Taslak · uzman onayı bekliyor</span>' : ''}
    <div class="caption">LEZYONLAR · ${atlas.lesions.items.length}</div>
    <div class="dx-les">${atlas.lesions.items.map((it) => `
      <button class="les-item" data-id="${it.id}"><span class="lname">● ${nm(it)}</span><span class="here"></span>
      <small>${it.volumeMl} mL · ${it.hu} HU · ${it.loc}</small></button>`).join('')}</div>
    <details open><summary>BT bulguları</summary>${list(dx.findings)}</details>
    <details><summary>Ayırıcı tanı</summary>${list(dx.ddx)}</details>
    <details><summary>Öğretici noktalar</summary>${list(dx.pearls)}</details>
    <p class="dx-note">${dx.note}</p>`;
  card.querySelectorAll('.les-item').forEach((b) => b.addEventListener('click', () => goLesion(+b.dataset.id)));
}

function updateDx() {
  if (!atlas.diagnosis) return;
  document.querySelectorAll('.les-item').forEach((b) => {
    const id = +b.dataset.id;
    b.classList.toggle('sel', id === state.lesion);
    b.querySelector('.here').textContent = sliceLesArea[id] > 0 ? 'bu kesitte' : '';
  });
}

// ---------- Etkileşim ----------

function showTooltip(x, y) {
  const tip = $('tooltip');
  const px = screenToPixel(x, y);
  if (!px) { tip.hidden = true; return; }
  const [w] = dimsOf(state.plane);
  const [u, v] = px;
  const [base, du, dv] = strides(state.plane, state.slices[state.plane]);
  const hu = ct[base + u * du + v * dv];
  const l = sliceLabels[v * w + u];
  const vis = visibleTable();
  const name = l && vis[l] && !state.quiz ? nm(structById[l]) : '';
  const q = sliceLes.length ? sliceLes[v * w + u] : 0;
  const lname = q ? `<b class="lesname">● ${nm(atlas.lesions.items[q - 1])}</b> ` : '';
  tip.innerHTML = `${lname}${name}<span class="hu">${hu} HU</span>`;
  tip.hidden = false;
  const vw = canvas.clientWidth;
  tip.style.left = `${Math.min(x + 14, vw - tip.offsetWidth - 6)}px`;
  tip.style.top = `${y + 14}px`;
}

function clickAt(x, y) {
  if (state.quiz) return;
  const hit = labelHits.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
  if (hit) return select(hit.id === state.selected ? 0 : hit.id);
  const px = screenToPixel(x, y);
  if (!px) return select(0);
  const [w] = dimsOf(state.plane);
  const q = sliceLes.length ? sliceLes[px[1] * w + px[0]] : 0;
  if (q) return selectLesion(q === state.lesion ? 0 : q);
  const l = sliceLabels[px[1] * w + px[0]];
  const vis = visibleTable();
  select(l && vis[l] && l !== state.selected ? l : 0);
}

function zoomAt(factor, cx, cy) {
  const z = Math.max(0.5, Math.min(8, state.zoom * factor));
  const f = z / state.zoom;
  const W = canvas.clientWidth / 2;
  const H = canvas.clientHeight / 2;
  // İmlecin altındaki nokta sabit kalsın
  state.pan = [(state.pan[0] - (cx - W)) * f + (cx - W), (state.pan[1] - (cy - H)) * f + (cy - H)];
  state.zoom = z;
  draw();
  updateSliceInfo();
}

function bindEvents() {
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let wheelAcc = 0;

  const rel = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, rel(e));
    if (pointers.size === 1) {
      const [x, y] = rel(e);
      drag = { x0: x, y0: y, x, y, acc: 0, moved: false };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
      drag = null;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = rel(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [x, y]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(d / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pinch.d = d;
      return;
    }
    if (drag) {
      const dx = x - drag.x;
      const dy = y - drag.y;
      drag.x = x;
      drag.y = y;
      if (Math.hypot(x - drag.x0, y - drag.y0) > 5) drag.moved = true;
      if (!drag.moved) return;
      $('tooltip').hidden = true;
      if (state.tool === 'pan') {
        state.pan[0] += dx;
        state.pan[1] += dy;
        draw();
      } else {
        drag.acc += dy;
        const stepPx = 6;
        while (Math.abs(drag.acc) >= stepPx) {
          step(Math.sign(drag.acc));
          drag.acc -= Math.sign(drag.acc) * stepPx;
        }
      }
      return;
    }
    if (e.pointerType === 'mouse') showTooltip(x, y);
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && e.type === 'pointerup') clickAt(drag.x, drag.y);
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const [x, y] = rel(e);
      zoomAt(Math.exp(-e.deltaY * 0.0025), x, y);
      return;
    }
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    while (Math.abs(wheelAcc) >= 40) {
      step(Math.sign(wheelAcc));
      wheelAcc -= Math.sign(wheelAcc) * 40;
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input[type=search]')) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { step(1); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { step(-1); e.preventDefault(); }
    else if (e.key === '1') setPlane('axial');
    else if (e.key === '2') setPlane('coronal');
    else if (e.key === '3') setPlane('sagittal');
    else if (e.key === 'Escape') select(0);
  });

  $('slider').addEventListener('input', (e) => setSlice(sliderToSlice(state.plane, +e.target.value)));
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));

  document.querySelectorAll('#planes button').forEach((b) => b.addEventListener('click', () => setPlane(b.dataset.plane)));
  document.querySelectorAll('#tools button').forEach((b) => b.addEventListener('click', () => {
    state.tool = b.dataset.tool;
    document.querySelectorAll('#tools button').forEach((x) => x.classList.toggle('on', x === b));
    $('viewer').classList.toggle('pan', state.tool === 'pan');
  }));
  const center = () => [canvas.clientWidth / 2, canvas.clientHeight / 2];
  $('zoomIn').addEventListener('click', () => zoomAt(1.25, ...center()));
  $('zoomOut').addEventListener('click', () => zoomAt(0.8, ...center()));
  $('zoomLabel').addEventListener('click', () => { state.zoom = 1; state.pan = [0, 0]; draw(); updateSliceInfo(); });

  $('windowSel').addEventListener('change', (e) => { state.win = e.target.value.split(',').map(Number); render(); });
  $('labelsOn').addEventListener('change', (e) => { state.labels = e.target.checked; draw(); });
  $('outlineOn').addEventListener('change', (e) => { state.outline = e.target.checked; render(); });
  $('opacity').addEventListener('input', (e) => { state.opacity = +e.target.value / 100; render(); });
  $('onlySlice').addEventListener('change', (e) => { state.onlySlice = e.target.checked; updateListPresence(); });
  $('search').addEventListener('input', (e) => { state.search = e.target.value; updateListPresence(); });

  $('allOn').addEventListener('click', () => {
    atlas.systems.forEach((s) => state.systemsOn.add(s.id));
    syncSystems();
    if (state.quiz) quizNew(); else render();
  });
  $('allOff').addEventListener('click', () => {
    state.systemsOn.clear();
    state.selected = 0;
    syncSystems();
    if (state.quiz) quizExit(); else render();
  });

  $('quizBtn').addEventListener('click', () => (state.quiz ? quizExit() : quizStart()));
  $('quizExit').addEventListener('click', quizExit);
  $('quizNext').addEventListener('click', quizNext);
  $('quizExam').addEventListener('click', () => quizStart(true));
  $('shareBtn').addEventListener('click', copyLink);
  $('lesOn').addEventListener('change', (e) => { state.lesOn = e.target.checked; render(); });
  document.querySelectorAll('#lang button').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === state.lang);
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });

  new ResizeObserver(() => draw()).observe($('viewer'));
}

// ---------- Test modu ----------

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

const EXAM_LEN = 20;

// Zayıf noktalar: yapı anahtarı -> yanlış sayısı (yalnızca bu tarayıcıda saklanır)
function loadWeak() {
  try { return JSON.parse(localStorage.getItem('btatlas.weak')) || {}; } catch { return {}; }
}
function saveWeak(w) {
  try { localStorage.setItem('btatlas.weak', JSON.stringify(w)); } catch { /* özel pencere vb. */ }
}

// Ağırlıklı seçim: yanlış cevaplanan yapılar daha sık sorulur
function weightedPick(arr, weak) {
  const w = arr.map((s) => 1 + 3 * Math.min(weak[s.key] || 0, 3));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}

// Karıştırılması en kolay komşular: sağ/sol eşi ve bitişik omurga/kaburga
function lookalikes(s, pool) {
  const swap = s.key.replace(/_(left|right)\b/, (_, d) => (d === 'left' ? '_right' : '_left'))
    .replace(/^rib_(left|right)_/, (m, d) => `rib_${d === 'left' ? 'right' : 'left'}_`);
  const keys = new Set([swap]);
  const v = s.key.match(/^vertebrae_([CTL])(\d+)$/);
  if (v) { keys.add(`vertebrae_${v[1]}${+v[2] - 1}`); keys.add(`vertebrae_${v[1]}${+v[2] + 1}`); }
  return pool.filter((p) => p.id !== s.id && keys.has(p.key));
}

function quizStart(exam = false) {
  state.quiz = { score: 0, total: 0, exam, wrong: [] };
  state.selected = 0;
  $('quiz').hidden = false;
  $('quizBtn').innerHTML = '✕<span class="lbl"> Testi bitir</span>';
  quizNew();
}

function quizExit() {
  state.quiz = null;
  $('quiz').hidden = true;
  $('quizBtn').innerHTML = '🎯<span class="lbl"> Kendini test et</span>';
  render();
}

function quizNew() {
  const q = state.quiz;
  const anchors = atlas.anchors[state.plane];
  const pool = atlas.structures.filter(isEnabled);
  if (pool.length < 4) {
    $('quizOptions').innerHTML = '';
    $('quizFeedback').className = '';
    $('quizFeedback').textContent = 'Test için en az 4 yapı içeren sistemleri açın.';
    q.target = null;
    return;
  }
  // Yapının göründüğü kesitlerin orta yarısından birini seç (daha büyük kesit alanı)
  let target;
  let slices = [];
  const weak = loadWeak();
  while (!slices.length) {
    target = weightedPick(pool, weak);
    slices = [];
    anchors.forEach((entries, s) => { if (entries.some(([id]) => id === target.id)) slices.push(s); });
  }
  const a = Math.floor(slices.length * 0.25);
  const b = Math.max(a + 1, Math.ceil(slices.length * 0.75));
  state.slices[state.plane] = pick(slices.slice(a, b));
  state.pan = [0, 0];

  const same = shuffle(pool.filter((s) => s.id !== target.id && s.system === target.system));
  const other = shuffle(pool.filter((s) => s.id !== target.id && s.system !== target.system));
  const twins = shuffle(lookalikes(target, pool)).slice(0, 2);
  const rest = [...same, ...other].filter((s) => !twins.includes(s));
  const options = shuffle([target, ...[...twins, ...rest].slice(0, 3)]);

  Object.assign(q, { target, answered: false });
  const box = $('quizOptions');
  box.innerHTML = '';
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.textContent = nm(opt);
    btn.addEventListener('click', () => quizAnswer(opt, btn));
    box.appendChild(btn);
  }
  $('quizFeedback').textContent = '';
  $('quizFeedback').className = '';
  $('quizNext').hidden = true;
  $('quizScore').textContent = `${q.score} / ${q.total}`;
  render();
}

function quizAnswer(opt, btn) {
  const q = state.quiz;
  if (q.answered) return;
  q.answered = true;
  q.total++;
  const ok = opt.id === q.target.id;
  if (ok) q.score++; else q.wrong.push(nm(q.target));
  const weak = loadWeak();
  const k = q.target.key;
  weak[k] = ok ? Math.max(0, (weak[k] || 0) - 1) : (weak[k] || 0) + 1;
  if (!weak[k]) delete weak[k];
  saveWeak(weak);
  btn.classList.add(ok ? 'correct' : 'wrong');
  $('quizOptions').querySelectorAll('button').forEach((b) => {
    b.disabled = true;
    if (b.textContent === nm(q.target)) b.classList.add('correct');
  });
  const fb = $('quizFeedback');
  fb.className = ok ? 'ok' : 'bad';
  fb.textContent = ok ? 'Doğru! ✓' : `Yanlış — doğrusu: ${nm(q.target)}`;
  $('quizScore').textContent = q.exam ? `${q.score} / ${q.total} · ${EXAM_LEN} soru` : `${q.score} / ${q.total}`;
  const last = q.exam && q.total >= EXAM_LEN;
  $('quizNext').textContent = last ? 'Sonucu gör' : 'Sonraki →';
  $('quizNext').hidden = false;
}

function quizNext() {
  const q = state.quiz;
  if (q.exam && q.total >= EXAM_LEN) return quizResult();
  quizNew();
}

function quizResult() {
  const q = state.quiz;
  const wrong = [...new Set(q.wrong)];
  $('quizOptions').innerHTML = '';
  $('quizNext').hidden = true;
  $('quizFeedback').className = '';
  $('quizFeedback').textContent = `Sınav bitti: ${q.score} / ${EXAM_LEN} (%${Math.round((q.score / EXAM_LEN) * 100)})` +
    (wrong.length ? ` · Tekrar edilecekler: ${wrong.join(', ')}` : ' · Hepsi doğru!');
  const again = document.createElement('button');
  again.textContent = 'Yeni sınav';
  again.addEventListener('click', () => quizStart(true));
  $('quizOptions').appendChild(again);
}

load().catch((err) => {
  console.error(err);
  $('loadingText').textContent = `Yüklenemedi: ${err.message}`;
  document.querySelector('.spinner')?.remove();
  const retry = document.createElement('button');
  retry.className = 'btn small retry';
  retry.textContent = 'Yeniden dene';
  retry.addEventListener('click', () => location.reload());
  $('loading').appendChild(retry);
});

// Servis çalışanı: sürüm parametreli hacimleri önbelleğe alır (tekrar ziyaretlerde ~15 MB yeniden inmez)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* önbelleksiz de çalışır */ });
}
