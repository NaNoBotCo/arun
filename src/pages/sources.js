// Sources: the scientific resource registry and the adapter gates, read from code.
import { h, button } from '../core/ui.js';
import { ADAPTERS, adapterTable } from '../core/adapters.js';
import { LAND_SOURCE } from '../data/land.js';

const LEADS = [
  ['AlphaEarth Foundations Satellite Embedding V1', '64-dimensional yearly surface embeddings at 10 m: change analysis, similar places.', 'Yearly summaries, not current observations or forecasts. Dataset CC BY 4.0 with attribution; model weights and hosted use are separate questions.', 'https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL', 'E15 (synthetic stand-in)'],
  ['NVIDIA Earth2Studio', 'Weather inference, ensembles, data assimilation, downscaling in Python.', 'Each model has its own weights, memory needs, data source and terms. Needs hardware and regional validation.', 'https://nvidia.github.io/earth2studio/main/', 'E02, E04 (method analogues)'],
  ['Google open hydrology framework', 'Open river-forecast architecture and training material (June 2026).', 'Code Apache 2.0; hosted forecasts and trained weights are separate. Local calibration needed.', 'https://github.com/google-research/flood-forecasting', 'E02 (method analogue)'],
  ['NIST SP 800-226', 'How to evaluate a differential-privacy promise: unit, composition, threat model.', 'A guide, not a certification or a library.', 'https://csrc.nist.gov/pubs/sp/800/226/final', 'E05'],
  ['Classical time crystal (PRL, 2026)', 'Reference for temporal order in driven classical systems.', 'No forecasting or commercial capability shown. Oscillator toys are not evidence of a time crystal.', 'https://journals.aps.org/prl/abstract/10.1103/zjzk-t81n', 'E11'],
  ['Copernicus GloFAS', 'River forecasts and historical products.', 'Check product version, timeliness and terms.', 'https://global-flood.emergency.copernicus.eu/', '—'],
  ['ECMWF AIFS', 'Machine-learning weather forecasts.', 'Check data terms and validation for the region.', 'https://www.ecmwf.int/en/forecasts/datasets/aifs-machine-learning-data', '—'],
  ['Copernicus DEM, NASA Earthdata', 'Public elevation.', 'Vertical datum, voids, surface vs ground.', 'https://registry.opendata.aws/copernicus-dem/', '—'],
  ['OpenDroneMap, GDAL, STAC, OGC', 'Photogrammetry and geospatial processing standards.', 'Licensed, non-sensitive areas only; no public imagery of sensitive communities.', 'https://stacspec.org/', '—'],
  ['OpenDP, SciPy, OR-Tools, CVXPY', 'Privacy and optimisation libraries.', 'Check dependencies and licences; verify against small cases.', 'https://opendp.org/', 'E05, E20 (own code here)'],
  ['MQTT, The Things Network, OGC SensorThings', 'Sensor messaging and schemas.', 'Synthetic first; opt-in lab sensors later; no positions of people.', 'https://www.ogc.org/standard/sensorthings/', 'E18'],
];

export function sources(main) {
  const rows = adapterTable();
  const out = h('pre', { class: 'export-text', style: { minHeight: '0', maxHeight: '220px' } }, 'Press a Check button to send a sample request through an adapter’s gate.');
  const check = async (a) => {
    const req = { field: 'rainfall', resolution_m: 1000, purpose: 'demo check of the gate', seed: 7 };
    const v = a.validateRequest(req);
    if (!v.ok) {
      out.textContent = JSON.stringify({ adapter: a.describe().id, refused: v.reason }, null, 2);
      return;
    }
    const r = await a.fetchOrRun(req, { consent: false });
    out.textContent = JSON.stringify({ adapter: a.describe().id, validateResult: a.validateResult(r), ...r }, null, 2);
  };
  main.replaceChildren(h('div', { class: 'wrap page sources' },
    h('h1', {}, 'Sources'),
    h('p', { class: 'lede' }, 'Where real science would plug in, what each source allows, and why each is switched off in this build. The demo runs on seeded fictional data, labelled on every exhibit.'),
    h('p', {}, h('a', { class: 'btn', href: '#opportunity' }, 'Compare public, licensed, partner and IoT data routes →')),
    h('h2', {}, 'Adapters in this build'),
    h('div', { class: 'cards' }, rows.map((r, i) => h('div', { class: 'card' },
      h('span', { class: 'tagline' }, r.dataStatus), h('h3', {}, r.title),
      h('p', {}, h('span', { class: 'pill ' + (r.available ? 'ok' : 'no') }, r.available ? 'available' : 'unavailable')),
      h('p', { class: 'small' }, r.reason),
      r.gates.length ? h('details', {}, h('summary', { class: 'small' }, 'Gates before enabling'), h('ul', { class: 'small' }, r.gates.map((g) => h('li', {}, g)))) : null,
      h('p', { class: 'small muted' }, 'Start: ', r.start),
      button('Check', () => check(ADAPTERS[i]), { kind: 'small' })))),
    out,
    h('h2', {}, 'Research leads (reviewed 25 November 2026)'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'dtable' },
      h('thead', {}, h('tr', {}, ['Resource', 'Reuse', 'Boundary', 'Used in', 'Link'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, LEADS.map(([n, reuse, b, url, used]) => h('tr', {}, h('td', {}, n), h('td', {}, reuse), h('td', {}, b), h('td', {}, used), h('td', {}, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, 'source'))))))),
    h('p', { class: 'small muted' }, 'Links open the providers’ own pages in a new tab only when you click them. Nothing on this site fetches them.'),
    h('h2', {}, 'Data and assets inside this build'),
    h('ul', {},
      h('li', {}, `${LAND_SOURCE.source} — ${LAND_SOURCE.license} — ${LAND_SOURCE.resolution} — ${LAND_SOURCE.checksum.slice(0, 22)}…`),
      h('li', {}, 'Fonts: Chakra Petch, Atkinson Hyperlegible, Noto Sans Thai Looped, Kantumruy Pro, JetBrains Mono — SIL Open Font License 1.1, embedded.'),
      h('li', {}, 'Everything else is generated by the code from a seed and labelled SYNTHETIC or MATHEMATICAL.')),
    h('h2', {}, 'Real-data validation, before any real claim'),
    h('ol', {},
      h('li', {}, 'Time-separated hindcasts with no leakage from future images or labels.'),
      h('li', {}, 'Compare against climatology, persistence and existing public forecasts at matched scales.'),
      h('li', {}, 'Errors (MAE, RMSE) and calibration (CRPS or Brier score), by event type, with the gaps and failures written down.'),
      h('li', {}, 'Specialist review before any hazard product is used for business or humanitarian decisions.'))));
  return { destroy() {} };
}
