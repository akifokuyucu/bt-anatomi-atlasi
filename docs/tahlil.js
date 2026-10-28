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
    s.crossOrigin = 'anonymous';
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
    'ALT  24  U/L  0 - 35', 'Glukoz  98  mg/dL  70 - 100', 'CRP  2,1  mg/L  0 - 5', 'TSH  2,4  mIU/L  0,4 - 4,0',
    'Nitrit  NEGATİF  Negatif', 'Protein  NEGATİF  Negatif']],
  ['ornek-2023-11.pdf', ['ÖRNEK LABORATUVARI', 'Numune Tarihi: 02/11/2023',
    'HGB  12,4  g/dL  12,0 - 16,0', 'WBC  7,9  10^3/uL  4,0 - 10,0', 'Creatinine  1,0  mg/dL  0,5 - 1,1',
    'SGPT  41 H  U/L  0 - 35', 'Açlık Kan Şekeri  112 H  mg/dL  70 - 100', 'C Reaktif Protein  4,8  mg/L  0 - 5', 'TSH  2,9  mIU/L  0,4 - 4,0']],
  ['ornek-2024-06.pdf', ['ÖRNEK LABORATUVARI', 'Rapor Tarihi: 20.06.2024',
    'Hemoglobin  11,1 L  g/dL  12,0 - 16,0', 'Lökosit  11,6 H  10^3/uL  4,0 - 10,0', 'Kreatinin  1,3 H  mg/dL  0,5 - 1,1',
    'ALT  58 H  U/L  0 - 35', 'Glukoz  131 H  mg/dL  70 - 100', 'CRP  38,4 H  mg/L  0 - 5', 'TSH  3,1  mIU/L  0,4 - 4,0',
    'Nitrit  POZİTİF  Negatif', 'Protein  NEGATİF  Negatif']],
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

let yinelenen = 0; // aynı gün, aynı tahlil, aynı değer: tek nokta sayılır (ör. iki PDF'te de aynı rapor)

function seriler(yil) {
  const harita = new Map();
  const gorulen = new Set();
  yinelenen = 0;
  for (const d of dosyalar) {
    for (const n of d.satirlar) {
      if (n.deger == null) continue; // metin sonuçlar ayrı tabloda
      const tarih = n.tarih || d.tarih;
      if (!tarih || (yil && !tarih.startsWith(yil))) continue;
      const anahtar = n.kanon + '|' + n.birim;
      const dk = anahtar + '|' + tarih + '|' + n.deger;
      if (gorulen.has(dk)) { yinelenen++; continue; }
      gorulen.add(dk);
      if (!harita.has(anahtar)) harita.set(anahtar, { id: 's' + harita.size, anahtar, ad: n.kanon, birim: n.birim, nokta: [] });
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

// Metin sonuçlar (NEGATİF, Normal …): tahlil × tarih tablosu
function metinTablo(yil) {
  const satir = new Map();
  const tarihler = new Set();
  for (const d of dosyalar) {
    for (const n of d.satirlar) {
      if (n.deger != null || !n.metin) continue;
      const tarih = n.tarih || d.tarih;
      if (!tarih || (yil && !tarih.startsWith(yil))) continue;
      tarihler.add(tarih);
      if (!satir.has(n.kanon)) satir.set(n.kanon, new Map());
      const h = satir.get(n.kanon);
      const m = h.get(tarih);
      if (!m) h.set(tarih, { metin: [n.metin], durum: n.durum_metin });
      else if (m.metin.includes(n.metin)) yinelenen++;
      else { m.metin.push(n.metin); if (n.durum_metin === 'anormal') m.durum = 'anormal'; }
    }
  }
  return { tarihler: [...tarihler].sort(), satirlar: [...satir].sort((a, b) => a[0].localeCompare(b[0], 'tr')) };
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
function hepsiniCiz(tablo = true) {
  const var_ = dosyalar.length > 0;
  $('temizle').disabled = !var_;
  $('csv').disabled = !dosyalar.some((d) => d.satirlar.length);
  $('yazdir').disabled = $('csv').disabled;
  dosyaListesi();

  const yillar = [...new Set(dosyalar.flatMap((d) => d.satirlar.map((n) => (n.tarih || d.tarih).slice(0, 4))).filter(Boolean))].sort();
  const secili = $('yil').value;
  $('yil').innerHTML = '<option value="">Tüm yıllar</option>' + yillar.map((y) => `<option value="${y}">${y}</option>`).join('');
  $('yil').value = yillar.includes(secili) ? secili : '';

  const tum = seriler($('yil').value);
  const mt = metinTablo($('yil').value);
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
  const metinDikkat = mt.satirlar.map(([ad, h]) => ({ ad, son: h.get([...h.keys()].sort().at(-1)) })).filter((x) => x.son.durum === 'anormal');
  $('ozet-kutu').hidden = !tum.length && !mt.satirlar.length;
  const sayisalChip = dikkat.map(({ s, d }) => {
    const etiket = d.disinda ? (d.son.durum === 'yuksek' ? 'yüksek' : 'düşük') : '';
    const tr = d.trend ? `${d.trend.yon === 'artış' ? '↑' : '↓'} %${Math.abs(Math.round(d.trend.yuzde))} ${d.trend.yon}` : '';
    return `<li><a class="${d.disinda ? 'bad' : 'trend'}" href="#${s.id}">${esc(s.ad)} <em>${[etiket, tr].filter(Boolean).join(' · ')}</em></a></li>`;
  });
  const metinChip = metinDikkat.map((x) => `<li><a class="bad" href="#metin-kutu">${esc(x.ad)} <em>${esc(x.son.metin.join(' / '))}</em></a></li>`);
  $('ozet').innerHTML = [...sayisalChip, ...metinChip].join('') || '<li class="muted">Son değerlerde aralık dışı ya da belirgin değişim yok.</li>';

  $('metin-kutu').hidden = !mt.satirlar.length;
  $('metin-tablo').innerHTML = mt.satirlar.length
    ? '<tr><th>Tahlil</th>' + mt.tarihler.map((t) => `<th>${esc(tarihTR(t))}</th>`).join('') + '</tr>' +
      mt.satirlar.map(([ad, h]) => `<tr><th>${esc(ad)}</th>${mt.tarihler.map((t) => {
        const m = h.get(t);
        return m ? `<td class="m-${m.durum}">${esc(m.metin.join(' / '))}</td>` : '<td class="muted">—</td>';
      }).join('')}</tr>`).join('')
    : '';
  $('yinelen').textContent = yinelenen ? `${yinelenen} yinelenen değer (aynı gün, aynı sonuç) tek nokta olarak sayıldı.` : '';

  karsiCiz();
  if (tablo) tabloCiz();
}

function kartHtml(s, d) {
  const sonMetin = `${d.son.op}${TR.format(d.son.v)} ${esc(s.birim)}`;
  const etiket = d.son.durum === 'yuksek' ? ' <span class="yuksek">yüksek</span>' : d.son.durum === 'dusuk' ? ' <span class="dusuk">düşük</span>' : '';
  const ref = d.son.alt != null || d.son.ust != null
    ? `Referans: ${d.son.alt != null ? TR.format(d.son.alt) : '…'} – ${d.son.ust != null ? TR.format(d.son.ust) : '…'}` : 'Referans aralığı yok';
  const baslik = `${s.ad}${s.birim ? ' (' + s.birim + ')' : ''}`;
  const altYazi = `Son: ${d.son.op}${TR.format(d.son.v)} ${s.birim} · ${tarihTR(d.son.iso)} · ${ref}`;
  return `<article class="g-kart${d.dikkat ? ' dikkat' : ''}" id="${s.id}" data-baslik="${esc(baslik)}" data-alt="${esc(altYazi)}">
    <div class="g-ust"><b>${esc(s.ad)}</b><span><small>${esc(s.birim)}</small> <button type="button" class="g-karsi" data-karsi="${esc(s.anahtar)}" aria-pressed="false">＋ Karşılaştır</button> <button type="button" class="g-png" data-png="${s.id}" title="Grafiği PNG indir" aria-label="${esc(s.ad)} grafiğini PNG indir">⬇ PNG</button></span></div>
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
  const girdi = (alan, v, k, genis = false) =>
    `<input class="duz${genis ? ' genis' : ''}" data-alan="${alan}" data-k="${k}" value="${esc(v ?? '')}" aria-label="${alan}" autocomplete="off">`;
  const sayi = (v) => (v != null ? String(v).replace('.', ',') : '');
  $('satirlar').innerHTML = '<tr><th>Tarih</th><th>Tahlil</th><th>Değer / sonuç</th><th>Birim</th><th>Ref. alt</th><th>Ref. üst</th><th>Dosya</th><th></th></tr>' +
    satirlar.map(({ d, n, i }) => {
      const k = `${d.id}:${i}`;
      const metin = n.deger == null;
      const deger = metin ? girdi('metin', n.metin, k) : girdi('deger', (n.op || '') + sayi(n.deger), k);
      return `<tr><td><input type="date" class="duz" data-alan="tarih" data-k="${k}" value="${esc(n.tarih || d.tarih || '')}" aria-label="tarih"></td>
      <td>${girdi('kanon', n.kanon, k, true)}</td><td>${deger}</td>
      <td>${metin ? '' : girdi('birim', n.birim, k)}</td>
      <td>${metin ? '' : girdi('alt', sayi(n.alt), k)}</td><td>${metin ? '' : girdi('ust', sayi(n.ust), k)}</td>
      <td>${esc(d.ad)}</td>
      <td><button type="button" data-satir-sil="${k}" aria-label="Satırı sil">×</button></td></tr>`;
    }).join('');
}

// Tablodan elle düzeltme: yanlış okunan ad, değer, birim ya da referansı değiştirir
function satirDuzelt(girdi) {
  const [id, i] = girdi.dataset.k.split(':').map(Number);
  const n = dosyalar.find((x) => x.id === id)?.satirlar[i];
  if (!n) return;
  const v = girdi.value.trim();
  const sayiyaCevir = (t) => { const x = parseFloat(t.replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
  const alan = girdi.dataset.alan;
  if (alan === 'kanon') { if (v) n.kanon = v; }
  else if (alan === 'tarih') n.tarih = v;
  else if (alan === 'birim') n.birim = v;
  else if (alan === 'metin') {
    n.metin = v;
    if (n.ref_metin) n.durum_metin = n.ref_metin.trim().toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr') ? 'normal' : 'anormal';
  } else if (alan === 'deger') {
    const x = sayiyaCevir(v.replace(/^[<>≤≥]/, ''));
    if (Number.isNaN(x)) { tabloCiz(); return; }
    n.deger = x; n.op = v.match(/^[<>≤≥]/)?.[0] || ''; n.isaret = '';
  } else if (alan === 'alt' || alan === 'ust') {
    const x = v ? sayiyaCevir(v) : null;
    if (Number.isNaN(x)) { tabloCiz(); return; }
    n[alan] = x;
  }
  hepsiniCiz(false); // odak kaybolmasın diye tablo yeniden çizilmez
}

// ---------- CSV (isteğe bağlı, kullanıcı indirir) ----------
function csvIndir() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const satirlar = ['Tarih;Tahlil;Değer;Birim;Ref alt;Ref üst;Dosya'];
  const sayiTR = (v) => (v == null ? '' : String(v).replace('.', ','));
  for (const d of dosyalar) for (const n of d.satirlar)
    satirlar.push([n.tarih || d.tarih, n.kanon, n.deger == null ? n.metin : (n.op || '') + sayiTR(n.deger), n.birim, sayiTR(n.alt), sayiTR(n.ust), d.ad].map(q).join(';'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + satirlar.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'tahlil-degerleri.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- PNG: grafik kartını görsel olarak indir ----------
function pngIndir(id) {
  const kart = $(id);
  const svg = kart?.querySelector('svg');
  if (!svg) return;
  const R = pngTema();
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
  const ust = 46;
  const stil = pngStil(R);
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 3}" height="${(H + ust) * 3}" viewBox="0 0 ${W} ${H + ust}">` +
    `<style>${stil}</style><rect width="100%" height="100%" fill="${R.bg}"/>` +
    `<text x="12" y="20" fill="${R.text}" font-family="sans-serif" font-size="14" font-weight="600">${esc(kart.dataset.baslik)}</text>` +
    `<text x="12" y="37" fill="${R.muted}" font-family="sans-serif" font-size="9.5">${esc(kart.dataset.alt)}</text>` +
    `<g transform="translate(0 ${ust})">${svg.innerHTML}</g></svg>`;
  pngYaz(xml, W, H + ust, kart.dataset.baslik);
}

function pngTema() {
  const cs = getComputedStyle(document.documentElement);
  const r = (a, y) => cs.getPropertyValue(a).trim() || y;
  return { accent: r('--accent', '#e8bb5a'), ok: r('--ok', '#3ecf7a'), bad: r('--bad', '#e5646f'), muted: r('--muted', '#9aa2b0'), line: r('--line-hi', '#343c49'), bg: r('--panel-2', '#151a21'), text: r('--text', '#eceef3') };
}

function pngStil(R) {
  return `.g-bant{fill:${R.ok};opacity:.16}.g-cizgi{fill:none;stroke:${R.accent};stroke-width:2;stroke-linejoin:round}` +
    `.g-nokta{stroke:${R.bg};stroke-width:1.5;fill:${R.accent}}.g-nokta.yuksek,.g-nokta.dusuk{fill:${R.bad}}.g-nokta.normal{fill:${R.ok}}` +
    `.g-eksen{stroke:${R.line};stroke-width:1}.g-yazi{fill:${R.muted};font:10px sans-serif}` +
    `.k-bant{fill:${R.ok};opacity:.14}.k-izgara{stroke:${R.line};stroke-width:1;opacity:.45}.k-eksen{stroke:${R.line};stroke-width:1}` +
    `.k-sifir{stroke:${R.muted};stroke-width:1;stroke-dasharray:4 3}.k-cizgi{fill:none;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}` +
    `.k-nokta{stroke:${R.bg};stroke-width:1.5}.k-nokta.dis{stroke:${R.bad};stroke-width:2.5}.k-yazi{fill:${R.muted};font:10px sans-serif}`;
}

// SVG metnini 3 kat \u00E7\u00F6z\u00FCn\u00FCrl\u00FCkte PNG olarak indirir
function pngYaz(xml, W, H, ad) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = W * 3; c.height = H * 3;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = (ad || 'grafik').replace(/[^\w\u00C0-\u024F-]+/g, '_') + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
}

// ---------- Karşılaştırma: seçilen tahliller tek etkileşimli grafikte ----------
const RENKLER = ['#e8bb5a', '#5ab0e8', '#e5646f', '#3ecf7a', '#b58cf0', '#f08c4a', '#4ad0c8', '#e86ab0'];
const KL = 54, KR = 16, KT = 20, KB = 30, GUN = 864e5;
let secili = [];        // seçili serilerin anahtarları (seçim sırasıyla)
const renk = new Map(); // anahtar → renk
const gizli = new Set(); // seçili ama çizilmeyen
let mod = 'deger';      // deger | yuzde | ref
let aralik = null;      // { t0, t1, etiket } ya da null (tümü)
let otoSecildi = false;
let karsiUyari = '';
let cizim = null;       // son çizimin nokta konumları (imleç ve PNG için)

function tumSeriler() { const y = yinelenen; const s = seriler(''); yinelenen = y; return s; }
const aralikta = (n) => !aralik || (n.t >= aralik.t0 && n.t <= aralik.t1);
const tarihKisa = (t, b) => new Date(t).toLocaleDateString('tr-TR', { timeZone: 'UTC', ...b });

function sec(k) {
  if (secili.includes(k)) return true;
  if (secili.length >= RENKLER.length) { karsiUyari = `En fazla ${RENKLER.length} tahlil birlikte gösterilir; birini kaldırın.`; return false; }
  const kullanilan = [...renk.values()];
  secili.push(k);
  renk.set(k, RENKLER.find((c) => !kullanilan.includes(c)));
  karsiUyari = '';
  return true;
}
function birak(k) { secili = secili.filter((x) => x !== k); renk.delete(k); gizli.delete(k); karsiUyari = ''; }

function guzelTick(lo, hi, n = 5) {
  const ham = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(ham));
  const oran = ham / mag;
  const adim = (oran < 1.5 ? 1 : oran < 3 ? 2 : oran < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / adim) * adim; v <= hi + adim * 1e-6; v += adim) out.push(+v.toPrecision(12));
  return out;
}

function karsiCiz() {
  const tum = tumSeriler();
  const harita = new Map(tum.map((s) => [s.anahtar, s]));
  secili = secili.filter((k) => harita.has(k));
  for (const k of [...renk.keys()]) if (!harita.has(k)) { renk.delete(k); gizli.delete(k); }
  $('karsi-kutu').hidden = !tum.length;
  if (!tum.length) { otoSecildi = false; aralik = null; cizim = null; return; }
  if (!otoSecildi) { // ilk yüklemede dikkat gerektirenlerden başla
    otoSecildi = true;
    const oneri = tum.filter((s) => degerlendir(s).dikkat);
    (oneri.length ? oneri : tum).slice(0, 3).forEach((s) => sec(s.anahtar));
  }

  // Seçim çipleri (odak kaybolmasın)
  const odak = document.activeElement?.closest?.('#karsi-chips') ? document.activeElement.dataset.k : null;
  const sorgu = $('karsi-ara').value.trim().toLocaleLowerCase('tr');
  $('karsi-chips').innerHTML = tum.filter((s) => !sorgu || s.ad.toLocaleLowerCase('tr').includes(sorgu)).map((s) => {
    const acik = secili.includes(s.anahtar);
    return `<button type="button" class="k-chip${degerlendir(s).dikkat ? ' dikkat' : ''}" data-k="${esc(s.anahtar)}" aria-pressed="${acik}"${acik ? ` style="--c:${renk.get(s.anahtar)}"` : ''}>${esc(s.ad)}</button>`;
  }).join('') || '<span class="muted">Eşleşen tahlil yok.</span>';
  if (odak != null) [...$('karsi-chips').children].find((b) => b.dataset.k === odak)?.focus();

  const secs = secili.map((k) => harita.get(k));
  $('karsi-secili').innerHTML = secs.map((s) => {
    const g = gizli.has(s.anahtar);
    return `<span class="k-lej${g ? ' kapali' : ''}"><button type="button" class="k-lej-ad" data-gizle="${esc(s.anahtar)}" aria-pressed="${!g}" title="Çizgiyi göster / gizle"><i style="background:${renk.get(s.anahtar)}"></i>${esc(s.ad)}${s.birim ? ` <small>${esc(s.birim)}</small>` : ''}</button>` +
      `<button type="button" class="k-lej-sil" data-kaldir="${esc(s.anahtar)}" aria-label="${esc(s.ad)} seçimini kaldır">×</button></span>`;
  }).join('');
  document.querySelectorAll('#karsi-aralik [data-ar]').forEach((b) => b.setAttribute('aria-pressed', (aralik?.etiket ?? '0') === b.dataset.ar));

  // Gösterim kipi: farklı birimler aynı eksene konamaz
  const gor = secs.filter((s) => !gizli.has(s.anahtar));
  const notlar = [];
  let etkin = mod;
  if (etkin === 'deger' && new Set(gor.map((s) => s.birim)).size > 1) {
    // Referansı olan tahlillerde "referansa göre" daha okunur (uç değerler diğerlerini ezmez)
    const hepsiRef = gor.every((s) => s.nokta.some((n) => n.alt != null && n.ust != null));
    etkin = hepsiRef ? 'ref' : 'yuzde';
    notlar.push(`Seçili tahlillerin birimleri farklı olduğundan ${hepsiRef ? 'referans aralığına göre' : 'ilk değere göre % değişim'} gösteriliyor; "Gerçek değer" için aynı birimli tahlilleri seçin.`);
  }
  document.querySelectorAll('#karsi-mod [data-mod]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mod === etkin));
  notlar.unshift({
    deger: 'Gerçek değerler, tek eksende.',
    yuzde: 'Her tahlil, seçili aralıktaki ilk değerine göre yüzde değişimle gösterilir; farklı birimleri karşılaştırmak için uygundur.',
    ref: 'Her tahlil kendi referansına göre ölçeklenir: 0 = alt sınır, 1 = üst sınır. Yeşil bant normal aralıktır.',
  }[etkin]);
  if (aralik?.etiket === 'ozel') notlar.push(`Yakınlaştırıldı: ${tarihKisa(aralik.t0, { dateStyle: 'medium' })} – ${tarihKisa(aralik.t1, { dateStyle: 'medium' })}. Çift tıklayın ya da "Tümü"ne basın.`);
  if (karsiUyari) notlar.push(karsiUyari);

  // Çizilecek seriler
  const cs = [];
  for (const s of gor) {
    const p = s.nokta.filter(aralikta);
    if (!p.length) continue;
    let pts;
    if (etkin === 'deger') pts = p.map((n) => ({ n, y: n.v }));
    else if (etkin === 'yuzde') {
      const ilk = p[0].v;
      if (ilk === 0) { notlar.push(`${s.ad}: ilk değer 0 olduğundan % hesaplanamadı.`); continue; }
      pts = p.map((n) => ({ n, y: ((n.v - ilk) / Math.abs(ilk)) * 100 }));
    } else {
      pts = p.filter((n) => n.alt != null && n.ust != null && n.ust > n.alt).map((n) => ({ n, y: (n.v - n.alt) / (n.ust - n.alt) }));
      if (!pts.length) { notlar.push(`${s.ad}: referans aralığı olmadığından gösterilemedi.`); continue; }
    }
    cs.push({ s, renk: renk.get(s.anahtar), pts });
  }
  $('karsi-not').textContent = notlar.join(' ');
  karsiTablo(secs);
  kartDugmeleri();

  if (!cs.length) {
    cizim = null;
    $('karsi-grafik').innerHTML = `<p class="g-yok">${secili.length ? 'Seçili aralıkta gösterilecek değer yok.' : 'Grafik için yukarıdan en az bir tahlil seçin.'}</p>`;
    $('karsi-ipucu').hidden = true;
    return;
  }

  // Eksenler
  const W = Math.max(300, Math.round($('karsi-grafik').clientWidth || 760));
  const H = W < 520 ? 300 : 380;
  const ts = cs.flatMap((c) => c.pts.map((p) => p.n.t));
  let t0 = aralik ? aralik.t0 : Math.min(...ts), t1 = aralik ? aralik.t1 : Math.max(...ts);
  if (t0 === t1) { t0 -= 15 * GUN; t1 += 15 * GUN; }
  const ys = cs.flatMap((c) => c.pts.map((p) => p.y));
  const hamMin = Math.min(...ys);
  let bant = null; // [alt, ust] (null = açık uç)
  if (etkin === 'ref') { ys.push(0, 1); bant = [0, 1]; }
  else if (etkin === 'yuzde') ys.push(0);
  else if (cs.length === 1) {
    const nk = cs[0].s.nokta;
    const alt = [...nk].reverse().find((n) => n.alt != null)?.alt ?? null;
    const ust = [...nk].reverse().find((n) => n.ust != null)?.ust ?? null;
    [alt, ust].forEach((v) => v != null && ys.push(v));
    if (alt != null || ust != null) bant = [alt, ust];
  }
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pay = (hi - lo) * 0.08;
  lo -= pay; hi += pay;
  if (etkin === 'deger' && hamMin >= 0 && lo < 0) lo = 0;
  const px = (t) => KL + ((t - t0) / (t1 - t0)) * (W - KL - KR);
  const py = (v) => KT + (1 - (v - lo) / (hi - lo)) * (H - KT - KB);
  const fmtY = etkin === 'yuzde' ? (v) => (v > 0 ? '+' : '') + TR.format(Math.round(v)) + '%'
    : etkin === 'ref' ? (v) => TR.format(+v.toFixed(2)) : (v) => TR.format(+v.toPrecision(3));

  const gun = (t1 - t0) / GUN;
  const bicim = gun > 400 ? { month: 'short', year: 'numeric' } : gun > 40 ? { day: 'numeric', month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' };
  const nx = W < 420 ? 3 : 5;
  const xTick = [...Array(nx)].map((_, i) => t0 + ((t1 - t0) * i) / (nx - 1));
  const yTick = guzelTick(lo, hi, H < 340 ? 4 : 5).filter((v) => v >= lo && v <= hi);
  const birimYazi = etkin === 'deger' ? (gor[0]?.birim || '') : etkin === 'yuzde' ? 'ilk değere göre % değişim' : '0 = referans alt sınırı · 1 = üst sınırı';

  let g = '';
  if (bant) {
    const ya = py(Math.min(bant[1] ?? hi, hi)), yb = py(Math.max(bant[0] ?? lo, lo));
    g += `<rect class="k-bant" x="${KL}" y="${ya.toFixed(1)}" width="${W - KL - KR}" height="${Math.max(yb - ya, 1).toFixed(1)}"/>`;
  }
  g += yTick.map((v) => `<line class="k-izgara" x1="${KL}" x2="${W - KR}" y1="${py(v).toFixed(1)}" y2="${py(v).toFixed(1)}"/><text class="k-yazi" x="${KL - 6}" y="${(py(v) + 3).toFixed(1)}" text-anchor="end">${esc(fmtY(v))}</text>`).join('');
  if (etkin === 'yuzde' && lo < 0 && hi > 0) g += `<line class="k-sifir" x1="${KL}" x2="${W - KR}" y1="${py(0).toFixed(1)}" y2="${py(0).toFixed(1)}"/>`;
  g += `<line class="k-eksen" x1="${KL}" x2="${KL}" y1="${KT}" y2="${H - KB}"/><line class="k-eksen" x1="${KL}" x2="${W - KR}" y1="${H - KB}" y2="${H - KB}"/>`;
  g += xTick.map((t, i) => `<text class="k-yazi" x="${px(t).toFixed(1)}" y="${H - 10}" text-anchor="${i === 0 ? 'start' : i === nx - 1 ? 'end' : 'middle'}">${esc(tarihKisa(t, bicim))}</text>`).join('');
  g += `<text class="k-yazi" x="${KL}" y="12">${esc(birimYazi)}</text>`;

  const noktalar = [];
  for (const c of cs) {
    const koord = c.pts.map((p) => ({ x: px(p.n.t), y: py(p.y), c, p }));
    noktalar.push(...koord);
    if (koord.length > 1) g += `<polyline class="k-cizgi" stroke="${c.renk}" points="${koord.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}"/>`;
    g += koord.map((q) => `<circle class="k-nokta${q.p.n.durum === 'yuksek' || q.p.n.durum === 'dusuk' ? ' dis' : ''}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="4.5" fill="${c.renk}"/>`).join('');
  }
  g += `<g id="k-ust" style="display:none"><line class="k-cap" id="k-cap" y1="${KT}" y2="${H - KB}"/><circle class="k-vur" id="k-vur" r="8"/></g>` +
    `<rect id="k-sec" class="k-secim" y="${KT}" height="${H - KT - KB}" style="display:none"/>` +
    `<rect id="k-fare" x="${KL}" y="${KT}" width="${W - KL - KR}" height="${H - KT - KB}" fill="transparent"/>`;
  $('karsi-grafik').innerHTML = `<svg id="k-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Seçili tahlillerin zaman grafiği">${g}</svg>`;
  $('karsi-ipucu').hidden = true;
  cizim = {
    W, H, t0, t1, etkin, fmtY, noktalar,
    lejant: cs.map((c) => ({ ad: c.s.ad + (c.s.birim ? ` (${c.s.birim})` : ''), renk: c.renk })),
    alt: `${{ deger: 'Gerçek değer', yuzde: '% değişim', ref: 'Referansa göre' }[etkin]} · ${tarihKisa(t0, { dateStyle: 'medium' })} – ${tarihKisa(t1, { dateStyle: 'medium' })}`,
  };
}

function karsiTablo(secs) {
  const yon = (f) => (f > 0 ? '↑' : f < 0 ? '↓' : '→');
  const sat = secs.map((s) => {
    const baslik = `<th><span class="k-nokta-i" style="background:${renk.get(s.anahtar)}"></span>${esc(s.ad)}${s.birim ? ` <small class="muted">${esc(s.birim)}</small>` : ''}</th>`;
    const p = s.nokta.filter(aralikta);
    const soluk = gizli.has(s.anahtar) ? ' class="soluk"' : '';
    if (!p.length) return `<tr${soluk}>${baslik}<td colspan="6" class="muted">Bu aralıkta veri yok</td></tr>`;
    const ilk = p[0], son = p.at(-1);
    const hucre = (n) => `${esc(n.op)}${TR.format(n.v)}<small class="muted"> ${esc(tarihTR(n.iso))}</small>`;
    let degisim = '<td class="muted">—</td>';
    if (p.length > 1) {
      const fark = son.v - ilk.v;
      const yuzde = ilk.v !== 0 ? (fark / Math.abs(ilk.v)) * 100 : null;
      const belirgin = yuzde != null && Math.abs(yuzde) >= 20 ? ' belirgin' : '';
      degisim = `<td class="k-fark${belirgin}">${yon(fark)} ${fark > 0 ? '+' : ''}${TR.format(+fark.toPrecision(3))}${yuzde != null ? ` <small>(%${TR.format(Math.round(yuzde))})</small>` : ''}</td>`;
    }
    const durum = son.durum === 'yuksek' ? ' <span class="yuksek">yüksek</span>' : son.durum === 'dusuk' ? ' <span class="dusuk">düşük</span>' : '';
    const enAz = p.reduce((a, n) => (n.v < a.v ? n : a)), enCok = p.reduce((a, n) => (n.v > a.v ? n : a));
    return `<tr${soluk}>${baslik}<td>${hucre(ilk)}</td><td>${hucre(son)}${durum}</td>${degisim}<td>${hucre(enAz)}</td><td>${hucre(enCok)}</td><td>${p.length}</td></tr>`;
  });
  $('karsi-tablo').innerHTML = secs.length
    ? '<tr><th>Tahlil</th><th>İlk</th><th>Son</th><th>Değişim</th><th>En düşük</th><th>En yüksek</th><th>Ölçüm</th></tr>' + sat.join('')
    : '';
}

// Küçük grafik kartlarındaki "Karşılaştır" düğmeleri
function kartDugmeleri() {
  document.querySelectorAll('[data-karsi]').forEach((b) => {
    const acik = secili.includes(b.dataset.karsi);
    b.setAttribute('aria-pressed', acik);
    b.textContent = acik ? '✓ Karşılaştırmada' : '＋ Karşılaştır';
  });
}

// --- Fare / dokunma: ipucu ve sürükleyerek yakınlaştırma
let surukle = null;
function svgKonum(e) {
  const r = $('k-svg').getBoundingClientRect();
  return { x: ((e.clientX - r.left) * cizim.W) / r.width, y: ((e.clientY - r.top) * cizim.H) / r.height, r };
}

function imlec(e) {
  if (!cizim) return;
  const { x, y, r } = svgKonum(e);
  let en = null, d = Infinity;
  for (const q of cizim.noktalar) {
    const dd = (q.x - x) ** 2 + (q.y - y) ** 2 * 0.15;
    if (dd < d) { d = dd; en = q; }
  }
  if (!en) return;
  const ayni = cizim.noktalar.filter((q) => q.p.n.t === en.p.n.t);
  $('k-cap').setAttribute('x1', en.x); $('k-cap').setAttribute('x2', en.x);
  $('k-vur').setAttribute('cx', en.x); $('k-vur').setAttribute('cy', en.y); $('k-vur').style.stroke = en.c.renk;
  $('k-ust').style.display = '';
  const ref = (n) => (n.alt != null || n.ust != null ? ` · ref ${n.alt != null ? TR.format(n.alt) : '…'}–${n.ust != null ? TR.format(n.ust) : '…'}` : '');
  const ip = $('karsi-ipucu');
  ip.innerHTML = `<div class="k-ip-tarih">${esc(tarihTR(en.p.n.iso))}</div>` + ayni.map((q) => {
    const n = q.p.n;
    const dur = n.durum === 'yuksek' ? ' <span class="yuksek">yüksek</span>' : n.durum === 'dusuk' ? ' <span class="dusuk">düşük</span>' : '';
    const yuzde = cizim.etkin === 'yuzde' ? ` <span class="muted">(${esc(cizim.fmtY(q.p.y))})</span>` : '';
    return `<div class="k-ip-sat"><span class="k-nokta-i" style="background:${q.c.renk}"></span><span>${esc(q.c.s.ad)}</span><b>${esc(n.op)}${TR.format(n.v)} ${esc(q.c.s.birim)}</b>${yuzde}${dur}<small class="muted">${esc(ref(n).replace(/^ · /, ''))}</small></div>`;
  }).join('');
  ip.hidden = false;
  const kap = $('karsi-kap').getBoundingClientRect();
  const sol = (en.x / cizim.W) * r.width + (r.left - kap.left);
  const ust = (en.y / cizim.H) * r.height + (r.top - kap.top);
  ip.style.left = sol + 'px';
  ip.style.top = Math.min(Math.max(ust, 50), kap.height - 50) + 'px';
  ip.classList.toggle('sol', sol > kap.width * 0.55);
}

function ipucuGizle() {
  if ($('k-ust')) $('k-ust').style.display = 'none';
  $('karsi-ipucu').hidden = true;
}

const harita_ = $('karsi-grafik');
harita_.addEventListener('pointerdown', (e) => {
  if (e.target.id !== 'k-fare' || !cizim) return;
  surukle = { x0: svgKonum(e).x, hareket: false };
  e.target.setPointerCapture?.(e.pointerId);
});
harita_.addEventListener('pointermove', (e) => {
  if (!cizim || e.target.id !== 'k-fare') return;
  if (!surukle) { imlec(e); return; }
  const x = Math.min(Math.max(svgKonum(e).x, KL), cizim.W - KR);
  if (Math.abs(x - surukle.x0) > 6) {
    surukle.hareket = true;
    ipucuGizle();
    const r = $('k-sec');
    r.setAttribute('x', Math.min(x, surukle.x0)); r.setAttribute('width', Math.abs(x - surukle.x0)); r.style.display = '';
  }
});
const surukleBitir = (e) => {
  if (!surukle || !cizim) return;
  const s = surukle;
  surukle = null;
  $('k-sec')?.style && ($('k-sec').style.display = 'none');
  if (!s.hareket) { if (e.pointerType !== 'mouse') imlec(e); return; }
  const x = Math.min(Math.max(svgKonum(e).x, KL), cizim.W - KR);
  const t = (px) => cizim.t0 + ((px - KL) / (cizim.W - KL - KR)) * (cizim.t1 - cizim.t0);
  const [a, b] = [t(s.x0), t(x)].sort((m, n) => m - n);
  if (b - a < GUN) return; // en az bir gün
  aralik = { t0: Math.floor(a / GUN) * GUN, t1: Math.ceil(b / GUN) * GUN, etiket: 'ozel' };
  karsiCiz();
};
harita_.addEventListener('pointerup', surukleBitir);
harita_.addEventListener('pointercancel', () => { surukle = null; });
harita_.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !surukle) ipucuGizle(); });
harita_.addEventListener('dblclick', () => { if (aralik) { aralik = null; karsiCiz(); } });

// PNG: eksen, çizgiler ve açıklama
function karsiPng() {
  const svg = $('k-svg');
  if (!svg || !cizim) return;
  const R = pngTema();
  const kopya = svg.cloneNode(true);
  kopya.querySelectorAll('#k-ust,#k-sec,#k-fare').forEach((el) => el.remove());
  let lx = 12, satir = 0, lej = '';
  for (const l of cizim.lejant) {
    const w = l.ad.length * 6.4 + 26;
    if (lx + w > cizim.W - 12 && lx > 12) { lx = 12; satir++; }
    const ly = 56 + satir * 16;
    lej += `<circle cx="${lx + 4}" cy="${ly - 3.5}" r="4" fill="${l.renk}"/><text x="${lx + 13}" y="${ly}" fill="${R.text}" font-family="sans-serif" font-size="11">${esc(l.ad)}</text>`;
    lx += w;
  }
  const ust = 56 + satir * 16 + 12;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${cizim.W * 3}" height="${(cizim.H + ust) * 3}" viewBox="0 0 ${cizim.W} ${cizim.H + ust}">` +
    `<style>${pngStil(R)}</style><rect width="100%" height="100%" fill="${R.bg}"/>` +
    `<text x="12" y="20" fill="${R.text}" font-family="sans-serif" font-size="14" font-weight="600">Tahlil karşılaştırması</text>` +
    `<text x="12" y="37" fill="${R.muted}" font-family="sans-serif" font-size="9.5">${esc(cizim.alt)}</text>${lej}` +
    `<g transform="translate(0 ${ust})">${kopya.innerHTML}</g></svg>`;
  pngYaz(xml, cizim.W, cizim.H + ust, 'tahlil-karsilastirma');
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
$('yazdir').addEventListener('click', () => { $('satir-kutu').open = false; print(); });
$('grafikler').addEventListener('click', (e) => {
  const id = e.target.closest('[data-png]')?.dataset.png;
  if (id) { pngIndir(id); return; }
  const k = e.target.closest('[data-karsi]')?.dataset.karsi;
  if (k) { if (secili.includes(k)) birak(k); else sec(k); karsiCiz(); }
});

// Karşılaştırma denetimleri
$('karsi-chips').addEventListener('click', (e) => {
  const k = e.target.closest('[data-k]')?.dataset.k;
  if (!k) return;
  if (secili.includes(k)) birak(k); else sec(k);
  karsiCiz();
});
$('karsi-secili').addEventListener('click', (e) => {
  const gizle = e.target.closest('[data-gizle]')?.dataset.gizle;
  const kaldir = e.target.closest('[data-kaldir]')?.dataset.kaldir;
  if (gizle) { if (gizli.has(gizle)) gizli.delete(gizle); else gizli.add(gizle); }
  else if (kaldir) birak(kaldir);
  else return;
  karsiCiz();
});
$('karsi-mod').addEventListener('click', (e) => {
  const m = e.target.closest('[data-mod]')?.dataset.mod;
  if (m) { mod = m; karsiCiz(); }
});
$('karsi-aralik').addEventListener('click', (e) => {
  const gun = e.target.closest('[data-ar]')?.dataset.ar;
  if (gun == null) return;
  if (gun === '0') aralik = null;
  else {
    const son = Math.max(...tumSeriler().map((s) => s.nokta.at(-1).t));
    aralik = { t0: son - +gun * GUN, t1: son, etiket: gun };
  }
  karsiCiz();
});
$('karsi-ara').addEventListener('input', karsiCiz);
$('karsi-dikkat').addEventListener('click', () => {
  secili = []; renk.clear(); gizli.clear();
  tumSeriler().filter((s) => degerlendir(s).dikkat).forEach((s) => sec(s.anahtar));
  karsiCiz();
});
$('karsi-temizle').addEventListener('click', () => { secili = []; renk.clear(); gizli.clear(); karsiUyari = ''; karsiCiz(); });
$('karsi-png').addEventListener('click', karsiPng);
// Genişlik değişince (döndürme, pencere) grafiği yeniden ölç
let boyutZaman;
new ResizeObserver(() => {
  clearTimeout(boyutZaman);
  boyutZaman = setTimeout(() => {
    const w = Math.round($('karsi-grafik').clientWidth);
    if (cizim && Math.abs(w - cizim.W) > 4) karsiCiz();
  }, 120);
}).observe($('karsi-kap'));
$('satirlar').addEventListener('change', (e) => { if (e.target.dataset.alan) satirDuzelt(e.target); });
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
