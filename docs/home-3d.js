// Ana sayfa kahramanı: arkada kalp atışıyla genişleyen noise'lu nokta halkası, önde 3B kalp (heart.glb).
// Fikir: Codrops noise-transition (radyal noise alanı) ve Ciao Energy (tek 3B nesne, iki renk); burada saf Three.js.
// Model: BodyParts3D, CC BY 4.0 (ekg-heart.js ile aynı dosya). Süs amaçlıdır; WebGL yoksa kutu boş kalır.
// Ekranda değilken, sekme gizliyken ve hareket azalt tercihinde animasyon çalışmaz.
const kutu = document.getElementById('hero-3d');
const azHareket = matchMedia('(prefers-reduced-motion: reduce)').matches;
const webgl = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } })();

if (kutu && webgl) basla().catch(() => { kutu.hidden = true; });

function cssRenk(ad, yedek) {
  const el = document.createElement('i');
  el.style.color = `var(${ad}, ${yedek})`;
  document.documentElement.appendChild(el);
  const m = getComputedStyle(el).color.match(/[\d.]+/g) || [0, 0, 0];
  el.remove();
  return m.slice(0, 3).map((v) => +v / 255);
}

const HALKA_VERT = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const HALKA_FRAG = `precision mediump float;
varying vec2 vUv;
uniform float u_t, u_faz, u_aspect;
uniform vec3 u_renk;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 p=(vUv-.5)*vec2(u_aspect,1.);
  float d=length(p);
  float yaricap=u_faz*.95;
  float soluk=pow(1.-u_faz,1.4);
  float halka=exp(-pow((d-yaricap)/.09,2.))*soluk;
  vec2 q=p*40.; vec2 id=floor(q); vec2 f=fract(q)-.5;
  float nn=n(id*.32+u_t*.12);
  float r=halka*(.2+.26*nn)+.07*smoothstep(.55,.92,nn)*(1.-d*1.3);
  float nokta=1.-smoothstep(r-.05,r,length(f));
  gl_FragColor=vec4(u_renk,nokta*clamp(r*7.,0.,1.));
}`;

// Kalp parçaları: ekg-heart.js ile aynı renkler
const RENK = { ra: '#c9786d', la: '#c9786d', vent: '#b0504a', aorta: '#c9483f', pulm: '#5a80cc', pv: '#c9524a', svc: '#4a74c4', ivc: '#4a74c4', corV: '#33589f' };

async function basla() {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.autoClear = false;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  kutu.appendChild(renderer.domElement);

  // Arka plan: tam ekran dörtgen, ortografik kamera
  const arka = new THREE.Scene();
  const arkaKam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const halkaMat = new THREE.ShaderMaterial({
    vertexShader: HALKA_VERT, fragmentShader: HALKA_FRAG, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { u_t: { value: 0 }, u_faz: { value: 0.35 }, u_aspect: { value: 1 }, u_renk: { value: new THREE.Color(...cssRenk('--accent', '#e8bb5a')) } },
  });
  arka.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), halkaMat));

  // Ön: kalp
  const sahne = new THREE.Scene();
  const kam = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  kam.position.set(0.3, 0.2, 8.8); // ekg sahnesinden (7,2) uzak: dönerken alt vena kava kesilmesin
  kam.lookAt(0.25, 0.1, 0);
  sahne.add(new THREE.HemisphereLight(0xffffff, 0x5a4040, 1.0));
  const anahtar = new THREE.DirectionalLight(0xffffff, 1.5);
  anahtar.position.set(2, 3, 4);
  sahne.add(anahtar);
  const kenar = new THREE.DirectionalLight(0xe8bb5a, 1.1); // altın kenar ışığı
  kenar.position.set(-4, 1, -3);
  sahne.add(kenar);

  const eksen = new THREE.Group(); // dönme merkezi kalbin ortasında
  eksen.position.set(0.25, 0.1, 0);
  sahne.add(eksen);
  const kalp = new THREE.Group();
  kalp.position.set(-0.25, -0.1, 0);
  eksen.add(kalp);

  function boyut() {
    const w = kutu.clientWidth || 1, h = kutu.clientHeight || 1;
    renderer.setSize(w, h, false);
    kam.aspect = w / h;
    kam.updateProjectionMatrix();
    halkaMat.uniforms.u_aspect.value = w / h;
  }
  boyut();
  new ResizeObserver(() => { boyut(); ciz(performance.now()); }).observe(kutu);

  // Tema değişince halka rengi güncellensin
  new MutationObserver(() => halkaMat.uniforms.u_renk.value.setRGB(...cssRenk('--accent', '#e8bb5a')))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Atış: ~66/dk, "lub-dub" biçimli kasılma
  const PERIYOT = 0.92;
  const lubdub = (f) => Math.exp(-(((f - 0.06) / 0.045) ** 2)) + 0.55 * Math.exp(-(((f - 0.3) / 0.055) ** 2));

  let px = 0, py = 0, hx = 0, hy = 0;
  if (!azHareket && matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (e) => { px = e.clientX / innerWidth - 0.5; py = e.clientY / innerHeight - 0.5; }, { passive: true });
  }

  function ciz(ms) {
    const t = azHareket ? 0.32 * PERIYOT : ms / 1000;
    const faz = (t % PERIYOT) / PERIYOT;
    hx += (px - hx) * 0.06; hy += (py - hy) * 0.06;
    eksen.rotation.y = (azHareket ? -0.25 : Math.sin(t * 0.32) * 0.38) + hx * 0.7;
    eksen.rotation.x = hy * 0.35;
    eksen.scale.setScalar(1 + (azHareket ? 0 : 0.032 * lubdub(faz)));
    halkaMat.uniforms.u_t.value = t;
    halkaMat.uniforms.u_faz.value = faz;
    renderer.clear();
    renderer.render(arka, arkaKam);
    renderer.clearDepth();
    renderer.render(sahne, kam);
  }

  // Döngü: yalnızca görünürken
  let gorunur = true, dongu = 0;
  const sur = (ms) => { ciz(ms); dongu = requestAnimationFrame(sur); };
  const guncelle = () => {
    cancelAnimationFrame(dongu);
    if (azHareket) { ciz(0); return; }
    if (gorunur && !document.hidden) dongu = requestAnimationFrame(sur);
  };
  new IntersectionObserver(([e]) => { gorunur = e.isIntersecting; guncelle(); }).observe(kutu);
  document.addEventListener('visibilitychange', guncelle);
  guncelle();
  kutu.classList.add('hazir'); // halka hemen görünür; kalp yüklenince belirir

  // Kalp modeli: boşta yükle (1,5 MB)
  const bosta = window.requestIdleCallback || ((f) => setTimeout(f, 250));
  bosta(async () => {
    const gltf = await new GLTFLoader().loadAsync('data/heart/heart.glb');
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const ad = o.name || o.parent?.name || '';
      if (ad === 'lvc' || ad === 'rvc') { o.visible = false; return; }
      o.geometry.computeVertexNormals();
      const renk = ad.startsWith('cor_') ? '#e23a2e' : (RENK[ad] || '#b0504a');
      o.material = new THREE.MeshPhysicalMaterial({ color: renk, roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    });
    kalp.add(gltf.scene);
    kutu.classList.add('kalp-hazir');
    ciz(performance.now());
  });
}
