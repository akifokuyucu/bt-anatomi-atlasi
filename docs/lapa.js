// Laparoskopik Anatomi Atlası — bağımlılıksız 2B kare görüntüleyici (prototip).
// Maskeler labels.bin.gz içinde [kare][y][x] uint8 bit maskesidir; yapı i (1'den) → bit (i-1) (build_lapa.py).
// Maskeler örtüşebilir; bir pikselde birden fazla yapı olabilir.

const $ = (id) => document.getElementById(id);
const LANGS = ['tr', 'en', 'la'];

const state = {
  frame: 0,
  hidden: new Set(),
  selected: 0,
  labels: true,
  outline: true,
  opacity: 0.35,
  lang: 'tr',
  quiz: null,
};

let atlas, W, H, bits;
let caseId = 'lapa01';
let structById = [];
let rgbById = [];
const images = [];
const stats = []; // kare başına: { area: Float32Array(yapı), anchor: {id: [x, y]} }

const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const ovc = document.createElement('canvas');
const ovCtx = ovc.getContext('2d');
let view = { s: 1, ox: 0, oy: 0 }; // görüntü pikseli → ekran (CSS pikseli)
let labelHits = [];

try { state.lang = LANGS.includes(localStorage.getItem('btatlas.lang')) ? localStorage.getItem('btatlas.lang') : 'tr'; } catch { state.lang = 'tr'; }
const nm = (s) => (state.lang === 'en' ? s.en : state.lang === 'la' ? s.la || s.en : s.tr);
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const pct = (a) => (a >= 0.005 ? `%${Math.round(a * 100)}` : a > 0 ? '<%1' : '–');

// ---------- Yükleme ----------

async function fetchBin(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  let blob = await res.blob();
  // Sunucu gzip'i zaten açmışsa ikinci kez açma
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  }
  return blob.arrayBuffer();
}

function loadImage(i) {
  if (images[i]) return images[i].ready;
  const img = new Image();
  img.decoding = 'async';
  img.src = `data/${caseId}/${atlas.frames[i].file}`;
  img.ready = img.decode().then(() => img);
  images[i] = img;
  return img.ready;
}

async function load() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.get('c')) caseId = q.get('c');
  try {
    const res = await fetch(`data/${caseId}/lapa.json`);
    if (!res.ok) throw new Error(`lapa.json: HTTP ${res.status}`);
    atlas = await res.json();
    [W, H] = atlas.size;
    bits = new Uint8Array(await fetchBin(`data/${caseId}/labels.bin.gz?v=${atlas.v}`));
    if (bits.length !== W * H * atlas.frames.length) throw new Error('Maske boyutu beklenenle uyuşmuyor');
  } catch (e) {
    $('loadingText').textContent = `Yüklenemedi: ${e.message}`;
    $('loading').querySelector('.spinner').hidden = true;
    return;
  }
  for (const s of atlas.structures) { structById[s.id] = s; rgbById[s.id] = hexRgb(s.color); }
  ovc.width = W; ovc.height = H;

  $('title').textContent = atlas.title;
  $('eyebrow').textContent = atlas.eyebrow;
  $('credit').innerHTML =
    `Görüntü ve maskeler: <a href="${atlas.sourceUrl}" target="_blank" rel="noopener">${atlas.source}</a>. ` +
    'BT bağlantıları: TotalSegmentator (CC BY 4.0). Yapı notları taslaktır, uzman onayı bekler. ' +
    'Eğitim amaçlıdır, tanı için kullanılamaz.';

  readHash();
  buildThumbs();
  bindEvents();
  await showFrame(state.frame);
  $('loading').hidden = true;
  // Diğer kareleri arka planda hazırla
  atlas.frames.forEach((_, i) => loadImage(i));
}

// ---------- Kare istatistikleri (alan ve etiket noktası) ----------

function frameStats(f) {
  if (stats[f]) return stats[f];
  const n = atlas.structures.length;
  const area = new Float32Array(n + 1);
  const base = f * W * H;
  for (let i = 0; i < W * H; i++) {
    const b = bits[base + i];
    if (!b) continue;
    for (let k = 0; k < n; k++) if (b & (1 << k)) area[k + 1]++;
  }
  for (let k = 1; k <= n; k++) area[k] /= W * H;
  stats[f] = { area, anchor: {} };
  return stats[f];
}

// Etiket noktası: kaba ızgarada yapının kenardan en uzak hücresi (aşındırmayla).
function anchorOf(f, id) {
  const st = frameStats(f);
  if (st.anchor[id]) return st.anchor[id];
  const step = 8;
  const gw = Math.ceil(W / step), gh = Math.ceil(H / step);
  const bit = 1 << (id - 1);
  const base = f * W * H;
  let g = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x = Math.min(W - 1, gx * step + step / 2), y = Math.min(H - 1, gy * step + step / 2);
      g[gy * gw + gx] = bits[base + y * W + x] & bit ? 1 : 0;
    }
  }
  let last = g;
  for (;;) {
    const next = new Uint8Array(gw * gh);
    let any = false;
    for (let gy = 1; gy < gh - 1; gy++) {
      for (let gx = 1; gx < gw - 1; gx++) {
        const i = gy * gw + gx;
        if (g[i] && g[i - 1] && g[i + 1] && g[i - gw] && g[i + gw]) { next[i] = 1; any = true; }
      }
    }
    if (!any) break;
    last = next;
    g = next;
  }
  // Kalan hücrelerin ağırlık merkezine en yakın olanı
  let sx = 0, sy = 0, c = 0;
  for (let i = 0; i < last.length; i++) if (last[i]) { sx += i % gw; sy += (i / gw) | 0; c++; }
  if (!c) return (st.anchor[id] = null);
  sx /= c; sy /= c;
  let best = -1, bd = Infinity;
  for (let i = 0; i < last.length; i++) {
    if (!last[i]) continue;
    const d = (i % gw - sx) ** 2 + (((i / gw) | 0) - sy) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  st.anchor[id] = [(best % gw) * step + step / 2, ((best / gw) | 0) * step + step / 2];
  return st.anchor[id];
}

// ---------- Çizim ----------

function visibleMask() {
  if (state.quiz) return 1 << (state.quiz.target - 1);
  let m = 0;
  for (const s of atlas.structures) if (!state.hidden.has(s.id)) m |= 1 << (s.id - 1);
  return m;
}

// Bit deseni → üstte çizilecek yapı: seçili yapı en üstte, sonra küçük alanlılar
function topLUT(f) {
  const { area } = frameStats(f);
  const order = atlas.structures.map((s) => s.id).sort((a, b) => area[a] - area[b]);
  if (state.selected) order.unshift(...order.splice(order.indexOf(state.selected), 1));
  const lut = new Uint8Array(256);
  for (let b = 1; b < 256; b++) lut[b] = order.find((id) => b & (1 << (id - 1))) || 0;
  return lut;
}

function drawOverlay() {
  const f = state.frame;
  const base = f * W * H;
  const vis = visibleMask();
  const lut = topLUT(f);
  const img = ovCtx.createImageData(W, H);
  const px = img.data;
  const fillA = Math.round(state.opacity * 255);
  const selA = Math.min(255, fillA + 70);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = bits[base + i] & vis;
      if (!b) continue;
      let id = lut[b];
      let a = id === state.selected || state.quiz ? selA : fillA;
      if (state.outline) {
        // Kenar: pikselde olan ama bir komşuda olmayan bitler
        const l = x > 0 ? bits[base + i - 1] : 0;
        const r = x < W - 1 ? bits[base + i + 1] : 0;
        const u = y > 0 ? bits[base + i - W] : 0;
        const d = y < H - 1 ? bits[base + i + W] : 0;
        const edge = b & ~(l & r & u & d);
        if (edge) { id = lut[edge]; a = 255; }
      }
      if (!a) continue;
      const [cr, cg, cb] = rgbById[id];
      const o = i * 4;
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = a;
    }
  }
  ovCtx.putImageData(img, 0, 0);
}

function render() {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const s = Math.min(cw / W, ch / H);
  view = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2 };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  const img = images[state.frame];
  if (img?.complete) ctx.drawImage(img, view.ox, view.oy, W * s, H * s);
  ctx.drawImage(ovc, view.ox, view.oy, W * s, H * s);
  drawLabels();
}

function drawLabels() {
  labelHits = [];
  if (!state.labels || state.quiz) return;
  const { area } = frameStats(state.frame);
  const ids = atlas.structures
    .map((s) => s.id)
    .filter((id) => area[id] > 0.004 && !state.hidden.has(id))
    .sort((a, b) => (b === state.selected) - (a === state.selected) || area[b] - area[a]);
  ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  for (const id of ids) {
    const p = anchorOf(state.frame, id);
    if (!p) continue;
    const text = nm(structById[id]);
    const w = ctx.measureText(text).width + 16, h = 22;
    const x = Math.round(view.ox + p[0] * view.s - w / 2), y = Math.round(view.oy + p[1] * view.s - h / 2);
    if (labelHits.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y)) continue;
    const sel = id === state.selected;
    ctx.fillStyle = sel ? structById[id].color : 'rgba(10, 12, 15, .82)';
    ctx.strokeStyle = structById[id].color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = sel ? '#111' : '#e7e9ee';
    ctx.fillText(text, x + 8, y + h / 2 + 0.5);
    labelHits.push({ x, y, w, h, id });
  }
}

function redraw() {
  drawOverlay();
  render();
}

// ---------- Kare değiştirme ----------

async function showFrame(i) {
  const n = atlas.frames.length;
  state.frame = Math.max(0, Math.min(n - 1, i));
  const fr = atlas.frames[state.frame];
  $('slider').max = n - 1;
  $('slider').value = state.frame;
  $('frameInfo').textContent = `Kare ${state.frame + 1} / ${n}`;
  $('frameMeta').textContent = `AMELİYAT ${fr.surgery} · KARE ${fr.frame}`;
  document.querySelectorAll('#thumbs button').forEach((b, k) => b.classList.toggle('on', k === state.frame));
  document.querySelector('#thumbs button.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  drawOverlay();
  render();
  buildList();
  showInfo();
  writeHash();
  await loadImage(state.frame);
  if (atlas.frames[state.frame] === fr) render();
}

function buildThumbs() {
  const wrap = $('thumbs');
  wrap.innerHTML = '';
  atlas.frames.forEach((fr, i) => {
    const b = document.createElement('button');
    b.style.backgroundImage = `url("data/${caseId}/${fr.file}")`;
    b.title = `Kare ${i + 1} · ameliyat ${fr.surgery}`;
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => { if (!state.quiz) showFrame(i); });
    wrap.appendChild(b);
  });
}

// ---------- Liste ve bilgi kartı ----------

function buildList() {
  const { area } = frameStats(state.frame);
  const list = $('list');
  list.innerHTML = '';
  const ids = atlas.structures.map((s) => s.id).sort((a, b) => area[b] - area[a]);
  for (const id of ids) {
    const s = structById[id];
    const el = document.createElement('div');
    el.className = 'item';
    el.dataset.id = id;
    el.classList.toggle('sel', id === state.selected);
    el.classList.toggle('absent', !area[id]);
    el.classList.toggle('off', state.hidden.has(id));
    el.innerHTML =
      `<span class="dot" style="background:${s.color}"></span>` +
      `<button class="iname">${nm(s)}</button>` +
      `<span class="pct" title="Karede kapladığı alan">${pct(area[id])}</span>` +
      `<button class="eye" title="Göster / gizle" aria-label="${nm(s)}: göster / gizle">${UI.eye()}</button>`;
    el.querySelector('.iname').addEventListener('click', () => select(id === state.selected ? 0 : id));
    el.querySelector('.eye').addEventListener('click', () => {
      state.hidden.has(id) ? state.hidden.delete(id) : state.hidden.add(id);
      buildList();
      redraw();
    });
    list.appendChild(el);
  }
}

function showInfo() {
  const info = $('info');
  const s = structById[state.selected];
  if (!s || state.quiz) {
    info.className = 'info empty';
    info.textContent = state.quiz ? 'Test sürüyor: vurgulanan yapıyı seçeneklerden bulun.' : 'Görüntüde bir yapıya veya listedeki bir ada dokunun.';
    return;
  }
  const { area } = frameStats(state.frame);
  const seen = atlas.frames.filter((fr) => fr.present.includes(s.id)).length;
  const note = (s.note || '').split('\n').filter(Boolean).map((line) => {
    const [h, ...rest] = line.split(': ');
    return rest.length ? `<p class="note"><b>${h}:</b> ${rest.join(': ')}</p>` : `<p class="note">${line}</p>`;
  }).join('');
  const ctLink = s.ct
    ? `<a class="btn small ctlink" href="atlas.html#c=${atlas.ctCase}&y=${s.ct}" title="Aynı yapıyı BT atlasında aç">BT'de göster →</a>`
    : '<span class="tag" title="Bu yapının BT atlasında ayrı bir maskesi yok">BT karşılığı yok</span>';
  info.className = 'info';
  info.innerHTML =
    `<div class="name"><span class="swatch" style="background:${s.color}"></span>${s.tr}</div>` +
    `<div class="en">${s.en}${s.la && s.la !== s.en ? ` · <span class="la">${s.la}</span>` : ''}</div>` +
    note +
    `<div class="meta"><span class="tag">Bu karede ${pct(area[s.id])}</span><span class="tag">${seen} / ${atlas.frames.length} karede</span><span class="tag draft">TASLAK NOT</span></div>` +
    `<div class="actions">${ctLink}<button class="btn small" id="nextWith">Görüldüğü sonraki kare ›</button></div>`;
  $('nextWith').addEventListener('click', () => {
    const n = atlas.frames.length;
    for (let k = 1; k < n; k++) {
      const j = (state.frame + k) % n;
      if (atlas.frames[j].present.includes(s.id)) { showFrame(j); return; }
    }
  });
}

function select(id) {
  state.selected = id;
  if (id) state.hidden.delete(id);
  buildList();
  showInfo();
  redraw();
  writeHash();
}

// ---------- Etkileşim ----------

function toImage(e) {
  const r = canvas.getBoundingClientRect();
  const cx = e.clientX - r.left, cy = e.clientY - r.top;
  const x = Math.floor((cx - view.ox) / view.s), y = Math.floor((cy - view.oy) / view.s);
  return { cx, cy, x, y, inside: x >= 0 && y >= 0 && x < W && y < H };
}

function idsAt(x, y) {
  const b = bits[state.frame * W * H + y * W + x] & visibleMask();
  return atlas.structures.map((s) => s.id).filter((id) => b & (1 << (id - 1)));
}

function showTip(p, ids) {
  const tip = $('tooltip');
  if (!ids.length || state.quiz) { tip.hidden = true; return; }
  tip.innerHTML = ids.map((id) => `<span style="color:${structById[id].color}">●</span> ${nm(structById[id])}`).join(' &nbsp; ');
  tip.hidden = false;
  const vw = canvas.clientWidth;
  const left = Math.min(Math.max(4, p.cx + 14), vw - tip.offsetWidth - 4);
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(4, p.cy - 30)}px`;
}

let tipTimer = 0;
function bindEvents() {
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const p = toImage(e);
    showTip(p, p.inside ? idsAt(p.x, p.y) : []);
  });
  canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; });
  canvas.addEventListener('click', (e) => {
    if (state.quiz) return;
    const p = toImage(e);
    const hit = labelHits.find((r) => p.cx >= r.x && p.cx <= r.x + r.w && p.cy >= r.y && p.cy <= r.y + r.h);
    const ids = p.inside ? idsAt(p.x, p.y) : [];
    // Örtüşen yapılarda art arda dokunuş sıradakine geçer
    let id = hit ? hit.id : 0;
    if (!id && ids.length) id = ids.includes(state.selected) ? ids[(ids.indexOf(state.selected) + 1) % ids.length] : ids[0];
    select(id);
    if (e.pointerType !== 'mouse' || e.detail === 0) {
      showTip(p, ids);
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => { $('tooltip').hidden = true; }, 1800);
    }
  });

  $('prev').addEventListener('click', () => !state.quiz && showFrame(state.frame - 1));
  $('next').addEventListener('click', () => !state.quiz && showFrame(state.frame + 1));
  $('slider').addEventListener('input', (e) => !state.quiz && showFrame(+e.target.value));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || state.quiz) return;
    if (e.key === 'ArrowLeft') showFrame(state.frame - 1);
    else if (e.key === 'ArrowRight') showFrame(state.frame + 1);
    else if (e.key === 'Escape') select(0);
  });

  $('labelsOn').addEventListener('change', (e) => { state.labels = e.target.checked; render(); });
  $('outlineOn').addEventListener('change', (e) => { state.outline = e.target.checked; redraw(); });
  $('opacity').addEventListener('input', (e) => { state.opacity = e.target.value / 100; redraw(); });
  $('allOn').addEventListener('click', () => { state.hidden.clear(); buildList(); redraw(); });
  $('allOff').addEventListener('click', () => {
    for (const s of atlas.structures) state.hidden.add(s.id);
    state.selected = 0;
    buildList(); showInfo(); redraw();
  });

  document.querySelectorAll('#lang button').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === state.lang);
    b.addEventListener('click', () => {
      state.lang = b.dataset.lang;
      try { localStorage.setItem('btatlas.lang', state.lang); } catch { /* yoksay */ }
      document.querySelectorAll('#lang button').forEach((x) => x.classList.toggle('on', x === b));
      buildList(); render();
      if (state.quiz) renderQuiz();
    });
  });

  $('shareBtn').addEventListener('click', copyLink);
  $('quizBtn').addEventListener('click', () => (state.quiz ? quizExit() : quizStart()));
  $('quizExit').addEventListener('click', quizExit);
  $('quizNext').addEventListener('click', quizAsk);

  new ResizeObserver(() => render()).observe($('viewer'));
}

// ---------- Paylaşılabilir bağlantı ----------
// Durum URL'nin # kısmında: c=vaka, f=kare (1'den), y=yapı

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const f = parseInt(q.get('f'), 10);
  if (f >= 1 && f <= atlas.frames.length) state.frame = f - 1;
  const st = atlas.structures.find((s) => s.key === q.get('y'));
  if (st) state.selected = st.id;
}

function writeHash() {
  if (state.quiz) return;
  const q = new URLSearchParams({ c: caseId, f: state.frame + 1 });
  if (state.selected) q.set('y', structById[state.selected].key);
  history.replaceState(null, '', `#${q}`);
}

async function copyLink() {
  writeHash();
  const btn = $('shareBtn');
  try {
    await navigator.clipboard.writeText(location.href);
    btn.innerHTML = UI.icon('check') + '<span class="lbl"> Kopyalandı</span>';
  } catch {
    btn.innerHTML = UI.icon('alert') + '<span class="lbl"> Kopyalanamadı</span>';
  }
  setTimeout(() => { btn.innerHTML = UI.icon('link') + '<span class="lbl"> Bağlantıyı kopyala</span>'; }, 1600);
}

// ---------- Kendini test et ----------
// Rastgele bir karede tek yapı vurgulanır; dört seçenekten doğru adı bulmak gerekir.

function quizStart() {
  state.quiz = { score: 0, total: 0, back: { frame: state.frame, selected: state.selected } };
  state.selected = 0;
  $('quiz').hidden = false;
  $('quizBtn').innerHTML = UI.icon('x') + '<span class="lbl"> Testi bitir</span>';
  quizAsk();
}

function quizExit() {
  const back = state.quiz?.back;
  state.quiz = null;
  $('quiz').hidden = true;
  $('quizBtn').innerHTML = UI.icon('target') + '<span class="lbl"> Kendini test et</span>';
  state.selected = back?.selected || 0;
  showFrame(back?.frame ?? state.frame);
}

function quizAsk() {
  const pool = [];
  atlas.frames.forEach((fr, f) => fr.present.forEach((id) => { if (frameStats(f).area[id] > 0.01) pool.push([f, id]); }));
  let pick;
  do { pick = pool[Math.floor(Math.random() * pool.length)]; }
  while (pool.length > 1 && state.quiz.last && pick[0] === state.quiz.last[0] && pick[1] === state.quiz.last[1]);
  const [f, target] = pick;
  const others = atlas.structures.map((s) => s.id).filter((id) => id !== target).sort(() => Math.random() - 0.5).slice(0, 3);
  Object.assign(state.quiz, { target, last: pick, options: [target, ...others].sort(() => Math.random() - 0.5), answered: false });
  $('quizNext').hidden = true;
  $('quizFeedback').textContent = '';
  $('quizFeedback').className = '';
  showFrame(f);
  renderQuiz();
}

function renderQuiz() {
  const z = state.quiz;
  $('quizScore').textContent = `${z.score} / ${z.total}`;
  const wrap = $('quizOptions');
  wrap.innerHTML = '';
  for (const id of z.options) {
    const b = document.createElement('button');
    b.textContent = nm(structById[id]);
    b.addEventListener('click', () => quizAnswer(id, b));
    wrap.appendChild(b);
  }
}

function quizAnswer(id, btn) {
  const z = state.quiz;
  if (z.answered) return;
  z.answered = true;
  z.total++;
  const ok = id === z.target;
  if (ok) z.score++;
  [...$('quizOptions').children].forEach((b, k) => {
    b.disabled = true;
    if (z.options[k] === z.target) b.classList.add('correct');
  });
  if (!ok) btn.classList.add('wrong');
  $('quizFeedback').textContent = ok ? 'Doğru!' : `Yanlış. Doğrusu: ${nm(structById[z.target])}`;
  $('quizFeedback').className = ok ? 'ok' : 'bad';
  $('quizScore').textContent = `${z.score} / ${z.total}`;
  $('quizNext').hidden = false;
}

load();
