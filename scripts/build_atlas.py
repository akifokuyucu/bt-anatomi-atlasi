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
}
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
                "toraks", "#a8dadc" if parts[-1] == "left" else "#94c9d9")
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


def load_masks(folder):
    """Klasördeki boş olmayan, katalogda tanımlı maskeleri sıralı yükler."""
    structures, masks = [], []
    for f in sorted(folder.glob("*.nii.gz")):
        key = f.name[: -len(".nii.gz")]
        m = np.asarray(nib.as_closest_canonical(nib.load(f)).dataobj) > 0
        if not m.any():
            continue
        info = describe(key)
        if info is None:
            print(f"  atlandı (katalogda yok): {key}")
            continue
        masks.append(m)
        structures.append({"key": key, "tr": info[0], "en": info[1], "system": info[2], "color": info[3]})
    return structures, masks


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
    out_dir.mkdir(parents=True, exist_ok=True)

    ct_img = nib.as_closest_canonical(nib.load(case_dir / "ct.nii.gz"))
    assert nib.aff2axcodes(ct_img.affine) == ("R", "A", "S")
    ct = np.asarray(ct_img.dataobj).astype(np.float32)
    spacing = [float(s) for s in ct_img.header.get_zooms()[:3]]

    structures, masks = load_masks(case_dir / "segmentations")
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
    for name, arr in outputs.items():
        # mtime=0: içerik aynıysa dosya da bayt bayt aynı kalır, git boşuna değişiklik görmez
        with gzip.GzipFile(out_dir / name, "wb", compresslevel=9, mtime=0) as fh:
            fh.write(np.ascontiguousarray(arr.transpose(2, 1, 0)).tobytes())

    atlas = {
        "case": case_dir.name,
        "title": "Abdomen ve pelvis · BT portal venöz faz",
        "dims": [int(d) for d in ct.shape],
        "spacing": spacing,
        "systems": [{"id": i, "name": n, "default": d} for i, n, d in SYSTEMS],
        "structures": structures,
        "anchors": anchors,
        # Katman sistemi açıkken overlay hacmi ana etiketlerin önüne geçer ve "hides" yapıları gizlenir
        "overlay": {"file": "overlay.bin.gz", "system": "kc_segment", "hides": ["liver"]} if overlay is not None else None,
        "source": "TotalSegmentator dataset v2.0.1 (Wasserthal et al., Radiology: AI 2023), CC BY 4.0",
    }
    if overlay is None:
        atlas["systems"] = [s for s in atlas["systems"] if s["id"] != "kc_segment"]
    (out_dir / "atlas.json").write_text(json.dumps(atlas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    verify(out_dir)


def verify(out_dir):
    """Yazılan dosyaları geri okuyup denetler; özeti tek satırda, sorunları ayrı satırlarda basar."""
    atlas = json.loads((out_dir / "atlas.json").read_text(encoding="utf-8"))
    n = int(np.prod(atlas["dims"]))
    structures = atlas["structures"]
    problems, sizes = [], []
    for name, dtype in (("ct.bin.gz", np.int16), ("labels.bin.gz", np.uint8), ("overlay.bin.gz", np.uint8)):
        path = out_dir / name
        if not path.exists():
            if name != "overlay.bin.gz" or atlas["overlay"]:
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
