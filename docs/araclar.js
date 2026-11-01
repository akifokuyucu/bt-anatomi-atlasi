// Araç ve simülasyon kartları: JSON listesinden üretilir (ana sayfa ve alt sayfalar ortak kullanır).
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const guvenliUrl = (u) => (/^(https?:\/\/|#|[\w./-]+\.html)/i.test(u) ? u : '#');

export async function araclariKur(boxId = 'araclar-liste', kaynak = 'pano/araclar.json') {
  const box = document.getElementById(boxId);
  if (!box) return;
  try {
    const araclar = await (await fetch(kaynak, { cache: 'no-cache' })).json();
    box.innerHTML = '';
    if (!araclar.length) { box.innerHTML = '<p class="muted">İlk içerik yakında burada olacak.</p>'; return; }
    const gruplar = new Map(); // grup adı → kartlar; sıra JSON'daki ilk görünüşe göre
    for (const t of araclar) {
      const hazir = t.durum !== 'yakinda';
      const el = document.createElement(hazir ? 'a' : 'div');
      el.className = 'case tool' + (hazir ? '' : ' planned');
      if (hazir) el.href = guvenliUrl(t.url);
      el.innerHTML =
        `<div class="case-body"><span class="caption">${esc((t.branslar || []).join(' · ') || 'ARAÇ')}</span><b>${esc(t.ad)}</b>` +
        `<span class="muted">${esc(t.aciklama || '')}</span>` +
        ((t.bolumler || []).length ? `<div class="rozetler">${t.bolumler.map((b) => `<span class="mini">${esc(b)}</span>`).join('')}</div>` : '') +
        `<span class="badge ${hazir ? 'ok' : 'soon'}">${esc({ yayinda: 'Yayında', beta: 'Beta', yakinda: 'Yakında' }[t.durum] || 'Yayında')}</span></div>`;
      const g = t.grup || '';
      if (!gruplar.has(g)) gruplar.set(g, []);
      gruplar.get(g).push(el);
    }
    for (const [ad, kartlar] of gruplar) {
      const kap = document.createElement('div');
      kap.className = 'arac-grup';
      if (ad) kap.innerHTML = `<h2>${esc(ad)}</h2>`;
      const izgara = document.createElement('div');
      izgara.className = 'cards tools';
      izgara.append(...kartlar);
      kap.appendChild(izgara);
      box.appendChild(kap);
    }
  } catch {
    box.innerHTML = '<p class="muted">Liste yüklenemedi. Sayfayı yenileyin.</p>';
  }
}
