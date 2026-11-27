import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGraph, shortest, nearestNode, dryCost, wetCost, toLocal, SPEED_KMH } from '../../src/kernels/route.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

test('two streets that cross with no shared vertex are joined at the crossing', () => {
  const geo = { major: [], minor: [], streets: [[0, 50, 100, 50], [50, 0, 50, 100]] };
  const g = buildGraph(geo);
  assert.equal(g.stats.components, 1);
  assert.equal(g.stats.nodes, 5);
  const p = shortest(g, [0, 50], [50, 100]);
  assert.ok(near(p.metres, 100));
  assert.ok(near(p.seconds, 100 / (SPEED_KMH[2] / 3.6)));
});

test('a street that stops 8 m short of another is joined; 20 m short is not', () => {
  const short = { streets: [[0, 0, 100, 0], [50, 8, 50, 100]] };
  const g = buildGraph(short);
  assert.equal(g.stats.components, 1);
  const p = shortest(g, [0, 0], [50, 100]);
  assert.ok(near(p.metres, 50 + 8 + 92));
  const far = { streets: [[0, 0, 100, 0], [50, 20, 50, 100]] };
  const g2 = buildGraph(far);
  assert.equal(g2.stats.components, 2);
});

test('ends a few metres apart snap into one junction', () => {
  const geo = { streets: [[0, 0, 100, 0], [103, 4, 200, 4]] };
  const g = buildGraph(geo);
  assert.equal(g.stats.components, 1);
  const p = shortest(g, [0, 0], [200, 4]);
  assert.ok(near(p.metres, 100 + 5 + 97));
});

test('Dijkstra agrees with Floyd–Warshall on a random street lattice', () => {
  let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const streets = [], major = [], minor = [];
  for (let i = 0; i <= 5; i++) {
    const jitter = () => rnd() * 6 - 3;
    const row = [], col = [];
    for (let j = 0; j <= 5; j++) { row.push(j * 100 + jitter(), i * 100 + jitter()); col.push(i * 100 + jitter(), j * 100 + jitter()); }
    [streets, major, minor][Math.floor(rnd() * 3)].push(row);
    [streets, major, minor][Math.floor(rnd() * 3)].push(col);
  }
  const g = buildGraph({ streets, major, minor });
  const n = g.x.length;
  const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  for (const e of g.edges) { const c = dryCost(e); if (c < D[e.a][e.b]) { D[e.a][e.b] = c; D[e.b][e.a] = c; } }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
  for (let trial = 0; trial < 40; trial++) {
    const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n);
    const p = shortest(g, [g.x[a], g.y[a]], [g.x[b], g.y[b]]);
    assert.ok(near(p.seconds, D[a][b], 1e-6), `pair ${a}-${b}: ${p.seconds} vs ${D[a][b]}`);
  }
});

test('wetCost slows a street in heavy rain (assumed factors)', () => {
  const e = { len: 500, cls: 1, mx: 0, my: 0 };
  assert.ok(near(wetCost(e, () => 0), dryCost(e)));
  assert.ok(near(wetCost(e, () => 30), dryCost(e) / 0.6));
  assert.ok(near(wetCost(e, () => 80), dryCost(e) / 0.35));
});

test('Phnom Penh street graph: Royal Palace to Central Market', t => {
  const geo = JSON.parse(readFileSync(new URL('../../data/geo.json', import.meta.url)));
  let t0 = performance.now();
  const g = buildGraph(geo);
  const buildMs = performance.now() - t0;
  const a = toLocal(geo, 104.931119, 11.563681), b = toLocal(geo, 104.921022, 11.569575);
  t0 = performance.now();
  const p = shortest(g, a, b);
  const routeMs = performance.now() - t0;
  const wet = shortest(g, a, b, e => wetCost(e, () => 35));
  const crow = Math.hypot(a.x - b.x, a.y - b.y);
  const lines = [
    `graph: ${g.stats.nodes} nodes, ${g.stats.edges} edges from ${g.stats.segments} segments; ${g.stats.crossings} crossings, ${g.stats.connectors} end joins; largest component ${(g.stats.largestShare * 100).toFixed(1)}% of nodes; built in ${buildMs.toFixed(0)} ms`,
    `Royal Palace → Central Market: ${p.metres.toFixed(0)} m (straight line ${crow.toFixed(0)} m), ${(p.seconds / 60).toFixed(1)} min dry, ${(wet.seconds / 60).toFixed(1)} min at 35 mm/h; ends snapped ${p.snapFrom.toFixed(0)} m and ${p.snapTo.toFixed(0)} m; ${routeMs.toFixed(1)} ms`,
  ];
  for (const l of lines) { t.diagnostic(l); console.log(l); }
  assert.ok(g.stats.largestShare > 0.9);
  assert.ok(p.metres >= crow);
  assert.ok(p.metres < crow * 2);
  assert.ok(near(wet.seconds, p.seconds / 0.6, 1e-6));
  assert.equal(g.comp[nearestNode(g, a.x, a.y)], g.largest);
});
