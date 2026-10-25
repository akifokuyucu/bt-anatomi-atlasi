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

Görüntü ve segmentasyonlar: TotalSegmentator dataset v2.0.1, Wasserthal J. ve ark., *Radiology: Artificial Intelligence* 2023, [CC BY 4.0](https://zenodo.org/records/10047292). Bu atıf arayüzde de gösterilir ve korunmalıdır. Karaciğer segmentleri TotalSegmentator'ın açık lisanslı (Apache-2.0) `liver_segments` modeliyle üretilmiştir.

Segmentasyonlar otomatik veya yarı otomatik üretilmiştir; kenarlarda küçük hatalar olabilir. Uygulama eğitim amaçlıdır, tanı için kullanılamaz.