// The drawn city: blocks, lots, buildings, trees, river and fields, all derived from the street graph and a seed.
// Illustration only. Nothing here enters the travel-time model in city.js.

import { mulberry32 } from '../core/rng.js';
import { W, H, N, idx, PLACES } from './city.js';

export const GEOMETRY_VERSION = 'mornings-city-1.0.0';
const riverX = (y) => 4.5 + 0.13 * Math.sin(y * 0.72);
// East of the river the plane is stretched so the water has room between the two bank roads.
const stretch = (x) => x + 0.72 * Math.min(1, Math.max(0, x - 4));
export const RIVER_HALF = 0.45;
export const riverCentre = (y) => stretch(riverX(y));

// Plane bounds drawn on screen (corners sit inside).
export const BOUNDS = { x0: -0.95, x1: 10.55, y0: -0.75, y1: 7.75 };

function lerp2(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function bilinear(q, u, v) {
  return lerp2(lerp2(q[0], q[1], u), lerp2(q[3], q[2], u), v);
}

// Inset a convex polygon by d (plane units): move each edge inward, intersect neighbours.
export function inset(poly, d) {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const s = area > 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * s;
    const ny = (dx / L) * s;
    lines.push([x1 + nx * d, y1 + ny * d, dx, dy]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay, adx, ady] = lines[(i + n - 1) % n];
    const [bx, by, bdx, bdy] = lines[i];
    const den = adx * bdy - ady * bdx;
    if (Math.abs(den) < 1e-12) {
      out.push([bx, by]);
      continue;
    }
    const t = ((bx - ax) * bdy - (by - ay) * bdx) / den;
    out.push([ax + adx * t, ay + ady * t]);
  }
  return out;
}

export function makeCity(seed = 4121) {
  const r = mulberry32(seed);
  // Corners, nudged so blocks are not a ruled grid. The bank corners stay on their side of the water.
  const plane = new Float64Array(2 * N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const jx = x === 4 ? -0.12 + r() * 0.12 : x === 5 ? r() * 0.12 : (r() - 0.5) * 0.34;
      const jy = (r() - 0.5) * 0.3;
      const i = idx(x, y);
      plane[2 * i] = stretch(x + jx);
      plane[2 * i + 1] = y + jy;
    }
  const P = (i) => [plane[2 * i], plane[2 * i + 1]];

  const near = (cx, cy, node) => Math.hypot(cx - (node % W), cy - Math.floor(node / W));
  const market = PLACES[0].node;
  const clinic = PLACES[1].node;
  const jobs = PLACES[2].node;
  const PARKS = new Set(['0,2', '6,5', '2,4', '8,6', '3,0']);

  const blocks = [];
  const buildings = [];
  const trees = [];
  const stalls = [];
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      if (x === 4) continue; // the river
      const quad = [P(idx(x, y)), P(idx(x + 1, y)), P(idx(x + 1, y + 1)), P(idx(x, y + 1))];
      const inner = inset(quad, 0.1);
      const cx = x + 0.5;
      const cy = y + 0.5;
      const east = x >= 5;
      let kind = 'lots';
      if (PARKS.has(x + ',' + y)) kind = 'park';
      else if (x === 7 && y === 4) kind = 'market';
      else if (x === 2 && y === 1) kind = 'clinic';
      blocks.push({ x, y, quad, inner, kind });
      if (kind === 'park') {
        const n = 7 + Math.floor(r() * 6);
        for (let k = 0; k < n; k++) {
          const [px, py] = bilinear(inner, 0.12 + r() * 0.76, 0.12 + r() * 0.76);
          trees.push({ x: px, y: py, r: 0.07 + r() * 0.07, shade: Math.floor(r() * 3) });
        }
        continue;
      }
      if (kind === 'market') {
        // Stalls in rows around an open square.
        for (let u = 0; u < 4; u++)
          for (let v = 0; v < 3; v++) {
            if ((u === 1 || u === 2) && v === 1) continue;
            const q = [bilinear(inner, u / 4 + 0.03, v / 3 + 0.05), bilinear(inner, (u + 1) / 4 - 0.03, v / 3 + 0.05), bilinear(inner, (u + 1) / 4 - 0.03, (v + 1) / 3 - 0.05), bilinear(inner, u / 4 + 0.03, (v + 1) / 3 - 0.05)];
            stalls.push({ pts: q, c: Math.floor(r() * 4) });
          }
        continue;
      }
      if (kind === 'clinic') {
        const q = [bilinear(inner, 0.15, 0.2), bilinear(inner, 0.85, 0.2), bilinear(inner, 0.85, 0.72), bilinear(inner, 0.15, 0.72)];
        buildings.push({ pts: q, h: 9, roof: 'clinic', y: Math.max(...q.map((p) => p[1])) });
        for (let k = 0; k < 3; k++) {
          const [px, py] = bilinear(inner, 0.2 + k * 0.3, 0.88);
          trees.push({ x: px, y: py, r: 0.06, shade: k % 3 });
        }
        continue;
      }
      // Lots: a 2–3 × 2–3 split of the block, each with a building set back from its edges, or a garden.
      const nu = 2 + (r() < 0.5 ? 1 : 0);
      const nv = 2 + (r() < 0.5 ? 1 : 0);
      const dJobs = near(cx, cy, jobs);
      const dMarket = near(cx, cy, market);
      const towers = east ? 26 * Math.exp(-(dJobs * dJobs) / 3.2) + 9 * Math.exp(-(dMarket * dMarket) / 4) : 0;
      for (let u = 0; u < nu; u++)
        for (let v = 0; v < nv; v++) {
          const u0 = u / nu;
          const u1 = (u + 1) / nu;
          const v0 = v / nv;
          const v1 = (v + 1) / nv;
          if (r() < (east ? 0.1 : 0.26)) {
            const [px, py] = bilinear(inner, (u0 + u1) / 2, (v0 + v1) / 2);
            trees.push({ x: px, y: py, r: 0.06 + r() * 0.05, shade: Math.floor(r() * 3) });
            continue;
          }
          const m = 0.08 + r() * 0.08;
          const lot = [bilinear(inner, u0 + m / nu, v0 + m / nv), bilinear(inner, u1 - m / nu, v0 + m / nv), bilinear(inner, u1 - m / nu, v1 - m / nv), bilinear(inner, u0 + m / nu, v1 - m / nv)];
          const hgt = (east ? 6 : 3.5) + r() * (east ? 9 : 5) + towers * (0.55 + r() * 0.6);
          buildings.push({ pts: lot, h: hgt, roof: Math.floor(r() * 5), y: Math.max(...lot.map((p) => p[1])) });
        }
    }
  // Street trees along the west bank promenade.
  for (let y = -0.4; y < H - 0.6; y += 0.42) {
    trees.push({ x: riverCentre(y) - RIVER_HALF - 0.14, y, r: 0.055, shade: 2 });
  }
  buildings.sort((a, b) => a.y - b.y);

  // Fields outside the town: strips of paddy with bunds, on both sides of the river.
  const fields = [];
  const inTown = (px, py) => px > -0.35 && px < plane[2 * idx(9, 0)] + 0.35 && py > -0.3 && py < H - 1 + 0.3;
  for (let py = BOUNDS.y0; py < BOUNDS.y1; py += 0.34) {
    for (let px = BOUNDS.x0; px < BOUNDS.x1; px += 0.58) {
      const cx = px + 0.29;
      const cy = py + 0.17;
      if (inTown(cx, cy)) continue;
      if (Math.abs(cx - riverCentre(cy)) < RIVER_HALF + 0.3) continue;
      fields.push({ pts: [[px + 0.02, py + 0.02], [px + 0.56, py + 0.02], [px + 0.56, py + 0.32], [px + 0.02, py + 0.32]], tone: Math.floor(r() * 4) });
      if (r() < 0.18) trees.push({ x: px + 0.56, y: py + 0.3, r: 0.05 + r() * 0.04, shade: Math.floor(r() * 3) });
    }
  }
  trees.sort((a, b) => a.y - b.y);

  return { version: GEOMETRY_VERSION, plane, blocks, buildings, trees, stalls, fields };
}

// Plane → screen: an oblique view from the south, fitted to the canvas. z lifts toward the top of the screen.
export function makeView(w, h, pad = 6) {
  const ox = (px, py) => px * 56 + py * 10;
  const oy = (px, py) => py * 66 - px * 5;
  const cs = [[BOUNDS.x0, BOUNDS.y0], [BOUNDS.x1, BOUNDS.y0], [BOUNDS.x1, BOUNDS.y1], [BOUNDS.x0, BOUNDS.y1]];
  const xs = cs.map(([a, b]) => ox(a, b));
  const ys = cs.map(([a, b]) => oy(a, b));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys) - 30;
  const maxY = Math.max(...ys);
  const s = Math.min((w - 2 * pad) / (maxX - minX), (h - 2 * pad) / (maxY - minY));
  const tx = (w - (maxX - minX) * s) / 2 - minX * s;
  const ty = (h - (maxY - minY) * s) / 2 - minY * s;
  return {
    s,
    w,
    h,
    pt: (px, py, z = 0) => [ox(px, py) * s + tx, oy(px, py) * s + ty - z * s],
  };
}

export { riverX, stretch };
