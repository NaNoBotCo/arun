// E04 The Map That Learns (observation assimilation)
import { METHOD_VERSION, run as runE04, sensorLayout } from '../kernels/e04.js';

export const meta = {
  id: 'E04',
  title: 'The Map That Learns',
  subtitle: 'observation assimilation',
  priority: 'P0',
  kind: 'analysis',
  dataStatus: 'SYNTHETIC',
  methodVersion: METHOD_VERSION,
  blurb: 'Sensors correct a biased rain forecast. Placed well they help; noisy and over-trusted they make it worse.',
  inputs: [
    { name: 'method', label: 'Method', type: 'segmented', options: [{ value: 'oi', label: 'Optimal interpolation' }, { value: 'kernel', label: 'Kernel correction' }], default: 'oi' },
    { name: 'layout', label: 'Sensor layout', type: 'segmented', options: [{ value: 'grid', label: 'Grid' }, { value: 'random', label: 'Random' }, { value: 'clustered', label: 'Clustered' }], default: 'random' },
    { name: 'count', label: 'Number of sensors', type: 'range', min: 0, max: 60, step: 1, default: 14, unit: 'sensors', integer: true },
    { name: 'sigmaActual', label: 'Real sensor noise', type: 'range', min: 0, max: 30, step: 0.5, default: 1.5, unit: 'mm' },
    { name: 'sigmaAssumed', label: 'Noise the method assumes', type: 'range', min: 0, max: 30, step: 0.5, default: 1.5, unit: 'mm' },
    { name: 'L', label: 'Correlation length', type: 'range', min: 0.5, max: 20, step: 0.5, default: 6, unit: 'cells' },
    { name: 'sigmaB', label: 'Background error spread (assumed)', type: 'range', min: 0.5, max: 30, step: 0.5, default: 7, unit: 'mm' },
    { name: 'bias', label: 'Background bias', type: 'range', min: -20, max: 20, step: 0.5, default: -6, unit: 'mm' },
    { name: 'errAmp', label: 'Background wobble', type: 'range', min: 0, max: 20, step: 0.5, default: 4, unit: 'mm' },
    { name: 'hour', label: 'Hour (storms drift east)', type: 'range', min: 0, max: 24, step: 0.25, default: 6, unit: 'h' },
    { name: 'unitCost', label: 'Cost per sensor', type: 'range', min: 0, max: 5000, step: 50, default: 600, unit: 'US$/yr' },
  ],
  outputs: [
    { name: 'rmseAnalysis', label: 'Test-cell RMSE after', unit: 'mm' },
    { name: 'rmseBackground', label: 'Test-cell RMSE before', unit: 'mm' },
  ],
  recordInputs: ['sensors', 'G'],
  dependencies: [],
  feeds: ['E02', 'E07'],
  seedStrategy: 'The seed draws the true rain field, the background error and the sensor layout. Each sensor’s noise comes from its own stream keyed by its cell.',
  method: `<p>A fictional day of rain on a 40 × 40 grid is the <b>truth</b>. The method never sees it; it only scores the result. The <b>background</b> forecast is the truth plus a bias and a smooth wobble. Sensors read the truth plus noise with spread σ (real).</p>
<p><b>Optimal interpolation</b> is the Kalman update with a Gaussian background covariance:</p>
<p class="eq">x_a = x_b + K(y − H x_b)        K = B Hᵀ (H B Hᵀ + R)⁻¹
B(i,j) = σ_b² exp(−d²/2L²)        R = σ_o² I  (σ_o = the noise the method assumes)</p>
<p>The solve uses a Cholesky factor, not a matrix inverse. The posterior spread at each cell is √(σ_b² − bᵀ(HBHᵀ+R)⁻¹b); it is a calibrated uncertainty only when the assumed B and R match reality, and the uncertainty map is offered for this method only.</p>
<p><b>Kernel correction</b> spreads each sensor's miss with Gaussian weights: x_a = x_b + Σ wₖdₖ / (Σ wₖ + σ_o²/σ_b²). It gives no uncertainty map.</p>
<p>Scores use every cell without a sensor (the test cells). Set the real noise high and the assumed noise low to watch over-trusted sensors make the map worse than no sensors at all.</p>
<p><b>Link to E02 (synthetic mapping):</b> the ratio of mean analysis to mean background becomes a rain factor E02 can apply to its storm. Both sides are fictional; the link shows how corrected observations would flow into a flood run.</p>`,
  limitations: [
    'Fictional rain field and sensors; no real weather.',
    'The posterior spread is calibrated only if the assumed covariances match the real errors, which here you can break on purpose.',
    'One time slice at a time; no time-dependent model between observations.',
    'Sensor cost is an editable assumption.',
  ],
  provenance: [],
  whoPays: {
    buyer: 'Farms, resorts, industrial operators',
    why: 'Where to put a few sensors so a local forecast gets better, and what that costs.',
    benefit: 'Owned sensor readings, shared with permission, can sharpen the regional picture for everyone.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E04"].ex-stage { background: var(--bg); }
[data-ex="E04"] .quad { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 8px; padding: 8px; }
[data-ex="E04"] .cell { position: relative; min-width: 0; min-height: 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: var(--bg-2); }
[data-ex="E04"] .cell canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
[data-ex="E04"] .cell.analysis { cursor: crosshair; outline: 2px solid color-mix(in srgb, var(--dawn) 55%, transparent); }
[data-ex="E04"] .cap { position: absolute; left: 8px; top: 6px; font-family: var(--font-display); font-weight: 700; font-size: 0.85rem; background: color-mix(in srgb, var(--bg) 78%, transparent); padding: 2px 8px; border-radius: 99px; pointer-events: none; }
[data-ex="E04"] .scale { position: absolute; right: 8px; bottom: 6px; font-family: var(--font-data); font-size: 0.72rem; background: color-mix(in srgb, var(--bg) 78%, transparent); padding: 2px 6px; border-radius: 6px; pointer-events: none; }
`;

const RAIN = [[27, 31, 94], [42, 111, 219], [76, 201, 240], [62, 224, 154], [255, 184, 77], [255, 107, 139]];
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  return stops[i].map((v, k) => v + (stops[i + 1][k] - v) * f);
}
const ERR = [[14, 16, 48], [120, 60, 140], [255, 107, 139], [255, 230, 200]];
const SD = [[14, 16, 48], [90, 70, 200], [167, 150, 255], [240, 236, 255]];

export function mount(slots, ctx) {
  const { h, controlPanel, transport, metricGrid, note, sectionTitle, fmt, fmtMoney, fmtPct, button, token } = ctx.ui;
  const G = 40;
  const defaults = Object.fromEntries(meta.inputs.map((i) => [i.name, i.default]));
  const v = { ...defaults, ...(ctx.initial ? ctx.initial.inputs : {}) };
  let seed = ctx.initial ? ctx.initial.seed : 20261125;
  let sensors = ctx.initial && Array.isArray(ctx.initial.inputs.sensors) ? ctx.initial.inputs.sensors.filter((c) => Number.isInteger(c) && c >= 0 && c < G * G) : sensorLayout(v.layout, v.count, G, seed);
  let showSd = false;

  const panels = {};
  const quad = h('div', { class: 'quad' });
  for (const [k, label] of [['truth', 'Truth (hidden from the method)'], ['background', 'Background forecast'], ['analysis', 'After the sensors · tap to add or remove'], ['error', 'Error after: |analysis − truth|']]) {
    const c = h('canvas', { role: 'img', 'aria-label': label });
    const cap = h('span', { class: 'cap' }, label);
    const scale = h('span', { class: 'scale' });
    const cell = h('div', { class: 'cell ' + k }, c, cap, scale);
    panels[k] = { canvas: c, cap, scale, cell };
    quad.append(cell);
    ctx.ui.fitCanvas(c, () => paint());
  }
  panels.analysis.canvas.tabIndex = 0;
  slots.stage.append(quad);

  let running = false;
  const tp = transport({
    seed, running, stepLabel: '+1 hour',
    onToggle: () => setRunning(!running),
    onStep: () => {
      v.hour = (v.hour + 1) % 24;
      panel.set('hour', v.hour);
      compute();
    },
    onReset: () => {
      setRunning(false);
      Object.assign(v, defaults);
      panel.setAll(defaults);
      sensors = sensorLayout(v.layout, v.count, G, seed);
      compute();
    },
    onReplay: () => compute(),
    onSeed: (s) => {
      seed = s;
      sensors = sensorLayout(v.layout, v.count, G, seed);
      compute();
    },
  });
  slots.controls.append(tp.el);
  const presets = h('div', { class: 'btnrow' },
    button('Over-trusted noisy sensors', () => {
      Object.assign(v, { sigmaActual: 18, sigmaAssumed: 0.5, bias: -2, errAmp: 2 });
      panel.setAll(v);
      compute();
      ctx.announce('Noisy sensors trusted as precise. Compare the error before and after.');
    }, { kind: 'small' }),
    button('Clear sensors', () => {
      sensors = [];
      compute();
    }, { kind: 'small' }),
    button('Show uncertainty', () => {
      showSd = !showSd;
      paint();
    }, { kind: 'small', title: 'Swap the error map for the method’s own uncertainty (optimal interpolation only)' }));
  slots.controls.append(presets);
  const shown = ctx.compact ? meta.inputs.filter((i) => ['count', 'sigmaActual'].includes(i.name)) : meta.inputs;
  const panel = controlPanel(slots.controls, shown, v, (name) => {
    if (name === 'layout' || name === 'count') sensors = sensorLayout(v.layout, v.count, G, seed);
    compute();
  });

  const mg = metricGrid(slots.metrics, [
    { name: 'rb', label: 'Test-cell RMSE before', unit: 'mm' },
    { name: 'ra', label: 'Test-cell RMSE after', unit: 'mm' },
    { name: 'gain', label: 'Change in error', pct: true },
    { name: 'mb', label: 'MAE before', unit: 'mm' },
    { name: 'ma', label: 'MAE after', unit: 'mm' },
    { name: 'n', label: 'Sensors', digits: 0 },
    { name: 'cost', label: 'Sensor cost', money: true, help: 'per year, editable' },
    { name: 'sd', label: 'Mean posterior spread', unit: 'mm' },
    { name: 'factor', label: 'Rain factor for E02', unit: '× (synthetic)', digits: 3 },
  ]);
  const layoutBox = h('div', {});
  const layoutState = h('p', { class: 'small muted', 'aria-live': 'polite' });
  slots.metrics.append(sectionTitle('Layouts over 12 seeds'), layoutBox);
  layoutBox.append(h('div', { class: 'btnrow' }, button('Compare grid, random, clustered', () => compareLayouts(), { kind: 'small' })), layoutState);
  const failNote = h('div', {});
  slots.metrics.append(failNote);

  let res = null, lastMs = 0, range = [0, 1];
  function compute() {
    const t0 = performance.now();
    try {
      res = runE04({ G, L: v.L, sigmaB: v.sigmaB, sigmaAssumed: v.sigmaAssumed, sigmaActual: v.sigmaActual, bias: v.bias, errAmp: v.errAmp, hour: v.hour, method: v.method, sensors }, seed);
    } catch (e) {
      ctx.announce(e.message, 'error');
      return;
    }
    lastMs = performance.now() - t0;
    failNote.replaceChildren(res.ok ? '' : note(res.reason, 'error'));
    let lo = Infinity, hi = -Infinity;
    for (const arr of [res.truth, res.background, res.xa]) for (const x of arr) {
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    range = [lo, hi];
    const worse = res.rmseAnalysis > res.rmseBackground;
    mg.set('rb', res.rmseBackground);
    mg.set('ra', res.rmseAnalysis, { tone: worse ? 'bad' : 'good' });
    mg.set('gain', res.rmseAnalysis / res.rmseBackground - 1, { tone: worse ? 'bad' : 'good' });
    mg.set('mb', res.maeBackground);
    mg.set('ma', res.maeAnalysis);
    mg.set('n', sensors.length);
    mg.set('cost', sensors.length * v.unitCost);
    let sdMean = null;
    if (res.sd && v.method === 'oi') {
      let s = 0;
      for (const x of res.sd) s += x;
      sdMean = s / res.sd.length;
    }
    mg.set('sd', sdMean, { text: sdMean === null ? 'not offered' : undefined });
    mg.set('factor', res.forcingMultiplier);
    ctx.scenario.putResult('E04', { inputHash: 'e04:' + seed + ':' + sensors.length, data: { forcingMultiplier: res.forcingMultiplier, rmseBackground: res.rmseBackground, rmseAnalysis: res.rmseAnalysis, sensors: sensors.length, sensorCost_usd_y: sensors.length * v.unitCost, method: v.method }, elapsedMs: lastMs, where: 'main thread' });
    paint();
  }

  function draw(canvas, field, colorFn) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    if (!W || !field) return null;
    const side = Math.min(W, H);
    const off = document.createElement('canvas');
    off.width = G;
    off.height = G;
    const og = off.getContext('2d');
    const img = og.createImageData(G, G);
    for (let i = 0; i < G * G; i++) {
      const [r, gg, b] = colorFn(field[i]);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    const x0 = (W - side) / 2, y0 = (H - side) / 2;
    g.drawImage(off, x0, y0, side, side);
    return { x0, y0, side };
  }

  function paint() {
    if (!res) return;
    const [lo, hi] = range;
    const rc = (x) => ramp(RAIN, (x - lo) / (hi - lo || 1));
    draw(panels.truth.canvas, res.truth, rc);
    draw(panels.background.canvas, res.background, rc);
    const geo = draw(panels.analysis.canvas, res.xa, rc);
    panels.truth.scale.textContent = `${fmt(lo, 0)}–${fmt(hi, 0)} mm`;
    panels.background.scale.textContent = `${fmt(lo, 0)}–${fmt(hi, 0)} mm`;
    panels.analysis.scale.textContent = `${sensors.length} sensors`;
    if (geo) {
      const g = panels.analysis.canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cs = geo.side / G;
      for (let k = 0; k < sensors.length; k++) {
        const c = sensors[k];
        const x = geo.x0 + ((c % G) + 0.5) * cs, y = geo.y0 + (Math.floor(c / G) + 0.5) * cs;
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#111';
        g.lineWidth = 1.5 * dpr;
        g.beginPath();
        g.arc(x, y, 4 * dpr, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      panels.analysis.canvas._geo = geo;
    }
    if (showSd && v.method === 'oi' && res.sd) {
      panels.error.cap.textContent = 'Method’s own uncertainty (posterior spread)';
      const mx = v.sigmaB;
      draw(panels.error.canvas, res.sd, (x) => ramp(SD, x / mx));
      panels.error.scale.textContent = `0–${fmt(mx, 1)} mm`;
    } else {
      panels.error.cap.textContent = showSd ? 'Uncertainty not offered for kernel correction · showing error' : 'Error after: |analysis − truth|';
      const err = new Float64Array(G * G);
      let mx = 0;
      for (let i = 0; i < G * G; i++) {
        err[i] = Math.abs(res.xa[i] - res.truth[i]);
        if (err[i] > mx) mx = err[i];
      }
      draw(panels.error.canvas, err, (x) => ramp(ERR, x / Math.max(1, mx)));
      panels.error.scale.textContent = `0–${fmt(mx, 1)} mm`;
    }
  }

  function toggleSensor(cell) {
    const i = sensors.indexOf(cell);
    if (i >= 0) sensors.splice(i, 1);
    else if (sensors.length < 120) sensors.push(cell);
    compute();
  }
  panels.analysis.canvas.addEventListener('pointerup', (e) => {
    const geo = panels.analysis.canvas._geo;
    if (!geo) return;
    const r = panels.analysis.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const x = Math.floor(((e.clientX - r.left) * dpr - geo.x0) / (geo.side / G));
    const y = Math.floor(((e.clientY - r.top) * dpr - geo.y0) / (geo.side / G));
    if (x < 0 || y < 0 || x >= G || y >= G) return;
    toggleSensor(y * G + x);
  });
  let cursor = Math.floor(G / 2) * G + Math.floor(G / 2);
  panels.analysis.canvas.addEventListener('keydown', (e) => {
    const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -G, ArrowDown: G }[e.key];
    if (mv !== undefined) {
      e.preventDefault();
      cursor = Math.max(0, Math.min(G * G - 1, cursor + mv));
      ctx.announce(`Cursor at column ${cursor % G}, row ${Math.floor(cursor / G)}. Enter adds or removes a sensor.`, 'quiet');
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleSensor(cursor);
    }
  });

  let layoutJob = null;
  function compareLayouts() {
    if (layoutJob) layoutJob.cancel();
    layoutState.textContent = 'Running 3 layouts × 12 seeds…';
    const config = { G, L: v.L, sigmaB: v.sigmaB, sigmaAssumed: v.sigmaAssumed, sigmaActual: v.sigmaActual, bias: v.bias, errAmp: v.errAmp, hour: v.hour, method: v.method, sensors: sensors.length ? sensors : sensorLayout('random', v.count || 16, G, seed) };
    const seeds = Array.from({ length: 12 }, (_, i) => seed + i);
    layoutJob = ctx.runJob('e04.layouts', { config, seeds });
    layoutJob.promise.then((r) => {
      const o = r.result;
      layoutState.textContent = `Mean test-cell RMSE with ${config.sensors.length} sensors: grid ${fmt(o.grid.meanRmse, 2)} mm · random ${fmt(o.random.meanRmse, 2)} mm · clustered ${fmt(o.clustered.meanRmse, 2)} mm (12 seeds, ${fmt(r.elapsedMs, 0)} ms).`;
    }).catch((e) => {
      if (!e.cancelled) layoutState.textContent = 'Comparison failed: ' + e.message;
    });
  }

  let acc = 0;
  const loop = ctx.loop((dt) => {
    if (!running) return;
    acc += dt;
    if (acc > 0.1) {
      v.hour = (v.hour + acc * 1.5) % 24;
      acc = 0;
      panel.set('hour', Math.round(v.hour * 4) / 4);
      compute();
    }
  });
  function setRunning(r) {
    running = r;
    tp.setRunning(r);
    if (r) loop.start();
    else loop.stop();
  }
  compute();

  return {
    getRecord() {
      return {
        inputs: { ...v, sensors: sensors.slice(), G },
        seed,
        metrics: [
          { name: 'Test-cell RMSE, background', value: res.rmseBackground, unit: 'mm' },
          { name: 'Test-cell RMSE, after sensors', value: res.rmseAnalysis, unit: 'mm' },
          { name: 'Test-cell MAE, background', value: res.maeBackground, unit: 'mm' },
          { name: 'Test-cell MAE, after sensors', value: res.maeAnalysis, unit: 'mm' },
          { name: 'Test cells', value: res.heldOut, unit: 'cells' },
          { name: 'Sensors', value: sensors.length, unit: 'count' },
          { name: 'Sensor cost', value: sensors.length * v.unitCost, unit: 'USD/yr', note: 'editable assumption' },
          { name: 'Rain factor offered to E02', value: res.forcingMultiplier, unit: 'ratio', note: 'synthetic mapping' },
        ],
        diagnostics: { method: v.method, solveOk: res.ok, computeMs: lastMs },
        elapsedMs: lastMs,
      };
    },
    getTable() {
      const rows = [];
      for (let i = 0; i < G * G; i++) rows.push([i % G, Math.floor(i / G), res.truth[i], res.background[i], res.xa[i], res.sd ? res.sd[i] : null, sensors.includes(i) ? 1 : 0]);
      return { columns: ['col', 'row', 'truth_mm', 'background_mm', 'analysis_mm', 'posterior_sd_mm', 'sensor'], rows };
    },
    destroy() {},
  };
}
