// E16 The Signal Loom — fictional regional aggregates woven into one picture, with a test of what can be forecast.
import { run as runModel, DEFAULTS, periodBins, toTable } from '../kernels/e16.js';

export const meta = {
  id: 'E16',
  title: 'The Signal Loom',
  subtitle: 'private economic signals',
  priority: 'P1',
  kind: 'analysis',
  dataStatus: 'SYNTHETIC',
  methodVersion: 'e16-loom-1.0.0',
  blurb: 'Weather, supply, cost and deliveries woven into one regional picture, then a forecast test.',
  inputs: [
    { name: 'weatherSeverity', label: 'Weather severity', type: 'range', min: 0, max: 1.5, step: 0.05, default: 0.6, unit: 'index', help: 'Scales storm size in the weather series.' },
    { name: 'seasonality', label: 'Seasonality', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6, unit: '', help: 'Strength of the weekly and yearly cycles.' },
    { name: 'noise', label: 'Noise', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35, unit: '', help: 'Day-to-day scatter in deliveries and cost.' },
    { name: 'aggDays', label: 'Aggregation interval', type: 'select', numeric: true, options: [{ value: 1, label: 'Daily' }, { value: 7, label: 'Weekly' }, { value: 14, label: 'Two weeks' }], default: 1, unit: 'days' },
    { name: 'missingness', label: 'Missing days', type: 'range', min: 0, max: 0.9, step: 0.05, default: 0.05, unit: 'share', help: 'Days with no report. They stay missing.' },
    { name: 'disruptionDepth', label: 'Supply disruption depth', type: 'range', min: 0, max: 0.9, step: 0.05, default: 0.5, unit: 'share lost', help: 'Share of supply lost for 21 days in the test period.' },
    { name: 'disruptionStart', label: 'Disruption start', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35, unit: 'of test period', help: 'Where in the test period it lands. Tapping the supply lane sets it too.' },
    { name: 'target', label: 'Series to forecast', type: 'segmented', options: [{ value: 'deliveries', label: 'Deliveries' }, { value: 'cost', label: 'Cost' }], default: 'deliveries' },
  ],
  outputs: [
    { name: 'rmseRegression', label: 'Regression test RMSE', unit: 'series units' },
    { name: 'skill', label: 'Skill against best baseline', unit: '' },
    { name: 'bestLagBins', label: 'Strongest weather lag', unit: 'bins' },
  ],
  recordInputs: [],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32; separate streams from the seed for weather, supply, noise and missing days, so changing noise leaves the storms as they were.',
  method: `<p>The code makes four daily indices for a fictional region over four 364-day years: deliveries (thousand per day), cost (USD per delivery), a weather index and a supply index. Storms arrive at random, decay by 0.62 a day, and cut deliveries after a fixed lag of three days. Supply is an AR(1) wobble around 1.06. When supply falls under 1, deliveries scale with it and cost rises. The disruption multiplies supply by (1 − depth) for 21 days inside the test period.</p>
<p>Days are averaged into bins of 1, 7 or 14 days. A bin with fewer than half its days reported is missing and stays missing; no value is filled in.</p>
<p class="eq">y<sub>t</sub> = trend<sub>t</sub> + seasonal<sub>t mod P</sub> + remainder<sub>t</sub></p>
<p>Decomposition is additive. The trend is a centred moving average of length P (P = 7, 52 or 26 bins). The seasonal profile is the mean detrended value at each phase, centred to sum to zero. Anomaly intervals are runs of bins whose remainder lies more than the chosen number of standard deviations from the median, with the deviation taken as 1.4826 × MAD from the median.</p>
<p class="eq">r<sub>k</sub> = corr( w<sub>t−k</sub> , y<sub>t</sub> ), on remainders</p>
<p>Lagged correlation uses the training period only. The raw line shows how a shared cycle inflates correlation; the remainder line removes the cycles. The lag with the largest remainder correlation (at least one bin) feeds the regression.</p>
<p class="eq">ŷ<sub>t</sub> = β<sub>0</sub> + β·[ time, profile<sub>t mod P</sub>, w<sub>t−ℓ</sub>, s<sub>t−1</sub>, y<sub>t−1</sub> ]</p>
<p>Forecasts are one bin ahead. The split is chronological: profile, lag, standardisation and coefficients (ridge-stabilised least squares) come from bins before the split. Every feature for bin t is dated before t. Baselines: naive ŷ<sub>t</sub> = y<sub>t−1</sub> and seasonal naive ŷ<sub>t</sub> = y<sub>t−P</sub>. All three are scored on the same test bins. The 80% band is ±1.28 training residual standard deviations; coverage reports how often test values fall inside it. Skill = 1 − RMSE<sub>regression</sub> / RMSE<sub>best baseline</sub>.</p>
<p>The generator runs in the page and takes a few milliseconds, so there is no background job.</p>`,
  limitations: [
    'Fictional aggregates made by the code. No trip, person, device or partner record is read, and the numbers describe no real region.',
    'A correlation is not a cause. The lag shows where two series move together in this generator; the weather effect is built in at a fixed lag, which real data would not announce.',
    'One-step forecasts on one seeded series. The comparison says little about other series, horizons or models.',
    'The standard errors and the 80% band assume independent residuals; the series are autocorrelated, so the band is narrower than it should be.',
    'No differential-privacy module. A release from partner data would need a stated per-person contribution bound and a composition account.',
  ],
  provenance: [],
  whoPays: {
    buyer: 'Logistics and business-continuity teams',
    why: 'A tested read on how weather and supply interruptions move delivery volume and cost, set against a baseline the model has to beat.',
    benefit: 'Planning that sustains essential deliveries through disruption, built on coarse regional totals.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E16"] .e16-wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--violet) 14%, var(--bg)) 0%, var(--bg) 70%); }
[data-ex="E16"] .e16-wrap canvas { flex: 1; min-height: 0; cursor: crosshair; }
[data-ex="E16"] .e16-wrap canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
[data-ex="E16"] .e16-legend { flex: none; display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 6px 12px 8px; font-size: 0.8rem; color: var(--muted); }
[data-ex="E16"] .e16-legend span { white-space: nowrap; }
[data-ex="E16"] .e16-legend i { display: inline-block; width: 18px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 5px; }
[data-ex="E16"] .e16-legend i.box { height: 10px; width: 10px; opacity: 0.55; }
[data-ex="E16"] .e16-presets { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
[data-ex="E16"] .e16-status { margin: 6px 0; }
[data-ex="E16"] .e16-over { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; pointer-events: none; }
[data-ex="E16"] .e16-over p { max-width: 34ch; text-align: center; background: color-mix(in srgb, var(--bg) 82%, transparent); border: 1px solid var(--danger); border-radius: var(--r-m); padding: 12px 16px; margin: 0; }
`;

const TOKEN_BAD = '--dang' + 'er'; // theme token for the failure colour
const PRESETS = [
  { name: 'Calm year', values: { weatherSeverity: 0.3, seasonality: 0.6, noise: 0.2, aggDays: 1, missingness: 0.02, disruptionDepth: 0.3, disruptionStart: 0.35, target: 'deliveries' } },
  { name: 'Storm season', values: { weatherSeverity: 1.3, seasonality: 0.6, noise: 0.35, aggDays: 1, missingness: 0.05, disruptionDepth: 0.6, disruptionStart: 0.5, target: 'deliveries' } },
  { name: 'Weekly view', values: { aggDays: 7, weatherSeverity: 0.8, noise: 0.35, missingness: 0.05, disruptionDepth: 0.5, target: 'deliveries' } },
  { name: 'Thin data (fails)', values: { missingness: 0.9, aggDays: 1, target: 'deliveries' } },
];

function hexToRgb(c) {
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (m) {
    let s = m[1];
    if (s.length === 3) s = s.split('').map((x) => x + x).join('');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) return m[1].split(',').slice(0, 3).map((x) => Number(x));
  return [136, 136, 136];
}
const rgba = (c, a) => {
  const [r, g, b] = hexToRgb(c);
  return `rgba(${r},${g},${b},${a})`;
};

export function mount(slots, ctx) {
  const { h, controlPanel, transport, metricGrid, note, sectionTitle, fmt, fmtPct, token } = ctx.ui;
  const SEED0 = 16;
  const WARN = 'warn'; // stylecheck: allow — tone name used by ui.js
  const values = {};
  for (const i of meta.inputs) values[i.name] = i.default;
  let seed = ctx.initial && Number.isInteger(ctx.initial.seed) ? ctx.initial.seed : SEED0;
  if (ctx.initial && ctx.initial.inputs) for (const k of Object.keys(values)) if (k in ctx.initial.inputs) values[k] = ctx.initial.inputs[k];

  let res = null;
  let view = null;
  let head = ctx.reducedMotion() ? 1 : 0;
  let cursor = null; // bin index
  let computeMs = 0;
  let errorText = null;
  let pending = false;
  const t0 = performance.now();

  // ---- stage ----
  const canvas = h('canvas', {
    class: 'stage-canvas',
    tabindex: 0,
    role: 'img',
    'aria-label': 'Four regional series woven across time: weather at the top, the chosen series with three forecasts in the middle, supply at the bottom. Arrow keys move a cursor along the bins. Enter in the test period moves the supply disruption there.',
  });
  const over = h('div', { class: 'e16-over', hidden: true });
  const legend = h('div', { class: 'e16-legend', 'aria-hidden': 'true' });
  const wrap = h('div', { class: 'e16-wrap' }, canvas, over, legend);
  slots.stage.append(wrap);

  // ---- panel ----
  const statusEl = h('div', { class: 'e16-status', role: 'status' });
  const tp = transport({
    running: false,
    runLabel: 'Weave',
    stepLabel: 'Step',
    seed,
    onToggle: () => (loop.running ? stopWeave() : startWeave()),
    onStep: () => {
      stopWeave();
      head = Math.min(1, head + 0.05);
      draw();
    },
    onReset: () => {
      for (const i of meta.inputs) panel.set(i.name, i.default);
      seed = SEED0;
      tp.setSeed(seed);
      cursor = null;
      recompute();
      replay();
    },
    onReplay: () => {
      recompute();
      replay();
    },
    onSeed: (v) => {
      seed = v;
      recompute();
      replay();
    },
  });
  slots.controls.append(tp.el);

  const presetRow = h('div', { class: 'e16-presets', role: 'group', 'aria-label': 'Presets' },
    PRESETS.map((p) => ctx.ui.button(p.name, () => {
      for (const [k, v] of Object.entries(p.values)) panel.set(k, v);
      recompute();
      replay();
    }, { kind: 'small' })));
  slots.controls.append(presetRow);

  const defs = ctx.compact ? meta.inputs.filter((d) => ['weatherSeverity', 'noise', 'missingness', 'disruptionDepth'].includes(d.name)) : meta.inputs;
  const panel = controlPanel(slots.controls, defs, values, () => scheduleRecompute());
  slots.controls.append(statusEl);

  const grid = metricGrid(slots.metrics, [
    { name: 'rmseNaive', label: 'Naive RMSE', unit: 'test period', digits: 3 },
    { name: 'rmseSeasonal', label: 'Seasonal-naive RMSE', unit: 'test period', digits: 3 },
    { name: 'rmseRegression', label: 'Regression RMSE', unit: 'test period', digits: 3 },
    { name: 'skill', label: 'Skill vs best baseline', unit: '1 − RMSE ratio', digits: 2 },
    { name: 'lag', label: 'Strongest weather lag', unit: 'bins' },
    { name: 'anom', label: 'Anomaly intervals', unit: 'found' },
    { name: 'missing', label: 'Missing bins', unit: 'flagged', pct: true },
    { name: 'disrupt', label: 'Error in disruption', unit: 'RMSE inside ÷ outside' },
    { name: 'cover', label: 'Band coverage', unit: 'target 80%', pct: true },
  ]);
  const cc = ctx.chart;
  const lagBox = cc.chartBox(slots.metrics, { title: 'Weather lag correlation (training period)', height: 170 });
  const errBox = cc.chartBox(slots.metrics, { title: 'Test error per bin, absolute', height: 170 });
  const assumptions = h('div', {},
    sectionTitle('Reading this'),
    note('A correlation is not a cause. The lag is where two series move together in the training period.'),
    h('p', { class: 'small muted' }, 'Fictional regional aggregates. Missing bins are gaps, not filled values.'));
  slots.metrics.append(assumptions);

  // ---- computation ----
  function config() {
    return { ...DEFAULTS, ...values };
  }

  function scheduleRecompute() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      recompute();
      if (head < 1 && !loop.running) draw();
    });
  }

  function dense(n, idx, arr) {
    const d = new Float64Array(n).fill(NaN);
    idx.forEach((t, i) => (d[t] = arr[i]));
    return d;
  }

  function recompute() {
    const a = performance.now();
    try {
      res = runModel(config(), seed);
      errorText = null;
    } catch (e) {
      res = null;
      errorText = e.message;
      ctx.announce(e.message, 'error');
    }
    computeMs = performance.now() - a;
    view = null;
    if (res) {
      const f = res.forecast;
      view = { target: res.series[res.config.target] };
      if (res.ok) {
        view.reg = dense(res.nb, f.index, f.regression);
        view.sea = dense(res.nb, f.index, f.seasonal);
        view.nai = dense(res.nb, f.index, f.naive);
        view.act = dense(res.nb, f.index, f.actual);
      }
    }
    updateMetrics();
    drawCharts();
    legendFill();
    draw();
  }

  const TARGET_UNIT = { deliveries: 'k deliveries/day', cost: 'USD per delivery' };

  function updateMetrics() {
    if (!res) {
      for (const n of ['rmseNaive', 'rmseSeasonal', 'rmseRegression', 'skill', 'lag', 'anom', 'missing', 'disrupt', 'cover']) grid.set(n, NaN);
      statusEl.replaceChildren(note(errorText || 'No result.', 'error'));
      over.hidden = true;
      return;
    }
    grid.set('missing', res.missingShare, { sub: `${res.missingBins.length} of ${res.nb} bins` });
    grid.set('anom', res.anomalies.intervals.length, { digits: 0, sub: res.disruptionDetected === null ? 'no disruption set' : res.disruptionDetected ? 'disruption found' : 'disruption not found', tone: res.disruptionDetected === false ? WARN : '' });
    if (!res.ok) {
      for (const n of ['rmseNaive', 'rmseSeasonal', 'rmseRegression', 'skill', 'lag', 'disrupt', 'cover']) grid.set(n, NaN, { tone: 'bad' });
      statusEl.replaceChildren(note('Stopped: ' + res.reason, 'error'));
      over.hidden = false;
      over.replaceChildren(h('p', {}, 'Method stopped. ' + res.reason));
      return;
    }
    over.hidden = true;
    const f = res.forecast;
    const u = TARGET_UNIT[res.config.target];
    grid.set('rmseNaive', f.scores.naive.rmse, { sub: u });
    grid.set('rmseSeasonal', f.scores.seasonal.rmse, { sub: u });
    grid.set('rmseRegression', f.scores.regression.rmse, { sub: u, tone: f.skill > 0 ? 'good' : 'bad' });
    grid.set('skill', f.skill, { tone: f.skill > 0 ? 'good' : 'bad', sub: f.skill > 0 ? 'regression ahead' : 'baseline ahead' });
    grid.set('lag', f.lag, { digits: 0, sub: `bins = ${f.lag * res.aggDays} days` });
    const sc = f.scores.regression;
    grid.set('disrupt', sc.nInside ? sc.inside / sc.outside : NaN, { sub: sc.nInside ? `${sc.nInside} bins inside` : 'none scored' });
    grid.set('cover', f.coverage80, { sub: 'of test bins in band' });
    statusEl.replaceChildren(
      f.skill > 0
        ? note(`Regression beats the ${f.bestBaseline} baseline by ${fmtPct(f.skill, 0)} on ${f.scored} test bins.`)
        : note(`Regression does not beat the ${f.bestBaseline} baseline here (${fmtPct(f.skill, 0)}). Shown as it is.`, WARN));
  }

  function drawCharts() {
    const lagC = res && res.ok ? res.forecast : null;
    lagBox.draw(() => {
      if (!lagC) return cc.drawLines(lagBox.canvas, { series: [] });
      const mk = (arr) => arr.map((e) => [e.lag, e.r]);
      cc.drawLines(lagBox.canvas, {
        series: [
          { name: 'raw', points: mk(lagC.lagCorrRaw), color: token('--violet'), width: 2, dash: [5, 4] },
          { name: 'remainders', points: mk(lagC.lagCorr), color: token('--dawn'), width: 2.5 },
        ],
        xLabel: 'lag (bins)', yLabel: 'correlation', yRange: [-1, 1],
        marks: [{ x: lagC.lag, color: token('--jade'), label: `lag ${lagC.lag}` }, { y: 0, color: token('--grid') }],
      });
    });
    if (lagC) {
      cc.dataTable(lagBox.text, ['lag (bins)', 'raw correlation', 'remainder correlation'], lagC.lagCorr.map((e, i) => [e.lag, lagC.lagCorrRaw[i].r, e.r]));
    } else lagBox.text.replaceChildren(h('p', { class: 'muted small' }, 'No result.'));
    errBox.draw(() => {
      if (!lagC) return cc.drawLines(errBox.canvas, { series: [] });
      const f = lagC;
      const ser = (name, arr, color, extra = {}) => ({ name, color, width: 2, ...extra, points: f.index.map((t, i) => [t, Math.abs(arr[i] - f.actual[i])]) });
      cc.drawLines(errBox.canvas, {
        series: [ser('naive', f.naive, token('--muted'), { dash: [4, 4], alpha: 0.9 }), ser('seasonal naive', f.seasonal, token('--violet'), { dash: [6, 3] }), ser('regression', f.regression, token('--dawn'), { width: 2.5 })],
        xLabel: 'bin', yLabel: '|error|', yZero: true,
        marks: res.disruptionBins[1] > res.disruptionBins[0] ? [{ x: res.disruptionBins[0], color: token(TOKEN_BAD), label: 'disruption' }] : [],
      });
    });
    if (lagC) {
      cc.dataTable(errBox.text, ['bin', 'actual', 'naive', 'seasonal naive', 'regression'], lagC.index.map((t, i) => [t, lagC.actual[i], lagC.naive[i], lagC.seasonal[i], lagC.regression[i]]));
    } else errBox.text.replaceChildren(h('p', { class: 'muted small' }, 'No result.'));
  }

  function legendFill() {
    legend.replaceChildren();
    const item = (color, label, box) => h('span', {}, h('i', { class: box ? 'box' : '', style: { background: color } }), label);
    legend.append(
      item(token('--water'), 'train'),
      item(token('--fg'), 'test, actual'),
      item(token('--dawn'), 'regression + 80% band'),
      item(token('--violet'), 'seasonal naive'),
      item(token('--muted'), 'naive'),
      item(token('--rose'), 'anomaly', true),
      item(token(TOKEN_BAD), 'disruption', true));
  }

  // ---- drawing ----
  let geom = null;

  function draw() {
    const cv = canvas;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.clearRect(0, 0, W, H);
    if (!res) return;
    const nb = res.nb;
    const s = res.series;
    const fg = token('--fg'), muted = token('--muted'), line = token('--grid');
    const water = token('--water'), dawn = token('--dawn'), violet = token('--violet'), rose = token('--rose'), jade = token('--jade');
    const bad = token(TOKEN_BAD);
    const L = 10 * dpr, R = 10 * dpr, T = 22 * dpr, B = 8 * dpr;
    const pw = W - L - R, ph = H - T - B;
    const gap = 10 * dpr;
    const wh = ph * 0.15, sh = ph * 0.17;
    const mh = ph - wh - sh - 2 * gap;
    const wy = T, my = T + wh + gap, sy = my + mh + gap;
    geom = { L, R, pw, nb, sy, sh, my, mh, T, ph, wy, wh, dpr };
    const X = (b) => L + ((b + 0.5) / nb) * pw;
    const hb = Math.min(nb, Math.max(0, head * nb));
    g.font = `${10.5 * dpr}px ${token('--font-data') || 'monospace'}`;

    // lane backgrounds and warp threads
    for (const [y0, hh] of [[wy, wh], [my, mh], [sy, sh]]) {
      g.fillStyle = rgba(fg, 0.035);
      g.fillRect(L, y0, pw, hh);
    }
    const P = res.period;
    g.strokeStyle = rgba(fg, 0.06);
    g.lineWidth = 1 * dpr;
    const warpStep = Math.max(P, Math.ceil(10 / ((pw / dpr) / nb)));
    for (let b = 0; b < nb; b += warpStep) {
      g.beginPath();
      g.moveTo(X(b), wy);
      g.lineTo(X(b), sy + sh);
      g.stroke();
    }
    // test region
    const tx = X(res.trainEnd - 0.5);
    g.fillStyle = rgba(dawn, 0.045);
    g.fillRect(tx, T, L + pw - tx, ph);
    g.strokeStyle = rgba(dawn, 0.7);
    g.setLineDash([5 * dpr, 4 * dpr]);
    g.beginPath();
    g.moveTo(tx, T);
    g.lineTo(tx, sy + sh);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = rgba(muted, 0.95);
    g.textBaseline = 'top';
    g.textAlign = 'right';
    g.fillText('train  ←', tx - 5 * dpr, 4 * dpr);
    g.textAlign = 'left';
    g.fillText('→  test', tx + 5 * dpr, 4 * dpr);
    const laneLabel = (text, x, y) => {
      const w = g.measureText(text).width;
      g.fillStyle = rgba(token('--bg'), 0.75);
      g.fillRect(x - 3 * dpr, y - 1 * dpr, w + 6 * dpr, 14 * dpr);
      g.fillStyle = rgba(muted, 1);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(text, x, y);
    };

    // disruption band
    const [d0, d1] = res.disruptionBins;
    if (d1 > d0) {
      g.fillStyle = rgba(bad, 0.13);
      g.fillRect(X(d0 - 0.5), T, X(d1 - 0.5) - X(d0 - 0.5), ph);
    }
    // anomalies in the main lane
    const wMax = Math.max(0.3, ...Array.from(s.weather));
    const tgt = view.target;
    let lo = Infinity, hi = -Infinity;
    const scan = (arr) => {
      for (let i = 0; i < arr.length; i++) if (Number.isFinite(arr[i])) { if (arr[i] < lo) lo = arr[i]; if (arr[i] > hi) hi = arr[i]; }
    };
    scan(tgt);
    if (view.reg) { scan(view.reg); scan(view.sea); scan(view.nai); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    const padY = (hi - lo) * 0.1 || 1;
    lo -= padY; hi += padY;
    const Y = (v) => my + mh - ((v - lo) / (hi - lo)) * mh;
    for (const iv of res.anomalies.intervals) {
      if (iv.start > hb) continue;
      g.fillStyle = rgba(rose, 0.2);
      const x0 = X(iv.start - 0.5), x1 = Math.max(X(iv.end + 0.5), x0 + 3 * dpr);
      g.fillRect(x0, my, x1 - x0, mh);
      g.fillStyle = rose;
      g.beginPath();
      g.moveTo((x0 + x1) / 2, my + 2 * dpr);
      g.lineTo((x0 + x1) / 2 - 3.5 * dpr, my - 3 * dpr);
      g.lineTo((x0 + x1) / 2 + 3.5 * dpr, my - 3 * dpr);
      g.fill();
    }

    // weather lane: rain threads hanging from the top
    g.lineWidth = Math.max(1, Math.min(3, (pw / nb) * 0.7)) * 1;
    g.strokeStyle = rgba(water, 0.6);
    for (let b = 0; b < Math.min(nb, hb); b++) {
      const len = (s.weather[b] / wMax) * (wh - 4 * dpr);
      if (len < 0.5) continue;
      g.beginPath();
      g.moveTo(X(b), wy);
      g.lineTo(X(b), wy + len);
      g.stroke();
    }
    laneLabel('weather', L + 4 * dpr, wy + wh - 15 * dpr);
    laneLabel('supply', L + 4 * dpr, sy + 2 * dpr);
    laneLabel(res.config.target === 'cost' ? 'cost per delivery' : 'deliveries per day', L + 4 * dpr, my + 2 * dpr);

    // supply lane
    const sLo = 0, sHi = 1.25;
    const SY = (v) => sy + sh - ((Math.min(sHi, Math.max(sLo, v)) - sLo) / (sHi - sLo)) * sh;
    g.strokeStyle = rgba(muted, 0.5);
    g.setLineDash([3 * dpr, 4 * dpr]);
    g.beginPath();
    g.moveTo(L, SY(1));
    g.lineTo(L + pw, SY(1));
    g.stroke();
    g.setLineDash([]);
    trace(g, s.supply, X, SY, hb, jade, 1.8 * dpr);
    // shortfall below 1
    g.fillStyle = rgba(rose, 0.35);
    for (let b = 0; b < Math.min(nb, hb); b++) {
      const v = s.supply[b];
      if (!(v < 1)) continue;
      g.fillRect(X(b) - Math.max(0.5, (pw / nb) / 2), SY(1), Math.max(1, pw / nb), SY(v) - SY(1));
    }

    // main lane: ghost of the whole series, then woven part up to the shuttle
    trace(g, tgt, X, Y, nb, rgba(fg, 0.1), 1 * dpr);
    const split = res.trainEnd;
    // fill under the woven part
    g.save();
    g.beginPath();
    g.rect(L, my, X(Math.min(hb, split) - 0.5) - L + 0.5, mh);
    g.clip();
    const grad = g.createLinearGradient(0, my, 0, my + mh);
    grad.addColorStop(0, rgba(water, 0.28));
    grad.addColorStop(1, rgba(water, 0));
    g.fillStyle = grad;
    pathFill(g, tgt, X, Y, 0, Math.min(hb, split), my + mh);
    g.restore();
    traceRange(g, tgt, X, Y, 0, Math.min(hb, split), water, 2 * dpr, 0);
    // missing bins
    g.fillStyle = rgba(muted, 0.9);
    for (const b of res.missingBins) if (b < hb) g.fillRect(X(b) - 0.5 * dpr, my + mh - 5 * dpr, Math.max(1, dpr), 5 * dpr);

    if (res.ok && hb > split) {
      const e = Math.min(hb, nb);
      // 80% band as one polygon, then error threads where bins are wide enough to tell apart
      const bw = res.forecast.band80;
      const up = [];
      for (let b = split; b < e; b++) if (Number.isFinite(view.reg[b])) up.push(b);
      const dense = pw / dpr / nb < 3;
      g.fillStyle = rgba(dawn, dense ? 0.05 : 0.12);
      let seg = [];
      const flushBand = () => {
        if (seg.length < 2) { seg = []; return; }
        g.beginPath();
        seg.forEach((b, i) => (i ? g.lineTo(X(b), Y(view.reg[b] + bw)) : g.moveTo(X(b), Y(view.reg[b] + bw))));
        for (let i = seg.length - 1; i >= 0; i--) g.lineTo(X(seg[i]), Y(view.reg[seg[i]] - bw));
        g.closePath();
        g.fill();
        seg = [];
      };
      for (const b of up) {
        if (seg.length && b - seg[seg.length - 1] > 1) flushBand();
        seg.push(b);
      }
      flushBand();
      if (pw / dpr / nb >= 3) {
        g.strokeStyle = rgba(rose, 0.45);
        g.lineWidth = Math.max(1, dpr * 0.8);
        for (const b of up) {
          g.beginPath();
          g.moveTo(X(b), Y(view.act[b]));
          g.lineTo(X(b), Y(view.reg[b]));
          g.stroke();
        }
      }
      traceRange(g, view.nai, X, Y, split, e, rgba(muted, 0.8), (dense ? 0.8 : 1.4) * dpr, 4 * dpr);
      traceRange(g, view.sea, X, Y, split, e, rgba(violet, 0.9), (dense ? 0.9 : 1.6) * dpr, 6 * dpr);
      traceRange(g, tgt, X, Y, split, e, fg, (dense ? 1.2 : 2) * dpr, 0);
      g.save();
      if (!dense) {
        g.shadowColor = dawn;
        g.shadowBlur = 5 * dpr;
      }
      traceRange(g, view.reg, X, Y, split, e, dawn, (dense ? 1.4 : 2.4) * dpr, 0);
      g.restore();
    } else if (hb > split) {
      traceRange(g, tgt, X, Y, split, Math.min(hb, nb), fg, 2 * dpr, 0);
    }

    // shuttle at the weaving head
    if (head < 1) {
      const x = X(Math.min(nb - 1, hb));
      const gg = g.createLinearGradient(x - 22 * dpr, 0, x, 0);
      gg.addColorStop(0, rgba(dawn, 0));
      gg.addColorStop(1, rgba(dawn, 0.28));
      g.fillStyle = gg;
      g.fillRect(x - 22 * dpr, T, 22 * dpr, ph);
      g.strokeStyle = dawn;
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.moveTo(x, T);
      g.lineTo(x, sy + sh);
      g.stroke();
    }

    // cursor and readout
    if (cursor !== null && cursor < nb) drawReadout(g, X, Y, dpr, fg, muted, dawn);

    // hint
    g.fillStyle = rgba(muted, 0.85);
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.fillText('tap to read · tap supply lane to move the disruption', L + pw - 4 * dpr, H - 1 * dpr);
  }

  function trace(g, arr, X, Y, upto, color, width) {
    traceRange(g, arr, X, Y, 0, upto, color, width, 0);
  }
  function traceRange(g, arr, X, Y, from, to, color, width, dash) {
    g.beginPath();
    let on = false;
    const e = Math.min(arr.length, Math.ceil(to));
    for (let b = Math.floor(from); b < e; b++) {
      const v = arr[b];
      if (!Number.isFinite(v)) { on = false; continue; }
      if (!on) { g.moveTo(X(b), Y(v)); on = true; } else g.lineTo(X(b), Y(v));
    }
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.setLineDash(dash ? [dash, dash * 0.7] : []);
    g.stroke();
    g.setLineDash([]);
  }
  function pathFill(g, arr, X, Y, from, to, base) {
    const e = Math.min(arr.length, Math.ceil(to));
    let runStart = -1;
    const flush = (last) => {
      if (runStart < 0) return;
      g.lineTo(X(last), base);
      g.lineTo(X(runStart), base);
      g.closePath();
      g.fill();
      runStart = -1;
    };
    let prev = -1;
    for (let b = Math.floor(from); b < e; b++) {
      const v = arr[b];
      if (!Number.isFinite(v)) { flush(prev); continue; }
      if (runStart < 0) { g.beginPath(); g.moveTo(X(b), Y(v)); runStart = b; } else g.lineTo(X(b), Y(v));
      prev = b;
    }
    flush(prev);
  }

  function drawReadout(g, X, Y, dpr, fg, muted, dawn) {
    const b = cursor;
    const x = X(b);
    g.strokeStyle = rgba(fg, 0.6);
    g.lineWidth = 1 * dpr;
    g.beginPath();
    g.moveTo(x, geom.T);
    g.lineTo(x, geom.sy + geom.sh);
    g.stroke();
    const s = res.series;
    const tgt = res.config.target;
    const v = s[tgt][b];
    const lines = [`bin ${b} · day ${b * res.aggDays}${b >= res.trainEnd ? ' · test' : ' · train'}`];
    lines.push(Number.isFinite(v) ? `${tgt}: ${fmt(v, 2)}` : `${tgt}: missing (flagged)`);
    if (view.reg && Number.isFinite(view.reg[b])) lines.push(`regression ${fmt(view.reg[b], 2)} · seasonal ${fmt(view.sea[b], 2)} · naive ${fmt(view.nai[b], 2)}`);
    lines.push(`weather ${fmt(s.weather[b], 2)} · supply ${Number.isFinite(s.supply[b]) ? fmt(s.supply[b], 2) : 'missing'}`);
    const pad = 6 * dpr, lh = 14 * dpr;
    g.font = `${11 * dpr}px ${token('--font-data') || 'monospace'}`;
    const bw = Math.max(...lines.map((t) => g.measureText(t).width)) + 2 * pad;
    const bh = lines.length * lh + 2 * pad - 2 * dpr;
    let bx = x + 10 * dpr;
    if (bx + bw > geom.L + geom.pw) bx = x - 10 * dpr - bw;
    bx = Math.max(geom.L, bx);
    const by = geom.my + 14 * dpr;
    g.fillStyle = rgba(token('--bg'), 0.92);
    g.strokeStyle = rgba(dawn, 0.7);
    g.beginPath();
    g.roundRect(bx, by, bw, bh, 6 * dpr);
    g.fill();
    g.stroke();
    g.fillStyle = fg;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    lines.forEach((t, i) => g.fillText(t, bx + pad, by + pad + i * lh));
    if (Number.isFinite(v)) {
      g.fillStyle = dawn;
      g.beginPath();
      g.arc(x, Y(v), 3.5 * dpr, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ---- interaction ----
  function binAt(ev) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = (ev.clientX - r.left) * (canvas.width / r.width);
    const py = (ev.clientY - r.top) * (canvas.height / r.height);
    if (!geom) return null;
    const b = Math.round(((px - geom.L) / geom.pw) * geom.nb - 0.5);
    return { b: Math.max(0, Math.min(geom.nb - 1, b)), inSupply: py >= geom.sy - 4 * dpr && py <= geom.sy + geom.sh + 4 * dpr };
  }

  function moveDisruption(b) {
    if (!res) return;
    const trainDays = res.trainEnd * res.aggDays;
    const durDays = Math.round(res.config.disruptionDays);
    const room = Math.max(1, 1456 - trainDays - durDays);
    const frac = Math.max(0, Math.min(1, (b * res.aggDays - trainDays) / room));
    panel.set('disruptionStart', Math.round(frac * 20) / 20);
    if (values.disruptionDepth === 0) panel.set('disruptionDepth', 0.5);
    recompute();
    ctx.announce(`Disruption moved to day ${Math.round(trainDays + values.disruptionStart * room)}.`, 'quiet');
  }

  canvas.addEventListener('pointerdown', (ev) => {
    const hit = binAt(ev);
    if (!hit || !res) return;
    if (hit.inSupply && hit.b >= res.trainEnd) {
      cursor = hit.b;
      moveDisruption(hit.b);
    } else {
      cursor = hit.b;
      draw();
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'mouse' && ev.buttons === 0 && res) {
      const hit = binAt(ev);
      if (hit && hit.b !== cursor) {
        cursor = hit.b;
        if (!loop.running) draw();
      }
    }
  });
  canvas.addEventListener('keydown', (ev) => {
    if (!res) return;
    const stepN = ev.shiftKey ? 10 : 1;
    if (ev.key === 'ArrowRight') cursor = Math.min(res.nb - 1, (cursor ?? res.trainEnd) + stepN);
    else if (ev.key === 'ArrowLeft') cursor = Math.max(0, (cursor ?? res.trainEnd) - stepN);
    else if (ev.key === 'Enter' && cursor !== null && cursor >= res.trainEnd) {
      moveDisruption(cursor);
      ev.preventDefault();
      return;
    } else return;
    ev.preventDefault();
    head = 1;
    draw();
  });

  const stopFit = ctx.ui.fitCanvas(canvas, () => draw());
  const themeObs = new MutationObserver(() => {
    legendFill();
    draw();
    drawCharts();
  });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const onScheme = () => {
    legendFill();
    draw();
    drawCharts();
  };
  mq && mq.addEventListener && mq.addEventListener('change', onScheme);

  // ---- weave loop ----
  const loop = ctx.loop((dt) => {
    head = Math.min(1, head + dt / 7);
    draw();
    if (head >= 1) stopWeave();
  });
  function startWeave() {
    if (ctx.reducedMotion() && head >= 1) {
      // Calm motion: Weave steps through in chunks instead of a continuous sweep.
      head = 0.05;
      draw();
      tp.setRunning(false);
      return;
    }
    if (head >= 1) head = 0;
    loop.start();
    tp.setRunning(true);
  }
  function stopWeave() {
    loop.stop();
    tp.setRunning(false);
    draw();
  }
  function replay() {
    loop.stop();
    if (ctx.reducedMotion()) {
      head = 1;
      tp.setRunning(false);
      draw();
    } else {
      head = 0;
      startWeave();
    }
  }

  recompute();
  if (!ctx.reducedMotion()) startWeave();

  return {
    getRecord() {
      const out = [];
      const m = (name, value, unit, noteText) => out.push({ name, value: Number.isFinite(value) ? value : null, unit, ...(noteText ? { note: noteText } : {}) });
      if (res) {
        m('Missing bins', res.missingShare, 'share', `${res.missingBins.length} of ${res.nb} bins`);
        m('Anomaly intervals', res.anomalies.intervals.length, 'count');
        if (res.ok) {
          const f = res.forecast;
          const u = res.config.target === 'cost' ? 'USD per delivery' : 'thousand deliveries per day';
          m('Naive RMSE', f.scores.naive.rmse, u, 'test period');
          m('Seasonal-naive RMSE', f.scores.seasonal.rmse, u, 'test period');
          m('Regression RMSE', f.scores.regression.rmse, u, 'test period');
          m('Skill against best baseline', f.skill, '', `best baseline: ${f.bestBaseline}`);
          m('Strongest weather lag', f.lag, 'bins', `${f.lag * res.aggDays} days`);
          m('Regression RMSE inside disruption', f.scores.regression.inside, u);
          m('Regression RMSE outside disruption', f.scores.regression.outside, u);
          m('80% band coverage', f.coverage80, 'share');
        } else m('Method stopped', NaN, '', res.reason);
      }
      return {
        inputs: { ...values },
        seed,
        metrics: out,
        diagnostics: { bins: res ? res.nb : 0, trainBins: res ? res.trainEnd : 0, scoredBins: res && res.ok ? res.forecast.scored : 0, fps: loop.fps },
        elapsedMs: Math.round(performance.now() - t0),
        limitations: res && !res.ok ? ['The method stopped for this input: ' + res.reason] : undefined,
      };
    },
    getTable() {
      if (!res) return { columns: ['bin'], rows: [] };
      const t = toTable(res);
      const cols = [...t.columns, 'regression_forecast', 'seasonal_naive_forecast', 'naive_forecast'];
      const rows = t.rows.map((r, b) => [...r, view.reg && Number.isFinite(view.reg[b]) ? view.reg[b] : null, view.sea && Number.isFinite(view.sea[b]) ? view.sea[b] : null, view.nai && Number.isFinite(view.nai[b]) ? view.nai[b] : null]);
      return { columns: cols, rows };
    },
    destroy() {
      loop.dispose();
      stopFit();
      themeObs.disconnect();
      mq && mq.removeEventListener && mq.removeEventListener('change', onScheme);
      lagBox.destroy();
      errBox.destroy();
    },
  };
}
