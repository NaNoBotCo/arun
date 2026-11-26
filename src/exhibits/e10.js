// E10 Synchronization Garden: the Kuramoto model drawn as oscillators on a ring. The kernel in ../kernels/e10.js does the maths.
import { createSim, criticalCoupling, lockedFraction } from '../kernels/e10.js';

const TONE_MID = 'warn'; // stylecheck: allow — the value the metric tile CSS reads
const PRESETS = {
  below: { label: 'Below threshold: no synchrony', N: 1500, K: 0.8, spread: 1, noise: 0, init: 'random', dist: 'gaussian' },
  near: { label: 'Near the threshold', N: 1500, K: 1.7, spread: 1, noise: 0, init: 'random', dist: 'gaussian' },
  strong: { label: 'Strong coupling: a locked core forms', N: 1500, K: 4, spread: 1, noise: 0, init: 'random', dist: 'gaussian' },
  melt: { label: 'Aligned start, weak coupling', N: 1500, K: 0.6, spread: 1, noise: 0, init: 'aligned', dist: 'gaussian' },
  noisy: { label: 'Noise against strong coupling', N: 1500, K: 4, spread: 1, noise: 1.6, init: 'random', dist: 'gaussian' },
  camps: { label: 'Two opposite camps', N: 1500, K: 3, spread: 0.6, noise: 0, init: 'two-camps', dist: 'gaussian' },
};
const WINDOW = 4; // time units of phase advance used for observed frequencies
const DT = 0.05;

export const meta = {
  id: 'E10',
  title: 'Synchronization Garden',
  subtitle: 'Kuramoto',
  priority: 'P1',
  kind: 'simulation',
  dataStatus: 'MATHEMATICAL',
  methodVersion: 'e10-kuramoto-1.0.0',
  blurb: 'Oscillators with different natural rhythms pull on each other and lock into step, or fail to.',
  inputs: [
    { name: 'preset', label: 'Preset', type: 'select', default: 'strong', options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })) },
    { name: 'N', label: 'Oscillators N', type: 'range', min: 50, max: 10000, step: 50, default: 1500, unit: '', integer: true, help: 'Cost per step grows with N, not N².' },
    { name: 'K', label: 'Coupling K', type: 'range', min: 0, max: 10, step: 0.05, default: 4, unit: '' },
    { name: 'spread', label: 'Frequency spread', type: 'range', min: 0, max: 3, step: 0.05, default: 1, unit: 'rad/time', help: 'Standard deviation (Gaussian) or half-width (Lorentzian) of the natural frequencies.' },
    { name: 'noise', label: 'Noise D', type: 'range', min: 0, max: 2, step: 0.02, default: 0, unit: 'rad²/time', help: 'Random kicks to every phase, variance 2·D per unit time.' },
    { name: 'init', label: 'Starting phases', type: 'select', default: 'random', options: [{ value: 'random', label: 'Random on the circle' }, { value: 'aligned', label: 'All aligned' }, { value: 'two-camps', label: 'Two opposite camps' }] },
    { name: 'dist', label: 'Natural frequencies', type: 'select', default: 'gaussian', options: [{ value: 'gaussian', label: 'Gaussian' }, { value: 'lorentzian', label: 'Lorentzian (heavy tails)' }] },
    { name: 'speed', label: 'Steps per frame', type: 'range', min: 1, max: 20, step: 1, default: 4, unit: 'steps', integer: true },
  ],
  outputs: [
    { name: 'R', label: 'Order parameter R', unit: '' },
    { name: 'psi', label: 'Mean phase ψ', unit: 'rad' },
    { name: 'locked', label: 'Locked fraction', unit: '' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32 from the seed, in separate streams: the shuffle of natural frequencies, the starting phases, the noise, and the random group kicks. Natural frequencies are evenly spaced quantiles of the chosen distribution, shuffled by the seed. Taps on the ring are not drawn from the seed.',
  method: `<p>Each oscillator <em>i</em> has a phase θᵢ and a natural frequency ωᵢ. Every oscillator feels the average of all the others through the order parameter R e<sup>iψ</sup>.</p>
<p class="eq">dθᵢ/dt = ωᵢ + K R sin(ψ − θᵢ) + √(2D) ξᵢ(t)</p>
<p class="eq">R e<sup>iψ</sup> = (1/N) Σⱼ e<sup>iθⱼ</sup></p>
<p><strong>Mean-field form, O(N).</strong> Writing C = mean of cos θⱼ and S = mean of sin θⱼ gives R sin(ψ − θᵢ) = S cos θᵢ − C sin θᵢ. The sum over all pairs becomes two averages, so a step costs O(N). A kernel test compares this against the full pair-by-pair sum.</p>
<p><strong>Scheme.</strong> Heun's method (predictor, then average of two slopes) with step dt = ${DT}. Noise is a Gaussian increment √(2·D·dt) per oscillator, the same in both stages. Phases are not wrapped, so the phase advance over a window gives each oscillator's observed frequency.</p>
<p><strong>Starting values.</strong> Natural frequencies are the quantiles (i + ½)/N of the Gaussian or Lorentzian, shuffled by the seed. Starting phases are random, all zero, or half at 0 and half at π.</p>
<p><strong>Critical coupling.</strong> For an infinite population, synchrony starts at K<sub>c</sub> = 2 / (π g(0)), where g is the frequency density. That is K<sub>c</sub> = σ·√(8/π) ≈ 1.596 σ for a Gaussian of standard deviation σ and 2γ for a Lorentzian of half-width γ. For the Lorentzian the long-run value is R = √(1 − K<sub>c</sub>/K); a kernel test checks it.</p>
<p><strong>Finite-size floor.</strong> With N oscillators and no synchrony, R is about 1/√N from chance alone. The page shows that floor.</p>
<p><strong>Colours and radius.</strong> The angle is θᵢ. The radius follows the rank of ωᵢ: slow oscillators sit inside, fast ones outside. Gold dots satisfy |ωᵢ − mean ω| ≤ K R, the condition for locking to the mean field. Blue dots drift.</p>
<p><strong>Observed frequency.</strong> Every ${WINDOW} time units the page takes each oscillator's phase advance over the window divided by the window length. Their mean equals the mean of ω, because the coupling terms cancel in the sum. Their spread falls when oscillators lock.</p>
<p><strong>Group kick.</strong> A tap on the ring adds π to every phase within 0.6 rad of the tapped angle. The Enter key does the same at the cursor angle (left and right arrows move it).</p>`,
  limitations: [
    'A mathematical toy about coupled clocks. It is not a model of ethnicity, opinion, markets or human behaviour.',
    'Coupling is all-to-all and equal. Real networks have structure that this model leaves out.',
    'For finite N the onset is blurred. R near Kc depends on N and on the seed.',
    'The Heun step is a second-order approximation with dt = 0.05. Very large frequency spreads need a smaller step than the page offers.',
    'Observed frequencies come from a 4-time-unit window, so they lag changes in the state.',
  ],
  provenance: [],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E10"] .e10-hint { position: absolute; left: 10px; top: 10px; max-width: calc(100% - 20px); padding: 5px 12px; border-radius: 999px; font-size: 0.85rem; background: color-mix(in srgb, var(--bg) 72%, transparent); pointer-events: none; }
[data-ex="E10"] .e10-legend { position: absolute; left: 10px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 6px 10px; border-radius: var(--r-s); font-size: 0.82rem; background: color-mix(in srgb, var(--bg) 72%, transparent); pointer-events: none; max-width: calc(100% - 20px); }
[data-ex="E10"] .e10-legend .sw { display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: -1px; margin-right: 6px; }
[data-ex="E10"] canvas.stage-canvas { cursor: crosshair; }
[data-ex="E10"] canvas.stage-canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
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

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const init = ctx.initial;
  const vals = { ...Object.fromEntries(meta.inputs.map((i) => [i.name, i.default])), ...(init ? init.inputs : {}) };
  let seed = init ? init.seed : 5;
  let sim = null;
  let ranks = null;
  let hist = [];
  let sampleEvery = 5;
  let obs = null; // { freq, mean, sd, span }
  let winStart = 0;
  let frameNo = 0;
  let msStep = 0;
  let stepsEff = 0;
  let kicks = 0;
  let kicked = 0;
  let flash = null;
  let cursorAngle = 0;
  let startedAt = performance.now();
  let colors = {};
  let dark = true;

  const canvas = h('canvas', { class: 'stage-canvas', tabindex: '0', role: 'img', 'aria-label': 'Ring of oscillators. Tap the ring to shift a group of them by half a turn.' });
  const hint = h('div', { class: 'e10-hint' }, 'Tap the ring to kick a group by half a turn');
  const dotLocked = h('i', { class: 'sw' });
  const dotDrift = h('i', { class: 'sw' });
  const legend = h('div', { class: 'e10-legend' }, h('span', {}, dotLocked, 'locked to the mean field'), h('span', {}, dotDrift, 'drifting'));
  slots.stage.append(canvas, hint, legend);
  const g = canvas.getContext('2d');
  const hasFilter = 'filter' in g;

  function readColors() {
    colors = { lock: ui.token('--dawn'), drift: ui.token('--water'), arrow: ui.token('--fg'), bg: ui.token('--bg'), bg2: ui.token('--bg-2'), line: ui.token('--line'), muted: ui.token('--muted'), rose: ui.token('--rose') };
    const m = /^#([0-9a-f]{6})$/i.exec(colors.bg);
    dark = m ? parseInt(m[1].slice(0, 2), 16) + parseInt(m[1].slice(2, 4), 16) + parseInt(m[1].slice(4), 16) < 380 : true;
    dotLocked.style.background = colors.lock;
    dotDrift.style.background = colors.drift;
  }

  function config() {
    return { N: vals.N, K: vals.K, spread: vals.spread, noise: vals.noise, init: vals.init, dist: vals.dist, dt: DT };
  }

  function newSim() {
    try {
      sim = createSim(config(), seed);
    } catch (e) {
      ui.announce(e.message, 'error');
      return false;
    }
    const N = sim.N;
    const idx = Array.from({ length: N }, (_, i) => i).sort((a, b) => sim.omega[a] - sim.omega[b]);
    ranks = new Float32Array(N);
    idx.forEach((i, r) => (ranks[i] = (r + 0.5) / N));
    hist = [];
    sampleEvery = 5;
    obs = null;
    kicks = 0;
    kicked = 0;
    flash = null;
    startedAt = performance.now();
    winStart = 0;
    sim.beginWindow();
    sample();
    updateAll();
    return true;
  }

  function sample() {
    const o = sim.order();
    hist.push({ t: sim.t, R: o.R, psi: o.psi });
    if (hist.length > 2400) {
      hist = hist.filter((_, i) => i % 2 === 0);
      sampleEvery *= 2;
    }
  }

  // ----- drawing -----
  function geom() {
    const W = canvas.width, H = canvas.height;
    return { W, H, cx: W / 2, cy: H / 2, Rc: Math.min(W, H) * 0.44 };
  }

  function draw() {
    if (!sim) return;
    const { W, H, cx, cy, Rc } = geom();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.globalAlpha = 1;
    const bgGrad = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) / 2);
    bgGrad.addColorStop(0, colors.bg2);
    bgGrad.addColorStop(1, colors.bg);
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, W, H);
    // rings: outer edge and inner edge of the radial band
    g.strokeStyle = colors.line;
    g.lineWidth = dpr;
    for (const f of [0.36, 1]) {
      g.beginPath();
      g.arc(cx, cy, Rc * f, 0, 2 * Math.PI);
      g.stroke();
    }
    const { R, psi } = sim.order();
    const N = sim.N;
    const th = sim.theta, om = sim.omega;
    let meanW = 0;
    for (let i = 0; i < N; i++) meanW += om[i];
    meanW /= N;
    const lim = sim.config.K * R;
    const size = Math.max(1.3 * dpr, Math.min(4.2 * dpr, 0.9 * Math.sqrt((Math.PI * Rc * Rc * 0.7) / N)));
    g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    g.globalAlpha = dark ? 0.9 : 0.8;
    for (let pass = 0; pass < 2; pass++) {
      g.fillStyle = pass === 0 ? colors.drift : colors.lock;
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const locked = Math.abs(om[i] - meanW) <= lim;
        if (locked !== (pass === 1)) continue;
        const r = Rc * (0.36 + 0.64 * ranks[i]);
        const x = cx + r * Math.cos(th[i]);
        const y = cy - r * Math.sin(th[i]);
        if (N <= 800) {
          g.moveTo(x + size, y);
          g.arc(x, y, size, 0, 2 * Math.PI);
        } else g.rect(x - size / 2, y - size / 2, size, size);
      }
      g.fill();
    }
    g.globalAlpha = 1;
    if (hasFilter && dark) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55;
      g.filter = `blur(${Math.max(3, Rc / 45)}px)`;
      g.drawImage(canvas, 0, 0);
      g.filter = 'none';
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-over';
    // order parameter: ring of radius R·Rc and an arrow along ψ
    g.strokeStyle = colors.arrow;
    g.globalAlpha = 0.5;
    g.setLineDash([4 * dpr, 5 * dpr]);
    g.lineWidth = 1.2 * dpr;
    g.beginPath();
    g.arc(cx, cy, Math.max(1, R * Rc), 0, 2 * Math.PI);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    const ax = cx + R * Rc * Math.cos(psi), ay = cy - R * Rc * Math.sin(psi);
    g.shadowColor = colors.lock;
    g.shadowBlur = 12 * dpr;
    g.strokeStyle = colors.arrow;
    g.lineWidth = 3 * dpr;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(ax, ay);
    g.stroke();
    g.fillStyle = colors.arrow;
    g.beginPath();
    g.arc(ax, ay, 5 * dpr, 0, 2 * Math.PI);
    g.fill();
    g.shadowBlur = 0;
    if (flash) {
      const age = (performance.now() - flash.t0) / 700;
      if (age < 1) {
        g.globalAlpha = 1 - age;
        g.strokeStyle = colors.rose;
        g.lineWidth = 4 * dpr;
        g.beginPath();
        g.arc(cx, cy, Rc * (1.04 + 0.08 * age), -flash.angle - 0.6, -flash.angle + 0.6);
        g.stroke();
        g.globalAlpha = 1;
      } else flash = null;
    }
    if (document.activeElement === canvas) {
      g.strokeStyle = colors.arrow;
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.arc(cx, cy, Rc * 1.1, -cursorAngle - 0.6, -cursorAngle + 0.6);
      g.stroke();
    }
  }

  // ----- metrics and charts -----
  const metricsUI = ui.metricGrid(slots.metrics, [
    { name: 'status', label: 'State', wide: true },
    { name: 'R', label: 'Order parameter R', digits: 3 },
    { name: 'psi', label: 'Mean phase ψ', digits: 2, unit: 'rad' },
    { name: 'Kc', label: 'Critical coupling', digits: 3, unit: 'infinite population' },
    { name: 'ratio', label: 'K / Kc', digits: 2 },
    { name: 'floor', label: 'Chance floor 1/√N', digits: 3 },
    { name: 'locked', label: 'Locked fraction', digits: 2, pct: true, unit: '|ω − mean| ≤ K·R' },
    { name: 'meanf', label: 'Mean observed frequency', digits: 3, unit: 'rad/time' },
    { name: 'sdf', label: 'Observed frequency spread', digits: 3, unit: 'rad/time' },
    { name: 't', label: 'Time', digits: 1, unit: 'time units' },
    { name: 'cost', label: 'Cost per step', digits: 2, unit: 'ms' },
    { name: 'fps', label: 'Frame rate', digits: 0, unit: 'frames / s' },
  ]);
  const chartR = chart.chartBox(slots.metrics, { title: 'Order parameter R over time', height: 150 });
  const chartP = chart.chartBox(slots.metrics, { title: 'Phases of all oscillators', height: 120 });
  const chartF = chart.chartBox(slots.metrics, { title: 'Natural and observed frequencies', height: 130 });
  const row = h('div', { class: 'btnrow' });
  row.append(ui.button('Kick a random group', () => kickRandom(), { kind: 'small', title: 'Shifts a seeded random 30% of the oscillators by half a turn' }));
  slots.metrics.append(row);

  function lockedNow() {
    const { R } = sim.order();
    let meanW = 0;
    for (let i = 0; i < sim.N; i++) meanW += sim.omega[i];
    meanW /= sim.N;
    let n = 0;
    const lim = sim.config.K * R;
    for (let i = 0; i < sim.N; i++) if (Math.abs(sim.omega[i] - meanW) <= lim) n++;
    return n / sim.N;
  }

  function updateAll(chartsToo = true) {
    const o = sim.order();
    const Kc = criticalCoupling(sim.config.dist, sim.config.spread);
    const floor = 1 / Math.sqrt(sim.N);
    let text, tone;
    if (o.R > 0.6) (text = 'Synchronised'), (tone = 'good');
    else if (o.R > Math.max(0.25, 3 * floor)) (text = 'Partly synchronised'), (tone = TONE_MID);
    else (text = `Incoherent: R is near the chance floor`), (tone = TONE_MID);
    metricsUI.set('status', 0, { text, tone });
    metricsUI.set('R', o.R);
    metricsUI.set('psi', o.psi);
    metricsUI.set('Kc', Kc, { text: Kc > 0 ? undefined : '0' });
    metricsUI.set('ratio', Kc > 0 ? sim.config.K / Kc : NaN, { text: Kc > 0 ? undefined : '—' });
    metricsUI.set('floor', floor);
    metricsUI.set('locked', lockedNow());
    metricsUI.set('meanf', obs ? obs.mean : NaN, { text: obs ? undefined : 'window open', sub: obs ? 'equals mean of ω' : '' });
    metricsUI.set('sdf', obs ? obs.sd : NaN, { text: obs ? undefined : '—' });
    metricsUI.set('t', sim.t);
    metricsUI.set('cost', msStep, { text: msStep ? undefined : '—' });
    metricsUI.set('fps', loop.fps);
    canvas.setAttribute('aria-label', `Ring of ${sim.N} oscillators at time ${sim.t.toFixed(1)}. Order parameter ${o.R.toFixed(2)}, ${text.toLowerCase()}. Tap the ring or press Enter to shift a group by half a turn.`);
    if (chartsToo) drawCharts();
  }

  function histOf(values, lo, hi, bins) {
    const counts = new Array(bins).fill(0);
    for (const v of values) {
      if (v < lo || v >= hi) continue;
      counts[Math.floor(((v - lo) / (hi - lo)) * bins)]++;
    }
    return counts;
  }

  function drawCharts() {
    const Kc = criticalCoupling(sim.config.dist, sim.config.spread);
    chartR.draw(() => {
      const marks = [{ y: 1 / Math.sqrt(sim.N), color: ui.token('--muted'), label: 'chance floor' }];
      if (sim.config.dist === 'lorentzian' && Kc > 0 && sim.config.K > Kc && sim.config.noise === 0) marks.push({ y: Math.sqrt(1 - Kc / sim.config.K), color: ui.token('--jade'), label: 'exact long-run R' });
      chart.drawLines(chartR.canvas, { series: [{ name: 'R', points: hist.map((p) => [p.t, p.R]), color: ui.token('--dawn'), width: 2.2 }], yRange: [0, 1.02], xLabel: 'time', yLabel: 'R', marks });
    });
    chart.dataTable(chartR.text, ['time', 'R', 'mean phase ψ'], hist.map((p) => [p.t, p.R, p.psi]));
    const bins = 24;
    const ph = new Array(bins).fill(0);
    for (const c of sim.phaseHistogram(bins).entries()) ph[c[0]] = c[1];
    chartP.draw(() => chart.drawHistogram(chartP.canvas, { series: [{ lo: 0, hi: 2 * Math.PI, counts: ph, color: ui.token('--violet') }], xLabel: 'phase (rad)' }));
    chart.dataTable(chartP.text, ['phase from (rad)', 'phase to (rad)', 'oscillators'], ph.map((c, i) => [(i * 2 * Math.PI) / bins, ((i + 1) * 2 * Math.PI) / bins, c]), 30);
    // frequencies: natural ω and, when a window has closed, observed
    const sp = Math.max(sim.config.spread, 0.2) * (sim.config.dist === 'lorentzian' ? 4 : 3.2);
    const nat = histOf(sim.omega, -sp, sp, 32);
    const series = [{ lo: -sp, hi: sp, counts: nat, color: ui.token('--water'), alpha: 0.55 }];
    if (obs) series.push({ lo: -sp, hi: sp, counts: histOf(obs.freq, -sp, sp, 32), color: ui.token('--dawn'), alpha: 0.6 });
    chartF.draw(() => chart.drawHistogram(chartF.canvas, { series, xLabel: 'frequency (rad/time): blue natural, gold observed' }));
    const ob = obs ? histOf(obs.freq, -sp, sp, 32) : null;
    chart.dataTable(chartF.text, ['from', 'to', 'natural', 'observed'], nat.map((c, i) => [-sp + (i * 2 * sp) / 32, -sp + ((i + 1) * 2 * sp) / 32, c, ob ? ob[i] : '—']), 32);
  }

  // ----- loop -----
  const loop = ctx.loop(() => {
    if (!sim) return;
    const t0 = performance.now();
    let n = 0;
    while (n < vals.speed) {
      sim.step(1);
      n++;
      if (sim.steps % sampleEvery === 0) sample();
      if (performance.now() - t0 > 12) break;
    }
    const el = performance.now() - t0;
    msStep = msStep ? msStep * 0.8 + 0.2 * (el / n) : el / n;
    stepsEff = n;
    if (sim.t - winStart >= WINDOW) closeWindow();
    frameNo++;
    draw();
    if (frameNo % 4 === 0) updateAll(frameNo % 12 === 0);
  });

  function closeWindow() {
    const w = sim.endWindow();
    if (w) {
      let m = 0;
      for (const f of w.freq) m += f;
      m /= w.freq.length;
      let v = 0;
      for (const f of w.freq) v += (f - m) ** 2;
      obs = { freq: w.freq, mean: m, sd: Math.sqrt(v / w.freq.length), span: w.span };
    }
    winStart = sim.t;
    sim.beginWindow();
  }

  function setRunning(r) {
    if (r) loop.start();
    else loop.stop();
    transport.setRunning(r);
  }

  const transport = ui.transport({
    seed,
    onToggle: () => setRunning(!loop.running),
    onStep: () => {
      loop.stop();
      transport.setRunning(false);
      sim.step(vals.speed);
      sample();
      if (sim.t - winStart >= WINDOW) closeWindow();
      draw();
      updateAll();
    },
    onReset: () => {
      newSim();
      draw();
    },
    onReplay: () => {
      if (newSim()) {
        draw();
        setRunning(true);
      }
    },
    onSeed: (s) => {
      seed = s;
      transport.setSeed(s);
      newSim();
      draw();
    },
  });
  slots.controls.append(transport.el);
  const box = h('div', {});
  slots.controls.append(box);
  const panel = ui.controlPanel(box, meta.inputs, vals, (name, v) => {
    if (name === 'preset') {
      const p = PRESETS[v];
      panel.setAll({ N: p.N, K: p.K, spread: p.spread, noise: p.noise, init: p.init, dist: p.dist });
      newSim();
      draw();
      return;
    }
    if (name === 'K' || name === 'noise') {
      try {
        sim.setParams({ K: vals.K, noise: vals.noise });
      } catch (e) {
        ui.announce(e.message, 'error');
      }
    } else if (['N', 'spread', 'init', 'dist'].includes(name)) {
      newSim();
    }
    if (!loop.running) {
      draw();
      updateAll();
    }
  });

  // ----- kicks -----
  function kickWedge(angle) {
    const n = sim.kick(angle, 0.6, Math.PI);
    kicks++;
    kicked += n;
    flash = { angle, t0: performance.now() };
    ui.announce(`Shifted ${n} oscillators by half a turn.`, 'quiet');
    if (!loop.running) {
      draw();
      updateAll();
    }
  }
  function kickRandom() {
    if (!sim) return;
    const n = sim.kickRandom(0.3, Math.PI);
    kicks++;
    kicked += n;
    ui.announce(`Shifted ${n} of ${sim.N} oscillators by half a turn.`, 'quiet');
    if (!loop.running) {
      draw();
      updateAll();
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    const { cx, cy, Rc } = geom();
    const dx = (e.clientX - r.left) * k - cx, dy = (e.clientY - r.top) * k - cy;
    if (Math.hypot(dx, dy) < 0.25 * Rc) return;
    kickWedge(Math.atan2(-dy, dx));
    hint.hidden = true;
  });
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') cursorAngle += 0.2;
    else if (e.key === 'ArrowRight') cursorAngle -= 0.2;
    else if (e.key === 'Enter' || e.key === ' ') kickWedge(cursorAngle);
    else return;
    e.preventDefault();
    if (!loop.running) draw();
  });
  canvas.addEventListener('focus', () => !loop.running && draw());
  canvas.addEventListener('blur', () => !loop.running && draw());

  const stopFit = ui.fitCanvas(canvas, () => draw());
  const stopTheme = watchTheme(() => {
    readColors();
    if (sim) {
      draw();
      drawCharts();
    }
  });
  readColors();
  newSim();
  draw();
  if (!ctx.reducedMotion() && !init) setRunning(true);
  else if (ctx.reducedMotion()) hint.textContent = 'Motion is reduced. Press Run to start. Tap the ring to kick a group.';

  return {
    getRecord() {
      const o = sim.order();
      const Kc = criticalCoupling(sim.config.dist, sim.config.spread);
      return {
        inputs: { ...vals },
        seed,
        metrics: [
          { name: 'Order parameter R', value: o.R, unit: '', note: `at t = ${sim.t.toFixed(2)}` },
          { name: 'Mean phase ψ', value: o.psi, unit: 'rad' },
          { name: 'Critical coupling Kc', value: Kc, unit: '', note: 'infinite-population formula' },
          { name: 'Chance floor 1/√N', value: 1 / Math.sqrt(sim.N), unit: '' },
          { name: 'Locked fraction', value: lockedNow(), unit: '', note: '|ω − mean ω| ≤ K·R' },
          { name: 'Mean observed frequency', value: obs ? obs.mean : null, unit: 'rad/time', note: obs ? `window of ${WINDOW}` : 'no window closed yet' },
          { name: 'Observed frequency spread', value: obs ? obs.sd : null, unit: 'rad/time' },
        ],
        diagnostics: { steps: sim.steps, fps: loop.fps, msPerStep: msStep, stepsPerFrame: stepsEff, kicks, oscillatorsKicked: kicked },
        elapsedMs: performance.now() - startedAt,
      };
    },
    getTable() {
      return { columns: ['t', 'R', 'psi_rad'], rows: hist.map((p) => [p.t, p.R, p.psi]) };
    },
    destroy() {
      stopFit();
      stopTheme();
      loop.stop();
      chartR.destroy();
      chartP.destroy();
      chartF.destroy();
    },
  };
}
