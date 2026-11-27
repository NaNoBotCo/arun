// Pump house C: a mains status signal and a device health index.
import { DAY, stream, outages, maskOf, segments } from './common.js';

export const SERVICE = 30; // health index below which the device needs service

export const power = {
  id: 'power',
  defaults: { interval: 15, thr: 40, outKind: 'scattered', outLen: 60 },
  build(p, seed) {
    const H = (p.days || 7) * DAY;
    const iv = outages(p.outKind, p.outLen, H, stream(seed, 'mains'), 0.8);
    const m = maskOf(iv, H);
    const r = stream(seed, 'health');
    const rate = (3 + 5 * r()) / DAY;
    const mains = new Float32Array(H), health = new Float32Array(H);
    let h = 62, w = 0;
    for (let t = 0; t < H; t++) {
      if (m[t] && !(t && m[t - 1])) h -= 2.5;
      w = 0.98 * w + 0.15 * (r() - 0.5);
      h -= rate; mains[t] = m[t] ? 0 : 1; health[t] = Math.max(0, h + w);
    }
    return { H, outIv: iv, channels: [
      { id: 'mains', kind: 'low', unit: 'on/off', truth: mains, sd: 0, thr: 0.5, alert: true, events: iv.map(([a, b]) => ({ start: a, end: b })), pre: 0, min: 0, max: 1, digital: true },
      { id: 'health', kind: 'low', unit: 'idx', truth: health, sd: 1.5, thr: p.thr, alert: true, hyst: 3, events: segments(health, v => v < SERVICE, 60), pre: 3 * DAY, min: 0, max: 80, band: SERVICE },
    ] };
  },
  extra(ev) {
    const m = ev.channels[0], { ts, arr } = ev.dev;
    let up = 0, n = 0;
    for (let i = 0; i < ts.length; i++) if (arr[i] < Infinity) { n++; if (m.vals[i] > 0.5) up++; }
    let tr = 0; for (let t = 0; t < ev.H; t++) tr += m.truth[t];
    const trueAv = 100 * tr / ev.H, est = n ? 100 * up / n : NaN;
    return { avail_true: trueAv, avail_est: est, avail_err: Math.abs(est - trueAv) };
  },
};
