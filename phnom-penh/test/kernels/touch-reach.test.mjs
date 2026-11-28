// The touch draft's reach kernel against the real Phnom Penh data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGraph, shortest, dryCost } from '../../src/kernels/route.js';
import { prepare } from '../../src/kernels/skyreach.js';
import * as K from '../../src/touch/reach.js';

const D = p => new URL('../../data/' + p, import.meta.url);
const geo = JSON.parse(readFileSync(D('geo.json')));
const graph = buildGraph(geo);
const prep = prepare(JSON.parse(readFileSync(D('terrain.json'))));
const city = K.prepareCity(graph, prep, K.buildingCentres(readFileSync(D('buildings.bin'))));
const loc = (lon, lat) => ({ x: (lon - geo.origin.lon) * geo.kx, y: (lat - geo.origin.lat) * geo.ky });
const MARKET = loc(104.921022, 11.569575);
const RISES = Array.from({ length: 29 }, (_, i) => i * 0.5);

test('every building is read', () => { assert.equal(city.nB, 81153); });

test('reach equals shortest paths inside the cutoff', () => {
  const start = K.startAt(city, MARKET.x, MARKET.y);
  const dist = new Float64Array(city.nN);
  K.reach(city, start, 'tuk', null, 1e9, dist);
  for (const [lon, lat] of [[104.931119, 11.563681], [104.914681, 11.540433], [104.923067, 11.576036]]) {
    const to = loc(lon, lat);
    const r = shortest(graph, { x: graph.x[start.node], y: graph.y[start.node] }, to, dryCost);
    const d = dist[r.to] - start.snap / K.WALK - r.seconds;
    assert.ok(Math.abs(d) < 0.01, `differs by ${d} s of ${r.seconds}`);   // costs are float32 here, float64 in route.js
  }
  const cut = new Float64Array(city.nN);
  K.reach(city, start, 'tuk', null, 300, cut);
  for (let n = 0; n < city.nN; n++) if (dist[n] <= 300) assert.equal(cut[n], dist[n]);
});

test('more time or a faster way reaches more buildings', () => {
  const start = K.startAt(city, MARKET.x, MARKET.y);
  const dist = new Float64Array(city.nN), times = new Float32Array(city.nB);
  const n = (mode, T) => { K.reach(city, start, mode, null, T, dist); K.doorTimes(city, dist, 0, times); return K.countWithin(times, T); };
  assert.ok(n('tuk', 300) < n('tuk', 600));
  assert.ok(n('foot', 600) < n('tuk', 600));
  assert.ok(n('foot', 600) > 0);
});

test('a higher river never reaches more, and closes streets in order', () => {
  const start = K.startAt(city, MARKET.x, MARKET.y);
  const sw = K.sweep(city, start, 'tuk', 600, RISES);
  for (let i = 1; i < sw.length; i++) assert.ok(sw[i].count <= sw[i - 1].count, `rise ${sw[i].rise}`);
  assert.ok(sw[0].count > sw.at(-1).count);
  let prev = -1;
  for (const r of RISES) { const c = K.closedAt(city, r).reduce((a, b) => a + b, 0); assert.ok(c >= prev); prev = c; }
  assert.equal(K.closedAt(city, 0).reduce((a, b) => a + b, 0), 0);
  // a street over mapped river water is a bridge: never closed
  const bridges = [...city.edgeLevel.keys()].filter(e => city.edgeLevel[e] === -1);
  assert.ok(bridges.length > 0);
  const c14 = K.closedAt(city, 14);
  for (const e of bridges) assert.equal(c14[e], 0);
});

test('a touch far from any street has no answer', () => {
  const s = K.startAt(city, 30000, -30000);
  assert.ok(!s || s.node < 0);
  const dist = new Float64Array(city.nN);
  assert.equal(K.reach(city, s, 'tuk', null, 600, dist), 0);
});

test('the counter reads the real count at every moment', () => {
  const start = K.startAt(city, MARKET.x, MARKET.y);
  const dist = new Float64Array(city.nN), times = new Float32Array(city.nB);
  K.reach(city, start, 'tuk', null, 600, dist); K.doorTimes(city, dist, 0, times);
  const sorted = K.sortedWithin(times, 600);
  for (const t of [0, 30, 120, 299.5, 600]) assert.equal(K.countAt(sorted, t), K.countWithin(times, t));
});
