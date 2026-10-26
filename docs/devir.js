// Devir listesi kâğıdı: A4'ü satır × sütun kutulara böler, önizler, PDF olarak indirir.
const A4 = { p: [210, 297], l: [297, 210] };
const KENAR = 8;            // mm
const BASLIK_H = 11;        // mm, başlık/tarih şeridi
const AD_H = 7;             // mm, kutu içi ad satırı
const MIN_W = 28, MIN_H = 22; // önerilen düzenlerde en küçük kutu (mm)
const DEPO = 'devir.ayar';

const $ = (id) => document.getElementById(id);
const durum = { n: 16, r: 4, c: 4, yon: 'p', baslik: '', numara: true, adSatiri: true, tarih: false, kesik: false };

function kaydet() { try { localStorage.setItem(DEPO, JSON.stringify(durum)); } catch {} }
function yukle() {
  try { Object.assign(durum, JSON.parse(localStorage.getItem(DEPO) || '{}')); } catch {}
}

const baslikVar = (d) => !!(d.baslik || d.tarih);

// Geometri (mm): kutular ve çizgiler; önizleme ve PDF aynı veriyi kullanır
function geometri(d) {
  const [W, H] = A4[d.yon];
  const ust = KENAR + (baslikVar(d) ? BASLIK_H : 0);
  const gw = W - 2 * KENAR, gh = H - ust - KENAR;
  const cw = gw / d.c, ch = gh / d.r;
  const kutular = [];
  for (let i = 0; i < d.r; i++) for (let j = 0; j < d.c; j++) {
    const no = i * d.c + j + 1;
    kutular.push({ x: KENAR + j * cw, y: ust + i * ch, w: cw, h: ch, no });
  }
  return { W, H, ust, gw, gh, cw, ch, kutular };
}

// Düzen önerileri: boş kutu azlığı ve rahat yazma alanı (hafif yatay kutu) öne çıkar
function oner(n) {
  const sonuc = [];
  for (const yon of ['p', 'l']) {
    const [W, H] = A4[yon];
    for (let r = 1; r <= 15; r++) for (let c = 1; c <= 10; c++) {
      const bos = r * c - n;
      if (bos < 0 || bos >= Math.max(c, 2)) continue;
      const w = (W - 2 * KENAR) / c, h = (H - KENAR - KENAR) / r;
      if (w < MIN_W || h < MIN_H) continue;
      const skor = bos * 10 + Math.abs(Math.log(w / h / 1.3)) * 6;
      sonuc.push({ r, c, yon, bos, w, h, skor });
    }
  }
  return sonuc.sort((a, b) => a.skor - b.skor).slice(0, 6);
}

function esc(s) { return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function onizle() {
  const d = durum, g = geometri(d);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.W} ${g.H}" font-family="Inter, Arial, sans-serif">`;
  if (baslikVar(d)) {
    const y = KENAR + 7;
    s += `<text x="${KENAR}" y="${y}" font-size="5" font-weight="600" fill="#111">${esc(d.baslik)}</text>`;
    if (d.tarih) s += `<text x="${g.W - KENAR}" y="${y}" font-size="3.6" fill="#333" text-anchor="end">Tarih: ........................  Saat: ...........</text>`;
  }
  for (const k of g.kutular) {
    s += `<rect x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" fill="none" stroke="#111" stroke-width="0.3"${d.kesik ? ' stroke-dasharray="2 1.5"' : ''}/>`;
    if (d.adSatiri) s += `<line x1="${k.x}" y1="${k.y + AD_H}" x2="${k.x + k.w}" y2="${k.y + AD_H}" stroke="#777" stroke-width="0.2"/>`;
    if (d.numara) s += `<text x="${k.x + 1.5}" y="${k.y + (d.adSatiri ? AD_H - 2 : 4.5)}" font-size="3.4" fill="#888">${k.no}</text>`;
  }
  // Dış çerçeve her zaman düz çizgi
  s += `<rect x="${KENAR}" y="${g.ust}" width="${g.gw}" height="${g.gh}" fill="none" stroke="#111" stroke-width="0.4"/>`;
  $('kagit').innerHTML = s + '</svg>';
  $('bilgi').textContent =
    `${d.r} satır × ${d.c} sütun · ${d.yon === 'p' ? 'dikey' : 'yatay'} A4 · kutu ${g.cw.toFixed(0)} × ${g.ch.toFixed(0)} mm` +
    (d.r * d.c < d.n ? ` · ⚠ ${d.n} hasta için ${d.n - d.r * d.c} kutu eksik` : d.r * d.c > d.n ? ` · ${d.r * d.c - d.n} boş kutu` : '');
}

function onerileriCiz() {
  const kutu = $('oneriler');
  kutu.innerHTML = '';
  for (const o of oner(durum.n)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (o.r === durum.r && o.c === durum.c && o.yon === durum.yon ? ' on' : '');
    b.innerHTML = `<b>${o.r} × ${o.c}</b><small>${o.yon === 'p' ? 'dikey' : 'yatay'} · ${o.w.toFixed(0)}×${o.h.toFixed(0)} mm${o.bos ? ' · ' + o.bos + ' boş' : ''}</small>`;
    b.addEventListener('click', () => { Object.assign(durum, { r: o.r, c: o.c, yon: o.yon }); guncelle(); });
    kutu.appendChild(b);
  }
  if (!kutu.children.length) kutu.innerHTML = '<span class="muted">Bu sayı için uygun düzen yok; elle ayarlayın.</span>';
}

function guncelle() {
  $('r').value = durum.r; $('c').value = durum.c;
  document.querySelectorAll('#yon button').forEach((b) => b.classList.toggle('on', b.dataset.yon === durum.yon));
  onerileriCiz(); onizle(); kaydet();
}

// Başlık/tarih metni canvas'a çizilir: jsPDF'in yerleşik yazı tipi Türkçe harfleri (ş, ğ, İ) desteklemez
function baslikResmi(d, g) {
  const pxmm = 12, cv = document.createElement('canvas');
  cv.width = Math.round(g.gw * pxmm); cv.height = Math.round(BASLIK_H * pxmm);
  const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#111'; x.textBaseline = 'alphabetic';
  x.font = `600 ${5 * pxmm}px Inter, Arial, sans-serif`;
  x.fillText(d.baslik, 0, 7 * pxmm);
  if (d.tarih) {
    x.font = `${3.6 * pxmm}px Inter, Arial, sans-serif`; x.textAlign = 'right'; x.fillStyle = '#333';
    x.fillText('Tarih: ........................  Saat: ...........', cv.width, 7 * pxmm);
  }
  return cv.toDataURL('image/png');
}

function pdfIndir() {
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) { alert('PDF kütüphanesi yüklenemedi. İnternet bağlantısını kontrol edip sayfayı yenileyin.'); return; }
  const d = durum, g = geometri(d);
  const pdf = new jsPDF({ orientation: d.yon === 'p' ? 'portrait' : 'landscape', unit: 'mm', format: 'a4' });
  if (baslikVar(d)) pdf.addImage(baslikResmi(d, g), 'PNG', KENAR, KENAR, g.gw, BASLIK_H);

  pdf.setDrawColor(17); pdf.setLineWidth(0.3);
  if (d.kesik) pdf.setLineDashPattern([2, 1.5], 0);
  for (const k of g.kutular) pdf.rect(k.x, k.y, k.w, k.h);
  pdf.setLineDashPattern([], 0);

  if (d.adSatiri) {
    pdf.setDrawColor(119); pdf.setLineWidth(0.2);
    for (const k of g.kutular) pdf.line(k.x, k.y + AD_H, k.x + k.w, k.y + AD_H);
  }
  if (d.numara) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(136);
    for (const k of g.kutular) pdf.text(String(k.no), k.x + 1.5, k.y + (d.adSatiri ? AD_H - 2 : 4.5));
  }
  pdf.setDrawColor(17); pdf.setLineWidth(0.4); pdf.rect(KENAR, g.ust, g.gw, g.gh);
  pdf.save(`devir-${d.r}x${d.c}-${d.yon === 'p' ? 'dikey' : 'yatay'}.pdf`);
}

function kur() {
  yukle();
  $('n').value = durum.n; $('baslik').value = durum.baslik;
  for (const id of ['numara', 'adSatiri', 'tarih', 'kesik']) $(id).checked = durum[id];

  $('n').addEventListener('input', () => {
    const n = Math.max(1, Math.min(60, parseInt($('n').value, 10) || 0));
    if (!n) return;
    durum.n = n;
    const ilk = oner(n)[0];
    if (ilk) Object.assign(durum, { r: ilk.r, c: ilk.c, yon: ilk.yon });
    guncelle();
  });
  for (const id of ['r', 'c']) $(id).addEventListener('input', () => {
    const v = parseInt($(id).value, 10);
    if (v >= 1) { durum[id] = Math.min(v, id === 'r' ? 15 : 10); guncelle(); }
  });
  document.querySelectorAll('#yon button').forEach((b) => b.addEventListener('click', () => { durum.yon = b.dataset.yon; guncelle(); }));
  $('baslik').addEventListener('input', () => { durum.baslik = $('baslik').value.trim(); onizle(); kaydet(); });
  for (const id of ['numara', 'adSatiri', 'tarih', 'kesik']) $(id).addEventListener('change', () => { durum[id] = $(id).checked; onizle(); kaydet(); });
  $('indir').addEventListener('click', pdfIndir);
  guncelle();
}

kur();
