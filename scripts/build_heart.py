"""BodyParts3D (CC BY 4.0, DBCLS) kalp parçalarından docs/data/heart/heart.glb ve heart.json üretir.

Girdi: data/raw/bodyparts3d/isa_BP3D_4.0_obj_99.zip, isa_element_parts.txt (scripts/fetch_bodyparts3d*.py).
Koordinat: BP3D (x = hastanın solu, y = arka, z = yukarı, mm) → sahne ((x-cx)/S, (z-cz)/S, -(y-cy)/S).
İletim sistemi BP3D'de yok; oda boşluklarının geometrisinden (septum ortası, apeks) türetilir.
"""
import json
import os
import struct
import zipfile

import numpy as np

ZIP = 'data/raw/bodyparts3d/isa_BP3D_4.0_obj_99.zip'
LISTE = 'data/raw/bodyparts3d/isa_element_parts.txt'
CIKTI = 'docs/data/heart'
C = np.array([20.0, -125.0, 1235.0])
S = 40.0

z = zipfile.ZipFile(ZIP)


def obj(fj):
    v, f = [], []
    for l in z.read(f'isa_BP3D_4.0_obj_99/{fj}.obj').decode().splitlines():
        if l.startswith('v '):
            v.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('f '):
            f.append([int(t.split('/')[0]) - 1 for t in l.split()[1:4]])
    return np.array(v), np.array(f, dtype=np.int64)


def birlestir(fjler, zmin=None):
    V, F, o = [], [], 0
    for fj in fjler:
        v, f = obj(fj)
        V.append(v); F.append(f + o); o += len(v)
    V, F = np.vstack(V), np.vstack(F)
    if zmin is not None:
        F = F[(V[F][:, :, 2] > zmin).all(1)]
    kul = np.unique(F)
    yeni = -np.ones(len(V), dtype=np.int64)
    yeni[kul] = np.arange(len(kul))
    return V[kul], yeni[F]


def sahne(p):
    p = np.asarray(p, dtype=float)
    d = (p - C) / S
    return np.stack([d[..., 0], d[..., 2], -d[..., 1]], -1)


def kavram_fj(*desenler):
    sonuc = []
    for l in open(LISTE, encoding='utf-8').read().splitlines()[1:]:
        c, n, f = l.split('\t')
        if any(d(n) for d in desenler) and f not in sonuc:
            sonuc.append(f)
    return sonuc


# --- Parça grupları -----------------------------------------------------------
koroner_ven = ['FJ2655', 'FJ2656', 'FJ2724', 'FJ2731', 'FJ2725', 'FJ2730']
koroner_arter = [f for f in kavram_fj(lambda n: 'coronary' in n or 'interventricular' in n) if 2600 <= int(f[2:]) <= 2760 and f not in koroner_ven]
GRUP = {
    'vent': (['FJ2428'], None),
    'ra': (['FJ2439'], None),
    'la': (['FJ2438'], None),
    'lvc': (['FJ2422'], None),
    'rvc': (['FJ2423'], None),
    'aorta': (['FJ3413', 'FJ3411', 'FJ3427'], 1160),
    'pulm': (['FJ2966', 'FJ3019', 'FJ2924'], None),
    'pv': (['FJ2925', 'FJ2933', 'FJ3020', 'FJ2944', 'FJ2950', 'FJ2955', 'FJ3040', 'FJ3031'], None),
    'svc': (['FJ3645'], None),
    'ivc': (['FJ3441'], 1130),
    'corA': (koroner_arter, None),
    'corV': (koroner_ven, None),
}
parcalar = {}
for ad, (fjler, zmin) in GRUP.items():
    v, f = birlestir(fjler, zmin)
    parcalar[ad] = (sahne(v).astype(np.float32), f.astype(np.uint32))
    print(ad, len(v), len(f))

# --- İletim sistemi (BP3D mm cinsinden türet, sonra sahneye çevir) ---------------
def ham(ad):
    v, _ = birlestir(GRUP[ad][0])
    return v

lvc, rvc, ra, la, vent = ham('lvc'), ham('rvc'), ham('ra'), ham('la'), ham('vent')
apeks_epi = vent[vent[:, 2].argmin()]
apeks_endo = lvc[lvc[:, 2].argmin()]

# Septum ortası: her z diliminde sol ve sağ boşluk arasındaki en yakın çiftin orta noktası
septum = []
for zz in np.linspace(min(lvc[:, 2].max(), rvc[:, 2].max()) - 8, apeks_endo[2] + 4, 8):
    a = lvc[abs(lvc[:, 2] - zz) < 3]
    b = rvc[abs(rvc[:, 2] - zz) < 3]
    if len(a) == 0 or len(b) == 0:
        continue
    d = np.linalg.norm(a[:, None, :2] - b[None, :, :2], axis=2)
    i, j = np.unravel_index(d.argmin(), d.shape)
    septum.append(((a[i] + b[j]) / 2, a[i], b[j]))
orta = np.array([s[0] for s in septum])
sol_yan = np.array([s[1] for s in septum])
sag_yan = np.array([s[2] for s in septum])
print('septum noktası', len(orta), orta[0].round(0), orta[-1].round(0), 'apeks', apeks_epi.round(0))

H0 = orta[0]
AV = H0 + np.array([-7.0, 9.0, 6.0])
SA = np.array([ra[:, 0].min() + 5, ra[:, 1].mean() + 3, ra[:, 2].max() - 14])
ra_m, la_m = ra.mean(0), la.mean(0)
sol_dal = [H0] + [(o + 0.6 * (l - o)) for o, l in zip(orta[1:4], sol_yan[1:4])]
sag_dal = [H0] + [(o + 0.6 * (r - o)) for o, r in zip(orta[1:], sag_yan[1:])]


def yon_hedef(cav, z0, z1, d):
    """Boşluğun z0..z1 aralığında xy düzleminde d yönüne en uzak köşesi."""
    k = cav[(cav[:, 2] > z0) & (cav[:, 2] < z1)]
    return k[(k[:, :2] @ np.array(d)).argmax()]


zt = apeks_endo[2]
yuk = lvc[:, 2].max() - zt
laf_son = yon_hedef(lvc, zt + 0.3 * yuk, zt + 0.55 * yuk, (1.0, -0.8))   # ön-yan
lpf_son = yon_hedef(lvc, zt + 0.25 * yuk, zt + 0.5 * yuk, (1.0, 0.8))    # arka-yan
laf = [sol_dal[-1], (sol_dal[-1] + laf_son) / 2 + np.array([0, 0, 3]), laf_son]
lpf = [sol_dal[-1], (sol_dal[-1] + lpf_son) / 2 + np.array([0, 0, -3]), lpf_son]
pk1 = [laf_son, (laf_son + apeks_endo) / 2, apeks_endo + np.array([4, 0, 3])]
pk2 = [lpf_son, (lpf_son + apeks_endo) / 2 + np.array([0, 4, 0]), apeks_endo + np.array([4, 2, 3])]
rv_apeks = rvc[rvc[:, 2].argmin()]
rv_hedef = yon_hedef(rvc, rv_apeks[2] + 5, rv_apeks[2] + 40, (-0.2, -1.0))
pk3 = [sag_dal[-1], (sag_dal[-1] + rv_hedef) / 2, rv_hedef]

yollar = [
    {'id': 'sa', 'ad': 'Sinüs düğümü', 'dugum': True, 'r': 0.075, 'n': [SA]},
    {'id': 'inter', 'ad': 'İnternodal yollar', 'r': 0.026, 'n': [SA, ra_m + [-6, -12, 8], ra_m + [10, -8, -4], AV]},
    {'id': 'inter2', 'ad': '', 'r': 0.02, 'n': [SA, ra_m + [-2, 0, 6], ra_m + [12, 3, -6], AV]},
    {'id': 'inter3', 'ad': '', 'r': 0.02, 'n': [SA, ra_m + [-8, 12, 4], ra_m + [8, 12, -8], AV]},
    {'id': 'bach', 'ad': 'Bachmann demeti', 'r': 0.028, 'n': [SA, (SA + la_m) / 2 + [0, -14, 22], la_m + [-6, -16, 20], la_m + [6, -14, 18]]},
    {'id': 'av', 'ad': 'AV düğüm', 'dugum': True, 'r': 0.085, 'n': [AV]},
    {'id': 'his', 'ad': 'His demeti', 'r': 0.033, 'n': [AV, (AV + H0) / 2, H0]},
    {'id': 'sag', 'ad': 'Sağ dal', 'r': 0.028, 'n': sag_dal},
    {'id': 'sol', 'ad': 'Sol dal', 'r': 0.03, 'n': sol_dal},
    {'id': 'laf', 'ad': 'Sol ön fasikül', 'r': 0.024, 'n': laf},
    {'id': 'lpf', 'ad': 'Sol arka fasikül', 'r': 0.024, 'n': lpf},
    {'id': 'pk1', 'ad': 'Purkinje ağı', 'r': 0.013, 'n': pk1},
    {'id': 'pk2', 'ad': '', 'r': 0.013, 'n': pk2},
    {'id': 'pk3', 'ad': '', 'r': 0.013, 'n': pk3},
]
for y in yollar:
    y['n'] = sahne(np.array(y['n'], dtype=float)).round(4).tolist()


def sv(p):
    return sahne(np.asarray(p, dtype=float)).round(4).tolist()


vent_m = vent.mean(0)
etiket = {
    'Sağ atriyum': sv(ra_m + [-26, -14, -4]),
    'Sol atriyum': sv(la_m + [8, 30, 6]),
    'Sağ ventrikül': sv(rvc.mean(0) + [-8, -26, 0]),
    'Sol ventrikül': sv(lvc.mean(0) + [34, 4, 0]),
    'Aort': sv(ham('aorta')[ham('aorta')[:, 2] > 1280].mean(0) + [8, 0, 10]),
    'Pulmoner arter': sv(ham('pulm').mean(0) + [-4, -22, 14]),
    'Üst vena kava': sv(ham('svc').mean(0) + [-14, 0, 4]),
    'Alt vena kava': sv(ham('ivc').mean(0) + [-14, 0, -4]),
    'Sinüs düğümü': sv(SA), 'AV düğüm': sv(AV), 'His demeti': sv((AV + H0) / 2),
    'Sağ dal': sv(sag_dal[2]), 'Sol dal': sv(sol_dal[2]), 'Purkinje ağı': sv(pk1[2]),
    'Bachmann demeti': sv((SA + la_m) / 2 + [0, -14, 22]),
}
meta = {
    'merkez': C.tolist(), 'olcek': S,
    'apeks': sv(apeks_epi), 'septum': sv(orta),
    'sa': sv(SA), 'laGiris': sv(la_m + [6, -14, 18]),
    'yollar': yollar, 'etiket': etiket,
}

# --- GLB yaz --------------------------------------------------------------------
def glb(parcalar):
    govde = bytearray()
    gorunumler, erisimler, mesheler, dugumler = [], [], [], []

    def ekle(veri, hedef):
        while len(govde) % 4:
            govde.append(0)
        gorunumler.append({'buffer': 0, 'byteOffset': len(govde), 'byteLength': len(veri), 'target': hedef})
        govde.extend(veri)
        return len(gorunumler) - 1

    for ad, (v, f) in parcalar.items():
        bv = ekle(v.tobytes(), 34962)
        erisimler.append({'bufferView': bv, 'componentType': 5126, 'count': len(v), 'type': 'VEC3',
                          'min': v.min(0).tolist(), 'max': v.max(0).tolist()})
        ap = len(erisimler) - 1
        if len(v) < 65536:
            idx = f.astype(np.uint16).ravel(); ct = 5123
        else:
            idx = f.astype(np.uint32).ravel(); ct = 5125
        bi = ekle(idx.tobytes(), 34963)
        erisimler.append({'bufferView': bi, 'componentType': ct, 'count': len(idx), 'type': 'SCALAR'})
        mesheler.append({'name': ad, 'primitives': [{'attributes': {'POSITION': ap}, 'indices': len(erisimler) - 1, 'mode': 4}]})
        dugumler.append({'name': ad, 'mesh': len(mesheler) - 1})
    js = {'asset': {'version': '2.0', 'generator': 'scripts/build_heart.py'},
          'scene': 0, 'scenes': [{'nodes': list(range(len(dugumler)))}], 'nodes': dugumler, 'meshes': mesheler,
          'accessors': erisimler, 'bufferViews': gorunumler, 'buffers': [{'byteLength': len(govde)}]}
    j = json.dumps(js, separators=(',', ':')).encode()
    j += b' ' * (-len(j) % 4)
    while len(govde) % 4:
        govde.append(0)
    toplam = 12 + 8 + len(j) + 8 + len(govde)
    return struct.pack('<III', 0x46546C67, 2, toplam) + struct.pack('<II', len(j), 0x4E4F534A) + j + struct.pack('<II', len(govde), 0x004E4942) + bytes(govde)


os.makedirs(CIKTI, exist_ok=True)
veri = glb(parcalar)
open(f'{CIKTI}/heart.glb', 'wb').write(veri)
json.dump(meta, open(f'{CIKTI}/heart.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('heart.glb KB', round(len(veri) / 1024), 'koroner arter parça', len(koroner_arter))
