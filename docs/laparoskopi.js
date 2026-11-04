// Laparoskopi sayfası: ameliyat kartları data/lapa_cases.json'dan. Video varsa lapav.html, yoksa kare atlası (lapa.html) açılır.
import { vakaKarti, iskelet } from './vaka-kart.js';

const kutu = document.getElementById('cases-lapa');
kutu.innerHTML = iskelet(3);

(async () => {
  try {
    const liste = await (await fetch('data/lapa_cases.json', { cache: 'no-cache' })).json();
    kutu.innerHTML = '';
    if (!liste.length) kutu.innerHTML = '<p class="muted">Henüz ameliyat yok.</p>';
    liste.forEach((c) => kutu.appendChild(vakaKarti(
      c,
      (v) => `${v.page || 'lapa.html'}#c=${encodeURIComponent(v.id)}`,
      (v) => (v.dur ? [`${v.dur} sn video`, `${v.n} yapı`] : [`${v.frames} kare`, `${v.n} yapı`]),
      c.dur ? ['Video', 'lap'] : ['Kare', 'lap'],
    )));
  } catch {
    kutu.innerHTML = '<p class="muted">Ameliyatlar yüklenemedi. Sayfayı yenileyin.</p>';
  }
})();
