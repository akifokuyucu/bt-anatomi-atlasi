"""BodyParts3D zip'inde kalp parçalarının dosya adlarını bulur (yalnızca özet yazar)."""
import zipfile
z = zipfile.ZipFile('data/raw/bodyparts3d/isa_BP3D_4.0_obj_99.zip')
ad = z.namelist()
print('girdi', len(ad)); print(ad[:4])
KIMLIK = {'BP8712':'RA duvar','BP8677':'RA bosluk','BP8719':'LA bosluk','BP9267':'LA duvar','BP9227':'RV bosluk','BP8928':'LV bosluk','BP7815':'karincik duvar','BP8713':'atriyum duvar','BP10329':'ç.aort','BP10322':'aort arkus','BP10248':'inen aort','BP8690':'pulm gövde','BP8691':'pulm art gövde','BP8968':'sağ PA','BP8463':'sol PA','BP10292':'SVC','BP10311':'IVC','BP8221':'RCA','BP8961':'LCA','BP8397':'Cx','BP9086':'koroner sinus','BP8933':'büyük kalp veni','BP8139':'pulm ven gövde','BP8557':'üst PV','BP8335':'alt PV','BP7816':'oda duvar','BP8679':'oda bosluk'}
for k, v in KIMLIK.items():
    e = [a for a in ad if k in a]
    print(k, v, e[:2], [z.getinfo(x).file_size//1024 for x in e[:1]])
