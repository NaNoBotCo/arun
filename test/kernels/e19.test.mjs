import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, stateAt, timeSeries, gpuStatus, normalizeConfig, benchmarkStencil, jobs, DEFAULTS } from '../../src/kernels/e19.js';

const one = (extra = {}) => ({
  horizon_h: 10, drain: true, cpuNodes: 1, slotsPerNode: 1, nodeMemory_gb: 64, mix: [1, 0, 0], service_h: [2, 2, 2], memory_gb: [8, 8, 8],
  jobs: [{ t: 1, type: 0, service_h: 2 }], ...extra,
});

test('one job: latency equals its service time and the wait is zero', () => {
  const r = simulate(one(), 1);
  assert.equal(r.ok, true);
  assert.equal(r.n, 1);
  assert.equal(r.jobs.start[0], 1);
  assert.ok(Math.abs(r.jobs.end[0] - 3) < 1e-12);
  assert.ok(Math.abs(r.metrics.latency_p50_h - 2) < 1e-12);
  assert.equal(r.metrics.wait_mean_h, 0);
  assert.equal(r.metrics.completed, 1);
});

test('one job: energy matches idle power plus the busy share (analytic, 1e-12)', () => {
  const r = simulate(one({ idle_w: 100, busy_w: 300, pue: 1, electricity_usd_kwh: 0.1 }), 1);
  const T = r.window_h; // drain: window = max(horizon, last end) = 10
  const expectedKwh = (100 * T + (300 - 100) * 2) / 1000;
  assert.ok(Math.abs(r.metrics.energy_kwh - expectedKwh) < 1e-12);
  assert.ok(Math.abs(r.metrics.energy_cost_usd - expectedKwh * 0.1) < 1e-12);
});

test('D/D/1 reference: arrivals every 1 h, service 1.5 h, wait of job k is 0.5 k', () => {
  const jobsList = Array.from({ length: 8 }, (_, k) => ({ t: k, type: 0, service_h: 1.5 }));
  const r = simulate(one({ jobs: jobsList, horizon_h: 8 }), 1);
  for (let k = 0; k < 8; k++) assert.ok(Math.abs(r.jobs.start[k] - r.jobs.arrival[k] - 0.5 * k) < 1e-12, `job ${k}`);
});

test('M/M/1 reference: mean wait ≈ ρ/(μ−λ) = 1 h at ρ = 0.5 (within 10%, 3 seeds)', () => {
  let s = 0;
  for (const seed of [1, 2, 3]) {
    const r = simulate({ horizon_h: 30000, arrivals_per_h: 0.5, drain: true, cpuNodes: 1, slotsPerNode: 1, mix: [1, 0, 0], service_h: [1, 1, 1], serviceDist: 'exponential', cv: 1, memory_gb: [1, 1, 1] }, seed);
    s += r.metrics.wait_mean_h;
  }
  const mean = s / 3;
  assert.ok(Math.abs(mean - 1) < 0.1, `mean wait ${mean}`);
});

test('M/M/c reference (Erlang C): c = 4, λ = 3, μ = 1, Wq ≈ 1.528 h (within 10%, 3 seeds)', () => {
  const c = 4;
  const a = 3;
  let sum = 0;
  for (let k = 0; k < c; k++) sum += a ** k / [1, 1, 2, 6][k];
  const top = (a ** c / 24) * (c / (c - a));
  const erlangC = top / (sum + top);
  const wq = erlangC / (c - a);
  let s = 0;
  for (const seed of [4, 5, 6]) {
    const r = simulate({ horizon_h: 5000, arrivals_per_h: 3, drain: true, cpuNodes: 1, slotsPerNode: 4, mix: [1, 0, 0], service_h: [1, 1, 1], serviceDist: 'exponential', cv: 1, memory_gb: [1, 1, 1] }, seed);
    s += r.metrics.wait_mean_h;
  }
  assert.ok(Math.abs(s / 3 - wq) / wq < 0.1, `wait ${s / 3} vs ${wq}`);
});

for (const [label, cfg] of [
  ['default load', {}],
  ['overload with a queue', { arrivals_per_h: 60 }],
  ['priority policy under overload', { arrivals_per_h: 60, policy: 'priority' }],
  ['fair policy with reserve', { arrivals_per_h: 40, policy: 'fair', reserve_fraction: 0.25 }],
  ['no drain, short horizon', { horizon_h: 3, arrivals_per_h: 80 }],
]) {
  test(`invariants: ${label}`, () => {
    const r = simulate(cfg, 7);
    assert.equal(r.ok, true);
    const m = r.metrics;
    assert.equal(m.completed + m.queued + m.running, m.arrivals, 'completed + queued + running = arrivals');
    assert.ok(m.utilization >= 0 && m.utilization <= 1 + 1e-12, `utilization ${m.utilization}`);
    for (let j = 0; j < r.n; j++) {
      if (r.jobs.start[j] >= 0) assert.ok(r.jobs.start[j] - r.jobs.arrival[j] >= -1e-12, 'no negative wait');
    }
    // state view agrees with the metrics at the window end
    const st = stateAt(r, r.window_h);
    assert.equal(st.completed + st.queued.length + st.running.length, m.arrivals);
    assert.equal(st.queued.length, m.queued);
    assert.equal(st.running.length, m.running);
    assert.ok(m.energy_kwh >= 0 && m.energy_cost_usd >= 0);
    // no slot is double booked
    const ev = [];
    for (let j = 0; j < r.n; j++) if (r.jobs.start[j] >= 0) ev.push([r.jobs.node[j], r.jobs.slot[j], r.jobs.start[j], r.jobs.end[j]]);
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (let i = 1; i < ev.length; i++) if (ev[i][0] === ev[i - 1][0] && ev[i][1] === ev[i - 1][1]) assert.ok(ev[i][2] >= ev[i - 1][3] - 1e-12, 'slot overlap');
  });
}

test('time series: running never exceeds installed slots', () => {
  const r = simulate({ arrivals_per_h: 60 }, 3);
  for (const p of timeSeries(r, 48)) assert.ok(p.running <= r.totalSlots && p.queued >= 0);
});

test('FIFO starts equal-size jobs in arrival order', () => {
  const r = simulate({ arrivals_per_h: 50, mix: [1, 0, 0], horizon_h: 6, drain: true }, 11);
  let last = -1;
  for (let j = 0; j < r.n; j++) {
    assert.ok(r.jobs.start[j] >= last - 1e-12, 'start order follows arrival order');
    last = r.jobs.start[j];
  }
});

test('priority beats FIFO for the high class; aging stops starvation of the low class', () => {
  const base = { arrivals_per_h: 36, horizon_h: 24, drain: true };
  const meanWaitOf = (r, ty) => {
    let s = 0;
    let n = 0;
    for (let j = 0; j < r.n; j++) if (r.jobs.type[j] === ty) {
      s += r.jobs.start[j] - r.jobs.arrival[j];
      n++;
    }
    return s / n;
  };
  const fifo = simulate({ ...base, policy: 'fifo' }, 5);
  const strict = simulate({ ...base, policy: 'priority' }, 5);
  const fair = simulate({ ...base, policy: 'fair', aging_h: 1 }, 5);
  assert.ok(meanWaitOf(strict, 1) < meanWaitOf(fifo, 1), 'climate inference (priority 2) waits less under priority');
  assert.ok(meanWaitOf(strict, 2) > meanWaitOf(fifo, 2), 'geospatial (priority 0) waits more under strict priority');
  assert.ok(meanWaitOf(fair, 2) <= meanWaitOf(strict, 2) + 1e-9, 'aging does not make the low class wait longer than strict priority');
  assert.equal(fifo.n, strict.n, 'the same seed gives every policy the same jobs');
});

test('a GPU is unavailable unless entered; GPU jobs then run faster on it', () => {
  assert.equal(gpuStatus({}).status, 'unavailable');
  const none = simulate({ horizon_h: 12, drain: true }, 2);
  assert.equal(none.gpu.status, 'unavailable');
  assert.equal(none.jobs.gpu.reduce((s, x) => s + x, 0), 0, 'no job runs on a GPU');
  assert.ok(Number.isNaN(none.metrics.utilization_gpu));
  const withGpu = simulate({ horizon_h: 12, drain: true, gpuNodes: 1, gpuSlots: 2, gpu_speedup: 10 }, 2);
  assert.equal(withGpu.gpu.status, 'assumed');
  const g = withGpu.jobs.gpu.reduce((s, x) => s + x, 0);
  assert.ok(g > 0, 'some climate jobs use the entered GPU');
  for (let j = 0; j < withGpu.n; j++) if (withGpu.jobs.gpu[j]) assert.equal(withGpu.jobs.type[j], 1, 'only GPU-capable jobs');
});

test('a job larger than any node is reported as unable to start', () => {
  const r = simulate({ memory_gb: [8, 500, 16], nodeMemory_gb: 128 }, 1);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Climate inference needs 500 GB/);
  const none = simulate({ cpuNodes: 0 }, 1);
  assert.equal(none.ok, false);
});

test('out-of-range input throws a plain message', () => {
  assert.throws(() => simulate({ cpuNodes: 99 }, 1), /cpuNodes must be between 0 and 64/);
  assert.throws(() => simulate({ busy_w: 10, idle_w: 100 }, 1), /busy_w must be at least idle_w/);
  assert.throws(() => simulate({ mix: [0, 0, 0] }, 1), /mix needs at least one share/);
  assert.throws(() => simulate({ arrivals_per_h: 5000, horizon_h: 100 }, 1), /more than 20000 jobs/);
  assert.throws(() => simulate({}, -1), /seed/);
  assert.throws(() => normalizeConfig({ policy: 'lottery' }), /policy/);
});

test('revenue, allocation and installed capacity are different numbers', () => {
  const r = simulate({ horizon_h: 24, drain: false, price_cpu_usd_slot_h: 0.5 }, 9);
  const m = r.metrics;
  assert.ok(Math.abs(m.revenue_usd - 0.5 * m.allocated_slot_h) < 1e-9);
  assert.ok(m.allocated_slot_h <= m.installed_slot_h + 1e-9);
  assert.ok(Math.abs(m.revenue_per_installed_slot_h_usd - m.revenue_usd / m.installed_slot_h) < 1e-12);
  assert.ok(Math.abs(m.transaction_value_usd - m.completed * DEFAULTS.value_per_job_usd) < 1e-9);
  const zero = simulate({ arrivals_per_h: 0 }, 1);
  assert.equal(zero.metrics.revenue_usd, 0);
  assert.ok(Number.isNaN(zero.metrics.break_even_price_usd_slot_h));
});

test('seeded reproducibility: same seed, same digest; different seed differs', () => {
  const a = simulate({ arrivals_per_h: 30 }, 42);
  const b = simulate({ arrivals_per_h: 30 }, 42);
  const c = simulate({ arrivals_per_h: 30 }, 43);
  assert.equal(a.digest, b.digest);
  assert.deepEqual(a.metrics, b.metrics);
  assert.notEqual(a.digest, c.digest);
});

test('benchmark: fixed work gives the same checksum every time; job table runs', () => {
  const a = benchmarkStencil(32, 10);
  const b = benchmarkStencil(32, 10);
  assert.equal(a.checksum, b.checksum);
  assert.equal(a.cell_updates, 30 * 30 * 10);
  assert.throws(() => benchmarkStencil(2, 10), /size must be/);
  const j = jobs['e19.simulate']({ config: { horizon_h: 4 }, seed: 5 }, { progress() {} });
  assert.equal(j.ok, true);
});
