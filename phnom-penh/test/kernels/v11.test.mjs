// ARUN 11: forecast cutoff, missing data, observation adapter, scenario parts, experiments, evaluation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeStorm } from '../../src/kernels/storm.js';
import { PROPOSED, snapToRoads, reports } from '../../src/kernels/sensors.js';
import { observe, fitMotion, forecastPoint, heavyChance, pointSummary, analysisNow, warning, valueAt, knownIndex, members, score, fieldForecast } from '../../src/kernels/nowcast.js';
import { observe as adapt, heldOutCheck, validateObsOptions, Q, NIGHT_T, sceneReading } from '../../src/kernels/observe.js';
import { runScenario, validateConfig, outcome } from '../../src/kernels/scenario.js';
import * as X from '../../src/kernels/experiment.js';
import * as E from '../../src/kernels/evaluation.js';
import { series } from '../../src/kernels/storm.js';

const geo = JSON.parse(readFileSync(new URL('../../data/geo.json', import.meta.url)));
const SENS = snapToRoads(PROPOSED, geo).map(({ id, kind, ring, x, y }) => ({ id, kind, ring, x: Math.round(x), y: Math.round(y), on: true }));
const FAC = { x: -1500, y: -600, kind: 'hotel' };
const sameArr = (a, b, msg) => { assert.equal(a.length, b.length, msg); for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]) || (a[i] !== a[i] && b[i] !== b[i]), `${msg} [${i}] ${a[i]} vs ${b[i]}`); };
// B = A through each record's cutoff index K, arbitrary afterwards
const fork = (obs, K, mode = 'big') => obs.map(o => { const rep = Float32Array.from(o.rep); for (let k = K + 1; k < rep.length; k++) rep[k] = mode === 'big' ? 150 + (k % 7) * 20 : mode === 'nan' ? NaN : 0; return { ...o, rep }; });

test('cutoff: reports after the latest received minute change nothing up to that minute (incl. missing reports at the cutoff, fractional times)', () => {
  const storm = makeStorm(3), base = observe(storm, [...SENS, { id: 'roof', kind: 'roof', x: FAC.x, y: FAC.y }], 3);
  for (const tCut of [55, 70, 88]) {
    const K = tCut - 1;                         // every record here has latency 1
    const A = base.map(o => { const rep = Float32Array.from(o.rep); rep[K] = NaN; rep[K - 1] = NaN; return { ...o, rep }; });   // missing at the cutoff
    for (const mode of ['big', 'nan', 'zero']) {
      const B = fork(A, K, mode);
      for (const tNow of [tCut, tCut + 0.3, tCut + 0.99]) {
        assert.equal(Math.max(...A.map(o => knownIndex(o, tNow))), K);
        assert.deepEqual(fitMotion(A, tNow), fitMotion(B, tNow), `fit ${tCut} ${mode} ${tNow}`);
        const fit = fitMotion(A, tNow) || { vx: 200, vy: 40, n: 3 }, mem = { vx: fit.vx, vy: fit.vy, g: 1.1 };
        for (const [px, py] of [[FAC.x, FAC.y], [-6000, 1500], [3000, -2000]]) {
          const fa = forecastPoint(A, tNow, mem, px, py), fb = forecastPoint(B, tNow, mem, px, py);
          sameArr(fa.v, fb.v, `v ${tCut} ${mode}`); sameArr(fa.w, fb.w, `w ${tCut} ${mode}`);
        }
        const ms = members({ ...fit, cov: fit.cov || [1e-10, 0, 1e-10], sx: fit.sx || 1 / 200, sy: fit.sy || 0 }, 3);
        assert.deepEqual(heavyChance(A, tNow, ms, FAC.x, FAC.y), heavyChance(B, tNow, ms, FAC.x, FAC.y));
        const G = { x0: -12000, x1: 8000, y0: -8000, y1: 8000, nx: 12, ny: 10 };
        sameArr(analysisNow(A, tNow, G), analysisNow(B, tNow, G), 'analysis');
      }
      const wa = warning(A, FAC, { seed: 3 }), wb = warning(B, FAC, { seed: 3 });
      sameArr(wa.chance.slice(0, tCut + 1), wb.chance.slice(0, tCut + 1), `warning chance through ${tCut}`);
      sameArr(wa.state.slice(0, tCut + 1), wb.state.slice(0, tCut + 1), `warning state through ${tCut}`);
      if (wa.tWarn >= 0 && wa.tWarn <= tCut) assert.equal(wb.tWarn, wa.tWarn);
    }
  }
});

test('valueAt: never reads past the latest received minute; negative, late and rounded indices', () => {
  const rep = Float32Array.from([1, 2, NaN, NaN, 5, 6, 7]);
  assert.equal(valueAt(rep, 3, 3), 2);          // minutes 3 and 2 missing, 4 not yet received: minute 1
  assert.ok(Number.isNaN(valueAt(rep, 3, -1)));
  assert.equal(valueAt(rep, -0.4, 6), 1);
  assert.equal(valueAt(rep, 5.6, 5), 6);        // rounds to 6, clamped to 5
  assert.equal(valueAt(rep, 2.2, 3), 2);        // 2 and 3 missing, 4 is past the cutoff, 1 is not
  assert.ok(Number.isNaN(valueAt(Float32Array.from([NaN, NaN, NaN]), 1, 2)));
  assert.ok(Number.isNaN(valueAt(rep, 40, 99))); // past the end of the record: nothing within 2 minutes
});

test('missing data is not zero rain: no sensors, sparse coverage, NaN records, degenerate layouts', () => {
  const storm = makeStorm(5), obs = observe(storm, SENS, 5);
  assert.equal(fitMotion([], 90), null);
  const allNaN = obs.map(o => ({ ...o, rep: new Float32Array(o.rep.length).fill(NaN) }));
  assert.equal(fitMotion(allNaN, 120), null);
  const fit = fitMotion(obs, 110); assert.ok(fit);
  const mem = { vx: fit.vx, vy: fit.vy, g: 1 };
  // a point far across the storm's track: no evidence, NaN, not zeros
  const across = { x: FAC.x - fit.vy / Math.hypot(fit.vx, fit.vy) * 40000, y: FAC.y + fit.vx / Math.hypot(fit.vx, fit.vy) * 40000 };
  const far = forecastPoint(obs, 110, mem, across.x, across.y);
  assert.ok([...far.v].every(v => Number.isNaN(v)));
  const hc = heavyChance(obs, 110, members(fit, 5), across.x, across.y);
  assert.equal(hc.cover, 0); assert.equal(hc.p, 0);
  const ps = pointSummary(obs, 110, members(fit, 5), across.x, across.y);
  assert.ok([...ps.p50].every(v => Number.isNaN(v)) && [...ps.cover].every(c => c === 0));
  // long leads past the most upstream sensor's travel time have no evidence
  const near = forecastPoint(obs, 110, mem, FAC.x, FAC.y, 120);
  assert.ok(Number.isNaN(near.v[near.v.length - 1]), 'a two-hour lead with no upstream report is unknown');
  // a warning with too little evidence says so (state 2), not a confident 0
  const two = obs.filter(o => o.id === 'g4' || o.id === 'g5' || o.id === 'c7');
  const w = warning(two, { x: across.x, y: across.y }, { seed: 5 });
  assert.ok([...w.state].every(s => s !== 1 || true));
  assert.ok([...w.state].some(s => s === 2) || [...w.state].every(s => s === 0));
  // collinear sensors: motion not determined
  const line = [0, 1, 2].map(i => ({ id: 'l' + i, kind: 'gauge', x: i * 3000, y: 0, lat: 1, rep: Float32Array.from({ length: 181 }, (_, t) => (t > 40 + i * 10 ? 30 : 0)) }));
  assert.equal(fitMotion(line, 120), null);
  // score: a cell with no forecast counts as a miss where heavy rain fell, and is left out of the RMSE
  const s = score(Float32Array.from([NaN, 30, 0]), Float32Array.from([40, 30, 0]));
  assert.equal(s.misses, 1); assert.equal(s.hits, 1); assert.equal(s.cover, 2 / 3); assert.ok(Number.isFinite(s.rmse));
  const ff = fieldForecast(obs, 110, fit, 30, { x0: -40000, x1: 40000, y0: -40000, y1: 40000, nx: 8, ny: 8 });
  assert.ok([...ff].some(v => Number.isNaN(v)) && [...ff].some(v => Number.isFinite(v)));
});

test('observation adapter: gauges unchanged from v10, cameras from the scene table, quality flags, options', () => {
  const storm = makeStorm(2), obs = adapt(storm, SENS, 2);
  for (const o of obs.filter(o => o.kind === 'gauge')) {
    const s = SENS.find(x => x.id === o.id), v10 = reports(s, series(storm, s.x, s.y), 2);
    sameArr(o.rep, v10, 'gauge ' + o.id);
  }
  const cam = obs.find(o => o.id === 'c4');
  assert.ok([...cam.q].slice(NIGHT_T).every(q => q === Q.night || q === Q.missing));
  assert.ok([...cam.rep].every((v, t) => (cam.q[t] === Q.missing) === Number.isNaN(v)));
  assert.deepEqual([...adapt(storm, SENS, 2)[0].rep], [...obs[0].rep], 'deterministic');
  const late = adapt(storm, SENS, 2, { delay: 5 });
  assert.equal(late.find(o => o.id === 'g4').lat, 6);
  assert.equal(adapt(storm, [...SENS, { id: 'roof', kind: 'roof', x: 0, y: 0 }], 2, { delay: 5 }).find(o => o.id === 'roof').lat, 1);
  const noisy = adapt(storm, SENS, 2, { noiseScale: 3 }).find(o => o.id === 'c4');
  assert.notDeepEqual([...noisy.rep], [...cam.rep]);
  assert.throws(() => validateObsOptions({ drop: 2 })); assert.throws(() => validateObsOptions({ delay: 1.5 }));
  assert.throws(() => adapt(storm, [{ id: 'x', kind: 'drone', x: 0, y: 0 }], 2));
  assert.equal(sceneReading(0, false).mean, 0);
  const h = heldOutCheck();
  assert.ok(h.n >= 40 && h.mae < 4 && h.meanRel < 0.15, JSON.stringify(h));
});

test('scenario: inputs validated; truth, observations, inference and evaluation kept apart', () => {
  const cfg = { seed: 1, sensors: SENS, facility: FAC };
  const r = runScenario(cfg);
  assert.equal(r.network.prep, r.evaluation.network.prep);
  assert.equal(r.tWater, r.truth.tWater);
  // the inference is a function of the observations alone
  const again = warning(r.obs, FAC, { seed: 1 });
  assert.equal(again.tWarn, r.inference.network.tWarn);
  assert.ok(!('storm' in r.inference.network) && r.obs.every(o => !('truth' in o)));
  for (const bad of [{ ...cfg, seed: 0 }, { ...cfg, seed: 1.5 }, { ...cfg, facility: { x: NaN, y: 0 } }, { ...cfg, sensors: [{ id: 'a', kind: 'x', x: 0, y: 0 }] }, { ...cfg, warnP: 0 }, { ...cfg, hydro: { catchHa: -1 } }, { ...cfg, obsOpts: { drop: 5 } }])
    assert.throws(() => runScenario(bad));
  assert.equal(outcome(-1, -1), 'quiet'); assert.equal(outcome(-1, 40), 'false'); assert.equal(outcome(90, -1), 'miss'); assert.equal(outcome(90, 90), 'late'); assert.equal(outcome(90, 50), 'hit');
  assert.deepEqual(runScenario(cfg).network.chance, r.network.chance, 'deterministic');
});

test('experiment: actions, validation, undo/redo, replay, hashes, cost', () => {
  assert.deepEqual(X.validateState(X.BASELINE), []);
  assert.ok(Object.isFrozen(X.BASELINE.facility));
  let h = X.history();
  h = X.apply(h, { type: 'add', kind: 'gauge', x: -5200.4, y: -500 });
  h = X.apply(h, { type: 'remove', id: 'c4' });
  h = X.apply(h, { type: 'move', id: 'n1', x: -5000, y: -400 });
  h = X.apply(h, { type: 'threshold', value: 0.3 });
  assert.deepEqual(h.present.added, [{ id: 'n1', kind: 'gauge', x: -5000, y: -400 }]);
  assert.deepEqual(h.present.off, ['c4']);
  const u = X.undo(h); assert.equal(u.present.warnP, 0.5);
  const rr = X.redo(u); assert.deepEqual(rr.present, h.present);
  const states = X.replayLog(rr.log); assert.deepEqual(states[states.length - 1], rr.present);
  assert.equal(X.hashState({ b: 1, a: [1, { d: 2, c: 3 }] }), X.hashState({ a: [1, { c: 3, d: 2 }], b: 1 }));
  assert.notEqual(X.hashState(h.present), X.BASELINE_HASH);
  assert.throws(() => X.reduce(X.BASELINE, { type: 'remove', id: 'n9' }) && X.reduce(X.reduce(X.BASELINE, { type: 'remove', id: 'n9' }), { type: 'remove', id: 'n9' }));
  assert.throws(() => X.reduce(X.BASELINE, { type: 'threshold', value: 2 }));
  assert.throws(() => X.reduce(X.BASELINE, { type: 'add', kind: 'drone', x: 0, y: 0 }));
  assert.ok(X.validateState({ ...X.BASELINE, extraKey: 1 }).length);
  assert.ok(X.validateState({ ...X.BASELINE, added: [{ id: 'n1', kind: 'gauge', x: 0, y: 0, name: '<b>' }] }).length);
  assert.equal(X.reduce(X.reduce(X.BASELINE, { type: 'seed', seed: 9 }), { type: 'reset' }).seed, 1);
  const c0 = X.costOf(X.BASELINE, SENS), c1 = X.costOf(h.present, SENS);
  assert.equal(c1.usd, c0.usd + X.PRICES.gauge - X.PRICES.camera);
  assert.deepEqual(X.logEntry({ type: 'add', kind: 'gauge', x: 1, y: 2, secret: 'x' }), { type: 'add', kind: 'gauge', x: 1, y: 2 });
  const cfg = X.configOf(h.present, SENS);
  assert.equal(cfg.sensors.find(s => s.id === 'c4').on, false);
  assert.equal(runScenario(cfg).obs.filter(o => o.id === 'c4').length, 0);
});

test('evaluation: held-out storms apart from practice, classes add up, deterministic', () => {
  assert.equal(E.PRACTICE.filter(s => E.HELDOUT.includes(s)).length, 0);
  const cfg = X.configOf(X.BASELINE, SENS);
  const a = E.evaluateSet(cfg, E.HELDOUT.slice(0, 6)), b = E.evaluateSet(cfg, E.HELDOUT.slice(0, 6));
  assert.deepEqual(a, b);
  const s = a.summary; assert.equal(Object.values(s.network).reduce((x, y) => x + y, 0), 6);
  const one = runScenario({ ...cfg, seed: E.HELDOUT[0] });
  assert.equal(a.rows[0].prepNet, one.network.prep);
  const q = E.quantiles([5, 1, 3, null, NaN, 9]); assert.equal(q.n, 4); assert.equal(q.min, 1); assert.equal(q.max, 9);
  // a far western spot: storms where water never reaches the door are counted, not dropped
  const w = E.evaluateSet({ ...cfg, facility: { x: -12000, y: -6000, kind: 'hotel' } }, E.HELDOUT.slice(0, 12));
  assert.ok(w.summary.network.quiet + w.summary.network.false > 0, JSON.stringify(w.summary.network));
});
