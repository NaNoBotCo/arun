// A simulated logger: samples at an interval, spends battery, and delivers by one of three modes.
//   direct : each reading is sent when taken; lost if the link is down
//   sf     : store-and-forward; readings queue and go out in batches, the first batch with the link up
//   local  : no uplink; records are picked up from the device every pickupDays
import { DAY, ASSUMED } from './common.js';

export function simulateDevice(p, linkDown, H) {
  const A = { ...ASSUMED, ...(p.assumed || {}) };
  const iv = Math.max(1, Math.round(p.interval));
  const batchMin = iv * Math.max(1, Math.round(p.batch || 6));
  const cap = p.battery;
  const perMin = A.sleepMA / 60;
  const ts = [], arr = [];
  let queue = [], E = 0, dead = null, attempts = 0, ok = 0;
  for (let t = 0; t < H; t++) {
    E += perMin;
    if (E >= cap) { dead = t; break; }
    if (t % iv === 0) {
      E += A.mAhSample;
      const i = ts.length; ts.push(t); arr.push(Infinity);
      if (p.mode === 'direct') {
        attempts++;
        if (!linkDown[t]) { ok++; arr[i] = t; E += A.mAhMsg + A.mAhPerSampleInMsg; } else E += A.failFrac * A.mAhMsg;
      } else if (p.mode === 'sf') queue.push(i);
    }
    if (p.mode === 'sf' && t > 0 && t % batchMin === 0 && queue.length) {
      attempts++;
      if (!linkDown[t]) { ok++; for (const i of queue) arr[i] = t; E += A.mAhMsg + A.mAhPerSampleInMsg * queue.length; queue = []; }
      else E += A.failFrac * A.mAhMsg;
    }
    if (E >= cap) { dead = t; break; }
  }
  let visits = 0;
  if (p.mode === 'local') {
    const pick = Math.max(1, p.pickupDays) * DAY;
    for (let i = 0; i < ts.length; i++) { const P = (Math.floor(ts[i] / pick) + 1) * pick; arr[i] = P < H ? P : Infinity; }
    visits = Math.floor((H - 1) / pick);
  }
  const ranDays = (dead ?? H) / DAY;
  const perDay = E / Math.max(ranDays, 1e-9);
  return { ts, arr, dead, energy: E, attempts, ok, visits, perDay, lifeDays: cap / perDay, swapsMonth: 30 * perDay / cap, A };
}
