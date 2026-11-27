import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE, BASELINE_HASH, reduce, logEntry } from '../../src/kernels/experiment.js';
import {
  makeRecord, validateRecord, toExport, parseImport, migrate, sortRecords, duplicateRecord, leadOf, newId, NOTEBOOK_FORMAT, LIMITS,
} from '../../src/kernels/notebook.js';

const clone = o => JSON.parse(JSON.stringify(o));
function sample(over = {}, i = 0) {
  let s = clone(BASELINE); const log = [];
  for (const a of [{ type: 'add', kind: 'gauge', x: 100, y: 200 }, { type: 'seed', seed: 7 + i }, { type: 'ring', ring: 'sub' }]) { s = reduce(s, a); log.push(logEntry(a)); }
  log.push({ type: 'undo' }, { type: 'redo' });
  return makeRecord(
    { state: s, log, outcome: { seed: s.seed, tWater: 41.5, net: { tWarn: 12, prep: 20 + i, outcome: 'fits' }, alone: { prep: 3 }, gain: 17 }, uncertainty: { cover: 0.8, spread: 2.5, heldout: null } },
    { title: 'Sensors in the north', notes: 'Customer: Hotel Example', locale: 'km', buildVersion: '11.0 demo', now: new Date(Date.UTC(2026, 10, 27, 5, i)), inputs: [{ name: 'storm', kind: 'synthetic' }], ...over });
}

test('makeRecord gives a valid record with the documented fields', () => {
  const r = sample();
  const v = validateRecord(r);
  assert.deepEqual(v.errors, []); assert.ok(v.ok);
  assert.equal(r.schemaVersion, 1); assert.equal(r.baselineHash, BASELINE_HASH); assert.equal(r.seed, 7);
  assert.match(r.experimentId, /^[a-z0-9-]{8,40}$/);
  assert.equal(r.timestamp, '2026-11-27T05:00:00.000Z');
  assert.equal(r.provenance.kernelVersion, 'nowcast/11.0');
  assert.equal(r.provenance.adapterVersion, 'observe/11.0');
  assert.equal(leadOf(r), 20);
});

test('newId matches the pattern with crypto and with the counter fallback', () => {
  assert.match(newId(), /^[a-z0-9-]{8,40}$/);
  const c = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try { const a = newId(), b = newId(); assert.match(a, /^[a-z0-9-]{8,40}$/); assert.notEqual(a, b); }
  finally { if (c) Object.defineProperty(globalThis, 'crypto', c); else delete globalThis.crypto; }
});

test('round trip with text: make, export, import gives the same records', () => {
  const rs = [sample({}, 0), sample({ title: 'B' }, 1)];
  const out = parseImport(toExport(rs, { includeText: true }));
  assert.ok(out.ok); assert.deepEqual(out.errors, []);
  assert.deepEqual(out.records, rs);
});

test('default export drops text: titles become Experiment 1, 2 and notes are empty', () => {
  const rs = [sample({}, 0), sample({ title: 'Hotel Example north' }, 1)];
  const txt = toExport(rs);
  assert.ok(!txt.includes('Hotel Example')); assert.ok(!txt.includes('Sensors in the north'));
  const out = parseImport(txt);
  assert.deepEqual(out.records.map(r => r.title), ['Experiment 1', 'Experiment 2']);
  assert.deepEqual(out.records.map(r => r.notes), ['', '']);
  assert.deepEqual(out.records.map(r => ({ ...r, title: 0, notes: 0 })), rs.map(r => ({ ...r, title: 0, notes: 0 })));
  assert.equal(JSON.parse(txt).format, NOTEBOOK_FORMAT);
});

test('strict rejection: unknown key, wrong types, oversize', () => {
  const bad = (f, re) => { const r = clone(sample()); f(r); const v = validateRecord(r); assert.ok(!v.ok, re); assert.match(v.errors.join('|'), re); };
  bad(r => { r.extra = 1; }, /unknown key "extra"/);
  bad(r => { delete r.notes; }, /missing key "notes"/);
  bad(r => { r.seed = '9'; }, /seed/);
  bad(r => { r.scenario.extra = 1; }, /scenario/);
  bad(r => { r.scenario.facility.x = 1e9; }, /scenario: facility/);
  bad(r => { r.locale = 'fr'; }, /locale/);
  bad(r => { r.experimentId = 'AB'; }, /experimentId/);
  bad(r => { r.timestamp = 'yesterday'; }, /timestamp/);
  bad(r => { r.title = 'x'.repeat(81); }, /title/);
  bad(r => { r.notes = 'x'.repeat(2001); }, /notes/);
  bad(r => { r.title = 5; }, /title/);
  bad(r => { r.actions = Array.from({ length: 501 }, () => ({ type: 'undo' })); }, /actions/);
  bad(r => { r.actions.push({ type: 'eval' }); }, /unknown action type/);
  bad(r => { r.actions.push({ type: 'add', kind: 'gauge', x: 1, y: 2, script: 1 }); }, /unknown key "script"/);
  bad(r => { r.actions.push({ type: 'move', id: 'a b', x: 1, y: 2 }); }, /wrong type/);
  bad(r => { r.outcome.net.prep = NaN; }, /outcome/);
  bad(r => { r.outcome.a = { b: { c: { d: 1 } } }; }, /nested too deep/);
  bad(r => { r.outcome.s = 'x'.repeat(41); }, /text over/);
  bad(r => { r.outcome.f = () => 1; }, /outcome/);
  bad(r => { r.outcome.list = [1]; }, /wrong type/);
  bad(r => { r.provenance.extra = 1; }, /provenance/);
  bad(r => { r.provenance.inputs = [{ name: 'a' }]; }, /provenance.inputs/);
  bad(r => { r.seed = 8; }, /does not match/);
  assert.ok(!validateRecord(null).ok); assert.ok(!validateRecord([]).ok);
});

test('script-looking text is data: accepted, stays verbatim, not rejected for content', () => {
  const evil = '<img src=x onerror=alert(1)><script>alert(1)</script>';
  const r = sample({ title: evil.slice(0, 80), notes: evil });
  const v = validateRecord(r); assert.ok(v.ok, v.errors.join());
  const out = parseImport(toExport([r], { includeText: true }));
  assert.equal(out.records[0].notes, evil);
});

test('unsupported versions get an explicit message', () => {
  const r = clone(sample()); r.schemaVersion = 7;
  const v = validateRecord(r);
  assert.equal(v.ok, false); assert.match(v.errors[0], /Unsupported schemaVersion 7.*reads versions 0 and 1/);
  const file = JSON.stringify({ format: NOTEBOOK_FORMAT, schemaVersion: 2, records: [] });
  const out = parseImport(file);
  assert.equal(out.ok, false); assert.match(out.errors[0], /Unsupported schemaVersion 2/);
  const one = JSON.stringify({ format: NOTEBOOK_FORMAT, schemaVersion: 1, records: [r] });
  const o2 = parseImport(one); assert.ok(o2.ok); assert.equal(o2.records.length, 0); assert.match(o2.errors[0], /Record 1: Unsupported schemaVersion 7/);
});

test('import limits and file checks', () => {
  assert.match(parseImport('x'.repeat(LIMITS.importBytes + 1)).errors[0], /over 512 KB/);
  assert.match(parseImport('{nope').errors[0], /not JSON/);
  assert.match(parseImport('[]').errors[0], /not an arun-notebook/);
  assert.match(parseImport(JSON.stringify({ format: NOTEBOOK_FORMAT, schemaVersion: 1, records: Array(201).fill(0) })).errors[0], /more than 200/);
  const mixed = JSON.stringify({ format: NOTEBOOK_FORMAT, schemaVersion: 1, records: [sample(), { junk: 1 }] });
  const o = parseImport(mixed); assert.ok(o.ok); assert.equal(o.records.length, 1); assert.equal(o.errors.length, 1);
});

// A hypothetical schemaVersion 0 record: other names, epoch milliseconds, no provenance.
const V0 = () => ({
  schemaVersion: 0, id: 'old-run-0001', name: 'Early run', note: 'first try', when: Date.UTC(2026, 9, 1, 3, 0, 0), lang: 'th', seed: 1,
  state: clone(BASELINE), log: [{ type: 'ring', ring: 'city' }], result: { seed: 1, net: { prep: 18 } },
});
test('migration: schemaVersion 0 becomes 1, explicitly', () => {
  const m = migrate(V0());
  assert.equal(m.schemaVersion, 1); assert.equal(m.experimentId, 'old-run-0001'); assert.equal(m.title, 'Early run'); assert.equal(m.timestamp, '2026-10-01T03:00:00.000Z');
  assert.ok(validateRecord(m).ok, validateRecord(m).errors.join());
  assert.ok(!validateRecord(V0()).ok, 'v0 does not pass validateRecord unmigrated');
  const file = JSON.stringify({ format: NOTEBOOK_FORMAT, schemaVersion: 0, records: [V0()] });
  const out = parseImport(file);
  assert.ok(out.ok); assert.equal(out.migrated, 1); assert.equal(out.records.length, 1); assert.equal(out.records[0].locale, 'th'); assert.equal(leadOf(out.records[0]), 18);
});

test('duplicate ids on import: same content is skipped, other content gets a new id', () => {
  const a = sample(), b = { ...clone(a), title: 'Changed' };
  const first = parseImport(toExport([a], { includeText: true }));
  assert.equal(first.records.length, 1);
  const same = parseImport(toExport([a], { includeText: true }), [a.experimentId]);
  assert.equal(same.records.length, 1, 'an existing id with unknown content is saved under a new id');
  assert.equal(same.renamed, 1); assert.notEqual(same.records[0].experimentId, a.experimentId);
  const known = parseImport(toExport([a], { includeText: true }), [a]);
  assert.equal(known.records.length, 0); assert.equal(known.skipped, 1);
  const changed = parseImport(toExport([b], { includeText: true }), [a]);
  assert.equal(changed.records.length, 1); assert.equal(changed.renamed, 1);
  const within = parseImport(JSON.stringify({ format: NOTEBOOK_FORMAT, schemaVersion: 1, records: [a, a, b] }));
  assert.equal(within.records.length, 2); assert.equal(within.skipped, 1); assert.equal(within.renamed, 1);
  assert.equal(new Set(within.records.map(r => r.experimentId)).size, 2);
  assert.ok(within.records.every(r => validateRecord(r).ok));
});

test('makeRecord cleans what the app hands over', () => {
  const s = clone(BASELINE);
  const r = makeRecord({ state: s, log: [{ type: 'ring', ring: 'sub', junk: 1 }, { type: 'bogus' }, null, { type: 'pump', value: 3 }], outcome: { a: NaN, b: 'x'.repeat(99), c: { d: { e: { f: 1 } } }, g: undefined, h: () => 1, 'bad key': 1, ok: 2 }, uncertainty: null }, { title: 'x'.repeat(200), notes: 'n', locale: 'zz' });
  assert.deepEqual(r.actions, [{ type: 'ring', ring: 'sub' }, { type: 'pump', value: 3 }]);
  assert.equal(r.outcome.a, null); assert.equal(r.outcome.b.length, 40); assert.deepEqual(r.outcome.c, { d: {} }); assert.equal(r.outcome.ok, 2); assert.ok(!('g' in r.outcome) && !('bad key' in r.outcome));
  assert.deepEqual(r.uncertainty, {}); assert.equal(r.title.length, 80); assert.equal(r.locale, 'en');
  assert.ok(validateRecord(r).ok, validateRecord(r).errors.join());
});

test('sort by newest, title, lead; duplicate gets a new id', () => {
  const a = sample({ title: 'b' }, 0), b = sample({ title: 'a' }, 1), c = sample({ title: 'c' }, 2); c.outcome.net.prep = null;
  assert.deepEqual(sortRecords([a, b, c], 'newest').map(r => r.title), ['c', 'a', 'b']);
  assert.deepEqual(sortRecords([a, b, c], 'title').map(r => r.title), ['a', 'b', 'c']);
  assert.deepEqual(sortRecords([a, b, c], 'lead').map(r => r.title), ['a', 'b', 'c']);
  const d = duplicateRecord(a, { title: 'copy' });
  assert.notEqual(d.experimentId, a.experimentId); assert.equal(d.title, 'copy'); assert.ok(validateRecord(d).ok);
});
