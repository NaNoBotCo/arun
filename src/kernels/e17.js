// E17 The Resilience Network — kernel. Pure functions, no DOM.
// A fictional service network: sources feed hubs, hubs feed relays, relays feed zones.
// Capacities are units per day. Flow is min-cost max-flow on a node-split graph.
// Nodes are generic facilities with invented names. No map, no real place, no people.

import { makeRng, deriveSeed } from '../core/rng.js';

export const jobs = {};

const EPS = 1e-9;
export const INF = 1e9;
export const UNMET_PENALTY_USD_PER_UNIT = 40;
export const STANDBY_USD_PER_UNIT_DAY = 0.15;
export const WEATHER_DAYS = 3;
export const CREWS = 2;
export const HORIZON_DAYS = 14;
export const RECOVERY_SHARE = 0.95;

// ---------- generic flow routines (tested on their own) ----------

// Dinic max-flow. edges: [{u, v, cap}]. Returns { value, flow: number[] } with one flow per input edge.
export function maxFlow(n, edges, s, t) {
  const g = buildResidual(n, edges.map((e) => ({ ...e, cost: 0 })));
  let value = 0;
  const level = new Int32Array(n);
  const it = new Int32Array(n);
  const bfs = () => {
    level.fill(-1);
    level[s] = 0;
    const q = [s];
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi];
      for (const id of g.adj[u]) {
        const a = g.arcs[id];
        if (a.cap > EPS && level[a.to] < 0) {
          level[a.to] = level[u] + 1;
          q.push(a.to);
        }
      }
    }
    return level[t] >= 0;
  };
  const dfs = (u, f) => {
    if (u === t) return f;
    for (; it[u] < g.adj[u].length; it[u]++) {
      const id = g.adj[u][it[u]];
      const a = g.arcs[id];
      if (a.cap > EPS && level[a.to] === level[u] + 1) {
        const d = dfs(a.to, Math.min(f, a.cap));
        if (d > EPS) {
          a.cap -= d;
          g.arcs[id ^ 1].cap += d;
          return d;
        }
      }
    }
    return 0;
  };
  while (bfs()) {
    it.fill(0);
    let f;
    while ((f = dfs(s, INF)) > EPS) value += f;
  }
  return { value, flow: edges.map((e, i) => g.arcs[2 * i + 1].cap) };
}

function buildResidual(n, edges) {
  const arcs = [];
  const adj = Array.from({ length: n }, () => []);
  edges.forEach((e, i) => {
    if (!(e.cap >= 0) || !Number.isFinite(e.cap)) throw new Error(`edge ${i} has an invalid capacity`);
    arcs.push({ to: e.v, cap: e.cap, cost: e.cost || 0 });
    arcs.push({ to: e.u, cap: 0, cost: -(e.cost || 0) });
    adj[e.u].push(2 * i);
    adj[e.v].push(2 * i + 1);
  });
  return { arcs, adj };
}

// Min-cost max-flow by successive shortest paths (SPFA). Costs must be >= 0 on input edges.
export function minCostMaxFlow(n, edges, s, t) {
  const g = buildResidual(n, edges);
  let value = 0, cost = 0;
  const dist = new Float64Array(n);
  const prev = new Int32Array(n);
  const inq = new Uint8Array(n);
  for (let guard = 0; guard < 100000; guard++) {
    dist.fill(Infinity);
    prev.fill(-1);
    dist[s] = 0;
    const q = [s];
    inq.fill(0);
    inq[s] = 1;
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi];
      inq[u] = 0;
      for (const id of g.adj[u]) {
        const a = g.arcs[id];
        if (a.cap > EPS && dist[u] + a.cost < dist[a.to] - 1e-12) {
          dist[a.to] = dist[u] + a.cost;
          prev[a.to] = id;
          if (!inq[a.to]) {
            inq[a.to] = 1;
            q.push(a.to);
          }
        }
      }
      if (q.length > 4000000) throw new Error('flow search did not converge');
    }
    if (!Number.isFinite(dist[t])) break;
    let f = INF;
    for (let v = t; v !== s; v = g.arcs[prev[v] ^ 1].to) f = Math.min(f, g.arcs[prev[v]].cap);
    for (let v = t; v !== s; v = g.arcs[prev[v] ^ 1].to) {
      g.arcs[prev[v]].cap -= f;
      g.arcs[prev[v] ^ 1].cap += f;
    }
    value += f;
    cost += f * dist[t];
  }
  return { value, cost, flow: edges.map((e, i) => g.arcs[2 * i + 1].cap), residual: g };
}

// ---------- the fictional network ----------

const N = (id, label, kind, cap, x, y, repair_usd, repair_days) => ({ id, label, kind, cap, x, y, repair_usd, repair_days });
export const NODES = [
  N('S1', 'River pump', 'source', 95, 0.07, 0.17, 45000, 5),
  N('S2', 'Hill well', 'source', 70, 0.07, 0.5, 45000, 5),
  N('S3', 'East depot', 'source', 60, 0.07, 0.83, 45000, 5),
  N('H1', 'North hub', 'hub', 110, 0.32, 0.17, 80000, 7),
  N('H2', 'Central hub', 'hub', 130, 0.32, 0.5, 80000, 7),
  N('H3', 'South hub', 'hub', 100, 0.32, 0.83, 80000, 7),
  N('R1', 'West relay', 'relay', 90, 0.58, 0.1, 30000, 3),
  N('R2', 'Mid relay', 'relay', 110, 0.58, 0.37, 30000, 3),
  N('R3', 'Lake relay', 'relay', 90, 0.58, 0.63, 30000, 3),
  N('R4', 'Ridge relay', 'relay', 70, 0.58, 0.9, 30000, 3),
  N('Z1', 'Mill Row', 'zone', 45, 0.88, 0.1, 0, 0),
  N('Z2', 'Terrace', 'zone', 60, 0.88, 0.37, 0, 0),
  N('Z3', 'Harbor Flats', 'zone', 50, 0.88, 0.63, 0, 0),
  N('Z4', 'Quarry Rise', 'zone', 40, 0.88, 0.9, 0, 0),
];
const E = (u, v, cap, cost, exposed = false, backup = false) => ({ u, v, cap, cost, exposed, backup });
export const EDGES = [
  E('S1', 'H1', 70, 1.0, true),
  E('S1', 'H2', 45, 1.2),
  E('S2', 'H2', 70, 0.8),
  E('S3', 'H3', 60, 1.0),
  E('H1', 'R1', 70, 0.7),
  E('H1', 'R2', 45, 0.9, true),
  E('H2', 'R2', 80, 0.6),
  E('H2', 'R3', 70, 0.8, true),
  E('H3', 'R3', 50, 0.9),
  E('H3', 'R4', 70, 0.7),
  E('R1', 'Z1', 55, 0.5),
  E('R2', 'Z2', 80, 0.5),
  E('R3', 'Z3', 70, 0.5, true),
  E('R3', 'Z2', 25, 0.8),
  E('R4', 'Z4', 55, 0.5, true),
  // standby links: capacity scales with the redundancy setting
  E('S2', 'H3', 40, 1.5, false, true),
  E('S3', 'H2', 40, 1.4, false, true),
  E('H2', 'R1', 35, 1.1, false, true),
  E('H2', 'R4', 35, 1.1, false, true),
  E('R2', 'Z1', 30, 0.9, false, true),
  E('R2', 'Z3', 30, 1.0, false, true),
  E('R3', 'Z4', 30, 1.0, false, true),
];
export const NODE_IDS = NODES.map((n) => n.id);
const nodeIndex = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
export const isFailable = (id) => NODES[nodeIndex[id]] && NODES[nodeIndex[id]].kind !== 'zone';

export const DEFAULTS = {
  demandScale: 1.0,
  weatherReduction: 0.35,
  redundancy: 0.5,
  repairBudget_usd: 120000,
  outages: ['H2'],
};

const RANGES = {
  demandScale: [0.4, 1.8],
  weatherReduction: [0, 0.9],
  redundancy: [0, 1],
  repairBudget_usd: [0, 400000],
};

export function validate(config) {
  const c = { ...DEFAULTS, ...config };
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (!Number.isFinite(c[k]) || c[k] < lo || c[k] > hi) throw new Error(`${k} must be between ${lo} and ${hi}`);
  }
  if (!Array.isArray(c.outages)) throw new Error('outages must be a list of node ids');
  const seen = new Set();
  for (const id of c.outages) {
    if (!(id in nodeIndex)) throw new Error(`unknown node ${id}`);
    if (!isFailable(id)) throw new Error(`${id} is a demand zone and cannot be knocked out`);
    seen.add(id);
  }
  c.outages = [...seen];
  return c;
}

// Which nodes fail: drawn from the seed, never zones.
export function pickOutages(seed, count) {
  const rng = makeRng(deriveSeed(seed, 'outage'));
  const pool = NODE_IDS.filter(isFailable);
  const out = [];
  while (out.length < Math.min(count, pool.length)) {
    const id = pool.splice(rng.int(pool.length), 1)[0];
    out.push(id);
  }
  return out;
}

// Build the node-split flow graph for one state.
export function buildGraph(cfg, offline = new Set(), weatherOn = false) {
  const n = NODES.length;
  const ss = 2 * n, tt = 2 * n + 1;
  const edges = [];
  const tags = [];
  NODES.forEach((node, i) => {
    let cap = node.kind === 'zone' ? node.cap * cfg.demandScale : node.cap;
    if (offline.has(node.id)) cap = 0;
    edges.push({ u: 2 * i, v: 2 * i + 1, cap, cost: 0 });
    tags.push({ type: 'node', id: node.id });
    if (node.kind === 'source') {
      edges.push({ u: ss, v: 2 * i, cap: INF, cost: 0 });
      tags.push({ type: 'feed', id: node.id });
    }
    if (node.kind === 'zone') {
      edges.push({ u: 2 * i + 1, v: tt, cap: INF, cost: 0 });
      tags.push({ type: 'drain', id: node.id });
    }
  });
  EDGES.forEach((e, k) => {
    let cap = e.cap;
    if (e.backup) cap *= cfg.redundancy;
    if (e.exposed && weatherOn) cap *= 1 - cfg.weatherReduction;
    edges.push({ u: 2 * nodeIndex[e.u] + 1, v: 2 * nodeIndex[e.v], cap, cost: e.cost });
    tags.push({ type: 'edge', k });
  });
  return { n: 2 * n + 2, ss, tt, edges, tags };
}

// Solve one state. Returns per-edge and per-node flow plus unmet demand and daily cost.
export function solveState(cfg, offline = new Set(), weatherOn = false) {
  const g = buildGraph(cfg, offline, weatherOn);
  const r = minCostMaxFlow(g.n, g.edges, g.ss, g.tt);
  const edgeFlow = new Array(EDGES.length).fill(0);
  const edgeCap = new Array(EDGES.length).fill(0);
  const nodeFlow = {};
  const zoneServed = {};
  g.tags.forEach((tg, i) => {
    if (tg.type === 'edge') {
      edgeFlow[tg.k] = r.flow[i];
      edgeCap[tg.k] = g.edges[i].cap;
    } else if (tg.type === 'node') nodeFlow[tg.id] = r.flow[i];
  });
  let demand = 0;
  for (const node of NODES) {
    if (node.kind === 'zone') {
      const d = node.cap * cfg.demandScale;
      demand += d;
      zoneServed[node.id] = { demand: d, served: nodeFlow[node.id] };
    }
  }
  const served = r.value;
  const unmet = Math.max(0, demand - served);
  let standby = 0;
  for (const e of EDGES) if (e.backup) standby += e.cap * cfg.redundancy * STANDBY_USD_PER_UNIT_DAY;
  return {
    demand, served, unmet,
    operating_usd_day: r.cost,
    standby_usd_day: standby,
    penalty_usd_day: unmet * UNMET_PENALTY_USD_PER_UNIT,
    edgeFlow, edgeCap, nodeFlow, zoneServed,
    offline: [...offline],
    weatherOn,
  };
}

// Greedy repair: fund the damaged node with the best unmet-demand reduction per dollar, within budget.
// Crews work in parallel; each repair starts when a crew is free.
export function repairPlan(cfg) {
  const damaged = cfg.outages.slice();
  let left = cfg.repairBudget_usd;
  const funded = [];
  const offline = new Set(damaged);
  let current = solveState(cfg, offline, false).unmet;
  const pool = damaged.slice();
  while (pool.length) {
    let bestId = null, bestScore = -1, bestUnmet = current;
    for (const id of pool) {
      const node = NODES[nodeIndex[id]];
      if (node.repair_usd > left + 1e-9) continue;
      const trial = new Set(offline);
      trial.delete(id);
      const u = solveState(cfg, trial, false).unmet;
      const score = (current - u) / node.repair_usd;
      if (score > bestScore + 1e-12) {
        bestScore = score;
        bestId = id;
        bestUnmet = u;
      }
    }
    if (bestId === null) break;
    pool.splice(pool.indexOf(bestId), 1);
    offline.delete(bestId);
    left -= NODES[nodeIndex[bestId]].repair_usd;
    current = bestUnmet;
    funded.push(bestId);
  }
  const crewFree = new Array(CREWS).fill(0);
  const repairs = funded.map((id) => {
    const node = NODES[nodeIndex[id]];
    let c = 0;
    for (let k = 1; k < CREWS; k++) if (crewFree[k] < crewFree[c]) c = k;
    const start = crewFree[c];
    const finish = start + node.repair_days;
    crewFree[c] = finish;
    return { id, label: node.label, cost_usd: node.repair_usd, crew: c, start_day: start, finish_day: finish };
  });
  return { repairs, spent_usd: cfg.repairBudget_usd - left, unfunded: pool, left_usd: left };
}

// The event: outages at day 0, storm for WEATHER_DAYS, repairs finishing on their days.
export function simulateEvent(config) {
  const cfg = validate(config);
  const plan = repairPlan(cfg);
  const times = new Set([0]);
  if (cfg.weatherReduction > 0) times.add(WEATHER_DAYS);
  for (const r of plan.repairs) times.add(r.finish_day);
  const ts = [...times].filter((t) => t < HORIZON_DAYS).sort((a, b) => a - b);
  const segments = ts.map((t, i) => {
    const offline = new Set(cfg.outages.filter((id) => !plan.repairs.some((r) => r.id === id && r.finish_day <= t)));
    const weatherOn = cfg.weatherReduction > 0 && t < WEATHER_DAYS;
    const st = solveState(cfg, offline, weatherOn);
    return { t0: t, t1: i + 1 < ts.length ? ts[i + 1] : HORIZON_DAYS, state: st };
  });
  const base = solveState(cfg, new Set(), false);
  let unmetUnitDays = 0, operating = 0, standby = 0, penalty = 0, servedUnitDays = 0;
  for (const s of segments) {
    const d = s.t1 - s.t0;
    unmetUnitDays += s.state.unmet * d;
    servedUnitDays += s.state.served * d;
    operating += s.state.operating_usd_day * d;
    standby += s.state.standby_usd_day * d;
    penalty += s.state.penalty_usd_day * d;
  }
  const total = operating + standby + penalty + plan.spent_usd;
  // Recovery: first time served reaches RECOVERY_SHARE of the undamaged level, and stays there.
  let recovery = null;
  const target = RECOVERY_SHARE * base.served;
  for (let i = 0; i < segments.length; i++) {
    if (segments.slice(i).every((s) => s.state.served >= target - 1e-9)) {
      recovery = segments[i].t0;
      break;
    }
  }
  const worst = segments.reduce((m, s) => Math.max(m, s.state.unmet), 0);
  return {
    config: cfg, plan, segments, baseline: base,
    metrics: {
      demand_units_day: base.demand,
      peak_unmet_units_day: worst,
      peak_unmet_share: base.demand > 0 ? worst / base.demand : 0,
      unmet_unit_days: unmetUnitDays,
      served_unit_days: servedUnitDays,
      undamaged_unmet_units_day: base.unmet,
      recovery_days: recovery,
      operating_usd: operating,
      standby_usd: standby,
      unmet_penalty_usd: penalty,
      repair_usd: plan.spent_usd,
      total_usd: total,
    },
    horizonDays: HORIZON_DAYS,
  };
}

// Unmet demand when each facility fails alone (no storm), at the given redundancy.
export function criticality(config) {
  const cfg = validate(config);
  return NODE_IDS.filter(isFailable).map((id) => {
    const st = solveState(cfg, new Set([id]), false);
    return { id, label: NODES[nodeIndex[id]].label, unmet: st.unmet, share: st.demand > 0 ? st.unmet / st.demand : 0 };
  });
}

// State at a day in the event (for animation).
export function stateAt(result, day) {
  let seg = result.segments[0];
  for (const s of result.segments) if (day >= s.t0 - 1e-9) seg = s;
  return seg.state;
}

export function toTable(result) {
  const rows = [];
  for (const s of result.segments) {
    rows.push([s.t0, s.t1, s.state.offline.join(' '), s.state.weatherOn ? 1 : 0, s.state.demand, s.state.served, s.state.unmet, s.state.operating_usd_day, s.state.standby_usd_day, s.state.penalty_usd_day]);
  }
  return {
    columns: ['from_day', 'to_day', 'offline_nodes', 'storm', 'demand_units_day', 'served_units_day', 'unmet_units_day', 'operating_usd_day', 'standby_usd_day', 'unmet_penalty_usd_day'],
    rows,
  };
}
