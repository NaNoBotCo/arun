// Air station D: generic heat, humidity and a particulate-style index.
import { DAY, stream, segments, bump, normal } from './common.js';

export const HEAT_EVENT = 36, AIR_EVENT = 130;

export const env = {
  id: 'env',
  defaults: { interval: 15, thr: 34, thr2: 100 },
  build(p, seed) {
    const H = (p.days || 7) * DAY;
    const r = stream(seed, 'env');
    const off = []; for (let d = 0; d * DAY < H; d++) off.push(Math.max(-2, 2.5 + 2.5 * normal(r)));
    const heat = new Float32Array(H), hum = new Float32Array(H), air = new Float32Array(H);
    let ar = 0;
    for (let t = 0; t < H; t++) {
      const d = Math.floor(t / DAY), h = (t % DAY) / 60;
      ar = 0.999 * ar + 0.02 * normal(r);
      heat[t] = 26 + 5 * Math.sin(2 * Math.PI * (h - 9) / 24) + off[d] * bump(h, 14, 5) + ar;
      hum[t] = Math.max(15, Math.min(98, 72 - 2.2 * (heat[t] - 26) + 3 * ar));
    }
    const ra = stream(seed, 'air');
    air.fill(35);
    for (let d = 0; d * DAY < H; d++) {
      const a = ra(), b = ra(), c = ra(), e = ra();
      if (a < 0.35) {
        const s = d * DAY + Math.floor(b * DAY), len = 120 + Math.floor(c * 360), amp = 60 + 160 * e;
        for (let t = s; t < Math.min(H, s + len); t++) air[t] += amp * Math.sin(Math.PI * (t - s) / len) ** 2;
      }
    }
    return { H, channels: [
      { id: 'heat', kind: 'high', unit: '°C', truth: heat, sd: 0.3, thr: p.thr, alert: true, hyst: 0.6, events: segments(heat, v => v > HEAT_EVENT, 30), pre: 360, min: 15, max: 45, band: HEAT_EVENT },
      { id: 'hum', kind: 'low', unit: '%', truth: hum, sd: 2, alert: false, events: [], min: 0, max: 100 },
      { id: 'air', kind: 'high', unit: 'idx', truth: air, sd: 6, thr: p.thr2, alert: true, hyst: 8, events: segments(air, v => v > AIR_EVENT, 30), pre: 180, min: 0, max: 300, band: AIR_EVENT },
    ] };
  },
};
