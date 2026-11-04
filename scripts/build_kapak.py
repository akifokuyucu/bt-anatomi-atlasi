"""Atlas kartlarının kapak görselleri → docs/img/kapak/

Hazır vakalar: gerçek BT kesiti / video karesi + organ konturları (kapak_gercek.py), JPG.
Hazırlanıyor olan vakalar (veri yok): aynı renk dilinde vektör (SVG) çizim, bu dosyada.
Kullanım:  .venv/Scripts/python scripts/build_kapak.py
Kartlara eşleme: docs/vaka-kart.js içindeki KAPAK tablosu (vaka kimliği → dosya).
"""
import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "img" / "kapak"
W, H = 640, 480


# --- Yardımcılar ---------------------------------------------------------------------------
def yol(pts, kapali=True, t=0.5):
    """Noktalardan Catmull-Rom benzeri düzgün (kübik Bézier) yol."""
    n = len(pts)
    if n < 3:
        return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    def p(i):
        return pts[i % n] if kapali else pts[max(0, min(n - 1, i))]
    d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    seg = n if kapali else n - 1
    for i in range(seg):
        p0, p1, p2, p3 = p(i - 1), p(i), p(i + 1), p(i + 2)
        c1 = (p1[0] + (p2[0] - p0[0]) * t / 3 * 2 / 2 * 1.0, p1[1] + (p2[1] - p0[1]) * t / 3 * 2 / 2 * 1.0)
        c2 = (p2[0] - (p3[0] - p1[0]) * t / 3 * 2 / 2 * 1.0, p2[1] - (p3[1] - p1[1]) * t / 3 * 2 / 2 * 1.0)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + (" Z" if kapali else "")


def blob(pts, fill, op=1.0, stroke=None, sw=1.5, sop=0.6, extra=""):
    s = f' stroke="{stroke}" stroke-width="{sw}" stroke-opacity="{sop}"' if stroke else ""
    return f'<path d="{yol(pts)}" fill="{fill}" fill-opacity="{op}"{s} {extra}/>'


def yansit(pts):
    return [(W - x, y) for x, y in pts]


def kucult(pts, k, c):
    return [(c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k) for x, y in pts]


def elips_pts(cx, cy, rx, ry, n=28, kare=0.9):
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        out.append((cx + rx * math.copysign(abs(c) ** kare, c), cy + ry * math.copysign(abs(s) ** kare, s)))
    return out


def cember(cx, cy, r, fill, op=1.0, stroke=None, sw=1.5, sop=0.6):
    s = f' stroke="{stroke}" stroke-width="{sw}" stroke-opacity="{sop}"' if stroke else ""
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" fill-opacity="{op}"{s}/>'


def zemin(vurgu, ek=""):
    """Koyu zemin, hafif ışık ve nokta ızgarası."""
    return f"""<defs>
<radialGradient id="zm" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#1a2233"/><stop offset="1" stop-color="#070a10"/></radialGradient>
<radialGradient id="isik" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="{vurgu}" stop-opacity=".16"/><stop offset="1" stop-color="{vurgu}" stop-opacity="0"/></radialGradient>
<pattern id="nk" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#fff" fill-opacity=".05"/></pattern>
<filter id="parla" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
{ek}</defs>
<rect width="{W}" height="{H}" fill="url(#zm)"/><rect width="{W}" height="{H}" fill="url(#nk)"/>
<ellipse cx="320" cy="240" rx="300" ry="230" fill="url(#isik)"/>"""


def svg(govde):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-hidden="true">{govde}</svg>\n'


# --- Aksiyel gövde -------------------------------------------------------------------------
YESIL, KIRMIZI, KEHRIBAR = "#4cbb6c", "#e5575f", "#e8a05a"
KEMIK = "#ece6d6"


def govde_cizgisi(cx=320, cy=245, rx=262, ry=190):
    dis = elips_pts(cx, cy, rx, ry)
    ic = kucult(dis, 0.93, (cx, cy))
    kas = kucult(dis, 0.84, (cx, cy))
    return (blob(dis, "#ffffff", .035, "#cfd6e4", 2, .4) + blob(ic, "none", 1, "#cfd6e4", 1.2, .18)
            + blob(kas, "none", 1, "#cfd6e4", 1, .10))


def omur(cx, cy, r=32, kanal=True):
    s = cember(cx, cy, r, KEMIK, .92) + cember(cx, cy, r * .68, "#c9c0a6", .85)
    if kanal:
        s += cember(cx, cy + r + 16, 14, "#131a26", 1, KEMIK, 5, .9)
        s += f'<path d="M{cx},{cy + r + 30} L{cx},{cy + r + 58}" stroke="{KEMIK}" stroke-width="12" stroke-linecap="round" opacity=".9"/>'
        s += f'<path d="M{cx - r * .8},{cy + r * .5} L{cx - r - 38},{cy + r + 12} M{cx + r * .8},{cy + r * .5} L{cx + r + 38},{cy + r + 12}" stroke="{KEMIK}" stroke-width="10" stroke-linecap="round" opacity=".85"/>'
    return s


def abdomen(ileus=False):
    g = govde_cizgisi()
    g += omur(320, 340 if not ileus else 352, 32 if not ileus else 26)
    # arka kaslar
    g += blob([(222, 392), (255, 372), (290, 390), (285, 425), (245, 430), (218, 418)], "#c47a70", .35)
    g += blob(yansit([(222, 392), (255, 372), (290, 390), (285, 425), (245, 430), (218, 418)]), "#c47a70", .35)
    if ileus:
        return g
    karaciger = [(100, 225), (125, 175), (185, 150), (255, 150), (305, 168), (318, 205), (296, 248), (250, 285), (190, 300), (135, 282), (105, 255)]
    g += blob(karaciger, "#e9966a", .88, "#ffd2b0", 1.5, .45)
    g += blob(kucult(karaciger, .55, (210, 225)), "#ffb98a", .25)
    mide = [(345, 160), (395, 150), (455, 165), (482, 200), (470, 247), (430, 267), (385, 252), (360, 215)]
    g += blob(mide, "#b184c9", .85, "#e1c8f2", 1.5, .45) + blob(kucult(mide, .55, (420, 208)), "#6a4a85", .55)
    g += blob([(507, 205), (528, 235), (524, 288), (498, 312), (488, 280), (492, 238)], "#8b7be0", .9, "#cfc6ff", 1.2, .4)
    g += blob([(300, 252), (345, 239), (395, 246), (432, 263), (426, 276), (385, 268), (345, 264), (305, 270)], "#e3c25a", .9)
    bobrek = [(230, 302), (252, 288), (279, 298), (283, 326), (262, 344), (237, 335)]
    g += blob(bobrek, "#e07a8a", .92, "#ffc1ca", 1.3, .5) + blob(yansit(bobrek), "#e07a8a", .92, "#ffc1ca", 1.3, .5)
    g += cember(331, 281, 13, "#6aa0f0", .95, "#bcd6ff", 1.2, .6)
    g += f'<ellipse cx="298" cy="287" rx="16" ry="11" fill="#5a86d6" fill-opacity=".92" stroke="#bcd6ff" stroke-opacity=".5"/>'
    # kolon halkaları
    g += cember(148, 335, 24, "#d9b67a", .25, "#d9b67a", 5, .75) + cember(494, 343, 24, "#d9b67a", .25, "#d9b67a", 5, .75)
    g += cember(318, 392, 0, "none")
    return g


def toraks():
    g = govde_cizgisi()
    # kaburga kesitleri
    dis = elips_pts(320, 245, 262, 190)
    g += f'<path d="{yol(kucult(dis, .935, (320, 245)))}" fill="none" stroke="{KEMIK}" stroke-width="7" stroke-opacity=".55" stroke-dasharray="22 34" stroke-linecap="round"/>'
    g += f'<rect x="292" y="68" width="56" height="15" rx="7" fill="{KEMIK}" fill-opacity=".9"/>'
    akciger = [(95, 220), (108, 152), (165, 115), (236, 124), (274, 182), (282, 272), (262, 352), (202, 382), (136, 362), (104, 302)]
    for a in (akciger, yansit(akciger)):
        g += blob(a, "#3b6a75", .92, "#8fc6d0", 1.5, .5)
        g += blob(kucult(a, .8, (a[0][0] * .5 + a[4][0] * .5, 255)), "#1f3c45", .85)
    kalp = [(284, 218), (330, 192), (392, 207), (427, 252), (417, 307), (371, 337), (320, 322), (296, 276)]
    g += blob(kalp, "#f2a0ae", .92, "#ffd3da", 1.5, .55)
    g += '<path d="M330,200 C345,240 352,280 360,325 M300,270 C340,262 385,262 424,268" fill="none" stroke="#a04058" stroke-width="2.4" opacity=".5"/>'
    g += cember(296, 338, 14, "#6aa0f0", .95, "#bcd6ff", 1.2, .6)
    g += omur(320, 376, 30)
    return g


def damar_dali(x0, y0, yon, uz, sagda):
    """Akciğer içinde dallanan damar (basit özyinelemeli)."""
    s = ""
    def dal(x, y, a, l, w, d):
        nonlocal s
        if d == 0 or l < 12:
            return
        x2, y2 = x + l * math.cos(a), y + l * math.sin(a)
        s += f'<path d="M{x:.1f},{y:.1f} L{x2:.1f},{y2:.1f}" stroke="#6aa0f0" stroke-width="{w:.1f}" stroke-linecap="round" opacity=".9"/>'
        dal(x2, y2, a - .5, l * .72, w * .7, d - 1)
        dal(x2, y2, a + .45, l * .7, w * .7, d - 1)
    dal(x0, y0, yon, uz, 9, 4)
    return s


def pe():
    g = toraks()
    g += damar_dali(290, 230, math.radians(200), 70, False)
    g += damar_dali(350, 230, math.radians(-20), 70, True)
    # tromb: dolum defekti
    g += f'<ellipse cx="236" cy="206" rx="22" ry="9" transform="rotate(-24 236 206)" fill="{KIRMIZI}" fill-opacity=".9" filter="url(#parla)"/>'
    g += f'<ellipse cx="236" cy="206" rx="20" ry="7" transform="rotate(-24 236 206)" fill="#ff6a73"/>'
    g += f'<ellipse cx="418" cy="196" rx="16" ry="6" transform="rotate(14 418 196)" fill="#ff6a73"/>'
    return g


def beyin(pa=False):
    g = blob(elips_pts(320, 240, 190, 222, 36, 1.0), "#ffffff", .03, "#cfd6e4", 1.5, .3)
    g += f'<ellipse cx="320" cy="240" rx="170" ry="204" fill="none" stroke="{KEMIK}" stroke-width="15" stroke-opacity=".9"/>'
    g += '<ellipse cx="320" cy="240" rx="150" ry="186" fill="#7a6b92" fill-opacity=".9"/>'
    # girus çizgileri
    for i in range(14):
        a = 2 * math.pi * i / 14 + .3
        r = 120 + 8 * math.sin(i * 2.1)
        x1, y1 = 320 + r * .62 * math.cos(a), 240 + r * .78 * math.sin(a)
        x2, y2 = 320 + (r + 24) * .62 * math.cos(a + .18), 240 + (r + 24) * .78 * math.sin(a + .18)
        g += f'<path d="M{x1:.1f},{y1:.1f} Q{(x1 + x2) / 2 + 9:.1f},{(y1 + y2) / 2 - 9:.1f} {x2:.1f},{y2:.1f}" stroke="#4b3f60" stroke-width="3" fill="none" opacity=".75" stroke-linecap="round"/>'
    vent = [(302, 205), (268, 184), (244, 208), (262, 262), (302, 252)]
    g += '<path d="M320,58 L320,425" stroke="#241d33" stroke-width="3" opacity=".8"/>'
    if pa:
        g += blob(kucult(vent, .8, (280, 225)), "#5fb5d6", .85)
        g += blob(yansit(vent), "#5fb5d6", .85)
        return g
    g += blob(vent, "#5fb5d6", .9, "#bfe8f5", 1.2, .5) + blob(yansit(vent), "#5fb5d6", .9, "#bfe8f5", 1.2, .5)
    g += '<rect x="316" y="214" width="8" height="36" rx="4" fill="#5fb5d6" fill-opacity=".9"/>'
    return g


def ich():
    g = beyin(pa=True)
    # ödem ve hematom (sol yarım küre, ekranda solda)
    kan = [(214, 196), (246, 176), (282, 190), (290, 228), (262, 258), (222, 250), (206, 224)]
    g += blob(kucult(kan, 1.55, (248, 218)), "#3e3a66", .55)
    g += blob(kan, KIRMIZI, .95, "#ff9aa0", 1.6, .6) + blob(kucult(kan, .6, (248, 218)), "#ff7a82", .8)
    # orta hat kayması
    g += f'<path d="M320,58 C336,150 340,300 320,425" stroke="#f2c14e" stroke-width="3" fill="none" stroke-dasharray="7 6" opacity=".9"/>'
    return g


def ileus_cizim():
    g = abdomen(ileus=True)
    petek = [(104, 152, 176, 62), (300, 142, 180, 62), (92, 236, 204, 62), (330, 226, 190, 62), (150, 318, 170, 62), (330, 314, 168, 62)]
    k = 0
    for x, y, w, h in petek:
        cid = f"p{k}"
        g += f'<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}"/></clipPath>'
        g += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}" fill="#e8d3a6" fill-opacity=".9"/>'
        g += (f'<g clip-path="url(#{cid})"><rect x="{x + 5}" y="{y + 5}" width="{w - 10}" height="{h - 10}" rx="{h / 2 - 5}" fill="#10141b"/>'
              f'<rect x="{x}" y="{y + h * .52}" width="{w}" height="{h}" fill="#a79d83" fill-opacity=".95"/></g>')
        g += f'<path d="M{x + 12},{y + h * .52:.1f} L{x + w - 12},{y + h * .52:.1f}" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="5 5"/>'
        k += 1
    g += f'<circle cx="320" cy="300" r="38" fill="none" stroke="{KIRMIZI}" stroke-width="3" stroke-dasharray="6 6" opacity=".9"/>'
    return g


def kapak_bt(ad, vurgu, icerik):
    return svg(zemin(vurgu) + icerik)


# --- Laparoskopi ---------------------------------------------------------------------------
def lapa_cerceve(govde, ek_defs=""):
    """Kamera görüş dairesi: koyu çerçeve, doku zemini, kenar karartması."""
    return svg(f"""<defs>
<radialGradient id="doku" cx="50%" cy="45%" r="62%"><stop offset="0" stop-color="#d98a7c"/><stop offset=".65" stop-color="#a85a55"/><stop offset="1" stop-color="#5a2828"/></radialGradient>
<radialGradient id="vin" cx="50%" cy="50%" r="50%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".78"/></radialGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eef5"/><stop offset=".5" stop-color="#9aa4b3"/><stop offset="1" stop-color="#5d6674"/></linearGradient>
<linearGradient id="yesilk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd18a"/><stop offset="1" stop-color="#3f7f4e"/></linearGradient>
<clipPath id="goruntu"><circle cx="320" cy="240" r="226"/></clipPath>
<filter id="yumusak" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
{ek_defs}</defs>
<rect width="{W}" height="{H}" fill="#050608"/>
<g clip-path="url(#goruntu)"><rect width="{W}" height="{H}" fill="url(#doku)"/>{govde}<rect width="{W}" height="{H}" fill="url(#vin)"/></g>
<circle cx="320" cy="240" r="226" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>""")


def alet(x1, y1, x2, y2, acik=True):
    """Tutucu: gövde (x1,y1)→(x2,y2) ve uçta iki çene."""
    a = math.atan2(y2 - y1, x2 - x1)
    d = math.degrees(a)
    c = ""
    c += f'<path d="M{x1},{y1} L{x2},{y2}" stroke="#2a2f38" stroke-width="30" stroke-linecap="round"/>'
    c += f'<path d="M{x1},{y1} L{x2},{y2}" stroke="url(#metal)" stroke-width="24" stroke-linecap="round"/>'
    sp = 16 if acik else 4
    for s in (-1, 1):
        c += (f'<g transform="translate({x2},{y2}) rotate({d + s * sp})"><path d="M0,{-6 * s} L52,{-2 * s} L58,0 L52,{2 * s} L0,{6 * s} Z" '
              f'fill="url(#metal)" stroke="#39414e" stroke-width="1.5"/></g>')
    return c


def safra_torsiyonu():
    g = blob([(-20, -10), (330, -10), (360, 70), (300, 150), (210, 190), (110, 170), (30, 120), (-20, 130)], "#7b3f35", 1, "#c98f7f", 2, .5)
    g += blob([(60, 60), (240, 40), (290, 100), (180, 150), (70, 120)], "#9a5646", .55)
    # sarı yağ lobülleri
    for x, y, r in [(470, 120, 34), (520, 170, 26), (430, 60, 24), (560, 90, 22)]:
        g += cember(x, y, r, "#e8cd7a", .85, "#fff3b8", 1.2, .5)
    # safra kesesi: iskemik, koyu mor-siyah
    kese = [(320, 215), (372, 245), (394, 318), (372, 398), (318, 428), (268, 396), (252, 318), (276, 246)]
    g += blob(kese, "#3a1c3a", 1, "#8a4a7d", 3, .8)
    g += blob(kucult(kese, .72, (320, 322)), "#5e2c55", .7)
    g += '<path d="M300,262 C288,300 292,350 312,392" stroke="#fff" stroke-opacity=".35" stroke-width="7" fill="none" stroke-linecap="round" filter="url(#yumusak)"/>'
    # boyun ve burulma
    g += '<path d="M320,215 C312,190 330,168 318,140" stroke="#7a4766" stroke-width="30" fill="none" stroke-linecap="round"/>'
    for i in range(4):
        y = 205 - i * 16
        g += f'<path d="M296,{y} Q320,{y - 14} 344,{y - 6}" stroke="#c8a2b8" stroke-width="3" fill="none" opacity=".75"/>'
    g += alet(600, 470, 392, 330, True)
    return g


def pelvis():
    g = blob([(-20, 330), (140, 270), (320, 300), (500, 262), (660, 330), (660, 500), (-20, 500)], "#c9776b", 1, "#f0b5a8", 2, .35)
    g += blob([(150, -10), (330, 20), (490, -10), (500, 70), (330, 130), (160, 70)], "#d7a59a", .9, "#ffdcd2", 2, .35)  # mesane kubbesi
    # üreter
    g += '<path d="M120,120 C220,170 300,210 470,250" stroke="#caa95c" stroke-width="24" fill="none" stroke-linecap="round"/>'
    g += '<path d="M120,120 C220,170 300,210 470,250" stroke="#f3e3a0" stroke-width="16" fill="none" stroke-linecap="round"/>'
    g += '<path d="M150,114 C240,160 310,196 450,232" stroke="#fffbe0" stroke-opacity=".7" stroke-width="4" fill="none" stroke-linecap="round"/>'
    # seminal veziküller
    for sol in (True, False):
        pts = [(250, 330), (290, 300), (330, 320), (320, 380), (280, 400), (244, 372)]
        pts = pts if sol else yansit(pts)
        g += blob(pts, "#f2d9c4", .95, "#fff0e2", 1.4, .5)
    # damarlar
    g += '<path d="M60,300 C150,250 260,290 340,260 M600,320 C500,280 420,310 360,280" stroke="#9a2a30" stroke-width="3" fill="none" opacity=".8"/>'
    g += alet(40, 470, 190, 300, True) + alet(610, 470, 470, 330, True)
    return g


def kalot():
    g = blob([(-20, -10), (660, -10), (660, 130), (520, 150), (330, 120), (150, 160), (-20, 130)], "#7b3f35", 1, "#c98f7f", 2, .5)
    g += blob([(40, 20), (300, 10), (360, 70), (200, 100), (60, 80)], "#9a5646", .5)
    kese = [(70, 170), (150, 150), (220, 200), (232, 290), (190, 350), (110, 350), (66, 290)]
    g += blob(kese, "url(#yesilk)", .95, "#d4f0c8", 2.5, .6) + blob(kucult(kese, .6, (145, 255)), "#a6dca0", .35)
    # sistik kanal, hepatik kanal, arter
    g += '<path d="M215,300 C260,300 290,290 330,262" stroke="#caa95c" stroke-width="20" fill="none" stroke-linecap="round"/>'
    g += '<path d="M215,300 C260,300 290,290 330,262" stroke="#f3e3a0" stroke-width="12" fill="none" stroke-linecap="round"/>'
    g += '<path d="M330,120 C336,190 336,240 346,330 C350,370 352,400 350,470" stroke="#caa95c" stroke-width="26" fill="none" stroke-linecap="round"/>'
    g += '<path d="M330,120 C336,190 336,240 346,330 C350,370 352,400 350,470" stroke="#f3e3a0" stroke-width="17" fill="none" stroke-linecap="round"/>'
    g += '<path d="M220,330 C270,330 330,320 400,260 C430,235 470,220 520,230" stroke="#b02a30" stroke-width="9" fill="none" stroke-linecap="round"/>'
    g += '<path d="M220,330 C270,330 330,320 400,260 C430,235 470,220 520,230" stroke="#e5575f" stroke-width="5" fill="none" stroke-linecap="round"/>'
    # Calot üçgeni
    g += f'<path d="M222,296 L336,164 L392,262 Z" fill="{KEHRIBAR}" fill-opacity=".14" stroke="{KEHRIBAR}" stroke-width="3" stroke-dasharray="9 7" opacity=".95"/>'
    # kanca
    g += '<path d="M610,470 L470,330" stroke="#2a2f38" stroke-width="26" stroke-linecap="round"/><path d="M610,470 L470,330" stroke="url(#metal)" stroke-width="20" stroke-linecap="round"/>'
    g += '<path d="M470,330 L420,290 L396,302" stroke="url(#metal)" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    return g


def yaz(ad, icerik):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{ad}.svg").write_text(icerik, encoding="utf-8")


def main():
    import kapak_gercek
    kapak_gercek.hepsi()
    yaz("bt-ileus", kapak_bt("ileus", KIRMIZI, ileus_cizim()))
    yaz("bt-ich", kapak_bt("ich", KIRMIZI, ich()))
    yaz("lapa-pelvis", lapa_cerceve(pelvis()))
    yaz("lapa-kalot", lapa_cerceve(kalot()))
    print("tamam ->", OUT)


if __name__ == "__main__":
    main()
