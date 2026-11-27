// Water point A: tank level, outflow and a quality proxy, all synthetic.
import { DAY, stream, segments, bump, clamp, normal } from './common.js';

export const DRY = 10; // tank level (%) that counts as a shortage

// Tank level with a daily demand cycle and a supply window that sometimes does not run.
export function tankTruth(seed, H) {
  const r = stream(seed, 'tank');
  const days = Math.ceil(H / DAY);
  const dayFactor = [], supply = [];
  for (let d = 0; d < days; d++) { dayFactor.push(0.85 + 0.4 * r()); supply.push(r() > 0.3); }
  const prof = new Float32Array(24 * 60); let sum = 0;
  for (let m = 0; m < 1440; m++) { const h = m / 60; prof[m] = 0.35 + 1.6 * bump(h, 7, 1.6) + 1.2 * bump(h, 18, 2) + 0.4 * bump(h, 12.5, 2.5); sum += prof[m]; }
  const mean = sum / 1440;
  const level = new Float32Array(H), out = new Float32Array(H);
  let L = 75;
  for (let t = 0; t < H; t++) {
    const d = Math.floor(t / DAY), m = t % DAY;
    const demand = 0.052 * dayFactor[d] * prof[m] / mean;
    const inflow = supply[d] && m >= 120 && m < 480 ? 0.3 : 0;
    const want = demand;
    L = L + inflow - want;
    if (L < 0) L = 0; if (L > 100) L = 100;
    level[t] = L; out[t] = want * 10; // 10 litres per percent
  }
  return { level, out, events: segments(level, v => v < DRY, 30) };
}

// Latent contamination-like episodes for the quality proxy (synthetic, no real-world meaning).
export function qualityTruth(seed, H) {
  const r = stream(seed, 'quality');
  const q = new Float32Array(H), episodes = [];
  for (let d = 0; d * DAY < H; d++) {
    const a = r(), b = r(), c = r(), e = r();
    if (a < 0.32) {
      const s = d * DAY + Math.floor(b * DAY), len = 180 + Math.floor(c * 420), amp = 0.6 + 0.4 * e;
      episodes.push({ start: s, end: Math.min(H, s + len), amp });
    }
  }
  for (const ep of episodes) for (let t = ep.start; t < ep.end; t++) {
    const ramp = Math.min(1, (t - ep.start) / 30, (ep.end - t) / 30);
    q[t] = Math.max(q[t], ep.amp * ramp);
  }
  return { q, episodes: episodes.filter(e => e.end > e.start).map(e => ({ start: e.start, end: e.end })) };
}

export const water = {
  id: 'water',
  defaults: { interval: 15, thr: 25, thr2: 55, verifiedEvery: 24 },
  build(p, seed) {
    const H = (p.days || 7) * DAY;
    const tk = tankTruth(seed, H), ql = qualityTruth(seed, H);
    const rf = stream(seed, 'foul');
    const art = new Float32Array(H);
    for (let t = 0; t < H;) { if (rf() < 0.0004) { const len = 20; for (let k = 0; k < len && t + k < H; k++) art[t + k] = 35; t += len; } else t++; }
    const proxy = new Float32Array(H); for (let t = 0; t < H; t++) proxy[t] = 20 + 50 * ql.q[t];
    // verified tests: a hand-taken result, available 6 hours after the test
    const tests = [];
    const every = Math.max(1, Math.round(p.verifiedEvery)) * 60;
    for (let t = 9 * 60; t < H; t += every) tests.push({ t, arr: t + 360 < H ? t + 360 : Infinity, positive: ql.q[t] > 0.3 });
    return {
      H, tests, episodes: ql.episodes,
      channels: [
        { id: 'tank', kind: 'low', unit: '%', truth: tk.level, sd: 1.0, thr: p.thr, alert: true, hyst: 3, events: tk.events, pre: 720, proxy: false, min: 0, max: 100, band: DRY },
        { id: 'flow', kind: 'low', unit: 'L/min', truth: tk.out, sd: 0.15, alert: false, events: [], min: 0, max: 8 },
        { id: 'proxy', kind: 'high', unit: 'idx', truth: proxy, artifact: art, sd: 6, thr: p.thr2, alert: true, hyst: 8, events: ql.episodes, pre: 180, proxy: true, min: 0, max: 100 },
      ],
    };
  },
  extra(ev, def) {
    const tests = def.tests;
    const covered = def.episodes.filter(e => tests.some(t => t.t >= e.start && t.t < e.end)).length;
    return {
      'tests.n': tests.length, 'tests.positive': tests.filter(t => t.positive).length,
      'tests.covered': def.episodes.length ? covered / def.episodes.length : NaN,
      'short_min': ev.channels[0].events.reduce((s, e) => s + e.end - e.start, 0),
    };
  },
};
