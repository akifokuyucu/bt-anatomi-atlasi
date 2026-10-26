"""Laparoskopik video atlası üretimi (açık lisanslı video → docs/data/<vaka>/).

Adımlar:
  1. Kaynak videodan klibi keser, siyah bantları kırpar → video.mp4 (H.264, sessiz)
  2. SAM 2 için kareleri çıkarır (her 2. kare, 12,5 fps) → data/raw/.../frames/
  3. SAM 2 video yayılımı (lapa_sam.py): istem noktaları CASES[...]["prompts"]'ta. Bu bilgisayarda
     yalnızca CPU, 512 piksel, kare başına ~1–3 sn. Daha güçlü bilgisayarda çalıştırmak için
     --paket ile taşınabilir zip üretilir, oradan gelen masks.npz --masks ile içeri alınır.
  4. Maskeler çokgene çevrilir → video.json; kontrol için özet görüntü → .claude/tmp_frames/

Maskeler yarı otomatiktir; uzman gözden geçirmesi olmadan "doğrulanmış" sayılmaz.

Kullanım:
    python scripts/build_lapa_video.py --case lapav01              # her şey, burada
    python scripts/build_lapa_video.py --case lapav01 --paket      # paket/lapav01_sam_paketi.zip
    python scripts/build_lapa_video.py --case lapav01 --masks yol/masks.npz  # dışarıdan gelen maskeler
    python scripts/build_lapa_video.py --case lapav01 --skip-sam   # yalnızca JSON (önbellekteki maskelerden)
"""
import argparse
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

import numpy as np

import lapa_sam

ROOT = Path(__file__).resolve().parent.parent
STEP = 2      # her STEP karede bir maske (25 fps → 12,5 fps)
SAM_CACHE = ROOT / ".ml-cache" / "sam2"
# Bu bilgisayar (yalnızca CPU, az RAM): en küçük model, 512 piksel (klip zaten 640 piksel)
SAM_LOCAL = {"model": "tiny", "size": 512, "device": "cpu", "chunk": 100}

# yapı anahtarı: (Türkçe, İngilizce, Latince, renk, grup, BT atlasındaki karşılığı)
# Renkler BT atlasının BASE kataloğuyla aynı.
STRUCTS = {
    "gallbladder": ("Safra kesesi", "Gallbladder", "Vesica biliaris", "#4cbb6c", "organ", "gallbladder"),
    "liver": ("Karaciğer", "Liver", "Hepar", "#e07b53", "organ", "liver"),
    "instrument": ("Cerrahi alet", "Surgical instrument", None, "#9fb3c8", "alet", None),
    "appendix": ("Apendiks", "Appendix", "Appendix vermiformis", "#e2b84a", "organ", None),
    "mesoappendix": ("Mezoapendiks", "Mesoappendix", "Mesoappendix", "#b97fd1", "organ", None),
}

# TASLAK: bir cerrah veya anatomist gözden geçirmeden yayın "doğrulanmış" sayılmaz.
NOTES = {
    "gallbladder": "Laparoskopide tanıma: Karaciğerin alt yüzüne yapışık armut biçimli kese; normalde yeşilimsi-mavi ve ince duvarlıdır.\n"
                   "Bu videoda: Kese kendi ekseni etrafında dönmüş (torsiyon), dolaşımı bozulduğu için koyu kahverengi-siyah, gangrenli görünüyor. Önce derotasyon, sonra dekompresyon yapılıyor.",
    "liver": "Laparoskopide tanıma: Kırmızı-kahverengi, düzgün ve parlak yüzeyli, keskin kenarlı organ.\n"
             "Bu videoda: Safra kesesinin üstünde ve solunda karaciğerin alt yüzü (segment IV–V) görülüyor.",
    "instrument": "Trokarlardan giren tutucu (grasper), makas veya aspiratör. Gerçek ameliyat videolarında anatomiyi sık sık örter; yapay zekâ modelleri için en kolay ayırt edilen sınıftır.",
    # lapav02 (TASLAK, cerrahi gözden geçirme bekliyor)
    "appendix": "Laparoskopide tanıma: Çekumun alt-iç tarafından çıkan, ince, kör sonlanan tüp; sağlıklıda soluk pembe, iltihapta kırmızı ve kalınlaşmış görünür.\n"
                "Bu videoda: Tutucu ile kaldırılan ve mezoapendiksinden ayrılan apendiks görülüyor.",
    "mesoappendix": "Laparoskopide tanıma: Apendiksi çekum ve ileuma bağlayan, içinde apendiküler arter taşıyan yağlı periton katlantısı; sarımsı-turuncu yağlı doku olarak görünür.\n"
                    "Bu videoda: Mezoapendiks koter ile kesilerek apendiksten ayrılıyor.",
}

CASES = {
    "lapav01": {
        "title": "Safra kesesi torsiyonu · laparoskopik kolesistektomi",
        "eyebrow": "LAPAROSKOPİ · VİDEO",
        "text": "Video düz akar; filtreye basınca safra kesesi, karaciğer ve aletler üstüne gelir. Torsiyona uğramış gangrenli kese, derotasyon ve dekompresyon.",
        "cover": 60,  # kapak karesi (12,5 fps indeksi)
        "src": "data/raw/commons/gb_torsion/source.ogv",
        "start": 0.0, "dur": 30.0, "crop": "640:358:0:60",
        "scenes": [0, 294],  # sahne kesmesi (12,5 fps kare indeksi); yayılım kesmeyi geçmez
        # nesne kimliği → yapı anahtarı (aynı yapıdan birden çok nesne olabilir)
        "objects": {1: "gallbladder", 2: "liver", 3: "instrument", 4: "instrument"},
        # kare → {nesne: [(x, y, etiket)]}; etiket 1 = içinde, 0 = dışında. Koordinatlar 640×358 klipte.
        "prompts": {
            0: {1: [(300, 150, 1), (380, 220, 1), (250, 240, 1), (330, 60, 1), (80, 150, 0)],
                2: [(80, 60, 1), (90, 150, 1), (130, 220, 1), (300, 150, 0)]},
            40: {1: [(280, 170, 1), (200, 230, 1), (350, 100, 1), (60, 150, 0)],
                 2: [(40, 100, 1), (60, 200, 1), (280, 170, 0)],
                 3: [(560, 150, 1), (500, 170, 1), (470, 185, 1), (280, 170, 0)]},
            120: {1: [(330, 170, 1), (150, 290, 1), (420, 130, 1), (100, 100, 0)],
                  2: [(100, 100, 1), (60, 30, 1), (330, 170, 0)],
                  3: [(270, 240, 1), (450, 270, 1), (550, 230, 1), (620, 210, 1), (330, 170, 0)]},
            200: {1: [(300, 200, 1), (250, 280, 1), (60, 120, 0)],
                  2: [(50, 80, 1), (80, 200, 1), (300, 200, 0)],
                  3: [(500, 250, 1), (600, 240, 1), (300, 200, 0)],
                  4: [(170, 40, 1), (200, 100, 1), (300, 200, 0)]},
            # Sahne B: kese söndürülmüş, sol altta kavrayıcıda; sağdaki koyu mor yapı pedikül (kese değil)
            294: {1: [(170, 290, 1), (230, 240, 1), (350, 210, 0), (450, 250, 0), (300, 60, 0)],
                  2: [(250, 40, 1), (320, 80, 1), (170, 290, 0), (450, 250, 0)],
                  3: [(300, 140, 1), (400, 70, 1), (460, 30, 1), (170, 290, 0)],
                  4: [(50, 60, 1), (100, 110, 1), (170, 290, 0)]},
            340: {1: [(180, 250, 1), (230, 300, 1), (150, 320, 1), (350, 200, 0), (60, 150, 0)],
                  2: [(250, 30, 1), (350, 60, 1), (180, 250, 0)],
                  3: [(300, 170, 1), (420, 90, 1), (540, 20, 1), (180, 250, 0)],
                  4: [(180, 110, 1), (220, 160, 1), (180, 250, 0)]},
        },
        "source": {
            "text": "Video: Boer J, Boerma D, de Vries Reilingh T. A gallbladder torsion presenting as acute cholecystitis in an elderly woman: a case report. J Med Case Rep 2011;5:588 (Ek video 1, ilk 30 sn, kırpıldı). Lisans: CC BY 2.0. Maskeler: SAM 2 ile yarı otomatik, bu projede üretildi.",
            "url": "https://commons.wikimedia.org/wiki/File:A-gallbladder-torsion-presenting-as-acute-cholecystitis-in-an-elderly-woman-A-case-report-1752-1947-5-588-S1.ogv",
            "doi": "10.1186/1752-1947-5-588",
            "license": "CC BY 2.0",
        },
    },
    # Appendix300 / Center4_021 (1080p, 50 fps → 25 fps), apendektomi. Koordinatlar 960×540 SAM karelerinde.
    # İstemler elle seçildi (TASLAK): yayından önce kontrol.jpg ile doğrulanmalı.
    "lapav02": {
        "title": "Laparoskopik apendektomi · mezoapendiks diseksiyonu",
        "eyebrow": "LAPAROSKOPİ · VİDEO",
        "text": "Video düz akar; filtreye basınca apendiks, mezoapendiks ve aletler üstüne gelir. Apendiksin kaldırılması ve mezoapendiksin koter ile ayrılması.",
        "cover": 875,  # kapak karesi (12,5 fps indeksi): apendiks + mezoapendiks + alet birlikte
        "src": "data/raw/lapav02/source.mp4",
        "start": 0.0, "dur": 100.0, "crop": None, "fps": 25, "width": 1280, "crf": 26, "sam_w": 960,
        "scenes": [0, 1005, 1015],  # 1005–1014: beyaz parlama (maske taşınmaz, kareler boş kalır)
        "objects": {1: "appendix", 2: "mesoappendix", 3: "instrument"},
        "prompts": {
            0: {1: [(380, 250, 1), (560, 370, 1), (780, 450, 1), (150, 400, 0), (740, 250, 0)],
                2: [(720, 250, 1), (850, 300, 1), (400, 250, 0), (150, 400, 0)]},
            75: {1: [(250, 190, 1), (450, 260, 1), (560, 400, 1), (100, 400, 0), (800, 120, 0)],
                 3: [(250, 440, 1), (180, 480, 1), (380, 370, 1), (450, 260, 0)]},
            200: {1: [(450, 180, 1), (510, 300, 1), (570, 420, 1), (150, 300, 0), (800, 100, 0)],
                  2: [(400, 280, 1), (430, 380, 1), (480, 200, 0)],
                  3: [(90, 45, 1), (225, 68, 1), (450, 180, 0)]},
            375: {1: [(710, 100, 1), (765, 260, 1), (740, 380, 1), (300, 200, 0), (600, 400, 0)],
                  2: [(590, 400, 1), (680, 390, 1), (740, 260, 0)]},
            # 3. tur (teyitli anatomi): apendiks = sağdaki DAR, soluk pembe band; mezoapendiks = soldaki GENİŞ pembe katlantı + yağlı kısmı
            500: {1: [(745, 120, 1), (735, 230, 1), (690, 340, 1), (560, 160, 0), (500, 260, 0), (600, 100, 0), (150, 300, 0)],
                  2: [(500, 260, 1), (560, 300, 1), (420, 300, 1), (600, 100, 1), (540, 180, 1), (745, 120, 0), (735, 230, 0)]},
            625: {1: [(690, 60, 1), (700, 170, 1), (710, 260, 1), (540, 150, 0), (490, 150, 0), (380, 300, 0), (150, 200, 0)],
                  2: [(380, 300, 1), (330, 320, 1), (490, 150, 1), (540, 150, 1), (600, 200, 1), (690, 60, 0), (700, 170, 0), (450, 450, 0)],
                  3: [(470, 320, 1), (400, 400, 1), (320, 500, 1), (690, 60, 0)]},
            660: {1: [(700, 60, 1), (710, 160, 1), (705, 250, 1), (540, 150, 0), (600, 100, 0), (420, 300, 0)],
                  2: [(420, 300, 1), (380, 330, 1), (470, 220, 1), (540, 150, 1), (600, 100, 1), (700, 60, 0), (710, 160, 0)],
                  3: [(520, 330, 1), (450, 420, 1), (360, 500, 1), (700, 160, 0)]},
            680: {1: [(690, 60, 1), (700, 160, 1), (690, 260, 1), (500, 150, 0), (420, 250, 0), (540, 100, 0)],
                  2: [(420, 250, 1), (380, 300, 1), (500, 100, 1), (540, 170, 1), (690, 60, 0), (700, 160, 0)],
                  3: [(450, 290, 1), (380, 360, 1), (280, 450, 1), (690, 160, 0)]},
            700: {1: [(700, 40, 1), (705, 140, 1), (480, 150, 0), (400, 260, 0), (450, 330, 0), (560, 300, 0), (830, 330, 0), (780, 450, 0)],
                  2: [(380, 250, 1), (430, 330, 1), (480, 150, 1), (560, 300, 1), (600, 200, 1), (700, 40, 0), (830, 330, 0)],
                  3: [(230, 160, 1), (120, 260, 1), (80, 380, 1), (320, 85, 1), (700, 40, 0)]},
            750: {1: [(655, 60, 1), (670, 170, 1), (690, 250, 1), (520, 200, 0), (450, 300, 0), (400, 110, 0), (780, 380, 0), (200, 300, 0)],
                  2: [(400, 110, 1), (350, 140, 1), (500, 150, 1), (560, 260, 1), (655, 60, 0), (670, 170, 0)],
                  3: [(400, 250, 1), (250, 370, 1), (120, 480, 1), (450, 170, 1), (655, 60, 0)]},
            780: {1: [(700, 60, 1), (725, 180, 1), (745, 250, 1), (500, 190, 0), (590, 200, 0), (570, 300, 0), (150, 300, 0)],
                  2: [(500, 190, 1), (470, 240, 1), (590, 200, 1), (570, 300, 1), (560, 120, 1), (700, 60, 0), (725, 180, 0), (150, 300, 0)],
                  3: [(520, 300, 1), (460, 380, 1), (400, 480, 1), (700, 60, 0)]},
            875: {1: [(700, 60, 1), (700, 180, 1), (690, 250, 1), (570, 350, 0), (560, 200, 0), (500, 230, 0), (150, 300, 0)],
                  2: [(500, 230, 1), (460, 285, 1), (530, 55, 1), (570, 350, 1), (560, 200, 1), (700, 60, 0), (700, 180, 0)],
                  3: [(220, 400, 1), (120, 490, 1), (300, 320, 1), (400, 215, 1), (700, 60, 0)]},
            940: {1: [(780, 60, 1), (790, 160, 1), (680, 100, 0), (700, 250, 0), (590, 220, 0), (880, 380, 0), (100, 300, 0), (300, 400, 0)],
                  2: [(590, 220, 1), (550, 260, 1), (680, 100, 1), (700, 250, 1), (780, 60, 0), (790, 160, 0), (100, 300, 0), (150, 400, 0), (300, 400, 0)],
                  3: [(640, 270, 1), (560, 350, 1), (490, 450, 1), (780, 60, 0)]},
            # 74 sn civarı bulanık geçiş: 940 istemi biraz öne de verilir (taşan alet maskesi için sol dokuya negatif)
            932: {1: [(780, 60, 1), (790, 160, 1), (680, 100, 0), (700, 250, 0), (590, 220, 0), (880, 380, 0), (100, 300, 0), (300, 400, 0)],
                  2: [(590, 220, 1), (550, 260, 1), (680, 100, 1), (700, 250, 1), (780, 60, 0), (790, 160, 0), (100, 300, 0), (150, 400, 0), (300, 400, 0)],
                  3: [(640, 270, 1), (560, 350, 1), (490, 450, 1), (780, 60, 0), (150, 150, 0), (150, 300, 0), (250, 250, 0)]},
            990: {1: [(800, 100, 1), (820, 200, 1), (630, 210, 0), (500, 150, 0), (100, 300, 0)],
                  2: [(630, 210, 1), (600, 270, 1), (500, 150, 1), (540, 60, 1), (800, 100, 0), (820, 200, 0), (100, 300, 0)],
                  3: [(300, 350, 1), (200, 470, 1), (380, 260, 1), (470, 120, 1), (430, 170, 1), (800, 100, 0)]},
            # 80,3 sn: ani beyaz parlama (lens/ışık), sonra 81,2 sn'den itibaren yakın plan
            1015: {1: [(510, 80, 1), (515, 200, 1), (480, 320, 1), (330, 120, 0), (250, 100, 0), (230, 290, 0), (800, 100, 0)],
                   2: [(240, 290, 1), (200, 300, 1), (300, 310, 1), (330, 120, 1), (250, 100, 1), (510, 150, 0), (800, 100, 0)]},
            1060: {1: [(570, 40, 1), (580, 140, 1), (350, 130, 0), (450, 200, 0), (300, 300, 0), (800, 150, 0)],
                   2: [(300, 300, 1), (260, 330, 1), (350, 280, 1), (350, 130, 1), (450, 200, 1), (570, 40, 0), (580, 140, 0), (800, 150, 0)]},
            1093: {1: [(590, 50, 1), (570, 150, 1), (300, 150, 0), (450, 180, 0), (300, 300, 0), (800, 150, 0)],
                   2: [(300, 300, 1), (250, 330, 1), (300, 150, 1), (330, 100, 1), (450, 180, 1), (590, 50, 0), (570, 150, 0), (800, 150, 0)],
                   3: [(150, 500, 1), (300, 420, 1), (400, 360, 1), (590, 50, 0)]},
            1125: {1: [(350, 330, 1), (430, 340, 1), (100, 225, 0)],
                   3: [(60, 225, 1), (150, 240, 1), (100, 420, 1), (200, 370, 1), (350, 330, 0)]},
        },
        "source": {
            "text": "Video: Appendix300 veri seti, Center4_021 (Video_Snippets; 1920×1080, 100 sn, yeniden kodlandı). Kolbinger FR, Kirchner M, Saldanha OL ve ark., TU Dresden OPARA, DOI 10.25532/OPARA-1173. Lisans: CC BY 4.0. Maskeler: SAM 2 ile yarı otomatik, bu projede üretildi.",
            "url": "https://doi.org/10.25532/OPARA-1173",
            "doi": "10.25532/OPARA-1173",
            "license": "CC BY 4.0",
        },
    },
}


def ffmpeg_exe():
    """PATH'teki ffmpeg, yoksa imageio-ffmpeg paketinin ikilisi (.venv)."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(cmd):
    if cmd[0] == "ffmpeg":
        cmd = [ffmpeg_exe()] + cmd[1:]
    subprocess.run(cmd, check=True)


def make_clip(case, out, raw):
    """Klip + SAM kareleri. İsteğe bağlı vaka anahtarları (yoksa lapav01 davranışı):
    crop (None = kırpma yok), fps (çıkış kare hızı; STEP varsayımı 25 fps), width (video genişliği), crf, sam_w (SAM kareleri bu genişliğe küçültülür:
    maske belleği ve çokgen boyutu için; çokgenler bu çözünürlükte, video tam çözünürlükte)."""
    src = ROOT / case["src"]
    vf = ([f"crop={case['crop']}"] if case.get("crop") else []) + ([f"fps={case['fps']}"] if case.get("fps") else []) \
        + ([f"scale={case['width']}:-2"] if case.get("width") else [])
    cmd = ["ffmpeg", "-v", "error", "-y", "-ss", str(case["start"]), "-t", str(case["dur"]), "-i", str(src)]
    if vf:
        cmd += ["-vf", ",".join(vf)]
    run(cmd + ["-an", "-c:v", "libx264", "-preset", "slow", "-crf", str(case.get("crf", 24)),
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out / "video.mp4")])
    frames = raw / "frames"
    shutil.rmtree(frames, ignore_errors=True)
    frames.mkdir(parents=True)
    sel = f"select='not(mod(n,{STEP}))'" + (f",scale={case['sam_w']}:-2" if case.get("sam_w") else "")
    run(["ffmpeg", "-v", "error", "-y", "-i", str(out / "video.mp4"), "-vf", sel,
         "-fps_mode", "vfr", "-q:v", "2", "-start_number", "0", str(frames / "%05d.jpg")])
    run(["ffmpeg", "-v", "error", "-y", "-i", str(out / "video.mp4"), "-frames:v", "1", "-q:v", "4",
         str(out / "poster.jpg")])
    return sorted(frames.glob("*.jpg"))


def sam_spec(cid, case):
    """lapa_sam.run() için istem tanımı (istemler.json ile aynı içerik)."""
    return {
        "case": cid, "fps": 25 / STEP, "scenes": case["scenes"], "objects": case["objects"],
        "tools": [k for k, v in STRUCTS.items() if v[4] == "alet"],
        "colors": {k: v[3] for k, v in STRUCTS.items()}, "prompts": case["prompts"],
    }


PAKET_BENIOKU = """LAPAROSKOPİ VİDEO MASKE PAKETİ ({cid})
==========================================

Bu paket, BT Anatomi Atlası'nın video modundaki maskeleri SAM 2 ile üretir.
Bilgisayara sistem çapında bir şey kurmaz; her şey bu klasördeki .venv ve model\\
altına iner (~3-5 GB: PyTorch + model ağırlığı). İşiniz bitince klasörü silebilirsiniz.

GEREKENLER
- Windows 10/11
- Python 3.10-3.14 (python.org; kurarken "Add python.exe to PATH" işaretli olsun)
- İnternet (ilk çalıştırmada paketler ve model indirilir)
- NVIDIA ekran kartı varsa otomatik kullanılır (çok daha hızlı; daha büyük model,
  1024 piksel). Yoksa işlemciyle çalışır.

ÇALIŞTIRMA
1. Zip'i bir klasöre çıkarın (ör. C:\\lapa). Yolda Türkçe karakter olmasın.
2. CALISTIR.bat dosyasına çift tıklayın.
   İlk seferde kurulum 5-15 dk sürer, sonra yayılım başlar.
   Süre: NVIDIA GPU ile birkaç dakika; işlemciyle 10-40 dk (işlemciye bağlı).
3. "Bitti" yazınca cikti\\ klasörüne bakın:
   - cikti\\kontrol.jpg : 16 karelik kontrol görüntüsü (maskeler doğru yerde mi?)
   - cikti\\masks.npz   : GERİ GETİRİLECEK DOSYA

GERİ GETİRME
masks.npz dosyasını dizüstü bilgisayara (USB, Drive vb.) taşıyıp
D:\\Bt analiz\\data\\raw\\ altına koyun ve Claude'a "maskeleri içeri al" deyin. Ya da:
  .venv\\Scripts\\python scripts\\build_lapa_video.py --case {cid} --masks data\\raw\\masks.npz

SEÇENEKLER (isteğe bağlı; klasörde komut satırı açıp)
  CALISTIR.bat --model large      daha büyük model (GPU önerilir)
  CALISTIR.bat --size 1024        iç çözünürlük (CPU'da yavaş)
  CALISTIR.bat --chunk 50         RAM azsa
  CALISTIR.bat --device cpu       GPU'yu kullanma

LİSANS
{kaynak}
SAM 2: Apache 2.0 (Meta).
Eğitim amaçlıdır, tanı için kullanılamaz.
"""

# Windows PowerShell 5.1 uyumlu; ileti metinleri ASCII (kod sayfası sorunu olmasın)
PAKET_PS1 = r"""# Laparoskopi video maske paketi: kurulum + calistirma
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
$py = $null
foreach ($c in @('py -3.14', 'py -3.13', 'py -3.12', 'py -3.11', 'py -3.10', 'python')) {
  $exe, $rest = $c.Split(' ')
  try {
    & $exe @rest -c "import sys; assert (3,10) <= sys.version_info[:2] <= (3,14)" 2>$null
    if ($LASTEXITCODE -eq 0) { $py = $c; break }
  } catch {}
}
if (-not $py) { Write-Host 'Python 3.10-3.14 bulunamadi. python.org adresinden kurun ("Add python.exe to PATH" isaretli).' -ForegroundColor Red; exit 1 }
Write-Host "Python: $py"
$venv = Join-Path $PSScriptRoot '.venv'
$vpy = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path $vpy)) {
  $exe, $rest = $py.Split(' ')
  & $exe @rest -m venv $venv
}
& $vpy -c "import sam2, torch, cv2" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Paketler kuruluyor (ilk seferde 5-15 dk)...' -ForegroundColor Cyan
  & $vpy -m pip install --upgrade pip
  $gpu = $false
  try { nvidia-smi -L 2>$null | Out-Null; $gpu = ($LASTEXITCODE -eq 0) } catch {}
  if ($gpu) {
    Write-Host 'NVIDIA ekran karti bulundu: CUDA surumu PyTorch kuruluyor.' -ForegroundColor Green
    & $vpy -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
  } else {
    Write-Host 'NVIDIA ekran karti yok: islemci (CPU) surumu kuruluyor.'
    & $vpy -m pip install torch torchvision
  }
  $env:SAM2_BUILD_CUDA = '0'
  & $vpy -m pip install --no-build-isolation "sam2==1.1.0" opencv-python-headless pillow numpy
  & $vpy -c "import sam2, torch, cv2" 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host 'Kurulum basarisiz; yukaridaki hatayi Claude a iletin.' -ForegroundColor Red; exit 1 }
}
$env:PYTHONIOENCODING = 'utf-8'
& $vpy -u lapa_sam.py @args
"""

PAKET_BAT = '@echo off\r\nchcp 65001 >nul\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0calistir.ps1" %*\r\necho.\r\npause\r\n'


def write_paket(cid, case, frames):
    """Masaüstünde çalıştırmak için taşınabilir zip: kareler + istemler + lapa_sam.py + başlatıcı."""
    dst = ROOT / "paket" / f"{cid}_sam_paketi.zip"
    dst.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        for f in frames:
            z.write(f, f"kareler/{f.name}")
        z.writestr("istemler.json", json.dumps(sam_spec(cid, case), ensure_ascii=False, indent=1))
        z.write(Path(lapa_sam.__file__), "lapa_sam.py")
        z.writestr("calistir.ps1", PAKET_PS1.replace("\n", "\r\n"))
        z.writestr("CALISTIR.bat", PAKET_BAT)
        # Not Defteri için BOM'lu UTF-8 ve CRLF
        z.writestr("BENIOKU.txt", ("\ufeff" + PAKET_BENIOKU.format(cid=cid, kaynak=case["source"]["text"])).replace("\n", "\r\n").encode("utf-8"))
    print(f"Paket: {dst} ({dst.stat().st_size // 1048576} MB, {len(frames)} kare)")


def write_card(cid, case, frame, masks, obj_ids, n_structs):
    """Ana sayfa kartı: kapak görüntüsü (katmanlı kare) ve docs/data/lapa_cases.json kaydı."""
    colors = [STRUCTS[case["objects"][o]][3] for o in obj_ids]
    lapa_sam.overlay(frame, masks, colors, alpha=100).save(ROOT / "docs" / "img" / f"{cid}.jpg", quality=82)

    path = ROOT / "docs" / "data" / "lapa_cases.json"
    items = [c for c in json.loads(path.read_text(encoding="utf-8")) if c["id"] != cid]
    card = {"id": cid, "title": case["title"], "eyebrow": case["eyebrow"], "text": case["text"],
            "img": f"img/{cid}.jpg", "page": "lapav.html", "dur": int(case["dur"]), "n": n_structs, "status": "ready"}
    first_planned = next((i for i, c in enumerate(items) if c.get("status") == "planned"), len(items))
    items.insert(first_planned, card)
    path.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", default="lapav01")
    ap.add_argument("--skip-sam", action="store_true", help="önbellekteki maskeleri kullan")
    ap.add_argument("--masks", type=Path, help="başka bilgisayarda üretilmiş masks.npz'yi içeri al")
    ap.add_argument("--paket", action="store_true", help="masaüstünde çalıştırmak için zip üret")
    ap.add_argument("--no-card", action="store_true", help="ana sayfa kartını (lapa_cases.json, img/) yazma")
    args = ap.parse_args()
    case = CASES[args.case]
    out = ROOT / "docs" / "data" / args.case
    raw = (ROOT / case["src"]).parent
    out.mkdir(parents=True, exist_ok=True)
    frames = sorted((raw / "frames").glob("*.jpg"))
    if not frames or not (out / "video.mp4").exists():
        frames = make_clip(case, out, raw)

    if args.paket:
        write_paket(args.case, case, frames)
        return
    if args.masks:
        z = np.load(args.masks)
        if z["masks"].shape[0] != len(frames):
            raise SystemExit(f"masks.npz {z['masks'].shape[0]} kare, klip {len(frames)} kare: uyuşmuyor")
        if "info" in z:
            print("Dış maskeler:", z["info"])
        shutil.copy(args.masks, raw / "masks.npz")
    if args.skip_sam or args.masks:
        z = np.load(raw / "masks.npz")
        masks, obj_ids = z["masks"], z["obj_ids"].tolist()
    else:
        print(f"{len(frames)} kare; SAM 2 başlıyor", flush=True)
        masks, obj_ids = lapa_sam.run(frames, sam_spec(args.case, case), cache=SAM_CACHE, work=raw, **SAM_LOCAL)
        np.savez_compressed(raw / "masks.npz", masks=masks, obj_ids=np.array(obj_ids))

    keys = list(dict.fromkeys(case["objects"].values()))
    sid = {k: i + 1 for i, k in enumerate(keys)}
    structures = []
    for k in keys:
        tr, en, la, color, group, ct = STRUCTS[k]
        structures.append({"id": sid[k], "key": k, "name": tr, "en": en, "la": la, "color": color,
                           "group": group, "ct": ct, "note": NOTES[k]})
    frames_out = []
    for i in range(len(frames)):
        polys = {}
        for k, oid in enumerate(obj_ids):
            s = sid[case["objects"][oid]]
            polys.setdefault(s, []).extend(lapa_sam.polygons(masks[i, k]))
        frames_out.append([[s, p] for s, p in polys.items() if p])
    h, w = masks.shape[2:]
    data = {
        "id": args.case, "title": case["title"], "eyebrow": case["eyebrow"],
        "video": "video.mp4", "poster": "poster.jpg", "w": int(w), "h": int(h),
        "fps": 25 / STEP, "dur": case["dur"], "structures": structures, "frames": frames_out,
        "source": case["source"],
        "note": "Maskeler SAM 2 ile yarı otomatik üretildi ve uzman tarafından henüz gözden geçirilmedi.",
    }
    (out / "video.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = len(frames)
    lapa_sam.contact_sheet(frames, masks, [STRUCTS[case["objects"][o]][3] for o in obj_ids],
                           ROOT / ".claude" / "tmp_frames" / f"{args.case}_check.jpg", 25 / STEP)
    if not args.no_card:
        write_card(args.case, case, frames[case["cover"]], masks[case["cover"]], obj_ids, len(structures))
    cover = [len(p) for p in frames_out]
    print(f"video.json {(out / 'video.json').stat().st_size // 1024} KB, video.mp4 "
          f"{(out / 'video.mp4').stat().st_size // 1024} KB; boş kare {cover.count(0)}/{n}")


if __name__ == "__main__":
    main()
