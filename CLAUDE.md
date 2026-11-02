# BT Anatomi Atlası

Gerçek bir abdomen-pelvis BT'si üzerinde Türkçe etiketli, tarayıcıda çalışan etkileşimli atlas. Canlı site GitHub Pages ile `main` dalının `docs/` klasöründen yayınlanır; `main`'e her push siteyi günceller.

## Dosya haritası

| Yol | İçerik |
|---|---|
| `docs/index.html`, `docs/home.js`, `docs/home.css` | Ana sayfa: üç bölüm kapısı (Atlaslar, Simülasyon, Araçlar) ve son eklenenler (`pano/pano.json`) |
| `docs/atlaslar.html`, `docs/atlaslar.js` | Vaka listeleri: Normal BT, Patoloji BT, Laparoskopi sekmeleri (`data/cases.json`, `data/lapa_cases.json`) |
| `docs/araclar.html`, `docs/sim.html`, `docs/araclar.js` | Araç ve simülasyon listeleri; `pano/araclar.json`, `pano/simulasyon.json` (`grup` alanı başlığı belirler) |
| `docs/shell.js`, `docs/shell.css` | Her sayfada üst menü, konum izi, arama düğmesi, EKG sayfaları arası sekmeler, kalıcı site alt bilgisi (sayfadaki `footer.foot` notları oraya taşınır) ve bölüm renkleri (`<html data-bolum>`: Atlaslar mavi, Simülasyon sarı, Araçlar kırmızı) |
| `docs/kaynaklar.html` | Yararlanılan kaynaklar: veri seti, model ve yazılım atıflarının tek yeri. Yeni veri/kütüphane eklenince buraya yaz; sayfalara ayrıca atıf satırı koyma |
| `docs/atlas.html`, `docs/style.css` | Atlas arayüzü; durum `#c=vaka&p=düzlem&…` bağlantısında |
| `docs/mpr.js`, `docs/mpr.css`, `docs/mesh-worker.js` | Atlasta "Üçlü + 3B" görünümü: üç senkron kesit, artı imleci, Three.js 3B sahnesi. `mpr.js` hacmi ve durumu `app.js`'ten `mprKur(api)` ile alır; 3B yüzeyler etiket hacminden tarayıcıda üretilir (`mesh-worker.js`, Surface Nets, ek veri yok) |
| `docs/gecis.js`, `docs/home-3d.js` | `gecis.js`: atlas sayfalarına geçişte saf WebGL noise perdesi; atlasta `<html data-perde-bekle>` ile veri gelene kadar yüzde gösterir. `home-3d.js`: ana sayfa kahramanındaki 3B kalp ve nabız halkası (hareket azalt, ekran dışı ve gizli sekmede durur) |
| `docs/premium.css`, `docs/ui.js`, `docs/atlas-ui.js` | Tüm sayfalarda son yüklenen görünüm katmanı (koyu/açık tema, `data-theme`); `ui.js` SVG ikonlar (`UI.icon`) ve tema anahtarı, `atlas-ui.js` atlasta odak modu, alt gezinme çubuğu ve kaydırıcı balonu |
| `docs/sw.js` | Servis çalışanı: `?v=` sürümlü `.bin.gz` hacimlerini önbelleğe alır; veri değişince `atlas.json`'daki `v` değişir |
| `docs/app.js` | Tüm uygulama: veri yükleme (`load`), kesit çizimi (`renderSlice`, `draw`), etiketler (`drawLabels`), olaylar (`bindEvents`), test modu (`quiz*`) |
| `docs/lapa.html`, `docs/lapa.js`, `docs/lapa.css` | Laparoskopik atlas (prototip); durum `#c=vaka&f=kare&y=yapı`, "BT'de göster" → `atlas.html#c=s0139&y=…` |
| `docs/lapav.html`, `docs/lapav.js` | Laparoskopik video modu; video + üstte çokgen katmanı (`video.json`), durum `#c=vaka&t=sn&k=filtreler&y=yapı` |
| `docs/data/<vaka>/`, `docs/data/cases.json` | Vaka başına üretilmiş web verisi (vakalar `CASES` sözlüğünde, `build_atlas.py`): `ct.bin.gz` (int16 HU), `labels.bin.gz` ve `overlay.bin.gz` (uint8), `atlas.json` |
| `scripts/build_atlas.py` | Atlas üretimi; Türkçe adlar, renkler ve sistemler `BASE` sözlüğünde, segment notları `LIVER_SEGMENTS`'te |
| `scripts/fetch_dsad.py`, `scripts/build_lapa.py` | DSAD karelerini indirir / laparoskopi web verisini üretir (`docs/data/lapa01/`, `docs/data/lapa_cases.json`, `docs/img/lapa01.jpg`); maskeler uint8 bit maskesi |
| `scripts/build_lapa_video.py` | Açık lisanslı videodan klip + SAM 2 kare kare izleme → `docs/data/lapav01/` (`video.mp4`, `video.json`, `poster.jpg`); istem noktaları `CASES[...]["prompts"]` |
| `scripts/fetch_case.py` | TotalSegmentator veri setinden tek vaka indirir |
| `data/segments/` | Karaciğer segment maskeleri (NIfTI) |

Hacimler bellekte `[z][y][x]` sırasındadır, `atlas.json`'daki `dims` ise `[x, y, z]`'dir. Yön RAS; ekranda radyolojik yön (hastanın sağı ekranın solunda).

## Çalıştırma

- Site: `.claude/launch.json` içindeki `atlas` sunucusu (`python scripts/serve.py 8770 docs`; yerleşik `http.server` gibi ama video sarma için aralık isteği destekli)
- Atlası yeniden üretmek: `rebuild-atlas` skill'i

## Kurallar

- Derleme adımı yok. Harici kütüphaneler CDN'den, sabit sürümle, ES modülü olarak yüklenir.
- Arayüz metinleri ve kod yorumları Türkçe.
- Her özellik mobilde de çalışmalı (dokunma, dar ekran).
- TotalSegmentator atfı (CC BY 4.0) arayüzde ve README'de korunur; "eğitim amaçlıdır, tanı için kullanılamaz" notu kalır.
- Yalnızca açık lisanslı, anonim veri setleri kullanılır.

## Okunmayacak dosyalar

`docs/data/**`, `data/**` ve `.venv/**` ikili veya çok büyük dosyalardır (`atlas.json` tek başına ~170 KB). Bunları Read ile açma, `.venv` üzerinde `du` veya `find` çalıştırma. `atlas.json` gerekiyorsa yalnızca yapısını Python ile özetle:

```bash
.venv/Scripts/python -c "import json;d=json.load(open('docs/data/s0139/atlas.json',encoding='utf-8'));print({k:len(v) if hasattr(v,'__len__') else v for k,v in d.items()})"
```

Uzun süren komutların (TotalSegmentator, build) çıktısını dosyaya yönlendir, yalnızca son satırlarına bak.
