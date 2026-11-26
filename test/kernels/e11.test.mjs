import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../../src/kernels/e11.js';

const P = { gamma: 0.1, omega0: 0, alpha: 1, Omega: 1 };

test('exports jobs for the two sweeps', () => {
  assert.equal(typeof K.jobs['e11.duffing-bifurcation'], 'function');
  assert.equal(typeof K.jobs['e11.logistic-bifurcation'], 'function');
});

// ---------- Part A ----------
test('FFT matches the naive DFT on a random series (tolerance 1e-9) and obeys Parseval', () => {
  const rng = (() => { let s = 12345; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5; })();
  const x = Float64Array.from({ length: 128 }, rng);
  const a = K.fft(x), b = K.dft(x);
  for (let k = 0; k < 128; k++) {
    assert.ok(Math.abs(a.re[k] - b.re[k]) < 1e-9 && Math.abs(a.im[k] - b.im[k]) < 1e-9, `bin ${k}`);
  }
  const e1 = x.reduce((s, v) => s + v * v, 0);
  const e2 = a.re.reduce((s, v, k) => s + v * v + a.im[k] * a.im[k], 0) / 128;
  assert.ok(Math.abs(e1 - e2) < 1e-9);
  assert.throws(() => K.fft(new Float64Array(100)), /power of two/);
});

test('amplitude spectrum of a bin-centred cosine of amplitude 0.7 reads 0.7 at the right frequency (tolerance 1e-9)', () => {
  const n = 256, dt = 0.25, f = 16 / (n * dt);
  const x = Float64Array.from({ length: n }, (_, i) => 0.7 * Math.cos(2 * Math.PI * f * i * dt));
  const sp = K.amplitudeSpectrum(x, dt);
  const pk = K.spectralPeak(sp);
  assert.equal(pk.bin, 16);
  assert.ok(Math.abs(pk.amp - 0.7) < 1e-9, `${pk.amp}`);
  assert.ok(Math.abs(pk.freq - f) < 1e-12);
});

test('toy: response peaks at 1/(mT), estimated division m matches for m = 2, 3, 4, 5; drive peaks at 1/T', () => {
  for (const m of [2, 3, 4, 5]) {
    const r = K.subharmonicToy({ T: 1.5, m, phase_rad: 0.3 }, 1);
    assert.equal(Math.round(r.mEstimate), m, `m=${m} est ${r.mEstimate}`);
    assert.ok(Math.abs(r.mEstimate - m) < 0.05 * m, `m=${m} est ${r.mEstimate}`);
    assert.ok(Math.abs(K.spectralPeak(r.spectrumDrive).freq - 1 / 1.5) < 1e-9);
  }
});

test('toy: stroboscopic samples equal cos(2πn/m + φ) exactly and repeat with period m', () => {
  for (const m of [2, 3, 4]) {
    const r = K.subharmonicToy({ m, phase_rad: 0.3 }, 1);
    r.strobe.forEach((v, n) => assert.ok(Math.abs(v - Math.cos((2 * Math.PI * n) / m + 0.3)) < 1e-12));
    assert.equal(K.periodOf(Array.from(r.strobe), { tol: 1e-9, window: 32 }), m);
  }
  assert.equal(K.periodOf(Array.from(K.subharmonicToy({ m: 1, phase_rad: 0.3 }, 1).strobe), { tol: 1e-9 }), 1);
});

test('toy: a phase kick flips the strobe pattern but the division stays m (the toy has no stiffness to lose it)', () => {
  const a = K.subharmonicToy({ m: 2, phase_rad: 0.3 }, 1);
  const b = K.subharmonicToy({ m: 2, phase_rad: 0.3, kickAt_periods: 20, kick_rad: Math.PI }, 1);
  assert.equal(Math.round(b.mEstimate), 2);
  assert.ok(Math.abs(b.strobe[10] - a.strobe[10]) < 1e-12);
  assert.ok(Math.abs(b.strobe[30] + a.strobe[30]) < 1e-12);
});

test('toy: noise is seeded (same seed same series, other seed differs) and raises the spectral floor', () => {
  const run = (seed, noise) => K.subharmonicToy({ m: 3, noise }, seed);
  assert.deepEqual(Array.from(run(4, 0.2).response), Array.from(run(4, 0.2).response));
  assert.notDeepEqual(Array.from(run(4, 0.2).response), Array.from(run(5, 0.2).response));
  const floor = (r) => r.spectrumResponse.amp.slice(40).reduce((s, v) => s + v, 0);
  assert.ok(floor(run(4, 0.2)) > 20 * floor(run(4, 0)));
});

test('toy: out-of-range input throws', () => {
  assert.throws(() => K.subharmonicToy({ m: 0 }), /m must be between 1 and 8/);
  assert.throws(() => K.subharmonicToy({ m: 2.5 }), /whole number/);
  assert.throws(() => K.subharmonicToy({ T: 0 }), /T must be between/);
  assert.throws(() => K.subharmonicToy({ nPeriods: 50 }), /nPeriods/);
});

// ---------- Part B: Duffing ----------
test('Duffing, alpha = 0: steady state matches the analytic response A cos(Ωt − δ) at the strobe instants (tolerance 1e-6)', () => {
  const p = { gamma: 0.5, omega0: 1.5, alpha: 0, F: 2, Omega: 0.8, stepsPerPeriod: 400, nTransient: 100, nSample: 20 };
  const r = K.duffingRun(p, 3);
  const den = (p.omega0 ** 2 - p.Omega ** 2) ** 2 + (p.gamma * p.Omega) ** 2;
  const expectedX = (p.F * (p.omega0 ** 2 - p.Omega ** 2)) / den; // A cos δ at t = nT
  const expectedV = (p.F * p.gamma * p.Omega * p.Omega) / den; //  dx/dt = −AΩ sin(Ωt − δ) → A Ω sin δ at t = nT
  assert.ok(Math.abs(r.strobeX[r.nTransient + 5] - expectedX) < 1e-6, `${r.strobeX[105]} vs ${expectedX}`);
  assert.ok(Math.abs(r.strobeV[r.nTransient + 5] - expectedV) < 1e-6, `${r.strobeV[105]} vs ${expectedV}`);
  assert.equal(r.period, 1);
});

test('Duffing, F = 0, alpha = 0: ringdown equals e^(−γt/2)(cos ωd t + γ/(2ωd) sin ωd t) (tolerance 1e-6)', () => {
  const p = { gamma: 0.2, omega0: 1, alpha: 0, F: 0, Omega: 1, stepsPerPeriod: 400, nTransient: 0, nSample: 12 };
  const r = K.duffingRun(p, 1, [1, 0]);
  const wd = Math.sqrt(1 - 0.01);
  for (let n = 0; n < 12; n++) {
    const t = n * 2 * Math.PI;
    const exact = Math.exp(-0.1 * t) * (Math.cos(wd * t) + (0.1 / wd) * Math.sin(wd * t));
    assert.ok(Math.abs(r.strobeX[n] - exact) < 1e-6, `n=${n}: ${r.strobeX[n]} vs ${exact}`);
  }
});

test('Duffing: smaller RK4 step converges (strobe error against 800 steps per period falls with each halving)', () => {
  const run = (S) => K.duffingRun({ ...P, F: 3, stepsPerPeriod: S, nTransient: 20, nSample: 5 }, 2, [0.3, 0.1]).strobeX;
  const ref = run(800);
  const err = (S) => Math.max(...Array.from(run(S)).map((x, i) => Math.abs(x - ref[i])));
  const e = [err(50), err(100), err(200)];
  assert.ok(e[0] > e[1] && e[1] > e[2] && e[1] / e[2] > 8, e.join(' '));
});

test('Duffing presets verified: gamma 0.1, omega0 0, alpha 1, Omega 1 gives period 1 at F = 3, period 2 at 5.2, period 4 at 5.5, period 3 at 7, no period at 10.5', () => {
  const per = (F) => K.duffingRun({ ...P, F, nTransient: 400, nSample: 64, stepsPerPeriod: 200 }, 1).period;
  assert.equal(per(3), 1);
  assert.equal(per(5.2), 2);
  assert.equal(per(5.5), 4);
  assert.equal(per(7), 3);
  assert.equal(per(10.5), 0);
});

test('Duffing chaos: two starts 1e-9 apart separate to order 1 within 300 periods at F = 10.5; the periodic F = 5.2 case stays together', () => {
  const sep = (F) => {
    const a = K.duffingRun({ ...P, F, nTransient: 0, nSample: 300 }, 1, [0.5, 0.2]);
    const b = K.duffingRun({ ...P, F, nTransient: 0, nSample: 300 }, 1, [0.5 + 1e-9, 0.2]);
    return Math.max(...Array.from(a.strobeX).map((x, i) => Math.abs(x - b.strobeX[i])));
  };
  assert.ok(sep(10.5) > 0.5, `chaotic ${sep(10.5)}`);
  assert.ok(sep(5.2) < 1e-6, `periodic ${sep(5.2)}`);
});

test('Duffing robustness: a small kick of the period-2 state returns to the same attractor', () => {
  const r = K.duffingRobustness({ ...P, F: 5.2, nTransient: 300 }, { kick: 0.01 }, 1);
  assert.equal(r.ok, true);
  assert.equal(r.periodBefore, 2);
  assert.equal(r.periodAfter, 2);
  assert.equal(r.returned, true);
});

test('Duffing bifurcation sweep over F finds 1, then 2, then 4 in order; same seed gives identical output', () => {
  const run = () => K.duffingBifurcation(P, { fMin: 4.4, fMax: 5.6, nF: 13, nKeep: 32, nTransient: 200, stepsPerPeriod: 100 }, 1);
  const a = run();
  assert.deepEqual(Array.from(a.x), Array.from(run().x));
  const seq = Array.from(a.period);
  assert.equal(seq[0], 1);
  assert.ok(seq.includes(2) && seq.includes(4), seq.join(','));
  assert.ok(seq.indexOf(2) < seq.indexOf(4));
});

test('Duffing: seeded start changes the transient only; blow-up and bad input are reported', () => {
  const a = K.duffingRun({ ...P, F: 3, nTransient: 5, nSample: 3 }, 1), b = K.duffingRun({ ...P, F: 3, nTransient: 5, nSample: 3 }, 2);
  assert.notEqual(a.strobeX[0], b.strobeX[0]);
  assert.deepEqual(Array.from(a.strobeX), Array.from(K.duffingRun({ ...P, F: 3, nTransient: 5, nSample: 3 }, 1).strobeX));
  const bad = K.duffingRun({ gamma: 0, omega0: 0, alpha: -2, F: 0, Omega: 1, nTransient: 50, nSample: 10 }, 1, [3, 0]);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /left/);
  assert.throws(() => K.duffingRun({ gamma: -1 }), /gamma must be between/);
});

// ---------- Part B: logistic map ----------
test('logistic: fixed point 1 − 1/r at r = 2.8 and the exact period-2 points at r = 3.2 (tolerance 1e-9)', () => {
  const o = K.logisticOrbit(2.8, 0.3, 5000);
  assert.ok(Math.abs(o[4999] - (1 - 1 / 2.8)) < 1e-12);
  const r = 3.2, s = Math.sqrt((r - 3) * (r + 1));
  const lo = (r + 1 - s) / (2 * r), hi = (r + 1 + s) / (2 * r);
  const q = K.logisticOrbit(r, 0.3, 5000);
  const pair = [q[4998], q[4999]].sort();
  assert.ok(Math.abs(pair[0] - lo) < 1e-9 && Math.abs(pair[1] - hi) < 1e-9, `${pair} vs ${lo} ${hi}`);
});

test('logistic: periods 1, 2, 4, 8, 3 at r = 2.8, 3.2, 3.5, 3.56, 3.83; none at 3.9; doublings sit at r = 3 and 1 + √6', () => {
  const per = (r) => K.logisticPeriod(r);
  assert.deepEqual([2.8, 3.2, 3.5, 3.56, 3.83, 3.9].map(per), [1, 2, 4, 8, 3, 0]);
  assert.equal(per(2.99), 1);
  assert.equal(per(3.01), 2);
  const r2 = 1 + Math.sqrt(6);
  assert.equal(per(r2 - 0.01), 2);
  assert.equal(per(r2 + 0.01), 4);
});

test('logistic: Lyapunov exponent is ln 2 at r = 4 (tolerance 0.02) and ½ ln|4 + 2r − r²| on the period-2 cycle (tolerance 1e-3)', () => {
  assert.ok(Math.abs(K.logisticLyapunov(4, 0.3, 200000) - Math.LN2) < 0.02);
  const r = 3.2;
  assert.ok(Math.abs(K.logisticLyapunov(r, 0.3) - 0.5 * Math.log(Math.abs(4 + 2 * r - r * r))) < 1e-3);
  assert.ok(K.logisticLyapunov(3.9, 0.3) > 0.3);
});

test('logistic bifurcation diagram: seeded, bounded in [0,1], one branch at r < 3 and two at r = 3.2', () => {
  const a = K.logisticBifurcation({ rMin: 2.5, rMax: 3.5, nR: 11, nKeep: 16 }, 3);
  assert.deepEqual(Array.from(a.x), Array.from(K.logisticBifurcation({ rMin: 2.5, rMax: 3.5, nR: 11, nKeep: 16 }, 3).x));
  assert.ok(a.x.every((v) => v >= 0 && v <= 1));
  const distinct = (i) => new Set(Array.from(a.x.slice(i * 16, (i + 1) * 16)).map((v) => v.toFixed(6))).size;
  assert.equal(distinct(0), 1);
  assert.equal(distinct(8), 2);
  assert.throws(() => K.logisticOrbit(4.5, 0.3, 10), /r must be between/);
});
