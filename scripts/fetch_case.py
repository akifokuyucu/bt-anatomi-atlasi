"""TotalSegmentator veri setinden (Zenodo, CC BY 4.0) yalnızca istenen vakaları indirir.

23,6 GB'lık arşivin tamamı yerine HTTP aralık istekleriyle sadece vakanın dosyaları çekilir.

Kullanım:
    .venv/Scripts/python scripts/fetch_case.py s0139 [s0140 ...]
"""

import sys

from remotezip import RemoteZip

URL = "https://zenodo.org/api/records/10047292/files/Totalsegmentator_dataset_v201.zip/content"


def main(ids, out_dir="data/raw"):
    with RemoteZip(URL) as z:
        for name in z.namelist():
            if name.endswith(".csv") or (any(name.startswith(i + "/") for i in ids) and not name.endswith("/")):
                z.extract(name, out_dir)
    print(f"İndirildi: {', '.join(ids)} -> {out_dir}")


if __name__ == "__main__":
    main(sys.argv[1:])
