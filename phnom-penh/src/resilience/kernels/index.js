// Registry, runner and distributions over seeds.
import { COMMON, summarize } from './common.js';
import { evaluate } from './evaluate.js';
import { water } from './water.js';
import { cold } from './cold.js';
import { power } from './power.js';
import { env } from './env.js';
import { conn } from './conn.js';

export const EXPERIMENTS = { water, cold, power, env, conn };
export const ORDER = ['water', 'cold', 'power', 'env', 'conn'];
export const MODES = ['local', 'direct', 'sf'];

export function defaultsFor(id) {
  const e = EXPERIMENTS[id];
  const mode = id === 'conn' ? e.defaults.mode : 'direct';
  return { ...COMMON, mode, localAlert: false, ...e.defaults };
}

// One run. The experiment's own build uses only truth parameters and the seed; logger, link and alert
// parameters act afterwards, so changing them leaves the truth as it was.
export function run(id, params, seed) {
  const e = EXPERIMENTS[id];
  const p = { ...defaultsFor(id), ...params };
  const def = e.build(p, seed);
  def.extra = e.extra;
  const ev = evaluate(def, p, seed);
  if (id === 'conn') {
    ev.compare = MODES.map(mode => {
      const x = mode === p.mode ? ev : evaluate(def, { ...p, mode }, seed);
      return { mode, flat: x.flat };
    });
    for (const c of ev.compare) for (const [k, v] of Object.entries(c.flat)) if (['completeness', 'delay_mean', 'stale_mean', 'stale_max', 'unseen_min', 'energy_day', 'swaps_month', 'cost_month', 'msgs_month', 'visits_month', 'short_min'].includes(k)) ev.flat[`cmp.${c.mode}.${k}`] = v;
  }
  ev.def = def;
  return ev;
}

export function ensemble(id, params, seed, n = 40) {
  const cols = {};
  for (let i = 0; i < n; i++) {
    const f = run(id, params, seed + i).flat;
    for (const [k, v] of Object.entries(f)) (cols[k] ||= []).push(v);
  }
  const out = {};
  for (const [k, v] of Object.entries(cols)) out[k] = summarize(v);
  return { n, seeds: [seed, seed + n - 1], keys: out };
}
