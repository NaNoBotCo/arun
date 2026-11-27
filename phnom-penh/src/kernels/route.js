// Street graph from OSM paths (data/geo.json: major, minor, streets polylines in local metres) and
// shortest paths on it.
//
// The paths are geometry, not a routing network: Mot Dang's map files simplified them (Douglas–Peucker,
// ~11–16 m) and quantized them to 1e-4°, so two streets that meet often share no vertex. buildGraph()
// planarizes: it splits segments where they cross and joins a dangling path end to the nearest street
// within 12 m. Flyovers and bridges therefore become junctions. The data carries no one-way or turn
// rules, so the graph is undirected and routes are illustrative, not directions.

export const SPEED_KMH = [30, 25, 18]; // major, minor, street — an assumption, not measured
const CLS = { major: 0, minor: 1, streets: 2 };
const SNAP = 12; // metres: a dangling end joins a street this close
const MERGE = 0.5; // metres: points this close are one node

class NodeIndex {
  constructor(cell = 50) { this.cell = cell; this.map = new Map(); this.x = []; this.y = []; }
  key(cx, cy) { return cx * 1000003 + cy; }
  get(x, y) {
    const c = this.cell, cx = Math.floor(x / c), cy = Math.floor(y / c);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const b = this.map.get(this.key(cx + dx, cy + dy));
      if (!b) continue;
      for (const n of b) if (Math.abs(this.x[n] - x) <= MERGE && Math.abs(this.y[n] - y) <= MERGE) return n;
    }
    const n = this.x.length;
    this.x.push(x); this.y.push(y);
    const k = this.key(cx, cy);
    const b = this.map.get(k);
    if (b) b.push(n); else this.map.set(k, [n]);
    return n;
  }
}

// Segment–segment intersection: returns [t, u] along a and b, or null.
function cross(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax, qy = cy - ay;
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  const e = 1e-9;
  return t >= -e && t <= 1 + e && u >= -e && u <= 1 + e ? [Math.min(1, Math.max(0, t)), Math.min(1, Math.max(0, u))] : null;
}

function closestOnSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
  const x = ax + vx * t, y = ay + vy * t;
  return { t, x, y, d: Math.hypot(px - x, py - y) };
}

// extent: { xmin, ymin, xmax, ymax } in local metres; a segment is kept if either end is inside.
export function buildGraph(geo, { extent, classes = ['major', 'minor', 'streets'] } = {}) {
  const inside = (x, y) => !extent || (x >= extent.xmin && x <= extent.xmax && y >= extent.ymin && y <= extent.ymax);
  // 1. segments
  const S = { ax: [], ay: [], bx: [], by: [], cls: [], poly: [] };
  const polyEnds = []; // [x, y, cls, poly, segIndex]
  let poly = 0;
  for (const name of classes) {
    for (const p of geo[name] || []) {
      let first = -1, last = -1;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
        if (ax === bx && ay === by) continue;
        if (!inside(ax, ay) && !inside(bx, by)) continue;
        const s = S.ax.length;
        S.ax.push(ax); S.ay.push(ay); S.bx.push(bx); S.by.push(by); S.cls.push(CLS[name]); S.poly.push(poly);
        if (first < 0) first = s;
        last = s;
      }
      if (first >= 0) {
        polyEnds.push([S.ax[first], S.ay[first], CLS[name], poly, first]);
        polyEnds.push([S.bx[last], S.by[last], CLS[name], poly, last]);
      }
      poly++;
    }
  }
  const nS = S.ax.length;
  // 2. grid hash of segment boxes
  const G = 150, grid = new Map();
  const gk = (cx, cy) => cx * 1000003 + cy;
  for (let s = 0; s < nS; s++) {
    const x0 = Math.floor((Math.min(S.ax[s], S.bx[s]) - SNAP) / G), x1 = Math.floor((Math.max(S.ax[s], S.bx[s]) + SNAP) / G);
    const y0 = Math.floor((Math.min(S.ay[s], S.by[s]) - SNAP) / G), y1 = Math.floor((Math.max(S.ay[s], S.by[s]) + SNAP) / G);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = gk(cx, cy), b = grid.get(k);
      if (b) b.push(s); else grid.set(k, [s]);
    }
  }
  const splits = Array.from({ length: nS }, () => [0, 1]);
  // 3. crossings: each pair is handled only in the grid cell that holds the crossing point
  let crossings = 0;
  for (const [k, b] of grid) {
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const s = b[i], r = b[j];
      const hit = cross(S.ax[s], S.ay[s], S.bx[s], S.by[s], S.ax[r], S.ay[r], S.bx[r], S.by[r]);
      if (!hit) continue;
      const [t, u] = hit;
      const x = S.ax[s] + (S.bx[s] - S.ax[s]) * t, y = S.ay[s] + (S.by[s] - S.ay[s]) * t;
      if (gk(Math.floor(x / G), Math.floor(y / G)) !== k) continue;
      if (t > 0 && t < 1) splits[s].push(t);
      if (u > 0 && u < 1) splits[r].push(u);
      crossings++;
    }
  }
  // 4. dangling ends: a path end that no other path touches joins the nearest street within SNAP
  const touch = new Map();
  const tk = (x, y) => `${Math.round(x / MERGE)},${Math.round(y / MERGE)}`;
  for (let s = 0; s < nS; s++) for (const [x, y] of [[S.ax[s], S.ay[s]], [S.bx[s], S.by[s]]]) {
    const k = tk(x, y);
    const set = touch.get(k) || new Set();
    set.add(S.poly[s]); touch.set(k, set);
  }
  const connectors = []; // [x, y, x2, y2, cls]
  for (const [x, y, cls, pl] of polyEnds) {
    const t0 = touch.get(tk(x, y));
    if (t0 && t0.size > 1) continue;
    let best = null;
    const cx = Math.floor(x / G), cy = Math.floor(y / G);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const s of grid.get(gk(cx + dx, cy + dy)) || []) {
        if (S.poly[s] === pl) continue;
        const c = closestOnSeg(x, y, S.ax[s], S.ay[s], S.bx[s], S.by[s]);
        if (c.d <= SNAP && (!best || c.d < best.d)) best = { ...c, s };
      }
    }
    if (!best) continue;
    if (best.t > 0 && best.t < 1) splits[best.s].push(best.t);
    if (best.d > MERGE) connectors.push([x, y, best.x, best.y, cls]);
  }
  // 5. nodes and edges
  const idx = new NodeIndex();
  const ea = [], eb = [], elen = [], ecls = [];
  const addEdge = (x1, y1, x2, y2, c) => {
    const a = idx.get(x1, y1), b = idx.get(x2, y2);
    if (a === b) return;
    ea.push(a); eb.push(b); elen.push(Math.hypot(x2 - x1, y2 - y1)); ecls.push(c);
  };
  for (let s = 0; s < nS; s++) {
    const ts = [...new Set(splits[s])].sort((p, q) => p - q);
    for (let i = 0; i + 1 < ts.length; i++) {
      const dx = S.bx[s] - S.ax[s], dy = S.by[s] - S.ay[s];
      addEdge(S.ax[s] + dx * ts[i], S.ay[s] + dy * ts[i], S.ax[s] + dx * ts[i + 1], S.ay[s] + dy * ts[i + 1], S.cls[s]);
    }
  }
  for (const [x1, y1, x2, y2, c] of connectors) addEdge(x1, y1, x2, y2, c);
  const nN = idx.x.length, nE = ea.length;
  // 6. adjacency (CSR, both directions)
  const deg = new Int32Array(nN + 1);
  for (let e = 0; e < nE; e++) { deg[ea[e] + 1]++; deg[eb[e] + 1]++; }
  for (let i = 0; i < nN; i++) deg[i + 1] += deg[i];
  const adjNode = new Int32Array(2 * nE), adjEdge = new Int32Array(2 * nE), fill = deg.slice(0, nN);
  for (let e = 0; e < nE; e++) {
    adjNode[fill[ea[e]]] = eb[e]; adjEdge[fill[ea[e]]++] = e;
    adjNode[fill[eb[e]]] = ea[e]; adjEdge[fill[eb[e]]++] = e;
  }
  const x = Float64Array.from(idx.x), y = Float64Array.from(idx.y);
  const edges = new Array(nE);
  for (let e = 0; e < nE; e++) edges[e] = { i: e, a: ea[e], b: eb[e], len: elen[e], cls: ecls[e], mx: (x[ea[e]] + x[eb[e]]) / 2, my: (y[ea[e]] + y[eb[e]]) / 2 };
  // 7. connected components
  const comp = new Int32Array(nN).fill(-1), sizes = [];
  const q = new Int32Array(nN);
  for (let s = 0; s < nN; s++) {
    if (comp[s] >= 0) continue;
    const id = sizes.length;
    let h = 0, t = 0;
    q[t++] = s; comp[s] = id;
    while (h < t) { const n = q[h++]; for (let k = deg[n]; k < deg[n + 1]; k++) { const m = adjNode[k]; if (comp[m] < 0) { comp[m] = id; q[t++] = m; } } }
    sizes.push(t);
  }
  const largest = sizes.length ? sizes.indexOf(Math.max(...sizes)) : -1;
  // 8. node lookup grid
  const NG = 200, ngrid = new Map();
  for (let n = 0; n < nN; n++) {
    const k = gk(Math.floor(x[n] / NG), Math.floor(y[n] / NG));
    const b = ngrid.get(k);
    if (b) b.push(n); else ngrid.set(k, [n]);
  }
  return {
    x, y, adjStart: deg, adjNode, adjEdge, edges, comp, sizes, largest, ngrid, NG,
    stats: { nodes: nN, edges: nE, segments: nS, crossings, connectors: connectors.length, components: sizes.length, largestShare: nN ? sizes[largest] / nN : 0 },
  };
}

// Nearest node to (x, y); by default only nodes in the largest connected component.
export function nearestNode(graph, x, y, { anyComponent = false } = {}) {
  const { NG, ngrid } = graph;
  const cx = Math.floor(x / NG), cy = Math.floor(y / NG);
  let best = -1, bd = Infinity;
  for (let ring = 0; ring < 64; ring++) {
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      for (const n of ngrid.get((cx + dx) * 1000003 + (cy + dy)) || []) {
        if (!anyComponent && graph.comp[n] !== graph.largest) continue;
        const d = Math.hypot(graph.x[n] - x, graph.y[n] - y);
        if (d < bd) { bd = d; best = n; }
      }
    }
    if (best >= 0 && bd <= ring * NG) break; // nothing in a farther ring can be closer
  }
  return best;
}

export const dryCost = edge => edge.len / (SPEED_KMH[edge.cls] / 3.6);

// Assumption, not measured: in rain above 20 mm/h a street runs at 0.6 of its dry speed; above 50 mm/h at 0.35.
// rainAt(x, y) → mm/h at the edge midpoint.
export function wetCost(edge, rainAt) {
  const r = rainAt(edge.mx, edge.my);
  const f = r > 50 ? 0.35 : r > 20 ? 0.6 : 1;
  return dryCost(edge) / f;
}

// Dijkstra with a binary heap. from / to: {x, y} or [x, y] in local metres. costFn(edge) → seconds.
export function shortest(graph, from, to, costFn = dryCost) {
  const P = p => (Array.isArray(p) ? { x: p[0], y: p[1] } : p);
  const f = P(from), g = P(to);
  const s = nearestNode(graph, f.x, f.y), t = nearestNode(graph, g.x, g.y);
  if (s < 0 || t < 0) return null;
  const nN = graph.x.length;
  const dist = new Float64Array(nN).fill(Infinity), prevE = new Int32Array(nN).fill(-1);
  const done = new Uint8Array(nN);
  let hk = new Float64Array(1024), hv = new Int32Array(1024), hn = 0;
  const push = (k, v) => {
    if (hn === hk.length) { const k2 = new Float64Array(hn * 2); k2.set(hk); hk = k2; const v2 = new Int32Array(hn * 2); v2.set(hv); hv = v2; }
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
    hk[i] = k; hv[i] = v;
  };
  const pop = () => {
    const v = hv[0];
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
    return v;
  };
  dist[s] = 0; push(0, s);
  while (hn > 0) {
    const n = pop();
    if (done[n]) continue;
    done[n] = 1;
    if (n === t) break;
    for (let k = graph.adjStart[n]; k < graph.adjStart[n + 1]; k++) {
      const m = graph.adjNode[k], e = graph.edges[graph.adjEdge[k]];
      const d = dist[n] + costFn(e);
      if (d < dist[m]) { dist[m] = d; prevE[m] = e.i; push(d, m); }
    }
  }
  if (!isFinite(dist[t])) return null;
  const nodes = [t], coords = [];
  let metres = 0, n = t;
  while (n !== s) { const e = graph.edges[prevE[n]]; metres += e.len; n = e.a === n ? e.b : e.a; nodes.push(n); }
  nodes.reverse();
  for (const k of nodes) coords.push(graph.x[k], graph.y[k]);
  return {
    seconds: dist[t], metres, nodes, coords, from: s, to: t,
    snapFrom: Math.hypot(graph.x[s] - f.x, graph.y[s] - f.y), snapTo: Math.hypot(graph.x[t] - g.x, graph.y[t] - g.y),
  };
}

// lon/lat → local metres for a graph built from data/geo.json
export const toLocal = (geo, lon, lat) => ({ x: (lon - geo.origin.lon) * geo.kx, y: (lat - geo.origin.lat) * geo.ky });
