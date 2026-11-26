// E13 The Invisible Landscape: inverse problems on a fictional buried layer. See CONTRACT.md.
import { LIMITS, PRIOR, DOMAIN_KM, randomSequence, N_TEST } from '../kernels/e13.js';

const NMAX_RUN = 60;

export const meta = {
  id: 'E13',
  title: 'The Invisible Landscape',
  subtitle: 'inverse problems',
  priority: 'P1',
  kind: 'analysis',
  dataStatus: 'SYNTHETIC',
  methodVersion: 'e13-inverse-gp-1.0.0',
  blurb: 'Rebuild a hidden surface from a few noisy samples and see where the method knows and where it guesses.',
  inputs: [
    { name: 'method', label: 'Method', type: 'select', default: 'gp', options: [
      { value: 'gp', label: 'Gaussian process (with uncertainty)' },
      { value: 'rbf', label: 'Regularised RBF' },
      { value: 'idw', label: 'Inverse distance weighting' },
    ] },
    { name: 'placement', label: 'Sample placement', type: 'select', default: 'random', options: [
      { value: 'random', label: 'Random' },
      { value: 'grid', label: 'Even grid' },
      { value: 'clustered', label: 'Clustered in one corner' },
      { value: 'adaptive', label: 'Adaptive (largest variance next)' },
      { value: 'manual', label: 'Placed by hand' },
    ] },
    { name: 'n', label: 'Samples', type: 'range', min: LIMITS.n[0], max: LIMITS.n[1], step: 1, default: 24, unit: '', integer: true, help: 'Tap the map to add or remove a sample.' },
    { name: 'noise_sd_m', label: 'Measurement noise sd', type: 'range', min: 0, max: LIMITS.noise_sd_m[1], step: 0.05, default: 0.5, unit: 'm' },
    { name: 'ell_km', label: 'Length scale ℓ', type: 'range', min: LIMITS.ell_km[0], max: LIMITS.ell_km[1], step: 0.05, default: 1.6, unit: 'km', help: 'Used by the Gaussian process and the RBF.' },
    { name: 'reg', label: 'RBF ridge, log10 λ', type: 'range', min: LIMITS.reg[0], max: LIMITS.reg[1], step: 0.1, default: -2, unit: '' },
    { name: 'idw_power', label: 'IDW power p', type: 'range', min: LIMITS.idw_power[0], max: LIMITS.idw_power[1], step: 0.1, default: 2, unit: '' },
    { name: 'roughness', label: 'Truth feature size', type: 'range', min: LIMITS.roughness[0], max: LIMITS.roughness[1], step: 0.05, default: 1.5, unit: 'km' },
  ],
  outputs: [
    { name: 'rmse_test', label: 'Test-point RMSE', unit: 'm' },
    { name: 'cv_rmse', label: '5-fold CV RMSE', unit: 'm' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: `mulberry32 streams derived from the seed by label: e13.truth (trend and ten bumps), e13.samples, e13.grid, e13.cluster (placements), e13.noise (one normal draw per sample, scaled by the noise slider), e13.test (${N_TEST} test-point points), e13.folds (cross-validation folds). Repeated-seed comparison uses e13.rep0, e13.rep1 and so on.`,
  method: `<p>The hidden surface is a depth in metres of a fictional buried layer on a 10 km × 10 km square: a gentle trend plus ten Gaussian bumps, mean about ${PRIOR.mean_m} m. A sample at (x, y) returns the truth there plus Gaussian noise.</p>
<p><b>Gaussian process (GP).</b> Prior mean m₀ = ${PRIOR.mean_m} m, covariance k(r) = s₀² exp(−r² / 2ℓ²) with s₀ = ${PRIOR.sd_m} m, noise variance σ². With data X, y:</p>
<p class="eq">mean(x) = m₀ + k(x)ᵀ (K + σ²I)⁻¹ (y − m₀)  ·  var(x) = k(x,x) − k(x)ᵀ (K + σ²I)⁻¹ k(x)</p>
<p>Solved by Cholesky factorisation with a nugget of 10⁻⁶ s₀² added to the diagonal. If the factorisation fails the exhibit stops and says so. With no data the GP returns the prior: mean m₀, sd s₀ everywhere.</p>
<p><b>Regularised RBF.</b> A sum of Gaussian bumps of width ℓ plus the mean of the data, with ridge λ = 10<sup>reg</sup> on the same Cholesky solve. It has the same mean form as a GP but no covariance claim, so it reports no uncertainty. <b>IDW.</b> Weights d<sup>−p</sup>; it returns each noisy sample exactly, which shows as bullseyes.</p>
<p><b>Test-point error.</b> ${N_TEST} points from a separate random stream are never used to fit. RMSE, MAE and bias are measured against the noise-free truth there. The 5-fold CV RMSE uses the samples only, as a surveyor without the truth would, and is measured against noisy values.</p>
<p><b>Uncertainty only when justified.</b> Only the GP reports a standard deviation. Its covariance is checked with leave-one-out standardised residuals from the closed form r<sub>i</sub> = [K⁻¹(y − m₀)]<sub>i</sub> / [K⁻¹]<sub>ii</sub>, variance 1/[K⁻¹]<sub>ii</sub>. The band counts as justified when at least 85% of the residuals fall inside 95% bands. Otherwise the exhibit says the claim fails.</p>
<p><b>Next sensor.</b> For the GP, the point with the largest posterior variance. The expected information gain from one more sample is ½ ln(1 + var / σ²), which grows with variance, so both rules pick the same point. IDW and RBF have no variance; they get the point farthest from every sample.</p>
<p><b>Random against adaptive.</b> A background job draws 12 seeds, each with its own truth. For each, a random sequence and an adaptive sequence (4 random points, then the largest variance) are fitted at n = 8, 12 … 40 with the same ℓ and noise, and RMSE is taken on a 20 × 20 grid. The chart shows the mean and standard error; the count of seeds where adaptive wins at n = 40 is printed as measured.</p>`,
  limitations: [
    'The truth is a seeded sum of smooth bumps. A real subsurface is rougher and has structure no stationary covariance describes.',
    'The GP uses the length scale you set. Leave-one-out checks it from the samples; with few samples the check is weak.',
    'Test-point error uses the generator\'s own truth, which a surveyor does not have. Cross-validation is the number a surveyor can compute.',
    'Adaptive placement can lose to random placement, since it favours edges and corners. The comparison reports what the seeds give.',
    'Not a survey design tool for any real site.',
  ],
  provenance: [],
  whoPays: { buyer: 'Survey and sensor-network planners', why: 'Where to put the next sensor and how much a layout leaves unknown.', benefit: 'Shared sensor layouts that cover gaps, once real data and validation exist.' },
  researchOnly: false,
};

export const css = `
[data-ex="E13"] .e13-bar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; padding: 8px 12px 0; }
[data-ex="E13"] .e13-bar .ctl { padding: 0; border: 0; }
[data-ex="E13"] .e13-cap { flex: none; padding: 4px 12px 8px; font-size: 0.85rem; color: var(--muted); min-height: 2.4em; }
[data-ex="E13"] canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
[data-ex="E13"] .e13-btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
[data-ex="E13"] .e13-status { margin: 6px 0; display: grid; gap: 6px; }
@media (max-width: 860px), (orientation: portrait) and (max-width: 1100px) {
  [data-ex="E13"] .stage-split { padding: 4px; gap: 4px; }
  [data-ex="E13"] .stage-label { font-size: 0.72rem; padding: 2px 8px; }
  [data-ex="E13"] .e13-bar .ctl:nth-child(2) { display: none; }
  [data-ex="E13"] .e13-bar .seg { padding: 4px 9px; font-size: 0.8rem; }
  [data-ex="E13"] .e13-bar .ctl-top { display: none; }
}
`;

const DEFAULTS = Object.fromEntries(meta.inputs.map((i) => [i.name, i.default]));
const VIEWS = [{ value: 'truth', label: 'Truth' }, { value: 'recon', label: 'Rebuilt' }, { value: 'err', label: 'Error' }, { value: 'sd', label: 'Uncertainty' }];
const NAMES = { truth: 'Truth (hidden from the fit)', recon: 'Rebuilt surface', err: 'Rebuilt minus truth', sd: 'Posterior sd (GP only)' };

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
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const values = { ...DEFAULTS, ...((ctx.initial && ctx.initial.inputs) || {}) };
  let seed = ctx.initial && Number.isInteger(ctx.initial.seed) ? ctx.initial.seed : 13;
  let manual = [];
  let res = null, pending = false, fitMs = 0, fitWhere = '', fitJob = null, cmpJob = null, timer = 0, cmpTimer = 0, acc = 0;
  let cmp = null, cmpState = 'idle', cmpMs = 0;
  let views = ['recon', 'truth'];
  let pal = null, cursor = [5, 5], focused = -1, drawMs = 0, drawn = 0;
  const geo = [null, null];

  const palette = () => ({
    violet: rgbOf(ui.token('--violet')), water: rgbOf(ui.token('--water')), jade: rgbOf(ui.token('--jade')), dawn: rgbOf(ui.token('--dawn')),
    rose: rgbOf(ui.token('--rose')), bg: rgbOf(ui.token('--bg')), bg2: rgbOf(ui.token('--bg-2')), fg: rgbOf(ui.token('--fg')), muted: rgbOf(ui.token('--muted')),
  });
  const depthRamp = (t) => {
    t = clamp01(t);
    if (t < 0.33) return mix(pal.violet, pal.water, t / 0.33);
    if (t < 0.66) return mix(pal.water, pal.jade, (t - 0.33) / 0.33);
    return mix(pal.jade, pal.dawn, (t - 0.66) / 0.34);
  };

  // ---- stage ----
  const mk = (i) => h('canvas', { class: 'stage-canvas', tabindex: 0, role: 'img', 'aria-label': 'Map of the 10 km square. Tap to add or remove a sample. Arrow keys move a cursor; Enter adds or removes a sample.' });
  const cv = [mk(0), mk(1)];
  const lab = [h('div', { class: 'stage-label' }, ''), h('div', { class: 'stage-label' }, '')];
  const mkView = (i) => ui.segmented({ name: 'view' + i, label: i === 0 ? 'Left' : 'Right', options: VIEWS }, views[i], (v) => { views[i] = v; draw(); });
  const cap = h('div', { class: 'e13-cap', 'aria-live': 'polite' }, '');
  slots.stage.append(
    h('div', { class: 'e13-bar' }, mkView(0).el, mkView(1).el),
    h('div', { class: 'stage-split' }, h('div', {}, cv[0], lab[0]), h('div', {}, cv[1], lab[1])),
    cap);

  // ---- controls ----
  const status = h('div', { class: 'e13-status', role: 'status' });
  const tp = ui.transport({
    seed, running: false, stepLabel: 'Add suggested',
    onToggle: () => {
      if (loop.running) { loop.stop(); tp.setRunning(false); return; }
      acc = 1;
      loop.start();
      tp.setRunning(true);
    },
    onStep: () => { loop.stop(); tp.setRunning(false); addSuggested(); },
    onReset: () => {
      loop.stop(); tp.setRunning(false);
      manual = [];
      Object.assign(values, DEFAULTS);
      panel.setAll(DEFAULTS);
      requestFit(true);
    },
    onReplay: () => {
      manual = randomSequence(seed, 4);
      setValue('placement', 'manual');
      setValue('n', 4);
      acc = 0;
      loop.start();
      tp.setRunning(true);
      requestFit(true);
    },
    onSeed: (v) => { seed = v; manual = []; if (values.placement === 'manual') setValue('placement', 'random'); requestFit(true); },
  });
  const setValue = (name, v) => { values[name] = v; panel.set(name, v); };
  const panel = ui.controlPanel(slots.controls, meta.inputs, values, (name) => {
    if (name === 'placement' && values.placement === 'manual' && !manual.length && res) manual = res.samples.map((s) => [s[0], s[1]]);
    if (name === 'n' && values.placement === 'manual') {
      if (values.n < manual.length) manual = manual.slice(0, values.n);
      else if (values.n > manual.length) manual = manual.concat(randomSequence(seed, values.n).slice(manual.length));
    }
    if (name === 'ell_km' || name === 'noise_sd_m' || name === 'roughness') scheduleCompare();
    requestFit();
  });
  slots.controls.prepend(tp.el);
  const mkBtn = (label, fn, title) => ui.button(label, fn, { kind: 'small', title });
  slots.controls.append(
    h('div', { class: 'e13e-x e13-btns' },
      mkBtn('Add suggested sensor', () => { loop.stop(); tp.setRunning(false); addSuggested(); }, 'Place the next sensor where the method says to'),
      mkBtn('Remove last', () => { toManual(); manual.pop(); syncN(); }),
      mkBtn('Clear samples', () => { toManual(); manual = []; syncN(); }),
      mkBtn('Best length scale', () => bestEll(), 'Set ℓ to the value with the lowest leave-one-out error')),
    h('div', { class: 'e13-btns' },
      mkBtn('Failure case: clustered', () => { setValue('placement', 'clustered'); setValue('method', 'gp'); setValue('n', 30); requestFit(true); }, 'All samples in one corner'),
      mkBtn('Failure case: too long ℓ', () => { setValue('placement', 'random'); setValue('method', 'gp'); setValue('ell_km', 5); setValue('n', 30); requestFit(true); scheduleCompare(); }, 'An over-confident covariance')),
    status);

  // ---- metrics ----
  const mg = ui.metricGrid(slots.metrics, [
    { name: 'n', label: 'Samples', digits: 0 },
    { name: 'rmse', label: 'Test-point RMSE', unit: 'm', digits: 3, help: `${N_TEST} points never used to fit, against the noise-free truth` },
    { name: 'mae', label: 'Test-point MAE', unit: 'm', digits: 3 },
    { name: 'cv', label: '5-fold CV RMSE', unit: 'm', digits: 3, help: 'From the samples only' },
    { name: 'skill', label: 'Skill against the prior', digits: 2, help: '1 − RMSE / RMSE of predicting the prior mean everywhere' },
    { name: 'bias', label: 'Bias', unit: 'm', digits: 3 },
    { name: 'unc', label: 'Uncertainty', wide: true },
    { name: 'next', label: 'Suggested next sensor', wide: true },
  ]);
  const cScan = chart.chartBox(slots.metrics, { title: 'Leave-one-out error by length scale', height: 170 });
  const cCmp = chart.chartBox(slots.metrics, { title: 'Random vs adaptive placement over 12 seeds: RMSE on a grid', height: 190 });
  const cmpNote = h('p', { class: 'note' }, '');
  slots.metrics.append(cmpNote);

  // ---- logic ----
  const loop = ctx.loop((dt) => {
    acc += dt;
    if (acc > 0.8 && !pending && res && res.ok && res.next) {
      acc = 0;
      if (values.n >= NMAX_RUN) { loop.stop(); tp.setRunning(false); return; }
      addSuggested();
    }
  });

  function toManual() {
    if (values.placement !== 'manual') {
      manual = res ? res.samples.map((s) => [s[0], s[1]]) : [];
      setValue('placement', 'manual');
    }
  }
  function syncN() {
    setValue('n', manual.length);
    requestFit(true);
  }
  function addSuggested() {
    if (!res || !res.ok || !res.next || values.n >= LIMITS.n[1]) return;
    toManual();
    manual.push([res.next.x, res.next.y]);
    syncN();
  }
  function toggleAt(x, y) {
    toManual();
    let k = -1, bd = 0.35;
    manual.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; k = i; } });
    if (k >= 0) manual.splice(k, 1);
    else if (manual.length < LIMITS.n[1]) manual.push([x, y]);
    syncN();
  }
  function bestEll() {
    if (!res || !res.scan) { ctx.announce('Needs at least 8 samples.', 'error'); return; }
    let best = null;
    for (const s of res.scan) if (s.loo_rmse !== null && (!best || s.loo_rmse < best.loo_rmse)) best = s;
    if (best) { setValue('ell_km', best.ell_km); scheduleCompare(); requestFit(true); ctx.announce(`Length scale set to ${best.ell_km} km.`); }
  }

  function requestFit(immediate) {
    clearTimeout(timer);
    const go = () => {
      if (fitJob) fitJob.cancel();
      pending = true;
      const payload = { cfg: { method: values.method, placement: values.placement, n: values.n, noise_sd_m: values.noise_sd_m, ell_km: values.ell_km, reg: values.reg, idw_power: values.idw_power, roughness: values.roughness, G: 40 }, seed, manual: values.placement === 'manual' ? manual : null };
      status.replaceChildren(ui.note('Fitting…'));
      const t0 = performance.now();
      fitJob = ctx.runJob('e13.fit', payload, { timeoutMs: 30000 });
      fitJob.promise.then((r) => {
        pending = false;
        res = r.result;
        fitMs = performance.now() - t0;
        fitWhere = r.where;
        if (!res.ok) ctx.announce('Stopped: ' + res.reason, 'error');
        update();
      }, (e) => {
        if (e.cancelled) return;
        pending = false;
        res = { ok: false, reason: e.message, samples: [], metrics: {} };
        ctx.announce('Stopped: ' + e.message, 'error');
        update();
      });
    };
    if (immediate) go();
    else timer = setTimeout(go, 130);
  }

  function scheduleCompare() {
    clearTimeout(cmpTimer);
    if (cmpJob) cmpJob.cancel();
    cmp = null; cmpState = 'running';
    drawCompare();
    cmpTimer = setTimeout(() => {
      const t0 = performance.now();
      cmpJob = ctx.runJob('e13.compare', { ell_km: values.ell_km, noise_sd_m: values.noise_sd_m, roughness: values.roughness, seed, nSeeds: 12, nMax: 40 }, { timeoutMs: 60000 });
      cmpJob.promise.then((r) => {
        cmp = r.result; cmpState = 'done'; cmpMs = performance.now() - t0;
        drawCompare();
      }, (e) => {
        if (e.cancelled) return;
        cmpState = 'failed';
        cmpNote.textContent = 'Comparison failed: ' + e.message;
        ctx.announce('Comparison failed: ' + e.message, 'error');
      });
    }, 700);
  }

  function update() {
    updateText();
    drawCharts();
    draw();
  }

  function updateText() {
    status.replaceChildren();
    if (!res) return;
    if (!res.ok) { status.append(ui.note('Stopped: ' + res.reason, 'error')); return; }
    const m = res.metrics;
    mg.set('n', res.n);
    mg.set('rmse', m.rmse_test, { tone: m.rmse_test > m.rmse_prior ? 'bad' : '' });
    mg.set('mae', m.mae_test);
    mg.set('cv', m.cv_rmse, { text: m.cv_rmse === null ? 'needs 10+' : undefined });
    const skill = 1 - m.rmse_test / m.rmse_prior;
    mg.set('skill', skill, { tone: skill < 0 ? 'bad' : skill > 0.7 ? 'good' : '' });
    mg.set('bias', m.bias_test);
    if (res.cfg.method === 'gp') {
      if (m.justified === null) mg.set('unc', 0, { text: 'GP band, not yet checked', sub: 'the leave-one-out check needs 8+ samples' });
      else mg.set('unc', 0, {
        text: m.justified ? 'justified' : 'not justified',
        tone: m.justified ? 'good' : 'bad',
        sub: `leave-one-out: ${(m.loo_coverage95 * 100).toFixed(0)}% inside 95% bands · test-point: ${(m.coverage95_test * 100).toFixed(0)}% · mean sd ${m.mean_sd.toFixed(2)} m`,
      });
    } else mg.set('unc', 0, { text: 'none', sub: `${res.cfg.method === 'idw' ? 'IDW' : 'RBF'} has no covariance model, so no band is drawn` });
    const nx = res.next;
    mg.set('next', 0, { text: nx ? `(${nx.x.toFixed(1)}, ${nx.y.toFixed(1)}) km` : '—', sub: nx ? nx.rule + (nx.eig_nats !== null ? ` · sd ${nx.sd_m.toFixed(2)} m · gain ${nx.eig_nats.toFixed(2)} nats` : '') : '' });
    if (res.n === 0) status.append(ui.note(`No samples: every method returns the prior, ${PRIOR.mean_m} m${res.cfg.method === 'gp' ? ` with sd ${PRIOR.sd_m} m` : ''}.`));
    if (res.cfg.method === 'gp' && m.justified === false) status.append(ui.note(`The uncertainty claim fails: only ${(m.loo_coverage95 * 100).toFixed(0)}% of leave-one-out residuals sit inside their 95% band (85% needed). Read the uncertainty map as the model's claim, not as a range.`, 'error'));
    if (res.cfg.placement === 'clustered') status.append(ui.note('All samples sit in one corner. Error is large everywhere else.', 'error'));
    if (res.cfg.method === 'idw' && res.cfg.noise_sd_m > 0 && res.n > 0) status.append(ui.note('IDW returns each noisy sample exactly: look for bullseyes around the dots.'));
    if (m.rmse_test > m.rmse_prior && res.n > 0) status.append(ui.note('This rebuild does worse than guessing the prior mean everywhere.', 'error'));
  }

  function drawCharts() {
    if (!res || !res.ok) return;
    const sc = res.scan;
    if (!sc) {
      cScan.draw(() => cScan.canvas.getContext('2d').clearRect(0, 0, cScan.canvas.width, cScan.canvas.height));
      cScan.text.textContent = 'Needs at least 8 samples.';
    } else {
      cScan.draw(() => chart.drawLines(cScan.canvas, {
        series: [{ name: 'LOO RMSE', color: ui.token('--water'), width: 2.5, points: sc.map((s) => [Math.log10(s.ell_km), s.loo_rmse === null ? NaN : s.loo_rmse]) }],
        xLabel: 'log10 length scale, km', yLabel: 'LOO RMSE, m', yZero: true,
        marks: [{ x: Math.log10(values.ell_km), color: ui.token('--dawn'), label: 'ℓ now' }],
      }));
      chart.dataTable(cScan.text, ['length scale km', 'LOO RMSE m'], sc.map((s) => [s.ell_km, s.loo_rmse === null ? '—' : s.loo_rmse]));
    }
    drawCompare();
  }

  function drawCompare() {
    if (!cmp) {
      cCmp.draw(() => cCmp.canvas.getContext('2d').clearRect(0, 0, cCmp.canvas.width, cCmp.canvas.height));
      cCmp.text.textContent = cmpState === 'running' ? 'Running.' : 'Not run yet.';
      cmpNote.textContent = cmpState === 'running' ? 'Running 12 seeds…' : '';
      return;
    }
    const pts = (a) => cmp.checks.map((n, i) => [n, a[i].mean]);
    const band = (a, c) => ({ upper: cmp.checks.map((n, i) => [n, a[i].mean + a[i].se]), lower: cmp.checks.map((n, i) => [n, a[i].mean - a[i].se]), color: c, alpha: 0.2 });
    cCmp.draw(() => chart.drawLines(cCmp.canvas, {
      series: [
        { name: 'random', color: ui.token('--base-arm'), width: 2.5, points: pts(cmp.random) },
        { name: 'adaptive', color: ui.token('--alt-arm'), width: 2.5, points: pts(cmp.adaptive) },
      ],
      bands: [band(cmp.random, ui.token('--base-arm')), band(cmp.adaptive, ui.token('--alt-arm'))],
      xLabel: 'samples', yLabel: 'RMSE m (orange random, green adaptive; band = ±1 se)', yZero: true,
    }));
    chart.dataTable(cCmp.text, ['samples', 'random mean m', 'random se', 'adaptive mean m', 'adaptive se'], cmp.checks.map((n, i) => [n, cmp.random[i].mean, cmp.random[i].se, cmp.adaptive[i].mean, cmp.adaptive[i].se]));
    const l = cmp.checks.length - 1;
    cmpNote.textContent = `At n = ${cmp.checks[l]}, adaptive beats random in ${cmp.wins} of ${cmp.nSeeds} seeds (mean RMSE ${cmp.adaptive[l].mean.toFixed(2)} m against ${cmp.random[l].mean.toFixed(2)} m). Same ℓ and noise for both; ${Math.round(cmpMs)} ms.`;
  }

  // ---- drawing ----
  const off = document.createElement('canvas');
  function field(g, kind) {
    const G = res.G;
    off.width = off.height = G;
    const og = off.getContext('2d');
    const img = og.createImageData(G, G);
    const T = res.truth;
    let lo = Infinity, hi = -Infinity;
    for (const v of T) { if (v < lo) lo = v; if (v > hi) hi = v; }
    let emax = 0.5;
    for (const v of res.err) emax = Math.max(emax, Math.abs(v));
    const src = kind === 'truth' ? T : kind === 'recon' ? res.mean : kind === 'err' ? res.err : res.sd;
    const have = !(kind === 'sd' && !res.sd);
    for (let r = 0; r < G; r++) {
      const j = G - 1 - r;
      for (let i = 0; i < G; i++) {
        const k = j * G + i;
        let col;
        if (!have) col = mix(pal.bg2, pal.bg, (i + r) % 6 < 3 ? 0.2 : 0.6);
        else if (kind === 'err') {
          const t = src[k] / emax;
          col = t >= 0 ? mix(pal.bg2, pal.dawn, clamp01(t)) : mix(pal.bg2, pal.water, clamp01(-t));
        } else if (kind === 'sd') col = mix(pal.bg2, mix(pal.violet, pal.rose, clamp01(src[k] / PRIOR.sd_m)), clamp01(0.15 + src[k] / PRIOR.sd_m));
        else {
          col = depthRamp((src[k] - lo) / (hi - lo || 1));
          const a = src === T ? T : src;
          const dx = (a[j * G + Math.min(G - 1, i + 1)] - a[j * G + Math.max(0, i - 1)]) / (hi - lo || 1);
          const dy = (a[Math.min(G - 1, j + 1) * G + i] - a[Math.max(0, j - 1) * G + i]) / (hi - lo || 1);
          const sh = 1 + clamp01(0.5 - (dx - dy) * 3.2) * 0.5 - 0.25;
          col = [col[0] * sh, col[1] * sh, col[2] * sh];
        }
        const p = (r * G + i) * 4;
        img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
      }
    }
    og.putImageData(img, 0, 0);
    return have;
  }

  function paint(slot) {
    const c = cv[slot], g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const dpr = W / (c.clientWidth || W);
    const side = Math.max(10, Math.min(W, H) - 16 * dpr), ox = (W - side) / 2, oy = (H - side) / 2;
    geo[slot] = { ox, oy, side, dpr };
    lab[slot].textContent = NAMES[views[slot]];
    if (!res || !res.ok) {
      g.fillStyle = rgba(pal.muted);
      g.font = `${14 * dpr}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(res ? 'Stopped' : 'Fitting…', W / 2, H / 2);
      return;
    }
    const have = field(g, views[slot]);
    g.imageSmoothingEnabled = true;
    g.drawImage(off, ox, oy, side, side);
    g.strokeStyle = rgba(pal.muted, 0.5);
    g.lineWidth = dpr;
    g.strokeRect(ox, oy, side, side);
    if (!have) {
      g.fillStyle = rgba(pal.fg);
      g.font = `${13 * dpr}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('No uncertainty for this method', ox + side / 2, oy + side / 2);
    }
    const X = (x) => ox + (x / DOMAIN_KM) * side, Y = (y) => oy + (1 - y / DOMAIN_KM) * side;
    let lo = Infinity, hi = -Infinity;
    for (const v of res.truth) { if (v < lo) lo = v; if (v > hi) hi = v; }
    for (const s of res.samples) {
      g.beginPath();
      g.arc(X(s[0]), Y(s[1]), 4.5 * dpr, 0, 6.2832);
      g.fillStyle = rgba(depthRamp((s[2] - lo) / (hi - lo || 1)));
      g.fill();
      g.lineWidth = 1.5 * dpr;
      g.strokeStyle = rgba(pal.fg, 0.95);
      g.stroke();
    }
    if (res.next) {
      g.setLineDash([4 * dpr, 3 * dpr]);
      g.strokeStyle = rgba(pal.dawn);
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.arc(X(res.next.x), Y(res.next.y), 10 * dpr, 0, 6.2832);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = rgba(pal.dawn);
      g.font = `${11 * dpr}px sans-serif`;
      g.textAlign = 'left';
      g.fillText('next', X(res.next.x) + 13 * dpr, Y(res.next.y) + 4 * dpr);
    }
    if (focused === slot) {
      g.strokeStyle = rgba(pal.fg);
      g.lineWidth = dpr;
      g.beginPath();
      g.moveTo(X(cursor[0]) - 9 * dpr, Y(cursor[1])); g.lineTo(X(cursor[0]) + 9 * dpr, Y(cursor[1]));
      g.moveTo(X(cursor[0]), Y(cursor[1]) - 9 * dpr); g.lineTo(X(cursor[0]), Y(cursor[1]) + 9 * dpr);
      g.stroke();
    }
  }

  function draw() {
    const t0 = performance.now();
    pal = palette();
    paint(0);
    paint(1);
    drawMs = performance.now() - t0;
    drawn++;
    if (res && res.ok) {
      let lo = Infinity, hi = -Infinity;
      for (const v of res.truth) { if (v < lo) lo = v; if (v > hi) hi = v; }
      cap.textContent = `10 km × 10 km, north up. Depth ${lo.toFixed(1)} to ${hi.toFixed(1)} m (violet shallow, orange deep). Dots are samples, coloured by what they measured; the dashed ring is the suggested next sensor. ${res.n} samples${pending ? ', fitting…' : ''}.`;
    } else cap.textContent = res ? 'Stopped: ' + res.reason : 'Fitting.';
  }

  // ---- input ----
  cv.forEach((c, slot) => {
    c.addEventListener('pointerdown', (e) => {
      const gg = geo[slot];
      if (!gg || !res || !res.ok) return;
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * c.width, y = ((e.clientY - r.top) / r.height) * c.height;
      const kx = ((x - gg.ox) / gg.side) * DOMAIN_KM, ky = (1 - (y - gg.oy) / gg.side) * DOMAIN_KM;
      if (kx < 0 || kx > DOMAIN_KM || ky < 0 || ky > DOMAIN_KM) return;
      cursor = [kx, ky];
      toggleAt(kx, ky);
    });
    c.addEventListener('focus', () => { focused = slot; draw(); });
    c.addEventListener('blur', () => { focused = -1; draw(); });
    c.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, 0.5], ArrowDown: [0, -0.5] }[e.key];
      if (d) {
        e.preventDefault();
        cursor = [Math.max(0, Math.min(DOMAIN_KM, cursor[0] + d[0])), Math.max(0, Math.min(DOMAIN_KM, cursor[1] + d[1]))];
        draw();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleAt(cursor[0], cursor[1]);
      }
    });
  });
  const stops = [ui.fitCanvas(cv[0], draw), ui.fitCanvas(cv[1], draw)];

  requestFit(true);
  scheduleCompare();

  return {
    getRecord() {
      const m = res && res.ok ? res.metrics : null;
      const num = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);
      const metrics = m ? [
        { name: 'Samples', value: res.n, unit: '' },
        { name: 'Test-point RMSE', value: num(m.rmse_test), unit: 'm', note: `${N_TEST} points not used to fit` },
        { name: 'Test-point MAE', value: num(m.mae_test), unit: 'm' },
        { name: 'Test-point bias', value: num(m.bias_test), unit: 'm' },
        { name: '5-fold CV RMSE', value: num(m.cv_rmse), unit: 'm' },
        { name: 'RMSE of the prior mean', value: num(m.rmse_prior), unit: 'm' },
        { name: 'Map RMSE, all cells', value: num(m.map_rmse), unit: 'm' },
        { name: 'GP leave-one-out coverage of 95% bands', value: num(m.loo_coverage95), unit: '', note: m.justified === null ? 'not applicable' : m.justified ? 'justified' : 'not justified' },
        { name: 'GP test-point coverage of 95% bands', value: num(m.coverage95_test), unit: '' },
      ] : [];
      if (cmp) {
        const l = cmp.checks.length - 1;
        metrics.push({ name: 'Adaptive wins over random', value: cmp.wins, unit: 'seeds', note: `of ${cmp.nSeeds} at n = ${cmp.checks[l]}` });
      }
      return { inputs: { ...values }, seed, metrics, diagnostics: { fps: Math.round(loop.fps * 10) / 10, fitMs: Math.round(fitMs), fitWhere, drawMs: Math.round(drawMs * 10) / 10, compareMs: Math.round(cmpMs), frames: drawn }, elapsedMs: fitMs };
    },
    getTable() {
      const rows = res && res.ok ? res.samples.map((s, i) => [i, s[0], s[1], s[2]]) : [];
      return { columns: ['sample', 'x_km', 'y_km', 'observed_depth_m'], rows };
    },
    destroy() {
      clearTimeout(timer);
      clearTimeout(cmpTimer);
      loop.stop();
      if (fitJob) fitJob.cancel();
      if (cmpJob) cmpJob.cancel();
      stops.forEach((s) => s());
      cScan.destroy();
      cCmp.destroy();
    },
  };
}
