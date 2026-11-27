// Clinic cold room B: a fictional equipment temperature series with power cuts and door openings.
import { DAY, stream, outages, maskOf, segments } from './common.js';

export const BAND = 8; // top of the band, degrees C

export const cold = {
  id: 'cold',
  defaults: { interval: 15, thr: 8, cutKind: 'scattered', cutLen: 90 },
  build(p, seed) {
    const H = (p.days || 7) * DAY;
    const cutIv = outages(p.cutKind, p.cutLen, H, stream(seed, 'cuts'), 0.6);
    const cut = maskOf(cutIv, H);
    const rd = stream(seed, 'doors');
    const door = new Float32Array(H);
    for (let d = 0; d * DAY < H; d++) for (let k = 0; k < 3; k++) {
      const a = rd(), b = rd(), c = rd(), on = rd() < 0.7;
      if (!on) continue;
      const s = d * DAY + Math.floor(a * DAY), len = 4 + Math.floor(b * 10), amp = 2 + 4 * c;
      for (let t = s; t < Math.min(H, s + len); t++) door[t] += amp;
    }
    const T = new Float32Array(H); let x = 4;
    for (let t = 0; t < H; t++) {
      const on = !cut[t];
      x += ((on ? 4 : 30) - x) / (on ? 45 : 240);
      T[t] = x + (on ? 0.9 * Math.sin(2 * Math.PI * t / 40) : 0) + door[t];
    }
    return { H, cutIv, channels: [
      { id: 'temp', kind: 'high', unit: '°C', truth: T, sd: 0.2, thr: p.thr, alert: true, hyst: 0.4, events: segments(T, v => v > BAND), pre: 0, min: 0, max: 30, band: BAND },
    ] };
  },
  extra(ev, def) {
    const ch = ev.channels[0], iv = Math.max(1, Math.round(ev.params.interval));
    const { ts, arr } = ev.dev;
    let seenN = 0;
    const hit = ch.events.map(() => false);
    for (let i = 0; i < ts.length; i++) {
      if (!(arr[i] < Infinity) || !(ch.vals[i] > BAND)) continue;
      seenN++;
      for (let k = 0; k < ch.events.length; k++) if (ts[i] >= ch.events[k].start && ts[i] < ch.events[k].end) hit[k] = true;
    }
    const trueMin = ch.events.reduce((s, e) => s + e.end - e.start, 0);
    const longestMissed = ch.events.reduce((m, e, k) => hit[k] ? m : Math.max(m, e.end - e.start), 0);
    return { exc_true_min: trueMin, exc_seen_min: seenN * iv, exc_in_record: hit.filter(Boolean).length, exc_not_in_record: hit.filter(h => !h).length, exc_longest_missed: longestMissed, cut_min: def.cutIv.reduce((s, [a, b]) => s + b - a, 0) };
  },
};
