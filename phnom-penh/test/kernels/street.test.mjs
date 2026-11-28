// Junction street view: pure kernels and the aggregate-only contract. No DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStreetView, signalPhase, queueStep, WORDS, CYCLE } from '../../src/touch/street.js';

function fakeCanvas(w = 390, h = 240) {
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 20 }) : /^create/.test(k) ? () => ({ addColorStop() {} }) : k === 'canvas' ? t.__c : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const c = { width: w, height: h, clientWidth: w, getContext: () => ctx };
  ctx.__c = c; return c;
}
const mk = (w, h) => fakeCanvas(w, h);

test('the module imports without a DOM', () => { assert.equal(typeof document, 'undefined'); assert.equal(typeof createStreetView, 'function'); });

test('signalPhase covers the cycle and never shows two greens', () => {
  const seen = new Set();
  for (let t = -CYCLE; t < 2 * CYCLE; t += 0.5) {
    const p = signalPhase(t); assert.ok(!(p.ns === 'green' && p.ew === 'green'));
    for (const v of [p.ns, p.ew]) assert.ok(['green', 'amber', 'red'].includes(v));
    seen.add(p.ns + '/' + p.ew);
  }
  for (const s of ['green/red', 'amber/red', 'red/red', 'red/green', 'red/amber']) assert.ok(seen.has(s), s);
  assert.deepEqual(signalPhase(5), signalPhase(5 + CYCLE));
  assert.deepEqual(signalPhase(-3), signalPhase(CYCLE - 3));
  let ns = 0, ew = 0; for (let t = 0; t < CYCLE; t++) { const p = signalPhase(t); if (p.ns === 'green') ns++; if (p.ew === 'green') ew++; }
  assert.equal(ns, 40); assert.equal(ew, 40);
});

test('queueStep conserves vehicles and never goes negative', () => {
  let s = 12345;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 2000; i++) {
    const Q = Math.floor(rnd() * 40), a = Math.floor(rnd() * 12), cap = Math.floor(rnd() * 15);
    const r = queueStep(Q, a, cap);
    assert.equal(Q + a, r.Q + r.departures); assert.ok(r.Q >= 0); assert.ok(r.departures >= 0); assert.ok(r.departures <= cap);
    assert.equal(r.departures, Math.min(Q + a, cap)); assert.equal(r.Q, Math.max(0, Q + a - r.departures));
  }
  assert.deepEqual(queueStep(3, 2, 0), { Q: 5, departures: 0 });
});

test('words exist in three languages', () => {
  for (const l of ['en', 'km', 'th']) for (const k of ['camera', 'leaves', 'miss']) assert.ok(WORDS[l][k]);
});

function run(cfg, secs = 150, seed = 1) {
  const v = createStreetView(fakeCanvas(), { seed, node: 'J-07', makeCanvas: mk });
  v.set({ still: true, ...cfg }); v.step(secs); v.render(); return v;
}

test('counts and packet are aggregate-only', () => {
  const v = run({ minute: 1000, volume: 80, rain: 5, water: 2, pm25: 85, divider: 0.5 });
  const c = v.counts();
  assert.deepEqual(Object.keys(c), ['minute', 'perMin', 'queueM', 'coversMissed', 'faces']);
  assert.deepEqual(Object.keys(c.perMin), ['total', 'motos', 'cars', 'tuktuks', 'buses', 'people']);
  assert.deepEqual(Object.keys(c.queueM), ['n', 'e', 's', 'w']);
  assert.equal(c.perMin.total, c.perMin.motos + c.perMin.cars + c.perMin.tuktuks + c.perMin.buses);
  assert.ok(c.perMin.total > 20, 'busy at rush hour');
  const p = v.packet();
  assert.deepEqual(Object.keys(p).sort(), ['node', 'peoplePerMin', 'pm25', 'quality', 'queueM', 'rainMmH', 't', 'vehiclesPerMin', 'waterCm']);
  assert.equal(p.node, 'J-07'); assert.match(p.t, /^\d\d:\d\d$/); assert.equal(p.t, '07:40');
  assert.ok(['ok', 'low'].includes(p.quality));
  const json = JSON.stringify(p);
  for (const bad of ['plate', 'face', 'track']) assert.ok(!json.includes(bad), bad);
  assert.ok(!/"id"/.test(json));
  assert.equal(v.packetBytes(), new TextEncoder().encode(json).length);
  assert.ok(v.packetBytes() < 300);
});

test('volume sets the pace: busy at rush, sparse at 3 a.m.', () => {
  const busy = run({ minute: 1000, volume: 90 }).counts().perMin.total;
  const quiet = run({ minute: 720, volume: 6 }).counts().perMin.total;
  assert.ok(busy > 3 * quiet, `${busy} vs ${quiet}`);
  assert.ok(quiet < 15);
});

test('same seed gives the same scene', () => {
  const a = run({ volume: 60 }, 120, 5).counts(), b = run({ volume: 60 }, 120, 5).counts();
  assert.deepEqual(a, b);
});

test('quality is low in a night downpour with haze, ok at midday', () => {
  assert.equal(run({ minute: 420, rain: 40, pm25: 180, volume: 20 }, 5).packet().quality, 'low');
  assert.equal(run({ minute: -150, rain: 0, pm25: 30, volume: 20 }, 5).packet().quality, 'ok');
});
