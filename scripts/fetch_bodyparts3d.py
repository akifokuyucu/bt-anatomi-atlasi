"""BodyParts3D (CC BY 4.0, DBCLS) OBJ arşivini data/raw/bodyparts3d/ altına indirir."""
import os, urllib.request
URL = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip'
HEDEF = os.path.join('data', 'raw', 'bodyparts3d', 'isa_BP3D_4.0_obj_99.zip')
os.makedirs(os.path.dirname(HEDEF), exist_ok=True)
if not os.path.exists(HEDEF):
    urllib.request.urlretrieve(URL, HEDEF + '.part')
    os.replace(HEDEF + '.part', HEDEF)
print('boyut MB', round(os.path.getsize(HEDEF) / 1e6, 1))
