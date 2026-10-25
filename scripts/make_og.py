"""Paylaşım önizleme görseli (docs/og.png, 1200x630) üretir: renkli aksiyel kesit + başlık."""
import gzip, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

D = 'docs/data/s0139/'
atlas = json.load(open(D + 'atlas.json', encoding='utf-8'))
nx, ny, nz = atlas['dims']
ct = np.frombuffer(gzip.open(D + 'ct.bin.gz').read(), dtype=np.int16).reshape(nz, ny, nx)
lab = np.frombuffer(gzip.open(D + 'labels.bin.gz').read(), dtype=np.uint8).reshape(nz, ny, nx)
st = {s['key']: s for s in atlas['structures']}
z = st['pancreas']['focus']['axial']

W, L = 400, 40
g = np.clip((ct[z].astype(np.float32) - (L - W / 2)) / W, 0, 1)
rgb = np.stack([g] * 3, -1) * 255
for s in atlas['structures']:
    if s['system'] != 'organ':
        continue
    m = lab[z] == s['id']
    c = np.array([int(s['color'][i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)
    rgb[m] = rgb[m] * 0.55 + c * 0.45

# Radyolojik yön: hastanın sağı solda, ön üstte
img = Image.fromarray(rgb.astype(np.uint8))
img = img.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.FLIP_TOP_BOTTOM)
H = 630
# Vücudu ortala: yatayda orta %68'i kırp
cw = int(img.width * 0.68)
x0 = (img.width - cw) // 2
img = img.crop((x0, 0, x0 + cw, img.height))
img = img.resize((int(img.width * H / img.height), H), Image.LANCZOS)

out = Image.new('RGB', (1200, 630), (11, 13, 16))
out.paste(img, (1200 - img.width, 0))
d = ImageDraw.Draw(out)
bold = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 64)
reg = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 28)
d.text((60, 190), 'BT Anatomi', font=bold, fill=(240, 240, 240))
d.text((60, 265), 'Atlası', font=bold, fill=(240, 240, 240))
for i, t in enumerate(['Abdomen ve pelvis BT', 'Türkçe etiketli, etkileşimli', 'kesit atlası ve test']):
    d.text((60, 370 + i * 42), t, font=reg, fill=(160, 170, 180))
out.save('docs/og.png', optimize=True)
