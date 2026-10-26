"""Kraniyal vaka (TotalSegmentator s0103) için atlas girdisini hazırlar: data/raw/s0103/seg_atlas/

Kullanım:
    .venv/Scripts/python scripts/prepare_cranial_case.py s0103

Girdiler:
    data/raw/s0103/segmentations/      veri setinin `total` maskeleri (beyin tek parça, kafatası)
    data/segments/s0103/<görev>/       yerelde çalıştırılan TotalSegmentator görevleri:
                                       brain_structures, craniofacial_structures, head_glands_cavities,
                                       headneck_bones_vessels, head_muscles

Üretilen maskeler çakışmaz (küçük yapı büyük yapıdan önce gelir). `brain_structures` lisans gerektirir
(TotalSegmentator ücretsiz akademik lisansı; numara .ml-cache altındaki config.json'da, depoya girmez).
"""

import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage as ndi

TASKS = ["brain_structures", "craniofacial_structures", "head_glands_cavities", "headneck_bones_vessels", "head_muscles"]
# `total` çıktısından alınanlar; kafatası ve beyin burada yeniden üretilir
TOTAL_KEEP = ("vertebrae_C", "spinal_cord", "common_carotid_artery", "thyroid_gland", "trachea", "esophagus")
SKIP = {"head"}  # yumuşak doku zarfı: her şeyin üstünü örter


def load(path):
    img = nib.as_closest_canonical(nib.load(path))
    return np.asarray(img.dataobj) > 0, img


def main(case):
    raw = Path("data/raw") / case
    seg = Path("data/segments") / case
    out = raw / "seg_atlas"
    out.mkdir(exist_ok=True)
    ct_img = nib.as_closest_canonical(nib.load(raw / "ct.nii.gz"))
    ct = np.asarray(ct_img.dataobj).astype(np.float32)
    smooth = ndi.gaussian_filter(ct, 1.0)

    masks = {}
    for f in sorted((raw / "segmentations").glob("*.nii.gz")):
        key = f.name[:-7]
        if key.startswith(TOTAL_KEEP):
            m, _ = load(f)
            if m.any():
                masks[key] = m
    for task in TASKS:
        for f in sorted((seg / task).glob("*.nii.gz")):
            key = f.name[:-7]
            m, _ = load(f)
            if key not in SKIP and m.any():
                masks[key] = m

    # Çakışmayı çöz: küçükten büyüğe boya; küçük yapı büyüğün üstüne yazar
    owner = np.zeros(ct.shape, np.int32)
    keys = sorted(masks, key=lambda k: -int(masks[k].sum()))
    for i, k in enumerate(keys, 1):
        owner[masks[k]] = i
    for old in out.glob("*.nii.gz"):
        old.unlink()
    for i, k in enumerate(keys, 1):
        m = owner == i
        if m.sum() >= 20:  # tek birkaç vokselli kalıntıları at
            nib.save(nib.Nifti1Image(m.astype(np.uint8), ct_img.affine), out / f"{k}.nii.gz")
            print(f"  {k}: {m.sum() * 3.375e-3:.1f} mL")
    print(f"Tamam: {len(keys)} maske -> {out}")


if __name__ == "__main__":
    main(sys.argv[1])
