# BT Anatomi Atlası (prototip)

Gerçek bir kontrastlı abdomen-pelvis BT'si üzerinde renkli organ maskeleri ve çizgili Türkçe etiketler gösteren, tarayıcıda çalışan etkileşimli atlas.

**Canlı site:** https://akifokuyucu.github.io/bt-anatomi-atlasi/

Site GitHub Pages ile `main` dalının `docs/` klasöründen yayınlanır; `main`'e her push siteyi bir iki dakika içinde günceller.

## Yerelde çalıştırma

```bash
python -m http.server 8765 --directory docs
```

Sonra tarayıcıda `http://localhost:8765` adresini açın. Kurulum veya derleme adımı gerekmez.

## Özellikler

- Aksiyel, koronal ve sagittal düzlemler (radyolojik yön: hastanın sağı ekranın solunda)
- 9 sistemi aç/kapat: organlar, karaciğer segmentleri, sindirim, üriner, arterler, venler, kemikler, kaslar, toraks
- Couinaud karaciğer segmentleri (I–VIII): açıkken karaciğerin yerini alır, her segmentin kısa anatomik notu vardır
- Çizgili etiketler; görüntüye veya etikete dokununca yapı seçilir, diğerleri soluklaşır
- Yapı listesi, arama ("pankreas", "L3"…), "bu kesitte" filtresi ve her düzlemde odaklama
- Pencere ayarları: yumuşak doku, karaciğer, damar, kemik, akciğer; imlecin altındaki HU değeri
- Kendini test et: vurgulanan yapı için 4 seçenekli soru ve skor
- Kesit değiştirme: fare tekerleği, sürükleme, ok tuşları; yakınlaştırma: Ctrl+tekerlek, iki parmak, +/−
- Kısayollar: `1` `2` `3` düzlem, `Esc` seçimi kaldırır

## Laparoskopik anatomi (prototip)

`docs/lapa.html`: robotik ameliyat karelerinde organlar renkli maske, kontur ve Türkçe etiketle gösterilir. Bir yapıya dokununca laparoskopide tanıma notu çıkar; "BT'de göster" aynı yapıyı BT atlasında seçili olarak açar (`atlas.html#c=s0139&y=<yapı>`). Test modu ve paylaşılabilir bağlantı (`#c=lapa01&f=<kare>&y=<yapı>`) vardır.

`docs/lapav.html` (video modu): laparoskopi videosu katmansız akar; filtre düğmesine basınca seçilen yapılar videoyla eş zamanlı olarak üstüne çizilir. Maskeler `scripts/build_lapa_video.py` ile SAM 2 (Apache 2.0) kullanılarak yarı otomatik üretilir: birkaç anahtar karede istem noktası verilir, ara kareler önceki karenin maskesiyle izlenir; sonuç kare başına çokgen olarak `video.json`a yazılır. Bağlantı: `#c=lapav01&t=<sn>&k=<filtreler>&y=<yapı>`.

| Adım | Dosya |
|---|---|
| Kare indirme: Hugging Face `nct-tso/dsad` parquet dosyalarından yalnızca gereken parçalar | `scripts/fetch_dsad.py` → `data/raw/dsad/` |
| Web verisi: WebP kareler, `labels.bin.gz` (uint8 bit maskesi, örtüşen yapılar için), `lapa.json`, kapak görseli | `scripts/build_lapa.py` → `docs/data/lapa01/` |

```bash
.venv/Scripts/python scripts/fetch_dsad.py --split validation --n 16
.venv/Scripts/python scripts/build_lapa.py --case lapa01
```

Araştırma notları ve yol haritası: `arastirma/laparoskopik-robotik-cerrahi.md`.

## Veri hattı

| Adım | Dosya |
|---|---|
| Vaka: TotalSegmentator veri seti `s0139`, 30 yaş kadın, normal, portal venöz faz, 1,5 mm izotropik | `data/raw/s0139/` |
| Karaciğer segmentleri: TotalSegmentator `liver_segments` görevi, CPU'da | `data/segments/s0139/` |
| Atlas üretimi: kırpma, tek etiket hacmi, segment katmanı, Türkçe katalog, kesit başına etiket noktaları | `scripts/build_atlas.py` |
| Web verisi: `ct.bin.gz` (int16 HU), `labels.bin.gz` ve `overlay.bin.gz` (uint8), `atlas.json` | `docs/data/<vaka>/` |

Segmentler `total` görevinin karaciğer maskesine kırpılır; maskede segmentsiz kalan vokseller en yakın segmente atanır. Böylece segmentler karaciğeri boşluksuz böler.

Atlası yeniden üretmek için:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python scripts/fetch_case.py s0139
.venv/Scripts/TotalSegmentator -i data/raw/s0139/ct.nii.gz -o data/segments/s0139 -ta liver_segments --device cpu
.venv/Scripts/python scripts/build_atlas.py data/raw/s0139 docs/data/s0139 data/segments/s0139
```

TotalSegmentator yalnızca segment adımı için gerekir (PyTorch dahil ~1 GB). Üçüncü argüman verilmezse atlas segmentsiz üretilir.

Türkçe adlar, renkler ve sistemler `scripts/build_atlas.py` içindeki `BASE` sözlüğünden gelir.

## Lisans ve atıf

Görüntü ve segmentasyonlar: TotalSegmentator dataset v2.0.1, Wasserthal J. ve ark., *Radiology: Artificial Intelligence* 2023, [CC BY 4.0](https://zenodo.org/records/10047292). Bu atıf arayüzde de gösterilir ve korunmalıdır.

Laparoskopik görüntü ve maskeler: Dresden Surgical Anatomy Dataset, Carstens M. ve ark., *Scientific Data* 2023, [CC BY 4.0](https://doi.org/10.6084/m9.figshare.21702600). Kareler küçültülmüş ve WebP'ye dönüştürülmüştür; maskeler tek bir bit maskesinde birleştirilmiştir. Laparoskopik tanıma notları taslaktır. Laparoskopi videosu: Boer J, Boerma D, de Vries Reilingh T, *J Med Case Rep* 2011;5:588, [CC BY 2.0](https://doi.org/10.1186/1752-1947-5-588) (Wikimedia Commons üzerinden; ilk 30 sn, kırpılmış ve yeniden kodlanmış); maskeleri bu projede SAM 2 ile üretilmiştir. Karaciğer segmentleri TotalSegmentator'ın açık lisanslı (Apache-2.0) `liver_segments` modeliyle üretilmiştir. Kraniyal vakada (`s0103`) beyin yapıları TotalSegmentator'ın `brain_structures` modeliyle üretilmiştir (ücretsiz akademik, ticari olmayan lisans); diğer baş yapıları açık lisanslı modellerle üretilmiştir.

Segmentasyonlar otomatik veya yarı otomatik üretilmiştir; kenarlarda küçük hatalar olabilir. Uygulama eğitim amaçlıdır, tanı için kullanılamaz.