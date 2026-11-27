// Sky Reach — height above the nearest river, a raised river, connected flooding, scored against satellite water; run on any terrain grid.
//   1. a height map of the land (here: Copernicus GLO-30, a surface model: roofs and trees read as ground)
//   2. the river cells (here: OSM water connected to the Mekong / Tonle Sap / Bassac)
//   3. height above nearest river (HAR): land height minus the river surface at the nearest river cell
//   4. raise the river by a chosen amount: a land cell floods when its HAR is below the rise and it
//      connects to the river through other flooded cells (4-neighbour)
//   5. score against satellite water: intersection over union, river and permanent water left out
// It leaves out rain on the land, dikes, drains, pumps, timing and duration: it shows the ground the
// river could reach. Scores from sweep() are fitted (the best rise is picked after seeing the answer).
//
// prepare() also computes, for every cell, the smallest rise that floods it (a minimax "priority
// flood" from the river). flood() then reads that level, which gives the same cells as an explicit
// connected fill (floodBFS, kept for tests) in O(cells).

const b64bytes = s => {
  if (typeof atob === 'function') { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  return new Uint8Array(Buffer.from(s, 'base64'));
};

// data/terrain.json → typed arrays. z in metres (Float32), occ 0..100 / 255, water 0 / 1 river / 2 other.
export function decodeTerrain(json) {
  if (typeof json.z !== 'string') return json;
  const zb = b64bytes(json.z);
  const z16 = new Int16Array(zb.buffer, zb.byteOffset, zb.byteLength / 2);
  const z = new Float32Array(z16.length);
  for (let i = 0; i < z.length; i++) z[i] = z16[i] / 10;
  return {
    grid: json.grid, w: json.grid.w, h: json.grid.h, cellKm2: json.grid.cellKm2,
    origin: json.origin, kx: json.kx, ky: json.ky, credits: json.credits,
    z, occ: b64bytes(json.occ), water: b64bytes(json.water),
  };
}

// River surface (the surface model is noisy over water): median of river-cell heights in blocks of B×B cells, empty blocks filled from
// their nearest filled neighbour, then read bilinearly between block centres.
function riverSurface(t, B) {
  const { w: W, h: H, z, water } = t;
  const bw = Math.ceil(W / B), bh = Math.ceil(H / B);
  const med = new Float32Array(bw * bh).fill(NaN);
  const bins = Array.from({ length: bw * bh }, () => []);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c;
    if (water[i] === 1) bins[((r / B) | 0) * bw + ((c / B) | 0)].push(z[i]);
  }
  for (let k = 0; k < bins.length; k++) {
    const v = bins[k];
    if (v.length >= Math.min(8, B * B / 4)) { v.sort((a, b) => a - b); med[k] = v[v.length >> 1]; }
  }
  // fill empty blocks by repeated dilation (average of filled 8-neighbours)
  let empty = med.reduce((n, v) => n + (Number.isNaN(v) ? 1 : 0), 0);
  if (empty === med.length) return null;
  while (empty > 0) {
    const next = med.slice();
    for (let br = 0; br < bh; br++) for (let bc = 0; bc < bw; bc++) {
      const k = br * bw + bc;
      if (!Number.isNaN(med[k])) continue;
      let s = 0, n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = br + dr, cc = bc + dc;
        if (rr < 0 || cc < 0 || rr >= bh || cc >= bw) continue;
        const v = med[rr * bw + cc];
        if (!Number.isNaN(v)) { s += v; n++; }
      }
      if (n) { next[k] = s / n; empty--; }
    }
    med.set(next);
  }
  const at = (r, c) => {
    const fy = Math.min(bh - 1, Math.max(0, (r + 0.5) / B - 0.5)), fx = Math.min(bw - 1, Math.max(0, (c + 0.5) / B - 0.5));
    const y0 = Math.floor(fy), x0 = Math.floor(fx), y1 = Math.min(bh - 1, y0 + 1), x1 = Math.min(bw - 1, x0 + 1);
    const ty = fy - y0, tx = fx - x0;
    return (med[y0 * bw + x0] * (1 - tx) + med[y0 * bw + x1] * tx) * (1 - ty) + (med[y1 * bw + x0] * (1 - tx) + med[y1 * bw + x1] * tx) * ty;
  };
  return at;
}

export function prepare(terrainIn, { block = 16 } = {}) {
  const t = decodeTerrain(terrainIn);
  const { w: W, h: H, z, water } = t;
  const N = W * H;
  const river = new Uint8Array(N);
  let nRiver = 0;
  for (let i = 0; i < N; i++) if (water[i] === 1) { river[i] = 1; nRiver++; }
  const surfAt = riverSurface(t, Math.max(1, Math.min(block, W, H)));
  const surf = new Float32Array(N);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) surf[r * W + c] = surfAt ? surfAt(r, c) : 0;

  // nearest river cell: two-pass 3-4 chamfer distance transform with label propagation
  const INF = 1e9;
  const dist = new Float64Array(N).fill(INF);
  const near = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (river[i]) { dist[i] = 0; near[i] = i; }
  const relax = (i, j, wgt) => { const d = dist[j] + wgt; if (d < dist[i]) { dist[i] = d; near[i] = near[j]; } };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c;
    if (r > 0) { relax(i, i - W, 3); if (c > 0) relax(i, i - W - 1, 4); if (c < W - 1) relax(i, i - W + 1, 4); }
    if (c > 0) relax(i, i - 1, 3);
  }
  for (let r = H - 1; r >= 0; r--) for (let c = W - 1; c >= 0; c--) {
    const i = r * W + c;
    if (r < H - 1) { relax(i, i + W, 3); if (c < W - 1) relax(i, i + W + 1, 4); if (c > 0) relax(i, i + W - 1, 4); }
    if (c < W - 1) relax(i, i + 1, 3);
  }
  const har = new Float32Array(N);
  for (let i = 0; i < N; i++) har[i] = near[i] >= 0 ? z[i] - surf[near[i]] : Infinity;

  // smallest rise that floods each land cell: minimax HAR along any 4-neighbour path from the river
  const level = new Float32Array(N).fill(Infinity);
  const cap = 4 * N + 4;
  const hk = new Float32Array(cap), hv = new Int32Array(cap);
  let hn = 0;
  const push = (k, v) => {
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
    hk[i] = k; hv[i] = v;
  };
  const pop = () => {
    const v = hv[0], k = hk[0];
    const lk = hk[--hn], lv = hv[hn];
    let i = 0;
    for (;;) {
      let m = 2 * i + 1;
      if (m >= hn) break;
      if (m + 1 < hn && hk[m + 1] < hk[m]) m++;
      if (hk[m] >= lk) break;
      hk[i] = hk[m]; hv[i] = hv[m]; i = m;
    }
    hk[i] = lk; hv[i] = lv;
    popped.k = k; return v;
  };
  const popped = { k: 0 };
  const done = new Uint8Array(N);
  const nbrs = (i, f) => {
    const r = (i / W) | 0, c = i - r * W;
    if (r > 0) f(i - W); if (r < H - 1) f(i + W); if (c > 0) f(i - 1); if (c < W - 1) f(i + 1);
  };
  for (let i = 0; i < N; i++) if (river[i]) { done[i] = 1; level[i] = -Infinity; }
  for (let i = 0; i < N; i++) if (river[i]) nbrs(i, j => { if (!river[j]) push(har[j], j); });
  while (hn > 0) {
    const i = pop(), k = popped.k;
    if (done[i]) continue;
    done[i] = 1; level[i] = k;
    nbrs(i, j => { if (!done[j]) push(Math.max(k, har[j]), j); });
  }
  return { t, w: W, h: H, N, river, nRiver, surf, near, har, level, cellKm2: t.cellKm2 ?? 0 };
}

// Flooded land cells (1) for a river rise in metres.
export function flood(prep, rise, out) {
  const m = out || new Uint8Array(prep.N);
  const { level, river } = prep;
  for (let i = 0; i < prep.N; i++) m[i] = !river[i] && level[i] < rise ? 1 : 0;
  return m;
}

// Explicit connected fill from the river (reference implementation; same result as flood()).
export function floodBFS(prep, rise) {
  const { w: W, h: H, N, river, har } = prep;
  const m = new Uint8Array(N), seen = new Uint8Array(N), q = new Int32Array(N);
  let head = 0, tail = 0;
  for (let i = 0; i < N; i++) if (river[i]) { seen[i] = 1; q[tail++] = i; }
  while (head < tail) {
    const i = q[head++], r = (i / W) | 0, c = i - r * W;
    const visit = j => { if (!seen[j] && har[j] < rise) { seen[j] = 1; m[j] = 1; q[tail++] = j; } };
    if (r > 0) visit(i - W); if (r < H - 1) visit(i + W); if (c > 0) visit(i - 1); if (c < W - 1) visit(i + 1);
  }
  return m;
}

// Cells that count: not mapped water, not permanent satellite water (≥ 90%), not "no data".
const counted = (t, i) => t.water[i] === 0 && t.occ[i] !== 255 && t.occ[i] < 90;
const wetIn = (target, o) => (target === 'p10' ? o >= 10 : o > 0);

// Match score (intersection over union) of a flooded mask against satellite water.
// target 'once' = water seen at least once 1984–2021; 'p10' = water in 10% or more of clear views.
export function score(prep, mask, target = 'once') {
  const t = prep.t, k = prep.cellKm2;
  let both = 0, modelOnly = 0, satOnly = 0, nIncl = 0, nSat = 0, nModel = 0;
  for (let i = 0; i < prep.N; i++) {
    if (!counted(t, i)) continue;
    nIncl++;
    const s = wetIn(target, t.occ[i]), m = mask[i] === 1;
    if (s) nSat++;
    if (m) nModel++;
    if (s && m) both++; else if (m) modelOnly++; else if (s) satOnly++;
  }
  const union = both + modelOnly + satOnly;
  return {
    target,
    score: union ? both / union : 0,
    baseline: nIncl ? nSat / nIncl : 0, // "flood everything": every counted cell called water
    found: nSat ? both / nSat : 0, // share of satellite water the model floods
    notInRecord: nModel ? modelOnly / nModel : 0, // share of model water the record never saw
    km2: { both: both * k, modelOnly: modelOnly * k, satOnly: satOnly * k, model: nModel * k, satellite: nSat * k, counted: nIncl * k },
    cells: { both, modelOnly, satOnly, counted: nIncl, satellite: nSat, model: nModel },
  };
}

export function sweep(prep, target = 'once', rises) {
  rises = rises || Array.from({ length: 33 }, (_, i) => i * 0.25);
  const m = new Uint8Array(prep.N);
  const rows = rises.map(rise => { flood(prep, rise, m); const s = score(prep, m, target); return { rise, score: s.score, floodedKm2: s.km2.model }; });
  const best = rows.reduce((a, b) => (b.score > a.score ? b : a), rows[0]);
  return { target, rows, best, baseline: score(prep, m, target).baseline };
}

export function cellAt(prep, x, y) {
  const t = prep.t, g = t.grid;
  const lon = t.origin.lon + x / t.kx, lat = t.origin.lat + y / t.ky;
  const c = Math.floor((lon - g.west) / (g.east - g.west) * g.w), r = Math.floor((g.north - lat) / (g.north - g.south) * g.h);
  return r >= 0 && c >= 0 && r < g.h && c < g.w ? r * g.w + c : -1;
}

// The core streets (phnom-penh importers/core_osm.py) are every OSM highway inside this box, so inside it
// the major/minor roads are not counted again.
const CORE = { west: 104.875, east: 104.95, south: 11.515, north: 11.605 };

// Kilometres of mapped street whose sample points (every ~10 m) fall in flooded cells.
export function streetsUnder(prep, mask, geo, step = 10) {
  const t = prep.t;
  const inCore = (x, y) => { const lon = t.origin.lon + x / t.kx, lat = t.origin.lat + y / t.ky; return lon >= CORE.west && lon <= CORE.east && lat >= CORE.south && lat <= CORE.north; };
  let wet = 0, total = 0;
  const run = (paths, coreOnly) => {
    for (const p of paths) for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      const L = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(L / step));
      for (let s = 0; s < n; s++) {
        const f = (s + 0.5) / n, x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
        const core = inCore(x, y);
        if (coreOnly !== core) continue;
        const cell = cellAt(prep, x, y);
        if (cell < 0) continue;
        total += L / n;
        if (mask[cell]) wet += L / n;
      }
    }
  };
  run(geo.streets || [], true);
  run(geo.major || [], false);
  run(geo.minor || [], false);
  return { km: wet / 1000, totalKm: total / 1000 };
}

// Height above the nearest river at a local-metre point (NaN outside the grid).
export function harAt(prep, x, y) {
  const i = cellAt(prep, x, y);
  return i < 0 ? NaN : prep.har[i];
}
