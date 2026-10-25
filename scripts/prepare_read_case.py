"""READ PE CT veri setinden (figshare, CC0) bir vakayı atlasa hazırlar.

Adımlar: remotezip ile yalnızca o vakanın DICOM + maske dosyalarını indir, DICOM'u RAS hacme çevir,
1,5 mm izotropik yeniden örnekle, PE maskesini aynı ızgaraya taşı.
Çıktı: data/raw/<out>/ct.nii.gz ve pe_mask.nii.gz (ardından TotalSegmentator ile segmentasyon).

READ maskelerinin yönelimi vaka başına farklıdır; hangi dönüşümün doğru olduğunu görsel doğrula.
02GE için z ekseni ters çevrilir (--flip-z). 01GE'de denenen 16 dönüşümün hiçbiri tutmadı.

Kullanım:
    .venv/Scripts/python scripts/prepare_read_case.py 02GE pe01 --flip-z
"""

import argparse
import json
import urllib.request
from pathlib import Path

import nibabel as nib
import numpy as np
import SimpleITK as sitk
from remotezip import RemoteZip

ARTICLE = "https://api.figshare.com/v2/articles/22345240"  # tek zip, ~5 GB; aralık isteğiyle parça parça çekilir
ROOT = "Files Pixel-level annotated dataset of computed tomography images of acute pulmonary embolism/"


def download(case, raw):
    url = json.load(urllib.request.urlopen(ARTICLE))["files"][0]["download_url"]
    vendor = "GE" if case.endswith("GE") else "TOSHIBA"
    want = (
        f"CT scans (DICOM files)/{vendor} (DICOM files)/{case}/",
        f"Ground truth (pixel level segmentation - NiFTI files)/{vendor} (NiFTI files)/{case}.nii.gz",
    )
    with RemoteZip(url) as z:
        for info in z.infolist():
            if not info.is_dir() and any(info.filename.startswith(ROOT + w) for w in want):
                z.extract(info, raw / "read")
    return raw / "read" / ROOT, vendor


def to_sitk(a, spacing):
    im = sitk.GetImageFromArray(np.ascontiguousarray(a.transpose(2, 1, 0)))
    im.SetSpacing(spacing)
    return im


def resample(im, interp, default):
    size = [int(round(s * p / 1.5)) for s, p in zip(im.GetSize(), im.GetSpacing())]
    r = sitk.ResampleImageFilter()
    r.SetOutputSpacing((1.5, 1.5, 1.5))
    r.SetSize(size)
    r.SetOutputOrigin(im.GetOrigin())
    r.SetInterpolator(interp)
    r.SetDefaultPixelValue(default)
    return r.Execute(im)


def main(case, out, flip_z, raw=Path("data/raw")):
    base, vendor = download(case, raw)
    folder = base / f"CT scans (DICOM files)/{vendor} (DICOM files)/{case}"
    reader = sitk.ImageSeriesReader()
    reader.SetFileNames(sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(folder), sitk.ImageSeriesReader.GetGDCMSeriesIDs(str(folder))[0]))
    img = sitk.DICOMOrient(reader.Execute(), "RAS")
    ct = sitk.GetArrayFromImage(img).transpose(2, 1, 0).astype(np.int16)  # [x, y, z]
    sp = img.GetSpacing()
    mask = nib.as_closest_canonical(nib.load(base / f"Ground truth (pixel level segmentation - NiFTI files)/{vendor} (NiFTI files)/{case}.nii.gz"))
    mk = np.asarray(mask.dataobj) > 0
    if flip_z:
        mk = np.flip(mk, 2)
    assert mk.shape == ct.shape, f"şekil uyumsuz: {mk.shape} != {ct.shape}"

    ct15 = sitk.GetArrayFromImage(resample(to_sitk(ct, sp), sitk.sitkLinear, -1024)).transpose(2, 1, 0).astype(np.int16)
    mk15 = sitk.GetArrayFromImage(resample(to_sitk(mk.astype(np.float32), sp), sitk.sitkLinear, 0)).transpose(2, 1, 0) > 0.5
    dest = raw / out
    dest.mkdir(parents=True, exist_ok=True)
    aff = np.diag([1.5, 1.5, 1.5, 1])
    nib.save(nib.Nifti1Image(ct15, aff), dest / "ct.nii.gz")
    nib.save(nib.Nifti1Image(mk15.astype(np.uint8), aff), dest / "pe_mask.nii.gz")
    print(f"{case}: {ct15.shape}, emboli {mk15.sum() * 3.375 / 1000:.1f} mL, HU ort {ct15[mk15].mean():.0f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("case")
    ap.add_argument("out")
    ap.add_argument("--flip-z", action="store_true")
    a = ap.parse_args()
    main(a.case, a.out, a.flip_z)
