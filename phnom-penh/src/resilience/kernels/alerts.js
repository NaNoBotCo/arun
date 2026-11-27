// Alert detection and scoring, plus the arithmetic on delivered records.

// An alert fires on the first reading of a run that meets cond. Remote alerts exist when the reading
// arrives; local alerts exist when it is taken.
// rearm(v) says the reading is clear of the threshold by a margin; it defaults to not meeting cond.
export function detectAlerts(ts, arr, vals, cond, local, rearm = v => !cond(v)) {
  const out = []; let armed = true;
  for (let i = 0; i < ts.length; i++) {
    if (!local && !(arr[i] < Infinity)) continue;
    const v = vals[i];
    if (armed && cond(v)) { out.push({ ts: ts[i], t: local ? ts[i] : arr[i] }); armed = false; }
    else if (!armed && rearm(v)) armed = true;
  }
  return out;
}

// Events are {start, end} with end exclusive. An alert matches an event when its reading time lies in
// [start - pre, end). caught: told before the event ended. late: told after it ended. missed: no alert.
// Lead time = start - time told; negative values mean after the start.
export function scoreAlerts(events, alerts, { pre = 0 } = {}) {
  const best = new Array(events.length).fill(Infinity);
  let falseAlerts = 0;
  for (const a of alerts) {
    let k = -1;
    for (let i = 0; i < events.length; i++) if (a.ts >= events[i].start - pre && a.ts < events[i].end) { k = i; break; }
    if (k < 0) falseAlerts++; else if (a.t < best[k]) best[k] = a.t;
  }
  let caught = 0, late = 0, missed = 0; const leads = [];
  events.forEach((e, i) => {
    if (best[i] === Infinity) missed++;
    else { if (best[i] < e.end) caught++; else late++; leads.push(e.start - best[i]); }
  });
  leads.sort((x, y) => x - y);
  const mid = leads.length ? (leads[(leads.length - 1) >> 1] + leads[leads.length >> 1]) / 2 : NaN;
  return { events: events.length, caught, late, missed, falseAlerts, leads, leadMedian: mid };
}

export const expected = (H, interval) => Math.ceil(H / interval);
export const completeness = (arr, H, interval) => arr.filter(a => a < Infinity).length / expected(H, interval);

// Gaps in the delivered record: spacing wider than 1.5 intervals, measured from time 0 to the slot after the last.
export function gaps(ts, arr, H, interval) {
  let prev = -interval, count = 0, minutes = 0;
  const end = Math.floor((H - 1) / interval) * interval + interval;
  for (let i = 0; i < ts.length; i++) {
    if (!(arr[i] < Infinity)) continue;
    const d = ts[i] - prev; if (d > 1.5 * interval) { count++; minutes += d - interval; } prev = ts[i];
  }
  const d = end - prev; if (d > 1.5 * interval) { count++; minutes += d - interval; }
  return { count, minutes };
}

// Age of the newest arrived reading at every minute (before the first arrival it is the minute count).
export function staleness(ts, arr, H) {
  const latest = new Int32Array(H).fill(-1);
  for (let i = 0; i < ts.length; i++) { const a = arr[i]; if (a < H) latest[a] = Math.max(latest[a], ts[i]); }
  let cur = 0, sum = 0, max = 0; const s = new Float32Array(H);
  for (let t = 0; t < H; t++) { if (latest[t] > cur) cur = latest[t]; s[t] = t - cur; sum += s[t]; if (s[t] > max) max = s[t]; }
  const sorted = Float32Array.from(s).sort();
  return { mean: sum / H, max, p95: sorted[Math.floor(0.95 * (H - 1))] };
}

export function meanDelay(ts, arr) {
  let n = 0, s = 0;
  for (let i = 0; i < ts.length; i++) if (arr[i] < Infinity) { n++; s += arr[i] - ts[i]; }
  return n ? s / n : NaN;
}
