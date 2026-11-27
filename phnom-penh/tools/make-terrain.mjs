// One terrain grid for Sky Reach: the Copernicus GLO-30 DSM window (540 × 432, row 0 = north),
// with JRC Global Surface Water occurrence resampled onto it (nearest) and OSM water rasterized
// onto it (nonzero fill, cell centres). Writes data/terrain.json.
//
// Arrays are little-endian, base64:
//   z    Int16  surface height, decimetres
//   occ  Uint8  satellite water occurrence 1984–2021, 0..100; 255 = no data
//   water Uint8 1 = river (the connected Mekong / Tonle Sap / Bassac water), 2 = other mapped water
// Decode with decodeTerrain() in src/kernels/skyreach.js.
import { readFileSync, writeFileSync } from 'node:fs';

const rd = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const dem = rd('../data/raw/dem.json');
const gsw = rd('../data/raw/gsw.json');
const geo = rd('../data/geo.json');
const { w: W, h: H } = dem;
const N = W * H;
const dLon = (dem.east - dem.west) / W, dLat = (dem.north - dem.south) / H;

// 1. elevation, decimetres
const z = new Int16Array(N);
for (let i = 0; i < N; i++) z[i] = Math.round(dem.z[i] * 10);

// 2. satellite water occurrence, nearest GSW pixel to each DEM cell centre
const occ = new Uint8Array(N);
for (let r = 0; r < H; r++) {
  const lat = dem.north - (r + 0.5) * dLat;
  const gr = Math.min(gsw.h - 1, Math.max(0, Math.floor((gsw.north - lat) / (gsw.north - gsw.south) * gsw.h)));
  for (let c = 0; c < W; c++) {
    const lon = dem.west + (c + 0.5) * dLon;
    const gc = Math.min(gsw.w - 1, Math.max(0, Math.floor((lon - gsw.west) / (gsw.east - gsw.west) * gsw.w)));
    const v = gsw.occ[gr * gsw.w + gc];
    occ[r * W + c] = v > 100 ? 255 : v;
  }
}

// 3. OSM water rings → cells, nonzero winding at each cell centre (scanline)
const { kx, ky, origin } = geo;
const colX = c => (dem.west + (c + 0.5) * dLon - origin.lon) * kx; // cell centre, local metres
const rowY = r => (dem.north - (r + 0.5) * dLat - origin.lat) * ky;
const x0 = colX(0), dx = colX(1) - colX(0);
const inWater = new Uint8Array(N);
const edges = [];
for (const ring of geo.water) {
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i], ay = ring[2 * i + 1], bx = ring[2 * j], by = ring[2 * j + 1];
    if (ay === by) continue;
    edges.push(ay < by ? [ay, by, ax, bx, 1] : [by, ay, bx, ax, -1]); // [ylo, yhi, x at ylo, x at yhi, winding]
  }
}
edges.sort((a, b) => a[0] - b[0]);
for (let r = 0; r < H; r++) {
  const y = rowY(r);
  const xs = [];
  for (const [ylo, yhi, xlo, xhi, wd] of edges) {
    if (ylo > y) break;
    if (y >= yhi) continue;
    xs.push([xlo + (y - ylo) / (yhi - ylo) * (xhi - xlo), wd]);
  }
  xs.sort((a, b) => a[0] - b[0]);
  let wind = 0;
  for (let k = 0; k < xs.length - 1; k++) {
    wind += xs[k][1];
    if (wind === 0) continue;
    const c0 = Math.max(0, Math.ceil((xs[k][0] - x0) / dx)), c1 = Math.min(W - 1, Math.floor((xs[k + 1][0] - x0) / dx));
    for (let c = c0; c <= c1; c++) inWater[r * W + c] = 1;
  }
}

// 4. river = the largest 4-connected water component (the confluence joins Mekong, Tonle Sap and Bassac),
// plus any component of 1 km² or more that touches the window edge (river reaches cut by the window).
const comp = new Int32Array(N).fill(-1);
const sizes = [], touchesEdge = [];
const q = new Int32Array(N);
for (let s = 0; s < N; s++) {
  if (!inWater[s] || comp[s] >= 0) continue;
  const id = sizes.length;
  let head = 0, tail = 0, edge = false;
  q[tail++] = s; comp[s] = id;
  while (head < tail) {
    const i = q[head++], r = (i / W) | 0, c = i - r * W;
    if (r === 0 || c === 0 || r === H - 1 || c === W - 1) edge = true;
    const nb = [r > 0 ? i - W : -1, r < H - 1 ? i + W : -1, c > 0 ? i - 1 : -1, c < W - 1 ? i + 1 : -1];
    for (const j of nb) if (j >= 0 && inWater[j] && comp[j] < 0) { comp[j] = id; q[tail++] = j; }
  }
  sizes.push(tail); touchesEdge.push(edge);
}
const biggest = sizes.indexOf(Math.max(...sizes));
const cellKm2 = (dLon * kx) * (dLat * ky) / 1e6;
const isRiver = sizes.map((s, id) => id === biggest || (touchesEdge[id] && s * cellKm2 >= 1));
const water = new Uint8Array(N);
for (let i = 0; i < N; i++) if (inWater[i]) water[i] = isRiver[comp[i]] ? 1 : 2;

const b64 = ta => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
const out = {
  grid: { west: dem.west, south: dem.south, east: dem.east, north: dem.north, w: W, h: H, rowOrder: 'row 0 = north', cellKm2 },
  origin, kx, ky,
  encoding: 'base64 little-endian: z Int16 decimetres; occ Uint8 0..100 (255 = no data); water Uint8 (1 river, 2 other water)',
  credits: {
    dem: dem.credit + ' — ' + dem.kind,
    gsw: gsw.credit,
    osm: geo.credit,
  },
  sources: { dem: dem.source, gsw: gsw.source, osm: geo.source },
  z: b64(z), occ: b64(occ), water: b64(water),
};
writeFileSync(new URL('../data/terrain.json', import.meta.url), JSON.stringify(out));
const nRiver = water.reduce((a, v) => a + (v === 1), 0), nOther = water.reduce((a, v) => a + (v === 2), 0);
console.log('terrain', W, 'x', H, 'river cells', nRiver, `(${(nRiver * cellKm2).toFixed(1)} km²)`, 'other water', nOther,
  'components', sizes.length, 'river components', isRiver.filter(Boolean).length, 'bytes', JSON.stringify(out).length);
