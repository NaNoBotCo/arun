// Possible mornings: a fictional 80-corner city, three candidate changes, 512 seeded mornings.
// Pure. No DOM. Extracted from the standalone candidate page in ARUN_Possible_Mornings_Claude_Handoff.zip
// (arun-possible-city.html, 27 Nov 2026): the same graph, the same seeded weights, the same shortest-path
// rule, so every number here equals that page's. test/kernels/mornings.test.mjs checks it morning by morning.

import { mulberry32 } from '../core/rng.js';
import { hashData } from '../core/hash.js';

export const METHOD_VERSION = 'mornings-1.0.0';
export const W = 10; // corners east–west
export const H = 8; // corners north–south
export const N = W * H;
export const SEED_BASE = 1771; // morning i draws from seed i + 1771, as on the candidate page
export const MAX_MORNINGS = 4096;

export const idx = (x, y) => y * W + x;
export const xy = (i) => [i % W, Math.floor(i / W)];

// Streets: a grid with the river between columns 4 and 5, crossed by two old bridges.
// Base minutes per street before traffic and rain.
export const EDGES = (() => {
  const e = [];
  const add = (a, b, t, type = 'road') => e.push({ a, b, t, type });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (x < W - 1 && x !== 4) add(idx(x, y), idx(x + 1, y), 2.4);
      if (y < H - 1) add(idx(x, y), idx(x, y + 1), 2.1);
    }
  add(idx(4, 1), idx(5, 1), 6, 'bridge');
  add(idx(4, 6), idx(5, 6), 6, 'bridge');
  return e;
})();

// The three changes on offer. Each adds one link and removes nothing.
export const OPTIONS = [
  { key: 'ferry', a: idx(4, 4), b: idx(5, 4), t: 5.5, type: 'ferry' },
  { key: 'bridge', a: idx(4, 3), b: idx(5, 3), t: 3.5, type: 'bridge' },
  { key: 'link', a: idx(1, 6), b: idx(4, 4), t: 3.6, type: 'express' },
];

export const PLACES = [
  { key: 'market', node: idx(7, 4) },
  { key: 'clinic', node: idx(2, 2) },
  { key: 'jobs', node: idx(8, 1) },
];

// 24 homes, each trip to each place weighted equally: 72 trips.
export const ORIGINS = Array.from({ length: 24 }, (_, i) => idx([0, 1, 3, 6, 7, 9][i % 6], [0, 2, 4, 7][Math.floor(i / 6)]));
// One named trip per place: the start the page shows first.
export const EXAMPLE_START = [idx(1, 4), idx(8, 7), idx(3, 7)];

export const FIXTURE_HASH = hashData({ W, H, EDGES, OPTIONS, PLACES, ORIGINS, SEED_BASE });

function checkMorning(i) {
  if (!Number.isInteger(i) || i < 0 || i >= MAX_MORNINGS) throw new Error(`Morning index must be a whole number from 0 to ${MAX_MORNINGS - 1}.`);
}

// One morning: rain 0–1, a traffic factor, and minutes on every street and every candidate link.
// The draw order is the candidate page's: rain, traffic, each street, then each option.
export function world(i) {
  checkMorning(i);
  const r = mulberry32(i + SEED_BASE);
  const rain = r();
  const traffic = 0.7 + r() * 0.95;
  const weights = new Float64Array(EDGES.length);
  for (let k = 0; k < EDGES.length; k++) {
    const e = EDGES[k];
    weights[k] = e.t * (traffic * (0.72 + r() * 0.65) + rain * (e.type === 'bridge' ? 0.42 : 0.25));
  }
  const ex = new Float64Array(OPTIONS.length);
  for (let k = 0; k < OPTIONS.length; k++) {
    const e = OPTIONS[k];
    ex[k] = e.t * (e.type === 'ferry' ? 1 + rain * 1.7 + r() * 0.4 : traffic + rain * 0.28 + r() * 0.22);
  }
  return { i, rain, traffic, weights, ex };
}

// A change is null (today), an option index, or { add: [{a,b,minutes}], remove: [edge], scale: [{edge, factor}] }.
// Removal and slowing exist so a harmful change can be modelled; the page offers additions only.
export function network(w, change = null) {
  const adj = Array.from({ length: N }, () => []);
  const removed = new Set();
  const factor = new Map();
  let adds = [];
  if (typeof change === 'number') {
    if (change >= 0) {
      if (!OPTIONS[change]) throw new Error('No such option.');
      adds = [{ a: OPTIONS[change].a, b: OPTIONS[change].b, minutes: w.ex[change] }];
    }
  } else if (change) {
    for (const k of change.remove || []) removed.add(k);
    for (const s of change.scale || []) factor.set(s.edge, s.factor);
    adds = change.add || [];
  }
  for (let k = 0; k < EDGES.length; k++) {
    if (removed.has(k)) continue;
    const v = w.weights[k] * (factor.has(k) ? factor.get(k) : 1);
    adj[EDGES[k].a].push([EDGES[k].b, v]);
    adj[EDGES[k].b].push([EDGES[k].a, v]);
  }
  for (const e of adds) {
    if (!(e.minutes >= 0)) throw new Error('A link needs minutes of zero or more.');
    adj[e.a].push([e.b, e.minutes]);
    adj[e.b].push([e.a, e.minutes]);
  }
  return adj;
}

// Shortest minutes from root to every corner (Dijkstra; the lowest index wins a tie, as on the candidate page).
// Streets run both ways, so these are also the minutes from every corner to the root.
export function shortest(adj, root) {
  const n = adj.length;
  const d = new Float64Array(n).fill(Infinity);
  const p = new Int16Array(n).fill(-1);
  const used = new Uint8Array(n);
  d[root] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    let min = Infinity;
    for (let i = 0; i < n; i++)
      if (!used[i] && d[i] < min) {
        u = i;
        min = d[i];
      }
    if (u < 0) break;
    used[u] = 1;
    for (const [v, c] of adj[u])
      if (min + c < d[v]) {
        d[v] = min + c;
        p[v] = u;
      }
  }
  return { d, p };
}

// Today or with a change: minutes to each place from every corner, and the mean of the 72 trips.
export function solve(w, change = -1) {
  const adj = network(w, change);
  const paths = PLACES.map((pl) => shortest(adj, pl.node));
  let mean = 0;
  for (const s of paths) {
    let v = 0;
    for (const o of ORIGINS) v += s.d[o];
    mean += v;
  }
  mean /= ORIGINS.length * PLACES.length;
  if (!Number.isFinite(mean)) throw new Error('A home cannot reach a place on this network.');
  return { dist: paths.map((s) => s.d), prev: paths.map((s) => s.p), mean };
}

// Corners from start to the place, following the search tree. null when unreachable.
export function tripPath(prev, dist, start) {
  if (!Number.isFinite(dist[start])) return null;
  const out = [start];
  let u = start;
  while (prev[u] >= 0 && out.length <= N) {
    u = prev[u];
    out.push(u);
  }
  return out;
}

// Minutes from the start along a path, corner by corner (for drawing a trip in time).
export function pathMinutes(path, dist) {
  return path.map((n) => dist[path[0]] - dist[n]);
}

// All mornings: the mean trip today and with each option. Unclipped: a negative saving would show.
export function runMornings({ count = 512, first = 0 } = {}, { progress, emit } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_MORNINGS) throw new Error(`Mornings must be a whole number from 1 to ${MAX_MORNINGS}.`);
  if (!Number.isInteger(first) || first < 0 || first + count > MAX_MORNINGS) throw new Error('First morning out of range.');
  const rain = new Float64Array(count);
  const traffic = new Float64Array(count);
  const base = new Float64Array(count);
  const alt = OPTIONS.map(() => new Float64Array(count));
  for (let j = 0; j < count; j++) {
    const w = world(first + j);
    rain[j] = w.rain;
    traffic[j] = w.traffic;
    base[j] = solve(w, -1).mean;
    for (let k = 0; k < OPTIONS.length; k++) alt[k][j] = solve(w, k).mean;
    if (progress) progress((j + 1) / count);
    if (emit && ((j + 1) % 64 === 0 || j === count - 1)) emit({ done: j + 1, count });
  }
  return { version: METHOD_VERSION, fixture: FIXTURE_HASH, first, count, rain, traffic, base, alt, searches: count * (OPTIONS.length + 1) * PLACES.length };
}

// Saving per trip for one option, morning by morning (today minus with the change).
export function savings(run, k) {
  const out = new Float64Array(run.count);
  for (let j = 0; j < run.count; j++) out[j] = run.base[j] - run.alt[k][j];
  return out;
}

// Where every corner sits on the map in minutes: same bearing from the place as on the street map,
// distance from the centre in minutes. One scale for today and with the change, so both are comparable.
export function timeLayout(geo, dist, anchor, cx, cy, pxPerMin) {
  const out = new Float64Array(2 * N);
  const ax = geo[2 * anchor];
  const ay = geo[2 * anchor + 1];
  for (let i = 0; i < N; i++) {
    if (i === anchor) {
      out[2 * i] = cx;
      out[2 * i + 1] = cy;
      continue;
    }
    const a = Math.atan2(geo[2 * i + 1] - ay, geo[2 * i] - ax);
    const r = dist[i] * pxPerMin;
    out[2 * i] = cx + Math.cos(a) * r;
    out[2 * i + 1] = cy + Math.sin(a) * r;
  }
  return out;
}

// A record of what the page shows, and its replay. Equal inputs give equal numbers.
export function tripRecord({ morning, option, place, start }) {
  const i = morning - 1;
  const w = world(i);
  const today = solve(w, -1);
  const changed = solve(w, option);
  return {
    route: 'mornings',
    methodVersion: METHOD_VERSION,
    fixture: FIXTURE_HASH,
    seed: i + SEED_BASE,
    morning,
    rain: w.rain,
    traffic: w.traffic,
    option: OPTIONS[option].key,
    place: PLACES[place].key,
    start,
    trip_min: { today: today.dist[place][start], changed: changed.dist[place][start] },
    mean72_min: { today: today.mean, changed: changed.mean },
  };
}

export function replay(record) {
  if (record.methodVersion !== METHOD_VERSION) throw new Error(`Record is ${record.methodVersion}; this page computes ${METHOD_VERSION}.`);
  if (record.fixture !== FIXTURE_HASH) throw new Error('Record was made on a different city.');
  const option = OPTIONS.findIndex((o) => o.key === record.option);
  const place = PLACES.findIndex((p) => p.key === record.place);
  if (option < 0 || place < 0) throw new Error('Unknown option or place in the record.');
  return tripRecord({ morning: record.morning, option, place, start: record.start });
}

// A city-sized search, timed on this device: a square street grid with seeded minutes, binary-heap Dijkstra.
export function heapShortest(n, offs, to, wt, root) {
  const d = new Float64Array(n).fill(Infinity);
  const heap = new Int32Array(n + 1);
  const key = new Float64Array(n + 1);
  const pos = new Int32Array(n).fill(-1);
  let size = 0;
  const swap = (i, j) => {
    const a = heap[i];
    const b = heap[j];
    heap[i] = b;
    heap[j] = a;
    const k = key[i];
    key[i] = key[j];
    key[j] = k;
    pos[b] = i;
    pos[a] = j;
  };
  const up = (i) => {
    while (i > 1 && key[i >> 1] > key[i]) {
      swap(i, i >> 1);
      i >>= 1;
    }
  };
  const down = (i) => {
    for (;;) {
      let m = i;
      const l = 2 * i;
      if (l <= size && key[l] < key[m]) m = l;
      if (l + 1 <= size && key[l + 1] < key[m]) m = l + 1;
      if (m === i) return;
      swap(i, m);
      i = m;
    }
  };
  d[root] = 0;
  heap[++size] = root;
  key[size] = 0;
  pos[root] = size;
  while (size) {
    const u = heap[1];
    pos[u] = -2;
    if (size > 1) swap(1, size);
    size--;
    down(1);
    for (let e = offs[u]; e < offs[u + 1]; e++) {
      const v = to[e];
      const nd = d[u] + wt[e];
      if (nd < d[v]) {
        d[v] = nd;
        if (pos[v] === -1) {
          heap[++size] = v;
          key[size] = nd;
          pos[v] = size;
          up(size);
        } else if (pos[v] > 0) {
          key[pos[v]] = nd;
          up(pos[v]);
        }
      }
    }
  }
  return d;
}

export function gridCity(side, seed) {
  if (!Number.isInteger(side) || side < 2 || side > 400) throw new Error('Grid side must be from 2 to 400.');
  const n = side * side;
  const r = mulberry32(seed);
  const deg = new Int32Array(n);
  const pairs = [];
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      if (x + 1 < side) pairs.push([i, i + 1, 1 + r() * 2]);
      if (y + 1 < side) pairs.push([i, i + side, 1 + r() * 2]);
    }
  for (const [a, b] of pairs) {
    deg[a]++;
    deg[b]++;
  }
  const offs = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offs[i + 1] = offs[i] + deg[i];
  const fill = offs.slice(0, n);
  const to = new Int32Array(offs[n]);
  const wt = new Float64Array(offs[n]);
  for (const [a, b, m] of pairs) {
    to[fill[a]] = b;
    wt[fill[a]++] = m;
    to[fill[b]] = a;
    wt[fill[b]++] = m;
  }
  return { n, offs, to, wt };
}

export function benchCity({ side = 141, searches = 6, seed = 20261127 } = {}, { progress } = {}) {
  if (!Number.isInteger(searches) || searches < 1 || searches > 50) throw new Error('Searches must be from 1 to 50.');
  const g = gridCity(side, seed);
  const r = mulberry32(seed ^ 0x5bd1e995);
  const times = [];
  let check = 0;
  for (let s = 0; s < searches; s++) {
    const root = Math.floor(r() * g.n);
    const t0 = performance.now();
    const d = heapShortest(g.n, g.offs, g.to, g.wt, root);
    times.push(performance.now() - t0);
    check += d[(root + 1) % g.n];
    if (progress) progress((s + 1) / searches);
  }
  times.sort((a, b) => a - b);
  return { corners: g.n, streets: g.to.length / 2, searches, msMedian: times[Math.floor(times.length / 2)], msAll: times, check };
}

export const jobs = {
  'mornings.run': (payload, ctx) => runMornings(payload, ctx),
  'mornings.bench': (payload, ctx) => benchCity(payload, ctx),
};

// The morning whose saving sits nearest the median (the candidate page's "typical morning"), 1-based.
export function typicalMorning(sav) {
  const s = Array.from(sav).sort((a, b) => a - b);
  const med = s[Math.floor(0.5 * (s.length - 1))];
  let j = 0;
  for (let i = 1; i < sav.length; i++) if (Math.abs(sav[i] - med) < Math.abs(sav[j] - med)) j = i;
  return j + 1;
}

// The morning with the smallest saving, 1-based (first one on a tie).
export function leastUsefulMorning(sav) {
  let j = 0;
  for (let i = 1; i < sav.length; i++) if (sav[i] < sav[j]) j = i;
  return j + 1;
}

// The page opens on the new bridge's typical morning without waiting for the 512-morning run.
export const DEFAULT_MORNING = 39;
export const DEFAULT_OPTION = 1;
