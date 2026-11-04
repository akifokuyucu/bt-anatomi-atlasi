"""Gerçek veriden kart kapakları (build_kapak.py çağırır): BT kesiti ya da video karesi + organ konturları → docs/img/kapak/<ad>.jpg

Kapak: gerçek kesit (toraksta akciğer penceresi karıştırılır), ince renkli organ konturu ve hafif dolgu, 4:3, siyah zeminde.
BT: docs/data/<vaka>/ct.bin.gz + labels.bin.gz (+ patolojide lesions.bin.gz);  video: docs/data/lapav01/video.mp4 + video.json (SAM 2 çokgenleri).
"""
import gzip
import json
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage as ndi

KOK = Path(__file__).resolve().parent.parent
OUT = KOK / "docs" / "img" / "kapak"
HEDEF = (960, 720)

# (kapak adı, vaka, kesit seçiminde aranan yapılar, konturlanan yapılar, akciğer penceresi, sabit kesit ya da None)
BT = [
    ("bt-abdomen", "s0139", ["liver", "stomach", "spleen", "pancreas", "kidney_left", "kidney_right", "aorta", "inferior_vena_cava"],
     ["liver", "stomach", "spleen", "pancreas", "kidney_left", "kidney_right", "aorta", "inferior_vena_cava", "gallbladder", "duodenum",
      "adrenal_gland_left", "adrenal_gland_right", "colon", "small_bowel", "portal_vein_and_splenic_vein"], False, 242),
    ("bt-toraks", "s0372", ["heart", "aorta", "lung_lower_lobe_left", "lung_lower_lobe_right", "esophagus"],
     ["heart", "aorta", "esophagus", "lung_upper_lobe_left", "lung_upper_lobe_right", "lung_lower_lobe_left", "lung_lower_lobe_right",
      "lung_middle_lobe_right", "inferior_vena_cava", "pulmonary_vein", "trachea", "sternum"], True, None),
    ("bt-kraniyal", "s0103", ["ventricle", "thalamus", "brainstem"],
     ["ventricle", "thalamus", "caudate_nucleus", "lentiform_nucleus", "insular_cortex"], False, None),
    ("bt-pe", "pe01", ["heart", "lung_upper_lobe_left", "lung_upper_lobe_right"],
     ["lung_upper_lobe_left", "lung_upper_lobe_right", "lung_lower_lobe_left", "lung_lower_lobe_right"], True, None),   # kırmızı yalnız lezyon
]


def yukle(vaka):
    d = KOK / "docs" / "data" / vaka
    meta = json.load(open(d / "atlas.json", encoding="utf-8"))
    nx, ny, nz = meta["dims"]
    ct = np.frombuffer(gzip.open(d / "ct.bin.gz").read(), dtype=np.int16).reshape(nz, ny, nx)
    lb = np.frombuffer(gzip.open(d / "labels.bin.gz").read(), dtype=np.uint8).reshape(nz, ny, nx)
    lez = None
    if "lesions" in meta:
        lez = np.frombuffer(gzip.open(d / meta["lesions"]["file"]).read(), dtype=np.uint8).reshape(nz, ny, nx)
    return meta, ct, lb, lez


def ekran(a):
    """Dizi [y][x] (RAS) → radyolojik ekran: hastanın sağı solda, ön yukarıda."""
    return a[::-1, ::-1].copy()


def govde_maskesi(kesit):
    """Hasta gövdesi: masa ve çevre havası dışarıda kalır (en büyük bağlı bileşen, delikler doldurulur)."""
    m = ndi.binary_opening(kesit > -400, iterations=2)
    lab, n = ndi.label(m)
    if n == 0:
        return m
    boy = ndi.sum(m, lab, range(1, n + 1))
    m = lab == (1 + int(np.argmax(boy)))
    return ndi.binary_fill_holes(ndi.binary_closing(m, iterations=3))


def pencere(kesit, genislik, seviye):
    lo, hi = seviye - genislik / 2, seviye + genislik / 2
    return np.clip((kesit.astype(np.float32) - lo) / (hi - lo), 0, 1)


def kesit_gri(ct_z, win, akciger):
    """Kesiti pencereleyip 4× büyütür; hafif gürültü azaltma ve keskinleştirme. Toraksta akciğer penceresi karıştırılır."""
    genislik, seviye = (float(x) for x in win.split(","))
    k = pencere(ct_z, genislik, seviye)
    if akciger:
        k = np.where(ct_z < -250, 0.12 + 0.55 * pencere(ct_z, 1400, -600), k)
    k = ekran(k * govde_maskesi(ct_z))
    k = cv2.resize(k, (k.shape[1] * 4, k.shape[0] * 4), interpolation=cv2.INTER_CUBIC)
    k8 = np.clip(k * 255, 0, 255).astype(np.uint8)
    k8 = cv2.fastNlMeansDenoising(k8, None, h=5, templateWindowSize=7, searchWindowSize=21)
    return cv2.addWeighted(k8, 1.5, cv2.GaussianBlur(k8, (0, 0), 2.0), -0.5, 0)


def renk_bgr(hexs):
    h = hexs.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (4, 2, 0))


def tuval(img, govde=True, bosluk=0.012):
    """İçeriği 4:3 tuvale sığdır, boşluğu siyah bırak."""
    h, w = img.shape[:2]
    if govde:
        ys, xs = np.where(img.max(axis=2) > 12)
        p = int(max(w, h) * bosluk)
        y0, y1, x0, x1 = max(0, ys.min() - p), min(h, ys.max() + p), max(0, xs.min() - p), min(w, xs.max() + p)
        img = img[y0:y1, x0:x1]
    oran = min(HEDEF[0] / img.shape[1], HEDEF[1] / img.shape[0])
    img = cv2.resize(img, (int(img.shape[1] * oran), int(img.shape[0] * oran)), interpolation=cv2.INTER_LANCZOS4)
    tuv = np.zeros((HEDEF[1], HEDEF[0], 3), np.uint8)
    oy, ox = (HEDEF[1] - img.shape[0]) // 2, (HEDEF[0] - img.shape[1]) // 2
    tuv[oy:oy + img.shape[0], ox:ox + img.shape[1]] = img
    return tuv


def konturla(zemin, maskeler, olcek=4, dolgu=0.22, parilti=0.5):
    """maskeler: [(bool maske (küçük, ekran yönünde), renk BGR, vurgu çarpanı)] → ince renkli kontur + hafif dolgu."""
    cizim = zemin.astype(np.float32)
    glow = np.zeros_like(cizim)
    cizgi = np.zeros(cizim.shape[:2], bool)
    for m, c, kal in maskeler:
        if not m.any():
            continue
        m = cv2.resize(m.astype(np.uint8), (m.shape[1] * olcek, m.shape[0] * olcek), interpolation=cv2.INTER_NEAREST)
        m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3.0) > 0.5   # yumuşak kenar
        c = np.array(c, np.float32)
        a = min(0.6, dolgu * kal)
        cizim[m] = cizim[m] * (1 - a) + c * a
        kenar = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
        kenar = cv2.dilate(kenar, np.ones((3, 3), np.uint8), iterations=2 if kal > 1 else 1) > 0
        glow[kenar] = c
        cizgi |= kenar
    cizim = np.clip(cizim + cv2.GaussianBlur(glow, (0, 0), 6) * parilti, 0, 255)
    cizim[cizgi] = glow[cizgi] * 0.95 + cizim[cizgi] * 0.05
    return cizim.astype(np.uint8)


def kaydet(ad, bgr):
    OUT.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(OUT / f"{ad}.jpg"), bgr, [cv2.IMWRITE_JPEG_QUALITY, 88])


def bt_kapak(ad, vaka, ara, goster, akciger, sabit_z):
    meta, ct, lb, lez = yukle(vaka)
    kimlik = {s["key"]: s["id"] for s in meta["structures"]}
    renkler = {s["id"]: renk_bgr(s["color"]) for s in meta["structures"]}
    if sabit_z is not None:
        z = sabit_z
    elif lez is not None and lez.any():
        z = int(np.argmax((lez > 0).sum(axis=(1, 2))))   # patoloji: lezyonun en geniş kesiti
    else:
        ids = [kimlik[k] for k in ara if k in kimlik]
        skor = [sum(int((lb[k] == i).sum() > 30) for i in ids) * 100000 + sum(int((lb[k] == i).sum()) for i in ids) for k in range(lb.shape[0])]
        z = int(np.argmax(skor))
    zemin = cv2.cvtColor(kesit_gri(ct[z], meta["win"], akciger), cv2.COLOR_GRAY2BGR)
    et = ekran(lb[z])
    maskeler = [(et == kimlik[k], renkler[kimlik[k]], 1.0) for k in goster if k in kimlik]
    if lez is not None:
        maskeler.append((ekran(lez[z]) > 0, (74, 74, 255), 2.2))   # kırmızı lezyon (BGR)
    kaydet(ad, tuval(konturla(zemin, maskeler)))
    print(f"{ad}: {vaka} z={z}")


def video_kapak(ad="lapa-safra-torsiyonu", vaka="lapav01", kare=60):
    d = KOK / "docs" / "data" / vaka
    meta = json.load(open(d / "video.json", encoding="utf-8"))
    cap = cv2.VideoCapture(str(d / "video.mp4"))
    cap.set(cv2.CAP_PROP_POS_MSEC, kare / meta["fps"] * 1000)
    ok, fr = cap.read()
    cap.release()
    if not ok:
        raise SystemExit("video karesi okunamadı")
    h0, w0 = fr.shape[:2]
    fr = cv2.resize(fr, (w0 * 2, h0 * 2), interpolation=cv2.INTER_LANCZOS4)
    fr = cv2.addWeighted(fr, 1.4, cv2.GaussianBlur(fr, (0, 0), 2.0), -0.4, 0)
    renkler = {s["id"]: renk_bgr(s["color"]) for s in meta["structures"]}
    maskeler = []
    for sid, polis in meta["frames"][kare]:
        m = np.zeros((h0, w0), np.uint8)
        for poli in polis:
            cv2.fillPoly(m, [np.array(poli, np.int32).reshape(-1, 2)], 1)
        maskeler.append((m > 0, renkler[sid], 1.0))
    kaydet(ad, tuval(konturla(fr, maskeler, olcek=2, dolgu=0.18), govde=False))
    print(f"{ad}: {vaka} kare={kare}")


def hepsi():
    for args in BT:
        bt_kapak(*args)
    video_kapak()
