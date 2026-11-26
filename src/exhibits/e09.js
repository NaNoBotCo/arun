// E09 Butterfly Chamber: two Lorenz systems started a tiny distance apart. The kernel integrates; this file draws.
import { createPair, growthFit, DEFAULTS, BLOWUP } from '../kernels/e09.js';

const TONE_MID = 'warn'; // stylecheck: allow — the value the metric tile CSS reads
const PRESETS = {
  standard: { label: 'Standard chaos (σ 10, ρ 28, β 8/3)', sigma: 10, rho: 28, beta: 8 / 3, dt: 0.005 },
  calm: { label: 'Calm: ρ = 0.5, everything settles', sigma: 10, rho: 0.5, beta: 8 / 3, dt: 0.005 },
  periodic: { label: 'Periodic window: ρ = 100', sigma: 10, rho: 100, beta: 8 / 3, dt: 0.005 },
  edge: { label: 'Near the onset: ρ = 24.5', sigma: 10, rho: 24.5, beta: 8 / 3, dt: 0.005 },
  broken: { label: 'Step too large (breaks the method)', sigma: 50, rho: 200, beta: 10, dt: 0.05 },
};

export const meta = {
  id: 'E09',
  title: 'Butterfly Chamber',
  subtitle: 'chaos',
  priority: 'P1',
  kind: 'simulation',
  dataStatus: 'MATHEMATICAL',
  methodVersion: 'e09-lorenz-1.0.0',
  blurb: 'Two copies of one weather-like system start a hair apart and drift into different futures.',
  inputs: [
    { name: 'preset', label: 'Preset', type: 'select', default: 'standard', options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })) },
    { name: 'sigma', label: 'σ (sigma)', type: 'range', min: 1, max: 50, step: 0.1, default: 10, unit: '' },
    { name: 'rho', label: 'ρ (rho)', type: 'range', min: 0, max: 200, step: 0.5, default: 28, unit: '' },
    { name: 'beta', label: 'β (beta)', type: 'range', min: 0.5, max: 10, step: 0.01, default: 8 / 3, unit: '' },
    { name: 'pexp', label: 'Starting gap, log10', type: 'range', min: -12, max: -1, step: 0.5, default: -8, unit: 'log10', help: 'System B starts this far from A, in a seeded direction. A tap nudges B by the same amount.' },
    { name: 'identical', label: 'Start B exactly on A', type: 'toggle', default: false },
    { name: 'speed', label: 'Speed', type: 'range', min: 0.5, max: 20, step: 0.5, default: 4, unit: 'time / s' },
    { name: 'tmax', label: 'Run until', type: 'select', numeric: true, default: 60, options: [30, 60, 100, 200].map((n) => ({ value: n, label: `t = ${n}` })) },
    { name: 'dt', label: 'Step size', type: 'select', numeric: true, default: 0.005, options: [0.0025, 0.005, 0.01, 0.02, 0.05].map((n) => ({ value: n, label: `dt = ${n}` })) },
  ],
  outputs: [
    { name: 'separation', label: 'Separation ‖A − B‖', unit: '' },
    { name: 'growth', label: 'Growth rate of ln ‖A − B‖', unit: '1/time' },
    { name: 'lyapunov', label: 'Lyapunov estimate (renormalised)', unit: '1/time' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32 from the seed. The start point of A, the direction from A to B and the direction of each tap-nudge come from separate seeded streams.',
  method: `<p>The Lorenz system has three variables and three numbers.</p>
<p class="eq">dx/dt = σ (y − x)</p>
<p class="eq">dy/dt = x (ρ − z) − y</p>
<p class="eq">dz/dt = x y − β z</p>
<p><strong>Scheme.</strong> Classical fourth-order Runge–Kutta with a fixed step dt, the same for both systems. The kernel tests show the error falls at least 12 times when the step halves over t = 2, that z(t) = z₀e<sup>−βt</sup> is reproduced on the z axis, and that a small cube of start points shrinks at the rate σ + 1 + β, as the equations require. A run stops if a variable leaves ±${BLOWUP}.</p>
<p><strong>Two systems.</strong> A starts at a seeded point. B starts at A plus a gap of the size you choose in a seeded direction. The toggle sets the gap to exactly 0: the two stay identical because the same arithmetic runs on the same numbers.</p>
<p><strong>Separation.</strong> ‖A − B‖ is the Euclidean distance in (x, y, z). It saturates near the distance of two independent points on the attractor: √(2·trace of the covariance of A's path so far). The page shows that number as the saturation scale.</p>
<p><strong>Growth rate (finite-time).</strong> The slope of ln ‖A − B‖ against t, fitted by least squares over the samples where the separation is between 10 times the starting gap and 5% of the saturation scale. It needs a small starting gap and a run long enough to cross that window. For σ 10, ρ 28, β 8/3 the long-run value of the largest Lyapunov exponent is about 0.906.</p>
<p><strong>Lyapunov estimate (renormalised).</strong> A separate run follows A and a copy at distance 10<sup>−8</sup>. Every 50 steps the code adds ln(d / 10<sup>−8</sup>) to a sum and pulls the copy back to distance 10<sup>−8</sup> along the same line. The estimate is the sum divided by the time counted, after 10 time units are discarded. The button runs it for 100 time units.</p>
<p><strong>Reading the picture.</strong> The lines are the stored trail of each system, drawn from the computed states and rotated by your view. The thin line joins the two heads.</p>`,
  limitations: [
    'A three-variable mathematical toy. It is not a weather model and says nothing about forecasting conflict, markets or people.',
    'The lesson is about uncertainty: a tiny error in the start grows, so a long-range prediction needs a start known far more finely than the prediction horizon suggests.',
    'Not every setting is chaotic. The calm and periodic presets leave the two systems side by side, and the page shows that.',
    'A fixed-step RK4 run is an approximation. A large step gives a different trajectory from a small one, and past the stability limit it blows up.',
    'The growth-rate fit and the renormalised estimate are finite-time values and change with the seed and run length.',
  ],
  provenance: [],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E09"] .e09-hint { position: absolute; left: 10px; top: 10px; max-width: calc(100% - 20px); padding: 5px 12px; border-radius: 999px; font-size: 0.85rem; background: color-mix(in srgb, var(--bg) 72%, transparent); pointer-events: none; }
[data-ex="E09"] .e09-legend { position: absolute; left: 10px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 6px 10px; border-radius: var(--r-s); font-size: 0.82rem; font-family: var(--font-data); background: color-mix(in srgb, var(--bg) 72%, transparent); pointer-events: none; max-width: calc(100% - 20px); }
[data-ex="E09"] .e09-legend .sw { display: inline-block; width: 18px; height: 4px; border-radius: 2px; vertical-align: 3px; margin-right: 6px; }
[data-ex="E09"] .e09-banner { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100% - 28px)); padding: 14px 16px; border-radius: var(--r-m); border: 1px solid var(--danger); /* stylecheck: allow — CSS token name */ background: color-mix(in srgb, var(--bg) 88%, transparent); box-shadow: var(--shadow); }
[data-ex="E09"] .e09-banner[hidden] { display: none; }
[data-ex="E09"] canvas.stage-canvas { cursor: grab; }
[data-ex="E09"] canvas.stage-canvas:active { cursor: grabbing; }
[data-ex="E09"] canvas.stage-canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
`;

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

const TRAIL = 2600; // stored points per system
const BANDS = 18;
const SAMPLE_DT = 0.05; // time between chart samples

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const init = ctx.initial;
  const vals = { ...Object.fromEntries(meta.inputs.map((i) => [i.name, i.default])), ...(init ? init.inputs : {}) };
  let seed = init ? init.seed : 11;
  let pair = null;
  let hist = { t: [], d: [], ax: [], bx: [], az: [], bz: [] };
  let marks = [];
  let trailA = null, trailB = null, trailN = 0, trailHead = 0;
  let recAcc = 0;
  let acc = 0;
  let extent = 20;
  let az = 0.3, el = 0.22;
  let startedAt = performance.now();
  let failedMsg = null;
  let reachedHorizon = false;
  let lyap = null; // { value, T, state }
  let lyapJob = null;
  let nudges = 0;
  let sampleEvery = 1;
  let frameNo = 0;
  let stepsEff = 0;
  let dragged = false;
  let colors = {};
  let dark = true;

  const canvas = h('canvas', { class: 'stage-canvas', tabindex: '0', role: 'img', 'aria-label': 'Two Lorenz trajectories. Drag to rotate. Tap to nudge system B. Arrow keys rotate; Enter nudges.' });
  const hint = h('div', { class: 'e09-hint' });
  const legendA = h('span', {}, h('i', { class: 'sw' }), 'A');
  const legendB = h('span', {}, h('i', { class: 'sw' }), 'B');
  const legendSep = h('span', {}, 'gap —');
  const legend = h('div', { class: 'e09-legend' }, legendA, legendB, legendSep);
  const banner = h('div', { class: 'e09-banner', role: 'alert', hidden: true });
  slots.stage.append(canvas, hint, legend, banner);
  const g = canvas.getContext('2d');

  function readColors() {
    colors = { A: ui.token('--water'), B: ui.token('--rose'), bg: ui.token('--bg'), bg2: ui.token('--bg-2'), fg: ui.token('--fg'), muted: ui.token('--muted'), gold: ui.token('--dawn'), line: ui.token('--line') };
    const m = /^#([0-9a-f]{6})$/i.exec(colors.bg);
    dark = m ? parseInt(m[1].slice(0, 2), 16) + parseInt(m[1].slice(2, 4), 16) + parseInt(m[1].slice(4), 16) < 380 : !/^rgb\(2[0-9]{2}/.test(colors.bg);
    legendA.firstChild.style.background = colors.A;
    legendB.firstChild.style.background = colors.B;
  }

  function config() {
    return { sigma: vals.sigma, rho: vals.rho, beta: vals.beta, dt: vals.dt, eps: vals.identical ? 0 : 10 ** vals.pexp };
  }

  function newPair() {
    banner.hidden = true;
    failedMsg = null;
    reachedHorizon = false;
    try {
      pair = createPair(config(), seed);
    } catch (e) {
      ui.announce(e.message, 'error');
      return false;
    }
    hist = { t: [], d: [], ax: [], bx: [], az: [], bz: [] };
    marks = [];
    trailA = new Float32Array(TRAIL * 3);
    trailB = new Float32Array(TRAIL * 3);
    trailN = 0;
    trailHead = 0;
    recAcc = 0;
    acc = 0;
    nudges = 0;
    extent = 20;
    sampleEvery = Math.max(1, Math.round(SAMPLE_DT / vals.dt));
    startedAt = performance.now();
    pushTrail();
    sample();
    hint.textContent = `Drag to rotate · tap to nudge B by ${vals.identical ? "1e-8" : (10 ** vals.pexp).toExponential(0)}`;
    updateAll();
    return true;
  }

  function pushTrail() {
    const i = trailHead * 3;
    trailA[i] = pair.a[0]; trailA[i + 1] = pair.a[1]; trailA[i + 2] = pair.a[2];
    trailB[i] = pair.b[0]; trailB[i + 1] = pair.b[1]; trailB[i + 2] = pair.b[2];
    trailHead = (trailHead + 1) % TRAIL;
    if (trailN < TRAIL) trailN++;
  }

  function sample() {
    const d = pair.separation();
    hist.t.push(pair.t);
    hist.d.push(d);
    hist.ax.push(pair.a[0]);
    hist.bx.push(pair.b[0]);
    hist.az.push(pair.a[2]);
    hist.bz.push(pair.b[2]);
  }

  // ----- drawing -----
  function project(x, y, z, W, H, s, cz) {
    const X = x, Y = y, Z = z - cz;
    const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    const x1 = X * ca - Y * sa;
    const y1 = X * sa + Y * ca;
    const up = Z * ce + y1 * se;
    const depth = y1 * ce - Z * se;
    const f = 1 / (1 - 0.35 * (depth / extent));
    out[0] = W / 2 + x1 * s * f;
    out[1] = H / 2 - up * s * f;
    out[2] = depth;
    return out;
  }
  const out = [0, 0, 0];

  function drawTrail(trail, color, W, H, s, cz, dpr) {
    const n = trailN;
    if (n < 2) return;
    const start = trailN < TRAIL ? 0 : trailHead;
    const per = Math.ceil(n / BANDS);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = color;
    let prevX = 0, prevY = 0;
    for (let b = 0; b < BANDS; b++) {
      const i0 = b * per, i1 = Math.min(n - 1, (b + 1) * per);
      if (i0 >= n - 1) break;
      const age = (b + 1) / BANDS;
      g.globalAlpha = 0.03 + 0.62 * age * age;
      g.lineWidth = (0.7 + 1.9 * age) * dpr;
      g.beginPath();
      for (let i = i0; i <= i1; i++) {
        const k = ((start + i) % TRAIL) * 3;
        project(trail[k], trail[k + 1], trail[k + 2], W, H, s, cz);
        if (i === i0 && b > 0) g.moveTo(prevX, prevY);
        else if (i === i0) g.moveTo(out[0], out[1]);
        else g.lineTo(out[0], out[1]);
        prevX = out[0];
        prevY = out[1];
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function head(p, color, W, H, s, cz, dpr, r) {
    project(p[0], p[1], p[2], W, H, s, cz);
    const x = out[0], y = out[1];
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 5);
    grad.addColorStop(0, color);
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.55;
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r * 5, 0, 2 * Math.PI);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = colors.fg;
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.arc(x, y, r * 1.8, 0, 2 * Math.PI);
    g.stroke();
    return [x, y];
  }

  function draw() {
    if (!pair) return;
    const W = canvas.width, H = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.globalCompositeOperation = 'source-over';
    const bgGrad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    bgGrad.addColorStop(0, colors.bg2);
    bgGrad.addColorStop(1, colors.bg);
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, W, H);
    const cz = pair.config.rho - 1;
    // Extent follows the largest distance from the centre seen so far in either system.
    let mx = 0;
    const stride = Math.max(1, Math.floor(trailN / 400));
    for (let i = 0; i < trailN; i += stride) {
      const k = i * 3;
      mx = Math.max(mx, Math.hypot(trailA[k], trailA[k + 1], trailA[k + 2] - cz));
    }
    extent += (Math.max(15, mx * 1.02) - extent) * 0.1;
    const s = (Math.min(W, H) * 0.5) / extent;
    // fixed points
    if (pair.config.rho > 1) {
      const q = Math.sqrt(pair.config.beta * (pair.config.rho - 1));
      g.strokeStyle = colors.muted;
      g.globalAlpha = 0.6;
      g.lineWidth = 1.5 * dpr;
      for (const sg of [1, -1]) {
        project(sg * q, sg * q, pair.config.rho - 1, W, H, s, cz);
        g.beginPath();
        g.arc(out[0], out[1], 5 * dpr, 0, 2 * Math.PI);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    drawTrail(trailA, colors.A, W, H, s, cz, dpr);
    drawTrail(trailB, colors.B, W, H, s, cz, dpr);
    const pa = head(pair.a, colors.A, W, H, s, cz, dpr, 4 * dpr);
    const pb = head(pair.b, colors.B, W, H, s, cz, dpr, 4 * dpr);
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = colors.fg;
    g.globalAlpha = 0.65;
    g.lineWidth = 1 * dpr;
    g.setLineDash([3 * dpr, 3 * dpr]);
    g.beginPath();
    g.moveTo(pa[0], pa[1]);
    g.lineTo(pb[0], pb[1]);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  // ----- metrics and charts -----
  const metricsUI = ui.metricGrid(slots.metrics, [
    { name: 'status', label: 'State', wide: true },
    { name: 't', label: 'Time', digits: 2, unit: 'time units' },
    { name: 'sep', label: 'Separation ‖A − B‖', digits: 3 },
    { name: 'logsep', label: 'log10 of separation', digits: 2 },
    { name: 'sat', label: 'Saturation scale', digits: 1, unit: 'two random points' },
    { name: 'h1', label: 'Time until gap reaches 1', digits: 1, unit: 'time units' },
    { name: 'growth', label: 'Growth rate of ln gap', digits: 3, unit: '1/time · fit' },
    { name: 'lyap', label: 'Lyapunov estimate', digits: 3, unit: '1/time · renormalised' },
    { name: 'fps', label: 'Frame rate', digits: 0, unit: 'frames / s' },
  ]);
  const chartSep = chart.chartBox(slots.metrics, { title: 'log10 of the separation ‖A − B‖ over time', height: 150 });
  const chartX = chart.chartBox(slots.metrics, { title: 'x of A and B over time', height: 130 });
  const row = h('div', { class: 'btnrow' });
  const lyapBtn = ui.button('Estimate Lyapunov exponent', () => estimateLyap(), { kind: 'small', title: 'Runs a separate renormalised run for 100 time units' });
  row.append(lyapBtn, ui.button('Nudge B', () => nudge(), { kind: 'small', title: 'Kick B by the starting gap, in a seeded direction' }));
  slots.metrics.append(row);

  function firstCrossing() {
    for (let i = 0; i < hist.d.length; i++) if (hist.d[i] >= 1) return hist.t[i];
    return null;
  }
  function growthNow() {
    const d0 = vals.identical ? NaN : 10 ** vals.pexp;
    if (!(d0 > 0) || !(pair.saturation() > 0)) return NaN;
    return growthFit(hist.t, hist.d, { dMin: d0 * 10, dMax: 0.05 * pair.saturation() });
  }

  function updateAll(chartsToo = true) {
    const sep = pair.separation();
    let text = 'Running';
    let tone = '';
    if (failedMsg) (text = 'Numerical blow-up'), (tone = 'bad');
    else if (reachedHorizon) (text = `Reached t = ${vals.tmax}`), (tone = '');
    else if (!loop.running && pair.steps === 0) text = 'Ready';
    else if (!loop.running) text = 'Paused';
    if (!failedMsg && pair.steps > 2000) {
      if (sep === 0) (text += ' · identical, gap 0'), (tone = 'good');
      else if (sep < 1e-3 * (pair.saturation() || 1) && pair.t > 20) (text += ' · gap not growing'), (tone = TONE_MID);
      else if (sep > 0.3 * (pair.saturation() || 1)) (text += ' · gap saturated'), (tone = 'good');
    }
    metricsUI.set('status', 0, { text, tone });
    metricsUI.set('t', pair.t);
    metricsUI.set('sep', sep, { digits: sep < 1e-3 && sep > 0 ? 2 : 3 });
    metricsUI.set('logsep', sep > 0 ? Math.log10(sep) : NaN, { text: sep > 0 ? undefined : '−∞' });
    metricsUI.set('sat', pair.saturation());
    const c = firstCrossing();
    metricsUI.set('h1', c, { text: c === null ? 'not yet' : undefined });
    const gf = growthNow();
    metricsUI.set('growth', gf && gf.slope, { text: gf && Number.isFinite(gf.slope) ? undefined : '—', sub: gf && Number.isFinite(gf.slope) ? `fit over ${gf.n} samples` : 'needs a small gap that has grown' });
    metricsUI.set('lyap', lyap ? lyap.value : NaN, { text: lyap && lyap.state === 'running' ? 'working…' : lyap ? undefined : '—', sub: lyap && lyap.value !== undefined ? `T = ${lyap.T}` : 'press the button' });
    metricsUI.set('fps', loop.fps);
    legendSep.textContent = `gap ${sep === 0 ? '0' : sep.toExponential(2)}`;
    canvas.setAttribute('aria-label', `Two Lorenz trajectories at time ${pair.t.toFixed(1)}. Separation ${sep.toExponential(2)}. Drag to rotate. Tap to nudge system B.`);
    if (chartsToo) drawCharts();
  }

  function drawCharts() {
    const T = hist.t;
    const logd = hist.d.map((d) => (d > 0 ? Math.log10(d) : NaN));
    chartSep.draw(() => {
      const series = [{ name: 'log10 separation', points: T.map((t, i) => [t, logd[i]]), color: ui.token('--rose'), width: 2.2 }];
      const mk = marks.map((m) => ({ x: m, color: ui.token('--violet') }));
      const sat = pair.saturation();
      if (sat > 0) mk.push({ y: Math.log10(sat), color: ui.token('--muted'), label: 'saturation' });
      chart.drawLines(chartSep.canvas, { series, xLabel: 'time', yLabel: 'log10 ‖A − B‖', marks: mk, xRange: [0, Math.max(10, T[T.length - 1] || 10)] });
    });
    chart.dataTable(chartSep.text, ['time', 'separation', 'log10 separation'], T.map((t, i) => [t, hist.d[i], Number.isFinite(logd[i]) ? logd[i] : '−∞']));
    chartX.draw(() => chart.drawLines(chartX.canvas, {
      series: [
        { name: 'x of A', points: T.map((t, i) => [t, hist.ax[i]]), color: ui.token('--water'), width: 1.8 },
        { name: 'x of B', points: T.map((t, i) => [t, hist.bx[i]]), color: ui.token('--rose'), width: 1.8, dash: [4, 3] },
      ],
      xLabel: 'time', yLabel: 'x (blue A, pink dashed B)', xRange: [0, Math.max(10, T[T.length - 1] || 10)],
    }));
    chart.dataTable(chartX.text, ['time', 'x of A', 'x of B', 'z of A', 'z of B'], T.map((t, i) => [t, hist.ax[i], hist.bx[i], hist.az[i], hist.bz[i]]));
  }

  function estimateLyap() {
    if (lyapJob) lyapJob.cancel();
    lyap = { state: 'running', T: 100 };
    updateAll(false);
    try {
      lyapJob = ctx.runJob('e09.lyapunov', { params: { sigma: vals.sigma, rho: vals.rho, beta: vals.beta, dt: vals.dt }, options: { T: 100 }, seed }, {});
      lyapJob.promise.then((r) => {
        lyap = { state: 'done', value: r.result.lambda, T: r.result.T };
        updateAll(false);
      }).catch((e) => {
        if (e && e.cancelled) return;
        lyap = null;
        ui.announce(e.message, 'error');
        updateAll(false);
      });
    } catch (e) {
      lyap = null;
      ui.announce(e.message, 'error');
    }
  }

  function nudge() {
    if (!pair || failedMsg) return;
    const size = vals.identical ? 1e-8 : 10 ** vals.pexp;
    pair.nudgeB(size);
    marks.push(pair.t);
    nudges++;
    pushTrail();
    if (!loop.running) {
      draw();
      updateAll();
    }
    ui.announce(`Nudged B by ${size.toExponential(0)} at t = ${pair.t.toFixed(2)}.`, 'quiet');
  }

  // ----- loop -----
  function advance(nSteps) {
    let n = 0;
    while (n < nSteps) {
      const take = Math.min(4, nSteps - n);
      for (let i = 0; i < take; i++) {
        const r = pair.step(1);
        if (!r.ok) {
          failedMsg = r.reason;
          return n;
        }
        n++;
        recAcc++;
        if (recAcc >= 2) {
          recAcc = 0;
          pushTrail();
        }
        if (pair.steps % sampleEvery === 0) sample();
        if (pair.t >= vals.tmax) {
          reachedHorizon = true;
          return n;
        }
      }
    }
    return n;
  }

  const loop = ctx.loop((dt) => {
    if (!pair) return;
    acc += (vals.speed * dt) / pair.config.dt;
    let n = Math.floor(acc);
    acc -= n;
    n = Math.min(n, 3000);
    stepsEff = advance(n);
    if (!ctx.reducedMotion()) az += 0.03 * dt;
    frameNo++;
    if (failedMsg) {
      banner.replaceChildren(h('strong', {}, 'Stopped: the method broke. '), failedMsg, h('p', { class: 'small muted' }, 'The step is larger than RK4 can follow for these settings. Choose a smaller step size, then press Reset.'));
      banner.hidden = false;
      loop.stop();
      transport.setRunning(false);
      ui.announce('Stopped: ' + failedMsg, 'error');
    } else if (reachedHorizon) {
      loop.stop();
      transport.setRunning(false);
      ui.announce(`Reached t = ${vals.tmax}.`, 'quiet');
    }
    draw();
    if (frameNo % 4 === 0 || !loop.running) updateAll(frameNo % 12 === 0 || !loop.running);
  });

  function setRunning(r) {
    if (r && failedMsg) {
      ui.announce('Stopped by a numerical blow-up. Pick a smaller step, then Reset.', 'error');
      return;
    }
    if (r && reachedHorizon) {
      newPair();
    }
    if (r) loop.start();
    else loop.stop();
    transport.setRunning(r);
    updateAll(false);
  }

  const transport = ui.transport({
    seed,
    stepLabel: 'Step 0.25',
    onToggle: () => setRunning(!loop.running),
    onStep: () => {
      loop.stop();
      transport.setRunning(false);
      if (failedMsg) return;
      advance(Math.round(0.25 / pair.config.dt));
      draw();
      updateAll();
    },
    onReset: () => {
      const was = loop.running;
      newPair();
      draw();
      if (!was) transport.setRunning(false);
    },
    onReplay: () => {
      if (newPair()) {
        draw();
        loop.start();
        transport.setRunning(true);
      }
    },
    onSeed: (s) => {
      seed = s;
      transport.setSeed(s);
      newPair();
      draw();
    },
  });
  slots.controls.append(transport.el);
  const box = h('div', {});
  slots.controls.append(box);
  const panel = ui.controlPanel(box, meta.inputs, vals, (name, v) => {
    if (name === 'preset') {
      const p = PRESETS[v];
      panel.setAll({ sigma: p.sigma, rho: p.rho, beta: p.beta, dt: p.dt });
      lyap = null;
      newPair();
      draw();
      return;
    }
    if (['sigma', 'rho', 'beta', 'pexp', 'identical', 'dt'].includes(name)) {
      lyap = null;
      newPair();
      draw();
    }
    if (name === 'tmax' && pair.t < vals.tmax) reachedHorizon = false;
    if (!loop.running) updateAll();
  });

  // ----- pointer and keys -----
  let pDown = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pDown = { x: e.clientX, y: e.clientY, az0: az, el0: el, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pDown) return;
    const dx = e.clientX - pDown.x, dy = e.clientY - pDown.y;
    if (!pDown.moved && Math.hypot(dx, dy) < 6) return;
    pDown.moved = true;
    az = pDown.az0 + dx * 0.008;
    el = Math.max(-1.3, Math.min(1.3, pDown.el0 + dy * 0.006));
    if (!loop.running) draw();
  });
  const release = () => {
    if (pDown && !pDown.moved) nudge();
    pDown = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => (pDown = null));
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') az -= 0.1;
    else if (k === 'ArrowRight') az += 0.1;
    else if (k === 'ArrowUp') el = Math.min(1.3, el + 0.08);
    else if (k === 'ArrowDown') el = Math.max(-1.3, el - 0.08);
    else if (k === 'Enter' || k === ' ') nudge();
    else return;
    e.preventDefault();
    if (!loop.running) draw();
  });

  const stopFit = ui.fitCanvas(canvas, () => draw());
  const stopTheme = watchTheme(() => {
    readColors();
    if (pair) {
      draw();
      drawCharts();
    }
  });
  readColors();
  newPair();
  draw();
  if (!ctx.reducedMotion() && !init) setRunning(true);
  else if (ctx.reducedMotion()) hint.textContent = 'Motion is reduced. Press Run to start. Drag to rotate.';

  return {
    getRecord() {
      const sep = pair.separation();
      const gf = growthNow();
      const c = firstCrossing();
      return {
        inputs: { ...vals },
        seed,
        metrics: [
          { name: 'Time', value: pair.t, unit: 'time units' },
          { name: 'Separation', value: sep, unit: '', note: 'Euclidean distance between A and B' },
          { name: 'Saturation scale', value: Number.isFinite(pair.saturation()) ? pair.saturation() : null, unit: '' },
          { name: 'Time until separation reaches 1', value: c, unit: 'time units', note: c === null ? 'not reached' : undefined },
          { name: 'Growth rate of ln separation', value: gf && Number.isFinite(gf.slope) ? gf.slope : null, unit: '1/time', note: 'least-squares fit' },
          { name: 'Lyapunov estimate', value: lyap && lyap.value !== undefined ? lyap.value : null, unit: '1/time', note: lyap && lyap.value !== undefined ? `renormalised, T = ${lyap.T}` : 'not computed' },
          { name: 'Blow-up', value: failedMsg ? 1 : 0, unit: '', note: failedMsg || 'none' },
        ],
        diagnostics: { steps: pair.steps, fps: loop.fps, stepsPerFrame: stepsEff, nudges, samples: hist.t.length },
        elapsedMs: performance.now() - startedAt,
      };
    },
    getTable() {
      return { columns: ['t', 'separation', 'x_A', 'x_B', 'z_A', 'z_B'], rows: hist.t.map((t, i) => [t, hist.d[i], hist.ax[i], hist.bx[i], hist.az[i], hist.bz[i]]) };
    },
    destroy() {
      stopFit();
      stopTheme();
      loop.stop();
      if (lyapJob) lyapJob.cancel();
      chartSep.destroy();
      chartX.destroy();
    },
  };
}
