"""BodyParts3D parça listelerini indirir (BP kimliği → FJ dosya adı eşlemesi)."""
import os, urllib.request
B = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
os.makedirs('data/raw/bodyparts3d', exist_ok=True)
for ad in ['isa_parts_list_e.txt', 'isa_element_parts.txt', 'isa_inclusion_list.txt']:
    try:
        urllib.request.urlretrieve(B + ad, 'data/raw/bodyparts3d/' + ad)
        print('ok', ad, os.path.getsize('data/raw/bodyparts3d/' + ad))
    except Exception as e:
        print('yok', ad, e)
