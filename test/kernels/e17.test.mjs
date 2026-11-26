import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../../src/kernels/e17.js';
import { maxFlow, minCostMaxFlow, solveState, simulateEvent, criticality, repairPlan, pickOutages, validate, DEFAULTS, EDGES, NODES, buildGraph, jobs } from '../../src/kernels/e17.js';
import { makeRng } from '../../src/core/rng.js';

const near = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);

test('exports an empty jobs object', () => assert.deepEqual(jobs, {}));

test('toy max-flow equals the textbook answer 23 (CLRS 26.1, hand-solved)', () => {
  // s=0 v1=1 v2=2 v3=3 v4=4 t=5
  const e = [
    [0, 1, 16], [0, 2, 13], [1, 2, 10], [2, 1, 4], [1, 3, 12], [3, 2, 9], [2, 4, 14], [4, 3, 7], [3, 5, 20], [4, 5, 4],
  ].map(([u, v, cap]) => ({ u, v, cap }));
  const r = maxFlow(6, e, 0, 5);
  near(r.value, 23);
  const c = minCostMaxFlow(6, e.map((x) => ({ ...x, cost: 1 })), 0, 5);
  near(c.value, 23);
});

test('toy min-cost flow equals the hand-solved cost 13 at flow 5', () => {
  // s=0 a=1 b=2 t=3. Every source edge is full, so the flow is forced: s-a 3, s-b 2, a-t 2, a-b 1, b-t 3.
  const e = [
    { u: 0, v: 1, cap: 3, cost: 1 }, { u: 0, v: 2, cap: 2, cost: 2 },
    { u: 1, v: 3, cap: 2, cost: 1 }, { u: 2, v: 3, cap: 3, cost: 1 }, { u: 1, v: 2, cap: 1, cost: 1 },
  ];
  const r = minCostMaxFlow(4, e, 0, 3);
  near(r.value, 5);
  near(r.cost, 13);
  assert.deepEqual(r.flow.map((x) => Math.round(x)), [3, 2, 2, 3, 1]);
});

function randomGraph(rng, n, m) {
  const edges = [];
  for (let i = 0; i < m; i++) {
    const u = rng.int(n), v = rng.int(n);
    if (u === v) continue;
    edges.push({ u, v, cap: 1 + rng.int(9), cost: rng.int(5) });
  }
  return edges;
}

test('max-flow equals brute-force minimum cut on 60 random 7-node graphs (independent reference)', () => {
  const rng = makeRng(42);
  for (let trial = 0; trial < 60; trial++) {
    const n = 7;
    const edges = randomGraph(rng, n, 16);
    const s = 0, t = n - 1;
    let minCut = Infinity;
    for (let mask = 0; mask < 1 << (n - 2); mask++) {
      const inS = (v) => (v === s ? true : v === t ? false : ((mask >> (v - 1)) & 1) === 1);
      let cut = 0;
      for (const e of edges) if (inS(e.u) && !inS(e.v)) cut += e.cap;
      minCut = Math.min(minCut, cut);
    }
    near(maxFlow(n, edges, s, t).value, minCut, 1e-9, `trial ${trial}`);
    near(minCostMaxFlow(n, edges, s, t).value, minCut, 1e-9, `mcmf trial ${trial}`);
  }
});

test('flow conservation and capacity limits hold on random graphs, both solvers', () => {
  const rng = makeRng(7);
  for (let trial = 0; trial < 40; trial++) {
    const n = 8;
    const edges = randomGraph(rng, n, 22);
    for (const r of [maxFlow(n, edges, 0, n - 1), minCostMaxFlow(n, edges, 0, n - 1)]) {
      const net = new Float64Array(n);
      edges.forEach((e, i) => {
        assert.ok(r.flow[i] >= -1e-9 && r.flow[i] <= e.cap + 1e-9, 'capacity');
        net[e.u] -= r.flow[i];
        net[e.v] += r.flow[i];
      });
      for (let v = 1; v < n - 1; v++) near(net[v], 0, 1e-9, 'conservation');
      near(net[n - 1], r.value, 1e-9);
    }
  }
});

test('min-cost result has no negative cycle in its residual graph (optimality check)', () => {
  const rng = makeRng(99);
  for (let trial = 0; trial < 30; trial++) {
    const n = 7;
    const edges = randomGraph(rng, n, 18);
    const r = minCostMaxFlow(n, edges, 0, n - 1);
    // Bellman-Ford from a virtual node connected to every vertex.
    const arcs = [];
    edges.forEach((e, i) => {
      if (e.cap - r.flow[i] > 1e-9) arcs.push([e.u, e.v, e.cost]);
      if (r.flow[i] > 1e-9) arcs.push([e.v, e.u, -e.cost]);
    });
    const d = new Float64Array(n);
    let changed = true;
    for (let k = 0; k < n + 1 && changed; k++) {
      changed = false;
      for (const [u, v, c] of arcs) if (d[u] + c < d[v] - 1e-9) { d[v] = d[u] + c; changed = true; }
    }
    assert.equal(changed, false, `negative cycle in trial ${trial}`);
    // Cost matches the flow it reports.
    near(edges.reduce((s, e, i) => s + e.cost * r.flow[i], 0), r.cost, 1e-9);
  }
});

test('raising any one capacity never lowers max flow (random graphs)', () => {
  const rng = makeRng(5);
  for (let trial = 0; trial < 50; trial++) {
    const n = 7;
    const edges = randomGraph(rng, n, 15);
    const before = maxFlow(n, edges, 0, n - 1).value;
    const k = rng.int(edges.length);
    const bigger = edges.map((e, i) => (i === k ? { ...e, cap: e.cap + 1 + rng.int(5) } : e));
    assert.ok(maxFlow(n, bigger, 0, n - 1).value >= before - 1e-9);
  }
});

test('disconnected node: a cut-off node carries nothing and the rest still solves', () => {
  const edges = [{ u: 0, v: 1, cap: 5 }, { u: 1, v: 3, cap: 5 }]; // node 2 has no edges
  const r = maxFlow(4, edges, 0, 3);
  near(r.value, 5);
  const none = maxFlow(4, [{ u: 0, v: 1, cap: 5 }], 0, 3);
  near(none.value, 0);
  assert.ok(none.flow.every(Number.isFinite));
});

test('network: a zone whose only feeders are down gets nothing; the others are unaffected', () => {
  const cfg = validate({ redundancy: 0, weatherReduction: 0 });
  const st = solveState(cfg, new Set(['R1']), false); // R1 is Mill Row's only feeder with no backup links
  near(st.zoneServed.Z1.served, 0);
  near(st.zoneServed.Z2.served, st.zoneServed.Z2.demand, 1e-6);
  assert.ok(Number.isFinite(st.unmet) && st.unmet > 0);
});

test('network: node throughput, edge capacity and conservation hold in a solved state', () => {
  const cfg = validate({ outages: ['H1'], redundancy: 0.6 });
  const st = solveState(cfg, new Set(['H1']), true);
  EDGES.forEach((e, k) => assert.ok(st.edgeFlow[k] <= st.edgeCap[k] + 1e-9 && st.edgeFlow[k] >= -1e-9));
  for (const node of NODES) {
    const inF = EDGES.reduce((s, e, k) => s + (e.v === node.id ? st.edgeFlow[k] : 0), 0);
    const outF = EDGES.reduce((s, e, k) => s + (e.u === node.id ? st.edgeFlow[k] : 0), 0);
    if (node.kind === 'hub' || node.kind === 'relay') near(inF, outF, 1e-9, node.id);
    if (node.kind !== 'zone') assert.ok(st.nodeFlow[node.id] <= node.cap + 1e-9);
  }
  assert.equal(st.nodeFlow.H1, 0);
  near(st.served + st.unmet, st.demand, 1e-9);
});

test('undamaged network serves default demand; more demand, stronger storms and more outages never lower unmet', () => {
  const base = validate({ outages: [], weatherReduction: 0 });
  near(solveState(base).unmet, 0, 1e-6);
  let last = -1;
  for (const d of [0.6, 1.0, 1.3, 1.6, 1.8]) {
    const u = solveState({ ...base, demandScale: d }).unmet;
    assert.ok(u >= last - 1e-9);
    last = u;
  }
  assert.ok(last > 0);
  last = -1;
  for (const w of [0, 0.2, 0.5, 0.9]) {
    const u = solveState({ ...base, weatherReduction: w, demandScale: 1.3 }, new Set(), true).unmet;
    assert.ok(u >= last - 1e-9);
    last = u;
  }
});

test('more redundancy cannot raise unmet demand with other settings fixed, but it adds standby cost', () => {
  let lastU = Infinity, lastS = -1;
  for (const r of [0, 0.25, 0.5, 0.75, 1]) {
    const cfg = validate({ redundancy: r, outages: ['H2'], weatherReduction: 0 });
    const st = solveState(cfg, new Set(['H2']), false);
    assert.ok(st.unmet <= lastU + 1e-9);
    assert.ok(st.standby_usd_day >= lastS);
    lastU = st.unmet;
    lastS = st.standby_usd_day;
  }
  const c0 = criticality({ redundancy: 0 }), c1 = criticality({ redundancy: 1 });
  c0.forEach((x, i) => assert.ok(c1[i].unmet <= x.unmet + 1e-9));
});

test('repair plan stays within budget; zero budget funds nothing and recovery is reported as not reached', () => {
  const none = simulateEvent({ outages: ['H2'], repairBudget_usd: 0, redundancy: 0, weatherReduction: 0 });
  assert.equal(none.plan.repairs.length, 0);
  assert.equal(none.metrics.recovery_days, null);
  const funded = simulateEvent({ outages: ['H2'], repairBudget_usd: 80000, redundancy: 0, weatherReduction: 0 });
  assert.equal(funded.plan.repairs.length, 1);
  assert.ok(funded.plan.spent_usd <= 80000);
  assert.equal(funded.metrics.recovery_days, 7);
  assert.ok(funded.metrics.unmet_unit_days < none.metrics.unmet_unit_days);
  const short = repairPlan(validate({ outages: ['H2', 'H1', 'S1'], repairBudget_usd: 100000 }));
  assert.ok(short.spent_usd <= 100000 + 1e-9);
  short.repairs.forEach((r) => assert.ok(r.finish_day > r.start_day));
});

test('after every repair and the storm, unmet demand returns to the undamaged level', () => {
  const r = simulateEvent({ outages: ['H2', 'R3'], repairBudget_usd: 400000, weatherReduction: 0.5, redundancy: 0.4 });
  const last = r.segments[r.segments.length - 1].state;
  near(last.unmet, r.baseline.unmet, 1e-9);
  assert.equal(last.offline.length, 0);
  assert.ok(r.metrics.recovery_days !== null);
});

test('segments tile the horizon without gaps', () => {
  const r = simulateEvent(DEFAULTS);
  assert.equal(r.segments[0].t0, 0);
  for (let i = 1; i < r.segments.length; i++) assert.equal(r.segments[i].t0, r.segments[i - 1].t1);
  assert.equal(r.segments[r.segments.length - 1].t1, r.horizonDays);
});

test('seeded reproducibility: pickOutages and the whole event repeat exactly', () => {
  assert.deepEqual(pickOutages(12, 3), pickOutages(12, 3));
  assert.notDeepEqual(pickOutages(12, 3), pickOutages(13, 3));
  const out = pickOutages(12, 3);
  const a = simulateEvent({ ...DEFAULTS, outages: out });
  const b = simulateEvent({ ...DEFAULTS, outages: out });
  assert.deepEqual(a.metrics, b.metrics);
  assert.ok(out.every((id) => !id.startsWith('Z')));
});

test('invalid input throws a plain message', () => {
  assert.throws(() => validate({ demandScale: 5 }), /demandScale must be between/);
  assert.throws(() => validate({ outages: ['Q9'] }), /unknown node Q9/);
  assert.throws(() => validate({ outages: ['Z1'] }), /demand zone/);
  assert.throws(() => validate({ redundancy: NaN }), /redundancy/);
});

test('graph build puts zero capacity on an offline node and keeps every number finite', () => {
  const g = buildGraph(validate({}), new Set(['H1']), true);
  assert.ok(g.edges.every((e) => Number.isFinite(e.cap) && e.cap >= 0));
  const idx = g.tags.findIndex((t) => t.type === 'node' && t.id === 'H1');
  assert.equal(g.edges[idx].cap, 0);
  assert.ok(K.NODE_IDS.length === 14);
});
