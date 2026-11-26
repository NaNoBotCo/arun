// Status: what is built, what the tests said at build time, what this device can do, and checks you can run here.
import { h, button, statusTag, fmt } from '../core/ui.js';
import { EXHIBITS, auditRegistry } from '../exhibits/index.js';
import { adapterTable } from '../core/adapters.js';
import { coverage } from '../core/i18n.js';
import { workerAvailable, deviceLabel, runJob } from '../core/jobs.js';
import { CONFIG } from '../config.js';
import * as E01 from '../kernels/e01.js';
import * as E02 from '../kernels/e02.js';
import * as E05 from '../kernels/e05.js';
import { makeRng } from '../core/rng.js';
import { defaultScenario } from '../core/scenario.js';

// eslint-disable-next-line no-undef
const TESTS = typeof __TEST_RESULTS__ !== 'undefined' ? __TEST_RESULTS__ : null;
// eslint-disable-next-line no-undef
const BUILT = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'development';

function detectGpu() {
  const out = { webgl2: false, webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator };
  try {
    const c = document.createElement('canvas');
    out.webgl2 = !!c.getContext('webgl2');
  } catch {}
  return out;
}

const CHECKS = [
  ['E01 equator at the March equinox: 12 h of daylight ± 0.05 h', () => Math.abs(E01.daylightHours(0, 81) - 12) < 0.05],
  ['E01 polar day at 80°N in June is 24 h, finite', () => E01.daylightHours(80, 172) === 24],
  ['E02 no rain and no inflow: no water appears', () => {
    const p = { ...defaultScenario().hydro, stormIntensity_mm_h: 0, inflow_m3_s: 0, simHours: 3 };
    const sim = E02.createSim(E02.makeRegion(1, 32), p, true);
    sim.runToEnd();
    return sim.surfaceVolume() === 0;
  }],
  ['E02 water budget closes within 0.1% on a short storm', () => {
    const sim = E02.createSim(E02.makeRegion(2, 32), { ...defaultScenario().hydro, simHours: 4 }, true);
    sim.runToEnd();
    const b = sim.budget();
    return Math.abs(b.residual) <= b.tolerance;
  }],
  ['E05 three answers at ε = 1 spend the budget; a fourth is refused', () => {
    const pop = E05.population(1, 1000);
    const L = new E05.Ledger();
    ['district', 'band', 'district×band'].forEach((g) => E05.release(pop, L, { groupBy: g, epsilon: 1 }, 1));
    return !E05.release(pop, L, { groupBy: 'district', epsilon: 0.5 }, 1).ok;
  }],
  ['E05 Laplace noise variance within 3% of 2/ε² (100,000 draws)', () => {
    const r = makeRng(9);
    let s = 0, s2 = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) {
      const x = r.laplace(2);
      s += x;
      s2 += x * x;
    }
    const v = s2 / n - (s / n) ** 2;
    return Math.abs(v - 8) < 0.24;
  }],
];

export function status(main) {
  const gpu = detectGpu();
  const testsFor = (id) => {
    if (!TESTS) return null;
    return TESTS.files[`e${id.slice(1)}.test.mjs`] || null;
  };
  const problems = auditRegistry();
  const checkOut = h('div', {});
  const runChecks = () => {
    checkOut.replaceChildren(h('ul', {}, CHECKS.map(([name, fn]) => {
      const t0 = performance.now();
      let ok = false, err = '';
      try {
        ok = fn();
      } catch (e) {
        err = e.message;
      }
      return h('li', {}, h('span', { class: 'pill ' + (ok ? 'ok' : 'bad') }, ok ? 'pass' : 'fail'), ` ${name} · ${fmt(performance.now() - t0, 1)} ms${err ? ' · ' + err : ''}`);
    })));
  };
  const benchOut = h('p', { class: 'small' });
  const bench = () => {
    benchOut.textContent = 'Running one full E02 storm pair in a worker…';
    const s = defaultScenario();
    const j = runJob('e02.pair', { seed: s.seed, params: s.hydro, N: s.hydro.grid }, { useCache: false });
    j.promise.then((r) => (benchOut.textContent = `E02 pair (96×96, 16 h, both versions): ${fmt(r.elapsedMs, 0)} ms in a ${r.where} on ${r.device}.`)).catch((e) => (benchOut.textContent = 'Benchmark failed: ' + e.message));
  };
  const passTotal = TESTS ? Object.values(TESTS.files).reduce((a, f) => a + f.pass, 0) : 0;
  const failTotal = TESTS ? Object.values(TESTS.files).reduce((a, f) => a + f.fail, 0) : 0;
  main.replaceChildren(h('div', { class: 'wrap page status' },
    h('h1', {}, 'Status'),
    h('p', { class: 'lede' }, `${CONFIG.name} ${CONFIG.version} · built ${BUILT}. ${TESTS ? `Kernel tests at build time: ${passTotal} passed, ${failTotal} failed (${TESTS.node}, ${TESTS.ranAt}).` : 'Kernel test results were not attached to this build.'}`),
    h('h2', {}, 'Exhibits'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'dtable' },
      h('thead', {}, h('tr', {}, ['ID', 'Exhibit', 'Priority', 'Data', 'State', 'Kernel tests', 'Reads', 'Feeds'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, EXHIBITS.map((m) => {
        const t = testsFor(m.meta.id);
        return h('tr', {},
          h('td', {}, h('a', { href: '#' + m.meta.id.toLowerCase() }, m.meta.id)),
          h('td', {}, m.meta.title),
          h('td', {}, m.meta.priority),
          h('td', {}, statusTag(m.meta.dataStatus)),
          h('td', {}, h('span', { class: 'pill ' + (m.meta.placeholder ? 'bad' : 'ok') }, m.meta.placeholder ? 'not built' : 'implemented')),
          h('td', {}, t ? `${t.pass} pass${t.fail ? `, ${t.fail} fail` : ''}` : '—'),
          h('td', {}, (m.meta.dependencies || []).join(' ') || '—'),
          h('td', {}, (m.meta.feeds || []).join(' ') || '—'));
      })))),
    h('p', { class: 'small muted' }, 'Connected computation: E01 → E06 (solar yield); E02 → E03 (hazard curve), E06 (terrain), E07; E04 → E02 (rain factor, synthetic mapping); E03, E04, E05, E06 → E07. Exhibits E08–E21 stand alone: they do not change any forecast or report.'),
    problems.length ? h('p', { class: 'note error' }, 'Registry problems: ' + problems.join('; ')) : h('p', { class: 'small' }, h('span', { class: 'pill ok' }, 'registry complete'), ' Every exhibit has the required fields and a mount function.'),
    h('h2', {}, 'This device'),
    h('ul', {},
      h('li', {}, 'Device: ', deviceLabel()),
      h('li', {}, 'Background workers: ', workerAvailable() ? 'available (heavy jobs run off the main thread)' : 'unavailable (jobs run on the main thread and say so)'),
      h('li', {}, `WebGL2: ${gpu.webgl2 ? 'present' : 'absent'} · WebGPU: ${gpu.webgpu ? 'present' : 'absent'}. The exhibits draw on the CPU with 2D canvas and do not need either.`),
      h('li', {}, `Screen: ${innerWidth}×${innerHeight} CSS px at ${devicePixelRatio}× · motion: ${document.documentElement.dataset.motion}`)),
    h('div', { class: 'btnrow' }, button('Run reference checks here', runChecks, { kind: 'primary small' }), button('Time one E02 storm pair', bench, { kind: 'small' })),
    checkOut, benchOut,
    h('h2', {}, 'Optional science adapters (P2)'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'dtable' },
      h('thead', {}, h('tr', {}, ['Adapter', 'State', 'Reason'].map((c) => h('th', {}, c)))),
      h('tbody', {}, adapterTable().map((a) => h('tr', {}, h('td', {}, a.title), h('td', {}, h('span', { class: 'pill ' + (a.available ? 'ok' : 'no') }, a.available ? 'enabled' : 'blocked')), h('td', {}, a.reason)))))),
    h('h2', {}, 'Languages'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'dtable' },
      h('thead', {}, h('tr', {}, ['Language', 'Interface strings', 'State'].map((c) => h('th', {}, c)))),
      h('tbody', {}, coverage().map((c) => h('tr', {}, h('td', {}, `${c.native} (${c.name})`), h('td', {}, `${c.have} / ${c.total}`), h('td', {}, c.status))))))));
  return { destroy() {} };
}
