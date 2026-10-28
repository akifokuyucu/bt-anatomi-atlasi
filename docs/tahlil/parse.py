"""Tahlil raporu ayrıştırıcı (tarayıcıda Pyodide ile çalışır).

Girdi: PDF'ten çıkarılmış metin satırları. Çıktı: tarih + satır listesi (JSON).
Hiçbir şey diske yazılmaz, ağa gönderilmez. Yorum/tanı üretmez; yalnızca değerleri çıkarır.
"""
import json
import re

# Ortak adlar: kanonik ad -> raporlarda geçen yazımlar
ESADLAR = {
    "Hemoglobin": ["hgb", "hb", "hemoglobin"],
    "Hematokrit": ["hct", "hematokrit"],
    "Eritrosit": ["rbc", "eritrosit", "alyuvar", "kirmizi kan hucresi"],
    "Lökosit": ["wbc", "lokosit", "akyuvar", "beyaz kan hucresi"],
    "Trombosit": ["plt", "trombosit", "platelet"],
    "MCV": ["mcv"],
    "MCH": ["mch"],
    "MCHC": ["mchc"],
    "RDW": ["rdw", "rdwcv"],
    "MPV": ["mpv"],
    "Nötrofil": ["neu", "neut", "notrofil", "notrofil sayisi"],
    "Nötrofil %": ["neu %", "neut %", "notrofil %"],
    "Lenfosit %": ["lym %", "lymph %", "lenfosit %"],
    "Monosit %": ["mono %", "monosit %"],
    "Eozinofil %": ["eos %", "eozinofil %"],
    "Bazofil %": ["bas %", "baso %", "bazofil %"],
    "Lenfosit": ["lym", "lymph", "lenfosit", "lenfosit sayisi"],
    "Monosit": ["mono", "monosit"],
    "Eozinofil": ["eos", "eozinofil"],
    "Bazofil": ["bas", "baso", "bazofil"],
    "Glukoz": ["glu", "glukoz", "aclik kan sekeri", "aks", "glikoz", "kan sekeri"],
    "HbA1c": ["hba1c", "hba1c %", "a1c", "glikozile hemoglobin"],
    "Üre": ["ure", "urea"],
    "BUN": ["bun", "kan ure azotu"],
    "Kreatinin": ["kreatinin", "creatinine", "creat", "crea"],
    "eGFR": ["egfr", "gfr"],
    "Ürik Asit": ["urik asit", "uric acid"],
    "Sodyum": ["na", "sodyum", "sodium"],
    "Potasyum": ["k", "potasyum", "potassium"],
    "Klor": ["cl", "klor", "chloride"],
    "Kalsiyum": ["ca", "kalsiyum", "calcium"],
    "Magnezyum": ["mg", "magnezyum", "magnesium"],
    "Fosfor": ["p", "fosfor", "phosphorus", "inorganik fosfor"],
    "AST": ["ast", "sgot"],
    "ALT": ["alt", "sgpt"],
    "ALP": ["alp", "alkalen fosfataz"],
    "GGT": ["ggt", "gama gt", "gamma gt"],
    "LDH": ["ldh", "laktat dehidrogenaz"],
    "Total Bilirubin": ["tbil", "total bilirubin", "bilirubin total", "bilirubin t"],
    "Direkt Bilirubin": ["dbil", "direkt bilirubin", "bilirubin direkt", "bilirubin d"],
    "Albümin": ["alb", "albumin"],
    "Total Protein": ["tp", "total protein"],
    "Amilaz": ["amilaz", "amylase"],
    "Lipaz": ["lipaz", "lipase"],
    "CRP": ["crp", "c reaktif protein"],
    "Sedimantasyon": ["sedim", "sedimantasyon", "esr", "1 saat", "sedimantasyon 1 saat"],
    "Prokalsitonin": ["prokalsitonin", "procalcitonin"],
    "Plateletkrit": ["pct"],
    "PDW": ["pdw"],
    "RDW-SD": ["rdw sd"],
    "PTH": ["pth", "parat hormon"],
    "Demir Bağlama Kapasitesi": ["demir baglama kapasitesi", "dbk", "tibc"],
    "Total Kolesterol": ["chol", "kolesterol", "total kolesterol"],
    "LDL Kolesterol": ["ldl", "ldl kolesterol"],
    "HDL Kolesterol": ["hdl", "hdl kolesterol"],
    "Trigliserit": ["tg", "trigliserit", "trigliserid", "trig"],
    "TSH": ["tsh"],
    "Serbest T4": ["ft4", "serbest t4", "sT4"],
    "Serbest T3": ["ft3", "serbest t3"],
    "Ferritin": ["ferritin"],
    "Demir": ["fe", "demir", "iron", "serum demiri"],
    "B12 Vitamini": ["b12", "vitamin b12", "vit b12"],
    "D Vitamini": ["25 oh vitamin d", "25 oh d", "25 hidroksi vit d", "vitamin d", "vit d"],
    "Folat": ["folat", "folik asit", "folate"],
    "PT": ["pt", "protrombin zamani"],
    "INR": ["inr"],
    "aPTT": ["aptt", "ptt"],
    "Fibrinojen": ["fibrinojen", "fibrinogen"],
    "D-Dimer": ["d dimer", "ddimer"],
    "Troponin": ["troponin", "tni", "hs troponin i", "hs tnt"],
    "CK-MB": ["ckmb", "ck mb"],
    "CA 19-9": ["ca 19 9", "ca19 9", "ca199"],
    "CEA": ["cea"],
    "AFP": ["afp"],
    "PSA": ["psa", "total psa"],
}

TR = str.maketrans({"İ": "i", "I": "i", "ı": "i", "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g",
                    "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u"})


def katla(s):
    """Karşılaştırma için: küçük harf, Türkçe karakter yok, noktalama boşluk."""
    s = s.translate(TR).lower().replace("%", " % ")
    return " ".join(re.sub(r"[^a-z0-9%]+", " ", s).split())


_ESLE = {}
for kanon, liste in ESADLAR.items():
    _ESLE[katla(kanon)] = kanon
    for a in liste:
        _ESLE[katla(a)] = kanon


def kanonik(ad):
    k = katla(ad)
    if k in _ESLE:
        return _ESLE[k]
    # (serum), (kan) gibi parantezleri at
    k2 = katla(re.sub(r"\(.*?\)", " ", ad))
    if k2 in _ESLE:
        return _ESLE[k2]
    # sondaki "serum / kan / tam kan / idrar" eklerini at
    k3 = re.sub(r"\b(serum|kan|plazma|tam)\b", " ", k2 or k)
    k3 = " ".join(k3.split())
    return _ESLE.get(k3, ad.strip())


SAYI = re.compile(r"^[<>≤≥]?-?\d+(?:[.,]\d+)?$")
TARIH = re.compile(r"(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)")
TARIH_ANAHTAR = ("rapor", "numune", "örnek", "ornek", "kabul", "tarih", "onay", "sonuç", "sonuc")
ATLA_ANAHTAR = ("doğum", "dogum", "d.tarih", "yaş", "yas", "protokol", "tc ", "telefon", "barkod", "sayfa")
ISARET = {"h", "l", "*", "↑", "↓", "yüksek", "yuksek", "düşük", "dusuk", "high", "low"}


def sayi(t):
    return float(re.sub(r"[<>≤≥]", "", t).replace(",", "."))


def tarih_bul(satirlar):
    adaylar = []
    for s in satirlar:
        d = s.lower()
        m = TARIH.search(s)
        if not m or any(a in d for a in ATLA_ANAHTAR):
            continue
        g, a, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if not (1 <= g <= 31 and 1 <= a <= 12 and 1990 <= y <= 2100):
            continue
        oncelik = 0 if any(k in d for k in TARIH_ANAHTAR) else 1
        adaylar.append((oncelik, f"{y:04d}-{a:02d}-{g:02d}"))
    return min(adaylar)[1] if adaylar else ""


def referans(parca):
    """'0,5 - 1,2', '< 5', '> 40' gibi metinden (alt, üst) çıkarır."""
    p = parca.replace("–", "-").replace("—", "-")
    m = re.search(r"(-?\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)", p)
    if m:
        return sayi(m.group(1)), sayi(m.group(2))
    m = re.search(r"(?:[<≤]=?)\s*(\d+(?:[.,]\d+)?)", p)
    if m:
        return None, sayi(m.group(1))
    m = re.search(r"(?:[>≥]=?)\s*(\d+(?:[.,]\d+)?)", p)
    if m:
        return sayi(m.group(1)), None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*>", p)  # "60 >": alt sınır
    if m:
        return sayi(m.group(1)), None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*<", p)
    if m:
        return None, sayi(m.group(1))
    return None, None


def satir_oku(satir):
    t = satir.replace(" ", " ").split()
    if len(t) < 2:
        return None
    # İlk "saf sayı" belirteci değerdir; öncesi tahlil adıdır
    for i in range(1, len(t)):
        if SAYI.match(t[i]):
            break
    else:
        return None
    ad = " ".join(t[:i]).strip(" :.-")
    if len(re.findall(r"[A-Za-zÇĞİÖŞÜçğıöşü]", ad)) < 2 or len(t[:i]) > 6:
        return None
    if any(a in ad.lower() for a in ATLA_ANAHTAR + ("tarih",)):
        return None
    if re.search(r"[;<>=,]", ad):  # açıklama satırı ya da sarkan metin
        return None
    kanon = kanonik(ad)
    if SAYI.match(t[0]) and kanon == ad.strip():  # "3 LÖKOSİT, 4" gibi sarkan metin; "1 Saat" tanınır
        return None
    kalan = t[i + 1:]
    isaret = ""
    if kalan and kalan[0].lower() in ISARET:
        isaret = kalan.pop(0).lower()
    birim = ""
    if kalan and not SAYI.match(kalan[0]) and kalan[0] not in "(<>≤≥-–" and len(kalan[0]) <= 16 and not kalan[0].endswith(","):
        birim = kalan.pop(0)
    if kalan and kalan[0].lower() in ISARET and not isaret:
        isaret = kalan.pop(0).lower()
    alt, ust = referans(" ".join(kalan))
    if not birim and alt is None and ust is None and kalan:  # "3 LÖKOSİT, 4 ERİTROSİT" gibi serbest metin
        return None
    op = re.match(r"[<>≤≥]", t[i])
    return {
        "ad": ad,
        "kanon": kanon,
        "deger": sayi(t[i]),
        "op": op.group(0) if op else "",
        "birim": birim,
        "alt": alt,
        "ust": ust,
        "isaret": isaret,
        "metin": "",
        "ham": satir.strip(),
    }


# Sayısal olmayan sonuçlar (NEGATİF, Normal, Pozitif +++ …). Serbest metin (ör. sediment açıklaması) alınmaz.
METIN_SONUC = {"negatif", "pozitif", "normal", "anormal", "eser", "reaktif", "nonreaktif", "non reaktif",
               "saptanmadi", "saptandi", "var", "yok", "berrak", "bulanik", "sari", "acik sari", "koyu sari", "kehribar"}
OLUMSUZ = {"negatif", "normal", "yok", "saptanmadi", "nonreaktif", "non reaktif", "berrak"}
OLUMLU = {"pozitif", "anormal", "var", "reaktif", "saptandi"}


def metin_sonuc_mu(t):
    k = katla(t)
    return k in METIN_SONUC or bool(re.fullmatch(r"\+{1,4}|\d\+|pozitif \(?\+{1,4}\)?", t.strip().lower()))


def metin_satiri(satir):
    h = [c.strip() for c in re.split(r"\s{2,}", satir.replace(" ", " ").strip()) if c.strip()]
    if not (2 <= len(h) <= 4) or not metin_sonuc_mu(h[1]):
        return None
    ad = h[0].strip(" :.-")
    if len(re.findall(r"[A-Za-zÇĞİÖŞÜçğıöşü]", ad)) < 2 or len(ad.split()) > 6 or re.search(r"[;<>=,]", ad):
        return None
    if any(a in ad.lower() for a in ATLA_ANAHTAR + ("tarih",)):
        return None
    sonuc = h[1]
    ref = h[2] if len(h) > 2 and not SAYI.match(h[2]) else ""
    if ref:
        durum = "normal" if katla(ref) == katla(sonuc) else "anormal"
    else:
        k = katla(sonuc)
        durum = "normal" if k in OLUMSUZ else "anormal" if (k in OLUMLU or "+" in sonuc) else "belirsiz"
    return {"ad": ad, "kanon": kanonik(ad), "deger": None, "op": "", "birim": "", "alt": None, "ust": None,
            "isaret": "", "metin": sonuc, "ref_metin": ref, "durum_metin": durum, "ham": satir.strip()}


BLOK_TARIH = re.compile(r"^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)(.*)$")
NORMAL_ALT = re.compile(r"^\s*Normal\s*;\s*(?:>=|>|≥)\s*(\d+(?:[.,]\d+)?)", re.I)


def ayristir(dosya, satirlar_json):
    """Satırları sırayla gezer. Satır başındaki tarih (e-Nabız gibi) yeni bir tarih bloğu açar;
    sonraki tahliller o tarihe aittir. Blok yoksa rapor başlığındaki tarih kullanılır."""
    satirlar = json.loads(satirlar_json)
    satirlar = [s for s in satirlar if s and s.strip()]
    yedek = tarih_bul(satirlar)
    sonuc = {"dosya": dosya, "tarih": yedek, "satirlar": []}
    tarih, grup = "", ""
    for s in satirlar:
        m = BLOK_TARIH.match(s)
        if m and not re.search(r"\d+[.,]\d+| mm ", m.group(4) + " "):
            g, a, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= g <= 31 and 1 <= a <= 12 and 1990 <= y <= 2100:
                tarih = f"{y:04d}-{a:02d}-{g:02d}"
                grup = m.group(4).strip()
                continue
        n = NORMAL_ALT.match(s)
        if n:  # referansı sonraki satırda yazan tahlil (ör. D vitamini)
            son = sonuc["satirlar"][-1] if sonuc["satirlar"] else None
            if son and son["alt"] is None and son["ust"] is None:
                son["alt"] = sayi(n.group(1))
            continue
        r = satir_oku(s) or metin_satiri(s)
        if r:
            if "idrar" in grup.lower():
                r["kanon"] = "İdrar " + r["kanon"]
            r["grup"] = grup
            r["tarih"] = tarih or yedek
            sonuc["satirlar"].append(r)
    dolu = [r["tarih"] for r in sonuc["satirlar"] if r["tarih"]]
    if not sonuc["tarih"] and dolu:
        sonuc["tarih"] = dolu[0]
    return json.dumps(sonuc, ensure_ascii=False)
