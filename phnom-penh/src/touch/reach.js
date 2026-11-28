// Reach: from one touched spot, how long the mapped streets take to get to every street and building,
// and what a higher river takes away. Pure functions, no DOM; the page and the tests use the same code.
//
// Inputs are the existing kernels' outputs: the street graph (src/kernels/route.js buildGraph) and the
// river model (src/kernels/skyreach.js prepare). A street is closed when the land under its midpoint is
// reached by the raised river (level < rise); a street over mapped river water is a bridge and stays open.
// Speeds are assumptions, not measurements. Dikes, drains, traffic and one-way rules are left out.
import { nearestNode } from '../kernels/route.js';
import { cellAt } from '../kernels/skyreach.js';

export const MODES = {
  tuk: { kmh: [30, 25, 18] },   // major, minor, street: the same assumption as route.js
  foot: { kmh: [4.8, 4.8, 4.8] },
};
export const WALK = 4.8 / 3.6;  // m/s from the street to a door, and from the touch to the street
export const MAX_SNAP = 250;    // a building farther than this from any street is not counted
export const MAX_START = 400;   // a touch farther than this from any street has no answer

// buf: data/buildings.bin bytes (per building: n, height, flags, then n × int16 x, y in half metres)
export function buildingCentres(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const xs = [], ys = [];
  let o = 0;
  while (o < u8.byteLength) {
    const n = dv.getUint8(o); o += 3;
    let sx = 0, sy = 0;
    for (let k = 0; k < n; k++) { sx += dv.getInt16(o, true) / 2; sy += dv.getInt16(o + 2, true) / 2; o += 4; }
    xs.push(sx / n); ys.push(sy / n);
  }
  return { x: Float32Array.from(xs), y: Float32Array.from(ys) };
}

export function prepareCity(graph, prep, centres) {
  const nE = graph.edges.length, nN = graph.x.length;
  const len = new Float32Array(nE), cls = new Uint8Array(nE), edgeLevel = new Float32Array(nE);
  for (let e = 0; e < nE; e++) {
    const E = graph.edges[e];
    len[e] = E.len; cls[e] = E.cls;
    const c = cellAt(prep, E.mx, E.my);
    edgeLevel[e] = c < 0 ? Infinity : prep.river[c] ? -1 : prep.level[c];
  }
  const cost = {};
  for (const [k, m] of Object.entries(MODES)) {
    const s = new Float32Array(nE);
    for (let e = 0; e < nE; e++) s[e] = len[e] / (m.kmh[cls[e]] / 3.6);
    cost[k] = s;
  }
  const nB = centres.x.length;
  const bNode = new Int32Array(nB), bSnap = new Float32Array(nB), bLevel = new Float32Array(nB);
  for (let b = 0; b < nB; b++) {
    const n = nearestNode(graph, centres.x[b], centres.y[b]);
    bNode[b] = n;
    bSnap[b] = n < 0 ? Infinity : Math.hypot(graph.x[n] - centres.x[b], graph.y[n] - centres.y[b]);
    const c = cellAt(prep, centres.x[b], centres.y[b]);
    bLevel[b] = c < 0 ? Infinity : prep.river[c] ? -1 : prep.level[c];
  }
  const heap = { k: new Float64Array(2 * nE + 16), v: new Int32Array(2 * nE + 16) };
  return { graph, prep, nE, nN, nB, len, cls, edgeLevel, cost, centres, bNode, bSnap, bLevel, heap };
}

// Streets closed by a river rise of `rise` metres (1 = closed).
export function closedAt(city, rise, out) {
  const m = out || new Uint8Array(city.nE);
  for (let e = 0; e < city.nE; e++) { const l = city.edgeLevel[e]; m[e] = l >= 0 && l < rise ? 1 : 0; }
  return m;
}

export function startAt(city, x, y) {
  const n = nearestNode(city.graph, x, y);
  if (n < 0) return null;
  const snap = Math.hypot(city.graph.x[n] - x, city.graph.y[n] - y);
  return snap > MAX_START ? { node: -1, snap } : { node: n, snap };
}

// Dijkstra from one node, stopping past `cutoff` seconds. dist: Float64Array(nN), filled here.
export function reach(city, start, mode, closed, cutoff, dist) {
  const g = city.graph, cost = city.cost[mode];
  dist.fill(Infinity);
  if (!start || start.node < 0) return 0;
  const hk = city.heap.k, hv = city.heap.v;
  let hn = 0;
  const push = (k, v) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
  const pop = () => {
    const v = hv[0], lk = hk[--hn], lv = hv[hn];
    let i = 0;
    for (;;) { let m = 2 * i + 1; if (m >= hn) break; if (m + 1 < hn && hk[m + 1] < hk[m]) m++; if (hk[m] >= lk) break; hk[i] = hk[m]; hv[i] = hv[m]; i = m; }
    hk[i] = lk; hv[i] = lv; return v;
  };
  const t0 = start.snap / WALK;
  dist[start.node] = t0; push(t0, start.node);
  let settled = 0;
  while (hn) {
    const k = hk[0], n = pop();
    if (k > dist[n]) continue;
    if (k > cutoff) break;
    settled++;
    for (let j = g.adjStart[n]; j < g.adjStart[n + 1]; j++) {
      const e = g.adjEdge[j];
      if (closed && closed[e]) continue;
      const m = g.adjNode[j], d = k + cost[e];
      if (d < dist[m]) { dist[m] = d; push(d, m); }
    }
  }
  return settled;
}

// Seconds to each building's door (Infinity: no street near it, the river has reached it, or out of reach).
export function doorTimes(city, dist, rise, out) {
  const t = out || new Float32Array(city.nB);
  for (let b = 0; b < city.nB; b++) {
    const n = city.bNode[b], s = city.bSnap[b], l = city.bLevel[b];
    t[b] = n < 0 || s > MAX_SNAP || (l >= 0 && l < rise) ? Infinity : dist[n] + s / WALK;
  }
  return t;
}

export const countWithin = (times, T) => { let c = 0; for (let i = 0; i < times.length; i++) if (times[i] <= T) c++; return c; };
export const underWater = (city, rise) => { let c = 0; for (let b = 0; b < city.nB; b++) { const l = city.bLevel[b]; if (l >= 0 && l < rise) c++; } return c; };

// Sorted door times within T: the counter reads the real count at every point of the light's travel.
export function sortedWithin(times, T) {
  const a = [];
  for (let i = 0; i < times.length; i++) if (times[i] <= T) a.push(times[i]);
  return Float32Array.from(a).sort();
}
export function countAt(sorted, t) { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= t) lo = m + 1; else hi = m; } return lo; }

// The same start at many river levels: buildings within T at each.
export function sweep(city, start, mode, T, rises) {
  const dist = new Float64Array(city.nN), closed = new Uint8Array(city.nE), times = new Float32Array(city.nB);
  return rises.map(rise => {
    closedAt(city, rise, closed);
    reach(city, start, mode, closed, T, dist);
    doorTimes(city, dist, rise, times);
    return { rise, count: countWithin(times, T) };
  });
}
