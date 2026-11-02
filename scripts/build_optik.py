"""BodyParts3D (CC BY 4.0, DBCLS) parçalarından docs/data/optik/optik.glb ve optik.json üretir.

Girdi: data/raw/bodyparts3d/isa_BP3D_4.0_obj_99.zip, isa_element_parts.txt.
Koordinat: BP3D (x = hastanın solu, y = arka, z = yukarı, mm) → sahne ((x-cx)/S, (z-cz)/S, -(y-cy)/S).
Optik radyasyon ve V1 bu veri setinde ayrı parça değildir; gorme-model.js bunları literatür haritasına göre türetir.
"""
import json
import os
import struct
import zipfile

import numpy as np

ZIP = 'data/raw/bodyparts3d/isa_BP3D_4.0_obj_99.zip'
LISTE = 'data/raw/bodyparts3d/isa_element_parts.txt'
CIKTI = 'docs/data/optik'
C = np.array([0.0, -80.0, 1545.0])
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


def birlestir(fjler, isaret=0):
    V, F, o = [], [], 0
    for fj in fjler:
        v, f = obj(fj)
        V.append(v); F.append(f + o); o += len(v)
    V, F = np.vstack(V), np.vstack(F)
    if isaret:  # BP3D'de bazı parçalarda karşı tarafa taşan artık üçgenler var
        F = F[(V[F][:, :, 0] * isaret > -2).all(1)]
    kul = np.unique(F)
    yeni = -np.ones(len(V), dtype=np.int64)
    yeni[kul] = np.arange(len(kul))
    return V[kul], yeni[F]


def sahne(p):
    d = (np.asarray(p, dtype=float) - C) / S
    return np.stack([d[..., 0], d[..., 2], -d[..., 1]], -1)


kabuk = {1: [], -1: []}
for l in open(LISTE, encoding='utf-8').read().splitlines()[1:]:
    c, n, f = l.split('\t')
    if n == 'segment of cerebral hemisphere' and f not in kabuk[1] + kabuk[-1]:
        v, _ = obj(f)
        kabuk[1 if v[:, 0].mean() > 0 else -1].append(f)
print('kabuk parça', {k: len(v) for k, v in kabuk.items()})

GRUP = {  # ad: (FJ listesi, taraf)
    'kabuk_sol': (kabuk[1], 0),
    'kabuk_sag': (kabuk[-1], 0),
    'sinir_sol': (['FJ1772'], 1), 'sinir_sag': (['FJ1819'], -1),
    'kiazma': (['FJ1771', 'FJ1818'], 0),
    'traktus_sol': (['FJ1773'], 1), 'traktus_sag': (['FJ1820'], -1),
    'lgn_sol': (['FJ1766'], 1), 'lgn_sag': (['FJ1813'], -1),
    'talamus': (['FJ1782', 'FJ1827'], 0),
    'orta_beyin': (['FJ1770', 'FJ1817'], 0),
    'hipofiz': (['FJ1796'], 0),
    'vitreus_sol': (['FJ1331'], 1), 'vitreus_sag': (['FJ1382'], -1),
    'lens_sol': (['FJ1305'], 1), 'lens_sag': (['FJ1356'], -1),
    'iris_sol': (['FJ1297'], 1), 'iris_sag': (['FJ1348'], -1),
}
ham, parcalar = {}, {}
for ad, (fjler, isaret) in GRUP.items():
    v, f = birlestir(fjler, isaret)
    ham[ad] = v
    parcalar[ad] = (sahne(v).astype(np.float32), f.astype(np.uint32))
    print(ad, len(v), len(f), v.min(0).round(0).tolist(), v.max(0).round(0).tolist())


def merkez_hat(v, y0, y1, n):
    """Parçanın orta hattı: y boyunca dilimlerin ağırlık merkezi (mm)."""
    sinir = np.linspace(y0, y1, n + 1)
    hat = []
    for a, b in zip(sinir[:-1], sinir[1:]):
        k = v[(v[:, 1] >= min(a, b)) & (v[:, 1] <= max(a, b))]
        if len(k):
            hat.append(((k.min(0) + k.max(0)) / 2).round(2).tolist())
    return hat


meta = {'merkez': C.tolist(), 'olcek': S, 'taraf': {}}
for ad, h in (('sol', 1), ('sag', -1)):
    vit = ham[f'vitreus_{ad}']
    gm = (vit.min(0) + vit.max(0)) / 2
    gr = float((vit.max(0) - vit.min(0)).mean() / 2)
    sn, tr, lg = ham[f'sinir_{ad}'], ham[f'traktus_{ad}'], ham[f'lgn_{ad}']
    kb = ham[f'kabuk_{ad}']
    kutup = kb[kb[:, 1].argmax()]
    # V1 için medial yüzey: oksipital bölgede orta hatta en yakın kabuk x'i
    medial = {}
    for yy in (-50, -40, -30, -20, -10, 0):
        k = kb[abs(kb[:, 1] - yy) < 4]
        k = k[(k[:, 2] > 1545) & (k[:, 2] < 1590)]
        if len(k):
            i = abs(k[:, 0]).argmin()
            medial[yy] = k[i].round(1).tolist()
    meta['taraf'][ad] = {
        'goz': gm.round(2).tolist(), 'gozR': round(gr, 2),
        'sinir': merkez_hat(sn, sn[:, 1].min(), sn[:, 1].max(), 8),
        'traktus': merkez_hat(tr, tr[:, 1].min(), tr[:, 1].max(), 7),
        'lgn': ((lg.min(0) + lg.max(0)) / 2).round(2).tolist(),
        'lgnBoy': (lg.max(0) - lg.min(0)).round(2).tolist(),
        'kutup': kutup.round(1).tolist(), 'medial': medial,
    }
kz = ham['kiazma']
meta['kiazma'] = {'merkez': ((kz.min(0) + kz.max(0)) / 2).round(2).tolist(), 'boy': (kz.max(0) - kz.min(0)).round(2).tolist()}
hp = ham['hipofiz']
meta['hipofiz'] = ((hp.min(0) + hp.max(0)) / 2).round(2).tolist()


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
    js = {'asset': {'version': '2.0', 'generator': 'scripts/build_optik.py'},
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
open(f'{CIKTI}/optik.glb', 'wb').write(veri)
json.dump(meta, open(f'{CIKTI}/optik.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('optik.glb KB', round(len(veri) / 1024))
print(json.dumps(meta, ensure_ascii=False))
