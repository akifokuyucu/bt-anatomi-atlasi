// Tahlil takibi: PDF'ten metin (PDF.js) → ayrıştırma (Python, Pyodide) → yıl yıl çizgi grafikler (SVG).
// Hiçbir veri ağa gönderilmez ve depolanmaz; durum yalnızca bu modülün belleğindedir.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TR = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const tarihTR = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

let dosyalar = []; // { id, ad, tarih, satirlar:[…], uyari }
let sayac = 0;

// ---------- Kütüphaneleri ilk kullanımda yükle ----------
const betikler = {};
function betikYukle(url) {
  return (betikler[url] ||= new Promise((ok, hata) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = ok;
    s.onerror = () => hata(new Error('Yüklenemedi: ' + url));
    document.head.appendChild(s);
  }));
}

let pyHazir;
function pythonHazirla() {
  return (pyHazir ||= (async () => {
    durum('Python ayrıştırıcısı hazırlanıyor (ilk seferde ~10 MB iner)…');
    await betikYukle(PYODIDE);
    const py = await globalThis.loadPyodide();
    const kod = await (await fetch('tahlil/parse.py', { cache: 'no-cache' })).text();
    py.runPython(kod);
    return py;
  })());
}

function durum(m) { $('durum').textContent = m || ''; }

// ---------- PDF → metin satırları ----------
async function pdfSatirlari(dosya) {
  await betikYukle(PDFJS);
  const pdfjs = globalThis.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await pdfjs.getDocument({ data: await dosya.arrayBuffer() }).promise;
  const satirlar = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const icerik = await (await pdf.getPage(p)).getTextContent();
    const parcalar = icerik.items.filter((i) => i.str && i.str.trim());
    // Aynı yükseklikteki parçaları satırda birleştir (yukarıdan aşağı, soldan sağa)
    parcalar.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    let son = null;
    for (const it of parcalar) {
      const y = it.transform[5];
      const x = it.transform[4];
      if (son && Math.abs(son.y - y) <= 3) {
        const bosluk = x - son.bitis;
        son.metin += (bosluk > 12 ? '  ' : ' ') + it.str.trim();
        son.bitis = x + (it.width || 0);
      } else {
        son = { y, metin: it.str.trim(), bitis: x + (it.width || 0) };
        satirlar.push(son);
      }
    }
  }
  return satirlar.map((s) => s.metin);
}

async function ayristir(ad, satirlar) {
  const py = await pythonHazirla();
  const fn = py.globals.get('ayristir');
  const sonuc = JSON.parse(fn(ad, JSON.stringify(satirlar)));
  fn.destroy?.();
  return sonuc;
}

// ---------- Dosya ekleme ----------
async function dosyaEkle(liste) {
  const pdfler = [...liste].filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (!pdfler.length) { durum('PDF dosyası seçin.'); return; }
  for (const f of pdfler) {
    durum(`Okunuyor: ${f.name}`);
    try {
      const satirlar = await pdfSatirlari(f);
      await metindenEkle(f.name, satirlar);
    } catch (e) {
      console.error(e);
      dosyalar.push({ id: ++sayac, ad: f.name, tarih: '', satirlar: [], uyari: 'Okunamadı (bozuk ya da korumalı PDF).' });
    }
  }
  durum('');
  hepsiniCiz();
}

async function metindenEkle(ad, satirlar) {
  const toplam = satirlar.join('').replace(/\s/g, '').length;
  if (toplam < 30) {
    dosyalar.push({ id: ++sayac, ad, tarih: '', satirlar: [], uyari: 'Metin yok: taranmış/fotoğraf PDF. OCR henüz eklenmedi.' });
    return;
  }
  const s = await ayristir(ad, satirlar);
  const uyari = !s.satirlar.length ? 'Hiç değer okunamadı.' : !s.tarih ? 'Tarih bulunamadı, elle girin.' : '';
  dosyalar.push({ id: ++sayac, ad, tarih: s.tarih, satirlar: s.satirlar, uyari });
}

// ---------- Örnek (uydurma) veri: iki farklı rapor düzeni ----------
const ORNEK = [
  ['ornek-2023-03.pdf', ['ÖRNEK LABORATUVARI', 'Hasta: Örnek Kişi', 'Doğum Tarihi: 01.01.1960', 'Rapor Tarihi: 14.03.2023',
    'Test  Sonuç  Birim  Referans',
    'Hemoglobin  13,2  g/dL  12,0 - 16,0', 'Lökosit  6,8  10^3/uL  4,0 - 10,0', 'Kreatinin  0,9  mg/dL  0,5 - 1,1',
    'ALT  24  U/L  0 - 35', 'Glukoz  98  mg/dL  70 - 100', 'CRP  2,1  mg/L  0 - 5', 'TSH  2,4  mIU/L  0,4 - 4,0']],
  ['ornek-2023-11.pdf', ['ÖRNEK LABORATUVARI', 'Numune Tarihi: 02/11/2023',
    'HGB  12,4  g/dL  12,0 - 16,0', 'WBC  7,9  10^3/uL  4,0 - 10,0', 'Creatinine  1,0  mg/dL  0,5 - 1,1',
    'SGPT  41 H  U/L  0 - 35', 'Açlık Kan Şekeri  112 H  mg/dL  70 - 100', 'C Reaktif Protein  4,8  mg/L  0 - 5', 'TSH  2,9  mIU/L  0,4 - 4,0']],
  ['ornek-2024-06.pdf', ['ÖRNEK LABORATUVARI', 'Rapor Tarihi: 20.06.2024',
    'Hemoglobin  11,1 L  g/dL  12,0 - 16,0', 'Lökosit  11,6 H  10^3/uL  4,0 - 10,0', 'Kreatinin  1,3 H  mg/dL  0,5 - 1,1',
    'ALT  58 H  U/L  0 - 35', 'Glukoz  131 H  mg/dL  70 - 100', 'CRP  38,4 H  mg/L  0 - 5', 'TSH  3,1  mIU/L  0,4 - 4,0']],
  ['ornek-2025-02.pdf', ['ÖRNEK LABORATUVARI', 'Rapor Tarihi: 05.02.2025',
    'Hemoglobin  12,6  g/dL  12,0 - 16,0', 'Lökosit  7,2  10^3/uL  4,0 - 10,0', 'Kreatinin  1,0  mg/dL  0,5 - 1,1',
    'ALT  30  U/L  0 - 35', 'Glukoz  104 H  mg/dL  70 - 100', 'CRP  3,0  mg/L  0 - 5', 'TSH  2,6  mIU/L  0,4 - 4,0']],
];
async function ornekYukle() {
  durum('Örnek veri okunuyor…');
  for (const [ad, satirlar] of ORNEK) await metindenEkle(ad, satirlar);
  durum('');
  hepsiniCiz();
}

// ---------- Veriyi seri haline getir ----------
function durumu(n) {
  if (n.ust != null && n.deger > n.ust) return 'yuksek';
  if (n.alt != null && n.deger < n.alt) return 'dusuk';
  if (/^(h|↑|yüksek|yuksek|high)$/.test(n.isaret)) return 'yuksek';
  if (/^(l|↓|düşük|dusuk|low)$/.test(n.isaret)) return 'dusuk';
  return n.alt != null || n.ust != null ? 'normal' : 'belirsiz';
}

function seriler(yil) {
  const harita = new Map();
  for (const d of dosyalar) {
    for (const n of d.satirlar) {
      const tarih = n.tarih || d.tarih;
      if (!tarih || (yil && !tarih.startsWith(yil))) continue;
      const anahtar = n.kanon + '|' + n.birim;
      if (!harita.has(anahtar)) harita.set(anahtar, { id: 's' + harita.size, ad: n.kanon, birim: n.birim, nokta: [] });
      harita.get(anahtar).nokta.push({ iso: tarih, t: Date.parse(tarih), v: n.deger, op: n.op, alt: n.alt, ust: n.ust, durum: durumu(n), dosya: d.ad });
    }
  }
  const liste = [...harita.values()];
  liste.forEach((s) => s.nokta.sort((a, b) => a.t - b.t));
  liste.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  return liste;
}

function degerlendir(s) {
  const son = s.nokta.at(-1);
  const onceki = s.nokta.at(-2);
  let trend = null;
  if (onceki && onceki.v !== 0) {
    const yuzde = ((son.v - onceki.v) / Math.abs(onceki.v)) * 100;
    if (Math.abs(yuzde) >= 20) trend = { yuzde, yon: yuzde > 0 ? 'artış' : 'azalış' };
  }
  const disinda = son.durum === 'yuksek' || son.durum === 'dusuk';
  return { son, onceki, trend, disinda, dikkat: disinda || !!trend };
}

// ---------- SVG grafik ----------
function grafikSvg(s) {
  const W = 340, H = 170, L = 38, R = 12, T = 10, B = 24;
  const son = s.nokta.at(-1);
  const alt = [...s.nokta].reverse().find((n) => n.alt != null)?.alt ?? null;
  const ust = [...s.nokta].reverse().find((n) => n.ust != null)?.ust ?? null;
  const degerler = s.nokta.map((n) => n.v).concat([alt, ust].filter((x) => x != null));
  let lo = Math.min(...degerler), hi = Math.max(...degerler);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pay = (hi - lo) * 0.1;
  lo -= pay; hi += pay;
  const t0 = s.nokta[0].t, t1 = s.nokta.at(-1).t;
  const x = (t) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let bant = '';
  if (alt != null || ust != null) {
    const ya = y(Math.min(ust ?? hi, hi)), yb = y(Math.max(alt ?? lo, lo));
    bant = `<rect class="g-bant" x="${L}" y="${ya}" width="${W - L - R}" height="${Math.max(yb - ya, 1)}"/>`;
  }
  const cizgi = s.nokta.map((n) => `${x(n.t).toFixed(1)},${y(n.v).toFixed(1)}`).join(' ');
  const noktalar = s.nokta.map((n) =>
    `<circle class="g-nokta ${n.durum}" cx="${x(n.t).toFixed(1)}" cy="${y(n.v).toFixed(1)}" r="4.5"><title>${esc(tarihTR(n.iso))}: ${esc(n.op)}${TR.format(n.v)} ${esc(s.birim)}</title></circle>`).join('');
  const tick = (v) => `<text class="g-yazi" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${TR.format(+v.toPrecision(3))}</text>`;
  const ortaV = (lo + hi) / 2;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.ad)} zaman grafiği">
    ${bant}
    <line class="g-eksen" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/><line class="g-eksen" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>
    ${tick(lo + pay)}${tick(ortaV)}${tick(hi - pay)}
    ${s.nokta.length > 1 ? `<polyline class="g-cizgi" points="${cizgi}"/>` : ''}
    ${noktalar}
    <text class="g-yazi" x="${L}" y="${H - 6}">${esc(tarihTR(s.nokta[0].iso))}</text>
    ${s.nokta.length > 1 ? `<text class="g-yazi" x="${W - R}" y="${H - 6}" text-anchor="end">${esc(tarihTR(son.iso))}</text>` : ''}
  </svg>`;
}

// ---------- Çizim ----------
function hepsiniCiz() {
  const var_ = dosyalar.length > 0;
  $('temizle').disabled = !var_;
  $('csv').disabled = !dosyalar.some((d) => d.satirlar.length);
  dosyaListesi();

  const yillar = [...new Set(dosyalar.flatMap((d) => d.satirlar.map((n) => (n.tarih || d.tarih).slice(0, 4))).filter(Boolean))].sort();
  const secili = $('yil').value;
  $('yil').innerHTML = '<option value="">Tüm yıllar</option>' + yillar.map((y) => `<option value="${y}">${y}</option>`).join('');
  $('yil').value = yillar.includes(secili) ? secili : '';

  const tum = seriler($('yil').value);
  const sorgu = $('ara').value.trim().toLocaleLowerCase('tr');
  const ham = tum.map((s) => ({ s, d: degerlendir(s) }));
  const gorunen = ham.filter(({ s, d }) =>
    (!sorgu || s.ad.toLocaleLowerCase('tr').includes(sorgu)) && (!$('sadeceDikkat').checked || d.dikkat));

  $('grafik-kutu').hidden = !tum.length;
  $('satir-kutu').hidden = !dosyalar.some((d) => d.satirlar.length);
  $('grafikler').innerHTML = gorunen.length
    ? gorunen.map(({ s, d }) => kartHtml(s, d)).join('')
    : '<p class="g-yok">Gösterilecek tahlil yok.</p>';

  // Dikkat özeti: önce aralık dışı, sonra belirgin değişim
  const dikkat = ham.filter(({ d }) => d.dikkat).sort((a, b) => b.d.disinda - a.d.disinda);
  $('ozet-kutu').hidden = !tum.length;
  $('ozet').innerHTML = dikkat.length ? dikkat.map(({ s, d }) => {
    const etiket = d.disinda ? (d.son.durum === 'yuksek' ? 'yüksek' : 'düşük') : '';
    const tr = d.trend ? `${d.trend.yon === 'artış' ? '↑' : '↓'} %${Math.abs(Math.round(d.trend.yuzde))} ${d.trend.yon}` : '';
    return `<li><a class="${d.disinda ? 'bad' : 'trend'}" href="#${s.id}">${esc(s.ad)} <em>${[etiket, tr].filter(Boolean).join(' · ')}</em></a></li>`;
  }).join('') : '<li class="muted">Son değerlerde aralık dışı ya da belirgin değişim yok.</li>';

  tabloCiz();
}

function kartHtml(s, d) {
  const sonMetin = `${d.son.op}${TR.format(d.son.v)} ${esc(s.birim)}`;
  const etiket = d.son.durum === 'yuksek' ? ' <span class="yuksek">yüksek</span>' : d.son.durum === 'dusuk' ? ' <span class="dusuk">düşük</span>' : '';
  const ref = d.son.alt != null || d.son.ust != null
    ? `Referans: ${d.son.alt != null ? TR.format(d.son.alt) : '…'} – ${d.son.ust != null ? TR.format(d.son.ust) : '…'}` : 'Referans aralığı yok';
  return `<article class="g-kart${d.dikkat ? ' dikkat' : ''}" id="${s.id}">
    <div class="g-ust"><b>${esc(s.ad)}</b><small>${esc(s.birim)}</small></div>
    <div class="g-son">Son: <b>${sonMetin}</b>${etiket} · ${esc(tarihTR(d.son.iso))} · ${ref}</div>
    ${grafikSvg(s)}</article>`;
}

function dosyaListesi() {
  $('dosyalar').innerHTML = dosyalar.map((d) => `<li data-id="${d.id}">
    <span class="ad" title="${esc(d.ad)}">${esc(d.ad)}</span><button type="button" data-sil="${d.id}" aria-label="Dosyayı kaldır">×</button>
    <div class="alt">${dosyaTarihleri(d)}
    <span>${d.satirlar.length} değer</span>${d.uyari ? `<span class="uyarili">${esc(d.uyari)}</span>` : ''}</div></li>`).join('');
}

// Bir dosyada tek tarih varsa elle düzeltilebilir; birden çok tarih bloğu (ör. e-Nabız) varsa sayısı yazılır
function dosyaTarihleri(d) {
  const tarihler = [...new Set(d.satirlar.map((n) => n.tarih).filter(Boolean))];
  if (tarihler.length > 1) return `<span>${tarihler.length} farklı tarih</span>`;
  return `<input type="date" value="${esc(tarihler[0] || d.tarih)}" data-tarih="${d.id}" aria-label="Rapor tarihi">`;
}

function tabloCiz() {
  const satirlar = [];
  for (const d of dosyalar) d.satirlar.forEach((n, i) => satirlar.push({ d, n, i }));
  satirlar.sort((a, b) => (a.n.tarih || a.d.tarih || '').localeCompare(b.n.tarih || b.d.tarih || '') || a.n.kanon.localeCompare(b.n.kanon, 'tr'));
  $('satir-say').textContent = satirlar.length;
  $('satirlar').innerHTML = '<tr><th>Tarih</th><th>Tahlil</th><th>Değer</th><th>Birim</th><th>Referans</th><th>Dosya</th><th></th></tr>' +
    satirlar.map(({ d, n, i }) => `<tr><td>${esc(tarihTR(n.tarih || d.tarih))}</td><td>${esc(n.kanon)}${n.kanon !== n.ad ? ` <span class="muted">(${esc(n.ad)})</span>` : ''}</td>
      <td>${esc(n.op)}${TR.format(n.deger)}</td><td>${esc(n.birim)}</td>
      <td>${n.alt != null ? TR.format(n.alt) : '…'} – ${n.ust != null ? TR.format(n.ust) : '…'}</td><td>${esc(d.ad)}</td>
      <td><button type="button" data-satir-sil="${d.id}:${i}" aria-label="Satırı sil">×</button></td></tr>`).join('');
}

// ---------- CSV (isteğe bağlı, kullanıcı indirir) ----------
function csvIndir() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const satirlar = ['Tarih;Tahlil;Değer;Birim;Ref alt;Ref üst;Dosya'];
  for (const d of dosyalar) for (const n of d.satirlar)
    satirlar.push([n.tarih || d.tarih, n.kanon, String(n.deger).replace('.', ','), n.birim, n.alt ?? '', n.ust ?? '', d.ad].map(q).join(';'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + satirlar.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'tahlil-degerleri.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Olaylar ----------
const drop = $('drop');
drop.addEventListener('click', () => $('dosya').click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('dosya').click(); } });
$('dosya').addEventListener('change', (e) => { dosyaEkle(e.target.files); e.target.value = ''; });
['dragenter', 'dragover'].forEach((o) => drop.addEventListener(o, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((o) => drop.addEventListener(o, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => dosyaEkle(e.dataTransfer.files));
// Sayfaya yanlış yere bırakılan PDF tarayıcıda açılmasın
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => e.preventDefault());

$('ornek').addEventListener('click', ornekYukle);
$('csv').addEventListener('click', csvIndir);
$('temizle').addEventListener('click', () => { dosyalar = []; sayac = 0; hepsiniCiz(); durum('Tüm veriler bellekten silindi.'); });
['yil', 'ara', 'sadeceDikkat'].forEach((id) => $(id).addEventListener('input', hepsiniCiz));

$('dosyalar').addEventListener('click', (e) => {
  const id = e.target.closest('[data-sil]')?.dataset.sil;
  if (id) { dosyalar = dosyalar.filter((d) => d.id !== +id); hepsiniCiz(); }
});
$('dosyalar').addEventListener('change', (e) => {
  const id = e.target.dataset.tarih;
  if (!id) return;
  const d = dosyalar.find((x) => x.id === +id);
  const eski = d.tarih || '';
  const eskiTek = [...new Set(d.satirlar.map((n) => n.tarih).filter(Boolean))][0];
  d.tarih = e.target.value;
  d.satirlar.forEach((n) => { if (!n.tarih || n.tarih === eskiTek || n.tarih === eski) n.tarih = d.tarih; });
  if (d.tarih && d.uyari.startsWith('Tarih')) d.uyari = '';
  hepsiniCiz();
});
$('satirlar').addEventListener('click', (e) => {
  const v = e.target.closest('[data-satir-sil]')?.dataset.satirSil;
  if (!v) return;
  const [id, i] = v.split(':').map(Number);
  dosyalar.find((d) => d.id === id)?.satirlar.splice(i, 1);
  hepsiniCiz();
});

hepsiniCiz();
