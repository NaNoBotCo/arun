// E12 Mathematical Blossoms: phyllotaxis points, nearest neighbours, radial density. Pure functions, no DOM.
import { makeRng, deriveSeed } from '../core/rng.js';

export const PHI = (1 + Math.sqrt(5)) / 2;
export const GOLDEN_ANGLE_DEG = 360 / (PHI * PHI); // 137.5077640500378...
export const LIMITS = { N: [1, 6000], angle_deg: [0, 360], amp: [0, 0.95], sym: [1, 24], jitter: [0, 0.5], scale_mm: [0.05, 20] };

function check(name, v, [lo, hi], integer = false) {
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  if (integer && !Number.isInteger(v)) throw new Error(`${name} must be a whole number`);
}

export function validate(cfg) {
  check('N', cfg.N, LIMITS.N, true);
  check('angle_deg', cfg.angle_deg, LIMITS.angle_deg);
  check('amp', cfg.amp, LIMITS.amp);
  check('sym', cfg.sym, LIMITS.sym, true);
  check('jitter', cfg.jitter, LIMITS.jitter);
  check('scale_mm', cfg.scale_mm, LIMITS.scale_mm);
}

// Points n = 0..N-1:  r = c sqrt(n),  theta = n alpha,  r' = r (1 + a sin(k theta)),  optional seeded jitter of size j*c.
export function phyllotaxis(cfg, seed = 0) {
  validate(cfg);
  const { N, angle_deg, amp, sym, jitter, scale_mm } = cfg;
  const alpha = (angle_deg * Math.PI) / 180;
  const x = new Float64Array(N), y = new Float64Array(N), r = new Float64Array(N), theta = new Float64Array(N);
  const rng = jitter > 0 ? makeRng(deriveSeed(seed, 'e12.jitter')) : null;
  for (let n = 0; n < N; n++) {
    const th = n * alpha;
    const rr = scale_mm * Math.sqrt(n) * (1 + amp * Math.sin(sym * th));
    let px = rr * Math.cos(th), py = rr * Math.sin(th);
    if (rng) {
      px += jitter * scale_mm * rng.normal() * 0.5;
      py += jitter * scale_mm * rng.normal() * 0.5;
    }
    x[n] = px; y[n] = py; r[n] = rr; theta[n] = th;
  }
  return { x, y, r, theta, N };
}

// Nearest neighbour of every point by a uniform grid hash: O(N) for spread-out points.
export function nearestNeighbours(x, y) {
  const N = x.length;
  const nn = new Float64Array(N).fill(Infinity);
  const idx = new Int32Array(N).fill(-1);
  if (N < 2) return { nn, idx };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < N; i++) {
    if (x[i] < x0) x0 = x[i];
    if (x[i] > x1) x1 = x[i];
    if (y[i] < y0) y0 = y[i];
    if (y[i] > y1) y1 = y[i];
  }
  const w = Math.max(x1 - x0, y1 - y0, 1e-12);
  const G = Math.max(1, Math.min(256, Math.floor(Math.sqrt(N / 2))));
  const cell = w / G + 1e-12;
  const heads = new Int32Array(G * G).fill(-1);
  const next = new Int32Array(N);
  const cx = (v, lo) => Math.min(G - 1, Math.floor((v - lo) / cell));
  for (let i = 0; i < N; i++) {
    const c = cx(y[i], y0) * G + cx(x[i], x0);
    next[i] = heads[c];
    heads[c] = i;
  }
  for (let i = 0; i < N; i++) {
    const gx = cx(x[i], x0), gy = cx(y[i], y0);
    let best = Infinity, bi = -1;
    for (let ring = 0; ring <= G; ring++) {
      // after the first hit, one more ring cannot hold anything closer than ring*cell
      if (bi >= 0 && (ring - 1) * cell > Math.sqrt(best)) break;
      for (let yy = gy - ring; yy <= gy + ring; yy++) {
        if (yy < 0 || yy >= G) continue;
        for (let xx = gx - ring; xx <= gx + ring; xx++) {
          if (xx < 0 || xx >= G) continue;
          if (Math.max(Math.abs(xx - gx), Math.abs(yy - gy)) !== ring) continue;
          for (let j = heads[yy * G + xx]; j >= 0; j = next[j]) {
            if (j === i) continue;
            const dx = x[j] - x[i], dy = y[j] - y[i];
            const d2 = dx * dx + dy * dy;
            if (d2 < best) { best = d2; bi = j; }
          }
        }
      }
    }
    nn[i] = Math.sqrt(best);
    idx[i] = bi;
  }
  return { nn, idx };
}

export function nearestNeighboursBrute(x, y) {
  const N = x.length;
  const nn = new Float64Array(N).fill(Infinity);
  const idx = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const d = Math.hypot(x[i] - x[j], y[i] - y[j]);
      if (d < nn[i]) { nn[i] = d; idx[i] = j; }
    }
  return { nn, idx };
}

// Points per unit area in rings of equal width out to the largest radius.
export function radialDensity(x, y, bins = 24) {
  const N = x.length;
  const rad = new Float64Array(N);
  let rmax = 0;
  for (let i = 0; i < N; i++) {
    rad[i] = Math.hypot(x[i], y[i]);
    if (rad[i] > rmax) rmax = rad[i];
  }
  rmax = rmax || 1;
  const counts = new Array(bins).fill(0);
  for (let i = 0; i < N; i++) counts[Math.min(bins - 1, Math.floor((rad[i] / rmax) * bins * 0.999999))]++;
  const w = rmax / bins;
  const centers = [], density = [];
  for (let b = 0; b < bins; b++) {
    const a = Math.PI * ((b + 1) * (b + 1) - b * b) * w * w;
    centers.push((b + 0.5) * w);
    density.push(counts[b] / a);
  }
  return { centers, density, counts, rmax };
}

// Smallest fraction p/q (q <= qmax) within tol of x (x in turns). Returns null when none: the angle is irrational to this tolerance.
export function rationalTurns(angle_deg, qmax = 720, tol = 1e-9) {
  const t = (((angle_deg / 360) % 1) + 1) % 1;
  for (let q = 1; q <= qmax; q++) {
    const p = Math.round(t * q);
    if (Math.abs(t - p / q) < tol) return { p, q };
  }
  return null;
}

// Largest empty disc found on a sample grid, in units of the mean nearest-neighbour distance.
export function largestGap(x, y, meanNN, samples = 70) {
  const N = x.length;
  if (N < 3) return 0;
  let R = 0;
  for (let i = 0; i < N; i++) R = Math.max(R, Math.hypot(x[i], y[i]));
  const cellSize = Math.max(meanNN * 2, R / 40);
  const G = Math.max(1, Math.ceil((2 * R) / cellSize));
  const heads = new Int32Array(G * G).fill(-1);
  const next = new Int32Array(N);
  const at = (v) => Math.min(G - 1, Math.max(0, Math.floor((v + R) / cellSize)));
  for (let i = 0; i < N; i++) {
    const c = at(y[i]) * G + at(x[i]);
    next[i] = heads[c];
    heads[c] = i;
  }
  let worst = 0;
  for (let a = 0; a < samples; a++)
    for (let b = 0; b < samples; b++) {
      const px = -R + ((a + 0.5) / samples) * 2 * R, py = -R + ((b + 0.5) / samples) * 2 * R;
      if (Math.hypot(px, py) > R * 0.98) continue;
      let best = Infinity;
      for (let ring = 0; ring <= G; ring++) {
        if (best < Infinity && (ring - 1) * cellSize > best) break;
        const gx = at(px), gy = at(py);
        for (let yy = gy - ring; yy <= gy + ring; yy++) {
          if (yy < 0 || yy >= G) continue;
          for (let xx = gx - ring; xx <= gx + ring; xx++) {
            if (xx < 0 || xx >= G || Math.max(Math.abs(xx - gx), Math.abs(yy - gy)) !== ring) continue;
            for (let j = heads[yy * G + xx]; j >= 0; j = next[j]) best = Math.min(best, Math.hypot(x[j] - px, y[j] - py));
          }
        }
      }
      if (best > worst) worst = best;
    }
  return worst / meanNN;
}

// Index offsets |i-j| between each point and its nearest neighbour; the most common ones are the spiral counts.
export function spiralOffsets(idx, top = 3) {
  const tally = new Map();
  for (let i = 0; i < idx.length; i++) {
    if (idx[i] < 0) continue;
    const d = Math.abs(i - idx[i]);
    tally.set(d, (tally.get(d) || 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, top).map(([offset, count]) => ({ offset, count }));
}

export function analyze(cfg, seed = 0, bins = 24) {
  const pts = phyllotaxis(cfg, seed);
  const { nn, idx } = nearestNeighbours(pts.x, pts.y);
  const N = pts.N;
  let sum = 0, min = Infinity, max = 0;
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(nn[i])) continue;
    sum += nn[i];
    min = Math.min(min, nn[i]);
    max = Math.max(max, nn[i]);
  }
  const m = N > 1 ? N : 1;
  const mean = sum / m;
  let v = 0;
  for (let i = 0; i < N; i++) if (Number.isFinite(nn[i])) v += (nn[i] - mean) ** 2;
  const sd = Math.sqrt(v / m);
  const rd = radialDensity(pts.x, pts.y, bins);
  const rational = rationalTurns(cfg.angle_deg);
  const gap = N >= 3 ? largestGap(pts.x, pts.y, mean) : 0;
  let thetaMod = new Float64Array(N);
  for (let i = 0; i < N; i++) thetaMod[i] = ((((pts.theta[i] * 180) / Math.PI) % 360) + 360) % 360;
  // distinct directions: how many rays the points fall on (only meaningful for a rational angle)
  const rays = rational ? rational.q : null;
  return {
    ...pts, nn, idx, thetaDeg: thetaMod,
    meanNN: mean, minNN: N > 1 ? min : 0, maxNN: max, cvNN: mean > 0 ? sd / mean : 0,
    gapRatio: gap, rational, rays, spirals: spiralOffsets(idx), radial: rd,
    ok: [mean, sd, gap].every(Number.isFinite),
  };
}

export const jobs = {};
