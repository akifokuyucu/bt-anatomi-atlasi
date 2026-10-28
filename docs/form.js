// Klinik form motoru: formlar/*.json şablonundan düzenlenebilir, yazdırılabilir form üretir.
// Yazılanlar yalnızca bu modülün belleğindedir; ağa gönderilmez, depolanmaz.
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let liste = [];            // formlar/index.json
let sablon = null;         // yüklü form şablonu
let duzen = null;          // seçili düzen
let acik = new Set();      // açık bölüm seçenekleri
const veriler = {};        // form başına doldurulan değerler: { formId: { alanId: değer } }
let veri = {};

const sayfaStili = document.head.appendChild(document.createElement('style'));

// ---------- Bağlantı durumu: #f=form&d=düzen&o=seçenekler (yalnızca ayar; içerik değil) ----------
function hashOku() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { f: p.get('f'), d: p.get('d'), o: p.get('o') };
}
function hashYaz() {
  const p = new URLSearchParams();
  p.set('f', sablon.id);
  p.set('d', duzen.id);
  p.set('o', [...acik].join(','));
  history.replaceState(null, '', '#' + p);
}

// ---------- Yükleme ----------
async function yukle(f, d, o) {
  const kayit = liste.find((x) => x.id === f) || liste[0];
  if (!sablon || sablon.id !== kayit.id) {
    sablon = await (await fetch(`formlar/${kayit.id}.json`)).json();
    veri = veriler[sablon.id] ||= {};
    acik = new Set((sablon.secenekler || []).filter((s) => s.varsayilan).map((s) => s.id));
  }
  if (o !== null && o !== undefined) acik = new Set(o.split(',').filter(Boolean));
  duzen = sablon.duzenler.find((x) => x.id === d) || sablon.duzenler[0];
  kontrolCiz();
  kagitCiz();
  hashYaz();
}

// ---------- Kontrol paneli ----------
function kontrolCiz() {
  document.title = `${sablon.ad} · Klinik Atlas`;
  $('baslik').textContent = sablon.ad;
  $('formlar').innerHTML = liste.map((x) =>
    `<button type="button" class="sekme" role="tab" data-form="${esc(x.id)}" aria-selected="${x.id === sablon.id}" title="${esc(x.aciklama)}">${esc(x.ad)}</button>`).join('');
  $('duzenler').innerHTML = sablon.duzenler.map((x) =>
    `<button type="button" class="sekme" role="tab" data-duzen="${esc(x.id)}" aria-selected="${x.id === duzen.id}">${esc(x.ad)}</button>`).join('');
  $('duzen-aciklama').textContent = duzen.aciklama || '';
  // Yalnızca bu düzende bir bölümü açıp kapatan seçenekler gösterilir
  const sec = (sablon.secenekler || []).filter((s) => duzen.bolumler.some((b) => b.secenek === s.id) || (sablon.ust || []).some((b) => b.secenek === s.id));
  $('secenek-kutu').hidden = !sec.length;
  $('secenekler').innerHTML = sec.map((s) =>
    `<label><input type="checkbox" data-secenek="${esc(s.id)}" ${acik.has(s.id) ? 'checked' : ''}> ${esc(s.etiket)}</label>`).join('');
  sayfaStili.textContent = `@page { size: A4 ${duzen.yon === 'yatay' ? 'landscape' : 'portrait'}; margin: 12mm; }`;
}

// ---------- Kâğıt ----------
const gorunur = (b) => !b.secenek || acik.has(b.secenek);
const bolumler = () => [...(sablon.ust || []), ...duzen.bolumler].filter(gorunur);

function ornekHtml(b) {
  if (!b.ornekler?.length) return '';
  return `<div class="ornek" aria-label="Örnek ifadeler">${b.ornekler.map((m) =>
    `<button type="button" data-ekle="${esc(b.id)}" data-m="${esc(m)}">+ ${esc(m)}</button>`).join('')}</div>`;
}

function bolumHtml(b) {
  const etiket = `<span class="k-etiket">${esc(b.etiket)}</span>`;
  const v = veri[b.id];
  if (b.tip === 'alan') {
    return `<div class="k-b${b.genislik === 'yarim' ? ' yarim' : ''}">${etiket}${ornekHtml(b)}<input type="text" data-id="${esc(b.id)}" value="${esc(v)}" placeholder="${esc(b.ipucu || '')}" autocomplete="off"></div>`;
  }
  if (b.tip === 'metin') {
    return `<div class="k-b">${etiket}${ornekHtml(b)}<textarea data-id="${esc(b.id)}" data-satir="${b.satir || 3}" rows="${b.satir || 3}" placeholder="${esc(b.ipucu || '')}">${esc(v)}</textarea></div>`;
  }
  if (b.tip === 'onay') {
    const secili = Array.isArray(v) ? v : [];
    return `<div class="k-b">${etiket}<div class="k-onay">${b.secenekler.map((s, i) =>
      `<label><input type="checkbox" data-onay="${esc(b.id)}" data-i="${i}" ${secili.includes(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div></div>`;
  }
  if (b.tip === 'tablo') {
    const baslik = b.sutunlar.map((s) => `<th>${esc(s)}</th>`).join('');
    const satirlar = Array.from({ length: b.satir || 3 }, (_, r) =>
      `<tr>${b.sutunlar.map((s, c) => `<td><input class="hucre" data-tablo="${esc(b.id)}" data-r="${r}" data-c="${c}" value="${esc(v?.[r]?.[c])}" aria-label="${esc(s)}" autocomplete="off"></td>`).join('')}</tr>`).join('');
    const toplam = (b.genislik || []).reduce((a, g) => a + g, 0);
    const sutunlar = toplam ? `<colgroup>${b.genislik.map((g) => `<col style="width:${((g / toplam) * 100).toFixed(1)}%">`).join('')}</colgroup>` : '';
    return `<div class="k-b">${etiket}<div class="k-tablo-kap"><table class="k-tablo">${sutunlar}<tr>${baslik}</tr>${satirlar}</table></div></div>`;
  }
  return '';
}

function kagitCiz() {
  $('kagit').innerHTML =
    `<h2><span>${esc(sablon.baslik || sablon.ad)}</span><small>${esc(duzen.ad)}</small></h2>` +
    `<div class="k-izgara">${bolumler().map(bolumHtml).join('')}</div>` +
    '<p class="k-sonuc">Klinik Atlas · taslak şablon, kurum formunun yerini tutmaz</p>';
  $('kagit').querySelectorAll('textarea').forEach(otoBoy);
}

function otoBoy(t) {
  t.style.height = 'auto';
  t.style.height = Math.max(t.scrollHeight, (+t.dataset.satir || 3) * 22) + 'px';
}

// ---------- Metin olarak dışa aktarma ----------
function duzMetin() {
  const cikti = [`${sablon.baslik || sablon.ad} — ${duzen.ad}`];
  let alanBlogu = false; // üstteki kısa alanlar (tarih, yer, hasta…) alt alta tek blokta kalsın
  for (const b of bolumler()) {
    const v = veri[b.id];
    if (b.tip === 'alan') {
      if (!v?.trim()) continue;
      const satir = `${b.etiket}: ${v.trim()}`;
      if (alanBlogu) cikti[cikti.length - 1] += `\n${satir}`;
      else cikti.push(satir);
      alanBlogu = true;
      continue;
    }
    alanBlogu = false;
    if (b.tip === 'metin' && v?.trim()) cikti.push(`${b.etiket}:\n${v.trim()}`);
    else if (b.tip === 'onay' && v?.length) cikti.push(`${b.etiket}: ${v.join(', ')}`);
    else if (b.tip === 'tablo') {
      const dolu = (v || []).filter((r) => r?.some((h) => h?.trim()));
      const satirlar = dolu.map((r) => b.sutunlar.map((_, c) => (r[c] || '').trim()).join(' | '));
      if (dolu.length) cikti.push(`${b.etiket}:\n${b.sutunlar.join(' | ')}\n${satirlar.join('\n')}`);
    }
  }
  return cikti.join('\n\n');
}

async function panoyaKopyala() {
  const metin = duzMetin();
  try {
    await navigator.clipboard.writeText(metin);
  } catch {
    const t = document.createElement('textarea');
    t.value = metin;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  bilgi('Panoya kopyalandı. Yalnızca doldurduğunuz alanlar dahildir.');
}

let bilgiZamani;
function bilgi(m) {
  $('bilgi').textContent = m;
  clearTimeout(bilgiZamani);
  bilgiZamani = setTimeout(() => { $('bilgi').textContent = ''; }, 4000);
}

// ---------- Olaylar ----------
$('kagit').addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.id) {
    veri[t.dataset.id] = t.value;
    if (t.tagName === 'TEXTAREA') otoBoy(t);
  } else if (t.dataset.tablo) {
    const a = (veri[t.dataset.tablo] ||= []);
    (a[+t.dataset.r] ||= [])[+t.dataset.c] = t.value;
  } else if (t.dataset.onay) {
    const b = bolumler().find((x) => x.id === t.dataset.onay);
    const kutular = [...$('kagit').querySelectorAll(`input[data-onay="${CSS.escape(t.dataset.onay)}"]`)];
    if (b.tek && t.checked) kutular.forEach((k) => { if (k !== t) k.checked = false; });
    veri[t.dataset.onay] = kutular.filter((k) => k.checked).map((k) => b.secenekler[+k.dataset.i]);
  }
});

$('kagit').addEventListener('click', (e) => {
  const d = e.target.closest('[data-ekle]');
  if (!d) return;
  const alan = $('kagit').querySelector(`[data-id="${CSS.escape(d.dataset.ekle)}"]`);
  if (!alan) return;
  const m = d.dataset.m;
  if (alan.tagName === 'TEXTAREA') alan.value = alan.value.trim() ? alan.value.replace(/\n*$/, '\n') + m : m;
  else alan.value = m;
  veri[d.dataset.ekle] = alan.value;
  if (alan.tagName === 'TEXTAREA') otoBoy(alan);
  alan.focus();
});

$('formlar').addEventListener('click', (e) => {
  const f = e.target.closest('[data-form]')?.dataset.form;
  if (f && f !== sablon.id) yukle(f, null, null);
});
$('duzenler').addEventListener('click', (e) => {
  const d = e.target.closest('[data-duzen]')?.dataset.duzen;
  if (d) { duzen = sablon.duzenler.find((x) => x.id === d); kontrolCiz(); kagitCiz(); hashYaz(); }
});
$('secenekler').addEventListener('change', (e) => {
  const s = e.target.dataset.secenek;
  if (!s) return;
  if (e.target.checked) acik.add(s); else acik.delete(s);
  kagitCiz();
  hashYaz();
});

$('yazdir').addEventListener('click', () => print());
$('kopyala').addEventListener('click', panoyaKopyala);
$('ornek').addEventListener('click', () => {
  Object.assign(veri, structuredClone(duzen.ornek || {}));
  kagitCiz();
  bilgi('Örnek (uydurma) değerler dolduruldu. Gerçek hasta bilgisi değildir.');
});
$('temizle').addEventListener('click', () => {
  for (const k of Object.keys(veri)) delete veri[k];
  kagitCiz();
  bilgi('Tüm alanlar temizlendi.');
});

addEventListener('resize', () => $('kagit').querySelectorAll('textarea').forEach(otoBoy));
addEventListener('hashchange', () => {
  const h = hashOku();
  if (!sablon || h.f !== sablon.id || h.d !== duzen.id) yukle(h.f, h.d, h.o);
});

// ---------- Başlat ----------
(async () => {
  try {
    liste = await (await fetch('formlar/index.json')).json();
    const h = hashOku();
    await yukle(h.f, h.d, h.o);
  } catch {
    $('kagit').innerHTML = '<p>Formlar yüklenemedi. Sayfayı yenileyin.</p>';
  }
})();
