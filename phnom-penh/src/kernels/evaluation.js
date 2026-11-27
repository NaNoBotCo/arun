// Scoring an experiment over many storms. Practice storms (1–24) can be watched and replayed; held-out
// storms (101–148) are scored and only shown when the truth is revealed. A replayed storm is practice,
// not new evidence. Results are distributions; no single storm stands for the set.
import { runScenario } from './scenario.js';
import { members, pointSummary, fitMotion } from './nowcast.js';

export const PRACTICE = Array.from({ length: 24 }, (_, i) => 1 + i);
export const HELDOUT = Array.from({ length: 48 }, (_, i) => 101 + i);
export const CLASSES = ['hit', 'late', 'miss', 'false', 'quiet'];

export function quantiles(a) {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!s.length) return { n: 0, min: null, p25: null, median: null, p75: null, max: null, mean: null };
  const q = p => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
  return { n: s.length, min: s[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: s[s.length - 1], mean: s.reduce((x, y) => x + y, 0) / s.length };
}

// One storm: outcome classes, lead minutes, and the forecast at the door 30 minutes before water
// (or at minute 60 when water never comes) against what fell: error of the median member, the 10–90%
// spread, and the share of the next hour with evidence.
export function evaluateOne(cfg, seed) {
  const r = runScenario({ ...cfg, seed, storm: undefined });
  const row = { seed, tWater: r.tWater, net: r.network.tWarn, alone: r.alone.tWarn, prepNet: r.network.prep, prepAlone: r.alone.prep, gain: r.gain, netClass: r.network.outcome, aloneClass: r.alone.outcome, err: null, spread: null, cover: null };
  const tq = r.tWater >= 0 ? Math.max(0, r.tWater - 30) : 60;
  const obs = r.obs.filter(o => o.kind !== 'roof'), fit = fitMotion(obs, tq);
  if (fit) {
    const ps = pointSummary(obs, tq, members(fit, seed), cfg.facility.x, cfg.facility.y, 60, 2);
    let se = 0, sp = 0, n = 0;
    for (let k = 0; k < ps.p50.length; k++) { const tt = tq + 2 * k; if (tt > 180 || ps.p50[k] !== ps.p50[k]) continue; se += Math.abs(ps.p50[k] - r.rainAtDoor[tt]); sp += ps.p90[k] - ps.p10[k]; n++; }
    row.cover = n / ps.p50.length; row.err = n ? se / n : null; row.spread = n ? sp / n : null;
  } else row.cover = 0;
  return row;
}

export function summarize(rows) {
  const by = k => Object.fromEntries(CLASSES.map(c => [c, rows.filter(r => r[k] === c).length]));
  return {
    n: rows.length, network: by('netClass'), alone: by('aloneClass'),
    leadNet: quantiles(rows.map(r => r.prepNet)), leadAlone: quantiles(rows.map(r => r.prepAlone)), gain: quantiles(rows.map(r => r.gain)),
    err: quantiles(rows.map(r => r.err)), spread: quantiles(rows.map(r => r.spread)), cover: quantiles(rows.map(r => r.cover)),
  };
}

export function evaluateSet(cfg, seeds = HELDOUT) { const rows = seeds.map(s => evaluateOne(cfg, s)); return { rows, summary: summarize(rows) }; }

// The same, a few storms at a time, so the page stays responsive. Returns a cancel function.
export function evaluateChunked(cfg, seeds, onProgress, onDone, per = 3) {
  const rows = []; let i = 0, alive = true;
  const step = () => {
    if (!alive) return;
    for (let k = 0; k < per && i < seeds.length; k++, i++) rows.push(evaluateOne(cfg, seeds[i]));
    if (onProgress) onProgress(rows.length, seeds.length);
    if (i < seeds.length) setTimeout(step, 0); else onDone({ rows, summary: summarize(rows) });
  };
  setTimeout(step, 0);
  return () => { alive = false; };
}
