// 3B yüzey üretimi (Web Worker): etiket hacminden her yapı için üçgen ağı çıkarır.
// Yöntem: hacmi k'lı bloklarla seyrelt, her etiket için Surface Nets (tablo gerektirmez), ardından Taubin yumuşatma.
// Giriş : { lab: ArrayBuffer (uint8, [z][y][x]), dims: [nx, ny, nz], hedef: hedef hücre sayısı }
// Çıkış : { tip: 'ilerleme', yuzde } ve { tip: 'bitti', k, ag: [{ id, pos: Float32Array (voksel x,y,z), idx: Uint32Array }] }
// Konumlar voksel indeksi cinsindendir (hacim [z][y][x] sırasıyla); dünyaya çevirme ana iş parçacığında yapılır.

// Küp köşeleri ve 12 kenarı
const KOSE = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const KENAR = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

self.onmessage = (e) => {
  const { dims, hedef } = e.data;
  const lab = new Uint8Array(e.data.lab);
  const [nx, ny, nz] = dims;
  const k = Math.max(2, Math.round(Math.cbrt((nx * ny * nz) / (hedef || 1.5e6))));
  const gx = Math.ceil(nx / k), gy = Math.ceil(ny / k), gz = Math.ceil(nz / k);

  // 1) Seyrelt: blok başına tek etiket (orta vokselin etiketi, yoksa bloktaki ilk sıfır olmayan)
  const G = new Uint8Array(gx * gy * gz);
  const bb = new Int32Array(256 * 6);
  const say = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { bb[i * 6] = 1e9; bb[i * 6 + 1] = -1; bb[i * 6 + 2] = 1e9; bb[i * 6 + 3] = -1; bb[i * 6 + 4] = 1e9; bb[i * 6 + 5] = -1; }
  const yarim = k >> 1;
  for (let bz = 0; bz < gz; bz++) {
    for (let by = 0; by < gy; by++) {
      for (let bx = 0; bx < gx; bx++) {
        const cx = Math.min(nx - 1, bx * k + yarim), cy = Math.min(ny - 1, by * k + yarim), cz = Math.min(nz - 1, bz * k + yarim);
        let l = lab[(cz * ny + cy) * nx + cx];
        if (!l) {
          const x1 = Math.min(nx, bx * k + k), y1 = Math.min(ny, by * k + k), z1 = Math.min(nz, bz * k + k);
          for (let z = bz * k; z < z1 && !l; z++) for (let y = by * k; y < y1 && !l; y++) for (let x = bx * k; x < x1; x++) { const q = lab[(z * ny + y) * nx + x]; if (q) { l = q; break; } }
        }
        if (l) {
          G[(bz * gy + by) * gx + bx] = l;
          say[l]++;
          const o = l * 6;
          if (bx < bb[o]) bb[o] = bx; if (bx > bb[o + 1]) bb[o + 1] = bx;
          if (by < bb[o + 2]) bb[o + 2] = by; if (by > bb[o + 3]) bb[o + 3] = by;
          if (bz < bb[o + 4]) bb[o + 4] = bz; if (bz > bb[o + 5]) bb[o + 5] = bz;
        }
      }
    }
    if (bz % 8 === 0) self.postMessage({ tip: 'ilerleme', yuzde: Math.round((bz / gz) * 30) });
  }

  // 2) Her etiket için Surface Nets
  const etiketler = [];
  for (let l = 1; l < 256; l++) if (say[l] >= 6) etiketler.push(l);
  const ag = [];
  etiketler.forEach((l, sira) => {
    const m = yuzeyAgi(G, gx, gy, gz, l, bb.subarray(l * 6, l * 6 + 6), k);
    if (m) ag.push({ id: l, pos: m.pos, idx: m.idx });
    self.postMessage({ tip: 'ilerleme', yuzde: 30 + Math.round(((sira + 1) / etiketler.length) * 70) });
  });
  const aktar = [];
  for (const m of ag) aktar.push(m.pos.buffer, m.idx.buffer);
  self.postMessage({ tip: 'bitti', k, ag }, aktar);
};

function yuzeyAgi(G, gx, gy, gz, L, kutu, k) {
  const X0 = kutu[0] - 1, Y0 = kutu[2] - 1, Z0 = kutu[4] - 1;
  const sx = kutu[1] - kutu[0] + 3, sy = kutu[3] - kutu[2] + 3, sz = kutu[5] - kutu[4] + 3;
  const ic = (x, y, z) => {
    const a = x + X0, b = y + Y0, c = z + Z0;
    return a < 0 || b < 0 || c < 0 || a >= gx || b >= gy || c >= gz ? 0 : (G[(c * gy + b) * gx + a] === L ? 1 : 0);
  };
  const hucre = new Int32Array(sx * sy * sz).fill(-1);
  const pos = [];
  const v = new Uint8Array(8);
  for (let z = 0; z < sz - 1; z++) {
    for (let y = 0; y < sy - 1; y++) {
      for (let x = 0; x < sx - 1; x++) {
        let toplam = 0;
        for (let c = 0; c < 8; c++) { v[c] = ic(x + KOSE[c][0], y + KOSE[c][1], z + KOSE[c][2]); toplam += v[c]; }
        if (toplam === 0 || toplam === 8) continue;
        let ex = 0, ey = 0, ez = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = KENAR[e][0], b = KENAR[e][1];
          if (v[a] !== v[b]) {
            ex += (KOSE[a][0] + KOSE[b][0]) / 2; ey += (KOSE[a][1] + KOSE[b][1]) / 2; ez += (KOSE[a][2] + KOSE[b][2]) / 2; n++;
          }
        }
        hucre[(z * sy + y) * sx + x] = pos.length / 3;
        // hücre uzayı → voksel indeksi (blok merkezi)
        pos.push(((X0 + x + ex / n) * k) + (k - 1) / 2, ((Y0 + y + ey / n) * k) + (k - 1) / 2, ((Z0 + z + ez / n) * k) + (k - 1) / 2);
      }
    }
  }
  if (!pos.length) return null;
  const idx = [];
  const hid = (x, y, z) => hucre[(z * sy + y) * sx + x];
  const dortgen = (a, b, c, d, ters) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (ters) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const a = ic(x, y, z);
        if (x < sx - 1 && y > 0 && z > 0 && a !== ic(x + 1, y, z)) dortgen(hid(x, y - 1, z - 1), hid(x, y, z - 1), hid(x, y, z), hid(x, y - 1, z), !a);
        if (y < sy - 1 && x > 0 && z > 0 && a !== ic(x, y + 1, z)) dortgen(hid(x - 1, y, z - 1), hid(x, y, z - 1), hid(x, y, z), hid(x - 1, y, z), !a);
        if (z < sz - 1 && x > 0 && y > 0 && a !== ic(x, y, z + 1)) dortgen(hid(x - 1, y - 1, z), hid(x, y - 1, z), hid(x, y, z), hid(x - 1, y, z), !a);
      }
    }
  }
  if (!idx.length) return null;

  // Taubin yumuşatma: komşu ortalamasına doğru (+λ) ve geri (−μ) adımlar sırayla; basamakları siler, yapıyı küçültmez
  const n = pos.length / 3;
  let p = Float32Array.from(pos);
  const toplam = new Float32Array(n * 3), say = new Uint16Array(n);
  for (let tur = 0; tur < 12; tur++) {
    const f = tur % 2 === 0 ? 0.6 : -0.64;
    toplam.fill(0); say.fill(0);
    for (let t = 0; t < idx.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = idx[t + e], b = idx[t + (e + 1) % 3];
        toplam[a * 3] += p[b * 3]; toplam[a * 3 + 1] += p[b * 3 + 1]; toplam[a * 3 + 2] += p[b * 3 + 2]; say[a]++;
        toplam[b * 3] += p[a * 3]; toplam[b * 3 + 1] += p[a * 3 + 1]; toplam[b * 3 + 2] += p[a * 3 + 2]; say[b]++;
      }
    }
    const yeni = new Float32Array(p);
    for (let i = 0; i < n; i++) {
      if (!say[i]) continue;
      for (let c = 0; c < 3; c++) yeni[i * 3 + c] = p[i * 3 + c] + f * (toplam[i * 3 + c] / say[i] - p[i * 3 + c]);
    }
    p = yeni;
  }
  return { pos: p, idx: Uint32Array.from(idx) };
}
