// E02 The Map of Tomorrow (watershed time machine)
import { makeRegion, createSim, summarise, METHOD_VERSION, SILL_M, BOUNDARY_SLOPE, FROUDE_MAX, CURVE_MULTIPLIERS } from '../kernels/e02.js';
import { terrainCanvas, createWaterLayer, drawPanel, cellFromPoint } from '../viz/watershed.js';
import { escapeHTML } from '../core/record.js';

export const meta = {
  id: 'E02',
  title: 'The Map of Tomorrow',
  subtitle: 'watershed time machine',
  priority: 'P0',
  kind: 'simulation',
  dataStatus: 'SYNTHETIC',
  methodVersion: METHOD_VERSION,
  blurb: 'Rain on a fictional valley. The same storm runs twice, side by side: as it is, and with a wetland upstream.',
  inputs: [
    { name: 'stormIntensity_mm_h', label: 'Storm intensity', type: 'range', min: 0, max: 150, step: 1, default: 45, unit: 'mm/h' },
    { name: 'stormDuration_h', label: 'Storm length', type: 'range', min: 0, max: 24, step: 0.5, default: 5, unit: 'h' },
    { name: 'inflow_m3_s', label: 'River flow from upstream', type: 'range', min: 0, max: 60, step: 0.5, default: 4, unit: 'm³/s' },
    { name: 'retentionCapacity_m3', label: 'Wetland basin size', type: 'range', min: 0, max: 2000000, step: 50000, default: 1000000, unit: 'm³' },
    { name: 'interventionRadius_cells', label: 'Wetland radius', type: 'range', min: 1, max: 14, step: 1, default: 7, unit: 'cells', integer: true },
    { name: 'interventionX', label: 'Wetland east–west', type: 'range', min: 0, max: 1, step: 0.01, default: 0.59, unit: 'fraction' },
    { name: 'interventionY', label: 'Wetland north–south', type: 'range', min: 0, max: 1, step: 0.01, default: 0.44, unit: 'fraction' },
    { name: 'imperviousness', label: 'Paved share of the town', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6, unit: 'fraction' },
    { name: 'drainage_mm_h', label: 'Town drain capacity', type: 'range', min: 0, max: 60, step: 1, default: 6, unit: 'mm/h' },
    { name: 'timestep_s', label: 'Timestep', type: 'range', min: 1, max: 60, step: 1, default: 10, unit: 's', integer: true },
    { name: 'simHours', label: 'Hours to simulate', type: 'range', min: 2, max: 48, step: 1, default: 16, unit: 'h', integer: true },
  ],
  outputs: [
    { name: 'hotelPeak', label: 'Hotel peak depth', unit: 'm' },
    { name: 'hotelHours', label: 'Hours above hotel threshold', unit: 'h' },
    { name: 'peakQ', label: 'Peak outflow', unit: 'm³/s' },
  ],
  recordInputs: ['seed', 'grid', 'forcingMultiplier', 'forcingSource'],
  dependencies: ['E04'],
  feeds: ['E03', 'E06', 'E07'],
  seedStrategy: 'The seed builds the terrain, rivers, town, assets and sensor sites. The storm has no randomness: both runs get identical rain.',
  method: `<p>The valley is a ${'96 × 96'} grid of 100 m cells (9.6 km a side), built from the seed: a meandering river, hills, a town near the outlet, farms on the flood plain, forest above. Each cell holds ground height <i>z</i> and water depth <i>h</i>.</p>
<p>Every timestep Δt, in this order:</p>
<p class="eq">1. rain: h += r·Δt over every cell; upstream river flow enters one cell on the north edge
2. losses, each limited by the water present: infiltration (forest 22, farm 11, town soil 8 mm/h, reduced by paving), town drains, and the wetland basin
3. flow: water moves to each lower neighbour by head difference H = z + h</p>
<p>Flow from cell <i>i</i> to neighbour <i>j</i> uses a Manning velocity with a Froude cap, in depth units over one cell:</p>
<p class="eq">v = min( h^(2/3)·√(ΔH/Δx) / n ,  ${FROUDE_MAX}·√(g·h) )
f = min( h·v·Δt/Δx ,  ΔH/2 )</p>
<p>If a cell's outgoing total exceeds its water, every outgoing flux is scaled down to fit. All fluxes are computed from the same state, then applied together, so water moves between cells without being created or lost. Edge cells drain outward at normal depth on a ${BOUNDARY_SLOPE} bed slope.</p>
<p>The wetland is a basin behind a ${SILL_M} m weir: ordinary flow passes; water deeper than the weir spills into one shared basin until it is full. Wetland cells also soak up 15 mm/h more and are rougher (n = 0.15).</p>
<p>The water budget is checked every run: rain + inflow = infiltration + drains + basin + outflow + water on the ground. The residual is shown. If any cell would move water across more than one cell in a step (Courant number above 1), the run stops and says so.</p>
<p>After a run, a storm-size sweep reruns both versions at ${CURVE_MULTIPLIERS.map((m) => '×' + m).join(', ')} of the storm. E03 reads that sweep as its hazard curve.</p>`,
  limitations: [
    'Not a validated hydraulic solver: a diffusive finite-volume sketch with a Froude cap. Fine for comparing two versions of the same fictional valley; not for real flood depths.',
    'A fictional valley with no real terrain, rivers, buildings or people. Its depths describe the made-up valley only and say nothing about a real site.',
    'Uniform rain over the whole valley; real storms move and vary.',
    'Infiltration rates are constant and soils never saturate.',
    'The basin stores water above a fixed weir and never releases it during the run.',
  ],
  provenance: [],
  whoPays: {
    buyer: 'Property developers, infrastructure owners, farms',
    why: 'Site comparison before building: how deep and how long water stands at an asset, with and without a measure.',
    benefit: 'Measurements a buyer agrees to share can improve the shared picture of how water moves in the valley.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E02"].ex-stage { background: var(--bg); }
[data-ex="E02"] .maps { position: relative; flex: 1; min-height: 0; }
[data-ex="E02"] .maps canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
[data-ex="E02"] .clock { position: absolute; left: 50%; bottom: 6px; transform: translateX(-50%); font-family: var(--font-data); font-size: 0.92rem; background: color-mix(in srgb, var(--bg) 80%, transparent); border: 1px solid var(--line); border-radius: 999px; padding: 4px 14px; pointer-events: none; white-space: nowrap; }
[data-ex="E02"] .cmp { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin: 6px 0 10px; }
[data-ex="E02"] .cmp th, [data-ex="E02"] .cmp td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: right; font-variant-numeric: tabular-nums; }
[data-ex="E02"] .cmp th:first-child, [data-ex="E02"] .cmp td:first-child { text-align: left; }
[data-ex="E02"] .cmp thead th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
[data-ex="E02"] .cmp .base { color: var(--base-arm); }
[data-ex="E02"] .cmp .alt { color: var(--alt-arm); }
[data-ex="E02"] .cmp .better { color: var(--jade); font-weight: 700; }
[data-ex="E02"] .cmp .worse { color: var(--danger); font-weight: 700; }
[data-ex="E02"] .sweep { font-size: 0.88rem; }
[data-ex="E02"] progress { width: 100%; accent-color: var(--dawn); }
`;

const HYDRO_KEYS = meta.inputs.map((i) => i.name);

export function mount(slots, ctx) {
  const { h, controlPanel, transport, button, note, sectionTitle, fmt, token, toggle } = ctx.ui;
  const store = ctx.scenario;
  if (ctx.initial) {
    const patch = {};
    for (const k of HYDRO_KEYS) if (typeof ctx.initial.inputs[k] === 'number') patch['hydro.' + k] = ctx.initial.inputs[k];
    if (Number.isInteger(ctx.initial.seed)) patch.seed = ctx.initial.seed;
    try {
      store.patch(patch, 'replay');
    } catch (e) {
      ctx.announce('Replay values rejected: ' + e.message, 'error');
    }
  }
  const values = () => ({ ...store.get().hydro });

  // Stage
  const canvas = h('canvas', { class: 'stage-canvas', role: 'img', tabindex: '0', 'aria-label': 'Two maps of the same fictional valley. Left: as it is. Right: with a wetland. Blue shows standing water; red circles are flooded assets. Click the right map to move the wetland.' });
  const clock = h('div', { class: 'clock', 'aria-live': 'off' });
  const maps = h('div', { class: 'maps' }, canvas, clock);
  const charts = h('div', { class: 'stage-charts' });
  slots.stage.append(maps, charts);
  const chartQ = ctx.chart.chartBox(charts, { title: 'River outflow at the valley mouth (m³/s)', height: 130 });
  const chartH = ctx.chart.chartBox(charts, { title: 'Water at the riverside hotel (m)', height: 130 });

  // State
  let region = null, base = null, alt = null, layerA = null, layerB = null;
  let regionKey = '';
  let running = false;
  let finished = false;
  let playhead = null; // snapshot index when scrubbing
  let simStart = 0, simMs = 0;
  let drops = [];
  let tAnim = 0;
  const dropRng = ctx.rng(store.get().seed, 'rain');

  function build() {
    const s = store.get();
    const key = s.seed + ':' + s.hydro.grid;
    if (key !== regionKey) {
      region = makeRegion(s.seed, s.hydro.grid, s.region.cellSize_m);
      regionKey = key;
      layerA = createWaterLayer(region.N);
      layerB = createWaterLayer(region.N);
      terrainCanvas(region);
    }
    try {
      base = createSim(region, s.hydro, false);
      alt = createSim(region, s.hydro, true);
    } catch (e) {
      ctx.announce(e.message, 'error');
      return;
    }
    finished = false;
    playhead = null;
    simMs = 0;
    scrub.max = String(Math.round(s.hydro.simHours * 4));
    scrub.value = '0';
    sweepState.textContent = '';
    paintAll();
    updateTable();
  }

  // Controls
  const tp = transport({
    seed: store.get().seed,
    running: false,
    stepLabel: '+15 min',
    onToggle: () => setRunning(!running),
    onStep: () => {
      setRunning(false);
      stepSim(Math.round(900 / store.get().hydro.timestep_s));
    },
    onReset: () => {
      setRunning(false);
      build();
    },
    onReplay: () => {
      build();
      setRunning(true);
    },
    onSeed: (sd) => {
      store.set('seed', sd, 'E02');
    },
  });
  slots.controls.append(tp.el);
  const scrubId = 'e02-scrub';
  const scrub = h('input', { type: 'range', id: scrubId, min: 0, max: 64, step: 1, value: 0, 'aria-label': 'Playhead: time in the storm, in 15-minute steps' });
  const scrubLbl = h('label', { for: scrubId }, 'Playhead');
  slots.controls.append(h('div', { class: 'ctl' }, h('div', { class: 'ctl-top' }, scrubLbl, h('span', { class: 'unit' }, 'scrub a finished or paused run')), scrub));
  scrub.addEventListener('input', () => {
    setRunning(false);
    const idx = Number(scrub.value);
    const n = Math.min(base.snaps.length, alt.snaps.length) - 1;
    playhead = Math.min(idx, n);
    paintAll();
  });

  const speedDef = { name: 'speed', label: 'Playback speed', type: 'range', min: 5, max: 240, step: 5, default: ctx.compact ? 150 : 90, unit: 'sim min per s' };
  const local = { speed: speedDef.default };
  const shown = ctx.compact ? meta.inputs.filter((i) => ['stormIntensity_mm_h', 'retentionCapacity_m3'].includes(i.name)) : meta.inputs;
  if (!ctx.compact) slots.controls.append(sectionTitle('Storm and valley'));
  const panel = controlPanel(slots.controls, shown, values(), (name, val) => {
    try {
      store.set('hydro.' + name, val, 'E02');
    } catch (e) {
      ctx.announce(e.message, 'error');
    }
  });
  controlPanel(slots.controls, [speedDef], local, () => {});

  // E04 correction: an explicit, labelled synthetic mapping.
  const corrBox = h('div', {});
  if (!ctx.compact) slots.controls.append(sectionTitle('Observation correction (from E04)'), corrBox);
  function paintCorrection() {
    corrBox.replaceChildren();
    const r = store.getResult('E04');
    const hy = store.get().hydro;
    if (!r) {
      corrBox.append(note('No E04 run yet. Open The Map That Learns and run it to offer a rain correction here.'));
      return;
    }
    const m = Math.min(2, Math.max(0.5, r.data.forcingMultiplier));
    const tg = toggle({ name: 'useE04', label: `Use E04's rain factor ×${fmt(m, 3)} (synthetic mapping)`, help: 'E04 compares its fictional sensors with its background forecast; the ratio of means becomes a multiplier on this storm. Both sides are fictional.' }, hy.forcingSource === 'E04', (on) => {
      store.patch({ 'hydro.forcingMultiplier': on ? m : 1 }, 'E02');
      const next = structuredClone(store.get());
      next.hydro.forcingSource = on ? 'E04' : 'none';
      store.commit(next, { path: 'hydro.forcingSource', source: 'E02' });
    });
    corrBox.append(tg.el);
  }
  paintCorrection();

  // Metrics
  slots.metrics.append(sectionTitle('Today vs with wetland'));
  const table = h('table', { class: 'cmp' });
  slots.metrics.append(table);
  const sweepBox = h('div', { class: 'sweep' });
  const sweepState = h('div', { class: 'small muted', 'aria-live': 'polite' });
  const sweepBtn = button('Run storm-size sweep', () => runSweep(), { kind: 'small', title: 'Reruns both versions at five storm sizes in the background. E03 uses the result.' });
  const prog = h('progress', { max: 1, value: 0, hidden: true });
  if (!ctx.compact) {
    slots.metrics.append(sectionTitle('Storm-size sweep (feeds E03)'), sweepBox);
    sweepBox.append(h('div', { class: 'btnrow' }, sweepBtn), prog, sweepState);
  }
  const perf = h('p', { class: 'small muted' });
  slots.metrics.append(perf);

  function row(label, a, b, unit, digits = 2, lowerIsBetter = true) {
    const d = b - a;
    const cls = !Number.isFinite(d) || Math.abs(d) < 1e-9 ? '' : (d < 0) === lowerIsBetter ? 'better' : 'worse';
    return h('tr', {}, h('td', {}, label, h('span', { class: 'unit' }, unit ? ' ' + unit : '')),
      h('td', { class: 'base' }, fmt(a, digits)), h('td', { class: 'alt' }, fmt(b, digits)),
      h('td', { class: cls }, Number.isFinite(d) ? (d > 0 ? '+' : '') + fmt(d, digits) : '—'));
  }
  function updateTable() {
    if (!base) return;
    const A = base.state, B = alt.state;
    const ba = base.budget(), bb = alt.budget();
    table.replaceChildren(
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Today'), h('th', {}, 'Wetland'), h('th', {}, 'Change'))),
      h('tbody', {},
        row('Hotel peak depth', A.assets[0].maxDepth, B.assets[0].maxDepth, 'm'),
        row('Hotel hours above 0.2 m', A.assets[0].secondsAbove / 3600, B.assets[0].secondsAbove / 3600, 'h', 1),
        row('Farm peak depth', A.assets[1].maxDepth, B.assets[1].maxDepth, 'm'),
        row('Factory peak depth', A.assets[2].maxDepth, B.assets[2].maxDepth, 'm'),
        row('Substation peak depth', A.assets[3].maxDepth, B.assets[3].maxDepth, 'm'),
        row('Peak outflow', A.peakQ, B.peakQ, 'm³/s', 0),
        row('Peak outflow at', A.peakQ_t / 3600, B.peakQ_t / 3600, 'h', 1, false),
        row('Basin stored', 0, bb.stored, 'm³', 0, false),
        row('Soaked into ground', ba.infiltrated, bb.infiltrated, 'm³', 0, false),
        row('Water budget residual', ba.residual, bb.residual, 'm³', 4),
        row('Max Courant number', A.maxCourant, B.maxCourant, '', 2)));
    if (A.failed || B.failed) {
      table.append(h('caption', { class: 'note error' }, A.failed || B.failed));
    }
  }

  // Sweep job
  let sweepHandle = null;
  function runSweep() {
    if (sweepHandle) sweepHandle.cancel();
    const s = store.get();
    const inputHash = store.inputHash('hydro');
    prog.hidden = false;
    prog.value = 0;
    sweepState.textContent = 'Running 5 storm sizes × 2 versions in the background…';
    sweepBtn.disabled = true;
    const t0 = performance.now();
    sweepHandle = ctx.runJob('e02.curve', { seed: s.seed, params: s.hydro, N: s.hydro.grid }, {
      onProgress: (p) => (prog.value = p),
      timeoutMs: 120000,
    });
    sweepHandle.promise.then((r) => {
      store.putResult('E02', { inputHash, data: { curve: r.result.rows, single: base && finished ? summarise(base, alt) : null }, elapsedMs: r.elapsedMs, where: r.where, cached: !!r.cached });
      sweepState.textContent = `Sweep done in ${fmt(r.elapsedMs / 1000, 1)} s (${r.where}${r.cached ? ', reused' : ''}). E03 can now use it.`;
      paintSweep(r.result.rows);
    }).catch((e) => {
      sweepState.textContent = e.cancelled ? 'Sweep cancelled.' : 'Sweep failed: ' + e.message;
      if (!e.cancelled) ctx.announce('Sweep failed: ' + e.message, 'error');
    }).finally(() => {
      prog.hidden = true;
      sweepBtn.disabled = false;
      sweepHandle = null;
    });
  }
  function paintSweep(rows) {
    const t = h('table', { class: 'cmp' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Storm'), h('th', {}, 'Hotel peak today'), h('th', {}, 'With wetland'))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, `${fmt(r.stormIntensity_mm_h, 0)} mm/h`), h('td', { class: 'base' }, fmt(r.baseline.hotelPeak_m, 2) + ' m'), h('td', { class: 'alt' }, fmt(r.intervention.hotelPeak_m, 2) + ' m')))));
    const old = sweepBox.querySelector('table');
    if (old) old.remove();
    sweepBox.append(t);
  }

  // Simulation driving
  function stepSim(k) {
    const t0 = performance.now();
    base.step(k);
    alt.step(k);
    simMs += performance.now() - t0;
    playhead = null;
    if (base.done && alt.done && !finished) {
      finished = true;
      setRunning(false);
      if (base.state.failed || alt.state.failed) ctx.announce(base.state.failed || alt.state.failed, 'error');
      else {
        const sum = summarise(base, alt);
        const prev = store.getResult('E02');
        store.putResult('E02', { inputHash: store.inputHash('hydro'), data: { single: sum, curve: prev && prev.inputHash === store.inputHash('hydro') ? prev.data.curve : null }, elapsedMs: simMs, where: 'main thread' });
        ctx.announce(`Done. Hotel under water ${fmt(sum.baseline.hotelHoursAbove, 1)} h today, ${fmt(sum.intervention.hotelHoursAbove, 1)} h with the wetland.`);
        if (!ctx.compact) runSweep();
      }
    }
    scrub.value = String(Math.min(Number(scrub.max), Math.floor(base.state.t / 900)));
    updateTable();
  }

  function layout() {
    const W = canvas.width, H = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const gap = 10 * dpr;
    const side = W > H * 1.3;
    const lbl = 22 * dpr;
    const size = side ? Math.min((W - 3 * gap) / 2, H - 2 * gap - 28 * dpr) : Math.min(W - 2 * gap, (H - 3 * gap - 28 * dpr - lbl) / 2);
    const top = 34 * dpr;
    if (side) {
      const x0 = (W - (2 * size + gap)) / 2;
      return { dpr, a: { x0, y0: top, size, dpr }, b: { x0: x0 + size + gap, y0: top, size, dpr } };
    }
    const x0 = (W - size) / 2;
    return { dpr, a: { x0, y0: top, size, dpr }, b: { x0, y0: top + size + gap + lbl, size, dpr } };
  }

  function paintAll() {
    if (!base || !canvas.width) return;
    const g = canvas.getContext('2d');
    const L = layout();
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!(L.a.size > 40)) return; // canvas not laid out yet
    const s = store.get().hydro;
    let hA = base.h, hB = alt.h, t = base.state.t, assetsA = base.state.assets, assetsB = alt.state.assets;
    if (playhead !== null && base.snaps[playhead] && alt.snaps[playhead]) {
      hA = base.snaps[playhead].h;
      hB = alt.snaps[playhead].h;
      t = base.snaps[playhead].t;
      const depthAt = (arr) => region.assets.map((a) => ({ depth: arr[a.cell] }));
      assetsA = depthAt(hA);
      assetsB = depthAt(hB);
    }
    layerA.paint(hA);
    layerB.paint(hB);
    const raining = t < s.stormDuration_h * 3600 && s.stormIntensity_mm_h > 0;
    const font = token('--font-display');
    drawPanel(g, region, layerA, { ...L.a, assets: assetsA, rain: raining && running ? 1 : 0, drops, time: tAnim, font });
    const N = region.N;
    const basinFill = s.retentionCapacity_m3 > 0 ? alt.basin.stored / s.retentionCapacity_m3 : 0;
    drawPanel(g, region, layerB, { ...L.b, assets: assetsB, rain: raining && running ? 1 : 0, drops, time: tAnim, font, wet: { cx: s.interventionX * (N - 1), cy: s.interventionY * (N - 1), r: s.interventionRadius_cells, fill: playhead === null ? basinFill : 0 } });
    g.font = `700 ${13 * L.dpr}px ${font}`;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = token('--base-arm');
    g.fillText('TODAY', L.a.x0 + 4 * L.dpr, L.a.y0 - 8 * L.dpr);
    g.fillStyle = token('--alt-arm');
    g.fillText('WITH WETLAND', L.b.x0 + 4 * L.dpr, L.b.y0 - 8 * L.dpr);
    const rainNow = raining ? `raining ${fmt(s.stormIntensity_mm_h * s.forcingMultiplier, 0)} mm/h` : t === 0 ? 'press Run' : 'rain stopped';
    clock.textContent = `t = ${fmt(t / 3600, 2)} h of ${s.simHours} · ${rainNow}${playhead !== null ? ' · scrubbing' : ''}`;
    drawCharts(t);
  }

  function drawCharts(tNow) {
    if (!base) return;
    const sA = base.series, sB = alt.series;
    const cA = token('--base-arm'), cB = token('--alt-arm');
    const mark = [{ x: tNow / 3600, color: token('--muted') }];
    chartQ.draw(() => ctx.chart.drawLines(chartQ.canvas, { series: [{ points: sA.map((r) => [r[0], r[1]]), color: cA }, { points: sB.map((r) => [r[0], r[1]]), color: cB, dash: [5, 3] }], xLabel: 'hours', yZero: true, xRange: [0, store.get().hydro.simHours], marks: mark }));
    chartH.draw(() => ctx.chart.drawLines(chartH.canvas, { series: [{ points: sA.map((r) => [r[0], r[2]]), color: cA }, { points: sB.map((r) => [r[0], r[2]]), color: cB, dash: [5, 3] }], xLabel: 'hours', yZero: true, xRange: [0, store.get().hydro.simHours], marks: [...mark, { y: region.assets[0].threshold_m, label: 'threshold 0.2 m', color: token('--danger') }] })); // stylecheck: allow — CSS token name
    if (finished) {
      const rows = sA.map((r, i) => [r[0], r[1], sB[i] ? sB[i][1] : null, r[2], sB[i] ? sB[i][2] : null]);
      ctx.chart.dataTable(chartQ.text, ['t (h)', 'Q today', 'Q wetland', 'hotel today (m)', 'hotel wetland (m)'], rows, 40);
      ctx.chart.dataTable(chartH.text, ['t (h)', 'Q today', 'Q wetland', 'hotel today (m)', 'hotel wetland (m)'], rows, 40);
    }
  }

  // Direct manipulation: click the wetland map to move the basin. Arrow keys move it too.
  canvas.addEventListener('pointerup', (e) => {
    if (!region) return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const L = layout();
    const c = cellFromPoint(region, L.b, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    if (!c) return;
    const N = region.N;
    store.patch({ 'hydro.interventionX': Math.round((c.x / (N - 1)) * 100) / 100, 'hydro.interventionY': Math.round((c.y / (N - 1)) * 100) / 100 }, 'E02');
    ctx.announce(`Wetland moved to column ${c.x}, row ${c.y}.`, 'quiet');
  });
  canvas.addEventListener('keydown', (e) => {
    const s = store.get().hydro;
    const d = 0.02;
    const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (!mv) return;
    e.preventDefault();
    store.patch({ 'hydro.interventionX': Math.min(1, Math.max(0, Math.round((s.interventionX + mv[0]) * 100) / 100)), 'hydro.interventionY': Math.min(1, Math.max(0, Math.round((s.interventionY + mv[1]) * 100) / 100)) }, 'E02');
  });

  const unsub = store.subscribe((state, change) => {
    if (change.path.startsWith('result:')) {
      if (change.path === 'result:E04') paintCorrection();
      return;
    }
    const was = running;
    panel.setAll(state.hydro);
    tp.setSeed(state.seed);
    if (sweepHandle) sweepHandle.cancel();
    build();
    paintCorrection();
    if (was) setRunning(true);
  });

  ctx.ui.fitCanvas(canvas, () => paintAll());
  const loop = ctx.loop((dt) => {
    tAnim += dt;
    const s = store.get().hydro;
    if (running && base && !base.done) {
      const simSeconds = local.speed * 60 * dt;
      stepSim(Math.max(1, Math.round(simSeconds / s.timestep_s)));
    }
    // Rain streaks drawn from the rain rate: more and faster drops in a heavier storm.
    const raining = base && base.state.t < s.stormDuration_h * 3600 && s.stormIntensity_mm_h > 0 && running;
    const target = raining && !ctx.reducedMotion() ? Math.round(Math.min(220, s.stormIntensity_mm_h * s.forcingMultiplier * 2.5)) : 0;
    while (drops.length < target) drops.push({ x: dropRng.uniform(), y: dropRng.uniform() });
    if (drops.length > target) drops.length = target;
    for (const d of drops) {
      d.y += dt * (0.5 + s.stormIntensity_mm_h / 120);
      d.x -= dt * 0.08;
      if (d.y > 1) {
        d.y = 0;
        d.x = dropRng.uniform();
      }
      if (d.x < 0) d.x += 1;
    }
    paintAll();
    if (Math.round(tAnim * 60) % 30 === 0) perf.textContent = `Rendering ${fmt(loop.fps, 0)} frames/s · ${region ? region.N + '×' + region.N : ''} cells × 2 runs · simulation time used ${fmt(simMs / 1000, 2)} s`;
  });
  function setRunning(r) {
    running = r;
    tp.setRunning(r);
    if (r && base && base.done) {
      build();
    }
  }
  build();
  loop.start();
  if (!ctx.reducedMotion() && (ctx.compact || ctx.initial)) setRunning(true);
  ctx.onCleanup(unsub);

  return {
    getRecord() {
      const s = store.get();
      const sum = summarise(base, alt);
      const m = (name, v, unit, note) => ({ name, value: v, unit, note });
      return {
        inputs: { ...s.hydro, seed: s.seed },
        seed: s.seed,
        metrics: [
          m('Hotel peak depth, today', sum.baseline.hotelPeak_m, 'm'),
          m('Hotel peak depth, with wetland', sum.intervention.hotelPeak_m, 'm'),
          m('Hotel hours above threshold, today', sum.baseline.hotelHoursAbove, 'h', 'threshold 0.2 m'),
          m('Hotel hours above threshold, with wetland', sum.intervention.hotelHoursAbove, 'h', 'threshold 0.2 m'),
          m('Peak outflow, today', sum.baseline.peakQ_m3_s, 'm3/s'),
          m('Peak outflow, with wetland', sum.intervention.peakQ_m3_s, 'm3/s'),
          m('Basin stored', sum.intervention.stored_m3, 'm3'),
          m('Water budget residual, today', sum.baseline.residual_m3, 'm3'),
          m('Water budget residual, with wetland', sum.intervention.residual_m3, 'm3'),
          m('Simulated time reached', base.state.t / 3600, 'h', finished ? 'run finished' : 'run not finished'),
        ],
        diagnostics: { steps: base.state.step, maxCourant: Math.max(base.state.maxCourant, alt.state.maxCourant), failed: base.state.failed || alt.state.failed || '', simWallMs: simMs, fps: loop.fps, grid: region.N },
        elapsedMs: simMs,
        limitations: finished ? [] : ['Exported before the run finished; values are partial.'],
      };
    },
    getTable() {
      const sA = base.series, sB = alt.series;
      return {
        columns: ['t_h', 'outflow_today_m3_s', 'outflow_wetland_m3_s', 'hotel_depth_today_m', 'hotel_depth_wetland_m', 'rain_mm_h'],
        rows: sA.map((r, i) => [r[0], r[1], sB[i] ? sB[i][1] : null, r[2], sB[i] ? sB[i][2] : null, r[3]]),
      };
    },
    getReport() {
      return siteReport(store.get(), summarise(base, alt), finished);
    },
    destroy() {
      if (sweepHandle) sweepHandle.cancel();
    },
  };
}

function siteReport(s, sum, finished) {
  const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const rows = sum.baseline.assets.map((a, i) => {
    const b = sum.intervention.assets[i];
    return `<tr><td>${escapeHTML(a.id)}</td><td>${f(a.threshold_m)}</td><td>${f(a.peak_m)}</td><td>${f(b.peak_m)}</td><td>${f(a.hoursAbove, 1)}</td><td>${f(b.hoursAbove, 1)}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Example site resilience report (fictional)</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 16px;color:#14173d}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccd;padding:4px 6px;text-align:right}td:first-child,th:first-child{text-align:left}.tag{display:inline-block;border:1px solid #b86200;color:#9a5200;border-radius:99px;padding:1px 8px;font-size:12px}</style></head><body>
<p class="tag">SYNTHETIC · fictional valley · example only</p>
<h1>Example site resilience report</h1>
<p>Every number below comes from a simulated storm on a made-up valley and describes that valley only. Run run by ARUN exhibit E02 (method ${escapeHTML(METHOD_VERSION)}), seed ${s.seed}${finished ? '' : ', exported before the run finished'}.</p>
<h2>Storm</h2><p>${f(s.hydro.stormIntensity_mm_h, 0)} mm/h for ${f(s.hydro.stormDuration_h, 1)} h${s.hydro.forcingMultiplier !== 1 ? ` × ${f(s.hydro.forcingMultiplier, 3)} (correction from ${escapeHTML(s.hydro.forcingSource)}, synthetic)` : ''}, river inflow ${f(s.hydro.inflow_m3_s, 1)} m³/s, ${s.hydro.simHours} h simulated.</p>
<h2>Measure compared</h2><p>Wetland basin of ${f(s.hydro.retentionCapacity_m3 / 1000, 0)} thousand m³ behind a 0.25 m weir, radius ${s.hydro.interventionRadius_cells} cells (${s.hydro.interventionRadius_cells * 100} m), at grid position ${f(s.hydro.interventionX)}, ${f(s.hydro.interventionY)}.</p>
<h2>Assets</h2><table><thead><tr><th>Asset</th><th>Threshold (m)</th><th>Peak today (m)</th><th>Peak with wetland (m)</th><th>Hours above, today</th><th>Hours above, wetland</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Valley</h2><p>Peak outflow ${f(sum.baseline.peakQ_m3_s, 0)} m³/s today, ${f(sum.intervention.peakQ_m3_s, 0)} m³/s with the wetland. Basin stored ${f(sum.intervention.stored_m3, 0)} m³. Water budget residual ${f(sum.baseline.residual_m3, 4)} m³ and ${f(sum.intervention.residual_m3, 4)} m³.</p>
<h2>Limits</h2><ul>${meta.limitations.map((l) => `<li>${escapeHTML(l)}</li>`).join('')}</ul>
<p>Generated ${new Date().toISOString()} by ARUN (working name).</p></body></html>`;
}
