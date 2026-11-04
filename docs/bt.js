// BT sayfası: tek vaka listesi (data/cases.json); bölge ve tür (normal/patoloji) filtreyle ayrılır.
// Durum bağlantıda: bt.html#b=toraks&t=patoloji
import { vakaKarti, iskelet } from './vaka-kart.js';

const kutu = document.getElementById('cases-bt');
kutu.innerHTML = iskelet(3);

const duz = (t) => String(t || '').toLocaleLowerCase('tr');
// Vaka üst başlığındaki bölge adı ("ABDOMEN VE PELVİS", "TORAKS — ANJİYO", "KRANİYAL") filtre anahtarına çevrilir
const bolgeDe = (c) => {
  const e = duz(c.eyebrow);
  return e.includes('abdomen') || e.includes('pelvis') ? 'abdomen' : e.includes('toraks') ? 'toraks' : e.includes('kran') ? 'kraniyal' : 'diger';
};
const turDe = (c) => (c.category === 'patoloji' ? 'patoloji' : 'normal');

let vakalar = [];
const durum = { b: '', t: '' };

function hashOku() {
  const p = new URLSearchParams(location.hash.slice(1));
  durum.b = ['abdomen', 'toraks', 'kraniyal'].includes(p.get('b')) ? p.get('b') : '';
  durum.t = ['normal', 'patoloji'].includes(p.get('t')) ? p.get('t') : '';
}
function hashYaz() {
  const p = new URLSearchParams();
  if (durum.b) p.set('b', durum.b);
  if (durum.t) p.set('t', durum.t);
  const s = p.toString();
  history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
}

function ciz() {
  for (const [id, anahtar] of [['f-bolge', 'b'], ['f-tur', 't']]) {
    document.querySelectorAll(`#${id} .chip`).forEach((b) => {
      const on = b.dataset.v === durum[anahtar];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  const liste = vakalar.filter((c) => (!durum.b || bolgeDe(c) === durum.b) && (!durum.t || turDe(c) === durum.t));
  kutu.innerHTML = '';
  if (!liste.length) kutu.innerHTML = '<p class="muted">Bu filtreyle vaka yok. Filtreyi gevşetin.</p>';
  liste.forEach((c) => {
    const kart = vakaKarti(
      c,
      (v) => `atlas.html#c=${encodeURIComponent(v.id)}`,
      (v) => [`${v.n} yapı`, `${v.mm} mm kesit`],
      turDe(c) === 'patoloji' ? ['Patoloji', 'bad'] : ['Normal', 'ok'],
    );
    kart.classList.add(`tur-${turDe(c)}`); // çerçeve rengi: normal yeşil, patoloji kırmızı (shell.css)
    kutu.appendChild(kart);
  });
}

document.querySelectorAll('.filtre').forEach((g) => {
  const anahtar = g.id === 'f-bolge' ? 'b' : 't';
  g.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    durum[anahtar] = b.dataset.v;
    hashYaz();
    ciz();
  });
});
addEventListener('hashchange', () => { hashOku(); ciz(); });

(async () => {
  try {
    vakalar = await (await fetch('data/cases.json', { cache: 'no-cache' })).json();
    hashOku();
    ciz();
  } catch {
    kutu.innerHTML = '<p class="muted">Vakalar yüklenemedi. Sayfayı yenileyin.</p>';
  }
})();
