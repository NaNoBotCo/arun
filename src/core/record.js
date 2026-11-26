// Run records (schemas/run-record.schema.json), CSV with formula-injection guard, safe file names.

export const STATUSES = ['MATHEMATICAL', 'SYNTHETIC', 'PUBLIC_HISTORICAL', 'RESEARCH_MODEL', 'AUTHORIZED_AGGREGATE'];
const IDS = Array.from({ length: 21 }, (_, i) => 'E' + String(i + 1).padStart(2, '0'));
const TOP_KEYS = new Set([
  'schemaVersion', 'runId', 'experimentId', 'methodVersion', 'dataStatus', 'seed', 'createdAt',
  'inputs', 'metrics', 'provenance', 'limitations', 'diagnostics', 'elapsedMs',
]);
const REQUIRED = ['schemaVersion', 'runId', 'experimentId', 'methodVersion', 'dataStatus', 'seed', 'createdAt', 'inputs', 'metrics', 'provenance', 'limitations'];

let counter = 0;
export function newRunId(exId) {
  counter += 1;
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1e9).toString(36);
  return `${exId}-${t}-${counter}-${r}`.slice(0, 128);
}

function plainNumbersOnly(obj, depth = 0) {
  // Inputs and diagnostics are allowlisted configuration and aggregates: numbers, booleans, short strings.
  if (depth > 3) return undefined;
  if (obj === null) return null;
  if (typeof obj === 'number') return Number.isFinite(obj) ? obj : null;
  if (typeof obj === 'boolean') return obj;
  if (typeof obj === 'string') return obj.slice(0, 200);
  if (Array.isArray(obj)) return obj.slice(0, 500).map((v) => plainNumbersOnly(v, depth + 1));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(k)) continue;
      const pv = plainNumbersOnly(v, depth + 1);
      if (pv !== undefined) out[k] = pv;
    }
    return out;
  }
  return undefined;
}

export function buildRunRecord(meta, run) {
  const allowed = new Set([...(meta.inputs || []).map((i) => i.name), ...(meta.recordInputs || [])]);
  const inputs = {};
  for (const [k, v] of Object.entries(run.inputs || {})) if (allowed.has(k)) inputs[k] = plainNumbersOnly(v);
  const metrics = (run.metrics || []).map((m) => {
    const out = { name: String(m.name).slice(0, 120), value: Number.isFinite(m.value) ? m.value : null, unit: String(m.unit ?? '').slice(0, 40) };
    if (m.note) out.note = String(m.note).slice(0, 300);
    return out;
  });
  const rec = {
    schemaVersion: '1.0',
    runId: newRunId(meta.id),
    experimentId: meta.id,
    methodVersion: meta.methodVersion,
    dataStatus: run.dataStatus || meta.dataStatus,
    seed: Number.isInteger(run.seed) ? run.seed : 0,
    createdAt: new Date().toISOString(),
    inputs,
    metrics,
    provenance: (run.provenance || meta.provenance || []).map((p) => {
      const o = { source: String(p.source), version: String(p.version), license: String(p.license) };
      for (const k of ['attribution', 'timestamp', 'resolution', 'checksum']) if (p[k]) o[k] = String(p[k]);
      return o;
    }),
    limitations: [...(meta.limitations || []), ...(run.limitations || [])].map(String),
  };
  if (run.diagnostics) rec.diagnostics = plainNumbersOnly(run.diagnostics);
  if (Number.isFinite(run.elapsedMs)) rec.elapsedMs = Math.max(0, run.elapsedMs);
  if (rec.limitations.length === 0) rec.limitations.push('Illustrative synthetic run.');
  return rec;
}

// Hand-written check mirroring the JSON Schema, so exports are validated without a library.
export function validateRunRecord(rec) {
  const errors = [];
  if (!rec || typeof rec !== 'object') return { ok: false, errors: ['not an object'] };
  for (const k of Object.keys(rec)) if (!TOP_KEYS.has(k)) errors.push(`unexpected property ${k}`);
  for (const k of REQUIRED) if (!(k in rec)) errors.push(`missing ${k}`);
  if (rec.schemaVersion !== '1.0') errors.push('schemaVersion must be "1.0"');
  if (typeof rec.runId !== 'string' || rec.runId.length > 128) errors.push('runId must be a string ≤128');
  if (!IDS.includes(rec.experimentId)) errors.push('experimentId must be E01–E21');
  if (typeof rec.methodVersion !== 'string' || !rec.methodVersion) errors.push('methodVersion required');
  if (!STATUSES.includes(rec.dataStatus)) errors.push('dataStatus not in enum');
  if (!Number.isInteger(rec.seed)) errors.push('seed must be an integer');
  if (typeof rec.createdAt !== 'string' || Number.isNaN(Date.parse(rec.createdAt))) errors.push('createdAt must be a date-time');
  if (!rec.inputs || typeof rec.inputs !== 'object' || Array.isArray(rec.inputs)) errors.push('inputs must be an object');
  if (!Array.isArray(rec.metrics)) errors.push('metrics must be an array');
  else
    rec.metrics.forEach((m, i) => {
      for (const k of Object.keys(m)) if (!['name', 'value', 'unit', 'note'].includes(k)) errors.push(`metrics[${i}] unexpected ${k}`);
      if (typeof m.name !== 'string') errors.push(`metrics[${i}].name`);
      if (!(m.value === null || typeof m.value === 'number')) errors.push(`metrics[${i}].value`);
      if (typeof m.unit !== 'string') errors.push(`metrics[${i}].unit`);
    });
  if (!Array.isArray(rec.provenance)) errors.push('provenance must be an array');
  else
    rec.provenance.forEach((p, i) => {
      for (const k of ['source', 'version', 'license']) if (typeof p[k] !== 'string') errors.push(`provenance[${i}].${k}`);
      for (const k of Object.keys(p))
        if (!['source', 'version', 'license', 'attribution', 'timestamp', 'resolution', 'checksum'].includes(k)) errors.push(`provenance[${i}] unexpected ${k}`);
    });
  if (!Array.isArray(rec.limitations) || rec.limitations.length < 1 || rec.limitations.some((l) => typeof l !== 'string'))
    errors.push('limitations must be a non-empty array of strings');
  if ('elapsedMs' in rec && !(typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0)) errors.push('elapsedMs must be ≥0');
  if ('diagnostics' in rec && (typeof rec.diagnostics !== 'object' || Array.isArray(rec.diagnostics))) errors.push('diagnostics must be an object');
  return { ok: errors.length === 0, errors };
}

// A spreadsheet treats a cell that starts with = + - @ tab or CR as a formula. Text cells get a leading apostrophe.
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCSV(columns, rows) {
  const lines = [columns.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function safeFileName(s) {
  const base = String(s)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 80);
  return base || 'arun-export';
}

export function recordToCSV(rec) {
  const rows = rec.metrics.map((m) => [rec.experimentId, rec.runId, rec.seed, rec.dataStatus, m.name, m.value, m.unit, m.note || '']);
  return toCSV(['experimentId', 'runId', 'seed', 'dataStatus', 'metric', 'value', 'unit', 'note'], rows);
}

// Escape text for HTML reports we generate.
export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
