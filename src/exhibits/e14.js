import { createSim, streamlines, divergenceMax, LIMITS, DEFAULTS, L_KM, COURANT_LIMIT } from '../kernels/e14.js';

export const meta = {
  id: 'E14',
  title: 'The River of Air',
  subtitle: 'flow and transport',
  priority: 'P1',
  kind: 'simulation',
  dataStatus: 'MATHEMATICAL',
  methodVersion: 'e14-streamfunction-muscl-1.0.0',
  blurb: 'A made-up wind field carries a plume and tracers across a square; mass is counted in and out.',
  inputs: [
    { name: 'amp', label: 'Flow amplitude', type: 'range', min: 0, max: 3, step: 0.05, default: 1, unit: '×', help: 'Multiplies the whole streamfunction.' },
    { name: 'wind_km_h', label: 'Background wind', type: 'range', min: 0, max: 12, step: 0.5, default: 4, unit: 'km/h' },
    { name: 'n_vortices', label: 'Vortices', type: 'range', min: 0, max: 4, step: 1, default: 2, unit: '', integer: true },
    { name: 'vortex_strength_km2_h', label: 'Vortex strength', type: 'range', min: 0, max: 12, step: 0.5, default: 5, unit: 'km²/h' },
    { name: 'meander_km2_h', label: 'Meander', type: 'range', min: 0, max: 8, step: 0.25, default: 1.5, unit: 'km²/h' },
    { name: 'diffusion_km2_h', label: 'Diffusion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.05, unit: 'km²/h' },
    { name: 'source_kg_h', label: 'Source strength', type: 'range', min: 0, max: 1000, step: 10, default: 100, unit: 'kg/h' },
    { name: 't_end_h', label: 'Run time', type: 'range', min: 3, max: 30, step: 1, default: 10, unit: 'h' },
    { name: 'grid_n', label: 'Grid cells per side', type: 'select', default: 96, options: [{ value: 48, label: '48' }, { value: 64, label: '64' }, { value: 96, label: '96' }, { value: 128, label: '128' }] },
    { name: 'unsafe_courant', label: 'Ignore the step limit (Courant 4)', type: 'toggle', default: false },
  ],
  recordInputs: ['source_x_km', 'source_y_km', 'receptor_x_km', 'receptor_y_km'],
  outputs: [
    { name: 'mass_kg', label: 'Mass in domain', unit: 'kg' },
    { name: 'out_kg', label: 'Mass out of domain', unit: 'kg' },
    { name: 'residual_kg', label: 'Budget residual', unit: 'kg' },
    { name: 'median_travel_h', label: 'Median travel time', unit: 'h' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32 streams from the seed: vortex positions, tracer release scatter, random-walk diffusion, streamline starts',
  method: `<p>The flow is a steady streamfunction on a 10 km × 10 km square. Velocity is the rotated gradient, so it has no divergence.</p>
<p class="eq">u = ∂ψ/∂y,  v = −∂ψ/∂x</p>
<p class="eq">ψ = a · [ U₀ y + Σᵢ sᵢ A exp(−|x − xᵢ|² / 2σ²) + w sin(2πx/L) sin(πy/L) ]</p>
<p>a is the amplitude, U₀ the background wind, A the vortex strength, σ the vortex radius (1.2 km), w the meander. Vortex centres come from the seed and alternate in sign.</p>
<p><b>Tracers.</b> Each tracer moves by the midpoint rule (RK2): x* = x + ½Δt·v(x), x ← x + Δt·v(x*). Diffusion adds a random step of size √(2DΔt) per axis. A source releases 500 tracers per hour. Travel time is the first entry into the receptor disc minus the release time.</p>
<p><b>Scalar on a grid.</b> Concentration q (kg/km²) follows</p>
<p class="eq">∂q/∂t + ∇·(vq) = D∇²q + S</p>
<p>Face fluxes are differences of ψ at cell corners, so the discrete divergence of every cell is zero to rounding. Face values use a minmod-limited linear reconstruction (MUSCL) from the upwind side, first order next to the boundary. Time stepping is SSP-RK2 (Heun). Diffusion is the five-point stencil, explicit.</p>
<p><b>Substeps.</b> Δt ≤ ${COURANT_LIMIT}/max(outflow rate per cell) and Δt ≤ 0.9 Δx²/(4D). One frame may use at most 600 substeps; beyond that the run stops and says so. The toggle sets the Courant number to 4: the scheme goes unstable, concentration turns negative and the run stops with the reason.</p>
<p><b>Boundary.</b> Open on all four sides. Inflow carries zero concentration. Outflow leaves with the upwind cell value. The budget is q-mass + mass out − mass released − initial mass; it closes to rounding because every flux is counted once on each side.</p>
<p><b>Numerical diffusion.</b> The limiter keeps the scheme from adding much smoothing in smooth regions, and it still smears sharp edges over a few cells.</p>`,
  limitations: [
    'An educational field made from formulas. It is not a wind forecast and not dispersion advice.',
    'Two dimensions, steady flow, no buoyancy, no terrain, no chemistry, constant diffusion.',
    'Tracers and grid use the same field but different diffusion methods; they agree on average, not point by point.',
    'First-order treatment next to the boundary, and the plume smears over a few cells at sharp edges.',
  ],
  provenance: [],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E14"] .river-wrap { position: relative; flex: 1; min-height: 0; background: var(--bg); }
[data-ex="E14"] .river-wrap canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
[data-ex="E14"] .river-wrap canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
[data-ex="E14"] .river-halt { position: absolute; left: 12px; right: 12px; top: 12px; padding: 10px 14px; border: 1px solid var(--danger); border-radius: var(--r-m); background: color-mix(in srgb, var(--bg) 88%, var(--danger)); font-weight: 700; } /* stylecheck: allow — CSS token name */
[data-ex="E14"] .river-clock { position: absolute; right: 12px; top: 10px; font-family: var(--font-data); font-size: 0.9rem; padding: 4px 10px; border-radius: 999px; background: color-mix(in srgb, var(--bg) 70%, transparent); pointer-events: none; }
[data-ex="E14"] .ex-metrics .chartbox { margin-top: 8px; }
`;

const WARM_H = 2;
const SIM_H_PER_S = 1;

function parseColor(ctx2, c) {
  ctx2.fillStyle = '#000';
  ctx2.fillStyle = c;
  const s = ctx2.fillStyle;
  if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const m = s.match(/[\d.]+/g) || [200, 200, 200];
  return [+m[0], +m[1], +m[2]];
}

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const init = ctx.initial || {};
  const values = {};
  for (const d of meta.inputs) values[d.name] = init.inputs && init.inputs[d.name] !== undefined ? init.inputs[d.name] : d.default;
  let seed = Number.isInteger(init.seed) ? init.seed : 14;
  let src = [init.inputs?.source_x_km ?? DEFAULTS.source[0], init.inputs?.source_y_km ?? DEFAULTS.source[1]];
  let rec = [init.inputs?.receptor_x_km ?? DEFAULTS.receptor[0], init.inputs?.receptor_y_km ?? DEFAULTS.receptor[1]];
  let placeMode = 'source';
  let sim = null, lines = [], warming = false, running = false, ended = false, fpsNote = 0;
  let qref = 1;
  let t0 = performance.now();

  // ---- stage
  const canvas = h('canvas', { class: 'stage-canvas', tabindex: '0', role: 'img', 'aria-label': 'Plan view of a 10 by 10 kilometre square. Colour shows scalar concentration from a point source, dots are tracers, thin lines are streamlines. Tap to move the source or the receptor. Arrow keys move the chosen marker.' });
  const banner = h('div', { class: 'river-halt', role: 'alert', hidden: true });
  const clock = h('div', { class: 'river-clock' }, 't = 0 h');
  const legend = h('div', { class: 'stage-legend' },
    h('span', {}, h('i', { class: 'sw', style: { background: ui.token('--dawn') } }), 'scalar'),
    h('span', {}, h('i', { class: 'sw', style: { background: ui.token('--water') } }), 'tracer (young to old)'),
    h('span', {}, h('i', { class: 'sw', style: { background: 'transparent', border: '2px solid ' + ui.token('--jade') } }), 'receptor'),
    h('span', {}, h('i', { class: 'sw', style: { background: 'transparent', border: '2px solid ' + ui.token('--rose') } }), 'source'));
  const wrap = h('div', { class: 'river-wrap' }, canvas, banner, clock, legend);
  slots.stage.append(wrap);
  const cx = canvas.getContext('2d');
  const grid = document.createElement('canvas');
  const streamLayer = document.createElement('canvas');
  const trail = document.createElement('canvas');
  let W = 1, H = 1, S = 1, ox = 0, oy = 0, lut = null, colors = {};
  const X = (x) => ox + (x / L_KM) * S;
  const Y = (y) => oy + (1 - y / L_KM) * S;

  function refreshColors() {
    const c2 = document.createElement('canvas').getContext('2d');
    colors = { dawn: parseColor(c2, ui.token('--dawn')), rose: parseColor(c2, ui.token('--rose')), violet: parseColor(c2, ui.token('--violet')), water: parseColor(c2, ui.token('--water')), gold: parseColor(c2, ui.token('--gold-fill')), fg: ui.token('--fg'), jade: ui.token('--jade'), roseS: ui.token('--rose') };
    lut = new Uint8ClampedArray(256 * 4);
    const stops = [[0, null], [0.12, colors.violet], [0.4, colors.rose], [0.72, colors.dawn], [1, colors.gold]];
    for (let i = 0; i < 256; i++) {
      const f = i / 255;
      let k = 1;
      while (k < stops.length - 1 && f > stops[k][0]) k++;
      const [f0, c0] = stops[k - 1], [f1, c1] = stops[k];
      const u = (f - f0) / (f1 - f0);
      const a = c0 || c1;
      const rgb = [0, 1, 2].map((j) => Math.round(a[j] + ((c1[j] - a[j]) * u)));
      lut[i * 4] = rgb[0]; lut[i * 4 + 1] = rgb[1]; lut[i * 4 + 2] = rgb[2];
      lut[i * 4 + 3] = Math.round(255 * Math.min(1, f * 5.5 + (i > 0 ? 0.06 : 0)) * 0.95);
    }
  }

  function drawStreams() {
    streamLayer.width = W; streamLayer.height = H;
    const g = streamLayer.getContext('2d');
    g.strokeStyle = ui.token('--fg');
    g.globalAlpha = 0.16;
    g.lineWidth = Math.max(1, W / 900);
    for (const ln of lines) {
      g.beginPath();
      ln.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.stroke();
    }
  }

  function drawTracers(fade) {
    const g = trail.getContext('2d');
    if (fade) {
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
    const s = sim.snapshot();
    const dot = Math.max(2, Math.round(S / 260));
    for (let k = 0; k < s.nt; k++) {
      if (!s.alive[k]) continue;
      const age = Math.min(1, (s.t - s.rel[k]) / 8);
      const c0 = colors.water, c1 = colors.violet;
      g.fillStyle = `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * age)},${Math.round(c0[1] + (c1[1] - c0[1]) * age)},${Math.round(c0[2] + (c1[2] - c0[2]) * age)})`;
      g.fillRect(X(s.px[k]) - dot / 2, Y(s.py[k]) - dot / 2, dot, dot);
    }
  }

  function draw() {
    if (!sim || !lut) return;
    const s = sim.snapshot(), n = s.n;
    let qmax = 0;
    for (let c = 0; c < n * n; c++) if (s.q[c] > qmax) qmax = s.q[c];
    qref = Math.max(qmax, qref * 0.995, 1e-9);
    grid.width = n; grid.height = n;
    const g = grid.getContext('2d');
    const img = g.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = Math.sqrt(Math.max(0, s.q[j * n + i]) / qref);
      const li = Math.min(255, Math.round(v * 255)) * 4;
      const o = ((n - 1 - j) * n + i) * 4;
      img.data[o] = lut[li]; img.data[o + 1] = lut[li + 1]; img.data[o + 2] = lut[li + 2]; img.data[o + 3] = lut[li + 3];
    }
    g.putImageData(img, 0, 0);
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = ui.token('--bg-2');
    cx.fillRect(ox, oy, S, S);
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(grid, ox, oy, S, S);
    cx.drawImage(streamLayer, 0, 0);
    cx.drawImage(trail, 0, 0);
    cx.strokeStyle = ui.token('--line');
    cx.lineWidth = 1;
    cx.strokeRect(ox + 0.5, oy + 0.5, S - 1, S - 1);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // receptor ring
    cx.lineWidth = 2.5 * dpr;
    cx.strokeStyle = colors.jade;
    cx.beginPath();
    cx.arc(X(rec[0]), Y(rec[1]), (DEFAULTS.receptor_r_km / L_KM) * S, 0, 2 * Math.PI);
    cx.stroke();
    // source: ring pulses with simulated time
    const ph = (sim.t * 1.5) % 1;
    cx.strokeStyle = colors.roseS;
    cx.beginPath();
    cx.arc(X(src[0]), Y(src[1]), 5 * dpr, 0, 2 * Math.PI);
    cx.stroke();
    cx.globalAlpha = 1 - ph;
    cx.beginPath();
    cx.arc(X(src[0]), Y(src[1]), (5 + 16 * ph) * dpr, 0, 2 * Math.PI);
    cx.stroke();
    cx.globalAlpha = 1;
    clock.textContent = `t = ${ui.fmt(sim.t, 2)} h${warming ? ' (warming up)' : ''}`;
  }

  refreshColors();
  ui.fitCanvas(canvas, (w, hh) => {
    W = w; H = hh;
    S = Math.min(w, hh); ox = Math.round((w - S) / 2); oy = Math.round((hh - S) / 2);
    trail.width = w; trail.height = hh;
    refreshColors();
    drawStreams();
    if (sim) { drawTracers(false); draw(); }
  });

  // ---- panel
  const panel = h('div', {});
  slots.controls.append(panel);
  const tp = ui.transport({
    seed, running: false, stepLabel: 'Step 0.25 h',
    onToggle: () => (running ? pause() : play()),
    onStep: () => { pause(); if (!sim.halted) { sim.step(0.25); after(); } },
    onReset: () => { rebuild(); },
    onReplay: () => { rebuild(true); },
    onSeed: (v) => { seed = v; tp.setSeed(v); rebuild(); },
  });
  panel.append(tp.el);
  const modeSeg = ui.segmented({ name: 'place', label: 'Tap the map to move the', options: [{ value: 'source', label: 'Source' }, { value: 'receptor', label: 'Receptor' }] }, 'source', (v) => { placeMode = v; });
  panel.append(modeSeg.el);
  const ctl = ui.controlPanel(panel, meta.inputs, values, () => scheduleRebuild());
  const presets = h('div', { class: 'btnrow' },
    ui.button('Swirl', () => preset({ n_vortices: 4, vortex_strength_km2_h: 9, wind_km_h: 2, meander_km2_h: 2 }), { kind: 'small' }),
    ui.button('Steady wind', () => preset({ n_vortices: 0, vortex_strength_km2_h: 0, meander_km2_h: 0, wind_km_h: 5, diffusion_km2_h: 0.02 }), { kind: 'small' }),
    ui.button('Break the scheme', () => preset({ unsafe_courant: true, wind_km_h: 8 }), { kind: 'small' }));
  panel.append(ui.sectionTitle('Presets'), presets);

  const tiles = ui.metricGrid(slots.metrics, [
    { name: 'mass', label: 'Mass in domain', unit: 'kg', digits: 1 },
    { name: 'released', label: 'Released', unit: 'kg', digits: 1 },
    { name: 'out', label: 'Left the domain', unit: 'kg', digits: 1 },
    { name: 'resid', label: 'Budget residual', unit: 'kg', digits: 3 },
    { name: 'ret', label: 'Retention', pct: true, unit: 'of released' },
    { name: 'flux', label: 'Outflow flux', unit: 'kg/h', digits: 1 },
    { name: 'rcpt', label: 'Receptor concentration', unit: 'kg/km²', digits: 2 },
    { name: 'arr', label: 'Tracers arrived', pct: true, unit: 'at receptor' },
    { name: 'tmed', label: 'Median travel time', unit: 'h', digits: 2 },
    { name: 'tp90', label: '90th percentile travel', unit: 'h', digits: 2 },
    { name: 'sub', label: 'Substeps per frame', unit: '', digits: 0 },
    { name: 'cfl', label: 'Courant number', unit: 'limit 0.4', digits: 2 },
    { name: 'vmax', label: 'Peak speed', unit: 'km/h', digits: 1 },
    { name: 'div', label: 'Largest |∇·v|', unit: '1/h', digits: 2 },
  ]);
  const cBudget = chart.chartBox(slots.metrics, { title: 'Mass budget (kg)', height: 150 });
  const cFlux = chart.chartBox(slots.metrics, { title: 'Outflow flux (kg/h)', height: 130 });
  const cRec = chart.chartBox(slots.metrics, { title: 'Receptor concentration (kg/km²)', height: 130 });
  const cTT = chart.chartBox(slots.metrics, { title: 'Travel time to the receptor (tracers, h)', height: 140 });

  function drawCharts() {
    if (!sim) return;
    const hist = sim.snapshot().history;
    const pts = (f) => hist.map((r) => [r.t, f(r)]);
    cBudget.draw(() => chart.drawLines(cBudget.canvas, { xLabel: 'h', yZero: true, series: [
      { name: 'in domain', points: pts((r) => r.mass), color: ui.token('--water') },
      { name: 'released', points: pts((r) => r.released), color: ui.token('--dawn'), dash: [5, 4] },
      { name: 'left domain', points: pts((r) => r.out), color: ui.token('--rose') },
      { name: 'in domain + left', points: pts((r) => r.mass + r.out), color: ui.token('--jade'), dash: [2, 3], width: 1.5 }] }));
    chart.dataTable(cBudget.text, ['t (h)', 'in domain', 'released', 'left'], hist.map((r) => [r.t, r.mass, r.released, r.out]), 24);
    cFlux.draw(() => chart.drawLines(cFlux.canvas, { xLabel: 'h', yZero: true, series: [{ name: 'flux', points: pts((r) => r.flux), color: ui.token('--rose') }] }));
    chart.dataTable(cFlux.text, ['t (h)', 'flux kg/h'], hist.map((r) => [r.t, r.flux]), 24);
    cRec.draw(() => chart.drawLines(cRec.canvas, { xLabel: 'h', yZero: true, series: [{ name: 'receptor', points: pts((r) => r.receptor), color: ui.token('--jade') }] }));
    chart.dataTable(cRec.text, ['t (h)', 'kg/km²'], hist.map((r) => [r.t, r.receptor]), 24);
    const s = sim.snapshot();
    const tt = [];
    for (let k = 0; k < s.nt; k++) if (Number.isFinite(s.arr[k])) tt.push(s.arr[k]);
    const hi = Math.max(1, ...tt) * 1.02, bins = 16, counts = new Array(bins).fill(0);
    for (const v of tt) counts[Math.min(bins - 1, Math.floor((v / hi) * bins))]++;
    cTT.draw(() => chart.drawHistogram(cTT.canvas, { xLabel: 'h', series: [{ lo: 0, hi, counts, color: ui.token('--water') }], marks: tt.length ? [{ x: sim.diagnostics().tt.median, label: 'median', color: ui.token('--dawn') }] : [] }));
    chart.dataTable(cTT.text, ['from h', 'to h', 'tracers'], counts.map((c, i) => [(i * hi) / bins, ((i + 1) * hi) / bins, c]), 20);
  }

  function updateMetrics() {
    const d = sim.diagnostics();
    tiles.set('mass', d.mass_kg); tiles.set('released', d.released_kg); tiles.set('out', d.out_kg);
    const relRes = Math.abs(d.residual_kg) / Math.max(1, d.released_kg);
    tiles.set('resid', d.residual_kg, { tone: relRes < 1e-9 ? 'good' : 'bad' });
    tiles.set('ret', d.retention); tiles.set('flux', d.outflow_kg_h); tiles.set('rcpt', d.receptor_kg_km2);
    tiles.set('arr', d.arrivedFraction);
    tiles.set('tmed', d.tt.median, { text: d.tt.n ? undefined : '—' });
    tiles.set('tp90', d.tt.p90, { text: d.tt.n ? undefined : '—' });
    tiles.set('sub', d.substeps);
    tiles.set('cfl', d.courant, { tone: d.courant > d.courantLimit + 1e-9 ? 'bad' : '' });
    tiles.set('vmax', d.maxSpeed_km_h);
    tiles.set('div', divAnalytic);
  }
  let divAnalytic = 0;

  function after() {
    if (sim.halted) {
      banner.hidden = false;
      banner.textContent = 'Run stopped: ' + sim.halted + '.';
      pause();
      ctx.announce('E14 stopped: ' + sim.halted, 'error');
    }
    drawTracers(true);
    draw();
    updateMetrics();
  }

  // ---- control flow
  let dirty = null;
  function scheduleRebuild() {
    clearTimeout(dirty);
    dirty = setTimeout(() => rebuild(), 120);
  }
  function preset(p) {
    const full = {};
    for (const d of meta.inputs) full[d.name] = d.default;
    Object.assign(full, p);
    ctl.setAll(full);
    Object.assign(values, full);
    rebuild();
  }
  function config() {
    return {
      ...DEFAULTS, amp: values.amp, wind_km_h: values.wind_km_h, n_vortices: values.n_vortices,
      vortex_strength_km2_h: values.vortex_strength_km2_h, meander_km2_h: values.meander_km2_h,
      diffusion_km2_h: values.diffusion_km2_h, source_kg_h: values.source_kg_h, grid_n: Number(values.grid_n),
      unsafe_courant: !!values.unsafe_courant, source: src.slice(), receptor: rec.slice(),
    };
  }
  const loop = ctx.loop((dt) => {
    if (!sim) return;
    let frameH = running ? Math.min(0.05, dt) * SIM_H_PER_S : 0;
    if (warming) {
      const tStart = performance.now();
      while (sim.t < WARM_H && !sim.halted && performance.now() - tStart < 10) sim.step(0.02);
      if (sim.t >= WARM_H - 1e-9 || sim.halted) {
        warming = false;
        if (!sim.halted && !ctx.reducedMotion() && autoplay) { autoplay = false; play(); }
      }
    } else if (running) {
      if (sim.t + frameH >= values.t_end_h) { frameH = values.t_end_h - sim.t; ended = true; }
      if (frameH > 0) sim.step(frameH);
    }
    if (ended) { pause(); ctx.announce(`Reached ${values.t_end_h} h.`); }
    after();
    const now = performance.now();
    if (now - t0 > 250 || !loop.running) { drawCharts(); t0 = now; }
    fpsNote = loop.fps || fpsNote;
  });
  let autoplay = !ctx.reducedMotion();
  function play() {
    if (sim.halted) return;
    if (sim.t >= values.t_end_h - 1e-9) { rebuild(); autoplay = true; return; }
    running = true; ended = false; tp.setRunning(true);
    loop.start();
  }
  function pause() {
    running = false; tp.setRunning(false);
    if (!warming) { loop.stop(); drawCharts(); }
  }
  function rebuild(replay) {
    clearTimeout(dirty);
    banner.hidden = true;
    ended = false;
    try {
      sim = createSim(config(), seed);
    } catch (e) {
      sim = null;
      banner.hidden = false; banner.textContent = 'Cannot start: ' + e.message;
      ctx.announce(e.message, 'error');
      return;
    }
    lines = streamlines(sim.field, seed);
    divAnalytic = divergenceMax(sim.field);
    drawStreams();
    trail.getContext('2d').clearRect(0, 0, trail.width, trail.height);
    qref = 1e-9;
    warming = true; running = false; tp.setRunning(false);
    autoplay = replay || !ctx.reducedMotion() ? true : false;
    if (ctx.reducedMotion()) autoplay = false;
    loop.start();
  }

  function place(x, y) {
    x = Math.max(0, Math.min(L_KM, x)); y = Math.max(0, Math.min(L_KM, y));
    if (placeMode === 'source') src = [x, y]; else rec = [x, y];
    const was = running;
    rebuild();
    if (was) autoplay = true;
  }
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    const x = ((px - ox) / S) * L_KM, y = (1 - (py - oy) / S) * L_KM;
    if (x < 0 || x > L_KM || y < 0 || y > L_KM) return;
    place(x, y);
  });
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 1 : 0.25;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const p = placeMode === 'source' ? src : rec;
    place(p[0] + d[0], p[1] + d[1]);
  });

  rebuild();

  return {
    getRecord() {
      const d = sim.diagnostics();
      const nv = (v) => (Number.isFinite(v) ? v : 0);
      return {
        inputs: { ...values, source_x_km: src[0], source_y_km: src[1], receptor_x_km: rec[0], receptor_y_km: rec[1] },
        seed,
        metrics: [
          { name: 'Mass in domain', value: d.mass_kg, unit: 'kg', note: `t = ${ui.fmt(d.t, 2)} h` },
          { name: 'Released', value: d.released_kg, unit: 'kg' },
          { name: 'Mass out of domain', value: d.out_kg, unit: 'kg' },
          { name: 'Budget residual', value: d.residual_kg, unit: 'kg' },
          { name: 'Retention', value: nv(d.retention), unit: 'fraction' },
          { name: 'Outflow flux', value: d.outflow_kg_h, unit: 'kg/h' },
          { name: 'Receptor concentration', value: d.receptor_kg_km2, unit: 'kg/km2' },
          { name: 'Tracers arrived', value: nv(d.arrivedFraction), unit: 'fraction' },
          { name: 'Median travel time', value: nv(d.tt.median), unit: 'h', note: d.tt.n ? `${d.tt.n} tracers` : 'none arrived' },
          { name: 'Courant number', value: d.courant, unit: '' },
          { name: 'Largest analytic divergence', value: divAnalytic, unit: '1/h' },
        ],
        diagnostics: { substeps_last_frame: d.substeps, tracers: d.tracers, fps: Math.round((loop.fps || fpsNote) * 10) / 10, halted: d.halted || 'no', dt_h: d.dt_h },
        elapsedMs: Math.round(performance.now() - t0),
      };
    },
    getTable() {
      return { columns: ['t_h', 'domain_kg', 'released_kg', 'out_kg', 'outflow_kg_h', 'receptor_kg_km2'], rows: sim.snapshot().history.map((r) => [r.t, r.mass, r.released, r.out, r.flux, r.receptor]) };
    },
    destroy() { clearTimeout(dirty); loop.stop(); },
  };
}
