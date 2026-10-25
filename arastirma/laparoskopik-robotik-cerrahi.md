# Laparoskopik ve robotik cerrahi görüntülerinde anatomi tanıma: araştırma ve proje planı

Tarih: 2026-10-25. Amaç: BT atlasına benzer şekilde, laparoskopik/robotik cerrahi görüntülerinde yapıları Türkçe etiketleyen bir modülün yapılabilirliğini incelemek. Lisanslar mümkün olan yerlerde birincil kaynakta (figshare API, GitHub README, makale) doğrulandı; doğrulanamayanlar açıkça belirtildi.

## 1. Kısa sonuç

- **Böyle araçlar var, ama çoğu ticari ve ameliyathaneye yönelik.** Gerçek zamanlı anatomi vurgulayan ilk onaylı yazılım Japonya'da Anaut'un **Eureka α**'sı (gevşek bağ dokusu, sinir, pankreas, üreter). Medtronic Touch Surgery, Theator, Caresyntax ise ameliyat sonrası video analizi yapıyor. Hiçbiri ücretsiz, açık, eğitim amaçlı bir atlas değil.
- **Açık, etiketli, Türkçe, etkileşimli bir laparoskopik anatomi atlası bulamadım.** En yakını Toronto Video Atlas of Surgery (TVASurg): animasyonlu eğitim videoları sunuyor ama piksel düzeyinde etiketleme yapmıyor. Bu yüzden projenin dolduracağı bir boşluk var (bu bir "bulamadım" sonucu, kesin yokluk kanıtı değil).
- **Projenin lisans kuralına uyan temel veri seti var: Dresden Surgical Anatomy Dataset (DSAD), CC BY 4.0.** 32 robotik rektum ameliyatından 13 195 kare, 11 yapı için piksel maskesi. TotalSegmentator'da yaptığımız işin laparoskopideki karşılığı bu.
- Diğer güçlü veri setlerinin çoğu (CholecSeg8k, Endoscapes, SAR-RARP50, ATLAS-120k, Cholec80) **CC BY-NC-SA 4.0**. Bunlar ticari olmayan kullanıma izin veriyor ama "aynı lisansla paylaş" şartı getiriyor. Kullanılıp kullanılmayacağı ayrıca karar gerektiriyor (bkz. §6).
- **Projeye özgü değer:** Aynı yapıyı hem BT'de hem cerrahın kamerasında göstermek ("Bu kolon BT'de nerede?"). Bu köprüyü ticari tarafta yalnızca hastaya özel 3B modelleme ürünleri kuruyor (Intuitive 3D Models/Iris, Ceevra, Visible Patient). Açık bir eğitim aracında bunu yapan bir örnek bulamadım.

## 2. Mevcut araçlar ve ürünler

### 2.1 Ameliyat sırasında anatomi tanıma (gerçek zamanlı)

| Ürün | Ne yapıyor | Durum | Kaynak |
|---|---|---|---|
| **Eureka α** (Anaut, Tokyo) | Laparoskopi monitöründe gevşek bağ dokusu, sinir, pankreas ve üreteri renkle vurguluyor. Gastrointestinal ameliyat videolarıyla eğitilmiş semantik segmentasyon kullanıyor. | Japonya MHLW, 2024: ülkenin ilk gerçek zamanlı görsel tanıma destek yazılımı. Kasık fıtığı doğrulama çalışmasında sinir IoU 0,24, Dice 0,38 (küçük yapılarda doğruluk sınırlı). | [Biospectrum](https://www.biospectrumasia.com/news/50/24169/japan-approves-ai-powered-surgical-visualisation-tool-eureka-.html), [PMC10837241](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10837241/), [Surg Endosc 2024](https://link.springer.com/10.1007/s00464-024-11489-0) |
| **ActivSight** (Activ Surgical) | Laparoskop ile kamera arasına takılan modül. Lazer benekli görüntüleme ile boya kullanmadan doku perfüzyonunu bindiriyor. Bu anatomi etiketleme değil, fizyolojik görüntüleme. | FDA 510(k) 2021, CE 2022 | [Fierce Biotech](https://www.fiercebiotech.com/medtech/activ-surgical-lands-fda-clearance-for-imaging-device-to-enhance-endoscope-observations) |

### 2.2 Ameliyat sonrası video analizi

| Ürün | Ne yapıyor | Kaynak |
|---|---|---|
| **Touch Surgery Ecosystem** (Medtronic) | Videoyu kaydediyor, kimlik bilgilerini siliyor, adımları ve alet kullanımını çıkarıyor. Anatomiyi farklı renklerle gösterebiliyor. | [Medtronic 2025](https://news.medtronic.com/how-ai-is-changing-the-way-your-doctor-performs-surgery-newsroom) |
| **Theator** | Videoyu adımlara, olaylara ve karar noktalarına bölüyor; sonuç verileriyle ilişkilendiriyor. | [NVIDIA blog](https://blogs.nvidia.com/blog/theator-ai-video-analytics-autonomous-surgery/) |
| **Caresyntax** | Ameliyathane iş akışı ve güvenlik analitiği | [CB Insights](https://www.cbinsights.com/company/csats/alternatives-competitors) |
| **SDSC – surgicalvideo.io** (kâr amacı gütmeyen) | Cerrahlar için ücretsiz video yükleme ve paylaşma platformu (2024: 59 ülkeden 270'ten fazla cerrah). Anotasyon özelliği doğrulanmadı. | [GuideStar](https://www.guidestar.org/Profile/88-1233001) |

### 2.3 BT/MR'dan hastaya özel 3B model (BT ↔ ameliyat köprüsü)

Bunlar projeye en yakın kategori: BT segmentasyonunu cerrahın konsoluna taşıyorlar.

| Ürün | Ne yapıyor | Kaynak |
|---|---|---|
| **Intuitive 3D Models (eski adı Iris)** | Anonimleştirilmiş BT Intuitive'e gönderiliyor, orada segmentleniyor. 3B model iOS, bilgisayar ve da Vinci konsolunda (TilePro) gösteriliyor. Kanıtların çoğu robotik parsiyel nefrektomiden. | [Intuitive](https://www.intuitive.com/en-us/digital-solutions/3d-models), [NCT04329767](https://clinicaltrials.gov/study/NCT04329767), [FDA K182643](https://510k.innolitics.com/device/K182643) |
| **Ceevra** | BT/MR'dan 3B model, robot ekranında gösterim. FDA K171356 (2017), K173274 (2018). Robotik parsiyel nefrektomi RKÇ'si JAMA Netw Open 2019'da yayımlandı. | [ceevra.com](https://ceevra.com/) |
| **Visible Patient** (IRCAD kökenli, Strazburg) | BT/MR'dan etkileşimli 3B model. Ethicon ortaklığıyla pazarlanıyor. | [IntuitionLabs](https://intuitionlabs.ai/companies/digital-health/visible-patient) |
| **Hutom** (Kore) | Hastaya özel sanal model. Bu taramada doğrulanmadı. | — |

### 2.4 Eğitim kaynakları

- **TVASurg** (Toronto Video Atlas of Liver, Pancreas and Transplant Surgery): Ücretsiz; organ bazlı anatomi bölümleri ve etkileşimli modüller sunuyor, piksel düzeyinde etiket yok. [pie.med.utoronto.ca/TVASurg](https://pie.med.utoronto.ca/TVASurg/about/)
- Ücretli kitap ve video atlasları (Gayet & Conrad, Wiley; Cremona & Tacchetti, 2018) etiketli fotoğraflar içeriyor ama açık değil.
- WebSurg (IRCAD) gibi video kütüphaneleri anlatımlı videolar sunuyor, etkileşimli etiketleme sunmuyor (bu taramada ayrıca doğrulanmadı).

## 3. Açık veri setleri (lisans odaklı)

Proje kuralı: yalnızca açık lisanslı ve anonim veri. Aşağıda ✅ kurala uyan, ⚠️ ticari olmayan/aynı lisansla paylaşma şartlı, ❌ kısıtlı veya belirsiz anlamına geliyor.

| Veri seti | Ameliyat | Anatomi etiketi | Lisans (doğrulama) | Erişim | Uygunluk |
|---|---|---|---|---|---|
| **DSAD** – Dresden Surgical Anatomy Dataset | 32 robotik rektum rezeksiyonu/ekstirpasyonu (Dresden, 2019–2021) | 11 yapı: karın duvarı, kolon, inferior mezenterik arter, intestinal venler, karaciğer, pankreas, ince bağırsak, dalak, mide, üreter, veziküler bezler; ayrıca 1 430 karelik **çok yapılı** alt küme | **CC BY 4.0** (figshare API ve makale doğrulandı) | figshare tek zip, 20,9 GB; Hugging Face'te `nct-tso/dsad` (CC BY 4.0, parquet, alt kümeler ayrı) | ✅ **Birinci aday** |
| **CholecSeg8k** | Laparoskopik kolesistektomi (Cholec80'in 17 klibi) | 8 080 kare, 13 sınıf (karaciğer, safra kesesi, sistik kanal, hepatik ven, karaciğer ligamanı, yağ, GİS, bağ dokusu, karın duvarı, kan, 2 alet, arka plan) | CC BY-NC-SA 4.0 (makale ve HF kartı) | Kaggle / HF | ⚠️ |
| **Endoscapes2023** (CAMMA) | Kolesistektomi, 201 video | Seg50: 493 kare; safra kesesi, sistik kanal, sistik arter, sistik plak, hepatosistik üçgen diseksiyonu, alet. Ayrıca CVS (kritik güvenlik görüntüsü) değerlendirmesi | CC BY-NC-SA 4.0 (GitHub README) | Doğrudan zip (s3.unistra.fr); PhysioNet kopyası kısıtlı | ⚠️ |
| **ATLAS-120k** (TU/e, MICCAI 2026) | 14 işlem, 100 video (laparoskopik ve robotik) | 121 018 kare, **42 anatomi sınıfı** (organ, damar, sinir); en kapsamlı set | Anotasyon CC BY-NC-SA 4.0, kod MIT (GitHub README) | HF (kapılı, şart kabulü gerekiyor); **videolar YouTube'dan indiriliyor** | ⚠️ Videolar telifli, yeniden dağıtılamaz |
| **SAR-RARP50** | Robotik radikal prostatektomi, 50 vaka | Alet segmentasyonu ve eylem (anatomi yok) | CC BY-NC-SA 4.0 (figshare kaydı) | figshare | ⚠️ Anatomi için uygun değil |
| **EndoVis 2018 Scene Seg.** | Domuz nefrektomisi (da Vinci Xi) | Böbrek parankimi, örtülü böbrek, ince bağırsak + alet parçaları | Bulunamadı | grand-challenge | ❌ Belirsiz; ayrıca hayvan dokusu |
| **LapEx** (Sci Data 2025) | 30 sleeve gastrektomi | Organ ve alet segmentasyonu | Bulunamadı; depo kaydında "restrictedAccess" | Recherche Data Gouv | ❌ |
| **P2ILF** (MICCAI 2022) | Laparoskopik karaciğer rezeksiyonu | 167 laparoskopik kare + 9 hastanın ameliyat öncesi BT/MR 3B modeli, eşleşmiş işaret noktaları | Bulunamadı | Yalnızca yarışma katılımcılarına | ❌ BT↔laparoskopi için ideal ama erişilemiyor |
| **DKFZ sentetik laparoskopi** (Pfeiffer 2019) | 3D-IRCADb BT'lerinden üretilmiş karaciğer sahneleri | 20 000 simüle + 200 000 çevrilmiş kare; karaciğer, yağ, karın duvarı, safra kesesi, alet; derinlik haritası | Sayfada lisans yok | opencas.dkfz.de | ❌ Belirsiz; yöntem önemli (§5.2) |
| Cholec80, CholecT50, HeiChole, AutoLaparo, PhaKIR | Faz, alet, eylem | Anatomi maskesi yok veya sınırlı | NC-SA veya istekle erişim, kısmen doğrulanmadı | Formla | Anatomi atlası için ikincil |

### DSAD ayrıntıları (temel veri)

- Görüntüler 1920×1080 PNG (kayıpsız); kaynak videolar MPEG-4. Yalnızca kareler dağıtılıyor, video yok.
- Her yapı için ameliyat başına en fazla 100 kare seçilmiş. Etiketleme 3D Slicer'da üç tıp öğrencisi tarafından yapılmış, STAPLE ile birleştirilmiş ve 3 yıllık MIS deneyimli bir hekim tarafından gözden geçirilmiş.
- Birleştirilmiş anotasyon F1 skoru 0,87 (üreter) ile 1,00 (dalak) arasında. Küçük ve ince yapılar zor.
- Her karede hangi organların göründüğünü belirten zayıf etiketler de var.
- Kod (kare çıkarma, birleştirme): gitlab.com/nct_tso_public/dsad, Zenodo 6958337.
- Model başarısı (Kolbinger ve ark., medRxiv 2022.11.11.22282215): yapı başına model ortalama IoU 0,28–0,83, ortak model 0,22–0,78. Pankreas tanımada 28 kişilik insan grubuyla (hekim, öğrenci, meslek dışı) karşılaştırılmış.
- Atıf: Carstens ve ark., *Sci Data* 2023, doi 10.1038/s41597-022-01719-2; veri doi 10.6084/m9.figshare.21702600.

## 4. Araştırma tarafı: modeller ve yöntemler

### 4.1 Ne kadar iyi çalışıyor?

- Büyük organlar (karaciğer, dalak, mide) iyi tanınıyor. Küçük ve ince yapılar (üreter, sinir, damar) hâlâ zayıf: DSAD IoU alt sınırı 0,22–0,28, Eureka α sinir IoU 0,24.
- Derlemeler: Zhou ve ark., *Front Surg* 2025 (son 10 yılın genel derlemesi); arXiv 2502.16459 (cerrahi videoda semantik segmentasyon, 2025); jinekolojik laparoskopide derin öğrenme derlemesi ([PMC12388686](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12388686/)).
- Dolayısıyla bu modülde otomatik çıktı yalnızca "öneri" olarak sunulmalı. Atlas içeriği ise uzman onaylı maskelere dayanmalı; BT atlasındaki "eğitim amaçlıdır, tanı için kullanılamaz" ilkesinin aynısı geçerli.

### 4.2 Temel (foundation) modeller ve ağırlık lisansları

| Model | Ne | Lisans | Not |
|---|---|---|---|
| **SurgeNet / SurgeNetXL** (TU/e) | 4,7 milyon cerrahi karede öz-denetimli ön eğitim; DINO tabanlı omurgalar (SurgeNetDINO, MIDL 2026) | HF kartında CC BY-NC 4.0 (eski sürüm) | ATLAS-120k bu omurgaları kullanıyor |
| **ATLAS** (MICCAI 2026) | Video semantik segmentasyonu; işlem tipi, faz ve kısa süreli bellekle bağlam kullanıyor, gerçek zamanlıya yakın | Kod MIT | Ağırlıkların yeri README'de yok |
| **LapFM** (arXiv 2512.08439) | Laparoskopik segmentasyon temel modeli, LapBench-114K | Doğrulanmadı | |
| **SurgVISTA** (*npj Digit Med* 2026) | Video temel modeli (Endo700k) | Doğrulanmadı | |
| **ZEN** (arXiv 2602.13633) | 21 işlemden 4 milyon kare | Doğrulanmadı | |
| **EdgeCVS** (DKFZ, HF `IMSY-DKFZ/edgecvs`) | Kritik güvenlik görüntüsü (CVS) değerlendirmesi, CPU'da gerçek zamanlı, 11 MB | CC BY-NC 4.0 | Kolesistektomi eğitim modülü için ilginç |
| **SAM 2 / MedSAM2** | Tıklamayla (istemle) segmentasyon; WebGPU'ya uygun ONNX dönüşümleri var | Apache 2.0 (genel bilgi; sürüm sayfasında tekrar doğrulanmalı) | Etiketleme aracı ve "tıkla, yapıyı çevrele" etkileşimi için |

### 4.3 Tarayıcıda çalıştırma

- **ONNX Runtime Web**, 1.17 sürümünden beri WebGPU destekliyor (fp16). CDN'den ES modülü olarak yüklenebildiği için projenin "derleme adımı yok" kuralına uyuyor.
- Örnek bir uygulamada dizüstü bilgisayarda görüntü başına 100–120 ms ölçülmüş (tek bir blog yazısından, kıyaslama değil). Gerçek zamanlı video için küçük bir model (MobileNet/EdgeNeXt sınıfı, düşük çözünürlük) gerekecek.
- Mobil cihazlarda WebGPU desteği sınırlı. WASM'ye geri dönüş yolu ve "canlı tanıma kapalı" seçeneği olmalı.

## 5. Projeye ekleme planı

### 5.1 Aşama 1: Laparoskopik görüntü atlası (DSAD, CC BY 4.0) — en düşük risk

BT atlasının mantığını 2B karelere taşımak.

- **Veri:** HF `nct-tso/dsad` içindeki `multi_organ` alt kümesi (1 430 kare, 1280×1024, toplam 2,15 GB). Bu alt kümede yalnızca 7 yapı var (karın duvarı, kolon, karaciğer, pankreas, ince bağırsak, dalak, mide); üreter, IMA, intestinal venler ve veziküler bezler yalnızca `single_organ` alt kümesinde ve her karede tek yapı olarak işaretli.
- **Durum (2026-10-25):** Prototip hazır: `scripts/fetch_dsad.py` (yalnızca gereken parquet parçalarını indirir), `scripts/build_lapa.py`, `docs/lapa.html`. Validation bölümünden 17 kare kullanılıyor (0,69 MB).
- **Seçim:** 60–150 temsilî kare. Ameliyat adımına göre gruplanır (giriş/eksplorasyon, IMA bölgesi, mezokolon diseksiyonu, pelvis/üreter, veziküler bezler).
- **Üretim** (`scripts/build_lapa.py`, BT'deki `build_atlas.py` karşılığı): kare 1920×1080 → 960×540 WebP (≈ 60–100 KB); maske tek kanallı uint8 PNG (≈ 5–15 KB); `docs/data/lapa_<id>/lapa.json` (yapılar, Türkçe adlar, renkler, kare listesi, kaynak ameliyat kimliği).
- **Arayüz** (`atlas.html` içinde yeni vaka türü veya ayrı `lapa.html`): kare üzerine dokunarak veya üzerine gelerek yapı adı, katman aç/kapa, saydamlık; mevcut test modunun 2B sürümü ("üreteri bul"); bağlantıda durum (`#c=lapa01&f=12&s=ureter`). Mobilde dokunma ve dar ekran desteklenmeli.
- **Türkçe adlar ve sistemler:** `BASE` sözlüğündeki adlarla eşleşen ortak bir yapı kimliği tablosu.
- **Atıf:** DSAD (CC BY 4.0) atfı arayüzde ve README'de; TotalSegmentator atfı korunur.

### 5.2 Aşama 2: BT ↔ laparoskopi köprüsü — projenin ayırt edici özelliği

- **Yapı eşleme tablosu** (DSAD → TotalSegmentator):
  - Birebir: kolon → `colon`, karaciğer → `liver`, pankreas → `pancreas`, ince bağırsak → `small_bowel`, dalak → `spleen`, mide → `stomach`.
  - Kısmi: intestinal venler → `portal_vein_and_splenic_vein`; inferior mezenterik arter → TotalSegmentator'da ayrı yapı yok (aorta dalı olarak anlatılır).
  - Karşılığı yok: üreter, veziküler bezler, karın duvarı. Bunlar BT tarafında elle işaretleme veya not gerektirir.
  - Not: Bu eşleme TotalSegmentator sınıf listesinden kontrol edilmeli.
- **Etkileşim:** Laparoskopik karede bir yapıya dokununca "BT'de göster" düğmesi çıkar; s0139 atlasında aynı yapı seçili olarak açılır (`#c=s0139&s=colon`). Ters yönde, BT'de yapı seçiliyken "Ameliyatta nasıl görünür?" bağlantısı.
- **Sanal laparoskopi (ileri adım):** TotalSegmentator maskelerinden yüzey ağları (marching cubes, Python tarafında) çıkarılır; three.js (CDN, sabit sürüm) ile karın içine konumlanmış perspektif bir "laparoskop kamerası" görünümü oluşturulur. Pnömoperitoneum ve organ deformasyonu gerçekçi olmaz; bu yalnızca uzamsal yönelim için bir araç olur. Pfeiffer 2019 bu yöntemin (BT'den sahne → görüntü çevirisi) eğitim verisi üretmekte işe yaradığını göstermişti.

### 5.3 Aşama 3: Tarayıcıda canlı tanıma (deneysel)

- DSAD üzerinde küçük bir segmentasyon modeli eğitilir. Eğitim GPU gerektirir (yerel GPU yoksa bulut); ağır işler için D diski kuralı geçerli.
- Model ONNX'e (fp16) dönüştürülür ve `onnxruntime-web` (sabit sürüm, CDN) ile WebGPU üzerinde çalıştırılır.
- **Ağırlık lisansı tuzağı:** Omurga olarak izinli lisanslı bir model seçilmeli (ör. torchvision MobileNet/DeepLab, DINOv2). SurgeNet (CC BY-NC) ve SegFormer (NVIDIA lisansı, ticari olmayan) kullanılırsa çıkan model de o şartlara bağlı olur.
- **Kullanıcının kendi videosu:** Yalnızca tarayıcıda işlenir; sunucuya hiçbir şey gönderilmez. Bu arayüzde açıkça yazılmalı. Hastane veya hasta verisi depoya hiçbir koşulda girmez.
- Çıktı "otomatik öneri, doğrulanmamış" etiketiyle ve düşük güvenli bölgeler soluk gösterilerek sunulur.

### 5.4 Aşama 4 (isteğe bağlı): NC-SA verileriyle genişletme

- Kolesistektomi modülü: CholecSeg8k + Endoscapes (Calot üçgeni, sistik kanal/arter, CVS öğretimi).
- 42 sınıflı ATLAS-120k anotasyonları yalnızca bağlantı veya öğretim amaçlı kullanılabilir; YouTube videoları yeniden dağıtılamaz.
- Bu aşama, sitenin ve türetilen verilerin lisansını etkiler (§6).

## 6. Lisans kararı (kullanıcıya düşen)

- **CC BY 4.0 (DSAD):** Proje kuralına tamamen uyuyor; atıf yeterli.
- **CC BY-NC-SA 4.0 (CholecSeg8k, Endoscapes, ATLAS-120k, SAR-RARP50):** Site ücretsiz ve eğitim amaçlı olduğu için "ticari olmayan" şartı karşılanır. Ancak bu verilerden türetilen dosyalar (küçültülmüş kare, maske, `lapa.json`) da NC-SA lisansıyla yayımlanmalı ve ileride ticari kullanım kapanır. Öneri: bu verileri ayrı vaka klasörlerinde tutmak ve lisansı vaka kartında göstermek.
- **Lisansı bulunamayan veya kısıtlı veriler (EndoVis, LapEx, P2ILF, DKFZ sentetik):** Kullanılmaz.

## 7. Sıradaki adımlar (öncelik sırasıyla)

1. HF `nct-tso/dsad` "Files and versions" sekmesinde `multi_organ` parquet boyutunu ve tek dosya indirmenin mümkün olup olmadığını kontrol et; indirmeyi `data/raw/dsad/` altına yap.
2. 10–20 kareyle `build_lapa.py` prototipi ve basit bir 2B görüntüleyici; mobilde dokunmayı dene.
3. DSAD → TotalSegmentator eşleme tablosunu sınıf listesinden doğrula; "BT'de göster" bağlantısını ekle.
4. Lisans kararı: NC-SA verileri kullanılacak mı?
5. (Deneysel) Küçük model + ONNX Runtime Web denemesi.

## Kaynaklar

- DSAD: [PMC9837071](https://pmc.ncbi.nlm.nih.gov/articles/PMC9837071/), [figshare 21702600](https://doi.org/10.6084/m9.figshare.21702600), [HF nct-tso/dsad](https://huggingface.co/datasets/nct-tso/dsad), [Kolbinger medRxiv](https://www.medrxiv.org/content/10.1101/2022.11.11.22282215v2), [arXiv 2403.17192](https://arxiv.org/abs/2403.17192v1)
- CholecSeg8k: [arXiv 2012.12453](https://arxiv.org/abs/2012.12453v1)
- Endoscapes: [GitHub CAMMA-public/Endoscapes](https://github.com/CAMMA-public/Endoscapes), [Sci Data 2025](https://www.nature.com/articles/s41597-025-04642-4)
- ATLAS-120k: [arXiv 2606.22124](https://arxiv.org/abs/2606.22124), [GitHub](https://github.com/TimJaspers0801/ATLAS)
- SurgeNet: [arXiv 2501.09436](https://arxiv.org/abs/2501.09436v1), [HF SurgeNetModels](https://huggingface.co/TimJaspersTue/SurgeNetModels)
- LapFM: [arXiv 2512.08439](https://arxiv.org/abs/2512.08439); ZEN: [arXiv 2602.13633](https://arxiv.org/html/2602.13633v1); SurgVISTA: [npj Digit Med 2026](https://www.nature.com/articles/s41746-026-02403-0)
- EdgeCVS: [HF IMSY-DKFZ/edgecvs](https://huggingface.co/IMSY-DKFZ/edgecvs)
- SAR-RARP50: [b2find](https://b2find.eudat.eu/dataset/7d9c8b39-56c6-56b8-b241-1c500f471bd6); AutoLaparo: [arXiv 2208.02049](https://arxiv.org/pdf/2208.02049)
- EndoVis 2018: [arXiv 2001.11190](https://arxiv.org/pdf/2001.11190v1); LapEx: [Sci Data 2025](https://www.nature.com/articles/s41597-025-04588-7), [b2find](https://b2find.eudat.eu/dataset/99377a15-0389-5a4b-9250-252047df1868)
- P2ILF: [grand-challenge](https://p2ilf.grand-challenge.org/), [arXiv 2401.15753](https://arxiv.org/abs/2401.15753v2)
- DKFZ sentetik: [opencas.dkfz.de/image2image](https://opencas.dkfz.de/image2image/), [arXiv 1907.02882](https://arxiv.org/pdf/1907.02882)
- PhaKIR: [arXiv 2511.06549](https://arxiv.org/html/2511.06549v1); SurgAtlas (video-dil, YouTube): [arXiv 2606.25905](https://arxiv.org/pdf/2606.25905)
- Eureka α: [Biospectrum](https://www.biospectrumasia.com/news/50/24169/japan-approves-ai-powered-surgical-visualisation-tool-eureka-.html), [PMC10837241](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10837241/), [Springer 2024](https://link.springer.com/10.1007/s00464-024-11489-0)
- Ticari: [Medtronic Touch Surgery](https://news.medtronic.com/how-ai-is-changing-the-way-your-doctor-performs-surgery-newsroom), [Theator](https://blogs.nvidia.com/blog/theator-ai-video-analytics-autonomous-surgery/), [Activ Surgical](https://www.fiercebiotech.com/medtech/activ-surgical-lands-fda-clearance-for-imaging-device-to-enhance-endoscope-observations), [Intuitive 3D Models](https://www.intuitive.com/en-us/digital-solutions/3d-models), [Ceevra](https://ceevra.com/), [Visible Patient](https://intuitionlabs.ai/companies/digital-health/visible-patient), [SDSC](https://www.guidestar.org/Profile/88-1233001)
- Eğitim: [TVASurg](https://pie.med.utoronto.ca/TVASurg/about/)
- Tarayıcı çıkarımı: [ONNX Runtime Web WebGPU](https://opensource.microsoft.com/blog/2024/02/29/onnx-runtime-web-unleashes-generative-ai-in-the-browser-using-webgpu/), [SAM2 ONNX](https://huggingface.co/SharpAI/sam2-hiera-base-plus-onnx/blob/main/README.md)
- Derlemeler: [Front Surg 2025](https://www.frontiersin.org/journals/surgery/articles/10.3389/fsurg.2025.1557153/epub), [PMC12388686](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12388686/), [arXiv 2502.16459](https://papers.cool/arxiv/2502.16459)
