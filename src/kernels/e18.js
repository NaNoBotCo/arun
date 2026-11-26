// E18 The Scientific Instrument — kernel. Pure functions, no DOM.
// Synthetic sensors measure a simulated temperature-like quantity: y = a·x + b + drift·t + noise.
// Packets drop, batteries drain, a linear calibration is fitted against collocated reference readings
// and judged on reference readings it never saw. All devices are labelled unit-01, unit-02, ...
// and carry no identifier or location.

import { makeRng, deriveSeed } from '../core/rng.js';

export const jobs = {};

export const PAYLOAD_BYTES = 8;
export const HEADER_BYTES = 13;
export const PACKET_BYTES = PAYLOAD_BYTES + HEADER_BYTES;
export const BITRATE_BPS = 5000;
export const E_SENSE_J = 0.0003;
export const P_ELECTRONICS_W = 0.025;
export const SLEEP_W = 0.00001;
export const REF_EVERY_S = 1800;
export const CAL_DAYS = 1.5;
export const RECAL_DAYS = 1;
export const MAX_SAMPLES = 150000;
export const REGIMES = ['none', 'once', 'periodic'];
export const ST = { LOST: 0, DELIVERED: 1, DEAD: 2 };

export const DEFAULTS = {
  nDevices: 4,
  driftPerDay: 0.2,
  noiseSd: 0.25,
  intervalS: 120,
  packetLoss: 0.08,
  txDbm: 8,
  refNoiseSd: 0.05,
  battery_J: 150,
  regime: 'periodic',
  days: 5,
};

const RANGES = {
  nDevices: [1, 8],
  driftPerDay: [0, 1.5],
  noiseSd: [0, 2],
  intervalS: [30, 900],
  packetLoss: [0, 0.6],
  txDbm: [0, 20],
  refNoiseSd: [0, 1],
  battery_J: [5, 2000],
  days: [3, 7],
};

export function validate(config) {
  const c = { ...DEFAULTS, ...config };
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (!Number.isFinite(c[k]) || c[k] < lo || c[k] > hi) throw new Error(`${k} must be between ${lo} and ${hi}`);
  }
  if (!Number.isInteger(c.nDevices)) throw new Error('nDevices must be a whole number');
  if (!REGIMES.includes(c.regime)) throw new Error('regime must be none, once or periodic');
  const K = Math.floor((c.days * 86400) / c.intervalS);
  if (K * c.nDevices > MAX_SAMPLES) throw new Error(`${K * c.nDevices} samples is above the limit of ${MAX_SAMPLES}; raise the interval or remove devices`);
  return c;
}

export const deviceLabel = (i) => 'unit-' + String(i + 1).padStart(2, '0');

export function effectiveLoss(packetLoss, txDbm) {
  return Math.min(0.95, Math.max(0, packetLoss * Math.pow(2, -(txDbm - 8) / 6)));
}

export function energyPerPacket_J(txDbm) {
  const txW = Math.pow(10, txDbm / 10) / 1000;
  const airtime = (PACKET_BYTES * 8) / BITRATE_BPS;
  return E_SENSE_J + (txW + P_ELECTRONICS_W) * airtime;
}

// The simulated truth: a diurnal cycle plus slow weather, as a function of time in seconds.
export function makeSignal(seed) {
  const rng = makeRng(deriveSeed(seed, 'signal'));
  const waves = [0, 1, 2].map((i) => ({ amp: 1.2 / (i + 1), per: (1.3 + 1.7 * i + rng.uniform()) * 86400, ph: rng.uniform() * 2 * Math.PI }));
  return (t) => {
    let v = 22 + 5 * Math.sin(2 * Math.PI * (t / 86400 - 0.3));
    for (const w of waves) v += w.amp * Math.sin((2 * Math.PI * t) / w.per + w.ph);
    return v;
  };
}

export function deviceParams(seed, i, cfg) {
  const r = makeRng(deriveSeed(seed, 'dev' + i));
  const a = 1 + 0.06 * r.normal();
  const b = 0.8 * r.normal();
  const sign = r.uniform() < 0.5 ? -1 : 1;
  const drift = sign * cfg.driftPerDay * (0.5 + r.uniform());
  const noiseSd = cfg.noiseSd * (0.8 + 0.4 * r.uniform());
  return { a, b, drift_c_per_day: drift, noise_sd: noiseSd };
}

// Ordinary least squares y = a·x + b. Returns null when fewer than 5 points or no spread in x.
export function fitLine(xs, ys) {
  const n = xs.length;
  if (n < 5) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (!(sxx > 1e-12)) return null;
  const a = sxy / sxx;
  const b = my - a * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (a * xs[i] + b)) ** 2;
  const s = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { a, b, n, se_a: s / Math.sqrt(sxx), se_b: s * Math.sqrt(1 / n + (mx * mx) / sxx), resid_sd: s };
}

function summarise(errRef, errTruth, ts) {
  const n = errRef.length;
  if (!n) return { n: 0, bias: NaN, sd: NaN, se: NaN, ci95: NaN, rmseRef: NaN, rmseTruth: NaN, t: [], e: [] };
  let m = 0, sq = 0, sqT = 0;
  for (let i = 0; i < n; i++) {
    m += errRef[i];
    sq += errRef[i] ** 2;
    sqT += errTruth[i] ** 2;
  }
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (errRef[i] - m) ** 2;
  const sd = n > 1 ? Math.sqrt(v / (n - 1)) : 0;
  const se = sd / Math.sqrt(n);
  return { n, bias: m, sd, se, ci95: 1.96 * se, rmseRef: Math.sqrt(sq / n), rmseTruth: Math.sqrt(sqT / n), t: ts, e: errRef };
}

export function run(config, seed) {
  const cfg = validate(config);
  if (!Number.isInteger(seed) || seed < 0) throw new Error('seed must be a whole number from 0');
  const K = Math.floor((cfg.days * 86400) / cfg.intervalS);
  const dt = cfg.intervalS;
  const signal = makeSignal(seed);
  const truth = new Float64Array(K);
  for (let k = 0; k < K; k++) truth[k] = signal(k * dt);
  const m = Math.max(1, Math.round(REF_EVERY_S / dt));
  const refRng = makeRng(deriveSeed(seed, 'reference'));
  const refVal = new Float64Array(K).fill(NaN);
  for (let k = 0; k < K; k += m) refVal[k] = truth[k] + cfg.refNoiseSd * refRng.normal();

  const lossEff = effectiveLoss(cfg.packetLoss, cfg.txDbm);
  const ePacket = energyPerPacket_J(cfg.txDbm);
  const tau0 = CAL_DAYS * 86400;
  const epochTimes = [tau0];
  for (let tau = tau0 + RECAL_DAYS * 86400; tau <= cfg.days * 86400; tau += RECAL_DAYS * 86400) epochTimes.push(tau);

  const devices = [];
  for (let i = 0; i < cfg.nDevices; i++) {
    const p = deviceParams(seed, i, cfg);
    const rng = makeRng(deriveSeed(seed, 'samples' + i));
    const y = new Float64Array(K).fill(NaN);
    const status = new Uint8Array(K);
    const energy = new Float64Array(K); // cumulative joules at each tick
    let used = 0, deadTick = -1, delivered = 0, attempts = 0;
    for (let k = 0; k < K; k++) {
      const uLoss = rng.uniform();
      const noise = rng.normal();
      const t = k * dt;
      used += SLEEP_W * dt;
      if (deadTick < 0 && used + ePacket > cfg.battery_J) deadTick = k;
      if (deadTick >= 0) {
        status[k] = ST.DEAD;
        energy[k] = Math.min(used, cfg.battery_J);
        continue;
      }
      used += ePacket;
      attempts++;
      energy[k] = used;
      if (uLoss < lossEff) {
        status[k] = ST.LOST;
      } else {
        status[k] = ST.DELIVERED;
        delivered++;
        y[k] = p.a * truth[k] + p.b + p.drift_c_per_day * (t / 86400) + p.noise_sd * noise;
      }
    }
    // Reference pairs: ticks with a reference reading and a delivered packet. Alternate pairs: fit pool and held-out set.
    const pool = [], testSet = [];
    let j = 0;
    for (let k = 0; k < K; k += m) {
      if (status[k] === ST.DELIVERED) {
        (j % 2 === 0 ? pool : testSet).push(k);
        j++;
      }
    }
    // Calibration epochs: the fit uses pool pairs from the preceding CAL_DAYS only.
    const fitAt = (tau) => {
      const xs = [], ys = [];
      for (const k of pool) {
        const t = k * dt;
        if (t <= tau && t > tau - CAL_DAYS * 86400) {
          xs.push(refVal[k]);
          ys.push(y[k]);
        }
      }
      const f = fitLine(xs, ys);
      return f ? { tau, ...f } : { tau, a: NaN, b: NaN, n: xs.length, se_a: NaN, se_b: NaN, resid_sd: NaN };
    };
    const epochs = epochTimes.map(fitAt);
    const regimes = {};
    for (const reg of REGIMES) {
      const eR = [], eT = [], ts = [];
      for (const k of testSet) {
        const t = k * dt;
        if (t < tau0) continue;
        let a = 1, b = 0;
        if (reg !== 'none') {
          let ep = null;
          for (const e of epochs) {
            if (reg === 'once' && e !== epochs[0]) break;
            if (e.tau <= t && Number.isFinite(e.a)) ep = e;
          }
          if (!ep) continue;
          a = ep.a;
          b = ep.b;
        }
        const est = (y[k] - b) / a;
        eR.push(est - refVal[k]);
        eT.push(est - truth[k]);
        ts.push(t);
      }
      regimes[reg] = summarise(eR, eT, ts);
    }
    const aliveS = (deadTick >= 0 ? deadTick : K) * dt;
    const avgW = aliveS > 0 ? Math.min(used, cfg.battery_J) / aliveS : 0;
    devices.push({
      label: deviceLabel(i),
      true: p,
      y, status, energy,
      deadTick: deadTick >= 0 ? deadTick : null,
      attempts, delivered,
      uptime: delivered / K,
      energyUsed_J: Math.min(used, cfg.battery_J),
      avg_power_mW: avgW * 1000,
      battery_life_days: avgW > 0 ? cfg.battery_J / avgW / 86400 : Infinity,
      bytes_sent: attempts * PACKET_BYTES,
      bytes_delivered: delivered * PACKET_BYTES,
      pairs: { fit: pool.length, heldOut: testSet.length },
      epochs,
      regimes,
    });
  }
  const fleet = { regimes: {} };
  for (const reg of REGIMES) {
    let n = 0, sb = 0, sq = 0, sqT = 0;
    for (const d of devices) {
      const r = d.regimes[reg];
      n += r.n;
      if (r.n) {
        sb += r.bias * r.n;
        sq += r.rmseRef ** 2 * r.n;
        sqT += r.rmseTruth ** 2 * r.n;
      }
    }
    fleet.regimes[reg] = { n, bias: n ? sb / n : NaN, rmseRef: n ? Math.sqrt(sq / n) : NaN, rmseTruth: n ? Math.sqrt(sqT / n) : NaN };
  }
  const sum = (f) => devices.reduce((s, d) => s + f(d), 0);
  fleet.uptime = sum((d) => d.delivered) / (K * devices.length);
  fleet.bytes_sent = sum((d) => d.bytes_sent);
  fleet.bytes_delivered = sum((d) => d.bytes_delivered);
  fleet.energy_J = sum((d) => d.energyUsed_J);
  fleet.minBatteryLife_days = Math.min(...devices.map((d) => d.battery_life_days));
  fleet.dead = devices.filter((d) => d.deadTick !== null).length;
  const sel = fleet.regimes[cfg.regime];
  const ok = sel.n > 0;
  return {
    ok,
    reason: ok ? null : 'No reference pair outside the fit is left after the first calibration. Lower the packet loss, raise the battery, or shorten the interval.',
    config: cfg, seed, K, intervalS: dt, refEveryTicks: m, lossEff, energyPerPacket_J: ePacket,
    calibrationStart_s: tau0, truth, ref: refVal, devices, fleet,
    notes: [
      'Lost packets are gaps. No value is filled in.',
      'Error against the reference includes the reference instrument noise; error against the simulated truth is only known here because the code made the truth.',
    ],
  };
}

// Add the device list to a series table: one row per tick and device, delivered readings only.
export function toTable(result, maxRows = 5000) {
  const rows = [];
  const step = Math.max(1, Math.ceil((result.K * result.devices.length) / maxRows));
  let c = 0;
  for (const d of result.devices)
    for (let k = 0; k < result.K; k++) {
      if (d.status[k] !== ST.DELIVERED) continue;
      if (c++ % step) continue;
      rows.push([d.label, k * result.intervalS, d.y[k]]);
    }
  return { columns: ['device', 't_s', 'reading_c'], rows };
}

// ---------- import schema ----------

const ID_KEY = /(imei|imsi|iccid|mac|serial|uuid|guid|device_?id|owner|user|name|email|phone|msisdn|ssid|ip_?addr|hostname|plate|passport)/i;
const LOC_KEY = /(^|_)(lat|lon|lng|latitude|longitude|gps|coord|coords|location|geo|geohash|position|address|street|postcode|zip|what3words|plus_?code)(_|$)|latlon/i;
const ID_VALUE = [
  [/\b([0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i, 'looks like a MAC address'],
  [/\b\d{15}\b/, 'looks like an IMEI or similar 15-digit identifier'],
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, 'looks like an email address'],
  [/\b\d{1,3}(\.\d{1,3}){3}\b/, 'looks like an IP address'],
  [/\+?\d[\d\s().-]{8,}\d/, 'looks like a phone number'],
];
const LOC_VALUE = /-?\d{1,3}\.\d{3,}\s*[,;/ ]\s*-?\d{1,3}\.\d{3,}/;
export const REGION_CLASSES = ['coastal', 'inland', 'upland', 'wetland', 'urban-park', 'unspecified'];
const TOP_KEYS = new Set(['schema', 'regionClass', 'deviceLabel', 'unit', 'intervalS', 'readings']);
export const MAX_IMPORT_READINGS = 20000;

export function validateImport(obj) {
  const errors = [];
  const bad = (path, reason) => errors.push({ path, reason });
  const scanStrings = (v, path, depth = 0) => {
    if (depth > 4) return;
    if (typeof v === 'string') {
      for (const [re, why] of ID_VALUE) if (re.test(v)) bad(path, `value ${why}`);
      if (LOC_VALUE.test(v)) bad(path, 'value looks like a precise coordinate pair');
    } else if (Array.isArray(v)) v.slice(0, 50).forEach((x, i) => scanStrings(x, `${path}[${i}]`, depth + 1));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scanStrings(x, `${path}.${k}`, depth + 1);
  };
  const scanKeys = (v, path, depth = 0) => {
    if (depth > 4 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.slice(0, 50).forEach((x, i) => scanKeys(x, `${path}[${i}]`, depth + 1));
      return;
    }
    for (const [k, x] of Object.entries(v)) {
      if (LOC_KEY.test(k)) bad(`${path}.${k}`, 'a precise location field is not accepted');
      else if (ID_KEY.test(k)) bad(`${path}.${k}`, 'an identifier field is not accepted');
      scanKeys(x, `${path}.${k}`, depth + 1);
    }
  };
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: [{ path: '$', reason: 'expected one JSON object' }] };
  scanKeys(obj, '$');
  scanStrings(obj, '$');
  for (const k of Object.keys(obj)) if (!TOP_KEYS.has(k) && !errors.some((e) => e.path === '$.' + k)) bad('$.' + k, 'field is not in the schema');
  if (obj.schema !== 'arun-sensor-v1') bad('$.schema', 'must be "arun-sensor-v1"');
  if (obj.regionClass !== undefined && !REGION_CLASSES.includes(obj.regionClass)) bad('$.regionClass', `only a coarse class is accepted: ${REGION_CLASSES.join(', ')}`);
  if (obj.deviceLabel !== undefined && !/^unit-\d{2}$/.test(String(obj.deviceLabel))) bad('$.deviceLabel', 'must look like unit-01');
  if (obj.unit !== undefined && obj.unit !== 'degC') bad('$.unit', 'only degC is accepted');
  if (!Array.isArray(obj.readings)) bad('$.readings', 'must be a list of { t_s, value }');
  else {
    if (obj.readings.length > MAX_IMPORT_READINGS) bad('$.readings', `at most ${MAX_IMPORT_READINGS} readings`);
    let last = -Infinity;
    for (let i = 0; i < Math.min(obj.readings.length, MAX_IMPORT_READINGS); i++) {
      const r = obj.readings[i];
      if (!r || typeof r !== 'object') {
        bad(`$.readings[${i}]`, 'must be an object');
        break;
      }
      for (const k of Object.keys(r)) if (k !== 't_s' && k !== 'value' && !errors.some((e) => e.path.endsWith('.' + k))) bad(`$.readings[${i}].${k}`, 'field is not in the schema');
      if (!Number.isFinite(r.t_s) || r.t_s < 0) {
        bad(`$.readings[${i}].t_s`, 'must be a number of seconds from the start, 0 or more');
        break;
      }
      if (!(r.t_s > last)) {
        bad(`$.readings[${i}].t_s`, 'times must increase');
        break;
      }
      last = r.t_s;
      if (r.value !== null && !Number.isFinite(r.value)) {
        bad(`$.readings[${i}].value`, 'must be a number, or null for a missing reading');
        break;
      }
      if (errors.length > 12) break;
    }
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 12) };
}

// Summary of an accepted import. Null readings stay gaps.
export function summariseImport(obj) {
  const vals = obj.readings.filter((r) => r.value !== null).map((r) => r.value);
  const n = vals.length;
  const mean = n ? vals.reduce((s, v) => s + v, 0) / n : NaN;
  return { n, gaps: obj.readings.length - n, mean, min: n ? Math.min(...vals) : NaN, max: n ? Math.max(...vals) : NaN };
}
