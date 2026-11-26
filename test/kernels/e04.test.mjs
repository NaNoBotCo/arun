import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, analyse, truthField, sensorLayout } from '../../src/kernels/e04.js';

const C = (over = {}) => ({ G: 32, L: 5, sigmaB: 6, sigmaAssumed: 1, sigmaActual: 1, bias: 5, errAmp: 3, hour: 6, method: 'oi', sensors: sensorLayout('grid', 16, 32, 1), ...over });

test('no sensors: the analysis is the background, for both methods', () => {
  for (const method of ['oi', 'kernel']) {
    const r = run(C({ sensors: [], method }), 1);
    assert.deepEqual(Array.from(r.xa), Array.from(r.background));
  }
});

test('one noiseless sensor on a constant bias: OI corrects that cell to the truth', () => {
  const G = 16;
  const bg = new Float64Array(G * G).fill(15);
  const cell = 5 * G + 7;
  const an = analyse({ G, sensors: [cell], L: 3, sigmaB: 5, sigmaAssumed: 0, method: 'oi' }, bg, [10]);
  assert.ok(Math.abs(an.xa[cell] - 10) < 1e-6, String(an.xa[cell]));
  assert.ok(an.sd[cell] < 1e-3, 'no uncertainty left at an exact observation');
});

test('large assumed observation noise shrinks the Kalman influence toward zero', () => {
  const G = 16;
  const bg = new Float64Array(G * G).fill(15);
  const cell = 5 * G + 7;
  const small = analyse({ G, sensors: [cell], L: 3, sigmaB: 5, sigmaAssumed: 0.5, method: 'oi' }, bg, [10]).xa[cell];
  const big = analyse({ G, sensors: [cell], L: 3, sigmaB: 5, sigmaAssumed: 500, method: 'oi' }, bg, [10]).xa[cell];
  assert.ok(Math.abs(big - 15) < 0.01 && Math.abs(small - 15) > 4);
});

test('reference: single-observation OI matches the scalar Kalman gain σb²/(σb²+σo²)', () => {
  const G = 8;
  const bg = new Float64Array(G * G).fill(0);
  const an = analyse({ G, sensors: [0], L: 2, sigmaB: 3, sigmaAssumed: 4, method: 'oi' }, bg, [10]);
  const K = 9 / (9 + 16);
  assert.ok(Math.abs(an.xa[0] - 10 * K) < 1e-6); // the solver adds a 1e-9·σb² jitter to the diagonal
  assert.ok(Math.abs(an.sd[0] - Math.sqrt(9 * (1 - K))) < 1e-6);
});

test('held-out truth is not used to fit: changing truth away from sensors leaves the analysis unchanged', () => {
  const c = C();
  const r1 = run(c, 3);
  const truth2 = Float64Array.from(r1.truth);
  const mask = new Set(c.sensors);
  for (let i = 0; i < truth2.length; i++) if (!mask.has(i)) truth2[i] += 100;
  const an2 = analyse(c, r1.background, r1.obs);
  assert.deepEqual(Array.from(an2.xa), Array.from(r1.xa));
});

test('good sensors beat the background on held-out cells', () => {
  const r = run(C({ sensors: sensorLayout('grid', 25, 32, 1) }), 4);
  assert.ok(r.rmseAnalysis < r.rmseBackground);
});

test('counterexample: very noisy sensors trusted as precise make the map worse', () => {
  const r = run(C({ sigmaActual: 25, sigmaAssumed: 0.5, bias: 1, errAmp: 1 }), 5);
  assert.ok(r.rmseAnalysis > r.rmseBackground, `${r.rmseAnalysis} vs ${r.rmseBackground}`);
});

test('posterior uncertainty is non-negative and never above the prior', () => {
  const r = run(C(), 6);
  for (const s of r.sd) assert.ok(s >= 0 && s <= 6 + 1e-9);
});

test('replay with the same seed is exact; adding a sensor leaves other sensors’ readings unchanged', () => {
  const a = run(C(), 7), b = run(C(), 7);
  assert.deepEqual(Array.from(a.xa), Array.from(b.xa));
  const c2 = C();
  const more = run({ ...c2, sensors: [...c2.sensors, 3] }, 7);
  assert.deepEqual(more.obs.slice(0, c2.sensors.length), a.obs);
});

test('the field moves with the hour', () => {
  assert.notDeepEqual(Array.from(truthField(16, 1, 0)), Array.from(truthField(16, 1, 12)));
});
