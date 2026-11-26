// E20 kernel: a small allocation problem with three outcomes (profit, ecological burden, aggregate access).
// Linear program solved by exact vertex enumeration, so every answer is a corner of the feasible region.
// Weights choose among feasible allocations; they never change which allocations are feasible.
// All names, units and numbers are fictional and editable. Pure functions, no DOM.

import { makeRng } from '../core/rng.js';

export const MAX_ACTIVITIES = 6;
export const MAX_RESOURCES = 5;
const TOL = 1e-9;

export const DEFAULT_PROBLEM = Object.freeze({
  name: 'A fictional valley',
  resources: [
    { name: 'Water', unit: 'ML', cap: 260 },
    { name: 'Power', unit: 'MWh', cap: 60 },
    { name: 'Soil', unit: 'ha', cap: 50 },
    { name: 'Investment', unit: 'US$k', cap: 520 },
  ],
  activities: [
    { name: 'Rice terraces', use: [6, 0.5, 1, 8], revenue_usd_k: 11, cost_usd_k: 6, burden: 3, access: 5 },
    { name: 'Orchard rows', use: [3, 0.3, 1, 12], revenue_usd_k: 18, cost_usd_k: 8, burden: 2, access: 2 },
    { name: 'Cold-store bays', use: [1, 5, 0.25, 20], revenue_usd_k: 30, cost_usd_k: 14, burden: 5, access: 1 },
    { name: 'Wetland buffer', use: [2, 0.1, 1, 6], revenue_usd_k: 1.5, cost_usd_k: 1, burden: -3, access: 1 },
  ],
  price: 1,
  burdenCap: 120,
  accessFloor: 100,
});

export function cloneProblem(p) {
  return JSON.parse(JSON.stringify(p));
}

function fin(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} must be a finite number`);
  return v;
}

export function validateProblem(p) {
  if (!p || !Array.isArray(p.resources) || !Array.isArray(p.activities)) throw new Error('problem needs resources and activities');
  const m = p.resources.length;
  const n = p.activities.length;
  if (m < 1 || m > MAX_RESOURCES) throw new Error(`resources must number 1 to ${MAX_RESOURCES}`);
  if (n < 1 || n > MAX_ACTIVITIES) throw new Error(`activities must number 1 to ${MAX_ACTIVITIES}`);
  p.resources.forEach((r) => {
    if (fin(r.cap, `${r.name} cap`) < 0) throw new Error(`${r.name} cap must be 0 or more`);
  });
  p.activities.forEach((a) => {
    if (!Array.isArray(a.use) || a.use.length !== m) throw new Error(`${a.name} needs ${m} resource use values`);
    a.use.forEach((u, i) => {
      if (fin(u, `${a.name} use of ${p.resources[i].name}`) < 0) throw new Error(`${a.name} use of ${p.resources[i].name} must be 0 or more`);
    });
    if (!a.use.some((u, i) => u > 0 && p.resources[i].cap >= 0)) throw new Error(`${a.name} must use at least one resource, or the problem is unbounded`);
    fin(a.revenue_usd_k, `${a.name} revenue`);
    fin(a.cost_usd_k, `${a.name} cost`);
    fin(a.burden, `${a.name} burden`);
    if (fin(a.access, `${a.name} access`) < 0) throw new Error(`${a.name} access must be 0 or more`);
  });
  if (fin(p.price, 'price') <= 0) throw new Error('price must be above 0');
  if (p.burdenCap !== null && p.burdenCap !== undefined) fin(p.burdenCap, 'burdenCap');
  if (fin(p.accessFloor, 'accessFloor') < 0) throw new Error('accessFloor must be 0 or more');
  return true;
}

export function normalizeWeights(w) {
  if (!w || ![w.profit, w.burden, w.access].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new Error('weights must be numbers of 0 or more');
  const s = w.profit + w.burden + w.access;
  if (!(s > 0)) throw new Error('at least one weight must be above 0');
  return { profit: w.profit / s, burden: w.burden / s, access: w.access / s };
}

// Constraint rows in the form g·x ≤ b.
export function buildRows(p) {
  const n = p.activities.length;
  const rows = [];
  p.resources.forEach((r, i) => rows.push({ name: `${r.name} cap`, kind: 'resource', index: i, g: p.activities.map((a) => a.use[i]), b: r.cap, unit: r.unit }));
  if (p.burdenCap !== null && p.burdenCap !== undefined) rows.push({ name: 'Ecological burden cap', kind: 'burden', g: p.activities.map((a) => a.burden), b: p.burdenCap, unit: 'index' });
  rows.push({ name: 'Aggregate access floor', kind: 'floor', g: p.activities.map((a) => -a.access), b: -p.accessFloor, unit: 'access units' });
  for (let j = 0; j < n; j++) rows.push({ name: `${p.activities[j].name} ≥ 0`, kind: 'nonneg', g: p.activities.map((_, k) => (k === j ? -1 : 0)), b: 0, unit: '' });
  return rows;
}

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f !== 0) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

function combos(total, k, fn) {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > total) return;
  for (;;) {
    fn(idx);
    let i = k - 1;
    while (i >= 0 && idx[i] === total - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const feasibleTol = (row) => 1e-9 * (1 + Math.abs(row.b));

// Rows with all-zero coefficients cannot be vertices; they either hold for every x or for none.
function zeroRowVerdict(rows) {
  for (const r of rows) if (r.g.every((v) => v === 0) && r.b < -feasibleTol(r)) return r;
  return null;
}

// All feasible corners of the region. `skip` is a set of row names to leave out (used to diagnose infeasibility).
export function feasibleVertices(p, skip = new Set()) {
  validateProblem(p);
  const n = p.activities.length;
  const rows = buildRows(p).filter((r) => !skip.has(r.name));
  if (zeroRowVerdict(rows)) return { rows, vertices: [] };
  const live = rows.filter((r) => !r.g.every((v) => v === 0));
  const out = [];
  const seen = new Set();
  combos(live.length, n, (idx) => {
    const x = solveLinear(idx.map((i) => live[i].g), idx.map((i) => live[i].b));
    if (!x) return;
    for (let i = 0; i < n; i++) if (Math.abs(x[i]) < 1e-11) x[i] = 0;
    for (const r of live) if (dot(r.g, x) > r.b + feasibleTol(r)) return;
    const key = x.map((v) => v.toFixed(8)).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(x);
  });
  return { rows, vertices: out };
}

export function outcomes(p, x) {
  let profit = 0;
  let burden = 0;
  let access = 0;
  p.activities.forEach((a, j) => {
    profit += (p.price * a.revenue_usd_k - a.cost_usd_k) * x[j];
    burden += a.burden * x[j];
    access += a.access * x[j];
  });
  return { profit_usd_k: profit, burden, access };
}

export function resourceUse(p, x) {
  return p.resources.map((r, i) => {
    const parts = p.activities.map((a, j) => a.use[i] * x[j]);
    const used = parts.reduce((s, v) => s + v, 0);
    return { name: r.name, unit: r.unit, cap: r.cap, used, unused: r.cap - used, parts };
  });
}

// Normalising ranges taken over every feasible corner, so weights compare like with like.
export function ranges(p, vertices) {
  const o = vertices.map((x) => outcomes(p, x));
  const rng = (k) => {
    const v = o.map((q) => q[k]);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    return { lo, hi, span: hi - lo };
  };
  return { profit: rng('profit_usd_k'), burden: rng('burden'), access: rng('access') };
}

function coefficients(p, w, rg) {
  const W = normalizeWeights(w);
  const cp = rg.profit.span > TOL ? W.profit / rg.profit.span : 0;
  const ce = rg.burden.span > TOL ? W.burden / rg.burden.span : 0;
  const cg = rg.access.span > TOL ? W.access / rg.access.span : 0;
  return p.activities.map((a) => cp * (p.price * a.revenue_usd_k - a.cost_usd_k) - ce * a.burden + cg * a.access);
}

function scoreOf(p, w, rg, o) {
  const W = normalizeWeights(w);
  const part = (wt, span, v) => (span > TOL ? (wt * v) / span : 0);
  return (
    part(W.profit, rg.profit.span, o.profit_usd_k - rg.profit.lo) +
    part(W.burden, rg.burden.span, rg.burden.hi - o.burden) +
    part(W.access, rg.access.span, o.access - rg.access.lo)
  );
}

function diagnose(p) {
  const rows = buildRows(p).filter((r) => r.kind !== 'nonneg');
  const fixes = [];
  for (const r of rows) {
    const { vertices } = feasibleVertices(p, new Set([r.name]));
    if (vertices.length) fixes.push(r.name);
  }
  const noFloor = feasibleVertices(p, new Set(['Aggregate access floor']));
  let maxAccess = null;
  if (noFloor.vertices.length) maxAccess = Math.max(...noFloor.vertices.map((x) => outcomes(p, x).access));
  return { relaxingAnyOneOf: fixes, maxAccessWithoutFloor: maxAccess };
}

// Duals from the active set. Valid only at a non-degenerate corner (exactly n active rows, solvable, all ≥ 0).
function shadowPrices(rows, x, c, n) {
  const active = [];
  rows.forEach((r, i) => {
    if (r.g.every((v) => v === 0)) return;
    if (Math.abs(dot(r.g, x) - r.b) <= 1e-7 * (1 + Math.abs(r.b))) active.push(i);
  });
  if (active.length !== n) return { valid: false, reason: active.length > n ? 'The optimum is a degenerate corner (more constraints meet there than there are activities), so the prices are not unique.' : 'No corner found.', values: null, active };
  const A = Array.from({ length: n }, (_, k) => active.map((i) => rows[i].g[k]));
  const y = solveLinear(A, c);
  if (!y) return { valid: false, reason: 'The binding constraints are not independent.', values: null, active };
  if (y.some((v) => v < -1e-9)) return { valid: false, reason: 'A price came out negative, so this corner is not optimal.', values: null, active };
  const values = rows.map(() => 0);
  active.forEach((i, k) => (values[i] = Math.max(0, y[k])));
  return { valid: true, reason: '', values, active };
}

// Solve for one weight vector. Returns status 'optimal' or 'infeasible'.
export function solve(p, weights, ctx = null) {
  validateProblem(p);
  const W = normalizeWeights(weights);
  const n = p.activities.length;
  const base = ctx || feasibleVertices(p);
  const { rows, vertices } = base;
  if (!vertices.length) {
    const bad = zeroRowVerdict(rows);
    return {
      status: 'infeasible',
      reason: bad ? `${bad.name} cannot be met by any allocation.` : 'No allocation meets every constraint at once.',
      diagnosis: diagnose(p),
      weights: W,
    };
  }
  const rg = ranges(p, vertices);
  const c = coefficients(p, W, rg);
  let best = -Infinity;
  let bx = null;
  for (const x of vertices) {
    const v = dot(c, x);
    if (v > best + 1e-12) {
      best = v;
      bx = x;
    }
  }
  const o = outcomes(p, bx);
  const use = resourceUse(p, bx);
  const slack = rows.map((r) => r.b - dot(r.g, bx));
  const binding = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => r.kind !== 'nonneg' && !r.g.every((v) => v === 0) && Math.abs(slack[i]) <= 1e-7 * (1 + Math.abs(r.b))).map(({ r }) => r.name);
  const duals = shadowPrices(rows, bx, c, n);
  const shadow = rows
    .map((r, i) => ({ name: r.name, kind: r.kind, unit: r.unit, price_score_per_unit: duals.valid ? duals.values[i] : null, profit_equivalent_usd_k_per_unit: duals.valid && W.profit > 0 && rg.profit.span > TOL ? (duals.values[i] * rg.profit.span) / W.profit : null }))
    .filter((s, k) => s.kind !== 'nonneg' && !rows[k].g.every((v) => v === 0));
  return {
    status: 'optimal',
    x: Array.from(bx),
    outcomes: o,
    score: scoreOf(p, W, rg, o),
    weights: W,
    ranges: rg,
    use,
    binding,
    slack: rows.map((r, i) => ({ name: r.name, kind: r.kind, slack: slack[i], trivial: r.g.every((v) => v === 0) })).filter((s) => s.kind !== 'nonneg' && !s.trivial),
    shadow,
    shadowValid: duals.valid,
    shadowReason: duals.reason,
    vertexCount: vertices.length,
  };
}

function dominates(a, b) {
  const ge = a.profit_usd_k >= b.profit_usd_k - 1e-9 && a.burden <= b.burden + 1e-9 && a.access >= b.access - 1e-9;
  const gt = a.profit_usd_k > b.profit_usd_k + 1e-9 || a.burden < b.burden - 1e-9 || a.access > b.access + 1e-9;
  return ge && gt;
}

// Weight grid in steps of 1/k over the simplex; each solution is a feasible corner; keep the non-dominated ones.
export function frontier(p, k = 10) {
  if (!Number.isInteger(k) || k < 1 || k > 40) throw new Error('k must be a whole number from 1 to 40');
  const ctx = feasibleVertices(p);
  if (!ctx.vertices.length) return { status: 'infeasible', points: [], all: [], ctx };
  const all = [];
  for (let i = 0; i <= k; i++)
    for (let j = 0; i + j <= k; j++) {
      const w = { profit: i / k, burden: j / k, access: (k - i - j) / k };
      const s = solve(p, w, ctx);
      all.push({ weights: s.weights, x: s.x, outcomes: s.outcomes });
    }
  const uniq = [];
  const seen = new Set();
  for (const pt of all) {
    const key = pt.x.map((v) => v.toFixed(7)).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(pt);
  }
  const points = uniq.filter((a) => !uniq.some((b) => b !== a && dominates(b.outcomes, a.outcomes)));
  points.sort((a, b) => a.outcomes.profit_usd_k - b.outcomes.profit_usd_k || a.outcomes.burden - b.outcomes.burden);
  return { status: 'ok', points, all: uniq, ctx };
}

// Random feasible allocations: convex mixes of feasible corners, so every sample is feasible by construction.
export function sampleFeasible(p, ctx, n, seed) {
  if (!Number.isInteger(n) || n < 1 || n > 20000) throw new Error('n must be a whole number from 1 to 20000');
  const V = ctx.vertices;
  const rng = makeRng(seed);
  const out = [];
  for (let s = 0; s < n && V.length; s++) {
    const k = Math.min(V.length, 2 + rng.int(3));
    const picks = Array.from({ length: k }, () => V[rng.int(V.length)]);
    const w = picks.map(() => -Math.log(rng.open01()));
    const tot = w.reduce((a, b) => a + b, 0);
    const x = p.activities.map((_, j) => picks.reduce((a, v, i) => a + (w[i] / tot) * v[j], 0));
    out.push({ x, outcomes: outcomes(p, x) });
  }
  return out;
}

// Convex hull of the (profit, burden) image of the feasible corners: the exact feasible outcome region in that plane.
export function hull2D(points) {
  const pts = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const uniq = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  if (uniq.length < 3) return uniq;
  const lower = [];
  for (const q of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of uniq.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function checkAllocation(p, x) {
  const rows = buildRows(p);
  const bad = [];
  rows.forEach((r) => {
    if (r.g.every((v) => v === 0)) return;
    if (dot(r.g, x) > r.b + 1e-7 * (1 + Math.abs(r.b))) bad.push(r.name);
  });
  return { ok: bad.length === 0, violated: bad };
}

export const jobs = {};
