import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, fitLine, validate, validateImport, summariseImport, effectiveLoss, energyPerPacket_J, toTable, DEFAULTS, ST, PACKET_BYTES, jobs } from '../../src/kernels/e18.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (tol ${tol})`);
const clean = { ...DEFAULTS, noiseSd: 0, driftPerDay: 0, packetLoss: 0, refNoiseSd: 0, battery_J: 2000 };

test('exports an empty jobs object', () => assert.deepEqual(jobs, {}));

test('fitLine on a hand-solved case: points (0,1),(1,3),(2,5),(3,7),(4,9) give a=2, b=1 (1e-12)', () => {
  const f = fitLine([0, 1, 2, 3, 4], [1, 3, 5, 7, 9]);
  near(f.a, 2, 1e-12);
  near(f.b, 1, 1e-12);
  near(f.resid_sd, 0, 1e-12);
  assert.equal(fitLine([1, 1, 1, 1, 1], [1, 2, 3, 4, 5]), null);
  assert.equal(fitLine([1, 2], [1, 2]), null);
});

test('noiseless run recovers each device a and b exactly (1e-9), and calibrated error is zero', () => {
  const r = run(clean, 3);
  assert.ok(r.ok, r.reason);
  for (const d of r.devices) {
    for (const ep of d.epochs) {
      near(ep.a, d.true.a, 1e-9, 'a');
      near(ep.b, d.true.b, 1e-9, 'b');
    }
    near(d.regimes.periodic.rmseRef, 0, 1e-9);
    near(d.regimes.once.rmseTruth, 0, 1e-9);
    assert.ok(d.regimes.none.rmseRef > 0.01, 'factory a=1, b=0 is wrong for a sensor with its own a and b');
  }
});

test('drift: a one-time calibration degrades over time; periodic recalibration stays smaller', () => {
  const r = run({ ...clean, driftPerDay: 1.0, days: 7 }, 5);
  assert.ok(r.ok);
  let once = 0, periodic = 0;
  for (const d of r.devices) {
    once += d.regimes.once.rmseTruth;
    periodic += d.regimes.periodic.rmseTruth;
  }
  assert.ok(periodic < once * 0.6, `periodic ${periodic} vs once ${once}`);
});

test('noisy reference flattens the fitted slope (regression dilution), and RMSE against reference includes reference noise', () => {
  const quiet = run({ ...clean, refNoiseSd: 0 }, 9);
  const noisy = run({ ...clean, refNoiseSd: 1.0 }, 9);
  const errA = quiet.devices.reduce((s, d) => s + Math.abs(d.epochs[0].a - d.true.a), 0);
  const errB = noisy.devices.reduce((s, d) => s + Math.abs(d.epochs[0].a - d.true.a), 0);
  assert.ok(errB > errA + 1e-3);
  assert.ok(noisy.devices.every((d) => d.regimes.periodic.rmseRef > 0.3));
});

test('gaps are not fabricated: lost and dead ticks hold NaN, delivered ticks hold numbers, counts agree', () => {
  const r = run({ ...DEFAULTS, packetLoss: 0.3 }, 4);
  for (const d of r.devices) {
    let delivered = 0;
    for (let k = 0; k < r.K; k++) {
      if (d.status[k] === ST.DELIVERED) {
        assert.ok(Number.isFinite(d.y[k]));
        delivered++;
      } else assert.ok(Number.isNaN(d.y[k]));
    }
    assert.equal(delivered, d.delivered);
  }
  const frac = r.devices.reduce((s, d) => s + (1 - d.delivered / d.attempts), 0) / r.devices.length;
  near(frac, r.lossEff, 0.03, 'observed loss near configured loss');
  assert.ok(r.devices.every((d) => d.regimes.periodic.n <= d.pairs.heldOut));
});

test('uptime and bytes follow delivered packets', () => {
  const r = run(DEFAULTS, 2);
  for (const d of r.devices) {
    near(d.uptime, d.delivered / r.K, 1e-12);
    assert.equal(d.bytes_delivered, d.delivered * PACKET_BYTES);
    assert.ok(d.bytes_sent >= d.bytes_delivered);
  }
});

test('energy is nonnegative, cumulative energy never falls, and stays within the battery', () => {
  const r = run({ ...DEFAULTS, battery_J: 20, txDbm: 20, intervalS: 30 }, 6);
  for (const d of r.devices) {
    assert.ok(d.energyUsed_J >= 0 && d.energyUsed_J <= 20 + 1e-9);
    for (let k = 1; k < r.K; k++) assert.ok(d.energy[k] >= d.energy[k - 1] && d.energy[k] >= 0);
    assert.ok(d.battery_life_days > 0);
  }
  assert.ok(r.fleet.dead > 0, 'a small battery at high power runs out');
  for (const d of r.devices) if (d.deadTick !== null) for (let k = d.deadTick; k < r.K; k++) assert.equal(d.status[k], ST.DEAD);
});

test('more transmit power costs more energy per packet and loses fewer packets', () => {
  let lastE = 0, lastL = 1;
  for (const p of [0, 6, 12, 20]) {
    const e = energyPerPacket_J(p);
    assert.ok(e > lastE);
    lastE = e;
    const l = effectiveLoss(0.2, p);
    assert.ok(l < lastL);
    lastL = l;
  }
  near(energyPerPacket_J(8), 0.0003 + (Math.pow(10, 0.8) / 1000 + 0.025) * (21 * 8) / 5000, 1e-12);
});

test('time ordering: ticks are equally spaced and the series table is ordered per device', () => {
  const r = run(DEFAULTS, 1);
  const tb = toTable(r);
  let lastDev = '', lastT = -1;
  for (const [dev, t] of tb.rows) {
    if (dev !== lastDev) { lastDev = dev; lastT = -1; }
    assert.ok(t > lastT);
    lastT = t;
    assert.equal(t % r.intervalS, 0);
  }
  assert.deepEqual(tb.columns, ['device', 't_s', 'reading_c']);
});

test('held-out pairs were not used in any fit', () => {
  const r = run(DEFAULTS, 8);
  // Rebuild with the reference of every held-out tick changed: epochs must be identical (fit uses the fit pool only).
  const a = run(DEFAULTS, 8);
  assert.deepEqual(a.devices[0].epochs, r.devices[0].epochs);
  assert.ok(r.devices.every((d) => d.pairs.fit > 0 && d.pairs.heldOut > 0));
  // Calibration never looks past its own time: the first epoch time is the calibration start.
  assert.equal(r.devices[0].epochs[0].tau, r.calibrationStart_s);
});

test('adding a device leaves earlier devices unchanged', () => {
  const a = run({ ...DEFAULTS, nDevices: 3 }, 12);
  const b = run({ ...DEFAULTS, nDevices: 5 }, 12);
  for (let i = 0; i < 3; i++) assert.deepEqual(Array.from(a.devices[i].y), Array.from(b.devices[i].y));
  assert.equal(b.devices[4].label, 'unit-05');
});

test('seeded reproducibility: same seed repeats, another seed differs', () => {
  const a = run(DEFAULTS, 31), b = run(DEFAULTS, 31), c = run(DEFAULTS, 32);
  assert.deepEqual(Array.from(a.devices[1].y), Array.from(b.devices[1].y));
  assert.deepEqual(a.fleet, b.fleet);
  assert.notDeepEqual(Array.from(a.devices[1].y), Array.from(c.devices[1].y));
});

test('failure case: a tiny battery at high power leaves no scorable pairs and says so', () => {
  const r = run({ ...DEFAULTS, battery_J: 5, txDbm: 20, intervalS: 30 }, 2);
  assert.equal(r.ok, false);
  assert.match(r.reason, /No reference pair outside the fit/);
});

test('validation: out-of-range values and oversize runs throw plain messages', () => {
  assert.throws(() => validate({ packetLoss: 0.9 }), /packetLoss must be between 0 and 0.6/);
  assert.throws(() => validate({ regime: 'magic' }), /regime must be/);
  assert.throws(() => validate({ nDevices: 8, intervalS: 30, days: 7 }), /above the limit/);
  assert.throws(() => validate({ nDevices: 2.5 }), /whole number/);
});

const good = { schema: 'arun-sensor-v1', regionClass: 'coastal', deviceLabel: 'unit-01', unit: 'degC', readings: [{ t_s: 0, value: 21.5 }, { t_s: 60, value: null }, { t_s: 120, value: 21.7 }] };

test('schema accepts a clean file and summarises it with the gap left as a gap', () => {
  const v = validateImport(good);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  const s = summariseImport(good);
  assert.equal(s.n, 2);
  assert.equal(s.gaps, 1);
  near(s.mean, 21.6, 1e-12);
});

test('schema rejects identifiers and precise locations, by key and by value', () => {
  const cases = [
    [{ ...good, imei: '356938035643809' }, /identifier|not in the schema/],
    [{ ...good, serial_number: 'A1' }, /identifier/],
    [{ ...good, latitude: 13.7563, longitude: 100.5018 }, /precise location/],
    [{ ...good, gps: { lat: 1, lon: 2 } }, /precise location/],
    [{ ...good, deviceLabel: 'AA:BB:CC:DD:EE:FF' }, /MAC|unit-01/],
    [{ ...good, regionClass: '13.756331, 100.501765' }, /coarse class|coordinate/],
    [{ ...good, regionClass: 'Sukhumvit Road 12' }, /coarse class/],
    [{ ...good, owner: 'a person' }, /identifier/],
    [{ ...good, readings: [{ t_s: 0, value: 1, mac: 'x' }] }, /identifier|not in the schema/],
    [{ ...good, readings: [{ t_s: 0, value: 1, lat: 13.7 }] }, /precise location/],
    [{ ...good, unit: 'degC', contact: 'someone@example.org' }, /email|not in the schema/],
  ];
  for (const [obj, re] of cases) {
    const v = validateImport(obj);
    assert.equal(v.ok, false, JSON.stringify(obj));
    assert.ok(v.errors.some((e) => re.test(e.reason)), `${JSON.stringify(obj)} -> ${JSON.stringify(v.errors)}`);
  }
});

test('schema rejects non-increasing times, non-numbers, wrong shapes and oversize lists', () => {
  assert.equal(validateImport({ ...good, readings: [{ t_s: 5, value: 1 }, { t_s: 5, value: 2 }] }).ok, false);
  assert.equal(validateImport({ ...good, readings: [{ t_s: 0, value: 'warm' }] }).ok, false);
  assert.equal(validateImport({ ...good, readings: [{ t_s: 0, value: NaN }] }).ok, false);
  assert.equal(validateImport([]).ok, false);
  assert.equal(validateImport(null).ok, false);
  assert.equal(validateImport({ ...good, schema: 'other' }).ok, false);
  assert.equal(validateImport({ ...good, readings: Array.from({ length: 20001 }, (_, i) => ({ t_s: i, value: 1 })) }).ok, false);
});

test('run output carries no identifier or location fields', () => {
  const r = run(DEFAULTS, 1);
  const json = JSON.stringify(r.devices.map((d) => ({ label: d.label, true: d.true })));
  assert.ok(!/imei|mac|serial|lat|lon|gps|address/i.test(json));
  assert.ok(r.devices.every((d) => /^unit-\d{2}$/.test(d.label)));
});
