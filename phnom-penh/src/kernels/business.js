// The machine behind the miracle: compute and unit-economics arithmetic. Pure, no DOM, deterministic.
// Unit: one cell-step = one forecast value for one grid cell, one lead time, one ensemble member.

export const DAYS_PER_MONTH = 30;
export const MIN_PER_DAY = 1440;

const bad = (name, v, why) => { throw new RangeError(`${name}: ${why} (got ${String(v)})`); };
const fin = (n, v) => { if (typeof v !== 'number' || !Number.isFinite(v)) bad(n, v, 'must be a finite number'); return v; };
const pos = (n, v) => { fin(n, v); if (v <= 0) bad(n, v, 'must be above 0'); return v; };
const nonneg = (n, v) => { fin(n, v); if (v < 0) bad(n, v, 'must be 0 or more'); return v; };
// Ratios that are whole in exact arithmetic stay whole despite float noise.
const snap = r => { const q = Math.round(r); return Math.abs(r - q) <= 1e-9 * Math.max(1, Math.abs(r)) ? q : r; };

export const cellCount = (areaKm2, cellM) => Math.ceil(snap(pos('areaKm2', areaKm2) * 1e6 / (pos('cellM', cellM) ** 2)));
export const leadCount = (horizonMin, stepMin) => Math.floor(snap(nonneg('horizonMin', horizonMin) / pos('stepMin', stepMin))) + 1;
export const runsPerDay = updateMin => MIN_PER_DAY / pos('updateMin', updateMin);

function checkWorkload(w) {
  pos('areaKm2', w.areaKm2); pos('cellM', w.cellM); nonneg('horizonMin', w.horizonMin); pos('stepMin', w.stepMin);
  pos('members', w.members); if (!Number.isInteger(w.members)) bad('members', w.members, 'must be a whole number');
  pos('updateMin', w.updateMin);
}

// One run: cells x leads x members.
export function workPerRun(w) {
  checkWorkload({ updateMin: 1, ...w });
  const cells = cellCount(w.areaKm2, w.cellM), leads = leadCount(w.horizonMin, w.stepMin);
  return { cells, leads, members: w.members, perRun: cells * leads * w.members };
}
export function workPerDay(w) {
  checkWorkload(w);
  const r = workPerRun(w), runs = runsPerDay(w.updateMin);
  return { ...r, runsPerDay: runs, perDay: r.perRun * runs };
}

// Tenants that share region, grid and cadence share one run, computed at the largest horizon, members and area asked.
export const tenantKey = t => [t.region ?? 'region', t.cellM, t.stepMin, t.updateMin].join('|');
export function tenantsWork(tenants) {
  if (!Array.isArray(tenants) || !tenants.length) bad('tenants', tenants, 'needs at least one tenant');
  tenants.forEach(checkWorkload);
  const byKey = new Map();
  tenants.forEach((t, i) => { const k = tenantKey(t); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push({ t, id: t.id ?? i }); });
  const groups = [];
  for (const [key, list] of byKey) {
    const m = f => Math.max(...list.map(x => x.t[f]));
    const w = workPerDay({ areaKm2: m('areaKm2'), cellM: list[0].t.cellM, horizonMin: m('horizonMin'), stepMin: list[0].t.stepMin, members: m('members'), updateMin: list[0].t.updateMin });
    groups.push({ key, ids: list.map(x => x.id), size: list.length, perRun: w.perRun, perDay: w.perDay });
  }
  const perTenant = tenants.map((t, i) => {
    const g = groups.find(x => x.key === tenantKey(t));
    return { id: t.id ?? i, alone: workPerDay(t).perDay, shared: g.perDay / g.size, group: g.key };
  });
  const perDay = groups.reduce((s, g) => s + g.perDay, 0);
  const aloneDay = perTenant.reduce((s, p) => s + p.alone, 0);
  return { perDay, aloneDay, groups, perTenant };
}
// N copies of one workload, either sharing one field or each in its own region.
export const makeTenants = (w, count, shared) =>
  Array.from({ length: Math.max(1, Math.round(pos('count', count))) }, (_, i) => ({ ...w, id: i + 1, region: shared ? 'shared' : 'region-' + (i + 1) }));

// Throughput tiers, kept apart. phone: measured on this device; laptop: data/bench.json; server: user-entered, hypothetical.
export function tierCoreHours(perDay, { overhead, phonePerSec = null, laptopPerSec = null, serverPerSec, serverCores = 1 }) {
  nonneg('perDay', perDay); pos('overhead', overhead); pos('serverPerSec', serverPerSec); pos('serverCores', serverCores);
  const row = (id, kind, perSec, cores) => {
    if (perSec == null) return { id, kind, perSec: null, cores, coreHours: null, wallHours: null, work: perDay, overhead };
    pos(id + 'PerSec', perSec);
    const coreHours = perDay * overhead / perSec / 3600;
    return { id, kind, perSec, cores, coreHours, wallHours: coreHours / cores, work: perDay, overhead };
  };
  return [row('phone', 'measured', phonePerSec, 1), row('laptop', 'benchmark', laptopPerSec, 1), row('server', 'hypothetical', serverPerSec, serverCores)];
}

// Cost inputs: low <= mid <= high, every one an assumption. dir = effect on cost (+1 rises with the value, -1 falls).
const I = (low, mid, high, dir = 1, unit = '') => ({ low, mid, high, dir, unit, assumed: true });
export const DEFAULT_INPUTS = () => ({
  overhead: I(1.2, 1.5, 2.5, 1, 'x'),
  serverPerSec: I(5e6, 2e7, 8e7, -1, 'cell-steps/s per core'),
  corePrice: I(0.02, 0.04, 0.09, 1, 'US$/core-hour'),
  storageGB: I(10, 100, 1000, 1, 'GB-month'),
  storagePrice: I(0.01, 0.023, 0.05, 1, 'US$/GB-month'),
  egressGB: I(10, 100, 1000, 1, 'GB/month'),
  egressPrice: I(0.02, 0.08, 0.12, 1, 'US$/GB'),
  sensors: I(10, 22, 200, 1, 'sensors'),
  ingestPrice: I(0.5, 2, 5, 1, 'US$/sensor-month'),
  support: I(0, 300, 2000, 1, 'US$/month'),
  redundancy: I(1, 1.5, 2.5, 1, 'x'),
});
const MIN_OF = { overhead: 'pos', serverPerSec: 'pos', redundancy: 'one' };
export function checkInputs(inp) {
  for (const k of Object.keys(DEFAULT_INPUTS())) {
    const v = inp?.[k]; if (!v) bad(k, v, 'missing');
    for (const w of ['low', 'mid', 'high']) { fin(k + '.' + w, v[w]); (MIN_OF[k] === 'pos' ? pos : nonneg)(k + '.' + w, v[w]); if (MIN_OF[k] === 'one' && v[w] < 1) bad(k + '.' + w, v[w], 'must be 1 or more'); }
    if (!(v.low <= v.mid && v.mid <= v.high)) bad(k, `${v.low}, ${v.mid}, ${v.high}`, 'needs low <= mid <= high');
    if (v.dir !== 1 && v.dir !== -1) bad(k + '.dir', v.dir, 'must be 1 or -1');
  }
  return inp;
}
export function costAt(vals, perDay) {
  nonneg('perDay', perDay);
  const coreHoursDay = perDay * vals.overhead / vals.serverPerSec / 3600;
  const compute = coreHoursDay * DAYS_PER_MONTH * vals.corePrice;
  const storage = vals.storageGB * vals.storagePrice, egress = vals.egressGB * vals.egressPrice;
  const ingest = vals.sensors * vals.ingestPrice, support = vals.support;
  const subtotal = compute + storage + egress + ingest + support;
  return { coreHoursDay, compute, storage, egress, ingest, support, subtotal, redundancy: vals.redundancy, total: subtotal * vals.redundancy };
}
const valsFor = (inp, which) => Object.fromEntries(Object.keys(inp).map(k => {
  const o = inp[k]; const w = which === 'mid' ? 'mid' : (o.dir === 1 ? which : (which === 'low' ? 'high' : 'low'));
  return [k, o[w]];
}));
// All low, all mid, all high (low and high are the cheapest and dearest readings of every input).
export function costRange(inp, perDay) {
  checkInputs(inp);
  return { low: costAt(valsFor(inp, 'low'), perDay), mid: costAt(valsFor(inp, 'mid'), perDay), high: costAt(valsFor(inp, 'high'), perDay) };
}
// Tornado: one input at its low and its high, the rest at mid; sorted by swing, largest first.
export function tornado(inp, perDay) {
  checkInputs(inp);
  const mid = valsFor(inp, 'mid');
  return Object.keys(inp).map(key => {
    const atLow = costAt({ ...mid, [key]: inp[key].low }, perDay).total, atHigh = costAt({ ...mid, [key]: inp[key].high }, perDay).total;
    return { key, atLow, atHigh, swing: Math.abs(atHigh - atLow) };
  }).sort((a, b) => b.swing - a.swing || (a.key < b.key ? -1 : 1));
}
export const costPerTenant = (total, n) => total / pos('tenants', n);

// On-device or central. The facility workload runs on the phone from its own sensors inside a share of the update interval;
// a central run serves a shared field to N tenants. Work compared in cell-steps per run.
export function placement({ facility, regionPerRun, tenants, shared = true, devicePerSec = null, overhead = 1.5, share = 0.5 }) {
  checkWorkload({ updateMin: 1, ...facility }); pos('regionPerRun', regionPerRun); pos('tenants', tenants); pos('overhead', overhead); pos('share', share);
  if (share > 1) bad('share', share, 'must be 1 or less');
  if (devicePerSec != null) pos('devicePerSec', devicePerSec);
  const own = workPerRun(facility).perRun;
  const updateMin = facility.updateMin ?? 5;
  const budgetSec = share * updateMin * 60;
  const deviceSec = devicePerSec == null ? null : own * overhead / devicePerSec;
  const fits = deviceSec == null ? null : deviceSec <= budgetSec;
  const crossover = shared ? Math.floor(snap(regionPerRun / own)) + 1 : (regionPerRun < own ? 1 : Infinity);
  let winner, reason;
  if (fits === false) { winner = 'central'; reason = 'mc_why_exceeds'; }
  else if (tenants >= crossover) { winner = 'central'; reason = 'mc_why_shared'; }
  else if (fits === true) { winner = 'device'; reason = 'mc_why_device'; }
  else { winner = null; reason = 'mc_why_nodevice'; }
  return { winner, reason, fits, ownPerRun: own, deviceSec, budgetSec, crossover, centralPerTenantRun: shared ? regionPerRun / tenants : regionPerRun };
}
