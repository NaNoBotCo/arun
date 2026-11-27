import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare, flood, floodBFS, score, sweep, streetsUnder, decodeTerrain, harAt } from '../../src/kernels/skyreach.js';

// A decoded terrain grid built from functions of (row, col).
function grid(w, h, zf, { water = () => 0, occ = () => 0 } = {}) {
  const N = w * h, z = new Float32Array(N), wa = new Uint8Array(N), oc = new Uint8Array(N);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const i = r * w + c; z[i] = zf(r, c); wa[i] = water(r, c); oc[i] = occ(r, c); }
  return { w, h, z, water: wa, occ: oc, cellKm2: 1, grid: { west: 0, east: w, south: 0, north: h, w, h }, origin: { lon: 0, lat: 0 }, kx: 1, ky: 1 };
}
const count = m => m.reduce((a, v) => a + v, 0);

test('valley: land rising 1 m per cell from a river column floods the cells below the rise', () => {
  const t = grid(10, 4, (r, c) => c, { water: (r, c) => (c === 0 ? 1 : 0) });
  const p = prepare(t, { block: 2 });
  assert.equal(p.har[1], 1);
  assert.equal(p.har[5], 5);
  const m = flood(p, 3.5);
  assert.equal(count(m), 3 * 4); // columns 1, 2, 3
  for (let r = 0; r < 4; r++) { assert.equal(m[r * 10 + 3], 1); assert.equal(m[r * 10 + 4], 0); assert.equal(m[r * 10], 0); }
  assert.equal(count(flood(p, 1)), 0); // har 1 is not below a rise of 1
});

test('a pit behind a ridge stays dry until the river tops the ridge', () => {
  // river at column 0 (height 0); land 2 m; ridge 10 m at column 5; pit 0.5 m at columns 7–8
  const zf = (r, c) => (c === 0 ? 0 : c === 5 ? 10 : c === 7 || c === 8 ? 0.5 : 2);
  const t = grid(10, 5, zf, { water: (r, c) => (c === 0 ? 1 : 0) });
  const p = prepare(t, { block: 1 });
  const m3 = flood(p, 3);
  for (let r = 0; r < 5; r++) { assert.equal(m3[r * 10 + 2], 1); assert.equal(m3[r * 10 + 7], 0, 'pit is not connected'); }
  const m11 = flood(p, 11);
  for (let r = 0; r < 5; r++) assert.equal(m11[r * 10 + 7], 1);
  assert.equal(p.level[7], 10); // smallest rise that reaches the pit is the ridge height
});

test('flooded area never shrinks as the river rises', () => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const t = grid(30, 30, (r, c) => (c < 2 ? 0 : 1 + rnd() * 8), { water: (r, c) => (c < 2 ? 1 : 0) });
  const p = prepare(t, { block: 4 });
  let prev = -1;
  for (let rise = 0; rise <= 10; rise += 0.25) { const n = count(flood(p, rise)); assert.ok(n >= prev); prev = n; }
});

test('flood() equals the explicit connected fill', () => {
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const t = grid(40, 25, (r, c) => (r === 0 ? 0 : rnd() * 6), { water: (r) => (r === 0 ? 1 : 0) });
  const p = prepare(t, { block: 5 });
  for (const rise of [0, 0.5, 1.7, 3, 4.4, 6.1]) assert.deepEqual(flood(p, rise), floodBFS(p, rise));
});

test('match score is intersection over union, river and permanent water left out', () => {
  // 1 row × 14 cells: cell 0 river, cell 1 permanent (occ 95), cell 2 no data, cells 3..12 counted, 13 other mapped water
  const occ = [0, 95, 255, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0];
  const water = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2];
  const t = grid(14, 1, () => 0, { water: (r, c) => water[c], occ: (r, c) => occ[c] });
  const p = prepare(t, { block: 1 });
  const mask = new Uint8Array(14);
  for (const c of [1, 2, 5, 6, 7, 8, 13]) mask[c] = 1; // 1, 2, 13 do not count; 5,6,7 hit; 8 model only
  const s = score(p, mask, 'once');
  assert.equal(s.cells.counted, 10);
  assert.equal(s.cells.satellite, 5);
  assert.equal(s.cells.both, 3);
  assert.equal(s.cells.modelOnly, 1);
  assert.equal(s.cells.satOnly, 2);
  assert.equal(s.score, 3 / 6);
  assert.equal(s.baseline, 5 / 10);
  assert.equal(s.found, 3 / 5);
  assert.equal(s.notInRecord, 1 / 4);
  const p10 = score(p, mask, 'p10');
  assert.equal(p10.cells.satellite, 5);
});

test('streetsUnder sums street length over flooded cells', () => {
  const t = grid(10, 10, () => 0, { water: (r, c) => (c === 0 ? 1 : 0) });
  t.grid = { west: 0, east: 10, south: 0, north: 10, w: 10, h: 10 };
  const p = prepare(t, { block: 2 });
  const mask = new Uint8Array(100);
  for (let r = 0; r < 10; r++) for (let c = 0; c < 5; c++) mask[r * 10 + c] = 1;
  // origin (0,0), kx = ky = 1: one local metre = one degree = one cell. A street along y = 5.5 from x 0 to 10.
  const geo = { streets: [], major: [[0, 5.5, 10, 5.5]], minor: [] };
  const s = streetsUnder(p, mask, geo, 0.5);
  assert.ok(Math.abs(s.totalKm - 0.010) < 1e-9);
  assert.ok(Math.abs(s.km - 0.005) < 1e-9);
});

test('Phnom Penh: Sky Reach on GLO-30, OSM river, satellite water 1984–2021', t => {
  const json = JSON.parse(readFileSync(new URL('../../data/terrain.json', import.meta.url)));
  const geo = JSON.parse(readFileSync(new URL('../../data/geo.json', import.meta.url)));
  let t0 = performance.now();
  const p = prepare(json);
  const prepMs = performance.now() - t0;
  assert.equal(p.N, 540 * 432);
  assert.ok(p.nRiver > 10000);
  for (const rise of [1, 4, 8, 11.5]) assert.deepEqual(flood(p, rise), floodBFS(p, rise));
  t0 = performance.now();
  for (let k = 0; k < 40; k++) flood(p, k * 0.25);
  const floodMs = (performance.now() - t0) / 40;
  const lines = [`prepare ${prepMs.toFixed(0)} ms · flood() ${floodMs.toFixed(2)} ms`];
  for (const target of ['once', 'p10']) {
    const s = sweep(p, target);
    const m = flood(p, s.best.rise);
    const sc = score(p, m, target);
    const st = streetsUnder(p, m, geo);
    lines.push(`${target}: best rise ${s.best.rise} m, score ${s.best.score.toFixed(3)} (flood everything ${s.baseline.toFixed(3)}), flooded ${sc.km2.model.toFixed(1)} km², found ${(sc.found * 100).toFixed(0)}% of satellite water, streets under ${st.km.toFixed(1)} of ${st.totalKm.toFixed(0)} km`);
    const wide = sweep(p, target, Array.from({ length: 29 }, (_, i) => i * 0.5));
    const wm = flood(p, wide.best.rise), wsc = score(p, wm, target), wst = streetsUnder(p, wm, geo);
    lines.push(`${target} 0–14 m: best rise ${wide.best.rise} m, score ${wide.best.score.toFixed(3)}, flooded ${wsc.km2.model.toFixed(1)} km², streets under ${wst.km.toFixed(1)} km`);
    const rows = s.rows.map(r => r.floodedKm2);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i] >= rows[i - 1]);
  }
  const river = []; for (let i = 0; i < p.N; i++) if (p.river[i]) river.push(p.surf[i]);
  river.sort((a, b) => a - b);
  lines.push(`river surface (GLO-30 over mapped river) median ${river[river.length >> 1].toFixed(2)} m; HAR at Royal Palace ${harAt(p, (104.931119 - 104.93) * json.kx, (11.563681 - 11.56) * json.ky).toFixed(1)} m`);
  for (const l of lines) { t.diagnostic(l); console.log(l); }
  assert.ok(prepMs < 2000);
  assert.ok(floodMs < 30);
});

test('decodeTerrain passes decoded grids through', () => {
  const t = grid(2, 2, () => 1);
  assert.equal(decodeTerrain(t), t);
});
