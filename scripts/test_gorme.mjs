// Görme yolu modelinin klasik defektleri ürettiğini sınar: node scripts/test_gorme.mjs
import { readFileSync } from 'node:fs';
import { modelKur, PATOLOJI, HALKA, ACI_N, alanSiniri, pupillaSurus } from '../docs/gorme-model.js';

const meta = JSON.parse(readFileSync(new URL('../docs/data/optik/optik.json', import.meta.url), 'utf8'));
const t0 = Date.now();
const M = modelKur(meta);
console.log('model ms', Date.now() - t0);

// Alan bölgesi başına ortalama hasar. Göz başına: üst/alt × nazal/temporal, merkez (≤10°), hilal (>62° temporal)
function ozet(D) {
  const s = {};
  for (let g = 0; g < 2; g++) {
    const e = g ? -1 : 1;
    const top = {}, say = {};
    const ek = (a, v) => { top[a] = (top[a] || 0) + v; say[a] = (say[a] || 0) + 1; };
    HALKA.forEach((E, i) => {
      for (let j = 0; j < ACI_N; j++) {
        const p = (j + 0.5) / ACI_N * 2 * Math.PI;
        const x = E * Math.cos(p), y = E * Math.sin(p);
        if (E > alanSiniri(e, x, y)) continue;
        const v = D[g * M.lifN + i * ACI_N + j];
        const n = x * e;
        if (E <= 3) ek('m3', v);
        if (E <= 10) ek('m', v);
        if (E > 12 && E <= 60) ek((y > 0 ? 'u' : 'a') + (n > 0 ? 'N' : 'T'), v);
        if (n < 0 && E > 65) ek('hil', v);
        if (E > 12 && Math.abs(y) < E * 0.25) ek((n > 0 ? 'yN' : 'yT'), v);
      }
    });
    for (const a in top) s[(g ? 'R' : 'L') + a] = +(top[a] / say[a]).toFixed(2);
  }
  return s;
}
const yuk = (v) => v >= 0.6, dus = (v) => v <= 0.2;
// Beklenti: h=+1 (sol lezyon). L sol göz, R sağ göz. Sol lezyonun defekti sağ alanda: sol gözde nazal, sağ gözde temporal.
const B = {
  crao: (s) => yuk(s.LuN) && yuk(s.LaT) && dus(s.RuN) && dus(s.RaT),
  brao: (s) => yuk(s.LaN) && yuk(s.LaT) && dus(s.LuN) && dus(s.RaN),
  amd: (s) => yuk(s.Lm3) && dus(s.LuT) && dus(s.Rm),
  kesi: (s) => yuk(s.LuN) && yuk(s.LuT) && yuk(s.Lm) && dus(s.RuN) && dus(s.RuT) && dus(s.Rm),
  junction: (s) => yuk(s.Lm) && yuk(s.LuN) && yuk(s.RuT) && dus(s.RaN) && dus(s.RuN) && s.RuT > s.RaT + 0.3,
  adenom: (s) => yuk(s.LuT) && yuk(s.RuT) && dus(s.LuN) && dus(s.RuN) && s.LuT > s.LaT && s.RuT > s.RaT,
  kranio: (s) => yuk(s.LaT) && yuk(s.RaT) && dus(s.LuN) && dus(s.RuN) && s.LaT > s.LuT,
  arka: (s) => s.Lm > 0.3 && s.Rm > 0.3 && s.LuT < 0.45 && dus(s.LuN) && dus(s.RuN),
  binazal: (s) => yuk(s.LuN) && yuk(s.RuN) && yuk(s.LaN) && dus(s.LuT) && dus(s.RuT),
  traktus: (s) => yuk(s.LuN) && yuk(s.LaN) && yuk(s.RuT) && yuk(s.RaT) && dus(s.LuT) && dus(s.RuN),
  lgn_lat: (s) => s.LyN > s.LuN && s.RyT > s.RuT && yuk(s.LyN) && yuk(s.RyT) && dus(s.LuT),
  lgn_ant: (s) => s.LyN < s.LuN && s.RyT < s.RuT && s.LuN > 0.35 && s.LaN > 0.35,
  meyer: (s) => s.LuN > 0.35 && s.RuT > 0.35 && dus(s.LaN) && dus(s.RaT) && dus(s.Lm) && dus(s.LuT),
  parietal: (s) => s.LaN > 0.3 && s.RaT > 0.3 && dus(s.LuN) && dus(s.RuT) && dus(s.Lm3) && dus(s.LuT),
  genis: (s) => yuk(s.LuN) && yuk(s.LaN) && yuk(s.RuT) && yuk(s.RaT) && dus(s.LuT) && dus(s.RuN),
  pca: (s) => yuk(s.LuN) && yuk(s.LaN) && yuk(s.RuT) && yuk(s.RaT) && dus(s.Lm3) && dus(s.Rm3) && dus(s.LuT) && dus(s.RuN),
  kuneus: (s) => s.LaN > 0.4 && s.RaT > 0.4 && dus(s.LuN) && dus(s.RuT) && dus(s.LuT),
  lingual: (s) => s.LuN > 0.4 && s.RuT > 0.4 && dus(s.LaN) && dus(s.RaT) && dus(s.LuT),
  kutup: (s) => s.Lm > 0.3 && s.Rm > 0.3 && dus(s.LuN) && dus(s.RuT) && dus(s.LuT),
  hilal: (s) => s.Rhil > 0.5 && dus(s.Lm) && dus(s.Rm) && dus(s.RuT) && dus(s.LuN) && (s.Lhil ?? 0) < 0.1,
  bilateral: (s) => yuk(s.LuN) && yuk(s.LuT) && yuk(s.RuN) && yuk(s.RuT) && dus(s.Lm3),
};
const zit = { sol: 1 };
let hata = 0;
for (const p of PATOLOJI) {
  for (const h of p.tek ? [1, -1] : [1]) {
    const lz = {
      kureler: p.kureler ? p.kureler(h, 1) : null,
      alan: p.kureler ? null : p.alan?.(h),
    };
    const t = Date.now();
    const R = M.hesapla(lz);
    const ms = Date.now() - t;
    let s = ozet(R.D);
    const [dL, dR] = pupillaSurus(M, R.Dp);
    if (h === -1) { // aynalama denetimi: sağ lezyon sol lezyonun aynası olmalı
      const ayna = {};
      for (const k in s) ayna[(k[0] === 'L' ? 'R' : 'L') + k.slice(1)] = s[k];
      s = ayna;
    }
    const f = B[p.id];
    const gecti = f ? f(s) : null;
    if (f && !gecti) hata++;
    if (h === 1 || (f && !gecti)) {
      const kisa = ['Lm3', 'Lm', 'LuN', 'LaN', 'LuT', 'LaT', 'Rm3', 'Rm', 'RuN', 'RaN', 'RuT', 'RaT', 'LyN', 'RyT', 'Rhil'].map((k) => `${k}=${s[k] ?? '-'}`).join(' ');
      console.log(`${gecti === null ? '  ' : gecti ? 'OK' : 'XX'} ${p.id.padEnd(10)} h=${h} ${ms}ms puL=${dL.toFixed(2)} puR=${dR.toFixed(2)} ${kisa}`);
    }
  }
}
void zit;
// Konjügelik: traktusta iki göz ayrışmalı, V1'de ayrışmamalı
function fark(id) {
  const p = PATOLOJI.find((q) => q.id === id);
  const R = M.hesapla({ kureler: p.kureler(1, 1) });
  let top = 0, n = 0;
  HALKA.forEach((E, i) => {
    for (let j = 0; j < ACI_N; j++) {
      const q = (j + 0.5) / ACI_N * 2 * Math.PI;
      const x = E * Math.cos(q), y = E * Math.sin(q);
      if (x <= 0 || E > 58) continue; // sağ hemialan, binoküler bölge
      void y;
      top += Math.abs(R.D[i * ACI_N + j] - R.D[M.lifN + i * ACI_N + j]); n++;
    }
  });
  return top / n;
}
for (const id of ['traktus', 'genis', 'pca', 'kuneus']) console.log('göz farkı', id, fark(id).toFixed(3));
console.log(hata ? `HATA: ${hata}` : 'TAMAM');
process.exit(hata ? 1 : 0);
