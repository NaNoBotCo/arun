// Science adapters behind capability gates. The offline build ships one working adapter (a labelled
// synthetic fixture) and describes the others as unavailable, with the reason, so nothing switches silently.

import { makeRng } from './rng.js';
import { hashNumbers } from './hash.js';

const COMMON_GATES = ['licence of code, weights, data and hosted service checked separately', 'version pinned', 'explicit consent before any outside request', 'offline mode off', 'provenance fields present in every response'];

function unavailable(id, title, reason, start) {
  return {
    describe: () => ({ id, title, dataStatus: 'PUBLIC_HISTORICAL', start }),
    capabilities: () => ({ available: false, reason, gates: COMMON_GATES }),
    validateRequest: () => ({ ok: false, reason }),
    fetchOrRun: async () => {
      throw new Error(reason);
    },
    cancel: () => {},
    validateResult: () => ({ ok: false, reason: 'No result: the adapter is not enabled.' }),
    provenance: () => null,
  };
}

export const ADAPTERS = [
  {
    describe: () => ({ id: 'fixture', title: 'Synthetic fixture (seeded, offline)', dataStatus: 'SYNTHETIC', start: 'built in' }),
    capabilities: () => ({ available: true, reason: 'Runs in the page with no outside request.', gates: [] }),
    validateRequest(req) {
      if (!req || typeof req !== 'object') return { ok: false, reason: 'No request.' };
      if (!['rainfall', 'elevation'].includes(req.field)) return { ok: false, reason: 'Field must be rainfall or elevation.' };
      if (!(req.resolution_m >= 100)) return { ok: false, reason: 'Resolution finer than 100 m is refused for any geography.' };
      if (!req.purpose || req.purpose.length < 4) return { ok: false, reason: 'Each request names its scientific purpose.' };
      return { ok: true };
    },
    async fetchOrRun(req, { consent = false } = {}) {
      const v = this.validateRequest(req);
      if (!v.ok) throw new Error(v.reason);
      const rng = makeRng(req.seed >>> 0);
      const values = Array.from({ length: 16 }, () => Math.round(rng.range(0, 40) * 10) / 10);
      const t0 = performance.now();
      return {
        values,
        provenance: { source: 'ARUN synthetic fixture', version: 'fixture-1.0.0', license: 'MIT (code); output is generated', timestamp: 'none (synthetic)', resolution: req.resolution_m + ' m', units: req.field === 'rainfall' ? 'mm' : 'm', checksum: 'fnv:' + hashNumbers(values), dataStatus: 'SYNTHETIC', consentUsed: consent, elapsedMs: performance.now() - t0, missing: 0 },
      };
    },
    cancel: () => {},
    validateResult: (r) => (r && r.provenance && r.provenance.dataStatus === 'SYNTHETIC' && Array.isArray(r.values) ? { ok: true } : { ok: false, reason: 'Missing provenance or values.' }),
    provenance: () => ({ source: 'ARUN synthetic fixture', version: 'fixture-1.0.0', license: 'MIT' }),
  },
  unavailable('alphaearth', 'AlphaEarth Foundations Satellite Embedding V1 (annual, 10 m)', 'Unavailable here: needs an Earth Engine or Cloud Storage account, a licence and attribution check (dataset CC BY 4.0), an approved non-sensitive area, and explicit consent. Offline build.', 'developers.google.com/earth-engine/datasets/catalog/GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL'),
  unavailable('earth2studio', 'NVIDIA Earth2Studio weather inference', 'Unavailable here: needs authorized compute (usually a GPU), per-model weight licences and regional validation. No hardware is assumed.', 'nvidia.github.io/earth2studio'),
  unavailable('hydrology', 'Google open hydrology framework (June 2026)', 'Unavailable here: code is Apache 2.0, but trained weights and hosted forecasts are separate; local calibration and a hindcast are required first.', 'github.com/google-research/flood-forecasting'),
  unavailable('glofas', 'Copernicus GloFAS river forecasts and history', 'Unavailable here: product version, timeliness and terms to be read and recorded; explicit consent before fetching.', 'global-flood.emergency.copernicus.eu'),
  unavailable('dem', 'Public elevation (Copernicus DEM / NASA Earthdata)', 'Unavailable here: vertical datum, voids and surface-vs-ground limits to be documented; licence recorded per tile.', 'registry.opendata.aws/copernicus-dem'),
  unavailable('partner', 'Authorized partner aggregates (e.g. delivery platforms)', 'Unavailable: no partner has authorized a product, purpose, retention or disclosure rule. No credentials exist in this build.', 'by written agreement only'),
  unavailable('iot', 'Opt-in lab environmental sensors', 'Unavailable here: needs a documented schema, a local emulator and consent; no precise positions or people.', 'mqtt.org · OGC SensorThings'),
];

export function adapterTable() {
  return ADAPTERS.map((a) => ({ ...a.describe(), ...a.capabilities() }));
}
