// Runs one experiment definition: link outages, the logger, sampling with noise, alerts, scoring.
import { stream, outages, maskOf, normals, COMMON } from './common.js';
import { simulateDevice } from './device.js';
import { detectAlerts, scoreAlerts, completeness, gaps, staleness, meanDelay } from './alerts.js';

export function evaluate(def, params, seed) {
  const p = { ...COMMON, ...params };
  const H = def.H;
  const linkIv = outages(p.linkKind, p.linkLen, H, stream(seed, 'link'), 1);
  const linkDown = maskOf(linkIv, H);
  const dev = simulateDevice(p, linkDown, H);
  const iv = Math.max(1, Math.round(p.interval));
  const channels = def.channels.map(ch => {
    const noise = normals(stream(seed, 'noise:' + ch.id), H);
    const vals = dev.ts.map(t => ch.truth[t] + noise[t] * (ch.sd || 0) + (ch.artifact ? ch.artifact[t] : 0));
    let alerts = [], score = null;
    if (ch.alert) {
      const cond = ch.kind === 'low' ? v => v < ch.thr : v => v > ch.thr;
      const h = ch.hyst || 0;
      const rearm = ch.kind === 'low' ? v => v >= ch.thr + h : v => v <= ch.thr - h;
      alerts = detectAlerts(dev.ts, dev.arr, vals, cond, p.localAlert, rearm);
      score = scoreAlerts(ch.events, alerts, { pre: ch.pre || 0 });
    }
    return { ...ch, vals, alerts, score };
  });
  const st = staleness(dev.ts, dev.arr, H);
  const g = gaps(dev.ts, dev.arr, H, iv);
  const msgsMonth = dev.ok * 30 * 1440 / H;
  const visitsMonth = dev.visits * 30 * 1440 / H;
  const obs = {
    completeness: completeness(dev.arr, H, iv),
    device: dev.ts.length / Math.ceil(H / iv),
    delay_mean: meanDelay(dev.ts, dev.arr),
    stale_mean: st.mean, stale_p95: st.p95, stale_max: st.max,
    gaps: g.count, gap_min: g.minutes,
    energy_day: dev.perDay, life_days: dev.lifeDays, swaps_month: dev.swapsMonth,
    msgs_month: msgsMonth, visits_month: visitsMonth,
    cost_month: msgsMonth * dev.A.costMsg + visitsMonth * dev.A.costVisit + dev.swapsMonth * dev.A.costSwap,
    dead_day: dev.dead == null ? NaN : dev.dead / 1440,
  };
  const flat = { ...obs };
  for (const ch of channels) if (ch.score) {
    const s = ch.score;
    flat[ch.id + '.events'] = s.events; flat[ch.id + '.caught'] = s.caught; flat[ch.id + '.late'] = s.late;
    flat[ch.id + '.missed'] = s.missed; flat[ch.id + '.false'] = s.falseAlerts; flat[ch.id + '.lead'] = s.leadMedian;
  }
  const ev = { H, params: p, seed, link: linkIv, linkDown, dev, channels, obs, flat, st };
  if (def.extra) Object.assign(flat, def.extra(ev, def) || {});
  return ev;
}
