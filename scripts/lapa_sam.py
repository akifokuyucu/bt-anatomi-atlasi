"""SAM 2 ile laparoskopi videosunda maske yayılımı (bağımsız modül).

Proje dosyalarına bağımlı değildir: build_lapa_video.py bunu içe aktarır, aynı dosya masaüstü
paketinde (`build_lapa_video.py --paket`) tek başına da çalışır.

Paket klasörü yapısı:
    kareler/00000.jpg …   klibin her 2. karesi (12,5 fps)
    istemler.json         nesneler, sahne kesmeleri, istem noktaları, renkler
    lapa_sam.py           bu dosya

Kullanım (paket klasöründe):
    python lapa_sam.py                     # aygıt ve model otomatik (NVIDIA varsa GPU)
    python lapa_sam.py --model large --size 1024
Çıktı: cikti/masks.npz (bu dosya geri getirilir), cikti/kontrol.jpg (göz kontrolü)
"""
import argparse
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

MODELS = {  # ad: (yapılandırma, ağırlık dosyası)
    "tiny": ("configs/sam2.1/sam2.1_hiera_t.yaml", "sam2.1_hiera_tiny.pt"),
    "small": ("configs/sam2.1/sam2.1_hiera_s.yaml", "sam2.1_hiera_small.pt"),
    "base_plus": ("configs/sam2.1/sam2.1_hiera_b+.yaml", "sam2.1_hiera_base_plus.pt"),
    "large": ("configs/sam2.1/sam2.1_hiera_l.yaml", "sam2.1_hiera_large.pt"),
}
CKPT_URL = "https://dl.fbaipublicfiles.com/segment_anything_2/092824/"


def checkpoint(model, cache):
    path = Path(cache) / MODELS[model][1]
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Model ağırlığı indiriliyor: {path.name}", flush=True)
        urllib.request.urlretrieve(CKPT_URL + path.name, path.with_suffix(".part"))
        path.with_suffix(".part").rename(path)
    return path


def chunk_starts(spec, n, chunk):
    """Parça sınırları: sahne kesmeleri, istem kareleri ve her `chunk` karede bir."""
    marks = sorted(set(spec["scenes"]) | set(spec["prompts"]) | {n})
    out = []
    for a, b in zip(marks, marks[1:]):
        out += list(range(a, b, chunk))
    return out + [n]


def run(frames, spec, model="tiny", size=512, device="cpu", chunk=100, cache=".", work=None):
    """SAM 2 video yayılımı, parça parça. Dönüş: masks [kare, nesne, y, x] (bool), nesne kimlikleri.

    spec: {"objects": {nesne: yapı}, "tools": [alet yapıları], "scenes": [kare],
           "prompts": {kare: {nesne: [(x, y, etiket)]}}}  (anahtarlar int)
    Her parça bir istem karesiyle (verilen noktalar) ya da önceki parçanın son maskesiyle başlar;
    sahne kesmesinde önceki maske taşınmaz. Örtüşmede aletler önce gelir, organlar arasında
    logit'i yüksek olan kazanır.
    """
    import torch
    from sam2.build_sam import build_sam2_video_predictor

    cfg, _ = MODELS[model]
    pred = build_sam2_video_predictor(cfg, str(checkpoint(model, cache)), device=device,
                                      hydra_overrides_extra=[f"++model.image_size={size}"])
    n = len(frames)
    h, w = np.array(Image.open(frames[0])).shape[:2]
    obj_ids = sorted(spec["objects"])
    tool = [spec["objects"][o] in spec["tools"] for o in obj_ids]
    masks = np.zeros((n, len(obj_ids), h, w), bool)
    tmp = Path(work or Path(frames[0]).parent.parent) / "_parca"
    t0 = time.time()
    bounds = chunk_starts(spec, n, chunk)
    for a, b in zip(bounds, bounds[1:]):
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True)
        for i in range(a, b):
            shutil.copy(frames[i], tmp / f"{i - a:05d}.jpg")
        state = pred.init_state(video_path=str(tmp), offload_video_to_cpu=True)
        prompts = spec["prompts"].get(a, {})
        seed = a > 0 and a not in spec["scenes"]
        logits = np.full((b - a, len(obj_ids), h, w), -np.inf, np.float32)
        added = 0
        with torch.inference_mode(), torch.autocast(device, dtype=torch.bfloat16, enabled=device == "cuda"):
            for k, oid in enumerate(obj_ids):
                if oid in prompts:
                    pts = np.array([(x, y) for x, y, _ in prompts[oid]], np.float32)
                    lab = np.array([l for _, _, l in prompts[oid]], np.int32)
                    pred.add_new_points_or_box(state, frame_idx=0, obj_id=oid, points=pts, labels=lab)
                    added += 1
                elif seed and masks[a - 1, k].sum() > 200:
                    pred.add_new_mask(state, frame_idx=0, obj_id=oid, mask=masks[a - 1, k])
                    added += 1
            if added:
                for f, ids, lg in pred.propagate_in_video(state):
                    for oid, l in zip(ids, lg):
                        logits[f, obj_ids.index(oid)] = l[0].float().cpu().numpy()
        pred.reset_state(state)
        del state
        fg = logits > 0
        organ = [k for k in range(len(obj_ids)) if not tool[k]]
        best = np.argmax(logits[:, organ], axis=1)
        taken = np.zeros((b - a, h, w), bool)
        for k in range(len(obj_ids)):
            if tool[k]:
                masks[a:b, k] = fg[:, k]
                taken |= fg[:, k]
        for j, k in enumerate(organ):
            masks[a:b, k] = fg[:, k] & (best == j) & ~taken
        area = " ".join(f"{masks[b - 1, k].mean() * 100:.0f}" for k in range(len(obj_ids)))
        print(f"  kare {a}-{b - 1}: {added} nesne, son kare alan % [{area}], {time.time() - t0:.0f} sn", flush=True)
    shutil.rmtree(tmp, ignore_errors=True)
    return masks, obj_ids


def polygons(mask):
    """İkili maske → [[x, y, x, y, …], …] (küçük adacıklar atılır)."""
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in cs:
        if cv2.contourArea(c) < 250:
            continue
        c = cv2.approxPolyDP(c, 1.5, True).reshape(-1, 2)
        if len(c) >= 3:
            out.append(c.flatten().tolist())
    return out


def overlay(frame, masks, colors, alpha=90):
    """Kareye renkli maske katmanı çizer; colors[k] = "#rrggbb"."""
    im = Image.open(frame).convert("RGBA")
    ov = Image.new("RGBA", im.size)
    d = ImageDraw.Draw(ov)
    for m, col in zip(masks, colors):
        r, g, b = (int(col[j:j + 2], 16) for j in (1, 3, 5))
        for p in polygons(m):
            d.polygon(list(zip(p[::2], p[1::2])), fill=(r, g, b, alpha), outline=(r, g, b, 255), width=2)
    return Image.alpha_composite(im, ov).convert("RGB")


def contact_sheet(frames, masks, colors, dst, fps, tiles=16):
    """Videoya yayılmış `tiles` karelik kontrol görüntüsü."""
    n = len(frames)
    ims = []
    for i in [int(n * j / tiles) for j in range(tiles)]:
        im = overlay(frames[i], masks[i], colors)
        ImageDraw.Draw(im).text((6, 6), f"{i} ({i / fps:.1f} sn)", fill=(255, 255, 0))
        ims.append(im.resize((im.width // 2, im.height // 2)))
    cols = 4
    tw, th = ims[0].size
    sheet = Image.new("RGB", (tw * cols, th * ((len(ims) + cols - 1) // cols)))
    for j, t in enumerate(ims):
        sheet.paste(t, ((j % cols) * tw, (j // cols) * th))
    sheet.save(dst, quality=85)


def load_spec(path):
    """istemler.json → run() biçimi (JSON anahtarları metin, burada int)."""
    s = json.loads(Path(path).read_text(encoding="utf-8"))
    s["objects"] = {int(k): v for k, v in s["objects"].items()}
    s["prompts"] = {int(f): {int(o): [tuple(p) for p in pts] for o, pts in objs.items()}
                    for f, objs in s["prompts"].items()}
    return s


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description="SAM 2 maske yayılımı (paket klasöründe çalıştırın)")
    ap.add_argument("--model", choices=list(MODELS), help="varsayılan: GPU'da base_plus, CPU'da tiny")
    ap.add_argument("--size", type=int, help="iç çözünürlük; varsayılan: GPU'da 1024, CPU'da 512")
    ap.add_argument("--device", choices=["cuda", "cpu"])
    ap.add_argument("--chunk", type=int, default=100, help="parça başına kare (RAM azsa düşürün)")
    args = ap.parse_args()

    import torch
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    model = args.model or ("base_plus" if device == "cuda" else "tiny")
    size = args.size or (1024 if device == "cuda" else 512)
    gpu = f" ({torch.cuda.get_device_name(0)})" if device == "cuda" else ""
    print(f"Aygıt: {device}{gpu} · model: {model} · çözünürlük: {size}", flush=True)

    spec = load_spec(here / "istemler.json")
    frames = sorted((here / "kareler").glob("*.jpg"))
    if not frames:
        sys.exit("kareler/ klasöründe görüntü yok")
    t0 = time.time()
    masks, obj_ids = run(frames, spec, model, size, device, args.chunk, cache=here / "model", work=here)
    out = here / "cikti"
    out.mkdir(exist_ok=True)
    np.savez_compressed(out / "masks.npz", masks=masks, obj_ids=np.array(obj_ids),
                        info=np.array(json.dumps({"case": spec["case"], "model": model, "size": size, "device": device})))
    colors = [spec["colors"][spec["objects"][o]] for o in obj_ids]
    contact_sheet(frames, masks, colors, out / "kontrol.jpg", spec["fps"])
    print(f"Bitti: {time.time() - t0:.0f} sn. Geri getirilecek dosya: {out / 'masks.npz'}", flush=True)


if __name__ == "__main__":
    main()
