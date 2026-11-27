// node --test test/kernels/resilience.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAlerts, scoreAlerts, gaps, staleness, meanDelay, completeness } from '../../src/resilience/kernels/alerts.js';
import { simulateDevice } from '../../src/resilience/kernels/device.js';
import { outages, maskOf, segments, DAY, stream } from '../../src/resilience/kernels/common.js';
import { evaluate } from '../../src/resilience/kernels/evaluate.js';
import { run, ensemble, ORDER, EXPERIMENTS, defaultsFor } from '../../src/resilience/kernels/index.js';

const noLink = H => new Uint8Array(H);
const base = { interval: 10, battery: 1e9, mode: 'direct', batch: 5, pickupDays: 3, assumed: {} };

// A hand-built cold-room series: 4 C with one excursion at minutes 100..119 (20 minutes at 12 C).
function coldSeries(H = 300) {
  const T = new Float32Array(H).fill(4);
  for (let t = 100; t < 120; t++) T[t] = 12;
  return T;
}
function scoreCold(interval, linkIv = [], mode = 'direct', local = false) {
  const H = 300, T = coldSeries(H);
  const def = { H, channels: [{ id: 'temp', kind: 'high', truth: T, sd: 0, thr: 8, alert: true, events: segments(T, v => v > 8), pre: 0 }] };
  const ev = evaluate(def, { ...base, interval, mode, linkKind: 'none', localAlert: local }, 1);
  // replace the link by a hand-built one and score again
  const down = maskOf(linkIv, H);
  const dev = simulateDevice({ ...base, interval, mode }, down, H);
  const vals = dev.ts.map(t => T[t]);
  const alerts = detectAlerts(dev.ts, dev.arr, vals, v => v > 8, local);
  return { ev, dev, alerts, score: scoreAlerts(def.channels[0].events, alerts) };
}

test('segments finds contiguous runs and merges close ones', () => {
  const a = Float32Array.from([0, 1, 1, 0, 0, 1, 0, 1, 1]);
  assert.deepEqual(segments(a, v => v > 0), [{ start: 1, end: 3 }, { start: 5, end: 6 }, { start: 7, end: 9 }]);
  assert.deepEqual(segments(a, v => v > 0, 1), [{ start: 1, end: 3 }, { start: 5, end: 9 }]);
});

test('an excursion is caught when the interval puts a sample inside it', () => {
  for (const iv of [5, 10, 15, 20]) {
    const r = scoreCold(iv);
    assert.equal(r.score.caught, 1, `interval ${iv}`);
    assert.equal(r.score.missed, 0);
  }
  // 20 min interval: samples at 100 and 120 -> 100 is inside [100,120)
  assert.equal(scoreCold(20).alerts[0].ts, 100);
});

test('an excursion is missed when the samples fall either side of it', () => {
  for (const iv of [30, 60]) { const r = scoreCold(iv); assert.equal(r.score.missed, 1, `interval ${iv}`); assert.equal(r.score.caught, 0); }
  // 25 min interval: samples at 100? 100/25 = 4 -> inside. 45 min: 90, 135 -> outside.
  assert.equal(scoreCold(45).score.missed, 1);
  assert.equal(scoreCold(25).score.caught, 1);
});

test('lead time is start minus the time the alert arrives', () => {
  const r = scoreCold(10);
  assert.equal(r.alerts[0].t, 100);
  assert.equal(r.score.leads[0], 0);
  const w = scoreAlerts([{ start: 500, end: 600 }], [{ ts: 380, t: 380 }], { pre: 240 });
  assert.equal(w.caught, 1); assert.equal(w.leadMedian, 120);
});

test('a link outage across the excursion makes it a miss in direct mode, late in store-and-forward', () => {
  const out = [[90, 130]];
  const d = scoreCold(10, out, 'direct');
  assert.equal(d.score.missed, 1);
  const s = scoreCold(10, out, 'sf');
  assert.equal(s.score.missed + s.score.late + s.score.caught, 1);
  assert.equal(s.score.missed, 0);
  assert.equal(s.score.late, 1, 'the batch arrives after the event ended');
  assert.ok(s.alerts[0].t >= 120);
  // an on-device alert is not delayed by the link
  const l = scoreCold(10, out, 'direct', true);
  assert.equal(l.score.caught, 1); assert.equal(l.alerts[0].t, 100);
});

test('alerts that match no event are false alerts, once per run', () => {
  const sc = scoreAlerts([{ start: 100, end: 120 }], [{ ts: 10, t: 10 }, { ts: 105, t: 105 }, { ts: 250, t: 250 }]);
  assert.equal(sc.falseAlerts, 2); assert.equal(sc.caught, 1);
  const vals = [1, 9, 9, 9, 1, 9];
  const al = detectAlerts([0, 10, 20, 30, 40, 50], vals.map(() => 0), vals, v => v > 8, true);
  assert.deepEqual(al.map(a => a.ts), [10, 50]);
});

test('completeness: delivered over expected', () => {
  const H = 100, iv = 10;
  const d = simulateDevice({ ...base, interval: iv }, maskOf([[20, 50]], H), H);
  // slots 0..90 = 10; lost at 20,30,40 -> 7 delivered
  assert.equal(d.ts.length, 10);
  assert.equal(completeness(d.arr, H, iv), 0.7);
  const full = simulateDevice({ ...base, interval: iv }, noLink(H), H);
  assert.equal(completeness(full.arr, H, iv), 1);
});

test('staleness arithmetic: direct delivery with a 10 minute interval', () => {
  const H = 100, d = simulateDevice({ ...base, interval: 10 }, noLink(H), H);
  const s = staleness(d.ts, d.arr, H);
  assert.equal(s.mean, 4.5); assert.equal(s.max, 9);
  assert.equal(meanDelay(d.ts, d.arr), 0);
});

test('store-and-forward arithmetic: batches of 5 readings go out together', () => {
  const H = 100, d = simulateDevice({ ...base, interval: 10, mode: 'sf', batch: 5 }, noLink(H), H);
  // batch at minute 50 carries readings 0,10,20,30,40,50: delays 50,40,30,20,10,0
  assert.deepEqual(d.arr.slice(0, 6), [50, 50, 50, 50, 50, 50]);
  assert.equal(meanDelay(d.ts.slice(0, 6), d.arr.slice(0, 6)), 25);
  assert.equal(d.arr[9], Infinity, 'readings after the last batch have not arrived by the end');
});

test('a batch that finds the link down is sent at the next attempt', () => {
  const H = 200, d = simulateDevice({ ...base, interval: 10, mode: 'sf', batch: 5 }, maskOf([[50, 80]], H), H);
  assert.equal(d.arr[0], 100);
  assert.equal(d.arr[7], 100);
});

test('gaps: spacing over 1.5 intervals in the delivered record', () => {
  const H = 100, d = simulateDevice({ ...base, interval: 10 }, maskOf([[30, 60]], H), H);
  assert.deepEqual(gaps(d.ts, d.arr, H, 10), { count: 1, minutes: 30 });
  const clean = simulateDevice({ ...base, interval: 10 }, noLink(H), H);
  assert.deepEqual(gaps(clean.ts, clean.arr, H, 10), { count: 0, minutes: 0 });
});

test('battery: a small battery stops the logger, a bigger one lasts the run', () => {
  const H = 3 * DAY;
  const small = simulateDevice({ ...base, interval: 1, battery: 100 }, noLink(H), H);
  assert.ok(small.dead != null && small.dead < H);
  const big = simulateDevice({ ...base, interval: 15, battery: 3000 }, noLink(H), H);
  assert.equal(big.dead, null);
  assert.ok(big.swapsMonth < small.swapsMonth);
});

test('store-and-forward sends fewer messages and spends less energy than direct', () => {
  const H = 7 * DAY;
  const d = simulateDevice({ ...base, interval: 5, battery: 1e9 }, noLink(H), H);
  const s = simulateDevice({ ...base, interval: 5, battery: 1e9, mode: 'sf', batch: 6 }, noLink(H), H);
  assert.ok(s.ok < d.ok / 3 && s.energy < d.energy);
});

test('outages: same starts when the length changes; none gives nothing', () => {
  const H = 7 * DAY;
  const a = outages('scattered', 60, H, stream(3, 'link')), b = outages('scattered', 240, H, stream(3, 'link'));
  assert.equal(outages('none', 60, H, stream(3, 'link')).length, 0);
  assert.ok(a.length >= 5);
  const tot = x => x.reduce((s, [p, q]) => s + q - p, 0);
  assert.ok(tot(b) > tot(a));
  assert.equal(outages('daily', 60, H, stream(3, 'link')).length, 7);
  assert.equal(outages('single', 600, H, stream(3, 'link')).length, 1);
});

test('determinism: same seed, same result; another seed, another result', () => {
  for (const id of ORDER) {
    const a = run(id, {}, 7).flat, b = run(id, {}, 7).flat, c = run(id, {}, 8).flat;
    assert.deepEqual(JSON.stringify(a), JSON.stringify(b), id);
    assert.notEqual(JSON.stringify(a), JSON.stringify(c), id);
  }
  const e1 = ensemble('cold', {}, 1, 12), e2 = ensemble('cold', {}, 1, 12);
  assert.deepEqual(JSON.stringify(e1), JSON.stringify(e2));
});

test('truth depends on the seed and truth parameters, not on logger, link or threshold', () => {
  for (const id of ORDER) {
    const a = run(id, {}, 5), b = run(id, { interval: 60, linkKind: 'single', linkLen: 600, battery: 300, mode: 'sf', thr: 20 }, 5);
    a.channels.forEach((ch, i) => assert.deepEqual(Array.from(ch.truth), Array.from(b.channels[i].truth), `${id}/${ch.id}`));
  }
});

test('a longer logger interval changes what the record shows of the cold room', () => {
  const fine = ensemble('cold', { interval: 5, linkKind: 'none' }, 1, 20).keys;
  const coarse = ensemble('cold', { interval: 60, linkKind: 'none' }, 1, 20).keys;
  assert.ok(fine.exc_in_record.med > coarse.exc_in_record.med);
  assert.ok(fine['temp.missed'].med < coarse['temp.missed'].med);
  assert.equal(fine.exc_true_min.med, coarse.exc_true_min.med, 'truth is unchanged by the interval');
});

test('a network changes delivery time, not the shortage', () => {
  const ev = run('conn', {}, 3);
  const by = Object.fromEntries(ev.compare.map(c => [c.mode, c.flat]));
  assert.ok(by.direct.short_min > 0);
  assert.equal(by.local.short_min, by.direct.short_min);
  assert.equal(by.sf.short_min, by.direct.short_min);
  assert.ok(by.sf.delay_mean > by.direct.delay_mean);
  assert.ok(by.local.delay_mean > by.sf.delay_mean);
  assert.ok(by.local.unseen_min >= by.sf.unseen_min && by.sf.unseen_min >= by.direct.unseen_min);
  assert.ok(by.sf.energy_day < by.direct.energy_day);
  // the same on the distribution
  const e = ensemble('conn', {}, 1, 20).keys;
  assert.equal(e['cmp.sf.short_min'].med, e['cmp.direct.short_min'].med);
  assert.ok(e['cmp.sf.delay_mean'].med > e['cmp.direct.delay_mean'].med);
});

test('power experiment: record availability estimate is near the truth and reports a difference', () => {
  const k = ensemble('power', {}, 1, 20).keys;
  assert.ok(k.avail_true.med > 90 && k.avail_true.med < 100);
  assert.ok(k.avail_err.med < 3);
});

test('water experiment: low-tank alerts lead the shortage; verified tests are sparse', () => {
  const k = ensemble('water', {}, 1, 20).keys;
  assert.ok(k['tank.lead'].med > 0);
  assert.ok(k['tests.n'].med >= 6);
  assert.ok(k['tests.covered'].med <= 0.6);
});

test('every experiment has defaults and results with finite observed numbers', () => {
  for (const id of ORDER) {
    assert.ok(EXPERIMENTS[id] && defaultsFor(id).interval);
    const f = run(id, {}, 2).flat;
    for (const k of ['completeness', 'stale_mean', 'energy_day', 'swaps_month']) assert.ok(Number.isFinite(f[k]), `${id} ${k}`);
  }
});
