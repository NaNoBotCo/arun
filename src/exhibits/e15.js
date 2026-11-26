// E15 Earth Change Lens: an embedding explorer on fictional tiles. See CONTRACT.md.
import { YEARS, CLASS_NAMES, DIM, analyze, knn, cosineByYear, datasetFromJob } from '../kernels/e15.js';
import { histogram } from '../core/stats.js';

const Y0 = YEARS[0];
const Y1 = YEARS[YEARS.length - 1];
const K_TILES = 24;

export const meta = {
  id: 'E15',
  title: 'Earth Change Lens',
  subtitle: 'embedding explorer',
  priority: 'P1',
  kind: 'analysis',
  dataStatus: 'SYNTHETIC',
  methodVersion: 'e15-embedding-lens-1.0.0',
  blurb: 'Compare 64-number tile fingerprints across fictional years and see which tiles changed.',
  inputs: [
    { name: 'yearA', label: 'Reference year', type: 'range', min: Y0, max: Y1, step: 1, default: Y0, unit: '', integer: true },
    { name: 'yearB', label: 'Compared year', type: 'range', min: Y0, max: Y1, step: 1, default: Y1, unit: '', integer: true },
    { name: 'thr', label: 'Change threshold (1 − cosine)', type: 'range', min: 0.02, max: 0.8, step: 0.01, default: 0.2, unit: '' },
    { name: 'R', label: 'Reference patches', type: 'range', min: 8, max: 200, step: 1, default: 40, unit: 'tiles', integer: true, help: 'The projection and the neighbour library use these tiles only.' },
    { name: 'k', label: 'Neighbours k', type: 'range', min: 1, max: 15, step: 1, default: 5, unit: '', integer: true },
    { name: 'noise', label: 'Embedding noise', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.12, unit: '', help: 'Size of the random part of each fingerprint (1 = as large as the signal).' },
    { name: 'drift', label: 'Annual drift', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.05, unit: '', help: 'A shift shared by every tile in a year, like a change in the model between releases.' },
    { name: 'projection', label: 'Projection', type: 'select', default: 'pca12', options: [
      { value: 'pca12', label: 'PCA axes 1 and 2' },
      { value: 'pca13', label: 'PCA axes 1 and 3' },
      { value: 'random', label: 'Seeded random axes' },
    ] },
  ],
  outputs: [
    { name: 'flagged', label: 'Tiles flagged', unit: 'tiles' },
    { name: 'f1', label: 'F1 against seeded truth', unit: '' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32 streams derived from the seed: prototypes, class fields, change events, missing tile-years, noise, yearly drift, reference patch order, PCA start vectors and random axes each use their own stream.',
  method: `<p>A map of ${K_TILES} × ${K_TILES} fictional tiles has 8 fictional years (2018 to 2025). Each tile-year has an embedding: a list of 64 numbers scaled to length 1. The code builds it from a seeded mixture of six prototype directions, adds random noise and a drift shared by all tiles in that year, then rescales to length 1. Seeded events change a tile's dominant class: permanent conversions from a given year, and transient one-year events. About 2% of tile-years are missing and stored as zero vectors.</p>
<p>The 64 numbers have no physical meaning. A single entry is not temperature, greenness, moisture or any other measured quantity. Only the angle between two whole vectors is used.</p>
<p class="eq">cos(a, b) = a·b / (‖a‖ ‖b‖)  ·  change score = 1 − cos(a<sub>year A</sub>, b<sub>year B</sub>)</p>
<p>A zero vector has no direction: the similarity is undefined and the tile is left out of every count. A tile is flagged when its score exceeds the threshold. Truth for scoring is the seeded label: the dominant latent class differs between the two years. Precision, recall and F1 compare the flags with that truth. The noise floor is the 95th percentile of scores of tiles that did not change class; z and the empirical p for a selected tile come from that same null set.</p>
<p><b>Projection.</b> PCA is fit on the covariance of the reference patches only (reference year, R tiles, plus tiles you add). Axes come from power iteration with deflation. Every other tile and year is projected with that fixed fit, so the held-out variance share shown beside the reference share tells how well the axes carry over. The alternative is seeded random orthonormal axes centred on the reference mean.</p>
<p><b>Neighbours.</b> The k nearest reference patches by cosine vote with their seeded class labels. The vote share is the agreement among neighbours; it is an uncertainty signal, not a probability.</p>
<p><b>Noise sweep.</b> A background job regenerates smaller maps at several noise levels over 6 seeds and reports F1 and the false-alarm rate with and without the annual drift.</p>
<p><b>Real-data path.</b> The AlphaEarth Foundations Satellite Embedding V1 dataset provides 64-dimensional annual embeddings at 10 m resolution (dataset licence CC BY 4.0, attribution required). This exhibit does not use it or any other outside data.</p>`,
  limitations: [
    'Synthetic embeddings from a seeded mixture model. They show how the method behaves, not what any satellite saw.',
    'Embedding entries are not physical variables. Class A to F are fictional labels attached by the generator.',
    'Truth is the generator\'s own label, so scores against it show the method on this toy and nothing about accuracy on real imagery.',
    'The map describes no real place, person or community. A flagged tile is not a claim about anything on the ground.',
    'Annual embeddings are not current observations and give no forecast.',
  ],
  provenance: [],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E15"] .e15-bar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 8px 12px 0; }
[data-ex="E15"] .e15-bar .ctl { padding: 0; border: 0; }
[data-ex="E15"] .e15-bar .lbl { font-size: 0.85rem; color: var(--muted); }
[data-ex="E15"] .e15-cap { flex: none; padding: 4px 12px 8px; font-size: 0.85rem; color: var(--muted); min-height: 2.4em; }
[data-ex="E15"] .stage-split canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
[data-ex="E15"] .e15-status { margin: 6px 0; }
[data-ex="E15"] .e15-btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
[data-ex="E15"] .e15-sel { font-size: 0.9rem; }
[data-ex="E15"] .e15-sel p { margin: 4px 0; }
@media (max-width: 860px), (orientation: portrait) and (max-width: 1100px) {
  [data-ex="E15"] .stage-split { grid-template-columns: 1fr 1fr; padding: 4px; gap: 4px; }
  [data-ex="E15"] .e15-bar { padding-top: 4px; }
  [data-ex="E15"] .stage-label { font-size: 0.75rem; padding: 2px 8px; }
}
`;

const DEFAULTS = Object.fromEntries(meta.inputs.map((i) => [i.name, i.default]));

function rgbOf(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css3 = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const values = { ...DEFAULTS, ...((ctx.initial && ctx.initial.inputs) || {}) };
  let seed = ctx.initial && Number.isInteger(ctx.initial.seed) ? ctx.initial.seed : 15;
  let ds = null, an = null, sel = -1, view = 'score', err = '', building = false, buildMs = 0, buildProgress = 0;
  let extras = [];
  let sweep = null, sweepState = 'idle';
  let buildJob = null, sweepJob = null, timer = 0, acc = 0;
  let pal = null;
  let geo = null; // map geometry from the last draw
  let lastDrawMs = 0, anMs = 0;

  const palette = () => ({
    bg: rgbOf(ui.token('--bg')), bg2: rgbOf(ui.token('--bg-2')), fg: rgbOf(ui.token('--fg')), muted: rgbOf(ui.token('--muted')),
    violet: rgbOf(ui.token('--violet')), rose: rgbOf(ui.token('--rose')), dawn: rgbOf(ui.token('--dawn')), jade: rgbOf(ui.token('--jade')),
    alarm: rgbOf(ui.token('--rose')), water: rgbOf(ui.token('--water')),
  });
  const ramp = (s) => {
    const t = Math.max(0, Math.min(1, s / 0.6));
    if (t < 0.3) return mix(pal.bg2, pal.violet, t / 0.3);
    if (t < 0.65) return mix(pal.violet, pal.rose, (t - 0.3) / 0.35);
    return mix(pal.rose, pal.dawn, (t - 0.65) / 0.35);
  };

  // ---- stage ----
  const mapC = h('canvas', { class: 'stage-canvas', tabindex: 0, role: 'img', 'aria-label': 'Map of fictional tiles. Building.' });
  const scC = h('canvas', { class: 'stage-canvas', role: 'img', 'aria-label': 'Scatter of tiles on two projection axes.' });
  const mapLabel = h('div', { class: 'stage-label' }, 'Tile map');
  const scLabel = h('div', { class: 'stage-label' }, 'Embedding space');
  const cap = h('div', { class: 'e15-cap', 'aria-live': 'polite' }, 'Building the fictional map.');
  const viewCtl = ui.segmented({ name: 'view', label: 'Map shows', options: [
    { value: 'score', label: 'Change score' }, { value: 'detect', label: 'Flags vs truth' }, { value: 'pca', label: 'PCA colour' },
  ] }, view, (v) => { view = v; drawAll(); });
  slots.stage.append(
    h('div', { class: 'e15-bar' }, viewCtl.el),
    h('div', { class: 'stage-split' }, h('div', {}, mapC, mapLabel), h('div', {}, scC, scLabel)),
    cap);

  // ---- controls ----
  const status = h('div', { class: 'e15-status', role: 'status' });
  const onRun = () => {
    if (loop.running) { loop.stop(); tp.setRunning(false); return; }
    if (values.yearB >= Y1 || values.yearB <= values.yearA) setYearB(Math.min(Y1, values.yearA + 1));
    acc = 0;
    loop.start();
    tp.setRunning(true);
  };
  const tp = ui.transport({
    seed, running: false, stepLabel: 'Next year',
    onToggle: onRun,
    onStep: () => advance(true),
    onReset: () => {
      loop.stop();
      tp.setRunning(false);
      const keepSeed = seed;
      extras = [];
      for (const [k2, v] of Object.entries(DEFAULTS)) panel.set(k2, v);
      Object.assign(values, DEFAULTS);
      seed = keepSeed;
      sel = -1;
      rebuild(true);
    },
    onReplay: () => {
      loop.stop();
      setYearB(Math.min(Y1, values.yearA + 1));
      acc = 0;
      loop.start();
      tp.setRunning(true);
    },
    onSeed: (v) => { seed = v; extras = []; sel = -1; rebuild(); },
  });
  const panel = ui.controlPanel(slots.controls, meta.inputs, values, (name) => {
    if (name === 'noise' || name === 'drift') rebuild();
    else if (name === 'yearA' || name === 'yearB') { clampYears(name); recompute(); }
    else recompute();
  });
  slots.controls.prepend(tp.el);
  const btns = h('div', { class: 'e15-btns' },
    ui.button('Add selected tile to reference', () => {
      if (sel < 0 || extras.includes(sel)) return;
      extras.push(sel);
      ctx.announce(`Tile ${sel} added to the reference patches.`);
      recompute();
    }, { kind: 'small' }),
    ui.button('Clear added tiles', () => { extras = []; recompute(); }, { kind: 'small' }),
    ui.button('Show failure case', () => {
      panel.setAll({ noise: 0.5, drift: 0.3, thr: 0.2 });
      Object.assign(values, { noise: 0.5, drift: 0.3, thr: 0.2 });
      rebuild();
    }, { kind: 'small', title: 'High noise and a large yearly drift: the detector floods with false alarms' }),
    ui.button('Back to preset', () => {
      panel.setAll({ noise: 0.12, drift: 0.05, thr: 0.2 });
      Object.assign(values, { noise: 0.12, drift: 0.05, thr: 0.2 });
      rebuild();
    }, { kind: 'small' }));
  slots.controls.append(btns, status);

  // ---- metrics + charts ----
  const mg = ui.metricGrid(slots.metrics, [
    { name: 'flagged', label: 'Tiles flagged', unit: 'tiles', digits: 0 },
    { name: 'f1', label: 'F1 vs seeded truth', digits: 3 },
    { name: 'precision', label: 'Precision', digits: 3 },
    { name: 'recall', label: 'Recall', digits: 3 },
    { name: 'floor', label: 'Noise floor (p95, unchanged tiles)', digits: 3 },
    { name: 'median', label: 'Median score, all tiles', digits: 3, help: 'A median far above the noise floor means a shift shared by every tile.' },
    { name: 'varRef', label: 'Variance on 3 axes: reference', pct: true },
    { name: 'varHeld', label: 'Variance on 3 axes: other tiles', pct: true },
    { name: 'missing', label: 'Missing tile-years', unit: 'of 4608', digits: 0 },
    { name: 'selScore', label: 'Selected tile score', digits: 3 },
    { name: 'selZ', label: 'Selected tile z / p', digits: 2 },
  ]);
  const selBox = h('div', { class: 'e15-sel' });
  slots.metrics.append(ui.sectionTitle('Selected tile'), selBox);
  const cYears = chart.chartBox(slots.metrics, { title: 'Similarity to the reference year, selected tile', height: 170 });
  const cHist = chart.chartBox(slots.metrics, { title: 'Change scores: tiles with the same class vs changed', height: 170 });
  const sweepBtn = ui.button('Run noise sweep', () => runSweep(), { kind: 'small' });
  const sweepNote = h('span', { class: 'small muted' }, '');
  slots.metrics.append(ui.sectionTitle('Noise sweep'), h('div', { class: 'e15-btns' }, sweepBtn, sweepNote));
  const cSweep = chart.chartBox(slots.metrics, { title: 'F1 against embedding noise (6 seeds each)', height: 170 });
  slots.metrics.append(h('p', { class: 'note' }, `Each map has ${DIM} numbers per tile and year. The numbers have no physical meaning; only the angle between whole vectors is used.`));

  // ---- logic ----
  const loop = ctx.loop((dt) => {
    acc += dt;
    if (acc >= 1.1) {
      acc = 0;
      if (!advance(false)) { loop.stop(); tp.setRunning(false); }
    }
  });

  function clampYears() { /* both years may take any order; equal years give a score of 0 everywhere */ }

  function setYearB(y) {
    values.yearB = y;
    panel.set('yearB', y);
    recompute();
  }

  function advance(manual) {
    let y = values.yearB + 1;
    if (y > Y1) {
      if (!manual) return false;
      y = Math.min(Y1, values.yearA + 1);
    }
    setYearB(y);
    return values.yearB < Y1 || manual;
  }

  function rebuild(immediate) {
    clearTimeout(timer);
    if (buildJob) buildJob.cancel();
    building = true;
    buildProgress = 0;
    status.replaceChildren(ui.note('Building embeddings…'));
    const go = () => {
      const cfg = { K: K_TILES, noise: values.noise, drift: values.drift };
      const t0 = performance.now();
      buildJob = ctx.runJob('e15.build', { cfg, seed }, { onProgress: (p) => { buildProgress = p; } });
      buildJob.promise.then((r) => {
        ds = datasetFromJob(r.result);
        buildMs = performance.now() - t0;
        building = false;
        recompute();
        if (sweepState === 'idle') runSweep();
      }, (e) => {
        if (e.cancelled) return;
        building = false;
        err = e.message;
        showStatus();
        ctx.announce('Build failed: ' + e.message, 'error');
      });
    };
    if (immediate) go();
    else timer = setTimeout(go, 160);
  }

  function runSweep() {
    if (sweepJob) sweepJob.cancel();
    sweepState = 'running';
    sweepNote.textContent = 'Running…';
    const a = values.yearA - Y0, b = values.yearB - Y0;
    sweepJob = ctx.runJob('e15.noiseSweep', { K: K_TILES, a, b, thr: values.thr, drift: Math.max(values.drift, 0.3), seed, nSeeds: 6 },
      { onProgress: (p) => { sweepNote.textContent = `Running… ${Math.round(p * 100)}%`; } });
    sweepJob.promise.then((r) => {
      sweep = r.result;
      sweepState = 'done';
      sweepNote.textContent = `${r.where}, ${Math.round(r.elapsedMs)} ms, threshold ${values.thr.toFixed(2)}, years ${values.yearA} to ${values.yearB}`;
      drawSweep();
    }, (e) => {
      if (e.cancelled) return;
      sweepState = 'failed';
      sweepNote.textContent = 'Sweep failed: ' + e.message;
      ctx.announce('Noise sweep failed: ' + e.message, 'error');
    });
  }

  function recompute() {
    if (!ds) return;
    err = '';
    const t0 = performance.now();
    try {
      an = analyze(ds, { a: values.yearA - Y0, b: values.yearB - Y0, thr: values.thr, R: values.R, k: values.k, projection: values.projection, extras, seed });
    } catch (e) {
      an = null;
      err = e.message;
    }
    anMs = performance.now() - t0;
    if (an && (sel < 0 || sel >= ds.T)) {
      let best = -1, bs = -1;
      for (let t = 0; t < ds.T; t++) if (an.ok[t] && an.score[t] > bs) { bs = an.score[t]; best = t; }
      sel = best >= 0 ? best : 0;
    }
    updateText();
    drawAll();
  }

  const pct = (v) => (v === null || v === undefined ? '—' : v);

  function showStatus() {
    status.replaceChildren();
    if (err) { status.append(ui.note('Stopped: ' + err, 'error')); return; }
    if (!an) return;
    const m = an.metrics;
    if (values.yearA === values.yearB) status.append(ui.note('Both years are the same, so every score is 0 and nothing changed.'));
    else if (m.f1 === null) status.append(ui.note('No tile in this pair changed class, so precision, recall and F1 are undefined.'));
    else if (m.f1 < 0.5) {
      const why = m.falseAlarmRate > 0.2
        ? `${m.fp} unchanged tiles are flagged: the noise floor (${an.nul.p95.toFixed(2)}) and the median score (${an.medianScore.toFixed(2)}) sit near or above the threshold ${values.thr.toFixed(2)}.`
        : `${m.fn} changed tiles are missed.`;
      status.append(ui.note(`The detector fails here (F1 ${m.f1.toFixed(2)}). ${why}`, 'error'));
    } else status.append(ui.note(`Detector works at this setting: F1 ${m.f1.toFixed(2)}, ${m.fp} false alarms, ${m.fn} misses.`));
  }

  function updateText() {
    showStatus();
    if (!an) return;
    const m = an.metrics;
    mg.set('flagged', m.flagged, { tone: '' });
    mg.set('f1', m.f1, { text: m.f1 === null ? '—' : undefined, tone: m.f1 === null ? '' : m.f1 < 0.5 ? 'bad' : m.f1 > 0.85 ? 'good' : '' });
    mg.set('precision', m.precision, { text: m.precision === null ? '—' : undefined });
    mg.set('recall', m.recall, { text: m.recall === null ? '—' : undefined });
    mg.set('floor', an.nul.p95, { text: an.nul.p95 === null ? '—' : undefined });
    mg.set('median', an.medianScore, { tone: an.medianScore > values.thr ? 'bad' : '' });
    mg.set('varRef', an.shareRef, { sub: `${an.refs.length} tiles, fit here` });
    mg.set('varHeld', an.shareHeld, { sub: `${an.nHeld} tiles, not in fit` });
    mg.set('missing', an.masked);
    // selected tile
    selBox.replaceChildren();
    if (sel >= 0 && ds) {
      const row = Math.floor(sel / ds.K), col = sel % ds.K, a = values.yearA - Y0, b = values.yearB - Y0;
      const ok = an.ok[sel];
      const s = an.score[sel];
      mg.set('selScore', ok ? s : null, { text: ok ? undefined : 'no data' });
      const z = ok ? an.nul.z(s) : null, p = ok ? an.nul.p(s) : null;
      mg.set('selZ', z, { text: z === null ? '—' : `${z.toFixed(1)} / ${p < 0.001 ? '<0.001' : p.toFixed(3)}` });
      const la = CLASS_NAMES[ds.cls[sel * ds.Y + a]], lb = CLASS_NAMES[ds.cls[sel * ds.Y + b]];
      selBox.append(h('p', {}, `Tile row ${row + 1}, column ${col + 1}. Seeded label ${values.yearA}: ${la}; ${values.yearB}: ${lb}${la === lb ? ' (unchanged)' : ' (changed)'}.`));
      if (ds.valid[sel * ds.Y + b] && an.refs.length > 0) {
        const r = knn(ds, sel, b, an.refs, a, Math.min(values.k, an.refs.length));
        if (r.neighbours.length) {
          selBox.append(h('p', {}, `Nearest reference patches vote ${CLASS_NAMES[r.predicted]} with ${Math.round(r.voteShare * 100)}% agreement (vote entropy ${r.entropy.toFixed(2)} bits). ${r.predicted === ds.cls[sel * ds.Y + b] ? 'This matches the seeded label.' : 'This differs from the seeded label.'}`));
          selBox.append(h('table', { class: 'dtable' },
            h('thead', {}, h('tr', {}, ['Neighbour tile', 'Cosine', 'Label'].map((c) => h('th', { scope: 'col' }, c)))),
            h('tbody', {}, r.neighbours.map((n) => h('tr', {}, h('td', {}, `r${Math.floor(n.tile / ds.K) + 1} c${(n.tile % ds.K) + 1}`), h('td', {}, n.sim.toFixed(3)), h('td', {}, CLASS_NAMES[n.label]))))));
          lastKnn = r;
        } else lastKnn = null;
      } else {
        lastKnn = null;
        selBox.append(h('p', {}, 'The selected tile has no embedding in the compared year.'));
      }
    }
    drawCharts();
  }
  let lastKnn = null;

  // ---- drawing ----
  function drawAll() {
    const t0 = performance.now();
    pal = palette();
    drawMap();
    drawScatter();
    lastDrawMs = performance.now() - t0;
    if (an && ds) {
      const m = an.metrics;
      cap.textContent = `${values.yearA} vs ${values.yearB}: ${m.flagged} of ${an.ok.reduce((s, v) => s + v, 0)} tiles flagged above ${values.thr.toFixed(2)}. Map and scatter come from the same fingerprints; the axes have no physical meaning.`;
    } else cap.textContent = building ? 'Building the fictional map.' : err ? 'Stopped: ' + err : '';
  }

  function drawMap() {
    const c = mapC, g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (!ds || !an) {
      g.fillStyle = css3(pal.muted);
      g.font = `${14 * (W / c.clientWidth || 1)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(err || 'Building…', W / 2, H / 2);
      return;
    }
    const K = ds.K, dpr = W / (c.clientWidth || W);
    const side = Math.max(10, Math.min(W, H) - 16 * dpr), ts = side / K, ox = (W - side) / 2, oy = (H - side) / 2;
    geo = { ox, oy, ts, K, dpr };
    const off = document.createElement('canvas');
    off.width = off.height = K;
    const og = off.getContext('2d');
    const img = og.createImageData(K, K);
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    if (view === 'pca')
      for (let t = 0; t < ds.T; t++) {
        if (!an.ok[t] && !ds.valid[t * ds.Y + values.yearB - Y0]) continue;
        for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], an.coords[t * 3 + q]); hi[q] = Math.max(hi[q], an.coords[t * 3 + q]); }
      }
    const dim = mix(pal.bg, pal.muted, 0.18);
    for (let t = 0; t < ds.T; t++) {
      let col;
      const validB = ds.valid[t * ds.Y + values.yearB - Y0];
      if (view === 'pca') {
        col = validB ? [0, 1, 2].map((q) => 35 + 220 * ((an.coords[t * 3 + q] - lo[q]) / (hi[q] - lo[q] || 1))) : dim;
      } else if (!an.ok[t]) col = dim;
      else if (view === 'score') col = ramp(an.score[t]);
      else {
        const flag = an.score[t] > values.thr, tr = an.truth[t];
        col = flag && tr ? pal.jade : flag ? pal.alarm : tr ? pal.dawn : mix(pal.bg2, pal.bg, 0.3);
      }
      img.data[t * 4] = col[0]; img.data[t * 4 + 1] = col[1]; img.data[t * 4 + 2] = col[2]; img.data[t * 4 + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(off, ox, oy, side, side);
    g.strokeStyle = css3(pal.bg, 0.5);
    g.lineWidth = Math.max(1, dpr * 0.6);
    g.beginPath();
    for (let i = 1; i < K; i++) {
      g.moveTo(ox + i * ts, oy); g.lineTo(ox + i * ts, oy + side);
      g.moveTo(ox, oy + i * ts); g.lineTo(ox + side, oy + i * ts);
    }
    g.stroke();
    // reference patches: small white dots; added tiles: ring
    g.fillStyle = css3(pal.fg, 0.9);
    for (const t of an.refs) {
      g.beginPath();
      g.arc(ox + ((t % K) + 0.5) * ts, oy + (Math.floor(t / K) + 0.5) * ts, Math.max(1.2 * dpr, ts * 0.11), 0, 7);
      g.fill();
    }
    g.strokeStyle = css3(pal.water);
    g.lineWidth = 2 * dpr;
    for (const t of extras) {
      g.beginPath();
      g.arc(ox + ((t % K) + 0.5) * ts, oy + (Math.floor(t / K) + 0.5) * ts, ts * 0.36, 0, 7);
      g.stroke();
    }
    if (sel >= 0) {
      g.strokeStyle = css3(pal.fg);
      g.lineWidth = 2.5 * dpr;
      g.strokeRect(ox + (sel % K) * ts, oy + Math.floor(sel / K) * ts, ts, ts);
      g.strokeStyle = css3(pal.bg);
      g.lineWidth = 1 * dpr;
      g.strokeRect(ox + (sel % K) * ts - 2 * dpr, oy + Math.floor(sel / K) * ts - 2 * dpr, ts + 4 * dpr, ts + 4 * dpr);
    }
    mapLabel.textContent = view === 'score' ? 'Change score (dark = low, gold = high)' : view === 'detect' ? 'Green hit · red false alarm · gold miss' : 'Colour from the first three PCA axes';
    mapC.setAttribute('aria-label', `Map of ${K} by ${K} fictional tiles, ${mapLabel.textContent}, years ${values.yearA} and ${values.yearB}. ${an.metrics.flagged} tiles flagged. Selected tile row ${Math.floor(sel / K) + 1}, column ${(sel % K) + 1}. Arrow keys move the selection; Enter adds it to the reference patches.`);
  }

  function drawScatter() {
    const c = scC, g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (!ds || !an) return;
    const dpr = W / (c.clientWidth || W);
    const ax = values.projection === 'pca13' ? [0, 2] : [0, 1];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const pts = [];
    for (let t = 0; t < ds.T; t++) {
      if (!ds.valid[t * ds.Y + values.yearB - Y0]) continue;
      const px = an.coords[t * 3 + ax[0]], py = an.coords[t * 3 + ax[1]];
      pts.push([t, px, py]);
    }
    for (const r of an.refCoords) pts.push([-1, r[ax[0]], r[ax[1]]]);
    for (const p of pts) { x0 = Math.min(x0, p[1]); x1 = Math.max(x1, p[1]); y0 = Math.min(y0, p[2]); y1 = Math.max(y1, p[2]); }
    if (!pts.length) return;
    const padL = 14 * dpr, padB = 26 * dpr, padT = 14 * dpr, padR = 14 * dpr;
    const sx = (v) => padL + ((v - x0) / (x1 - x0 || 1)) * (W - padL - padR);
    const sy = (v) => H - padB - ((v - y0) / (y1 - y0 || 1)) * (H - padT - padB);
    scGeo = { pts: pts.filter((p) => p[0] >= 0).map((p) => [p[0], sx(p[1]), sy(p[2])]), dpr };
    const r = Math.max(1.8 * dpr, Math.min(W, H) / 130);
    for (const [t, px, py] of scGeo.pts) {
      g.fillStyle = css3(ramp(an.ok[t] ? an.score[t] : 0), 0.85);
      g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
    }
    g.strokeStyle = css3(pal.jade, 0.9);
    g.lineWidth = 1.2 * dpr;
    an.refCoords.forEach((rc) => { g.beginPath(); g.arc(sx(rc[ax[0]]), sy(rc[ax[1]]), r * 1.7, 0, 7); g.stroke(); });
    if (sel >= 0 && ds.valid[sel * ds.Y + values.yearB - Y0]) {
      const px = sx(an.coords[sel * 3 + ax[0]]), py = sy(an.coords[sel * 3 + ax[1]]);
      if (lastKnn) {
        g.strokeStyle = css3(pal.water, 0.9);
        g.lineWidth = 1.5 * dpr;
        for (const n of lastKnn.neighbours) {
          const i = an.refs.indexOf(n.tile);
          if (i < 0) continue;
          const qx = sx(an.refCoords[i][ax[0]]), qy = sy(an.refCoords[i][ax[1]]);
          g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke();
          g.beginPath(); g.arc(qx, qy, r * 2.4, 0, 7); g.stroke();
        }
      }
      g.fillStyle = css3(pal.fg);
      g.beginPath(); g.arc(px, py, r * 2, 0, 7); g.fill();
      g.strokeStyle = css3(pal.bg);
      g.lineWidth = 1.5 * dpr;
      g.stroke();
    }
    const names = values.projection === 'random' ? ['random 1', 'random 2'] : ax.map((i) => `PCA ${i + 1}${an.explained ? ` (${(an.explained[i] * 100).toFixed(0)}%)` : ''}`);
    g.fillStyle = css3(pal.muted);
    g.font = `${11 * dpr}px ${ui.token('--font-data') || 'monospace'}`;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText(`→ ${names[0]}`, padL, H - 8 * dpr);
    g.textAlign = 'right';
    g.fillText(`↑ ${names[1]}`, W - padR, H - 8 * dpr);
    scLabel.textContent = `${values.yearB} tiles on axes fit to ${an.refs.length} reference patches (rings)`;
    scC.setAttribute('aria-label', `Scatter of tiles for ${values.yearB} on two projection axes fit to the reference patches. Tap a point to select its tile. The axes have no physical meaning.`);
  }
  let scGeo = null;

  function drawCharts() {
    if (!ds || !an) return;
    const a = values.yearA - Y0;
    const own = sel >= 0 ? cosineByYear(ds, sel, a) : [];
    const rowsY = YEARS.map((y, i) => [y, own[i] === null || own[i] === undefined ? '—' : own[i], an.medianCos[i] === null ? '—' : an.medianCos[i]]);
    cYears.draw(() => chart.drawLines(cYears.canvas, {
      series: [
        { name: 'selected tile', color: ui.token('--water'), width: 2.5, points: YEARS.map((y, i) => [y, own[i] === null || own[i] === undefined ? NaN : own[i]]) },
        { name: 'median of all tiles', color: ui.token('--muted'), dash: [5, 4], points: YEARS.map((y, i) => [y, an.medianCos[i] === null ? NaN : an.medianCos[i]]) },
      ],
      xLabel: 'year', yLabel: `cosine with ${values.yearA}`, xRange: [Y0, Y1],
    }));
    chart.dataTable(cYears.text, ['year', 'selected tile', 'median, all tiles'], rowsY);
    const stay = [], moved = [];
    for (let t = 0; t < ds.T; t++) if (an.ok[t]) (an.truth[t] ? moved : stay).push(an.score[t]);
    const hk = histogram(stay, 30, 0, 1), hm = histogram(moved, 30, 0, 1);
    cHist.draw(() => chart.drawHistogram(cHist.canvas, {
      series: [
        { lo: 0, hi: 1, counts: hk.counts, color: ui.token('--jade') },
        { lo: 0, hi: 1, counts: hm.counts, color: ui.token('--rose') },
      ],
      xLabel: 'change score', marks: [{ x: values.thr, color: ui.token('--dawn'), label: 'threshold' }],
    }));
    chart.dataTable(cHist.text, ['score from', 'same class (tiles)', 'changed class (tiles)'], hk.counts.map((c, i) => [+(i / 30).toFixed(3), c, hm.counts[i]]), 30);
    drawSweep();
  }

  function drawSweep() {
    if (!sweep) {
      cSweep.draw(() => cSweep.canvas.getContext('2d').clearRect(0, 0, cSweep.canvas.width, cSweep.canvas.height));
      cSweep.text.textContent = sweepState === 'running' ? 'Running.' : 'Not run yet.';
      return;
    }
    const pts = (arr) => sweep.levels.map((l, i) => [l, arr[i] === null ? NaN : arr[i]]);
    cSweep.draw(() => chart.drawLines(cSweep.canvas, {
      series: [
        { name: 'no drift', color: ui.token('--jade'), points: pts(sweep.drift0.f1) },
        { name: 'with drift', color: ui.token('--rose'), points: pts(sweep.driftNow.f1) },
      ],
      xLabel: 'embedding noise', yLabel: 'F1 (green: no drift, red: drift 0.3)', yRange: [0, 1], marks: [{ x: values.noise, color: ui.token('--muted') }],
    }));
    chart.dataTable(cSweep.text, ['noise', 'F1 no drift', 'F1 with drift', 'false alarms no drift', 'false alarms with drift'],
      sweep.levels.map((l, i) => [l, sweep.drift0.f1[i] ?? '—', sweep.driftNow.f1[i] ?? '—', sweep.drift0.fpr[i] ?? '—', sweep.driftNow.fpr[i] ?? '—']));
  }

  // ---- input on the canvases ----
  function select(t) {
    if (t < 0 || !ds || t >= ds.T) return;
    sel = t;
    updateText();
    drawAll();
  }
  mapC.addEventListener('pointerdown', (e) => {
    if (!geo || !ds) return;
    const r = mapC.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * mapC.width, y = ((e.clientY - r.top) / r.height) * mapC.height;
    const cx = Math.floor((x - geo.ox) / geo.ts), cy = Math.floor((y - geo.oy) / geo.ts);
    if (cx >= 0 && cy >= 0 && cx < geo.K && cy < geo.K) select(cy * geo.K + cx);
  });
  scC.addEventListener('pointerdown', (e) => {
    if (!scGeo) return;
    const r = scC.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * scC.width, y = ((e.clientY - r.top) / r.height) * scC.height;
    let best = -1, bd = (24 * scGeo.dpr) ** 2;
    for (const [t, px, py] of scGeo.pts) {
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    if (best >= 0) select(best);
  });
  mapC.addEventListener('keydown', (e) => {
    if (!ds || sel < 0) return;
    const K = ds.K;
    let t = sel;
    if (e.key === 'ArrowLeft' && sel % K > 0) t--;
    else if (e.key === 'ArrowRight' && sel % K < K - 1) t++;
    else if (e.key === 'ArrowUp' && sel >= K) t -= K;
    else if (e.key === 'ArrowDown' && sel < ds.T - K) t += K;
    else if (e.key === 'Enter') {
      if (!extras.includes(sel)) { extras.push(sel); recompute(); }
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    select(t);
  });
  const stops = [ui.fitCanvas(mapC, drawAll), ui.fitCanvas(scC, drawAll)];

  rebuild(true);
  if (!ctx.reducedMotion()) {
    // autoplay once the first build lands
    const wait = setInterval(() => {
      if (an) {
        clearInterval(wait);
        setYearB(Math.min(Y1, values.yearA + 1));
        acc = 0;
        loop.start();
        tp.setRunning(true);
      }
    }, 100);
    ctx.onCleanup(() => clearInterval(wait));
  }

  return {
    getRecord() {
      const m = an ? an.metrics : null;
      const num = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);
      const metrics = an ? [
        { name: 'Tiles flagged', value: m.flagged, unit: 'tiles', note: `${values.yearA} vs ${values.yearB}, threshold ${values.thr}` },
        { name: 'Precision', value: num(m.precision), unit: '' },
        { name: 'Recall', value: num(m.recall), unit: '' },
        { name: 'F1 against seeded truth', value: num(m.f1), unit: '' },
        { name: 'Noise floor, 95th percentile of unchanged tiles', value: num(an.nul.p95), unit: '' },
        { name: 'Median change score, all tiles', value: num(an.medianScore), unit: '' },
        { name: 'Variance share on 3 axes, reference tiles', value: num(an.shareRef), unit: '' },
        { name: 'Variance share on 3 axes, tiles outside the fit', value: num(an.shareHeld), unit: '' },
        { name: 'Missing tile-years', value: an.masked, unit: 'tile-years' },
      ] : [];
      return {
        inputs: { ...values }, seed, metrics,
        diagnostics: { fps: Math.round(loop.fps * 10) / 10, tiles: ds ? ds.T : 0, buildMs: Math.round(buildMs), analyzeMs: Math.round(anMs * 10) / 10, drawMs: Math.round(lastDrawMs * 10) / 10, referenceTiles: an ? an.refs.length : 0, addedTiles: extras.length },
        elapsedMs: buildMs + anMs,
      };
    },
    getTable() {
      if (!ds || !an) return { columns: ['tile'], rows: [] };
      const rows = [];
      for (let t = 0; t < ds.T; t++) {
        const okb = ds.valid[t * ds.Y + values.yearB - Y0];
        rows.push([t, Math.floor(t / ds.K) + 1, (t % ds.K) + 1, an.ok[t] ? an.score[t] : '', an.ok[t] ? (an.score[t] > values.thr ? 1 : 0) : '', an.truth[t], okb ? an.coords[t * 3] : '', okb ? an.coords[t * 3 + 1] : '', okb ? an.coords[t * 3 + 2] : '']);
      }
      return { columns: ['tile', 'row', 'col', 'change_score', 'flagged', 'truth_changed', 'axis1', 'axis2', 'axis3'], rows };
    },
    destroy() {
      clearTimeout(timer);
      loop.stop();
      if (buildJob) buildJob.cancel();
      if (sweepJob) sweepJob.cancel();
      stops.forEach((s) => s());
      cYears.destroy(); cHist.destroy(); cSweep.destroy();
    },
  };
}
