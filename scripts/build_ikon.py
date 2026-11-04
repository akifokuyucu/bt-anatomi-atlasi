"""Site simgesi: hilal. Üç çıktı üretir (hepsi aynı geometriden):
  docs/icons/hilal.svg          menüdeki logo (CSS mask; renk .logo degradesinden gelir)
  docs/icons/favicon-64.png, icon-192.png, icon-512.png   koyu yuvarlak kare üzerinde altın hilal
  docs/icons/apple-touch-icon.png, icon-maskable-512.png  tam kapsayan koyu zemin (maske güvenli alan içinde hilal)
Kullanım:  .venv/Scripts/python scripts/build_ikon.py
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "docs" / "icons"
ZEMIN = (8, 9, 12, 255)           # #08090c, sitenin koyu teması
ALTIN_A, ALTIN_B = (246, 210, 122), (201, 138, 30)   # degrade: açık → koyu altın

# Hilal geometrisi, 24 birimlik kutuda: dış daire ve içeriden kesen daire (açıklık sağ üstte)
DIS = (11.0, 12.0, 9.0)           # cx, cy, r
IC = (15.6, 9.4, 7.4)


def hilal_maske(boyut, birim, merkez):
    """Hilalin alfa maskesi (L), 4× büyük çizilip küçültülür."""
    k = 4
    m = Image.new("L", (boyut * k, boyut * k), 0)
    c = Image.new("L", (boyut * k, boyut * k), 0)
    ox, oy = merkez
    def daire(img, cx, cy, r):
        x, y = ox + (cx - DIS[0]) * birim, oy + (cy - DIS[1]) * birim
        d = r * birim
        ImageDraw.Draw(img).ellipse([(x - d) * k, (y - d) * k, (x + d) * k, (y + d) * k], fill=255)
    daire(m, *DIS)
    daire(c, *IC)
    m = ImageChops.subtract(m, c)
    return m.resize((boyut, boyut), Image.LANCZOS)


def altin(boyut):
    g = Image.new("RGB", (boyut, boyut))
    px = g.load()
    for y in range(boyut):
        for x in range(boyut):
            t = (x + y) / (2 * boyut)
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(ALTIN_A, ALTIN_B))
    return g


def simge(boyut, doluluk, yuvarlak):
    """doluluk: hilalin kutuya oranı (dış daire çapı / boyut). yuvarlak: köşe yarıçapı oranı ya da None (tam kapsayan)."""
    k = 4
    zemin = Image.new("RGBA", (boyut, boyut), (0, 0, 0, 0))
    z = Image.new("L", (boyut * k, boyut * k), 0)
    if yuvarlak:
        ImageDraw.Draw(z).rounded_rectangle([0, 0, boyut * k - 1, boyut * k - 1], radius=int(boyut * k * yuvarlak), fill=255)
    else:
        z = Image.new("L", (boyut * k, boyut * k), 255)
    z = z.resize((boyut, boyut), Image.LANCZOS)
    zemin.paste(Image.new("RGBA", (boyut, boyut), ZEMIN), (0, 0), z)
    birim = boyut * doluluk / (2 * DIS[2])
    merkez = (boyut / 2 + birim * 1.0, boyut / 2)         # hilalin görsel ağırlığı sola kayar; daireyi biraz sağa al
    m = hilal_maske(boyut, birim, merkez)
    zemin.paste(altin(boyut), (0, 0), m)
    return zemin


def svg():
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<defs><mask id="k"><rect width="24" height="24" fill="#fff"/><circle cx="{IC[0]}" cy="{IC[1]}" r="{IC[2]}" fill="#000"/></mask></defs>
<circle cx="{DIS[0]}" cy="{DIS[1]}" r="{DIS[2]}" mask="url(#k)" fill="#000"/>
</svg>
"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "hilal.svg").write_text(svg(), encoding="utf-8")
    simge(64, 0.60, 0.22).save(OUT / "favicon-64.png")
    simge(192, 0.58, 0.22).save(OUT / "icon-192.png")
    simge(512, 0.58, 0.22).save(OUT / "icon-512.png")
    simge(180, 0.58, None).convert("RGB").save(OUT / "apple-touch-icon.png")     # iOS köşeleri kendisi yuvarlar
    simge(512, 0.50, None).convert("RGB").save(OUT / "icon-maskable-512.png")    # maske güvenli alan: ortadaki %80
    print("tamam ->", OUT)


if __name__ == "__main__":
    main()
