// The simulated 48 hours, the cached world and the early warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGraph } from '../../src/kernels/route.js';
import { PROPOSED, snapToRoads } from '../../src/kernels/sensors.js';
import { observe, warning } from '../../src/kernels/nowcast.js';
import * as SIM from '../../src/touch/sim.js';
import { makeFixture, warnings } from '../../src/touch/fixture.js';

const D = p => new URL('../../data/' + p, import.meta.url);
const geo = JSON.parse(readFileSync(D('geo.json')));
const terr = JSON.parse(readFileSync(D('terrain.json')));
const graph = buildGraph(geo);
const FX = makeFixture(geo, graph);
const tg = terr.grid, o = geo.origin;
const grid = { nx: 64, ny: 52, x0: (tg.west - o.lon) * geo.kx, x1: (tg.east - o.lon) * geo.kx, y0: (tg.south - o.lat) * geo.ky, y1: (tg.north - o.lat) * geo.ky };
const S = SIM.simulate(geo, FX, grid);
S.J.forEach((j, i) => Object.assign(j, FX.junctions[i]));
const A = SIM.alerts(S);

test('queue step conserves vehicles and never goes below zero', () => {
  for (const [Q, a, c] of [[0, 10, 5], [3, 0, 10], [50, 20, 30], [0, 0, 0], [5, 5, -1]]) {
    const r = SIM.queueStep(Q, a, c);
    assert.ok(r.Q >= 0 && r.departures >= 0);
    assert.ok(Math.abs(Q + a - (r.Q + r.departures)) < 1e-9);
    assert.ok(r.departures <= Math.max(0, c) + 1e-9);
  }
});

test('AQI follows the 2024 EPA PM2.5 breakpoints', () => {
  for (const [c, a] of [[0, 0], [9.0, 50], [9.1, 51], [35.4, 100], [35.5, 101], [55.4, 150], [55.5, 151], [125.4, 200], [125.5, 201], [225.4, 300]]) assert.equal(SIM.aqi(c), a, `${c}`);
  assert.equal(SIM.catOf(151).key, 'unhealthy');
  assert.equal(SIM.nowcast([20, 20, 20, 20]), 20);
  assert.ok(Number.isNaN(SIM.nowcast([20])));
});

test('the cached world is reproducible and its warnings equal the nowcast kernel', () => {
  assert.deepEqual(makeFixture(geo, graph), FX);
  assert.equal(FX.junctions.length, 28);
  const cams = FX.junctions.map(j => ({ id: 'c' + j.id.slice(2), kind: 'camera', x: j.x, y: j.y }));
  const gauges = snapToRoads(PROPOSED.filter(s => s.kind === 'gauge'), geo).map(({ id, kind, ring, x, y }) => ({ id, kind, ring, x: Math.round(x), y: Math.round(y) }));
  const obs = observe(SIM.storm, [...cams, ...gauges], SIM.STORM_SEED);
  for (const i of [0, 4, 13, 26]) assert.equal(warning(obs, FX.junctions[i], { seed: SIM.STORM_SEED }).tWarn, FX.junctions[i].tWarn, FX.junctions[i].id);
  assert.deepEqual(warnings(obs, FX.junctions.slice(0, 3), { seed: SIM.STORM_SEED }), FX.junctions.slice(0, 3).map(j => j.tWarn));
});

test('rain only during the storm; water drains; queues never negative', () => {
  for (const j of S.J) {
    for (let m = SIM.M0; m <= SIM.M1; m += 60) {
      const k = S.idx(m);
      if (m < 0 || m > 180) assert.equal(j.rain[k], 0);
      assert.ok(j.queue[k] >= 0 && j.pm[k] > 0);
    }
    assert.ok(j.water[S.idx(400)] < 1, `${j.id} still wet`);
  }
  for (let m = SIM.M0; m <= SIM.M1; m += 30) { const p = SIM.trafficProfile(m); assert.ok(p > 0 && p <= 1.05); }
});

test('warnings come before their events, with the numbers the page shows', () => {
  const air = A.find(a => a.kind === 'air'), rain = A.find(a => a.kind === 'rain'), water = A.find(a => a.kind === 'water');
  assert.ok(air && air.issue != null && air.event != null && air.issue < air.event);
  assert.ok(rain.issue < rain.event && rain.lead > 0);
  const heavy = S.J.filter(j => j.tHeavy >= 0);
  assert.equal(rain.n, heavy.length);
  assert.equal(rain.missed, heavy.filter(j => !(j.tWarn >= 0 && j.tWarn < j.tHeavy)).length);
  assert.ok(water.lead > 0 && water.event >= rain.event);
  for (const a of A) assert.ok((a.issue ?? a.event) <= a.event && a.event <= a.end, a.kind);
});

test('the air forecast uses nothing after the moment it is made', () => {
  // the forecast at minute m: the last hour's mean times the sensor's dry-weather shape
  const j = S.J[0], m = -600;
  const before = S.hourMean(j.pm, m);
  const copy = Float32Array.from(j.pm);
  for (let k = S.idx(m) + 1; k < j.pm.length; k++) j.pm[k] = 999;
  assert.equal(S.hourMean(j.pm, m), before);
  j.pm.set(copy);
});
