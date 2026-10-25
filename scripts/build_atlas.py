"""TotalSegmentator vakasından web atlası için veri üretir.

Kullanım:
    .venv/Scripts/python scripts/build_atlas.py data/raw/s0139 docs/data [data/segments/s0139]
    .venv/Scripts/python scripts/build_atlas.py --verify docs/data   # yalnızca denetim

Üçüncü argüman isteğe bağlıdır: TotalSegmentator `liver_segments` çıktısının klasörü.
Verilirse Couinaud segmentleri ayrı bir katman olarak eklenir.
Üretim sonunda çıktılar otomatik denetlenir; son satır "Tamam: ..." ya da "N SORUN: ..." olur.

Çıktılar:
    ct.bin.gz        int16 HU hacmi (NLM ile gürültüsü azaltılmış, %15 ham karışım), sıra [z][y][x] (x en hızlı)
    labels.bin.gz    uint8 etiket hacmi, aynı sıra
    overlay.bin.gz   uint8 katman hacmi (karaciğer segmentleri), aynı sıra
    atlas.json       boyutlar, yapı kataloğu, kesit başına etiket noktaları
"""

import gzip
import hashlib
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from skimage.restoration import denoise_nl_means

# Sistemler: id, Türkçe ad, varsayılan açık mı
SYSTEMS = [
    ("organ", "Organlar", True),
    ("kc_segment", "Karaciğer segmentleri", False),
    ("solunum", "Solunum", True),
    ("gis", "Sindirim", True),
    ("uriner", "Üriner", True),
    ("arter", "Arterler", True),
    ("ven", "Venler", True),
    ("kemik", "Kemikler", False),
    ("kas", "Kaslar", False),
    ("toraks", "Toraks / Diğer", False),
]

# TotalSegmentator anahtarı -> (Türkçe ad, İngilizce ad, sistem, renk)
BASE = {
    "liver": ("Karaciğer", "Liver", "organ", "#e07b53"),
    "spleen": ("Dalak", "Spleen", "organ", "#9b6dd6"),
    "pancreas": ("Pankreas", "Pancreas", "organ", "#f2c14e"),
    "gallbladder": ("Safra kesesi", "Gallbladder", "organ", "#4cbb6c"),
    "adrenal_gland": ("adrenal bez", "adrenal gland", "organ", "#ff8fb1"),
    "esophagus": ("Özofagus", "Esophagus", "gis", "#d4a373"),
    "stomach": ("Mide", "Stomach", "gis", "#e6a0c4"),
    "duodenum": ("Duodenum", "Duodenum", "gis", "#f4a259"),
    "small_bowel": ("İnce bağırsak", "Small bowel", "gis", "#8ecae6"),
    "colon": ("Kolon", "Colon", "gis", "#c9a26b"),
    "kidney": ("böbrek", "kidney", "uriner", "#f08a8a"),
    "kidney_cyst": ("böbrek kisti", "kidney cyst", "uriner", "#ffd6d6"),
    "urinary_bladder": ("Mesane", "Urinary bladder", "uriner", "#f7e463"),
    "prostate": ("Prostat", "Prostate", "uriner", "#e9a3c9"),
    "aorta": ("Aorta", "Aorta", "arter", "#e63946"),
    "iliac_artery": ("iliak arter", "iliac artery", "arter", "#ff4d5e"),
    "inferior_vena_cava": ("İnferior vena kava", "Inferior vena cava", "ven", "#3a86ff"),
    "portal_vein_and_splenic_vein": ("Portal ven ve splenik ven", "Portal and splenic vein", "ven", "#00b4d8"),
    "iliac_vena": ("iliak ven", "iliac vein", "ven", "#4361ee"),
    "sacrum": ("Sakrum", "Sacrum", "kemik", "#d6c48f"),
    "hip": ("kalça kemiği (os coxae)", "hip bone", "kemik", "#e5d8b0"),
    "femur": ("femur", "femur", "kemik", "#efe3bd"),
    "costal_cartilages": ("Kostal kıkırdaklar", "Costal cartilages", "kemik", "#b8d8c8"),
    "sternum": ("Sternum", "Sternum", "kemik", "#e0d3a8"),
    "iliopsoas": ("iliopsoas kası", "iliopsoas muscle", "kas", "#d1495b"),
    "gluteus_maximus": ("gluteus maksimus", "gluteus maximus", "kas", "#b5651d"),
    "gluteus_medius": ("gluteus medius", "gluteus medius", "kas", "#a0522d"),
    "gluteus_minimus": ("gluteus minimus", "gluteus minimus", "kas", "#cd853f"),
    "autochthon": ("erektör spina (otokton) kasları", "autochthonous back muscles", "kas", "#c06c84"),
    "heart": ("Kalp", "Heart", "toraks", "#ff6b6b"),
    "spinal_cord": ("Medulla spinalis", "Spinal cord", "toraks", "#ffd166"),
    "trachea": ("Trakea", "Trachea", "solunum", "#7fd1e8"),
    "thyroid_gland": ("Tiroid bezi", "Thyroid gland", "organ", "#c77d9a"),
    "atrial_appendage_left": ("Sol atriyal appendiks", "Left atrial appendage", "toraks", "#ff9a8a"),
    "pulmonary_vein": ("Pulmoner damarlar", "Pulmonary vessels", "ven", "#5a7bd8"),
    "superior_vena_cava": ("Süperior vena kava", "Superior vena cava", "ven", "#2f6fe0"),
    "brachiocephalic_vein": ("brakiyosefalik ven", "brachiocephalic vein", "ven", "#4a90e0"),
    "brachiocephalic_trunk": ("Brakiyosefalik gövde", "Brachiocephalic trunk", "arter", "#ff5a6a"),
    "common_carotid_artery": ("karotis komunis arter", "common carotid artery", "arter", "#ff7a85"),
    "subclavian_artery": ("subklavian arter", "subclavian artery", "arter", "#e84a5c"),
    "clavicula": ("klavikula", "clavicle", "kemik", "#e8dcb8"),
    "scapula": ("skapula", "scapula", "kemik", "#dccfa4"),
    "humerus": ("humerus", "humerus", "kemik", "#efe3bd"),
    "skull": ("Kafatası", "Skull", "kemik", "#e9ddb5"),
}

# Vaka tanımları: klasör adı -> arayüz başlığı, üst etiket, varsayılan pencere, ilk açılışta odaklanacak yapı
CASES = {
    "s0139": {"title": "Abdomen ve pelvis · BT portal venöz faz", "eyebrow": "ABDOMEN VE PELVİS", "win": "400,40", "start": "pancreas",
              "category": "saglikli", "region": "abdomen"},
    "s0372": {"title": "Toraks · BT arteriyel faz", "eyebrow": "TORAKS", "win": "400,40", "start": "heart",
              "category": "saglikli", "region": "toraks"},
    "pe01": {"title": "Pulmoner emboli · BT anjiyo", "eyebrow": "TORAKS · ANJİYO", "win": "600,150", "start": "heart",
             "category": "patoloji", "region": "toraks", "lesions": "pe_mask.nii.gz",
             "exclude": [],
             "source": "READ PE CT (Andrade ve ark., Sci Data 2023, CC0 1.0); yapı segmentasyonu: TotalSegmentator (Wasserthal ve ark., Radiology: AI 2023)",
             "sourceUrl": "https://doi.org/10.1038/s41597-023-02374-x",
             "diagnosis": {
                 "tr": "Akut pulmoner emboli", "en": "Acute pulmonary embolism", "la": "Embolia pulmonalis acuta",
                 "draft": True,
                 "findings": [
                     "Pulmoner arter dalında kontrast dolum defekti: parlak lümen içinde hipodens (trombüs) alan.",
                     "Akut emboli lümenin ortasında yer alır, damarı genişletebilir; eksenel kesitte 'polo nane' (halka), uzunlamasına kesitte 'demiryolu rayı' işareti görülür.",
                     "Kronik emboli eksantriktir, duvara yapışıktır, damarı daraltır; kalsifikasyon içerebilir.",
                     "Sağ kalp yüklenmesi: sağ/sol ventrikül oranı >1, septumun sola bombelenmesi, kontrastın hepatik venlere reflüsü.",
                     "Akciğer enfarktı: periferik, plevraya dayalı kama biçimli konsolidasyon (Hampton hörgücü).",
                 ],
                 "ddx": [
                     "Kronik tromboembolik hastalık",
                     "Akım (karışım) ve solunum hareketi artefaktı",
                     "Pulmoner arter sarkomu / tümör trombüsü (kontrast tutar, damarı genişletir)",
                     "Septik emboli",
                 ],
                 "pearls": [
                     "Pulmoner arter fazında tüm dallar parlak olmalıdır; defekt ne kadar belirgin zıtlık gösterirse tanı o kadar güvenilirdir.",
                     "Önce ana ve lober dallara bakın (eyer emboli en tehlikelisidir), sonra segmentlere inin.",
                     "Yanlış pozitiflerin en sık nedeni karışım ve hareket artefaktıdır; birden fazla düzlemde doğrulayın.",
                 ],
                 "note": "Kırmızı işaretler READ veri setinin uzman anotasyonudur. Yazılı içerik taslaktır ve bir radyolog tarafından gözden geçirilmemiştir. Eğitim amaçlıdır, tanı için kullanılamaz.",
             }},
}


# Henüz verisi olmayan, ana sayfada "hazırlanıyor" kartı olarak görünen vakalar
PLANNED = [
    {"id": "kraniyal", "category": "saglikli", "region": "kraniyal", "title": "Kraniyal BT · sağlıklı",
     "eyebrow": "KRANİYAL", "text": "Beyin, ventriküller, kafa tabanı ve venöz sinüsler; normal kraniyal BT veya BT anjiyo."},
    {"id": "ileus", "category": "patoloji", "region": "abdomen", "title": "İleus (barsak tıkanıklığı)",
     "eyebrow": "ABDOMEN", "text": "Dilate barsak ansları, hava-sıvı seviyeleri ve geçiş noktası; patolojik alan kırmızıyla işaretlenir."},
    {"id": "ich", "category": "patoloji", "region": "kraniyal", "title": "İntrakraniyal kanama",
     "eyebrow": "KRANİYAL", "text": "Parankimal, subaraknoid ve subdural kanama örnekleri; hiperdens alan kırmızıyla işaretlenir."},
]
# Latince ad (Terminologia Anatomica) ve kısa not, BASE anahtarıyla. Çiftli yapılarda sağ/sol varyantları aynı notu paylaşır.
# la: (ad, cinsiyet m/f/n); çiftlilerde cinsiyete göre sinister/dexter eki eklenir.
# Not şablonu (satırlar \n ile ayrılır): Komşuluk · BT'de tanıma · Varyant · Klinik ipucu
# TASLAK: bir radyolog veya anatomist gözden geçirmeden yayın "doğrulanmış" sayılmaz (TODO 1.7).
LATIN_SIDE = {"m": ("sinister", "dexter"), "f": ("sinistra", "dextra"), "n": ("sinistrum", "dextrum")}
NOTES = {
    "liver": ("Hepar", "n",
        "Komşuluk: Sağ hemidiyafragma altında; mide, safra kesesi, duodenum, sağ böbrek ve sağ adrenal ile komşu.\n"
        "BT'de tanıma: Portal venöz fazda homojen, dalaktan biraz düşük ya da benzer dansitede (~100–120 HU); yağlanmada dansite düşer.\n"
        "Varyant: Riedel lobu (sağ lobun inferior uzantısı); papiller çıkıntı.\n"
        "Klinik ipucu: Karaciğer dansitesi dalaktan belirgin düşükse hepatosteatozdan şüphelenilir."),
    "spleen": ("Splen", "m",
        "Komşuluk: Sol hemidiyafragma altında; mide, sol böbrek, pankreas kuyruğu ve splenik fleksura ile komşu.\n"
        "BT'de tanıma: Portal fazda homojen ve karaciğerle benzer ya da biraz daha yüksek dansitede; arteriyel fazda heterojen (zebra) görünüm normaldir.\n"
        "Varyant: Aksesuar dalak (splenül), lobülasyon ve yarık.\n"
        "Klinik ipucu: Splenomegali sıklıkla kraniokaudal 12–13 cm üstü olarak kabul edilir; travmada laserasyon ve hematom araştırılır."),
    "pancreas": ("Pancreas", "n",
        "Komşuluk: Arkasında splenik ven; başı duodenum C halkası içinde, boynu portal ven/SMV birleşkesinin önünde, kuyruğu dalak hilusuna uzanır.\n"
        "BT'de tanıma: Lobüle konturlu, yumuşak doku dansitesinde; yaşla yağ infiltrasyonu artar ve görünüm 'tüylü' olur.\n"
        "Varyant: Pankreas divisum, annüler pankreas.\n"
        "Klinik ipucu: Peripankreatik yağ dokuda bulanıklaşma akut pankreatit işaretidir; baş kitlesinde safra yolu ve pankreas kanalı birlikte genişleyebilir."),
    "gallbladder": ("Vesica biliaris", "f",
        "Komşuluk: Karaciğerin visseral yüzünde, segment IV ve V arasındaki safra kesesi yatağında; duodenum ve hepatik fleksura ile komşu.\n"
        "BT'de tanıma: İçi sıvı dansitesinde (0–20 HU), ince duvarlı oval kese.\n"
        "Varyant: Katlanmış fundus (Frig şapkası), septalı kese.\n"
        "Klinik ipucu: Duvar kalınlaşması ve çevresinde sıvı kolesistit lehinedir; taşlar BT'de her zaman görünmez."),
    "adrenal_gland": ("Glandula suprarenalis", "f",
        "Komşuluk: Böbreğin üst kutbunun anteromedialinde, diyafram krusunun yanında; sağda İVK'nın arkasında, solda splenik ven/pankreas arkasında.\n"
        "BT'de tanıma: İnce, Y veya ters V biçimli yumuşak doku yapısı; kol kalınlığı normalde diyafram krusundan fazla değildir.\n"
        "Varyant: Aksesuar adrenal doku nadirdir.\n"
        "Klinik ipucu: Nonkontrast BT'de <10 HU yağdan zengin adenom lehinedir."),
    "kidney": ("Ren", "m",
        "Komşuluk: Retroperitonda psoas kası üzerinde; sağda karaciğer ve duodenum, solda dalak, pankreas kuyruğu ve kolon ile komşu.\n"
        "BT'de tanıma: Kortikomedüller fazda korteks parlak, piramitler daha düşük; nefrografik fazda homojen güçlü tutulum.\n"
        "Varyant: At nalı böbrek, pelvik böbrek, duplike toplayıcı sistem.\n"
        "Klinik ipucu: Sağ böbrek karaciğer nedeniyle genellikle solundan biraz daha aşağıdadır; kist-kitle ayrımında kontrast tutulumu belirleyicidir."),
    "aorta": ("Aorta", "f",
        "Komşuluk: Vertebra gövdelerinin önünde, hafif solda; sağında İVK, önünde pankreas ve duodenum üçüncü kısmı.\n"
        "BT'de tanıma: Portal fazda ~150–200 HU ile parlak, yuvarlak lümen; duvar kalsifikasyonları hiperdens noktalar olarak görülür.\n"
        "Varyant: Dallanma varyantları (çölyak-SMA ortak gövde, sol hepatik arterin sol gastrikten çıkması).\n"
        "Klinik ipucu: Abdominal aort çapı >3 cm anevrizma olarak kabul edilir."),
    "inferior_vena_cava": ("Vena cava inferior", "f",
        "Komşuluk: Aortanın sağında, karaciğerin arka yüzünde (kaudat lob arkasında); renal venler kendisine açılır.\n"
        "BT'de tanıma: Portal fazda homojen parlak; arteriyel fazda renal ven karışımı nedeniyle heterojen görünebilir (psödotrombüs).\n"
        "Varyant: Sol taraflı veya duplike İVK, retroaortik sol renal ven.\n"
        "Klinik ipucu: Geç arteriyel fazda karışım artefaktı trombüsle karıştırılabilir; portal fazda tekrar bakılır."),
    "portal_vein_and_splenic_vein": ("Vena portae hepatis et vena splenica", "f",
        "Komşuluk: Splenik ven pankreasın arka yüzünde seyredip SMV ile birleşerek portal veni oluşturur; portal ven hepatoduodenal ligamentte safra yolunun arkasında ilerler.\n"
        "BT'de tanıma: Portal fazda aortayla benzer parlaklıkta; lümen içi dolum defekti trombüs düşündürür.\n"
        "Varyant: Replasan sağ hepatik arter SMA'dan çıkıp portal venin arkasından seyredebilir.\n"
        "Klinik ipucu: Portal ven çapı >13 mm portal hipertansiyon lehinedir; kavernöz transformasyon kronik trombüste izlenir."),
    "stomach": ("Gaster", "m",
        "Komşuluk: Sol üst kadranda karaciğer sol lobu, dalak, pankreas ve transvers kolon ile komşu.\n"
        "BT'de tanıma: İçerik ve gaz nedeniyle değişken; duvarı mukozal kontrastlanma gösterir, kıvrımlar belirgindir.\n"
        "Varyant: Boynuz biçimli veya aşağı sarkık (J) mide.\n"
        "Klinik ipucu: Distansiyon olmadan duvar kalınlaşması yanlış pozitif olabilir; mide duvarı kalınlığı su ya da oral kontrastla değerlendirilir."),
    "duodenum": ("Duodenum", "n",
        "Komşuluk: Pankreas başını C biçiminde sarar; safra yolu ve pankreas kanalı ikinci kısmına açılır; üçüncü kısmı aorta ile SMA arasından geçer.\n"
        "BT'de tanıma: Kollabe ise yumuşak doku duvarı; sıvıyla dolu ise ince duvarlı lümen.\n"
        "Varyant: Duodenal divertikül (ikinci kısım, papilla yakını).\n"
        "Klinik ipucu: Üçüncü kısmın SMA ile aorta arasında sıkışması SMA sendromuna yol açabilir."),
    "urinary_bladder": ("Vesica urinaria", "f",
        "Komşuluk: Pelvik kavitede pubik simfizin arkasında; erkekte arkasında rektum ve seminal veziküller, kadında uterus ve vajen.\n"
        "BT'de tanıma: Dolu mesane sıvı dansitesinde (0–10 HU), ince düzgün duvar; kontrast verilmişse üriner faz sonrası yoğunlaşır.\n"
        "Varyant: Divertikül, urakus kalıntısı.\n"
        "Klinik ipucu: Mesane yeterince dolu değilse duvar kalınlaşması yanlış yorumlanabilir; fokal kalınlaşma sistoskopiyle ilişkilendirilir."),
}


# Notu henüz olmayan yapılar için yalnızca Latince ad: BASE anahtarı -> (ad, cinsiyet)
LATIN_ONLY = {
    "esophagus": ("Oesophagus", "m"), "small_bowel": ("Intestinum tenue", "n"), "colon": ("Colon", "n"),
    "kidney_cyst": ("Cystis renalis", "f"), "prostate": ("Prostata", "f"), "iliac_artery": ("Arteria iliaca communis", "f"),
    "iliac_vena": ("Vena iliaca communis", "f"), "sacrum": ("Os sacrum", "n"), "hip": ("Os coxae", "n"),
    "femur": ("Femur", "n"), "costal_cartilages": ("Cartilagines costales", "f"), "sternum": ("Sternum", "n"),
    "trachea": ("Trachea", "f"), "thyroid_gland": ("Glandula thyroidea", "f"),
    "atrial_appendage_left": ("Auricula atrii sinistri", "f"), "pulmonary_vein": ("Venae pulmonales", "f"),
    "superior_vena_cava": ("Vena cava superior", "f"), "brachiocephalic_vein": ("Vena brachiocephalica", "f"),
    "brachiocephalic_trunk": ("Truncus brachiocephalicus", "m"), "common_carotid_artery": ("Arteria carotis communis", "f"),
    "subclavian_artery": ("Arteria subclavia", "f"), "clavicula": ("Clavicula", "f"), "scapula": ("Scapula", "f"),
    "humerus": ("Humerus", "m"), "skull": ("Cranium", "n"),
    "iliopsoas": ("Musculus iliopsoas", "m"), "gluteus_maximus": ("Musculus gluteus maximus", "m"),
    "gluteus_medius": ("Musculus gluteus medius", "m"), "gluteus_minimus": ("Musculus gluteus minimus", "m"),
    "autochthon": ("Musculus erector spinae", "m"), "heart": ("Cor", "n"), "spinal_cord": ("Medulla spinalis", "f"),
}
ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
VERTEBRA_LA = {"C": "cervicalis", "T": "thoracica", "L": "lumbalis", "S": "sacralis"}
LOBE_LA = {"upper": "superior", "middle": "medius", "lower": "inferior"}


def latin_only(key):
    """Üretilebilen Latince adlar (omurga, kaburga, akciğer lobu, segment, notsuz katalog yapıları)."""
    if key.startswith("liver_segment_"):
        return f"Segmentum hepatis {ROMAN[int(key.rsplit('_', 1)[1])]}"
    if key.startswith("vertebrae_"):
        lvl = key.split("_")[1]
        return f"Vertebra {VERTEBRA_LA[lvl[0]]} {ROMAN[int(lvl[1:])]}"
    if key.startswith("rib_"):
        _, side, n = key.split("_")
        return f"Costa {ROMAN[int(n)]} {'sinistra' if side == 'left' else 'dextra'}"
    if key.startswith("lung_"):
        parts = key.split("_")
        return f"Lobus {LOBE_LA[parts[1]]} pulmonis {'sinistri' if parts[-1] == 'left' else 'dextri'}"
    base, side = key, None
    for suffix, i in (("_left", 0), ("_right", 1)):
        if key.endswith(suffix) and key[: -len(suffix)] in LATIN_ONLY:
            base, side = key[: -len(suffix)], i
    if base in LATIN_ONLY:
        name, gender = LATIN_ONLY[base]
        return f"{name} {LATIN_SIDE[gender][side]}" if side is not None else name
    return None


GROUP_BY_BASE = {
    "clavicula": "Omuz kuşağı ve kol", "scapula": "Omuz kuşağı ve kol", "humerus": "Omuz kuşağı ve kol",
    "hip": "Pelvis ve femur", "sacrum": "Pelvis ve femur", "femur": "Pelvis ve femur",
    "brachiocephalic_trunk": "Baş, boyun ve kol arterleri", "common_carotid_artery": "Baş, boyun ve kol arterleri",
    "subclavian_artery": "Baş, boyun ve kol arterleri", "iliac_artery": "İliak damarlar", "iliac_vena": "İliak damarlar",
    "superior_vena_cava": "Toraks venleri", "brachiocephalic_vein": "Toraks venleri", "pulmonary_vein": "Toraks venleri",
    "gluteus_maximus": "Gluteal kaslar", "gluteus_medius": "Gluteal kaslar", "gluteus_minimus": "Gluteal kaslar",
}


def group_of(key):
    """Yapı ağacındaki alt grup (Sistem -> alt grup -> yapı); gruplanmayanlar için None."""
    if key.startswith("vertebrae_"):
        return "Omurga"
    if key.startswith("rib_"):
        return "Kaburgalar"
    if key.startswith("lung_"):
        return "Akciğer lobları"
    base = key
    for suffix in ("_left", "_right"):
        if key.endswith(suffix):
            base = key[: -len(suffix)]
    return GROUP_BY_BASE.get(base)


def describe_extra(key):
    """Anahtar için (latince, not) döner; not yoksa None. Çiftlilerde yan eki eklenir."""
    base, side = key, None
    for suffix, i in (("_left", 0), ("_right", 1)):
        if key.endswith(suffix) and key[: -len(suffix)] in NOTES:
            base, side = key[: -len(suffix)], i
    if base not in NOTES:
        return latin_only(key), None
    name, gender, note = NOTES[base]
    return (f"{name} {LATIN_SIDE[gender][side]}" if side is not None else name), note


LUNG_LOBES = {"upper": "üst", "middle": "orta", "lower": "alt"}

# Couinaud segmentleri: numara -> (Türkçe ad, İngilizce ad, renk, kısa not)
LIVER_SEGMENTS = {
    1: ("Segment I (kaudat lob)", "Segment I (caudate lobe)", "#ff6b6b",
        "Kaudat lob. İVK'nın önünde yer alır; sağ ve sol portal dallardan beslenir, venleri doğrudan İVK'ya açılır."),
    2: ("Segment II", "Segment II", "#ffd166",
        "Sol lateral süperior segment. Sol hepatik venin lateralinde, sol portal venin üstünde."),
    3: ("Segment III", "Segment III", "#06d6a0",
        "Sol lateral inferior segment. Umbilikal fissürün solunda, sol portal venin altında."),
    4: ("Segment IV", "Segment IV", "#118ab2",
        "Sol medial segment. Orta hepatik ven ile umbilikal fissür arasında; IVa üstte, IVb (kuadrat lob) altta."),
    5: ("Segment V", "Segment V", "#f78c6b",
        "Sağ anterior inferior segment. Safra kesesi yatağına komşu, portal ven düzeyinin altında."),
    6: ("Segment VI", "Segment VI", "#c77dff",
        "Sağ posterior inferior segment. Sağ hepatik venin arkasında, portal ven düzeyinin altında."),
    7: ("Segment VII", "Segment VII", "#4cc9f0",
        "Sağ posterior süperior segment. Sağ hepatik venin arkasında, portal ven düzeyinin üstünde."),
    8: ("Segment VIII", "Segment VIII", "#f15bb5",
        "Sağ anterior süperior segment. Orta ve sağ hepatik venler arasında, portal ven düzeyinin üstünde."),
}


def describe(key):
    """Anahtarı (ad_tr, ad_en, sistem, renk) olarak çözer; bilinmeyenlerde None."""
    if key.startswith("liver_segment_"):
        n = int(key.rsplit("_", 1)[1])
        tr, en, color, _ = LIVER_SEGMENTS[n]
        return (tr, en, "kc_segment", color)
    if key.startswith("vertebrae_"):
        lvl = key.split("_")[1]
        tone = "#f1e9d2" if int(lvl[1:]) % 2 else "#d9cba3"
        return (f"{lvl} vertebra", f"{lvl} vertebra", "kemik", tone)
    if key.startswith("rib_"):
        _, side, n = key.split("_")
        tr = "Sol" if side == "left" else "Sağ"
        return (f"{tr} {n}. kaburga", f"{side.capitalize()} rib {n}", "kemik", "#cdbf9a")
    if key.startswith("lung_"):
        parts = key.split("_")  # lung_upper_lobe_left
        tr = "Sol" if parts[-1] == "left" else "Sağ"
        return (f"{tr} akciğer {LUNG_LOBES[parts[1]]} lob", f"{parts[-1].capitalize()} lung {parts[1]} lobe",
                "solunum", "#a8dadc" if parts[-1] == "left" else "#94c9d9")
    for suffix, tr, en in (("_left", "Sol", "Left"), ("_right", "Sağ", "Right")):
        if key.endswith(suffix) and key[: -len(suffix)] in BASE:
            name_tr, name_en, system, color = BASE[key[: -len(suffix)]]
            return (f"{tr} {name_tr}", f"{en} {name_en}", system, color)
    return BASE.get(key)


def to_display(slice2d):
    """[a, b] indeksli dilimi radyolojik ekran yönüne çevirir: [v, u]."""
    return slice2d[::-1, ::-1].T


def plane_slices(vol, plane):
    """Düzlem boyunca ekran yönünde 2B dilimleri üretir (RAS hacim varsayılır)."""
    axis = {"axial": 2, "coronal": 1, "sagittal": 0}[plane]
    for idx in range(vol.shape[axis]):
        yield idx, to_display(np.take(vol, idx, axis=axis))


def anchor_point(mask2d):
    """Maskenin en büyük parçasında kenardan en uzak nokta (u, v)."""
    lab, n = ndimage.label(mask2d)
    if n > 1:
        sizes = ndimage.sum(mask2d, lab, range(1, n + 1))
        mask2d = lab == (int(np.argmax(sizes)) + 1)
    sl = ndimage.find_objects(mask2d.astype(np.uint8))[0]
    sub = np.pad(mask2d[sl], 1)
    dist = ndimage.distance_transform_edt(sub)
    v, u = np.unravel_index(int(np.argmax(dist)), dist.shape)
    return int(u - 1 + sl[1].start), int(v - 1 + sl[0].start)


def noise_sigma(ct):
    """Yumuşak dokuda komşu voksel farklarından sağlam (MAD) gürültü tahmini, HU."""
    a, b = ct[1:], ct[:-1]
    d = (a - b)[(a > -100) & (a < 200) & (b > -100) & (b < 200)]
    return float(1.4826 * np.median(np.abs(d - np.median(d))) / np.sqrt(2))


def denoise(ct, strength=0.6, keep=0.15, chunk=32):
    """3B non-local means ile gürültüyü azaltır; kenarları ve küçük damarları korur.

    Ham görüntünün `keep` oranı geri karıştırılır: saf NLM dokuyu mumsu gösterir,
    %15 karışım normal dozlu BT'ye benzer bir tanecik bırakır (σ ≈ 9 HU).
    Hacim z boyunca örtüşen dilimlerle paralel işlenir; örtüşme arama penceresini
    (patch_distance + patch_size // 2) karşıladığı için sonuç tek parça işlemle aynıdır.
    """
    sigma = noise_sigma(ct)
    pad = 5
    nz = ct.shape[2]
    starts = range(0, nz, chunk)

    def run(z0):
        a, b = max(z0 - pad, 0), min(z0 + chunk + pad, nz)
        out = denoise_nl_means(ct[:, :, a:b], patch_size=3, patch_distance=4,
                               h=strength * sigma, sigma=sigma, fast_mode=True)
        return out[:, :, z0 - a: z0 - a + min(chunk, nz - z0)]

    with ThreadPoolExecutor(min(8, os.cpu_count() or 1)) as ex:
        result = np.concatenate(list(ex.map(run, starts)), axis=2).astype(np.float32)
    return result + keep * (ct - result), sigma


def load_masks(folder, exclude=()):
    """Klasördeki boş olmayan, katalogda tanımlı maskeleri sıralı yükler."""
    structures, masks = [], []
    for f in sorted(folder.glob("*.nii.gz")):
        key = f.name[: -len(".nii.gz")]
        if key in exclude:
            print(f"  dışlandı: {key}")
            continue
        m = np.asarray(nib.as_closest_canonical(nib.load(f)).dataobj) > 0
        if not m.any():
            continue
        info = describe(key)
        if info is None:
            print(f"  atlandı (katalogda yok): {key}")
            continue
        masks.append(m)
        entry = {"key": key, "tr": info[0], "en": info[1], "system": info[2], "color": info[3]}
        if group_of(key):
            entry["group"] = group_of(key)
        la, note = describe_extra(key)
        if la:
            entry["la"] = la
        if note:
            entry["note"] = note
        structures.append(entry)
    return structures, masks


def build_lesions(mask, labels, structures, ct, voxel_ml, min_voxels=15):
    """Lezyon maskesini (kırpılmış, [x, y, z]) yakın parçaları birleştirerek numaralı bileşenlere ayırır.

    Dönüş: (uint8 hacim, öğeler). Kimlikler boyuta göre azalan sırayla 1..N; küçük gürültü atılır.
    """
    merged = ndimage.binary_dilation(mask, structure=np.ones((3, 3, 3)), iterations=2)
    comp, n = ndimage.label(merged, structure=np.ones((3, 3, 3)))
    comp = np.where(mask, comp, 0)
    sizes = ndimage.sum(mask, comp, range(1, n + 1))
    order = [i + 1 for i in np.argsort(-np.asarray(sizes)) if sizes[i] >= min_voxels]
    vol = np.zeros(mask.shape, np.uint8)
    items = []
    mid_x = mask.shape[0] / 2
    for new_id, old in enumerate(order, 1):
        m = comp == old
        vol[m] = new_id
        pts = np.argwhere(m)
        c = pts.mean(0)
        near = pts[np.argmin(((pts - c) ** 2).sum(1))]  # merkeze en yakın lezyon vokseli
        # Yer: lezyonu saran 3 vokselli kabukta en çok geçen yapılar (otomatik)
        shell = ndimage.binary_dilation(m, iterations=3) & ~m
        ids, counts = np.unique(labels[shell], return_counts=True)
        ranked = [int(i) for _, i in sorted(zip(-counts, ids)) if i > 0]
        near_names = [structures[i - 1]["tr"] for i in ranked[:2]]
        side = "Sağ" if c[0] > mid_x else "Sol"
        items.append({
            "id": new_id,
            "tr": f"{side} pulmoner emboli odağı ({new_id})",
            "en": f"{'Right' if side == 'Sağ' else 'Left'} pulmonary embolus ({new_id})",
            "la": "Embolus arteriae pulmonalis",
            "loc": f"{side} taraf · komşu: {', '.join(near_names)} (otomatik)" if near_names else f"{side} taraf",
            "volumeMl": round(float(m.sum()) * voxel_ml, 2),
            "hu": int(round(float(ct[m].mean()))),
            "focus": {"axial": int(near[2]), "coronal": int(near[1]), "sagittal": int(near[0])},
        })
    return vol, items


def partition_within(parent, parts, first_id):
    """Parçaları ebeveyn maskeye kırpar; açıkta kalan vokselleri en yakın parçaya atar."""
    vol = np.zeros(parent.shape, np.uint8)
    for i, m in enumerate(parts):
        vol[m & parent] = first_id + i
    gaps = parent & (vol == 0)
    if gaps.any() and (vol > 0).any():
        box = ndimage.find_objects(parent.astype(np.uint8))[0]
        sub, sub_gaps = vol[box], gaps[box]
        idx = ndimage.distance_transform_edt(sub == 0, return_distances=False, return_indices=True)
        sub[sub_gaps] = sub[tuple(i[sub_gaps] for i in idx)]
    return vol, int(gaps.sum())


def compute_anchors(volumes, n_ids, structures, min_area):
    """Her düzlemde kesit başına [id, u, v] etiket noktaları ve her yapının odak kesiti."""
    anchors = {}
    for plane, axis in (("axial", 2), ("coronal", 1), ("sagittal", 0)):
        n_slices = volumes[0].shape[axis]
        areas = np.zeros((n_ids + 1, n_slices), int)
        per_slice = [[] for _ in range(n_slices)]
        for vol in volumes:
            for idx, sl in plane_slices(vol, plane):
                ids, counts = np.unique(sl, return_counts=True)
                for sid, cnt in zip(ids, counts):
                    if sid == 0:
                        continue
                    areas[sid, idx] = cnt
                    if cnt >= min_area:
                        u, v = anchor_point(sl == sid)
                        per_slice[idx].append([int(sid), u, v])
        anchors[plane] = per_slice
        for sid, s in enumerate(structures, 1):
            s.setdefault("focus", {})[plane] = int(np.argmax(areas[sid]))
        print(f"  {plane}: {n_slices} kesit")
    return anchors


def main(case_dir, out_dir, overlay_dir=None, min_area=12):
    case_dir, out_dir = Path(case_dir), Path(out_dir)
    case = CASES[case_dir.name]
    out_dir.mkdir(parents=True, exist_ok=True)

    ct_img = nib.as_closest_canonical(nib.load(case_dir / "ct.nii.gz"))
    assert nib.aff2axcodes(ct_img.affine) == ("R", "A", "S")
    ct = np.asarray(ct_img.dataobj).astype(np.float32)
    spacing = [float(s) for s in ct_img.header.get_zooms()[:3]]

    structures, masks = load_masks(case_dir / "segmentations", case.get("exclude", ()))
    ov_structures, ov_masks = load_masks(Path(overlay_dir)) if overlay_dir else ([], [])
    for s in ov_structures:
        s["note"] = LIVER_SEGMENTS[int(s["key"].rsplit("_", 1)[1])][3]

    # Vücut sınırına kırp (hava boşluğunu atar)
    body = ndimage.binary_opening(ct > -400, iterations=2)
    nz = np.argwhere(body)
    lo = np.maximum(nz.min(0) - 6, 0)
    hi = np.minimum(nz.max(0) + 7, ct.shape)
    crop = tuple(slice(a, b) for a, b in zip(lo, hi))
    ct = ct[crop]
    ct, sigma = denoise(ct)
    print(f"  gürültü azaltma: σ {sigma:.1f} HU -> {noise_sigma(ct):.1f} HU")
    labels = np.zeros(ct.shape, np.uint8)
    for i, m in enumerate(masks, start=1):
        labels[m[crop]] = i  # Çakışmada sonraki yapı kazanır; TotalSegmentator maskeleri zaten ayrık

    # Yön kontrolü: karaciğer hastanın sağında, yani RAS'ta x indeksi büyük olmalı
    liver_id = next(i for i, s in enumerate(structures, 1) if s["key"] == "liver")
    assert np.argwhere(labels == liver_id)[:, 0].mean() > ct.shape[0] / 2, "Beklenmeyen yön"

    # Katman: segmentler karaciğeri boşluksuz böler, kimlikleri ana yapıların ardından gelir
    volumes = [labels]
    overlay = None
    if ov_masks:
        overlay, filled = partition_within(labels == liver_id, [m[crop] for m in ov_masks], len(structures) + 1)
        print(f"  segment katmanı: {filled} boş karaciğer vokseli en yakın segmente atandı")
        structures += ov_structures
        volumes.append(overlay)

    anchors = compute_anchors(volumes, len(structures), structures, min_area)

    lesions, lesion_items = None, []
    if case.get("lesions"):
        lm = np.asarray(nib.as_closest_canonical(nib.load(case_dir / case["lesions"])).dataobj) > 0
        lesions, lesion_items = build_lesions(lm[crop], labels, structures, ct, float(np.prod(spacing)) / 1000)
        print(f"  lezyon: {len(lesion_items)} bileşen, {sum(i['volumeMl'] for i in lesion_items):.1f} mL")
        assert lesion_items, "Lezyon bulunamadı"

    voxel_ml = float(np.prod(spacing)) / 1000
    for sid, s in enumerate(structures, 1):
        s["id"] = sid
        vol = overlay if s["system"] == "kc_segment" else labels
        s["volumeMl"] = round(float((vol == sid).sum()) * voxel_ml, 1)

    hu = np.clip(np.rint(ct), -1024, 3071).astype(np.int16)
    # nibabel [x, y, z] -> bellekte [z][y][x]
    outputs = {"ct.bin.gz": hu, "labels.bin.gz": labels}
    if overlay is not None:
        outputs["overlay.bin.gz"] = overlay
    if lesions is not None:
        outputs["lesions.bin.gz"] = lesions
    for name, arr in outputs.items():
        # mtime=0: içerik aynıysa dosya da bayt bayt aynı kalır, git boşuna değişiklik görmez
        with gzip.GzipFile(out_dir / name, "wb", compresslevel=9, mtime=0) as fh:
            fh.write(np.ascontiguousarray(arr.transpose(2, 1, 0)).tobytes())

    write_thumb(out_dir, case_dir.name, case, structures, ct, labels, lesions, lesion_items)
    # Veri sürümü: içerik değişince değişir; tarayıcı ve servis çalışanı önbelleği buna göre yenilenir
    digest = hashlib.sha1(hu.tobytes()[::97] + labels.tobytes()[::97]).hexdigest()[:10]

    atlas = {
        "v": digest,
        "case": case_dir.name,
        "title": case["title"],
        "eyebrow": case["eyebrow"],
        "win": case["win"],
        "start": case["start"],
        "dims": [int(d) for d in ct.shape],
        "spacing": spacing,
        "systems": [{"id": i, "name": n, "default": d} for i, n, d in SYSTEMS],
        "structures": structures,
        "anchors": anchors,
        # Katman sistemi açıkken overlay hacmi ana etiketlerin önüne geçer ve "hides" yapıları gizlenir
        "overlay": {"file": "overlay.bin.gz", "system": "kc_segment", "hides": ["liver"]} if overlay is not None else None,
        "source": case.get("source", "TotalSegmentator dataset v2.0.1 (Wasserthal et al., Radiology: AI 2023), CC BY 4.0"),
        "sourceUrl": case.get("sourceUrl", "https://zenodo.org/records/10047292"),
    }
    if lesions is not None:
        atlas["lesions"] = {"file": "lesions.bin.gz", "items": lesion_items}
        atlas["diagnosis"] = case["diagnosis"]
    if overlay is None:
        atlas["systems"] = [s for s in atlas["systems"] if s["id"] != "kc_segment"]
    (out_dir / "atlas.json").write_text(json.dumps(atlas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    verify(out_dir)
    write_index(out_dir.parent)


def write_thumb(out_dir, case_id, case, structures, ct, labels, lesions=None, lesion_items=()):
    """Ana sayfa kartı için renkli aksiyel küçük görsel: docs/img/<vaka>.jpg"""
    from PIL import Image

    start = next((s for s in structures if s["key"] == case["start"]), structures[0])
    z = lesion_items[0]["focus"]["axial"] if lesion_items else start["focus"]["axial"]
    g = np.clip((ct[:, :, z] - (40 - 200)) / 400, 0, 1)
    rgb = np.stack([g] * 3, -1) * 255
    lab = labels[:, :, z]
    for sid, s in enumerate(structures, 1):
        if s["system"] in ("kemik", "kas", "kc_segment"):
            continue
        m = lab == sid
        if m.any():
            c = np.array([int(s["color"][i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)
            rgb[m] = rgb[m] * 0.55 + c * 0.45
    if lesions is not None:
        lm = lesions[:, :, z] > 0
        rgb[lm] = rgb[lm] * 0.2 + np.array([255, 40, 40]) * 0.8
    # [x, y] -> ekran: hastanın sağı solda, ön üstte
    img = Image.fromarray(rgb.transpose(1, 0, 2)[::-1, ::-1].astype(np.uint8))
    img = img.resize((640, round(640 * img.height / img.width)), Image.LANCZOS)
    path = out_dir.parent.parent / "img"
    path.mkdir(exist_ok=True)
    img.save(path / f"{case_id}.jpg", quality=82, optimize=True)


def write_index(data_dir):
    """data/cases.json: klasörde atlas.json'u olan vakalar, CASES sırasıyla."""
    items = []
    for k, v in CASES.items():
        f = data_dir / k / "atlas.json"
        if f.exists():
            a = json.loads(f.read_text(encoding="utf-8"))
            items.append({"id": k, "title": v["title"], "eyebrow": v["eyebrow"], "n": len(a["structures"]),
                          "mm": a["spacing"][0], "img": f"img/{k}.jpg", "category": v["category"],
                          "region": v["region"], "status": "ready"})
    items += [{**p, "status": "planned"} for p in PLANNED]
    (data_dir / "cases.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")


def verify(out_dir):
    """Yazılan dosyaları geri okuyup denetler; özeti tek satırda, sorunları ayrı satırlarda basar."""
    atlas = json.loads((out_dir / "atlas.json").read_text(encoding="utf-8"))
    n = int(np.prod(atlas["dims"]))
    structures = atlas["structures"]
    problems, sizes = [], []
    for name, dtype in (("ct.bin.gz", np.int16), ("labels.bin.gz", np.uint8), ("overlay.bin.gz", np.uint8), ("lesions.bin.gz", np.uint8)):
        path = out_dir / name
        if not path.exists():
            if (name == "overlay.bin.gz" and atlas["overlay"]) or (name == "lesions.bin.gz" and atlas.get("lesions")) or name in ("ct.bin.gz", "labels.bin.gz"):
                problems.append(f"{name} yok")
            continue
        arr = np.frombuffer(gzip.open(path).read(), dtype=dtype)
        sizes.append(f"{name} {path.stat().st_size / 1e6:.1f} MB")
        if arr.size != n:
            problems.append(f"{name} boyutu uyumsuz ({arr.size} != {n})")
        elif dtype == np.uint8 and arr.max() > len(structures):
            problems.append(f"{name} en büyük kimlik {arr.max()} > yapı sayısı {len(structures)}")
    problems += [f"Türkçe adı eksik: {s['key']}" for s in structures if not s.get("tr")]
    problems += [f"notu eksik: {s['key']}" for s in structures if s["system"] == "kc_segment" and not s.get("note")]
    for p in problems:
        print(f"  SORUN: {p}")
    status = "Tamam" if not problems else f"{len(problems)} SORUN"
    print(f"{status}: {len(structures)} yapı, {len(atlas['systems'])} sistem, boyut {atlas['dims']}, {', '.join(sizes)}")


if __name__ == "__main__":
    if sys.argv[1] == "--verify":
        verify(Path(sys.argv[2]))
    else:
        main(*sys.argv[1:4])
