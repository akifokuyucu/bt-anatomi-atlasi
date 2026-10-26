// Laparoskopik Video Atlası — video düz akar, filtre açılınca yapılar üstüne çizilir (prototip).
// Maskeler video.json içinde kare başına çokgenlerdir: frames[i] = [[yapı, [x, y, x, y, …]], …]
// (build_lapa_video.py). Maske karesi = round(videoZamanı × fps).

const $ = (id) => document.getElementById(id);
const LANGS = ['tr', 'en', 'la'];

const state = {
  shown: new Set(), // filtresi açık yapılar; boşsa video katmansız akar
  selected: 0,
  labels: true,
  outline: true,
  opacity: 0.4,
  lang: 'tr',
};

let data, W, H, N;
let caseId = 'lapav01';
let structById = [];
let order = []; // çizim sırası: organlar altta, aletler üstte
const cache = new Map(); // kare → Map(yapı → { path, area, anchor })
const presence = []; // yapı → görüldüğü kare sayısı
const labelPos = new Map(); // yapı → yumuşatılmış etiket konumu
let curFrame = -1;

const video = $('video');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const hitCtx = document.createElement('canvas').getContext('2d');
let view = { s: 1, ox: 0, oy: 0 };
let labelHits = [];

try { state.lang = LANGS.includes(localStorage.getItem('btatlas.lang')) ? localStorage.getItem('btatlas.lang') : 'tr'; } catch { state.lang = 'tr'; }
const nm = (s) => (state.lang === 'en' ? s.en : state.lang === 'la' ? s.la || s.en : s.name);
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => `rgba(${hexRgb(h).join(',')},${a})`;
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const frameAt = (t) => Math.max(0, Math.min(N - 1, Math.round(t * data.fps)));

// ---------- Yükleme ----------

async function load() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.get('c')) caseId = q.get('c');
  try {
    const res = await fetch(`data/${caseId}/video.json`);
    if (!res.ok) throw new Error(`video.json: HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    $('loadingText').textContent = `Yüklenemedi: ${e.message}`;
    $('loading').querySelector('.spinner').hidden = true;
    return;
  }
  W = data.w; H = data.h; N = data.frames.length;
  for (const s of data.structures) { structById[s.id] = s; presence[s.id] = 0; }
  order = data.structures.map((s) => s.id).sort((a, b) => (structById[a].group === 'alet') - (structById[b].group === 'alet'));
  for (const fr of data.frames) for (const [id] of fr) presence[id]++;
  $('viewer').style.aspectRatio = `${W} / ${H}`;

  $('title').textContent = data.title;
  $('eyebrow').textContent = data.eyebrow;
  const src = data.source;
  $('credit').innerHTML =
    `${src.text} <a href="${src.url}" target="_blank" rel="noopener">Wikimedia Commons</a> · ` +
    `<a href="https://doi.org/${src.doi}" target="_blank" rel="noopener">makale</a>. ` +
    `${data.note} BT bağlantıları: TotalSegmentator (CC BY 4.0). Eğitim amaçlıdır, tanı için kullanılamaz.`;

  readHash();
  buildFilters();
  buildList();
  showInfo();
  bindEvents();

  video.src = `data/${caseId}/${data.video}`;
  video.poster = `data/${caseId}/${data.poster}`;
  video.loop = true;
  await new Promise((ok, fail) => {
    video.addEventListener('loadeddata', ok, { once: true });
    video.addEventListener('error', () => fail(new Error('video açılamadı')), { once: true });
  }).catch((e) => { $('loadingText').textContent = `Yüklenemedi: ${e.message}`; throw e; });
  const t = parseFloat(q.get('t'));
  if (t > 0) video.currentTime = Math.min(t, video.duration - 0.05);
  $('loading').hidden = true;
  render();
  watchFrames();
  if (!(t > 0)) video.play().catch(() => {}); // sessiz video kendiliğinden oynayabilir
}

// ---------- Kare çokgenleri ----------

function frameShapes(f) {
  if (cache.has(f)) return cache.get(f);
  const m = new Map();
  for (const [id, polys] of data.frames[f]) {
    const path = new Path2D();
    let area = 0, big = null, bigA = 0;
    for (const p of polys) {
      path.moveTo(p[0], p[1]);
      let a = 0;
      for (let i = 2; i < p.length; i += 2) path.lineTo(p[i], p[i + 1]);
      path.closePath();
      for (let i = 0, n = p.length; i < n; i += 2) {
        const j = (i + 2) % n;
        a += p[i] * p[j + 1] - p[j] * p[i + 1];
      }
      a = Math.abs(a) / 2;
      area += a;
      if (a > bigA) { bigA = a; big = p; }
    }
    m.set(id, { path, area: area / (W * H), anchor: anchorOf(big) });
  }
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  cache.set(f, m);
  return m;
}

// Etiket noktası: en büyük çokgenin içinde, köşelerden en uzak ızgara noktası
function anchorOf(p) {
  if (!p) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
  }
  const poly = new Path2D();
  poly.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) poly.lineTo(p[i], p[i + 1]);
  poly.closePath();
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], bd = -1;
  for (let gy = 1; gy < 8; gy++) {
    for (let gx = 1; gx < 8; gx++) {
      const x = x0 + ((x1 - x0) * gx) / 8, y = y0 + ((y1 - y0) * gy) / 8;
      if (!hitCtx.isPointInPath(poly, x, y)) continue;
      let d = Infinity;
      for (let i = 0; i < p.length; i += 2) d = Math.min(d, (p[i] - x) ** 2 + (p[i + 1] - y) ** 2);
      if (d > bd) { bd = d; best = [x, y]; }
    }
  }
  return best;
}

// ---------- Çizim ----------

function render() {
  if (!data) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const s = Math.min(cw / W, ch / H);
  view = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2 };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  labelHits = [];
  const f = frameAt(video.currentTime);
  $('frameMeta').textContent = `MASKE ${f + 1} / ${N}`;
  if (!state.shown.size) return;

  const shapes = frameShapes(f);
  const ids = order.filter((id) => state.shown.has(id) && shapes.has(id));
  if (state.selected && ids.includes(state.selected)) ids.push(...ids.splice(ids.indexOf(state.selected), 1));
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * view.ox, dpr * view.oy);
  ctx.lineJoin = 'round';
  for (const id of ids) {
    const st = structById[id];
    const sel = id === state.selected;
    ctx.fillStyle = rgba(st.color, Math.min(0.9, state.opacity + (sel ? 0.2 : 0)));
    ctx.fill(shapes.get(id).path);
    if (state.outline || sel) {
      ctx.strokeStyle = st.color;
      ctx.lineWidth = (sel ? 3 : 2) / s;
      ctx.stroke(shapes.get(id).path);
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLabels(shapes, ids);
}

function drawLabels(shapes, ids) {
  if (!state.labels) return;
  const smooth = !video.paused;
  ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  for (const id of [...ids].reverse()) {
    const { anchor, area } = shapes.get(id);
    if (!anchor || area < 0.006) { labelPos.delete(id); continue; }
    // Oynarken etiket kareden kareye zıplamasın
    const prev = labelPos.get(id);
    const p = smooth && prev ? [prev[0] + (anchor[0] - prev[0]) * 0.25, prev[1] + (anchor[1] - prev[1]) * 0.25] : anchor;
    labelPos.set(id, p);
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

// Her video karesinde katmanı yeniden çiz (requestVideoFrameCallback yoksa rAF)
function watchFrames() {
  const tick = () => {
    const f = frameAt(video.currentTime);
    if (f !== curFrame || !video.paused) { curFrame = f; render(); }
    updateTime();
  };
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const loop = () => { tick(); video.requestVideoFrameCallback(loop); };
    video.requestVideoFrameCallback(loop);
  } else {
    const loop = () => { if (!video.paused) tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  // Yedek: kare geri çağrısı gelmeyen durumlarda (gizli sekme, eski tarayıcı) saniyede ~4 kez
  video.addEventListener('timeupdate', tick);
  video.addEventListener('seeked', () => { labelPos.clear(); tick(); writeHash(); });
}

let seeking = false;
function updateTime() {
  const d = video.duration || data.dur;
  if (!seeking) $('seek').value = Math.round((video.currentTime / d) * 1000);
  $('time').textContent = `${clock(video.currentTime)} / ${clock(d)}`;
}

// ---------- Filtreler, liste, bilgi kartı ----------

function buildFilters() {
  const wrap = $('filters');
  wrap.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'chip';
  all.style.setProperty('--c', 'var(--accent)');
  all.dataset.id = 'all';
  all.innerHTML = `<span class="dots">${data.structures.map((s) => `<i style="background:${s.color}"></i>`).join('')}</span>Tüm yapılar`;
  all.addEventListener('click', () => setShown(state.shown.size === data.structures.length ? [] : data.structures.map((s) => s.id)));
  wrap.appendChild(all);
  for (const s of data.structures) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.id = s.id;
    b.style.setProperty('--c', s.color);
    b.innerHTML = `<span class="dots"><i style="background:${s.color}"></i></span><span class="cname">${nm(s)}</span>`;
    b.addEventListener('click', () => toggle(s.id));
    wrap.appendChild(b);
  }
  syncFilters();
}

function syncFilters() {
  document.querySelectorAll('#filters .chip').forEach((b) => {
    const on = b.dataset.id === 'all' ? state.shown.size === data.structures.length : state.shown.has(+b.dataset.id);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
}

function setShown(ids) {
  state.shown = new Set(ids);
  if (!state.shown.has(state.selected)) state.selected = 0;
  syncFilters(); buildList(); showInfo(); render(); writeHash();
}

function toggle(id) {
  const ids = new Set(state.shown);
  ids.has(id) ? ids.delete(id) : ids.add(id);
  setShown([...ids]);
}

function buildList() {
  const list = $('list');
  list.innerHTML = '';
  for (const s of data.structures) {
    const el = document.createElement('div');
    el.className = 'item';
    el.classList.toggle('sel', s.id === state.selected);
    el.classList.toggle('off', !state.shown.has(s.id));
    el.innerHTML =
      `<span class="dot" style="background:${s.color}"></span>` +
      `<button class="iname">${nm(s)}</button>` +
      `<span class="pct" title="Videoda görüldüğü süre">%${Math.round((presence[s.id] / N) * 100)}</span>` +
      `<button class="eye" title="Filtreyi aç / kapa" aria-label="${nm(s)}: filtreyi aç / kapa">${UI.eye()}</button>`;
    el.querySelector('.iname').addEventListener('click', () => select(s.id === state.selected ? 0 : s.id));
    el.querySelector('.eye').addEventListener('click', () => toggle(s.id));
    list.appendChild(el);
  }
}

function showInfo() {
  const info = $('info');
  const s = structById[state.selected];
  if (!s) {
    info.className = 'info empty';
    info.textContent = state.shown.size ? 'Videoda bir yapıya dokunun.' : 'Bir filtreyi açın, sonra videoda bir yapıya dokunun.';
    return;
  }
  const note = (s.note || '').split('\n').filter(Boolean).map((line) => {
    const [h, ...rest] = line.split(': ');
    return rest.length ? `<p class="note"><b>${h}:</b> ${rest.join(': ')}</p>` : `<p class="note">${line}</p>`;
  }).join('');
  const ctLink = s.ct
    ? `<a class="btn small ctlink" href="atlas.html#c=s0139&y=${s.ct}" title="Aynı yapıyı BT atlasında aç">BT'de göster →</a>`
    : '<span class="tag" title="Bu yapının BT atlasında karşılığı yok">BT karşılığı yok</span>';
  info.className = 'info';
  info.innerHTML =
    `<div class="name"><span class="swatch" style="background:${s.color}"></span>${s.name}</div>` +
    `<div class="en">${s.en}${s.la && s.la !== s.en ? ` · <span class="la">${s.la}</span>` : ''}</div>` +
    note +
    `<div class="meta"><span class="tag">Videonun %${Math.round((presence[s.id] / N) * 100)}'inde</span><span class="tag draft">TASLAK NOT</span></div>` +
    `<div class="actions">${ctLink}<button class="btn small" id="nextWith">Göründüğü sonraki an ›</button></div>`;
  $('nextWith').addEventListener('click', () => {
    // En az 1 sn ileride, yapının yeniden belirdiği ilk kare
    const f0 = frameAt(video.currentTime);
    const gap = Math.round(data.fps);
    for (let k = gap; k < N; k++) {
      const j = (f0 + k) % N;
      if (data.frames[j].some(([id]) => id === s.id)) { video.pause(); video.currentTime = j / data.fps; return; }
    }
  });
}

function select(id) {
  state.selected = id;
  if (id && !state.shown.has(id)) { setShown([...state.shown, id]); return; }
  buildList(); showInfo(); render(); writeHash();
}

// ---------- Etkileşim ----------

function toImage(e) {
  const r = canvas.getBoundingClientRect();
  const cx = e.clientX - r.left, cy = e.clientY - r.top;
  const x = (cx - view.ox) / view.s, y = (cy - view.oy) / view.s;
  return { cx, cy, x, y, inside: x >= 0 && y >= 0 && x < W && y < H };
}

// Noktadaki görünür yapılar, üstteki önce
function idsAt(x, y) {
  const shapes = frameShapes(frameAt(video.currentTime));
  return order.filter((id) => state.shown.has(id) && shapes.has(id) && hitCtx.isPointInPath(shapes.get(id).path, x, y)).reverse();
}

function showTip(p, ids) {
  const tip = $('tooltip');
  if (!ids.length) { tip.hidden = true; return; }
  tip.innerHTML = ids.map((id) => `<span style="color:${structById[id].color}">●</span> ${nm(structById[id])}`).join(' &nbsp; ');
  tip.hidden = false;
  const left = Math.min(Math.max(4, p.cx + 14), canvas.clientWidth - tip.offsetWidth - 4);
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(4, p.cy - 30)}px`;
}

function togglePlay() { video.paused ? video.play() : video.pause(); }

function step(d) {
  video.pause();
  video.currentTime = Math.max(0, Math.min(video.duration - 0.01, (frameAt(video.currentTime) + d) / data.fps));
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
    const p = toImage(e);
    const hit = labelHits.find((r) => p.cx >= r.x && p.cx <= r.x + r.w && p.cy >= r.y && p.cy <= r.y + r.h);
    const ids = p.inside ? idsAt(p.x, p.y) : [];
    // Yapıya dokunmak videoyu durdurup yapıyı seçer; boş yere dokunmak oynat/durdur
    let id = hit ? hit.id : 0;
    if (!id && ids.length) id = ids.includes(state.selected) ? ids[(ids.indexOf(state.selected) + 1) % ids.length] : ids[0];
    if (!id) { togglePlay(); return; }
    video.pause();
    select(id);
    if (e.pointerType !== 'mouse' || e.detail === 0) {
      showTip(p, ids);
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => { $('tooltip').hidden = true; }, 1800);
    }
  });

  video.addEventListener('play', () => { $('play').innerHTML = UI.icon('pause'); $('play').setAttribute('aria-label', 'Durdur'); });
  video.addEventListener('pause', () => { $('play').innerHTML = UI.icon('play'); $('play').setAttribute('aria-label', 'Oynat'); render(); writeHash(); });
  $('play').addEventListener('click', togglePlay);
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  $('seek').addEventListener('input', (e) => {
    seeking = true;
    video.currentTime = (e.target.value / 1000) * (video.duration || data.dur);
  });
  $('seek').addEventListener('change', () => { seeking = false; });
  document.querySelectorAll('#speed button').forEach((b) => b.addEventListener('click', () => {
    video.playbackRate = +b.dataset.r;
    document.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'f' || e.key === 'F') setShown(state.shown.size ? [] : data.structures.map((s) => s.id));
    else if (e.key === 'Escape') select(0);
  });

  $('labelsOn').addEventListener('change', (e) => { state.labels = e.target.checked; render(); });
  $('outlineOn').addEventListener('change', (e) => { state.outline = e.target.checked; render(); });
  $('opacity').addEventListener('input', (e) => { state.opacity = e.target.value / 100; render(); });
  $('allOn').addEventListener('click', () => setShown(data.structures.map((s) => s.id)));
  $('allOff').addEventListener('click', () => setShown([]));

  document.querySelectorAll('#lang button').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === state.lang);
    b.addEventListener('click', () => {
      state.lang = b.dataset.lang;
      try { localStorage.setItem('btatlas.lang', state.lang); } catch { /* yoksay */ }
      document.querySelectorAll('#lang button').forEach((x) => x.classList.toggle('on', x === b));
      buildFilters(); buildList(); render();
    });
  });

  $('shareBtn').addEventListener('click', copyLink);
  new ResizeObserver(() => render()).observe($('viewer'));
}

// ---------- Paylaşılabilir bağlantı ----------
// Durum URL'nin # kısmında: c=vaka, t=saniye, k=açık filtreler (virgülle), y=seçili yapı

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const byKey = (k) => data.structures.find((s) => s.key === k);
  const keys = (q.get('k') || '').split(',').map(byKey).filter(Boolean);
  state.shown = new Set(keys.map((s) => s.id));
  const st = byKey(q.get('y'));
  if (st) { state.selected = st.id; state.shown.add(st.id); }
}

function writeHash() {
  const q = new URLSearchParams({ c: caseId });
  if (video.paused && video.currentTime > 0) q.set('t', video.currentTime.toFixed(2));
  if (state.shown.size) q.set('k', data.structures.filter((s) => state.shown.has(s.id)).map((s) => s.key).join(','));
  if (state.selected) q.set('y', structById[state.selected].key);
  history.replaceState(null, '', `#${q.toString().replace(/%2C/g, ',')}`);
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

load();
