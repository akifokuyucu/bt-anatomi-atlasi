"""Marka görselleri: og.png (paylaşım önizlemesi) ve PWA simgeleri (docs/icons/).
Kullanım: .venv/Scripts/python scripts/make_brand.py
"""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

DOCS = Path(__file__).resolve().parent.parent / "docs"
BG, PANEL = (8, 9, 12), (15, 18, 23)
GOLD, GOLD2, TEXT, MUTED = (232, 187, 90), (246, 220, 155), (236, 238, 243), (154, 162, 176)
FONTS = Path("C:/Windows/Fonts")


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def logo(draw, cx, cy, r, color=GOLD):
    """◐: dış halka ve sağ yarısı dolu daire."""
    w = max(2, r // 9)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=w)
    draw.pieslice([cx - r + w * 2, cy - r + w * 2, cx + r - w * 2, cy + r - w * 2], -90, 90, fill=color)


def icon(size, maskable=False):
    s = size * 4  # kenar yumuşatma için büyük çiz
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BG)
        r = int(s * 0.27)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
        r = int(s * 0.32)
    logo(d, s // 2, s // 2, r)
    return im.resize((size, size), Image.LANCZOS)


def og():
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # sağda: ana sayfadaki gibi nabız halkası (yarım ton noktalar) ve ortada gerçek BT kesiti
    cx, cy, halka_r, kesit_r = 925, 315, 235, 168
    ss = 2  # kenar yumuşatma için 2 kat çiz
    ov = Image.new("RGBA", (W * ss, H * ss), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    rnd = random.Random(7)  # her çalıştırmada aynı görsel
    adim = 20
    for gy in range(0, H + adim, adim):
        for gx in range(W // 2, W + adim, adim):
            d_ = math.hypot(gx - cx, gy - cy)
            halka = math.exp(-(((d_ - halka_r) / 46) ** 2))
            gurultu = rnd.random()
            r = halka * (3.0 + 4.6 * gurultu) + (1.4 if gurultu > 0.82 and d_ > kesit_r + 20 else 0)
            if r < 0.9 or d_ < kesit_r + 8:
                continue
            a = int(255 * min(1.0, 0.35 + 0.65 * halka))
            od.ellipse([(gx - r) * ss, (gy - r) * ss, (gx + r) * ss, (gy + r) * ss], fill=GOLD + (a,))
    ov = ov.resize((W, H), Image.LANCZOS)
    im.paste(ov, (0, 0), ov)
    ct = Image.open(DOCS / "img" / "s0372.jpg").convert("RGB")
    k = kesit_r * 2
    ct = ct.resize((k, int(ct.height * k / ct.width)), Image.LANCZOS)
    ct = ct.crop((0, (ct.height - k) // 2, k, (ct.height - k) // 2 + k)) if ct.height >= k else ct.resize((k, k), Image.LANCZOS)
    mask = Image.new("L", (k * 4, k * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, k * 4 - 1, k * 4 - 1], fill=255)
    mask = mask.resize((k, k), Image.LANCZOS)
    im.paste(ct, (cx - kesit_r, cy - kesit_r), mask)
    d.ellipse([cx - kesit_r - 3, cy - kesit_r - 3, cx + kesit_r + 3, cy + kesit_r + 3], outline=GOLD, width=3)
    # sol: marka ve başlık
    logo(d, 108, 120, 30)
    d.text((156, 94), "Klinik Atlas", font=font("georgiab.ttf", 38), fill=TEXT)
    for i, satir in enumerate(["Görüntü, fizyoloji ve", "günlük klinik işler", "tek yerde"]):
        d.text((64, 200 + i * 74), satir, font=font("georgiab.ttf", 56), fill=TEXT)
    d.rectangle([64, 438, 144, 441], fill=GOLD)
    d.text((64, 462), "Atlaslar  ·  Simülasyon  ·  Araçlar", font=font("arial.ttf", 30), fill=MUTED)
    d.text((64, 552), "Anatomi atlasları ve simülasyonlar · eğitim amaçlıdır", font=font("arial.ttf", 22), fill=GOLD2)
    im.save(DOCS / "og.png", optimize=True)


if __name__ == "__main__":
    (DOCS / "icons").mkdir(exist_ok=True)
    icon(192).save(DOCS / "icons" / "icon-192.png")
    icon(512).save(DOCS / "icons" / "icon-512.png")
    icon(512, maskable=True).save(DOCS / "icons" / "icon-maskable-512.png")
    icon(180, maskable=True).save(DOCS / "icons" / "apple-touch-icon.png")
    icon(64).save(DOCS / "icons" / "favicon-64.png")
    og()
    print("tamam")
