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
    for (const t of araclar) {
      const hazir = t.durum !== 'yakinda';
      const el = document.createElement(hazir ? 'a' : 'div');
      el.className = 'case tool' + (hazir ? '' : ' planned');
      if (hazir) el.href = guvenliUrl(t.url);
      el.innerHTML =
        `<div class="case-body"><span class="caption">${esc((t.branslar || []).join(' · ') || 'ARAÇ')}</span><b>${esc(t.ad)}</b>` +
        `<span class="muted">${esc(t.aciklama || '')}</span>` +
        `<span class="badge ${hazir ? 'ok' : 'soon'}">${esc({ yayinda: 'Yayında', beta: 'Beta', yakinda: 'Yakında' }[t.durum] || 'Yayında')}</span></div>`;
      box.appendChild(el);
    }
  } catch {
    box.innerHTML = '<p class="muted">Liste yüklenemedi. Sayfayı yenileyin.</p>';
  }
}
