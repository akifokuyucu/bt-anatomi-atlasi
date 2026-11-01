// Sayfa geçişi perdesi: noise sınırlı, alttan yukarı kapanan/açılan tam ekran perde.
// Fikir: Codrops noise-transition (mohAmineBrs, MIT); burada kütüphanesiz, saf WebGL ve yalnızca geçiş sırasında çalışır.
// Renkler sayfanın --bg ve --accent değişkenlerinden gelir, açık/koyu temaya uyar.
// WebGL yoksa kapat() false döner ve çağıran normal gezinir.

const VERT = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
const FRAG = `precision mediump float;
varying vec2 uv;
uniform float u_p, u_open, u_time, u_aspect;
uniform vec3 u_bg, u_accent;
float h(vec2 i){return fract(sin(dot(i,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 q=vec2(uv.x*u_aspect,uv.y)*vec2(3.5,2.)+vec2(u_time*.4,0.);
  float nz=.6*n(q)+.4*n(q*2.3+7.);
  float f=uv.y*.72+nz*.28;
  f=mix(f,1.-f,u_open);
  float t=mix(u_p*1.4-.2,1.2-u_p*1.4,u_open);
  float cover=1.-smoothstep(t-.02,t,f);
  float band=(1.-smoothstep(t+.025,t+.07,f))*step(t-.02,f);
  gl_FragColor=vec4(mix(u_accent,u_bg,cover)*max(cover,band),max(cover,band));
}`;

// CSS değişkenini (ör. --bg) [0..1] RGB'ye çevirir
function renk(ad, yedek) {
  const el = document.createElement('i');
  el.style.color = `var(${ad}, ${yedek})`;
  document.documentElement.appendChild(el);
  const m = getComputedStyle(el).color.match(/[\d.]+/g) || [];
  el.remove();
  return m.length >= 3 ? m.slice(0, 3).map((v) => +v / 255) : [0, 0, 0];
}

function kur() {
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:200;pointer-events:none';
  const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const derle = (tur, kod) => { const s = gl.createShader(tur); gl.shaderSource(s, kod); gl.compileShader(s); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, derle(gl.VERTEX_SHADER, VERT));
  gl.attachShader(pr, derle(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (ad) => gl.getUniformLocation(pr, ad);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // mobilde pil ve ısı
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  gl.viewport(0, 0, cv.width, cv.height);
  gl.uniform3fv(u('u_bg'), renk('--bg', '#08090c'));
  gl.uniform3fv(u('u_accent'), renk('--accent', '#e8bb5a'));
  gl.uniform1f(u('u_aspect'), innerWidth / innerHeight);
  document.body.appendChild(cv);
  return { cv, gl, pu: u('u_p'), ou: u('u_open'), tu: u('u_time') };
}

let sahne = null;
const temizle = () => { sahne?.cv.remove(); sahne = null; };

// p: 0→1 ilerler. acik=0: perde kapanır (sayfa örtülür), acik=1: perde açılır (sayfa görünür)
function oyna(acik, ms) {
  return new Promise((bitti) => {
    const { gl, pu, ou, tu } = sahne;
    gl.uniform1f(ou, acik);
    const t0 = performance.now();
    (function adim(now) {
      const t = Math.min((now - t0) / ms, 1);
      gl.uniform1f(pu, t * (2 - t)); // easeQuadOut
      gl.uniform1f(tu, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      t < 1 ? requestAnimationFrame(adim) : bitti();
    })(t0);
  });
}

// Eski sayfada: perdeyi kapat. false dönerse perde yok, normal gezin.
export async function kapat() {
  temizle();
  sahne = kur();
  if (!sahne) return false;
  await oyna(0, 650);
  return true;
}

// Verisi geç gelen sayfalarda (<html data-perde-bekle>) perde veri gelene kadar kapalı kalır ve yüzde gösterir.
// Sayfa 'btatlas:ilerleme' (detail: 0..100) ve 'btatlas:hazir' olaylarını gönderir; en geç 10 sn beklenir.
function veriBekle() {
  return new Promise((bitti) => {
    const kok = document.documentElement;
    if (!kok.hasAttribute('data-perde-bekle') || kok.dataset.perdeHazir) return bitti();
    const sayac = document.createElement('div');
    sayac.setAttribute('aria-hidden', 'true');
    sayac.style.cssText = 'position:fixed;inset:0;z-index:201;display:grid;place-content:center;justify-items:center;gap:6px;pointer-events:none;color:var(--accent,#e8bb5a);font-family:var(--serif,Georgia,serif)';
    const yuzdeEl = document.createElement('div');
    yuzdeEl.style.cssText = 'font-size:clamp(56px,14vw,120px);line-height:1;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums';
    const alt = document.createElement('div');
    alt.textContent = 'Atlas yükleniyor';
    alt.style.cssText = 'font:12px var(--mono,monospace);letter-spacing:.14em;text-transform:uppercase;opacity:.7';
    sayac.append(yuzdeEl, alt);
    document.body.appendChild(sayac);
    const yaz = (y) => { yuzdeEl.textContent = `%${y ?? 0}`; };
    yaz(window.btatlasIlerleme);
    const ilerle = (e) => yaz(e.detail);
    const son = () => {
      removeEventListener('btatlas:ilerleme', ilerle);
      clearTimeout(zaman);
      yaz(100);
      setTimeout(() => { sayac.remove(); bitti(); }, 220); // %100 bir an görünsün
    };
    const zaman = setTimeout(son, 10000);
    addEventListener('btatlas:ilerleme', ilerle);
    addEventListener('btatlas:hazir', son, { once: true });
    if (kok.dataset.perdeHazir) son();
  });
}

// Yeni sayfada: perde tam kapalı başlar; sayfa yüklenince (ve varsa veri gelince) açılır.
export async function ac() {
  temizle();
  sahne = kur();
  if (!sahne) return;
  const { gl, pu, ou } = sahne;
  gl.uniform1f(ou, 0);
  gl.uniform1f(pu, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3); // örtülü ilk kare
  if (document.readyState !== 'complete') await new Promise((r) => addEventListener('load', r, { once: true }));
  await veriBekle();
  await oyna(1, 750);
  temizle();
}

// Geri düğmesiyle önbellekten dönülürse perde takılı kalmasın
addEventListener('pageshow', (e) => { if (e.persisted) temizle(); });
