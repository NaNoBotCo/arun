import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, meanFieldDrift, orderParameter, normalQuantile, naturalFrequencies, criticalCoupling, lockedFraction, jobs } from '../../src/kernels/e10.js';

const meanR = (sim, burn, n) => {
  sim.step(burn);
  let r = 0;
  for (let i = 0; i < n; i++) {
    sim.step(1);
    r += sim.order().R;
  }
  return r / n;
};

test('exports jobs', () => assert.equal(typeof jobs, 'object'));

test('identical frequencies and aligned phases stay aligned: R = 1 within 1e-12 after 2000 steps', () => {
  const s = createSim({ N: 200, K: 2, spread: 0, init: 'aligned' }, 1);
  assert.equal(s.order().R, 1);
  s.step(2000);
  assert.ok(Math.abs(s.order().R - 1) < 1e-12, `R = ${s.order().R}`);
});

test('uncoupled phases follow the analytic solution θ(t) = θ0 + ω t (tolerance 1e-9)', () => {
  const s = createSim({ N: 300, K: 0, spread: 1, dt: 0.05 }, 4);
  const th0 = Float64Array.from(s.theta);
  s.step(400);
  const t = s.t;
  let worst = 0;
  for (let i = 0; i < s.N; i++) worst = Math.max(worst, Math.abs(s.theta[i] - (th0[i] + s.omega[i] * t)));
  assert.ok(worst < 1e-9, `worst ${worst}`);
});

test('mean-field drift equals the brute-force O(N²) pairwise sum (tolerance 1e-12)', () => {
  const s = createSim({ N: 150, K: 2.5 }, 6);
  s.step(37);
  const fast = meanFieldDrift(s.theta, s.omega, 2.5);
  for (let i = 0; i < s.N; i++) {
    let sum = 0;
    for (let j = 0; j < s.N; j++) sum += Math.sin(s.theta[j] - s.theta[i]);
    const slow = s.omega[i] + (2.5 / s.N) * sum;
    assert.ok(Math.abs(fast[i] - slow) < 1e-12, `i=${i} ${fast[i]} vs ${slow}`);
  }
});

test('two oscillators lock at sin φ = Δω/K (analytic, tolerance 1e-4) and drift when K < Δω', () => {
  // N = 2: φ = θ1 − θ2 obeys φ' = Δω − K sin φ.
  const lock = createSim({ N: 2, K: 1, omega: [0.25, -0.25], init: 'random', dt: 0.01 }, 3);
  lock.step(6000);
  let phi = lock.theta[0] - lock.theta[1];
  phi = Math.atan2(Math.sin(phi), Math.cos(phi));
  assert.ok(Math.abs(Math.sin(phi) - 0.5) < 1e-4, `sin φ = ${Math.sin(phi)}`);
  const drift = createSim({ N: 2, K: 0.2, omega: [0.25, -0.25], init: 'random', dt: 0.01 }, 3);
  const p0 = drift.theta[0] - drift.theta[1];
  drift.step(6000);
  assert.ok(Math.abs(drift.theta[0] - drift.theta[1] - p0) > 10, 'phase difference keeps growing');
});

test('R stays inside [0, 1] through a run, with and without noise', () => {
  for (const noise of [0, 0.5]) {
    const s = createSim({ N: 400, K: 2, noise }, 8);
    for (let i = 0; i < 200; i++) {
      s.step(2);
      const R = s.order().R;
      assert.ok(R >= 0 && R <= 1 + 1e-12 && Number.isFinite(R), `R=${R}`);
    }
  }
});

test('strong coupling gives higher R than weak coupling for a fixed seed', () => {
  const kc = criticalCoupling('gaussian', 1);
  const weak = meanR(createSim({ N: 1500, K: 0.5 * kc }, 2), 600, 100);
  const strong = meanR(createSim({ N: 1500, K: 3 * kc }, 2), 600, 100);
  assert.ok(weak < 0.1 && strong > 0.9, `weak ${weak} strong ${strong}`);
});

test('Lorentzian population reproduces the exact long-time result R = √(1 − 2γ/K) (tolerance 0.03, N = 4000)', () => {
  for (const K of [4, 8]) {
    const R = meanR(createSim({ N: 4000, K, dist: 'lorentzian', spread: 1 }, 2), 1600, 100);
    assert.ok(Math.abs(R - Math.sqrt(1 - 2 / K)) < 0.03, `K=${K}: ${R} vs ${Math.sqrt(1 - 2 / K)}`);
  }
});

test('below the critical coupling R stays at the finite-size floor, about 1/√N', () => {
  const N = 2000;
  const s = createSim({ N, K: 0.5 * criticalCoupling('gaussian', 1) }, 5);
  const R = meanR(s, 600, 100);
  assert.ok(R < 4 / Math.sqrt(N), `R ${R} floor ${1 / Math.sqrt(N)}`);
});

test('large noise lowers R at the same coupling', () => {
  const quiet = meanR(createSim({ N: 1500, K: 3, noise: 0 }, 2), 600, 100);
  const loud = meanR(createSim({ N: 1500, K: 3, noise: 2 }, 2), 600, 100);
  assert.ok(loud < quiet - 0.3, `quiet ${quiet} loud ${loud}`);
});

test('frequency sampler: normal quantile is exact at known points; sample mean ≈ 0 and sd ≈ spread', () => {
  assert.ok(Math.abs(normalQuantile(0.5)) < 1e-12);
  assert.ok(Math.abs(normalQuantile(0.975) - 1.959963984540054) < 1e-8);
  assert.ok(Math.abs(normalQuantile(0.001) + 3.090232306167813) < 1e-8);
  const w = naturalFrequencies(5000, 'gaussian', 1.5, 3);
  const m = w.reduce((a, b) => a + b, 0) / w.length;
  const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length);
  assert.ok(Math.abs(m) < 1e-9 && Math.abs(sd - 1.5) < 0.02, `m ${m} sd ${sd}`);
});

test('mean observed frequency equals the mean natural frequency (coupling terms cancel)', () => {
  const s = createSim({ N: 500, K: 3 }, 9);
  s.step(200);
  s.beginWindow();
  s.step(200);
  const { freq } = s.endWindow();
  const mf = freq.reduce((a, b) => a + b, 0) / freq.length;
  const mw = s.omega.reduce((a, b) => a + b, 0) / s.N;
  assert.ok(Math.abs(mf - mw) < 1e-9, `${mf} vs ${mw}`);
  assert.ok(lockedFraction(freq, 0.05) > 0.5);
});

test('kicking half of an aligned, identical population by π drives R to 0', () => {
  const s = createSim({ N: 100, K: 0, spread: 0, init: 'aligned' }, 1);
  const moved = s.kick(0, 0.1, Math.PI);
  assert.equal(moved, 100);
  const s2 = createSim({ N: 100, K: 1, spread: 0, init: 'two-camps' }, 1);
  assert.ok(s2.order().R < 1e-12);
  const s3 = createSim({ N: 1000, K: 0, spread: 0, init: 'aligned' }, 1);
  const n = s3.kickRandom(0.5, Math.PI);
  assert.ok(n > 400 && n < 600);
  assert.ok(s3.order().R < 0.1);
});

test('seeded reproducibility: same seed gives identical phases (with noise); another seed differs', () => {
  const run = (seed) => {
    const s = createSim({ N: 300, K: 2, noise: 0.3 }, seed);
    s.step(200);
    s.kickRandom(0.2);
    s.step(50);
    return Array.from(s.theta);
  };
  assert.deepEqual(run(21), run(21));
  assert.notDeepEqual(run(21), run(22));
});

test('out-of-range input throws a plain message', () => {
  assert.throws(() => createSim({ N: 1 }, 1), /N must be between 2 and 10000/);
  assert.throws(() => createSim({ N: 20000 }, 1), /N must be between/);
  assert.throws(() => createSim({ K: -1 }, 1), /K must be between/);
  assert.throws(() => createSim({ init: 'bogus' }, 1), /init must be one of/);
  assert.equal(orderParameter(new Float64Array([0, 0, 0])).R, 1);
});

test('setParams changes K and noise in flight and matches a run created with those values from the start', () => {
  const a = createSim({ N: 200, K: 0, noise: 0 }, 3);
  a.setParams({ K: 2.5, noise: 0.2 });
  const b = createSim({ N: 200, K: 2.5, noise: 0.2 }, 3);
  a.step(100);
  b.step(100);
  assert.deepEqual(Array.from(a.theta), Array.from(b.theta));
  assert.throws(() => a.setParams({ K: 99 }), /K must be between/);
});
