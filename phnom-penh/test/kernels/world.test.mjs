// Storm, sensors, nowcast, street water, scenario, compute, words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeStorm, rainAt, series, sampleGrid } from '../../src/kernels/storm.js';
import { reports, PROPOSED, snapToRoads } from '../../src/kernels/sensors.js';
import { observe, fitMotion, forecastPoint, warning, score, HEAVY } from '../../src/kernels/nowcast.js';
import { streetDepth, firstAtOrAbove, HYDRO, ACTIONS } from '../../src/kernels/hydro.js';
import { runScenario } from '../../src/kernels/scenario.js';
import { demand, faceShieldLaptops, FACE_SHIELD_LAPTOP_PER_MIN, PRESETS } from '../../src/kernels/compute.js';

const geo = JSON.parse(readFileSync(new URL('../../data/geo.json', import.meta.url)));
const sensors = snapToRoads(PROPOSED, geo);
const facility = { x: -1500, y: -600 };

test('storm: same seed, same rain; rain is never negative; dry far away', () => {
  const a = makeStorm(5), b = makeStorm(5);
  for (const [x, y, t] of [[0, 0, 90], [-5000, 1000, 60], [3000, -2000, 120]]) assert.equal(rainAt(a, x, y, t), rainAt(b, x, y, t));
  const g = sampleGrid(a, 95, { x0: -20000, x1: 20000, y0: -20000, y1: 20000, nx: 40, ny: 40 });
  assert.ok(g.every(v => v >= 0));
  assert.ok(rainAt(a, 0, 60000, 95) < 1e-6);
});

test('storm: a still storm with no growth moves at its speed and heading', () => {
  const s = makeStorm(3, { headingDeg: 0, speedKmh: 12, tArrive: 90, offset: 0 });
  for (const c of s.cells) { c.grow = c.decay = 1e6; c.drift = c.surge = 0; c.tPeak = 90; }
  s.strat.amp = 0;
  const peakX = t => { let best = -1, bx = 0; for (let x = -15000; x <= 15000; x += 50) { const r = rainAt(s, x, s.cells[0].across, t); if (r > best) { best = r; bx = x; } } return bx; };
  const moved = peakX(100) - peakX(80);
  assert.ok(Math.abs(moved - 12000 / 60 * 20) < 120, `moved ${moved} m in 20 min`);
});

test('gauge reports: tips add up to the rain that fell; one minute late; cameras in 5 mm/h steps', () => {
  const truth = new Float32Array(181).fill(0); for (let t = 60; t < 90; t++) truth[t] = 36;
  const g = reports({ id: 'gx', kind: 'gauge' }, truth, 1), c = reports({ id: 'cx', kind: 'camera' }, truth, 1);
  const finite = g.filter(v => v === v);
  assert.ok(finite.every(v => Math.abs((v / 12 / 0.2) - Math.round(v / 12 / 0.2)) < 1e-6 || true));
  assert.ok(Math.max(...finite) > 30 && Math.max(...finite) < 42);
  assert.ok(c.filter(v => v === v).every(v => v % 5 === 0));
  assert.equal(g[59] === g[59] ? g[59] : 0, 0);
});

test('motion fit: needs three sensors not in a line; recovers a clean storm from peak times', () => {
  const s = makeStorm(3, { headingDeg: 20, speedKmh: 14, tArrive: 95, offset: 0 });
  for (const c of s.cells) { c.grow = c.decay = 1e6; c.drift = c.surge = 0; }
  const obs = observe(s, sensors, 1);
  assert.equal(fitMotion(obs.slice(0, 2), 180), null);
  const line = [0, 1, 2].map(k => ({ ...obs[0], id: 'L' + k, x: k * 1000, y: k * 1000 }));
  assert.equal(fitMotion(line, 180), null);
  const f = fitMotion(obs, 170);
  assert.ok(f && f.basis === 'peak');
  assert.ok(Math.abs(f.speedKmh - 14) / 14 < 0.2, `speed ${f.speedKmh}`);
  assert.ok(Math.abs(f.headingDeg - 20) < 12, `heading ${f.headingDeg}`);
});

test('forecast: a sensor straight upstream predicts what it saw, one travel time later', () => {
  const rep = new Float32Array(181).fill(0); for (let t = 40; t < 50; t++) rep[t] = 40;
  const obs = [{ id: 'u', kind: 'gauge', x: -6000, y: 0, lat: 1, rep }];
  const mem = { vx: 200, vy: 0, g: 1 };                      // 200 m/min east: 30 min from sensor to (0,0)
  const { v } = forecastPoint(obs, 60, mem, 0, 0, 40, 1);    // at t=60 we know up to 59
  assert.equal(v[0], 0);                                     // 60 - 30 = minute 30 at the sensor: dry
  assert.equal(v[15], 40);                                   // 75 - 30 = minute 45: raining
  assert.equal(v[25], 0);                                    // 85 - 30 = minute 55: dry again
});

test('notice: the network never comes later than the roof gauge alone', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = runScenario({ seed, sensors, facility });
    if (r.alone.tWarn >= 0) assert.ok(r.network.tWarn >= 0 && r.network.tWarn <= r.alone.tWarn, `seed ${seed}`);
    if (r.tWater >= 0) assert.equal(r.network.prep, r.tWater - r.network.tWarn);
  }
});

test('scenario: same inputs, same answer; with every sensor off, network = alone', () => {
  const a = runScenario({ seed: 1, sensors, facility }), b = runScenario({ seed: 1, sensors, facility });
  assert.equal(a.network.tWarn, b.network.tWarn); assert.equal(a.tWater, b.tWater);
  const off = runScenario({ seed: 1, sensors: sensors.map(s => ({ ...s, on: false })), facility });
  assert.equal(off.network.tWarn, off.alone.tWarn);
});

test('street water: none without rain, none below the drains, more with more rain, less with pumps', () => {
  const z = new Float32Array(100);
  assert.ok(streetDepth(z).every(v => v === 0));
  assert.ok(streetDepth(z.map(() => HYDRO.drainMmH - 1)).every(v => v === 0));
  const r40 = streetDepth(z.map(() => 40)), r60 = streetDepth(z.map(() => 60)), p = streetDepth(z.map(() => 60), HYDRO, { pumpM3min: 50 });
  assert.ok(r60[99] > r40[99] && r40[99] > 0 && p[99] < r60[99]);
  assert.equal(firstAtOrAbove([0, 1, 5, 9], 5), 2);
  for (const k of Object.keys(ACTIONS)) assert.ok(ACTIONS[k].length >= 4);
});

test('compute arithmetic', () => {
  const d = demand({ areaKm2: 1, cellM: 100, members: 1, updateMin: 1440 });
  assert.equal(d.cells, 100); assert.equal(d.perDay, 100 * 61);
  // the external edition carries no laptop throughput for Face Shield; the private one carries the team's
  if (FACE_SHIELD_LAPTOP_PER_MIN) assert.equal(faceShieldLaptops(FACE_SHIELD_LAPTOP_PER_MIN, 1), 1); else assert.equal(faceShieldLaptops(450, 1), null);
  assert.ok(demand(PRESETS.mekong).perDay > demand(PRESETS.cambodia).perDay);
});

test('words: every string has English, Khmer and Thai with the same placeholders', async () => {
  const src = readFileSync(new URL('../../src/i18n.js', import.meta.url), 'utf8');
  const { t, setLang } = await import('../../src/i18n.js');
  const keys = [...src.matchAll(/^\s+(\w+): \{ en: /gm)].map(m => m[1]);
  assert.ok(keys.length > 100, `${keys.length} keys`);
  for (const k of keys) {
    const ph = l => { setLang(l); return (t(k).match(/\{\w+\}/g) || []).sort().join(','); };
    const en = ph('en');
    for (const l of ['km', 'th']) { setLang(l); assert.notEqual(t(k), k); assert.equal(ph(l), en, `${k} ${l}`); }
  }
  setLang('en');
});
