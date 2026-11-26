// E08 Pattern Garden: Gray–Scott reaction–diffusion. The kernel in ../kernels/e08.js does the maths; this file draws it.
import { createSim, stabilityNumber, BLOWUP } from '../kernels/e08.js';

const PRESETS = {
  mitosis: { label: 'Spots that split', F: 0.0367, k: 0.0649, ratio: 2, dt: 1 },
  coral: { label: 'Coral', F: 0.0545, k: 0.062, ratio: 2, dt: 1 },
  maze: { label: 'Maze', F: 0.029, k: 0.057, ratio: 2, dt: 1 },
  skate: { label: 'Gliding islands', F: 0.062, k: 0.0609, ratio: 2, dt: 1 },
  starved: { label: 'Starved: v dies out', F: 0.08, k: 0.07, ratio: 2, dt: 1 },
  unstable: { label: 'Step too large (breaks the method)', F: 0.0367, k: 0.0649, ratio: 3, dt: 3.2 },
};
const TONE_MID = 'warn'; // stylecheck: allow — the value the metric tile CSS reads
const VMAX = 0.42; // colour scale: v = 0 is the background, v = 0.42 the top of the ramp

export const meta = {
  id: 'E08',
  title: 'Pattern Garden',
  subtitle: 'reaction–diffusion',
  priority: 'P1',
  kind: 'simulation',
  dataStatus: 'MATHEMATICAL',
  methodVersion: 'e08-gray-scott-1.0.0',
  blurb: 'Two chemicals react and spread until spots, stripes and mazes appear.',
  inputs: [
    { name: 'preset', label: 'Preset', type: 'select', default: 'mitosis', options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })) },
    { name: 'F', label: 'Feed rate F', type: 'range', min: 0.01, max: 0.09, step: 0.0005, default: 0.0367, unit: '1/time', help: 'How fast u is topped up and both are washed out.' },
    { name: 'k', label: 'Kill rate k', type: 'range', min: 0.04, max: 0.075, step: 0.0005, default: 0.0649, unit: '1/time', help: 'How fast v is removed.' },
    { name: 'ratio', label: 'Diffusion ratio Du / Dv', type: 'range', min: 1, max: 4, step: 0.05, default: 2, unit: '', help: 'Dv is 0.08; u spreads this many times faster.' },
    { name: 'dt', label: 'Time step dt', type: 'range', min: 0.1, max: 3.5, step: 0.05, default: 1, unit: 'time', help: 'The explicit step is stable while max(Du, Dv)·dt ≤ 0.25.' },
    { name: 'steps', label: 'Steps per frame', type: 'range', min: 1, max: 60, step: 1, default: 12, unit: 'steps', integer: true },
    { name: 'N', label: 'Grid', type: 'select', numeric: true, default: 128, options: [64, 96, 128, 160].map((n) => ({ value: n, label: `${n} × ${n}` })) },
  ],
  outputs: [
    { name: 'meanV', label: 'Mean v', unit: '' },
    { name: 'varV', label: 'Variance of v', unit: '' },
    { name: 'maxV', label: 'Maximum v', unit: '' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32 from the seed. Eight square patches are placed at seeded random cells with seeded noise on top. Planting by click is not drawn from the seed.',
  method: `<p>Two concentrations, <em>u</em> and <em>v</em>, live on a square grid with periodic edges (the left edge touches the right, the top touches the bottom). Each cell changes by diffusion and by a reaction.</p>
<p class="eq">∂u/∂t = Dᵤ ∇²u − u v² + F (1 − u)</p>
<p class="eq">∂v/∂t = Dᵥ ∇²v + u v² − (F + k) v</p>
<p>Here u v² is the reaction: one u and two v make three v. F feeds u in and washes both out. k removes v.</p>
<p><strong>Scheme.</strong> Forward Euler in time and the five-point Laplacian in space with grid spacing 1: ∇²u at a cell is the sum of its four neighbours minus four times itself. Dᵥ is 0.08 and Dᵤ is the ratio times 0.08.</p>
<p><strong>Time step.</strong> The diffusion part is stable while max(Dᵤ, Dᵥ)·dt ≤ 1/4. The page shows that number. The reaction part is checked separately: the kernel compares a uniform grid with a fine RK4 solution of the reaction equations alone, and checks that one diffusion mode decays at the exact discrete rate. When a field leaves ±${BLOWUP}, the run stops and says so. The last state stays on screen with colours clipped.</p>
<p><strong>Start.</strong> u = 1 and v = 0 everywhere, plus eight patches (u = ½, v = ¼) at seeded positions. A click or tap writes the same patch where you point.</p>
<p><strong>Colours.</strong> The picture shows v. Black-blue is v = 0 and the top of the ramp is v = ${VMAX}. Values outside that range are clipped and the legend says so. The pattern repeats around the centre tile in dimmer copies to show the wrap.</p>
<p><strong>Charts.</strong> Variance of v measures how patterned the grid is: a uniform field has variance 0. Mean v is the amount of v present. The histogram counts cells by v.</p>`,
  limitations: [
    'A mathematical toy. It predicts nothing about animal coats, ecosystems, cities or people.',
    'Forward Euler is first order in dt. Patterns drawn with a large dt differ in detail from patterns at a small dt.',
    'The grid is periodic with spacing 1, so pattern size is fixed by D, F and k, not by the screen.',
    'Patterns depend on the seed and on where you plant. Two runs with different seeds show the same kind of pattern in different places.',
  ],
  provenance: [],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E08"] .e08-hint { position: absolute; left: 10px; top: 10px; max-width: calc(100% - 20px); padding: 5px 12px; border-radius: 999px; font-size: 0.85rem; background: color-mix(in srgb, var(--bg) 72%, transparent); color: var(--fg); pointer-events: none; }
[data-ex="E08"] .e08-legend { position: absolute; left: 10px; bottom: 10px; display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: var(--r-s); font-size: 0.8rem; font-family: var(--font-data); background: color-mix(in srgb, var(--bg) 72%, transparent); pointer-events: none; max-width: calc(100% - 20px); }
[data-ex="E08"] .e08-ramp { width: 90px; height: 10px; border-radius: 5px; border: 1px solid var(--line); flex: none; }
[data-ex="E08"] .e08-banner { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100% - 28px)); padding: 14px 16px; border-radius: var(--r-m); border: 1px solid var(--danger); /* stylecheck: allow — CSS token name */ background: color-mix(in srgb, var(--bg) 88%, transparent); box-shadow: var(--shadow); }
[data-ex="E08"] .e08-banner[hidden] { display: none; }
[data-ex="E08"] canvas.stage-canvas { cursor: crosshair; }
[data-ex="E08"] canvas.stage-canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
`;

function parseRGB(css, scratch) {
  const c = scratch.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, 1, 1);
  c.fillStyle = '#000';
  c.fillStyle = css;
  c.fillRect(0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

function watchTheme(cb) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', cb);
  return () => {
    mo.disconnect();
    if (mq && mq.removeEventListener) mq.removeEventListener('change', cb);
  };
}

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const init = ctx.initial;
  const vals = { preset: 'mitosis', ...Object.fromEntries(meta.inputs.filter((i) => i.name !== 'preset').map((i) => [i.name, i.default])), ...(init ? init.inputs : {}) };
  let seed = init ? init.seed : 8;
  let sim = null;
  let history = [];
  let sampleEvery = 20; // steps between chart samples
  let baseline = null;
  let plantCount = 0;
  let cursor = { x: 64, y: 64 };
  let stepsEff = 0;
  let startedAt = performance.now();
  let frameNo = 0;
  let clipped = false;
  let failedMsg = null;

  // ----- stage -----
  const canvas = h('canvas', { class: 'stage-canvas', tabindex: '0', role: 'img', 'aria-label': 'Reaction–diffusion field. Click or tap to plant a patch of v. Arrow keys move a cursor; Enter plants.' });
  const hint = h('div', { class: 'e08-hint' }, 'Tap or drag to plant a spot');
  const rampBar = h('div', { class: 'e08-ramp', 'aria-hidden': 'true' });
  const legendText = h('span', {}, `v 0 → ${VMAX}`);
  const legend = h('div', { class: 'e08-legend' }, rampBar, legendText);
  const banner = h('div', { class: 'e08-banner', role: 'alert', hidden: true });
  slots.stage.append(canvas, hint, legend, banner);
  const scratch = document.createElement('canvas');
  scratch.width = scratch.height = 1;
  const off = document.createElement('canvas');
  const g = canvas.getContext('2d');
  let lut = new Uint32Array(256);
  let bgCss = '#000';
  let dark = true;
  const hasFilter = 'filter' in g;

  function buildLut() {
    const stops = [['--bg', 0], ['--violet', 0.3], ['--rose', 0.55], ['--dawn', 0.8], ['--fg', 1]].map(([n, p]) => [ui.token(n), p]).map(([c, p]) => [parseRGB(c, scratch), p]);
    bgCss = ui.token('--bg');
    const bg = stops[0][0];
    dark = bg[0] + bg[1] + bg[2] < 380;
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      let j = 0;
      while (j < stops.length - 2 && x > stops[j + 1][1]) j++;
      const [c0, p0] = stops[j];
      const [c1, p1] = stops[j + 1];
      const f = Math.min(1, Math.max(0, (x - p0) / (p1 - p0)));
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
      const gg = Math.round(c0[1] + (c1[1] - c0[1]) * f);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
      lut[i] = (255 << 24) | (b << 16) | (gg << 8) | r;
    }
    rampBar.style.background = `linear-gradient(90deg, ${stops.map(([c, p]) => `rgb(${c.join(',')}) ${Math.round(p * 100)}%`).join(',')})`;
  }

  let img = null;
  let img32 = null;
  function paintOff() {
    const { N, v } = sim.snapshot();
    if (!img || img.width !== N) {
      off.width = off.height = N;
      img = off.getContext('2d').createImageData(N, N);
      img32 = new Uint32Array(img.data.buffer);
    }
    clipped = false;
    const k = 255 / VMAX;
    for (let i = 0; i < N * N; i++) {
      const x = v[i] * k;
      if (x < 0 || x > 255) clipped = true;
      img32[i] = lut[x <= 0 ? 0 : x >= 255 ? 255 : x | 0];
    }
    off.getContext('2d').putImageData(img, 0, 0);
  }

  function geometry() {
    const W = canvas.width, H = canvas.height;
    const s = Math.min(W, H);
    return { W, H, s, x0: (W - s) / 2, y0: (H - s) / 2 };
  }

  function draw() {
    if (!sim) return;
    const { W, H, s, x0, y0 } = geometry();
    paintOff();
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.fillStyle = bgCss;
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const tx = x0 + dx * s, ty = y0 + dy * s;
        if (tx >= W || ty >= H || tx + s <= 0 || ty + s <= 0) continue;
        g.globalAlpha = dx === 0 && dy === 0 ? 1 : 0.24;
        g.drawImage(off, tx, ty, s, s);
      }
    g.globalAlpha = 1;
    if (hasFilter && dark) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.42;
      g.filter = `blur(${Math.max(4, s / 70)}px)`;
      g.drawImage(off, x0, y0, s, s);
      g.filter = 'none';
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.strokeStyle = ui.token('--line');
    g.lineWidth = Math.max(1, s / 500);
    g.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
    if (document.activeElement === canvas) {
      const N = sim.N;
      const cx = x0 + ((cursor.x + 0.5) / N) * s, cy = y0 + ((cursor.y + 0.5) / N) * s;
      g.strokeStyle = ui.token('--fg');
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, Math.max(6, (s / N) * 3), 0, 2 * Math.PI);
      g.stroke();
    }
  }

  // ----- controls -----
  let transport = null;
  let panel = null;
  const metricsUI = ui.metricGrid(slots.metrics, [
    { name: 'status', label: 'Pattern', wide: true, help: 'Variance of v above 1e-4 counts as a pattern.' },
    { name: 't', label: 'Time', digits: 0, unit: 'time units' },
    { name: 'steps', label: 'Steps', digits: 0, unit: 'steps' },
    { name: 'meanU', label: 'Mean u', digits: 4 },
    { name: 'meanV', label: 'Mean v', digits: 4 },
    { name: 'varV', label: 'Variance of v', digits: 5 },
    { name: 'maxV', label: 'Maximum v', digits: 3 },
    { name: 'stab', label: 'Diffusion step number', digits: 3, unit: 'limit 0.25', help: 'max(Du, Dv)·dt. Forward Euler needs it at or below 0.25.' },
    { name: 'speed', label: 'Speed', digits: 0, unit: 'steps / frame' },
    { name: 'fps', label: 'Frame rate', digits: 0, unit: 'frames / s' },
  ]);
  const chartV = chart.chartBox(slots.metrics, { title: 'Variance and mean of v over time', height: 150 });
  const chartH = chart.chartBox(slots.metrics, { title: 'Cells by value of v', height: 130 });
  const baseRow = h('div', { class: 'btnrow' });
  baseRow.append(
    ui.button('Use this curve as baseline', () => {
      baseline = history.map((p) => [p.t, p.varV]);
      drawCharts();
      ui.announce('Baseline set. Change a setting, reset, and compare the dashed curve.', 'quiet');
    }, { kind: 'small' }),
    ui.button('Clear baseline', () => {
      baseline = null;
      drawCharts();
    }, { kind: 'small' }),
    ui.button('Plant a spot', () => plantRandom(), { kind: 'small', title: 'Plants a patch at a seeded random cell' }));
  slots.metrics.append(baseRow);

  function currentConfig() {
    return { N: vals.N, F: vals.F, k: vals.k, ratio: vals.ratio, dt: vals.dt, spots: 8, noise: 0.01 };
  }

  function showFailure(msg) {
    failedMsg = msg;
    banner.replaceChildren(h('strong', {}, 'Stopped: the method broke. '), msg, h('p', { class: 'small muted' }, 'The picture is the last state, with colours clipped. Lower dt or the diffusion ratio, then press Reset.'));
    banner.hidden = false;
    loop.stop();
    transport.setRunning(false);
    ui.announce('Stopped: ' + msg, 'error');
  }

  function newSim() {
    banner.hidden = true;
    failedMsg = null;
    try {
      sim = createSim(currentConfig(), seed);
    } catch (e) {
      ui.announce(e.message, 'error');
      return false;
    }
    cursor = { x: sim.N >> 1, y: sim.N >> 1 };
    history = [];
    sampleEvery = 20;
    startedAt = performance.now();
    sample();
    updateMetrics();
    draw();
    drawCharts();
    return true;
  }

  function sample() {
    const st = sim.stats();
    history.push({ t: sim.t, steps: sim.steps, meanU: st.meanU, meanV: st.meanV, varU: st.varU, varV: st.varV });
    if (history.length > 1600) {
      history = history.filter((_, i) => i % 2 === 0);
      sampleEvery *= 2;
    }
  }

  function updateMetrics() {
    const st = sim.stats();
    const patterned = st.varV > 1e-4;
    let text, tone;
    if (failedMsg) (text = 'Numerical blow-up'), (tone = 'bad');
    else if (!patterned && sim.steps > 400) (text = 'Uniform: no pattern'), (tone = TONE_MID);
    else if (!patterned) (text = 'Starting'), (tone = '');
    else (text = 'Patterned'), (tone = 'good');
    metricsUI.set('status', 0, { text, tone });
    metricsUI.set('t', sim.t);
    metricsUI.set('steps', sim.steps);
    metricsUI.set('meanU', st.meanU);
    metricsUI.set('meanV', st.meanV);
    metricsUI.set('varV', st.varV);
    metricsUI.set('maxV', st.maxV);
    const stab = sim.stability;
    metricsUI.set('stab', stab, { tone: stab > 0.25 ? 'bad' : stab > 0.2 ? TONE_MID : '' });
    metricsUI.set('speed', stepsEff);
    metricsUI.set('fps', loop.fps);
    legendText.textContent = clipped ? `v 0 → ${VMAX} · values outside are clipped` : `v 0 → ${VMAX}`;
    canvas.setAttribute('aria-label', `Reaction–diffusion field at time ${Math.round(sim.t)}: ${text.toLowerCase()}, mean v ${st.meanV.toFixed(3)}, variance of v ${st.varV.toFixed(4)}. Click or tap to plant a patch. Arrow keys move a cursor; Enter plants.`);
  }

  function drawCharts() {
    const rows = history.map((p) => [p.t, p.meanV, p.varV, p.meanU]);
    chartV.draw(() => {
      const series = [
        { name: 'variance of v', points: history.map((p) => [p.t, p.varV]), color: ui.token('--water'), width: 2.2 },
        { name: 'mean of v', points: history.map((p) => [p.t, p.meanV]), color: ui.token('--dawn'), width: 2 },
      ];
      if (baseline) series.unshift({ name: 'baseline variance', points: baseline, color: ui.token('--violet'), width: 1.6, dash: [5, 4] });
      chart.drawLines(chartV.canvas, { series, xLabel: 'time', yLabel: 'blue: variance of v · orange: mean v', yZero: true });
    });
    chart.dataTable(chartV.text, ['time', 'mean v', 'variance of v', 'mean u'], rows);
    const { v } = sim.snapshot();
    const bins = 24;
    const counts = new Array(bins).fill(0);
    for (let i = 0; i < v.length; i++) counts[Math.min(bins - 1, Math.max(0, Math.floor((v[i] / VMAX) * bins)))]++;
    chartH.draw(() => chart.drawHistogram(chartH.canvas, { series: [{ lo: 0, hi: VMAX, counts, color: ui.token('--rose') }], xLabel: 'v' }));
    chart.dataTable(chartH.text, ['v from', 'v to', 'cells'], counts.map((c, i) => [(i * VMAX) / bins, ((i + 1) * VMAX) / bins, c]), 30);
  }

  // ----- loop -----
  const loop = ctx.loop(() => {
    if (!sim) return;
    const t0 = performance.now();
    let n = 0;
    const target = vals.steps;
    while (n < target) {
      const take = Math.min(2, target - n);
      const r = sim.step(take);
      n += take;
      if (!r.ok) {
        showFailure(r.reason);
        break;
      }
      if (sim.steps % sampleEvery < take) sample();
      if (performance.now() - t0 > 11) break;
    }
    stepsEff = n;
    frameNo++;
    draw();
    if (frameNo % 4 === 0 || failedMsg) updateMetrics();
    if (frameNo % 10 === 0 || failedMsg) drawCharts();
  });

  function setRunning(r) {
    if (r && failedMsg) {
      ui.announce('Stopped by a numerical blow-up. Change dt or the diffusion ratio, then Reset.', 'error');
      return;
    }
    if (r) loop.start();
    else loop.stop();
    transport.setRunning(r);
  }

  transport = ui.transport({
    seed,
    running: false,
    onToggle: () => setRunning(!loop.running),
    onStep: () => {
      loop.stop();
      transport.setRunning(false);
      const r = sim.step(vals.steps);
      stepsEff = vals.steps;
      sample();
      if (!r.ok) showFailure(r.reason);
      draw();
      updateMetrics();
      drawCharts();
    },
    onReset: () => {
      newSim();
    },
    onReplay: () => {
      if (newSim()) setRunning(true);
    },
    onSeed: (s) => {
      seed = s;
      transport.setSeed(s);
      newSim();
    },
  });
  slots.controls.append(transport.el);
  const ctlBox = h('div', {});
  slots.controls.append(ctlBox);
  panel = ui.controlPanel(ctlBox, meta.inputs, vals, (name, v) => {
    if (name === 'preset') {
      const p = PRESETS[v];
      panel.setAll({ F: p.F, k: p.k, ratio: p.ratio, dt: p.dt });
      newSim();
      return;
    }
    if (name === 'N') {
      newSim();
      return;
    }
    if (name === 'F' || name === 'k' || name === 'ratio' || name === 'dt') {
      try {
        sim.setParams({ F: vals.F, k: vals.k, ratio: vals.ratio, dt: vals.dt });
      } catch (e) {
        ui.announce(e.message, 'error');
        return;
      }
      updateMetrics();
    }
    if (!loop.running) draw();
  });

  // ----- pointer and keyboard -----
  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const { s, x0, y0 } = geometry();
    const u = ((((e.clientX - r.left) * sx - x0) / s) % 1 + 1) % 1;
    const w = ((((e.clientY - r.top) * sx - y0) / s) % 1 + 1) % 1;
    return { x: Math.floor(u * sim.N), y: Math.floor(w * sim.N) };
  }
  let down = false;
  let lastPlant = 0;
  function plantAt(c) {
    if (!sim || sim.failed) return;
    sim.plant(c.x, c.y);
    plantCount++;
    if (!loop.running) {
      draw();
      updateMetrics();
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    down = true;
    canvas.setPointerCapture(e.pointerId);
    const c = cellAt(e);
    cursor = c;
    plantAt(c);
    hint.hidden = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const now = performance.now();
    if (now - lastPlant < 40) return;
    lastPlant = now;
    plantAt(cellAt(e));
  });
  const up = () => (down = false);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('keydown', (e) => {
    if (!sim) return;
    const N = sim.N;
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (mv) {
      const step = e.shiftKey ? 8 : 2;
      cursor = { x: (cursor.x + mv[0] * step + N) % N, y: (cursor.y + mv[1] * step + N) % N };
      e.preventDefault();
      if (!loop.running) draw();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      plantAt(cursor);
    }
  });
  canvas.addEventListener('focus', () => !loop.running && draw());
  canvas.addEventListener('blur', () => !loop.running && draw());

  function plantRandom() {
    if (!sim) return;
    const r = ctx.rng(seed, 'plant' + plantCount);
    plantAt({ x: r.int(sim.N), y: r.int(sim.N) });
  }

  const stopFit = ui.fitCanvas(canvas, () => draw());
  const stopTheme = watchTheme(() => {
    buildLut();
    if (sim) {
      draw();
      drawCharts();
    }
  });
  buildLut();
  newSim();
  if (!ctx.reducedMotion() && !init) setRunning(true);
  else if (ctx.reducedMotion()) hint.textContent = 'Motion is reduced. Press Run to start. Tap to plant a spot.';

  return {
    getRecord() {
      const st = sim.stats();
      return {
        inputs: { ...vals },
        seed,
        metrics: [
          { name: 'Time', value: sim.t, unit: 'time units', note: `after ${sim.steps} steps` },
          { name: 'Mean u', value: st.meanU, unit: '' },
          { name: 'Mean v', value: st.meanV, unit: '' },
          { name: 'Variance of v', value: st.varV, unit: '' },
          { name: 'Maximum v', value: st.maxV, unit: '' },
          { name: 'Diffusion step number', value: sim.stability, unit: '', note: 'limit 0.25' },
          { name: 'Blow-up', value: failedMsg ? 1 : 0, unit: '', note: failedMsg || 'none' },
        ],
        diagnostics: { steps: sim.steps, fps: loop.fps, stepsPerFrame: stepsEff, grid: sim.N, planted: plantCount, stable: sim.stability <= 0.25 },
        elapsedMs: performance.now() - startedAt,
      };
    },
    getTable() {
      return { columns: ['t', 'mean_u', 'mean_v', 'variance_u', 'variance_v'], rows: history.map((p) => [p.t, p.meanU, p.meanV, p.varU, p.varV]) };
    },
    destroy() {
      stopFit();
      stopTheme();
      loop.stop();
      chartV.destroy();
      chartH.destroy();
    },
  };
}
