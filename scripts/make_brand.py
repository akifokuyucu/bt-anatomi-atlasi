"""Marka görselleri: og.png (paylaşım önizlemesi) ve PWA simgeleri (docs/icons/).
Kullanım: .venv/Scripts/python scripts/make_brand.py
"""
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
    # sağda BT kesiti
    ct = Image.open(DOCS / "img" / "s0139.jpg").convert("RGB")
    h = H
    w = int(ct.width * h / ct.height)
    ct = ct.resize((w, h), Image.LANCZOS)
    x0 = W - 640
    crop = ct.crop(((w - 640) // 2, 0, (w - 640) // 2 + 640, h))
    im.paste(crop, (x0, 0))
    # geçiş
    grad = Image.new("L", (240, H))
    gd = ImageDraw.Draw(grad)
    for i in range(240):
        gd.line([(i, 0), (i, H)], fill=int(255 * (1 - i / 240)))
    im.paste(Image.new("RGB", (240, H), BG), (x0, 0), grad)
    # sol: marka
    logo(d, 108, 140, 34)
    d.text((160, 112), "Klinik Atlas", font=font("georgiab.ttf", 40), fill=TEXT)
    d.text((64, 250), "Klinik çalışmanın", font=font("georgiab.ttf", 64), fill=TEXT)
    d.text((64, 326), "yanında, tek sayfada", font=font("georgiab.ttf", 64), fill=TEXT)
    d.rectangle([64, 424, 144, 427], fill=GOLD)
    d.text((64, 452), "Pano  ·  Araçlar  ·  Atlaslar", font=font("arial.ttf", 30), fill=MUTED)
    d.text((64, 540), "BT ve laparoskopi anatomi atlası · eğitim amaçlıdır", font=font("arial.ttf", 22), fill=GOLD2)
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
