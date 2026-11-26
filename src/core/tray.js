// Saved runs for comparison and replay. Session memory first; the browser copy is opt-in per save.

const runs = [];
const subs = new Set();
let replay = null; // { record } waiting for the next mount of its exhibit

export function savedRuns() {
  return runs.slice();
}

export function saveRun(record, label = '') {
  runs.unshift({ record, label: String(label).slice(0, 80), savedAt: Date.now() });
  if (runs.length > 40) runs.pop();
  subs.forEach((f) => f());
}

export function removeRun(runId) {
  const i = runs.findIndex((r) => r.record.runId === runId);
  if (i >= 0) runs.splice(i, 1);
  subs.forEach((f) => f());
}

export function onRuns(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function persistRuns() {
  try {
    localStorage.setItem('arun.runs', JSON.stringify(runs.slice(0, 40)));
    return true;
  } catch {
    return false;
  }
}

export function restoreRuns() {
  try {
    const raw = localStorage.getItem('arun.runs');
    if (!raw) return 0;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    for (const r of arr) {
      if (r && r.record && typeof r.record.runId === 'string' && !runs.some((x) => x.record.runId === r.record.runId)) {
        runs.push(r);
        n++;
      }
    }
    subs.forEach((f) => f());
    return n;
  } catch {
    return 0;
  }
}

export function forgetStoredRuns() {
  try {
    localStorage.removeItem('arun.runs');
  } catch {}
}

export function requestReplay(record) {
  replay = { record };
}

export function takeReplay(exId) {
  if (replay && replay.record.experimentId === exId) {
    const r = replay;
    replay = null;
    return r.record;
  }
  return null;
}

// Compare two metric lists; tolerance is relative with an absolute floor.
export function compareMetrics(a, b, rel = 1e-9, abs = 1e-12) {
  const out = [];
  const bm = new Map(b.map((m) => [m.name, m]));
  for (const m of a) {
    const o = bm.get(m.name);
    if (!o) {
      out.push({ name: m.name, a: m.value, b: null, same: false });
      continue;
    }
    const same = m.value === o.value || (Number.isFinite(m.value) && Number.isFinite(o.value) && Math.abs(m.value - o.value) <= Math.max(abs, rel * Math.max(Math.abs(m.value), Math.abs(o.value))));
    out.push({ name: m.name, a: m.value, b: o.value, unit: m.unit, same });
  }
  return out;
}
