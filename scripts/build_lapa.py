"""Laparoskopik görüntü atlası üretimi (DSAD multi_organ kareleri → docs/data/<vaka>/).

Girdi: scripts/fetch_dsad.py'nin indirdiği data/raw/dsad/<split>/<ameliyat>_<kare>/
Çıktı:
  f00.webp …        küçültülmüş kare (WebP)
  labels.bin.gz     tüm karelerin maskeleri art arda, uint8 bit maskesi [kare][y][x];
                    yapı i (1'den başlar) → bit (i-1). Maskeler örtüşebildiği için bit kullanılır.
  lapa.json         yapılar, kareler, kaynak bilgisi

Kullanım:
    python scripts/build_lapa.py --case lapa01
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# DSAD anahtarı: (Türkçe, İngilizce, Latince, renk, BT atlasındaki karşılığı)
# Renkler BT atlasının BASE kataloğuyla aynı; karın duvarının BT'de karşılığı yok.
STRUCTS = {
    "abdominal_wall": ("Karın duvarı", "Abdominal wall", "Paries abdominis", "#a3b18a", None),
    "colon": ("Kolon", "Colon", "Colon", "#c9a26b", "colon"),
    "liver": ("Karaciğer", "Liver", "Hepar", "#e07b53", "liver"),
    "pancreas": ("Pankreas", "Pancreas", "Pancreas", "#f2c14e", "pancreas"),
    "small_intestine": ("İnce bağırsak", "Small intestine", "Intestinum tenue", "#8ecae6", "small_bowel"),
    "spleen": ("Dalak", "Spleen", "Splen", "#9b6dd6", "spleen"),
    "stomach": ("Mide", "Stomach", "Gaster", "#e6a0c4", "stomach"),
}

# Laparoskopide tanıma notları.
# TASLAK: bir cerrah veya anatomist gözden geçirmeden yayın "doğrulanmış" sayılmaz.
NOTES = {
    "abdominal_wall": "Laparoskopide tanıma: Parietal periton ile kaplı karın ön duvarının iç yüzü; trokar giriş yerleri ve umbilikal plikalar burada görülür.\n"
                      "Klinik ipucu: Trokar yerleştirirken epigastrik damarlar bu yüzeyin arkasında seyreder.",
    "colon": "Laparoskopide tanıma: Tenia koli, haustralar ve appendices epiploicae ile ince bağırsaktan ayrılır.\n"
             "Klinik ipucu: Rektum cerrahisinde splenik fleksura mobilizasyonu sırasında inen kolon ile mide ve dalak aynı görüntüye girer.",
    "liver": "Laparoskopide tanıma: Kırmızı-kahverengi, düzgün ve parlak yüzeyli, keskin kenarlı organ; falsiform ligaman sağ ve sol lobu ayırır.\n"
             "Klinik ipucu: Sol lob, mideyi ve üst batını görmek için sıklıkla ekartörle kaldırılır.",
    "pancreas": "Laparoskopide tanıma: Sarımsı, lobüle yüzeyli; çoğunlukla midenin arkasında, bursa omentalis açılınca veya transvers mezokolon altından görülür.\n"
                "Klinik ipucu: Splenik fleksura mobilizasyonunda pankreas alt kenarı korunacak yapıdır; çevre yağ dokusuyla karıştırılabilir.",
    "small_intestine": "Laparoskopide tanıma: Pembe, ince duvarlı, hareketli kıvrımlar; tenia ve haustra yoktur, mezenter ile arka karın duvarına bağlıdır.\n"
                       "Klinik ipucu: Pelvik diseksiyonda ince bağırsak kıvrımları baş aşağı pozisyonla üst batına itilir.",
    "spleen": "Laparoskopide tanıma: Sol üst kadranda, diyafragma altında koyu mor-kırmızı organ; çoğunlukla yalnızca alt kutbu görülür.\n"
              "Klinik ipucu: Splenik fleksura mobilizasyonunda dalak kapsülü yırtılarak kanayabilir; splenokolik ligaman dikkatle ayrılır.",
    "stomach": "Laparoskopide tanıma: Açık pembe, kalın duvarlı; büyük kurvatur boyunca gastroepiploik damarlar ve büyük omentum uzanır.\n"
               "Klinik ipucu: Gastrokolik ligaman açılınca bursa omentalise ve pankreasa ulaşılır.",
}

CASES = {
    "lapa01": {
        "title": "Robotik rektum cerrahisi · üst batın görüntüleri",
        "eyebrow": "LAPAROSKOPİ · ROBOTİK",
        "split": "validation",
        "cover": 8,  # ana sayfa kartındaki kare (pankreas dahil 5 yapı)
        "text": "Mide, karaciğer, kolon, pankreas ve ince bağırsak; splenik fleksura mobilizasyonu sırasında üst batın.",
    },
}

# Ana sayfada "Hazırlanıyor" olarak gösterilecek laparoskopi vakaları
PLANNED = [
    {"id": "lapa-pelvis", "title": "Pelvik diseksiyon · üreter ve veziküler bezler", "eyebrow": "PELVİS · ROBOTİK",
     "text": "Total mezorektal eksizyonda korunacak yapılar: üreter, inferior mezenterik arter, veziküler bezler (DSAD)."},
    {"id": "lapa-chole", "title": "Kolesistektomi · Calot üçgeni", "eyebrow": "SAFRA KESESİ",
     "text": "Safra kesesi, sistik kanal, sistik arter ve kritik güvenlik görüntüsü (CVS)."},
]

OUT_W = 960  # görüntü genişliği (yükseklik oranla)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", default="lapa01", choices=list(CASES))
    args = ap.parse_args()
    meta = CASES[args.case]

    src = ROOT / "data" / "raw" / "dsad" / meta["split"]
    out = ROOT / "docs" / "data" / args.case
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("f*.webp"):
        old.unlink()

    keys = list(STRUCTS)
    dirs = sorted(d for d in src.iterdir() if d.is_dir())
    frames, packed = [], []
    for n, d in enumerate(dirs):
        img = Image.open(d / "image.png").convert("RGB")
        w, h = img.size
        size = (OUT_W, round(h * OUT_W / w))
        img.resize(size, Image.LANCZOS).save(out / f"f{n:02d}.webp", quality=82, method=6)

        bits = np.zeros(size[::-1], np.uint8)
        present = []
        for i, k in enumerate(keys):
            m = np.asarray(Image.open(d / f"mask_{k}.png").convert("L").resize(size, Image.NEAREST)) > 127
            if m.mean() > 0.002:  # birkaç piksellik kırıntıyı yok say
                bits |= (m.astype(np.uint8) << i)
                present.append(i + 1)
        packed.append(bits)
        sid, fid = d.name.split("_")
        frames.append({"file": f"f{n:02d}.webp", "surgery": sid, "frame": int(fid), "present": present})

    raw = np.stack(packed).tobytes()
    (out / "labels.bin.gz").write_bytes(gzip.compress(raw, 9, mtime=0))
    v = hashlib.sha1(raw).hexdigest()[:10]

    structures = [
        {"id": i + 1, "key": k, "tr": tr, "en": en, "la": la, "color": c, "ct": ct, "note": NOTES.get(k, "")}
        for i, (k, (tr, en, la, c, ct)) in enumerate(STRUCTS.items())
    ]
    atlas = {
        "v": v,
        "title": meta["title"],
        "eyebrow": meta["eyebrow"],
        "size": [size[0], size[1]],
        "structures": structures,
        "frames": frames,
        "ctCase": "s0139",
        "source": "Dresden Surgical Anatomy Dataset (Carstens ve ark., Sci Data 2023), CC BY 4.0",
        "sourceUrl": "https://doi.org/10.6084/m9.figshare.21702600",
    }
    (out / "lapa.json").write_text(json.dumps(atlas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    write_cover(out / atlas["frames"][meta["cover"]]["file"], packed[meta["cover"]], structures, ROOT / "docs" / "img" / f"{args.case}.jpg")
    write_index(len(frames), len(structures))

    sizes = {p.name: p.stat().st_size for p in out.iterdir()}
    print(f"{args.case}: {len(frames)} kare, {size[0]}×{size[1]}, toplam {sum(sizes.values()) / 1e6:.2f} MB, "
          f"labels {sizes['labels.bin.gz'] / 1e3:.0f} KB, v={v}")
    for f in frames:
        print(" ", f["file"], f["surgery"], f["frame"], [keys[i - 1] for i in f["present"]])


def write_cover(frame_path, bits, structures, dst):
    """Ana sayfa kartı: kare + yarı saydam renkli maskeler + kontur, 640 px JPEG."""
    img = np.asarray(Image.open(frame_path).convert("RGB")).astype(np.float32)
    for s in structures:
        m = (bits >> (s["id"] - 1)) & 1 == 1
        if not m.any():
            continue
        rgb = np.array([int(s["color"][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
        img[m] = img[m] * 0.62 + rgb * 0.38
        inner = m.copy()
        inner[1:, :] &= m[:-1, :]
        inner[:-1, :] &= m[1:, :]
        inner[:, 1:] &= m[:, :-1]
        inner[:, :-1] &= m[:, 1:]
        edge = m & ~inner
        img[edge] = rgb
    out = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    out.resize((640, round(640 * out.height / out.width)), Image.LANCZOS).save(dst, quality=84, optimize=True)


def write_index(n_frames, n_structs):
    """docs/data/lapa_cases.json: ana sayfadaki laparoskopi kartları."""
    items = [{"id": cid, "title": m["title"], "eyebrow": m["eyebrow"], "text": m["text"], "img": f"img/{cid}.jpg",
              "frames": n_frames, "n": n_structs, "status": "ready"} for cid, m in CASES.items()]
    # Video vakaları (build_lapa_video.py) korunur
    path = ROOT / "docs" / "data" / "lapa_cases.json"
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    items += [c for c in old if c.get("page") == "lapav.html"]
    items += [dict(p, status="planned") for p in PLANNED]
    (ROOT / "docs" / "data" / "lapa_cases.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
