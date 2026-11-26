import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as k from '../../src/kernels/e15.js';

const cfg = { K: 16, noise: 0.12, drift: 0.05 };
const ds = k.makeDataset(cfg, 4);
const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

test('same vector has similarity 1 and change score 0 (1e-12)', () => {
  const v = k.vecAt(ds, 10, 3);
  assert.ok(Math.abs(k.cosine(v, v) - 1) < 1e-6);
  const w = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i + 1));
  assert.ok(Math.abs(k.cosine(w, w) - 1) < 1e-12);
  assert.ok(Math.abs(k.changeScoreOf(w, w)) < 1e-12);
});

test('zero-norm vector gives null, never NaN', () => {
  const z = new Float64Array(64), v = Float64Array.from({ length: 64 }, (_, i) => i + 1);
  assert.equal(k.cosine(z, v), null);
  assert.equal(k.cosine(z, z), null);
  assert.equal(k.changeScoreOf(v, z), null);
  assert.equal(k.cosine(Float64Array.from({ length: 64 }, () => NaN), v), null);
});

test('orthogonal vectors have similarity 0; opposite -1', () => {
  const a = new Float64Array(64), b = new Float64Array(64);
  a[3] = 2; b[40] = 5;
  assert.equal(k.cosine(a, b), 0);
  const c = Float64Array.from(a, (x) => -x);
  assert.equal(k.cosine(a, c), -1);
});

test('reference check: cosine matches a brute-force double loop on dataset vectors (1e-9)', () => {
  for (const [t1, t2] of [[0, 1], [5, 200], [100, 101]]) {
    const a = k.vecAt(ds, t1, 0), b = k.vecAt(ds, t2, 6);
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < 64; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    assert.ok(Math.abs(k.cosine(a, b) - d / Math.sqrt(na * nb)) < 1e-9);
  }
});

test('embeddings are unit norm, masked tile-years are zero vectors', () => {
  let masked = 0, unit = 0;
  for (let t = 0; t < ds.T; t++)
    for (let y = 0; y < ds.Y; y++) {
      const v = k.vecAt(ds, t, y);
      if (!ds.valid[t * ds.Y + y]) { masked++; assert.equal(norm(v), 0); } else { unit++; assert.ok(Math.abs(norm(v) - 1) < 1e-5); }
    }
  assert.ok(masked > 0 && unit > 0);
  assert.equal(ds.emb.length, ds.T * ds.Y * 64);
});

test('seeded reproducibility: same seed identical, new seed differs', () => {
  const again = k.makeDataset(cfg, 4);
  assert.deepEqual(Array.from(again.emb), Array.from(ds.emb));
  assert.deepEqual(Array.from(again.cls), Array.from(ds.cls));
  assert.notDeepEqual(Array.from(k.makeDataset(cfg, 5).emb.slice(0, 64)), Array.from(ds.emb.slice(0, 64)));
});

test('prototypes share a common component: unchanged tiles stay near, changed tiles move far', () => {
  const { score, ok } = k.changeScores(ds, 0, 7), truth = k.truthChanged(ds, 0, 7);
  let su = 0, nu = 0, sc = 0, nc = 0;
  for (let t = 0; t < ds.T; t++) if (ok[t]) { if (truth[t]) { sc += score[t]; nc++; } else { su += score[t]; nu++; } }
  assert.ok(nc > 5 && nu > 50);
  assert.ok(su / nu < 0.1, `unchanged ${su / nu}`);
  assert.ok(sc / nc > 0.3, `changed ${sc / nc}`);
});

test('PCA components are unchanged when non-reference embeddings are altered (no fit on tiles outside the reference)', () => {
  const a = 0;
  const refs = k.referenceTiles(ds, 30, 4, a);
  const before = k.pcaFit(refs.map((t) => k.vecAt(ds, t, a)), 3, 4);
  const copy = { ...ds, emb: Float32Array.from(ds.emb) };
  const isRef = new Set(refs);
  for (let t = 0; t < ds.T; t++) if (!isRef.has(t)) for (let y = 0; y < ds.Y; y++) for (let i = 0; i < 64; i++) copy.emb[(t * ds.Y + y) * 64 + i] += 0.5;
  const after = k.pcaFit(refs.map((t) => k.vecAt(copy, t, a)), 3, 4);
  for (let c = 0; c < 3; c++) assert.deepEqual(Array.from(after.comps[c]), Array.from(before.comps[c]));
  const an1 = k.analyze(ds, { a, b: 7, thr: 0.2, R: 30, k: 5, seed: 4 });
  const an2 = k.analyze(copy, { a, b: 7, thr: 0.2, R: 30, k: 5, seed: 4 });
  assert.deepEqual(Array.from(an1.model.comps[0]), Array.from(an2.model.comps[0]));
});

test('reference check: power-iteration PCA equals Jacobi eigendecomposition (values 1e-6 rel, vectors |cos| > 0.9999)', () => {
  const refs = k.referenceTiles(ds, 120, 4, 0);
  const vecs = refs.map((t) => k.vecAt(ds, t, 0));
  const m = k.pcaFit(vecs, 3, 4);
  const J = k.jacobiEigen(k.covariance(vecs, m.mean), 64);
  for (let c = 0; c < 3; c++) {
    assert.ok(Math.abs(m.vals[c] - J.vals[c]) / J.vals[c] < 1e-6, `value ${c}: ${m.vals[c]} vs ${J.vals[c]}`);
    assert.ok(Math.abs(k.cosine(m.comps[c], J.vecs[c])) > 0.9999, `vector ${c}`);
  }
  let tr = 0;
  for (const v of J.vals) tr += v;
  assert.ok(Math.abs(tr - m.totalVar) / tr < 1e-9);
});

test('Jacobi reference solves a known 2x2 case', () => {
  const r = k.jacobiEigen(Float64Array.from([2, 1, 1, 2]), 2);
  assert.ok(Math.abs(r.vals[0] - 3) < 1e-12 && Math.abs(r.vals[1] - 1) < 1e-12);
});

test('projection of a reference vector onto fitted axes matches dot products', () => {
  const refs = k.referenceTiles(ds, 30, 4, 0);
  const m = k.pcaFit(refs.map((t) => k.vecAt(ds, t, 0)), 3, 4);
  const v = k.vecAt(ds, 7, 3), p = k.project(m, v);
  for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let i = 0; i < 64; i++) s += m.comps[c][i] * (v[i] - m.mean[i]);
    assert.ok(Math.abs(p[c] - s) < 1e-12);
  }
});

test('reference patches are nested in R, valid in the reference year, and taps are added', () => {
  const r20 = k.referenceTiles(ds, 20, 4, 0), r40 = k.referenceTiles(ds, 40, 4, 0);
  assert.deepEqual(r40.slice(0, 20), r20);
  for (const t of r40) assert.ok(ds.valid[t * ds.Y]);
  const extra = r40.includes(3) ? 4 : 3;
  const withTap = k.referenceTiles(ds, 20, 4, 0, [extra]);
  assert.ok(withTap.includes(extra));
});

test('kNN: neighbours sorted by similarity, k respected, vote share in [0,1], query excluded', () => {
  const refs = k.referenceTiles(ds, 60, 4, 0);
  const r = k.knn(ds, refs[0], 0, refs, 0, 5);
  assert.equal(r.neighbours.length, 5);
  for (let i = 1; i < 5; i++) assert.ok(r.neighbours[i - 1].sim >= r.neighbours[i].sim);
  assert.ok(!r.neighbours.some((n) => n.tile === refs[0]));
  assert.ok(r.voteShare > 0 && r.voteShare <= 1);
  assert.throws(() => k.knn(ds, 0, 0, refs, 0, 0), /k must be between/);
});

test('null stats: z and empirical p are consistent; p in (0,1]', () => {
  const { score, ok } = k.changeScores(ds, 0, 7), truth = k.truthChanged(ds, 0, 7);
  const nul = k.nullStats(score, ok, truth);
  assert.ok(nul.n > 100 && nul.sd > 0);
  assert.ok(nul.p(10) < 0.01 && nul.p(-1) === 1);
  assert.ok(Math.abs(nul.z(nul.mean)) < 1e-12);
});

test('detection: F1 high at low noise and lower at high noise; a zero threshold flags every valid tile', () => {
  const lo = k.analyze(ds, { a: 0, b: 7, thr: 0.2, R: 30, k: 5, seed: 4 });
  assert.ok(lo.metrics.f1 > 0.85, `f1 ${lo.metrics.f1}`);
  const hiDs = k.makeDataset({ K: 16, noise: 0.5, drift: 0.05 }, 4);
  const hi = k.analyze(hiDs, { a: 0, b: 7, thr: 0.2, R: 30, k: 5, seed: 4 });
  assert.ok(hi.metrics.f1 < lo.metrics.f1 - 0.2, `hi ${hi.metrics.f1}`);
  const all = k.analyze(ds, { a: 0, b: 7, thr: 0, R: 30, k: 5, seed: 4 });
  assert.equal(all.metrics.flagged, all.metrics.tp + all.metrics.fp);
  assert.ok(all.metrics.flagged >= lo.metrics.flagged);
  const same = k.analyze(ds, { a: 3, b: 3, thr: 0.2, R: 30, k: 5, seed: 4 });
  assert.equal(same.metrics.f1, null);
});

test('annual drift raises false alarms at a fixed threshold', () => {
  const d0 = k.makeDataset({ K: 16, noise: 0.12, drift: 0 }, 4), d1 = k.makeDataset({ K: 16, noise: 0.12, drift: 0.5 }, 4);
  const m = (d) => { const s = k.changeScores(d, 0, 7); return k.detectionMetrics(s.score, s.ok, k.truthChanged(d, 0, 7), 0.2); };
  assert.ok(m(d1).falseAlarmRate > m(d0).falseAlarmRate + 0.3);
});

test('random projection axes are orthonormal and seeded', () => {
  const refs = k.referenceTiles(ds, 30, 4, 0).map((t) => k.vecAt(ds, t, 0));
  const m = k.randomProjection(refs, 3, 9), m2 = k.randomProjection(refs, 3, 9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(k.cosine(m.comps[i], m.comps[j]) - (i === j ? 1 : 0)) < 1e-9);
  assert.deepEqual(Array.from(m.comps[1]), Array.from(m2.comps[1]));
});

test('validation throws plain messages', () => {
  assert.throws(() => k.makeDataset({ K: 5, noise: 0.1, drift: 0 }, 0), /K must be between 12 and 32/);
  assert.throws(() => k.makeDataset({ K: 16, noise: -1, drift: 0 }, 0), /noise must be between/);
  assert.throws(() => k.makeDataset({ K: 16.5, noise: 0.1, drift: 0 }, 0), /whole number/);
  assert.throws(() => k.pcaFit([new Float64Array(64)], 3), /at least 3/);
});

test('job: build matches makeDataset; noiseSweep is seeded and F1 falls with noise', () => {
  const j = k.jobs['e15.build']({ cfg, seed: 4 }, { progress() {} });
  assert.deepEqual(Array.from(k.datasetFromJob(j).emb.slice(0, 200)), Array.from(ds.emb.slice(0, 200)));
  const p = { K: 14, a: 0, b: 7, thr: 0.2, drift: 0.5, seed: 2, nSeeds: 3, levels: [0.05, 0.5] };
  const s1 = k.jobs['e15.noiseSweep'](p, { progress() {} }), s2 = k.jobs['e15.noiseSweep'](p, { progress() {} });
  assert.deepEqual(s1, s2);
  assert.ok(s1.drift0.f1[0] > s1.drift0.f1[1] + 0.2);
  assert.ok(s1.driftNow.fpr[0] > s1.drift0.fpr[0]);
});
