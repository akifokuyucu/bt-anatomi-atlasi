"""BodyParts3D kalp parçalarının sınır kutusu ve köşe sayısını özetler (yön tayini için)."""
import zipfile, numpy as np
z = zipfile.ZipFile('data/raw/bodyparts3d/isa_BP3D_4.0_obj_99.zip')
def yukle(fj):
    v = []; f = 0
    for l in z.read(f'isa_BP3D_4.0_obj_99/{fj}.obj').decode().splitlines():
        if l.startswith('v '): v.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('f '): f += 1
    return np.array(v), f
ADLAR = {'FJ2428':'karincik duvar','FJ2439':'RA duvar','FJ2438':'LA duvar','FJ2422':'LV bosluk','FJ2423':'RV bosluk','FJ3413':'c.aort','FJ3411':'arkus','FJ3427':'inen aort','FJ2966':'pulm govde','FJ3645':'SVC','FJ3441':'IVC','FJ2723':'RCA','FJ2737':'LCA','FJ3019':'sag PA','FJ2924':'sol PA'}
for k, a in ADLAR.items():
    v, f = yukle(k)
    print(k, a, 'v', len(v), 'f', f, 'merkez', v.mean(0).round(1), 'min', v.min(0).round(0), 'max', v.max(0).round(0))
