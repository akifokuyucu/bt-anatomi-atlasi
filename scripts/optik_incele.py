"""BodyParts3D listesinde göz ve görme yolu parçalarını arar; boyut ve konumlarını yazar."""
import re
import zipfile

import numpy as np

ZIP = 'data/raw/bodyparts3d/isa_BP3D_4.0_obj_99.zip'
LISTE = 'data/raw/bodyparts3d/isa_element_parts.txt'
DESEN = re.compile(r'optic|geniculate|calcarine|occipital|eyeball|retina|sclera|cornea|lens|colliculus|'
                   r'cerebral hemisphere|telencephalon|cerebrum|cerebral cortex|thalamus|cuneus|lingual|pretectal|'
                   r'temporal lobe|parietal lobe|frontal lobe|brainstem|midbrain|^brain|cerebellum|pituitary|hypophysis|'
                   r'lateral ventricle|ciliary|iris|vitreous|pons$|medulla oblongata', re.I)

z = zipfile.ZipFile(ZIP)
adlar = set(z.namelist())
goruldu = {}
for l in open(LISTE, encoding='utf-8').read().splitlines()[1:]:
    c, n, f = l.split('\t')
    if DESEN.search(n):
        goruldu.setdefault(f, n)
print('parça', len(goruldu))
for f, n in sorted(goruldu.items(), key=lambda t: t[1]):
    yol = f'isa_BP3D_4.0_obj_99/{f}.obj'
    if yol not in adlar:
        print(f, n, 'YOK')
        continue
    v = []
    for s in z.read(yol).decode().splitlines():
        if s.startswith('v '):
            v.append([float(x) for x in s.split()[1:4]])
    v = np.array(v)
    print(f, repr(n), len(v), v.min(0).round(0).tolist(), v.max(0).round(0).tolist())
