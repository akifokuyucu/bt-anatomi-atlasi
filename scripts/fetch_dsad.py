"""DSAD (Dresden Surgical Anatomy Dataset, CC BY 4.0) multi_organ alt kümesinden kare indirir.

Hugging Face aynası `nct-tso/dsad` parquet dosyalarından yalnızca gereken sütun
parçalarını HTTP aralık isteğiyle okur: önce maskeler (küçük), sonra seçilen
karelerin bulunduğu satır gruplarının görüntü sütunu. Dosyanın tamamı inmez.

Kullanım:
    python scripts/fetch_dsad.py --split validation --n 16
Çıktı: data/raw/dsad/<split>/<ameliyat>_<kare>/image.png ve mask_<yapı>.png
"""
import argparse
import io
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
from huggingface_hub import HfFileSystem
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REPO = "datasets/nct-tso/dsad/multi_organ"
ORGANS = ["abdominal_wall", "colon", "liver", "pancreas", "small_intestine", "spleen", "stomach"]
MASK_COLS = [f"mask_{o}" for o in ORGANS]


def mask_area(png_bytes):
    """Maskedeki ön plan oranı (0–1)."""
    m = np.asarray(Image.open(io.BytesIO(png_bytes)).convert("L"))
    return float((m > 127).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="validation", choices=["train", "validation", "test"])
    ap.add_argument("--n", type=int, default=16, help="indirilecek kare sayısı")
    ap.add_argument("--gap", type=int, default=4, help="aynı ameliyatta kareler arası en az fark (frame_id)")
    ap.add_argument("--max-groups", type=int, default=2, help="görüntüsü okunacak en fazla satır grubu")
    args = ap.parse_args()

    fs = HfFileSystem()
    with fs.open(f"{REPO}/{args.split}.parquet", "rb") as f:
        pf = pq.ParquetFile(f)
        md = pf.metadata

        # 1) Yalnızca kimlik + maske sütunları: her karede görünen yapı sayısı
        rows = []
        for g in range(md.num_row_groups):
            t = pf.read_row_group(g, columns=["surgery_id", "frame_id"] + MASK_COLS).to_pylist()
            for i, r in enumerate(t):
                areas = {o: mask_area(r[f"mask_{o}"]["bytes"]) for o in ORGANS}
                n_vis = sum(a > 0.005 for a in areas.values())
                rows.append(dict(group=g, idx=i, sid=r["surgery_id"], fid=r["frame_id"], areas=areas, n=n_vis))
        print(f"{args.split}: {len(rows)} kare, satır grubu {md.num_row_groups}")

        # 2) Seçim: en çok yapı içeren satır grupları, gruplar içinde yapı sayısına ve kare aralığına göre
        by_group = {}
        for r in rows:
            by_group.setdefault(r["group"], []).append(r)
        score = {g: sum(r["n"] for r in rs) / len(rs) for g, rs in by_group.items()}
        groups = sorted(score, key=score.get, reverse=True)[: args.max_groups]
        cand = sorted((r for r in rows if r["group"] in groups), key=lambda r: (-r["n"], r["sid"], int(r["fid"])))
        chosen = []
        for r in cand:
            # aynı ameliyatta birbirine çok yakın kareleri atla (neredeyse aynı görüntü)
            if any(c["sid"] == r["sid"] and abs(int(c["fid"]) - int(r["fid"])) < args.gap for c in chosen):
                continue
            chosen.append(r)
            if len(chosen) == args.n:
                break
        print("seçilen:", [(c["sid"], c["fid"], c["n"]) for c in chosen])

        # 3) Seçilen grupların görüntü sütunu
        out = ROOT / "data" / "raw" / "dsad" / args.split
        for g in sorted({c["group"] for c in chosen}):
            t = pf.read_row_group(g, columns=["image"] + MASK_COLS).to_pylist()
            for c in (c for c in chosen if c["group"] == g):
                r = t[c["idx"]]
                d = out / f"{c['sid']}_{int(c['fid']):06d}"
                d.mkdir(parents=True, exist_ok=True)
                (d / "image.png").write_bytes(r["image"]["bytes"])
                for o in ORGANS:
                    (d / f"mask_{o}.png").write_bytes(r[f"mask_{o}"]["bytes"])
            print(f"satır grubu {g} yazıldı")
    print("çıktı:", out)


if __name__ == "__main__":
    main()
