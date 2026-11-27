// Site E: local-only operation, delayed records and what a network changes. The physical shortage is the
// tank's own; delivery modes change when the receiver learns of it.
import { DAY } from './common.js';
import { tankTruth, DRY } from './water.js';

export const conn = {
  id: 'conn',
  defaults: { interval: 15, thr: 25, mode: 'sf', pickupDays: 3 },
  build(p, seed) {
    const H = (p.days || 7) * DAY;
    const tk = tankTruth(seed, H);
    return { H, channels: [
      { id: 'tank', kind: 'low', unit: '%', truth: tk.level, sd: 1.0, thr: p.thr, alert: true, hyst: 3, events: tk.events, pre: 720, min: 0, max: 100, band: DRY },
    ] };
  },
  // Minutes of shortage that passed before the receiver held a reading showing it.
  extra(ev) {
    const ch = ev.channels[0], { ts, arr } = ev.dev;
    let unseen = 0, short = 0;
    for (const e of ch.events) {
      const len = e.end - e.start; short += len;
      let first = Infinity;
      for (let i = 0; i < ts.length; i++) if (ts[i] >= e.start && ts[i] < e.end && arr[i] < Infinity && ch.vals[i] < DRY && arr[i] < first) first = arr[i];
      unseen += Math.min(len, first - e.start);
    }
    return { short_min: short, unseen_min: unseen };
  },
};
