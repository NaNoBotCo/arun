// Drawing for #wonder: the same E02 region and water depths as the lab, in a brighter palette.
// Floodplain paddies with bunds, emerald forest, dry hilltops, a clay-roofed town, sandbanks, deep water.

const cache = new WeakMap();

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

const PADDY = [126, 205, 74];
const PADDY_WET = [88, 182, 150];
const FOREST = [20, 104, 62];
const HILL = [132, 128, 84];
const TOWN = [206, 122, 84];
const ROAD = [236, 214, 176];
const SAND = [226, 200, 142];

// Deterministic per-plot tint, so neighbouring paddies differ a little.
function plotHash(a, b) {
  let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000;
}

export function vividTerrain(region) {
  if (cache.has(region)) return cache.get(region);
  const { N, z, urban, farm, forest, channel } = region;
  const K = 4;
  const M = N * K;
  const c = document.createElement('canvas');
  c.width = M;
  c.height = M;
  const g = c.getContext('2d');
  const img = g.createImageData(M, M);
  const bil = (arr, fx, fy) => {
    const x0 = Math.min(N - 2, Math.max(0, Math.floor(fx))), y0 = Math.min(N - 2, Math.max(0, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const a = arr[y0 * N + x0], b = arr[y0 * N + x0 + 1], cc = arr[(y0 + 1) * N + x0], d = arr[(y0 + 1) * N + x0 + 1];
    return a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty;
  };
  let zmin = Infinity, zmax = -Infinity;
  for (const v of z) {
    if (v < zmin) zmin = v;
    if (v > zmax) zmax = v;
  }
  const zs = new Float32Array(M * M);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) zs[y * M + x] = bil(z, (x + 0.5) / K - 0.5, (y + 0.5) / K - 0.5);
  const dx = region.cellSize_m / K;
  for (let y = 0; y < M; y++)
    for (let x = 0; x < M; x++) {
      const i = y * M + x;
      const fx = (x + 0.5) / K - 0.5, fy = (y + 0.5) / K - 0.5;
      const zl = zs[y * M + Math.max(0, x - 1)], zr = zs[y * M + Math.min(M - 1, x + 1)];
      const zu = zs[Math.max(0, y - 1) * M + x], zd = zs[Math.min(M - 1, y + 1) * M + x];
      const nx = (-(zr - zl) / (2 * dx)) * 5, ny = (-(zd - zu) / (2 * dx)) * 5;
      const len = Math.hypot(nx, ny, 1);
      const shade = Math.max(0, (nx * -0.6 + ny * -0.55 + 0.6) / len);
      const e = (zs[i] - zmin) / (zmax - zmin || 1);
      const fo = bil(forest, fx, fy), fa = bil(farm, fx, fy), ur = bil(urban, fx, fy), ch = bil(channel, fx, fy);
      // Paddies: plots about 150 m × 125 m with bunds between them; some plots hold water.
      const px = Math.floor(x / 6), py = Math.floor(y / 5);
      const wetPlot = plotHash(px, py);
      let paddy = mix(PADDY, PADDY_WET, wetPlot > 0.72 ? 0.85 : wetPlot * 0.25);
      if (x % 6 === 0 || y % 5 === 0) paddy = mix(paddy, [92, 120, 52], 0.32);
      // Town: blocks of clay roofs on a street grid.
      let town = TOWN;
      if (x % 5 === 0 || y % 5 === 0) town = mix(TOWN, ROAD, 0.7);
      else town = mix(TOWN, [168, 92, 70], plotHash(Math.floor(x / 5) + 97, Math.floor(y / 5) + 31) * 0.6);
      const forestTint = mix(FOREST, HILL, Math.min(1, Math.pow(e, 1.4) * 1.3));
      let col = [0, 0, 0];
      const wsum = fo + fa + ur || 1;
      for (let k = 0; k < 3; k++) col[k] = (forestTint[k] * fo + paddy[k] * fa + town[k] * ur) / wsum;
      col = mix(col, SAND, ch * 0.75);
      let light = 0.5 + 0.95 * shade;
      const zc = zs[i];
      if (Math.floor(zc / 10) !== Math.floor(zr / 10) || Math.floor(zc / 10) !== Math.floor(zd / 10)) light *= Math.floor(Math.max(zc, zr, zd) / 10) % 5 === 0 ? 0.72 : 0.86;
      const o = i * 4;
      img.data[o] = Math.min(255, col[0] * light);
      img.data[o + 1] = Math.min(255, col[1] * light);
      img.data[o + 2] = Math.min(255, col[2] * light);
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  cache.set(region, c);
  return c;
}

// Water: cyan where shallow, deep cobalt where deep, opaque enough to read on any ground.
export function vividWater(N) {
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  return {
    canvas: c,
    paint(h, minDepth = 0.04) {
      const d = img.data;
      for (let i = 0; i < N * N; i++) {
        const w = h[i];
        const o = i * 4;
        if (w < minDepth) {
          d[o + 3] = 0;
          continue;
        }
        // A thin sheet of rain stays faint so the ground shows through; standing water turns opaque and deep blue.
        const t = Math.min(1, w / 1.1);
        d[o] = lerp(96, 14, t);
        d[o + 1] = lerp(226, 66, t);
        d[o + 2] = lerp(255, 222, t);
        d[o + 3] = Math.round(250 * Math.min(1, Math.pow((w - minDepth) / 0.35, 0.7)));
      }
      g.putImageData(img, 0, 0);
    },
  };
}
