// E11 Temporal Symmetry Lab. Part A: a forced subharmonic toy with its spectrum. Part B: a driven Duffing oscillator or the logistic map.
// This is frequency division and period doubling in toys. It is not a time crystal.
import * as K from '../kernels/e11.js';

const TONE_MID = 'warn'; // stylecheck: allow — the value the metric tile CSS reads
const DUFF_PRESETS = {
  p1: { label: 'Period 1 (F = 3)', F: 3, gamma: 0.1, alpha: 1 },
  p2: { label: 'Period 2: response at half the drive rate (F = 5.2)', F: 5.2, gamma: 0.1, alpha: 1 },
  p4: { label: 'Period 4 (F = 5.5)', F: 5.5, gamma: 0.1, alpha: 1 },
  p3: { label: 'Period 3 window (F = 7)', F: 7, gamma: 0.1, alpha: 1 },
  chaos: { label: 'No period found (F = 10.5)', F: 10.5, gamma: 0.1, alpha: 1 },
  escape: { label: 'Softening spring escapes (breaks the method)', F: 3, gamma: 0.1, alpha: -1 },
};
const LOG_PRESETS = {
  p1: { label: 'Period 1 (r = 2.8)', r: 2.8 },
  p2: { label: 'Period 2 (r = 3.2)', r: 3.2 },
  p4: { label: 'Period 4 (r = 3.5)', r: 3.5 },
  p3: { label: 'Period 3 window (r = 3.83)', r: 3.83 },
  chaos: { label: 'No period found (r = 3.9)', r: 3.9 },
};
const DUFF_FIXED = { omega0: 0, Omega: 1 };
const DUFF_UI = { nTransient: 150, nSample: 80, stepsPerPeriod: 100 };
const LOG_TRANS = 120;
const LOG_KEEP = 80;

export const meta = {
  id: 'E11',
  title: 'Temporal Symmetry Lab',
  subtitle: 'time crystal context',
  priority: 'P1',
  kind: 'simulation',
  dataStatus: 'MATHEMATICAL',
  methodVersion: 'e11-subharmonic-duffing-1.0.0',
  blurb: 'Toy systems that answer a steady beat at half or a third of its rate, with spectra and period doubling.',
  inputs: [
    { name: 'part', label: 'Part', type: 'select', default: 'A', options: [{ value: 'A', label: 'A · Forced subharmonic toy' }, { value: 'B', label: 'B · Nonlinear oscillator and map' }] },
    { name: 'T', label: 'Drive period T', type: 'range', min: 0.5, max: 3, step: 0.1, default: 1, unit: 'time' },
    { name: 'm', label: 'Division m', type: 'range', min: 1, max: 6, step: 1, default: 2, unit: '', integer: true, help: 'The response repeats every m·T.' },
    { name: 'phase', label: 'Response phase φ', type: 'range', min: -3.14, max: 3.14, step: 0.05, default: 0.3, unit: 'rad', help: 'At φ = π/2 with m = 2 the stroboscopic samples are all zero.' },
    { name: 'noise', label: 'Noise on the response', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0, unit: 'amplitude' },
    { name: 'kick', label: 'Phase kick', type: 'range', min: 0, max: 3.14, step: 0.05, default: 0, unit: 'rad', help: 'Shifts the response phase from period 32 on. A tap on the picture kicks by π at the current period.' },
    { name: 'system', label: 'System', type: 'select', default: 'duffing', options: [{ value: 'duffing', label: 'Driven Duffing oscillator' }, { value: 'logistic', label: 'Logistic map' }] },
    { name: 'bpreset', label: 'Preset', type: 'select', default: 'p2', options: Object.entries(DUFF_PRESETS).map(([value, p]) => ({ value, label: p.label })) },
    { name: 'F', label: 'Drive strength F', type: 'range', min: 0.5, max: 12, step: 0.05, default: 5.2, unit: '' },
    { name: 'gamma', label: 'Damping γ', type: 'range', min: 0.02, max: 0.5, step: 0.01, default: 0.1, unit: '1/time' },
    { name: 'alpha', label: 'Cubic stiffness α', type: 'range', min: -2, max: 3, step: 0.05, default: 1, unit: '', help: 'Negative values make the spring soften, so the oscillator can escape.' },
    { name: 'r', label: 'Growth rate r', type: 'range', min: 2.5, max: 4, step: 0.005, default: 3.2, unit: '' },
    { name: 'kickB', label: 'Test kick size', type: 'range', min: 0.001, max: 0.5, step: 0.001, default: 0.01, unit: '', help: 'Used by the Kick it button.' },
    { name: 'speed', label: 'Speed', type: 'range', min: 1, max: 60, step: 1, default: 20, unit: 'periods / s', integer: true },
  ],
  outputs: [
    { name: 'mEstimate', label: 'Division estimated from the spectrum', unit: '' },
    { name: 'period', label: 'Period found in the strobe samples', unit: 'drive periods' },
    { name: 'lyapunov', label: 'Lyapunov exponent', unit: '1/iteration' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32 from the seed, in separate streams: the noise in Part A, the start of the Duffing oscillator (x, v each in −0.5…0.5) and the start of the logistic map (0.1…0.9).',
  method: `<p><strong>Read this first.</strong> Everything on this page is frequency division or period doubling in small mathematical toys. None of it is a time crystal.</p>
<h4>Part A: forced subharmonic toy</h4>
<p class="eq">drive(t) = cos(2πt / T)     response(t) = cos(2πt / (m T) + φ) + noise</p>
<p>The response is written down by hand at 1/m of the drive rate. Nothing in the toy produces or protects it. A phase kick moves the response and it stays moved, since nothing pulls it back.</p>
<p><strong>Spectrum.</strong> A radix-2 FFT of the response with a Hann window, scaled so a cosine of amplitude A reads A. The kernel checks the FFT against a direct discrete Fourier transform. The estimate of m is the drive frequency divided by the strongest spectral peak.</p>
<p><strong>Stroboscopic sampling.</strong> The response read once per drive period gives cos(2πn/m + φ), a sequence that repeats every m samples. The page reports the repeat length it finds. At a blind phase (m = 2, φ = π/2) every sample is zero and the repeat length reads 1 although the spectrum still shows 1/m.</p>
<p><strong>Phase portrait.</strong> The response against its rate of change, scaled to a circle. The strobe samples are m points on it.</p>
<h4>Part B: Duffing oscillator</h4>
<p class="eq">x″ + γ x′ + ω₀² x + α x³ = F cos(Ω t)     with ω₀ = 0 and Ω = 1</p>
<p><strong>Scheme.</strong> Classical RK4 with 100 steps per drive period (800 in the kernel tests), so each strobe time t = nT lands on a step. Each run is 150 transient periods and 80 sampled periods. The kernel tests compare against the exact linear solution (steady state and ringdown), against smaller steps, and check that two starts 1e-9 apart separate when the response has no period. A state beyond ±1e6 stops the run and says so.</p>
<p><strong>Poincaré section.</strong> The pair (x, x′) read once per drive period. Muted points are the transient, bright points the steady state. A period-p response shows p bright points.</p>
<p><strong>Period.</strong> The smallest p such that the last 48 strobe values repeat every p samples within a small tolerance. "No period found" means none up to 16 matched: chaos, a longer period, or a transient that has not died.</p>
<p><strong>Bifurcation sweep.</strong> F runs from 1 to 12 in 120 steps. Each step starts from the end state of the one before and shows 40 strobe values after 120 transient periods. Click the diagram to set F. The sweep runs as a background job.</p>
<p><strong>Kick it.</strong> Runs to the steady state, adds the test kick to x, and reports whether the strobe values return to the same set and how many periods that takes.</p>
<h4>Part B: logistic map</h4>
<p class="eq">x(n+1) = r x(n) (1 − x(n))</p>
<p>Period doubling at r = 3, then 1 + √6 ≈ 3.449, then 3.544 and 3.564, reaching chaos near 3.57. The kernel checks the fixed point 1 − 1/r, the period-2 points, the doubling thresholds, and the Lyapunov exponent (ln 2 at r = 4, ½ ln|4 + 2r − r²| on the period-2 cycle). The cobweb draws x(n) → x(n+1) steps against the parabola.</p>
<h4>Time crystals, for context</h4>
<p>A discrete time crystal is a many-body system driven periodically that settles into a response at a multiple of the drive period, which it holds without being told to and which resists small changes. That breaks the discrete time-translation symmetry of the drive. A continuous time crystal would break continuous time-translation symmetry with no periodic drive. The toys here do neither: Part A imposes its response by hand, and Part B has one degree of freedom whose period doubling depends on tuned parameters and on where it starts.</p>
<p>Reference: <em>Nonreciprocal Wave-Mediated Interactions Power a Classical Time Crystal</em>, Physical Review Letters (2026), DOI 10.1103/zjzk-t81n. This page does not simulate that system, and the toys do not test or support its claims.</p>`,
  limitations: [
    'Frequency division and period doubling in toys. None of the systems here is a time crystal, and the page does not claim to show time-crystalline order.',
    'Part A writes the subharmonic response by hand. It has no dynamics that could sustain or lose it.',
    'Part B is one oscillator or one map with tuned parameters. A real time crystal needs many interacting parts and a response that persists without tuning.',
    'The Duffing presets apply to ω₀ = 0, Ω = 1 and the stated γ, α, F. The sweep follows one branch from the previous F, so a second stable response at the same F can exist and not show.',
    'A period reading is a finite-time test (last 48 samples). Long periods and slow transients read as "no period found".',
    'Not a forecasting tool. The page supports no commercial or predictive claim.',
  ],
  provenance: [
    { source: 'Nonreciprocal Wave-Mediated Interactions Power a Classical Time Crystal, Physical Review Letters (2026)', version: 'DOI 10.1103/zjzk-t81n', license: 'Cited as context only. No text, data or figures are used.' },
  ],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E11"] .e11-chip { position: absolute; left: 10px; top: 10px; max-width: calc(100% - 20px); padding: 5px 12px; border-radius: 999px; font-size: 0.85rem; font-weight: 700; background: color-mix(in srgb, var(--bg) 78%, transparent); border: 1px solid var(--dawn); pointer-events: none; }
[data-ex="E11"] .ctl[hidden] { display: none; }
[data-ex="E11"] .e11-banner { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100% - 28px)); padding: 14px 16px; border-radius: var(--r-m); border: 1px solid var(--danger); /* stylecheck: allow — CSS token name */ background: color-mix(in srgb, var(--bg) 88%, transparent); box-shadow: var(--shadow); }
[data-ex="E11"] .e11-banner[hidden] { display: none; }
[data-ex="E11"] canvas.stage-canvas { cursor: crosshair; }
[data-ex="E11"] canvas.stage-canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
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

function ticks(lo, hi, n = 4) {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const e = raw / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const init = ctx.initial;
  const vals = { ...Object.fromEntries(meta.inputs.map((i) => [i.name, i.default])), ...(init ? init.inputs : {}) };
  let seed = init ? init.seed : 3;
  let toy = null;
  let kickAtPeriod = 32;
  let B = null; // current Part B run
  let sweep = null; // { kind, key, data } or { state:'pending' }
  let sweepJob = null;
  let sweepTimer = 0;
  let reveal = 0;
  let kickTest = null;
  let failedMsg = null;
  let colors = {};
  let startedAt = performance.now();
  let frameNo = 0;
  let dark = true;

  const canvas = h('canvas', { class: 'stage-canvas', tabindex: '0', role: 'img', 'aria-label': 'Plots for the temporal symmetry lab.' });
  const chip = h('div', { class: 'e11-chip' });
  const banner = h('div', { class: 'e11-banner', role: 'alert', hidden: true });
  slots.stage.append(canvas, chip, banner);
  const g = canvas.getContext('2d');

  function readColors() {
    colors = { fg: ui.token('--fg'), muted: ui.token('--muted'), line: ui.token('--line'), grid: ui.token('--grid'), bg: ui.token('--bg'), bg2: ui.token('--bg-2'), dawn: ui.token('--dawn'), water: ui.token('--water'), rose: ui.token('--rose'), violet: ui.token('--violet'), jade: ui.token('--jade') };
    const m = /^#([0-9a-f]{6})$/i.exec(colors.bg);
    dark = m ? parseInt(m[1].slice(0, 2), 16) + parseInt(m[1].slice(2, 4), 16) + parseInt(m[1].slice(4), 16) < 380 : true;
  }

  const part = () => vals.part;
  const sysLogistic = () => vals.system === 'logistic';

  // ----- computation -----
  function computeA() {
    try {
      toy = K.subharmonicToy({ T: vals.T, m: vals.m, phase_rad: vals.phase, noise: vals.noise, kickAt_periods: vals.kick > 0 ? kickAtPeriod : -1, kick_rad: vals.kick || 0, nPeriods: 64, perPeriod: 32 }, seed);
    } catch (e) {
      ui.announce(e.message, 'error');
    }
  }

  function computeB() {
    failedMsg = null;
    banner.hidden = true;
    kickTest = null;
    try {
      if (sysLogistic()) {
        const x0 = K.logisticStart(seed);
        const orbit = K.logisticOrbit(vals.r, x0, LOG_TRANS + LOG_KEEP);
        B = { kind: 'logistic', orbit, period: K.logisticPeriod(vals.r, x0), lyap: K.logisticLyapunov(vals.r, x0), total: orbit.length, nTransient: LOG_TRANS };
      } else {
        const r = K.duffingRun({ gamma: vals.gamma, omega0: DUFF_FIXED.omega0, alpha: vals.alpha, F: vals.F, Omega: DUFF_FIXED.Omega, ...DUFF_UI }, seed);
        if (!r.ok) {
          B = { kind: 'duffing', failed: true, strobeX: r.strobeX, strobeV: r.strobeV, total: r.strobeX.length, nTransient: DUFF_UI.nTransient, period: 0 };
          failedMsg = r.reason;
          banner.replaceChildren(h('strong', {}, 'Stopped: the oscillator escaped. '), r.reason, h('p', { class: 'small muted' }, 'With a negative cubic term the spring softens and the motion runs away. The points are the strobe values up to that period. Raise α above 0 to bring it back.'));
          banner.hidden = false;
          ui.announce('Stopped: ' + r.reason, 'error');
        } else B = { kind: 'duffing', ...r, total: r.strobeX.length };
      }
    } catch (e) {
      ui.announce(e.message, 'error');
    }
  }

  function wantSweep() {
    const key = sysLogistic() ? 'logistic:' + seed : `duffing:${vals.gamma}:${vals.alpha}:${seed}`;
    if (sweep && sweep.key === key) return;
    sweep = { key, state: 'pending' };
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => {
      if (sweepJob) sweepJob.cancel();
      const mine = sweep;
      try {
        sweepJob = sysLogistic()
          ? ctx.runJob('e11.logistic-bifurcation', { options: { rMin: 2.5, rMax: 4, nR: 600, nKeep: 60 }, seed })
          : ctx.runJob('e11.duffing-bifurcation', { params: { gamma: vals.gamma, omega0: 0, alpha: vals.alpha, Omega: 1 }, options: { fMin: 1, fMax: 12, nF: 120, nKeep: 40, nTransient: 120, stepsPerPeriod: 80 }, seed });
        sweepJob.promise.then((res) => {
          if (sweep !== mine) return;
          mine.state = 'done';
          mine.data = res.result;
          mine.where = res.where;
          mine.ms = res.elapsedMs;
          refresh(true);
        }).catch((e) => {
          if (e && e.cancelled) return;
          mine.state = 'failed';
          ui.announce('Sweep stopped: ' + e.message, 'error');
        });
      } catch (e) {
        mine.state = 'failed';
      }
    }, 150);
  }

  function resetAll(keepReveal = false) {
    if (!keepReveal) reveal = 0;
    if (part() === 'A') computeA();
    else {
      computeB();
      wantSweep();
    }
  }

  // ----- plotting helpers -----
  function box(x, y, w, hh, title, xr, yr, o = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.fillStyle = colors.bg2;
    g.globalAlpha = 0.55;
    g.fillRect(x, y, w, hh);
    g.globalAlpha = 1;
    const L = 38 * dpr, Rr = 8 * dpr, T = 20 * dpr, Bm = 22 * dpr;
    const px = (v) => x + L + ((v - xr[0]) / (xr[1] - xr[0] || 1)) * (w - L - Rr);
    const py = (v) => y + hh - Bm - ((v - yr[0]) / (yr[1] - yr[0] || 1)) * (hh - T - Bm);
    g.font = `${10.5 * dpr}px ${ui.token('--font-data') || 'monospace'}`;
    g.strokeStyle = colors.grid;
    g.fillStyle = colors.muted;
    g.lineWidth = dpr;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const t of ticks(yr[0], yr[1], 3)) {
      g.beginPath();
      g.moveTo(x + L, py(t));
      g.lineTo(x + w - Rr, py(t));
      g.stroke();
      g.fillText(ui.fmt(t, 2), x + L - 4 * dpr, py(t));
    }
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const t of ticks(xr[0], xr[1], 4)) g.fillText(ui.fmt(t, 2), px(t), y + hh - Bm + 4 * dpr);
    g.textAlign = 'left';
    g.fillStyle = colors.fg;
    g.font = `bold ${11.5 * dpr}px ${ui.token('--font-text') || 'sans-serif'}`;
    g.fillText(title, x + L, y + 4 * dpr);
    g.strokeStyle = colors.line;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
    return { px, py, x, y, w, h: hh, L, Rr, T, Bm, dpr };
  }
  const dot = (cx, cy, r, c, a = 1) => {
    g.globalAlpha = a;
    g.fillStyle = c;
    g.beginPath();
    g.arc(cx, cy, r, 0, 2 * Math.PI);
    g.fill();
    g.globalAlpha = 1;
  };
  function line(pts, px, py, c, w, a = 1) {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.globalAlpha = a;
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([a1, b1], i) => (i ? g.lineTo(px(a1), py(b1)) : g.moveTo(px(a1), py(b1))));
    g.stroke();
    g.globalAlpha = 1;
  }

  let hit = null; // clickable region for Part B

  function drawA() {
    const W = canvas.width, H = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const M = 10 * dpr, top = 44 * dpr;
    const cw = (W - 3 * M) / 2, chh = (H - top - 2 * M) / 2;
    const rev = Math.max(1, Math.floor(reveal));
    const pp = toy.config.perPeriod, T = toy.config.T;
    const n = toy.t.length;
    // time series: last 10 periods up to the playhead
    const p1 = Math.max(10, reveal), p0 = p1 - 10;
    const j0 = Math.max(0, Math.floor(p0 * pp)), j1 = Math.min(n - 1, Math.floor(p1 * pp));
    let a = box(M, top, cw, chh, 'Drive and response', [p0 * T, p1 * T], [-1.6, 1.6]);
    const seg = (arr) => {
      const pts = [];
      for (let j = j0; j <= j1; j++) pts.push([toy.t[j], arr[j]]);
      return pts;
    };
    g.save();
    g.beginPath();
    g.rect(a.x + a.L, a.y + a.T, a.w - a.L - a.Rr, a.h - a.T - a.Bm);
    g.clip();
    line(seg(toy.drive), a.px, a.py, colors.water, 1.5 * dpr, 0.55);
    line(seg(toy.response), a.px, a.py, colors.dawn, 2.4 * dpr);
    for (let q = Math.ceil(p0); q <= Math.floor(p1) && q < toy.strobe.length; q++) {
      g.strokeStyle = colors.violet;
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(a.px(q * T), a.y + a.T);
      g.lineTo(a.px(q * T), a.y + a.h - a.Bm);
      g.stroke();
      g.globalAlpha = 1;
      dot(a.px(q * T), a.py(toy.strobe[q]), 4 * dpr, colors.rose);
    }
    g.restore();
    // spectrum
    const sp = toy.spectrumResponse, sd = toy.spectrumDrive;
    const fr = (k) => sp.freq[k] * T;
    a = box(2 * M + cw, top, cw, chh, 'Spectrum (drive rates)', [0, 3.2], [0, 1.1]);
    for (let k = 1; k < sp.freq.length && fr(k) <= 3.2; k++) {
      for (const [arr, c, al] of [[sd.amp, colors.water, 0.5], [sp.amp, colors.dawn, 1]]) {
        if (arr[k] < 0.01) continue;
        g.strokeStyle = c;
        g.globalAlpha = al;
        g.lineWidth = 2.5 * dpr;
        g.beginPath();
        g.moveTo(a.px(fr(k)), a.py(0));
        g.lineTo(a.px(fr(k)), a.py(Math.min(1.1, arr[k])));
        g.stroke();
        g.globalAlpha = 1;
      }
    }
    if (toy.peak.bin > 0) {
      g.fillStyle = colors.fg;
      g.font = `${11 * dpr}px ${ui.token('--font-data') || 'monospace'}`;
      g.textAlign = 'left';
      g.textBaseline = 'bottom';
      g.fillText(`peak ${ui.fmt(toy.peak.freq * T, 2)} → m ≈ ${ui.fmt(toy.mEstimate, 2)}`, a.px(Math.min(2.0, toy.peak.freq * T + 0.08)), a.py(Math.min(1.0, toy.peak.amp)));
    }
    // strobe samples
    a = box(M, top + chh + M, cw, chh, 'Samples per drive period', [0, 64], [-1.3, 1.3]);
    g.strokeStyle = colors.line;
    g.beginPath();
    g.moveTo(a.px(0), a.py(0));
    g.lineTo(a.px(64), a.py(0));
    g.stroke();
    for (let q = 0; q < Math.min(rev, toy.strobe.length); q++) {
      g.strokeStyle = colors.rose;
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.moveTo(a.px(q), a.py(0));
      g.lineTo(a.px(q), a.py(toy.strobe[q]));
      g.stroke();
      dot(a.px(q), a.py(toy.strobe[q]), 3 * dpr, colors.rose);
    }
    if (vals.kick > 0 && rev > kickAtPeriod) {
      g.strokeStyle = colors.violet;
      g.setLineDash([4 * dpr, 4 * dpr]);
      g.beginPath();
      g.moveTo(a.px(kickAtPeriod), a.y + a.T);
      g.lineTo(a.px(kickAtPeriod), a.y + a.h - a.Bm);
      g.stroke();
      g.setLineDash([]);
    }
    // phase portrait
    a = box(2 * M + cw, top + chh + M, cw, chh, 'Phase portrait', [-1.5, 1.5], [-1.5, 1.5]);
    const jmax = Math.min(n - 2, Math.floor(rev * pp));
    const w0 = (2 * Math.PI) / (toy.config.m * T);
    const pts = [];
    for (let j = Math.max(1, jmax - 6 * toy.config.m * pp); j <= jmax; j++) pts.push([toy.response[j], -(toy.response[j + 1] - toy.response[j - 1]) / (2 * toy.dt) / w0]);
    if (pts.length > 1) line(pts, a.px, a.py, colors.dawn, 1.8 * dpr, 0.8);
    for (let q = 0; q < Math.min(rev, toy.strobe.length); q++) {
      const j = q * pp;
      if (j < 1 || j > n - 2) continue;
      dot(a.px(toy.response[j]), a.py(-(toy.response[j + 1] - toy.response[j - 1]) / (2 * toy.dt) / w0), 4 * dpr, colors.rose, 0.9);
    }
  }

  function drawB() {
    const W = canvas.width, H = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const M = 10 * dpr, top = 44 * dpr;
    const lw = (W - 3 * M) * 0.5, rw = W - 3 * M - lw, hh = (H - top - 2 * M) / 2;
    const isLog = B.kind === 'logistic';
    const cp = isLog ? vals.r : vals.F;
    // bifurcation diagram
    const xr = isLog ? [2.5, 4] : [1, 12];
    const yr = isLog ? [0, 1] : [-4, 4];
    const a = box(M, top, lw, H - top - M, isLog ? 'Bifurcation diagram: click to set r' : 'Bifurcation sweep: click to set F', xr, yr);
    hit = a;
    if (sweep && sweep.state === 'done') {
      const d = sweep.data;
      const nK = d.nKeep;
      const ctrl = isLog ? d.r : d.F;
      g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      g.fillStyle = colors.water;
      g.globalAlpha = dark ? 0.55 : 0.5;
      const s = 1.3 * dpr;
      for (let i = 0; i < ctrl.length; i++)
        for (let j = 0; j < nK; j++) {
          const v = d.x[i * nK + j];
          if (!Number.isFinite(v) || v < yr[0] || v > yr[1]) continue;
          g.fillRect(a.px(ctrl[i]) - s / 2, a.py(v) - s / 2, s, s);
        }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    } else {
      g.fillStyle = colors.muted;
      g.font = `${12 * dpr}px ${ui.token('--font-text') || 'sans-serif'}`;
      g.textAlign = 'center';
      g.fillText(sweep && sweep.state === 'failed' ? 'Sweep stopped' : 'Computing the sweep…', a.x + a.w / 2, a.y + a.h / 2);
    }
    g.strokeStyle = colors.dawn;
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.moveTo(a.px(cp), a.y + a.T);
    g.lineTo(a.px(cp), a.y + a.h - a.Bm);
    g.stroke();
    // right top: Poincaré section / cobweb
    const rx = 2 * M + lw;
    const nShow = Math.min(B.total, Math.max(0, Math.floor(reveal)));
    if (!isLog) {
      let sx = [-4, 4], sv = [-6, 6];
      const b = box(rx, top, rw, hh, 'Poincaré section: (x, x′) once per period', sx, sv);
      for (let n = 0; n < nShow; n++) {
        const steady = n >= B.nTransient;
        dot(b.px(B.strobeX[n]), b.py(B.strobeV[n]), (steady ? 3.6 : 2.4) * dpr, steady ? colors.dawn : colors.violet, steady ? 0.95 : 0.55);
      }
      const c = box(rx, top + hh + M, rw, hh, 'x(t) over the last 6 periods, strobe points marked', [0, 6], [-4, 4]);
      if (B.trace && !B.failed) {
        const S = DUFF_UI.stepsPerPeriod;
        const pts = [];
        for (let i = 0; i < Math.min(B.trace.length, 6 * S); i++) pts.push([i / S, B.trace[B.trace.length - 6 * S + i]]);
        if (pts.length) line(pts, c.px, c.py, colors.dawn, 2 * dpr);
        for (let q = 0; q <= 6; q++) {
          const i = q * S;
          if (i < B.trace.length) dot(c.px(q), c.py(B.trace[B.trace.length - 6 * S + Math.min(i, 6 * S - 1)]), 4 * dpr, colors.rose);
        }
      }
    } else {
      const b = box(rx, top, rw, hh, 'Cobweb: x(n) → x(n+1)', [0, 1], [0, 1]);
      const par = [];
      for (let i = 0; i <= 100; i++) par.push([i / 100, (vals.r * i * (100 - i)) / 10000]);
      line(par, b.px, b.py, colors.muted, 1.5 * dpr);
      line([[0, 0], [1, 1]], b.px, b.py, colors.muted, 1 * dpr, 0.6);
      const cw = [];
      const lo = Math.max(0, nShow - 40);
      for (let n = lo; n < nShow - 1; n++) {
        const x = B.orbit[n], y = B.orbit[n + 1];
        if (n === lo) cw.push([x, 0]);
        cw.push([x, y], [y, y]);
      }
      if (cw.length) line(cw, b.px, b.py, colors.dawn, 1.6 * dpr, 0.9);
      const c = box(rx, top + hh + M, rw, hh, 'x(n) by iteration: muted = transient', [0, B.total], [0, 1]);
      for (let n = 0; n < nShow; n++) dot(c.px(n), c.py(B.orbit[n]), (n >= B.nTransient ? 2.8 : 2) * dpr, n >= B.nTransient ? colors.dawn : colors.violet, n >= B.nTransient ? 1 : 0.6);
    }
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    if (!W) return;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = colors.bg;
    g.fillRect(0, 0, W, H);
    hit = null;
    if (part() === 'A') toy && drawA();
    else B && drawB();
  }

  // ----- metrics and charts -----
  const metricBox = h('div', {});
  slots.metrics.append(metricBox);
  let metricsUI = null;
  let metricsFor = '';
  const chartSpec = chart.chartBox(slots.metrics, { title: 'Spectrum of the response', height: 140 });
  const chartSweep = chart.chartBox(slots.metrics, { title: 'Period found along the sweep', height: 140 });
  const note = h('p', { class: 'note' });
  const btnRow = h('div', { class: 'btnrow' });
  const kickBtn = ui.button('Kick it', () => kickIt(), { kind: 'small', title: 'Adds the test kick to the steady state and checks the return' });
  btnRow.append(kickBtn);
  slots.metrics.append(note, btnRow);

  function ensureMetrics() {
    const key = part() === 'A' ? 'A' : sysLogistic() ? 'BL' : 'BD';
    if (key === metricsFor) return;
    metricsFor = key;
    metricBox.replaceChildren();
    const defs = key === 'A'
      ? [{ name: 'status', label: 'Reading', wide: true }, { name: 'm', label: 'Division m set', digits: 0 }, { name: 'mest', label: 'm from the spectrum', digits: 2 }, { name: 'peak', label: 'Peak frequency', digits: 3, unit: 'drive rates' }, { name: 'sper', label: 'Repeat length of the samples', digits: 0, unit: 'drive periods' }, { name: 'fps', label: 'Frame rate', digits: 0, unit: 'frames / s' }]
      : [{ name: 'status', label: 'Reading', wide: true }, { name: 'period', label: 'Period found', digits: 0, unit: 'drive periods / iterations' }, key === 'BL' ? { name: 'lyap', label: 'Lyapunov exponent', digits: 3, unit: '1/iteration' } : { name: 'amp', label: 'Steady amplitude of x', digits: 3 }, { name: 'trans', label: 'Transient shown', digits: 0, unit: 'periods' }, { name: 'kickTest', label: 'After a kick', wide: true }, { name: 'fps', label: 'Frame rate', digits: 0, unit: 'frames / s' }];
    metricsUI = ui.metricGrid(metricBox, defs);
  }

  function strobePeriodA() {
    return K.periodOf(Array.from(toy.strobe), { tol: 1e-3, maxP: 16, window: 32 });
  }

  function updateMetrics() {
    ensureMetrics();
    chartSpec.el.hidden = part() !== 'A';
    chartSweep.el.hidden = part() === 'A';
    btnRow.hidden = part() === 'A';
    chip.textContent = part() === 'A' ? 'Part A · frequency division only, not a time crystal' : sysLogistic() ? 'Part B · logistic map · period doubling, not a time crystal' : 'Part B · Duffing oscillator · period doubling, not a time crystal';
    if (part() === 'A' && toy) {
      const sper = strobePeriodA();
      const mest = toy.mEstimate;
      let text = `Spectrum peak at 1/${ui.fmt(mest, 2)} of the drive rate`;
      let tone = 'good';
      if (sper !== toy.config.m) {
        text = `Samples repeat every ${sper || '?'}, not ${toy.config.m}: this sampling phase hides the division. The spectrum still shows it.`;
        tone = TONE_MID;
      }
      metricsUI.set('status', 0, { text, tone });
      metricsUI.set('m', toy.config.m);
      metricsUI.set('mest', mest);
      metricsUI.set('peak', toy.peak.freq * toy.config.T);
      metricsUI.set('sper', sper, { text: sper ? undefined : 'none' });
      note.textContent = 'Frequency division only. The response is written by hand at 1/m of the drive rate, so this is not a time crystal.';
    } else if (B) {
      const logi = B.kind === 'logistic';
      let text, tone = '';
      if (B.failed) (text = 'Escaped: the run stopped'), (tone = 'bad');
      else if (B.period > 0) (text = `Period ${B.period} reached after the transient`), (tone = 'good');
      else (text = 'No period found: chaos, a long period, or a slow transient'), (tone = TONE_MID);
      metricsUI.set('status', 0, { text, tone });
      metricsUI.set('period', B.period, { text: B.period > 0 ? undefined : 'none' });
      if (logi) metricsUI.set('lyap', B.lyap, { tone: B.lyap > 0 ? TONE_MID : '' });
      else {
        const xs = B.failed ? [] : Array.from(B.strobeX.slice(B.nTransient));
        metricsUI.set('amp', xs.length ? Math.max(...xs.map(Math.abs)) : NaN, { text: xs.length ? undefined : '—', sub: 'largest |x| at the strobe' });
      }
      metricsUI.set('trans', B.nTransient);
      metricsUI.set('kickTest', 0, { text: kickTest ? (kickTest.ok === false ? 'Stopped: ' + kickTest.reason : `Kick ${kickTest.kick}: ${kickTest.returned ? `back to the same set after ${kickTest.periodsToReturn} periods` : 'did not return to the same set'}; period ${kickTest.periodBefore} → ${kickTest.periodAfter || 'none'}`) : 'press Kick it', tone: kickTest ? (kickTest.returned ? 'good' : TONE_MID) : '' });
      note.textContent = 'Period doubling in a toy. One oscillator or one map with tuned parameters is not a time crystal.';
    }
    metricsUI.set('fps', loop.fps);
    canvas.setAttribute('aria-label', part() === 'A' ? `Part A plots: drive and response, spectrum, samples and phase portrait. Division set ${vals.m}, estimated from the spectrum ${toy ? ui.fmt(toy.mEstimate, 2) : ''}.` : `Part B plots: bifurcation diagram, ${sysLogistic() ? 'cobweb and orbit' : 'Poincaré section and trace'}. Period found ${B ? B.period : ''}. Click the diagram to set the control value.`);
  }

  function drawCharts() {
    if (part() === 'A' && toy) {
      const sp = toy.spectrumResponse, T = toy.config.T;
      const pts = [];
      for (let k = 0; k < sp.freq.length && sp.freq[k] * T <= 3.2; k++) pts.push([sp.freq[k] * T, sp.amp[k]]);
      chartSpec.draw(() => chart.drawLines(chartSpec.canvas, { series: [{ name: 'response', points: pts, color: ui.token('--dawn'), width: 2 }], xLabel: 'frequency / drive rate', yLabel: 'amplitude', yZero: true }));
      chart.dataTable(chartSpec.text, ['frequency / drive rate', 'amplitude'], pts.filter((p) => p[1] > 0.005 || p[0] < 0.01));
    } else if (part() === 'B' && sweep && sweep.state === 'done') {
      const d = sweep.data;
      if (sysLogistic()) {
        const pts = d.r.map((r, i) => [r, d.lyap[i]]);
        chartSweep.el.querySelector('figcaption').textContent = 'Lyapunov exponent along r (above 0: no period)';
        chartSweep.draw(() => chart.drawLines(chartSweep.canvas, { series: [{ name: 'Lyapunov', points: pts, color: ui.token('--rose'), width: 1.8 }], xLabel: 'r', yLabel: 'exponent', marks: [{ y: 0, color: ui.token('--muted') }, { x: vals.r, color: ui.token('--dawn') }] }));
        chart.dataTable(chartSweep.text, ['r', 'Lyapunov exponent'], pts);
      } else {
        const pts = d.F.map((F, i) => [F, d.period[i]]);
        chartSweep.el.querySelector('figcaption').textContent = 'Period found along the sweep (0 = none found, −1 = escaped)';
        chartSweep.draw(() => chart.drawLines(chartSweep.canvas, { series: [{ name: 'period', points: pts, color: ui.token('--rose'), width: 1.8 }], xLabel: 'F', yLabel: 'period', marks: [{ x: vals.F, color: ui.token('--dawn') }] }));
        chart.dataTable(chartSweep.text, ['F', 'period found'], pts);
      }
    }
  }

  function refresh(charts) {
    draw();
    updateMetrics();
    if (charts) drawCharts();
  }

  function kickIt() {
    if (!B || B.failed) return;
    try {
      kickTest = sysLogistic() ? logisticKick() : K.duffingRobustness({ gamma: vals.gamma, omega0: 0, alpha: vals.alpha, F: vals.F, Omega: 1, nTransient: 300, stepsPerPeriod: 100 }, { kick: vals.kickB }, seed);
    } catch (e) {
      kickTest = { ok: false, reason: e.message };
    }
    refresh(false);
  }
  function logisticKick() {
    const o = K.logisticOrbit(vals.r, K.logisticStart(seed), 4000);
    const base = o[3999];
    const set = Array.from(o.slice(3900));
    const x0 = Math.min(1, Math.max(0, base + vals.kickB));
    const after = K.logisticOrbit(vals.r, x0, 4100);
    const tol = 1e-6;
    const near = (v) => set.some((s) => Math.abs(s - v) < tol);
    let back = -1;
    for (let n = 0; n < 4000 && back < 0; n++) if (near(after[n])) back = n;
    const p = K.logisticPeriod(vals.r, x0);
    return { ok: true, kick: vals.kickB, periodBefore: B.period, periodAfter: p, returned: back >= 0 && p === B.period, periodsToReturn: back };
  }

  // ----- loop -----
  const total = () => (part() === 'A' ? toy.config.nPeriods : B ? B.total : 0);
  const loop = ctx.loop((dt) => {
    reveal = Math.min(total(), reveal + vals.speed * dt);
    frameNo++;
    draw();
    if (frameNo % 6 === 0) updateMetrics();
    if (reveal >= total()) {
      loop.stop();
      transport.setRunning(false);
      refresh(true);
    }
  });

  function setRunning(r) {
    if (r && reveal >= total()) reveal = 0;
    if (r) loop.start();
    else loop.stop();
    transport.setRunning(r);
  }

  const transport = ui.transport({
    seed,
    stepLabel: 'Step 1 period',
    onToggle: () => setRunning(!loop.running),
    onStep: () => {
      loop.stop();
      transport.setRunning(false);
      reveal = Math.min(total(), Math.floor(reveal) + 1);
      refresh(false);
    },
    onReset: () => {
      loop.stop();
      transport.setRunning(false);
      resetAll();
      refresh(true);
    },
    onReplay: () => {
      resetAll();
      refresh(true);
      setRunning(true);
    },
    onSeed: (s) => {
      seed = s;
      transport.setSeed(s);
      resetAll();
      refresh(true);
    },
  });
  slots.controls.append(transport.el);
  const ctlBox = h('div', {});
  slots.controls.append(ctlBox);

  const A_NAMES = ['T', 'm', 'phase', 'noise', 'kick'];
  const BD_NAMES = ['F', 'gamma', 'alpha'];
  const B_NAMES = ['system', 'bpreset', 'kickB'];
  function layoutControls() {
    const p = part();
    for (const n of A_NAMES) panel.refs[n].el.hidden = p !== 'A';
    for (const n of B_NAMES) panel.refs[n].el.hidden = p !== 'B';
    for (const n of BD_NAMES) panel.refs[n].el.hidden = !(p === 'B' && !sysLogistic());
    panel.refs.r.el.hidden = !(p === 'B' && sysLogistic());
  }
  function setPresetOptions() {
    const sel = panel.refs.bpreset.input;
    const src = sysLogistic() ? LOG_PRESETS : DUFF_PRESETS;
    sel.replaceChildren(...Object.entries(src).map(([v, p]) => h('option', { value: v }, p.label)));
    sel.value = vals.bpreset in src ? vals.bpreset : 'p2';
    vals.bpreset = sel.value;
  }
  const panel = ui.controlPanel(ctlBox, meta.inputs, vals, (name, v) => {
    if (name === 'part') {
      layoutControls();
      restart();
      return;
    }
    if (name === 'system') {
      setPresetOptions();
      applyPreset(vals.bpreset);
      layoutControls();
      restart();
      return;
    }
    if (name === 'bpreset') {
      applyPreset(v);
      restart();
      return;
    }
    if (name === 'speed' || name === 'kickB') return;
    if (name === 'kick' && v > 0 && kickAtPeriod < 1) kickAtPeriod = 32;
    if (name === 'F' || name === 'r' || name === 'gamma' || name === 'alpha') {
      reveal = total() || 0;
      if (part() === 'B') reveal = DUFF_UI.nTransient + DUFF_UI.nSample;
    }
    resetAll(part() === 'A');
    if (part() === 'B') reveal = B ? B.total : 0;
    if (part() === 'A' && !loop.running) reveal = Math.max(reveal, 12);
    refresh(true);
  });
  function restart() {
    loop.stop();
    transport.setRunning(false);
    resetAll();
    if (ctx.reducedMotion()) {
      reveal = total();
      refresh(true);
    } else {
      refresh(true);
      setRunning(true);
    }
  }
  function applyPreset(k) {
    if (sysLogistic()) {
      const p = LOG_PRESETS[k] || LOG_PRESETS.p2;
      panel.setAll({ r: p.r });
    } else {
      const p = DUFF_PRESETS[k] || DUFF_PRESETS.p2;
      panel.setAll({ F: p.F, gamma: p.gamma, alpha: p.alpha });
    }
  }
  setPresetOptions();
  layoutControls();

  // ----- pointer and keys -----
  function setControlFromX(clientX) {
    if (part() !== 'B' || !hit) return;
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) * (canvas.width / r.width);
    const f = Math.min(1, Math.max(0, (x - (hit.x + hit.L)) / (hit.w - hit.L - hit.Rr)));
    if (sysLogistic()) {
      const v = Math.round((2.5 + f * 1.5) / 0.005) * 0.005;
      panel.set('r', v);
    } else {
      const v = Math.round((1 + f * 11) / 0.05) * 0.05;
      panel.set('F', v);
    }
    resetAll();
    reveal = B ? B.total : 0;
    refresh(true);
  }
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    if (part() === 'A') {
      kickAtPeriod = Math.max(1, Math.floor(reveal));
      panel.set('kick', Math.PI);
      resetAll(true);
      refresh(true);
      return;
    }
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    if (hit && x < hit.x + hit.w) {
      canvas.setPointerCapture(e.pointerId);
      setControlFromX(e.clientX);
      canvas._drag = true;
    }
  });
  canvas.addEventListener('pointermove', (e) => canvas._drag && setControlFromX(e.clientX));
  canvas.addEventListener('pointerup', () => (canvas._drag = false));
  canvas.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (dir) {
      e.preventDefault();
      if (part() === 'B') {
        if (sysLogistic()) panel.set('r', Math.min(4, Math.max(2.5, vals.r + dir * 0.01)));
        else panel.set('F', Math.min(12, Math.max(0.5, vals.F + dir * 0.1)));
      } else panel.set('phase', Math.min(3.14, Math.max(-3.14, vals.phase + dir * 0.1)));
      resetAll(part() === 'A');
      if (part() === 'B' && B) reveal = B.total;
      refresh(true);
    } else if ((e.key === 'Enter' || e.key === ' ') && part() === 'B') {
      e.preventDefault();
      kickIt();
    } else if ((e.key === 'Enter' || e.key === ' ') && part() === 'A') {
      e.preventDefault();
      kickAtPeriod = Math.max(1, Math.floor(reveal));
      panel.set('kick', Math.PI);
      resetAll(true);
      refresh(true);
    }
  });

  const stopFit = ui.fitCanvas(canvas, () => draw());
  const stopTheme = watchTheme(() => {
    readColors();
    refresh(true);
  });
  readColors();
  resetAll();
  reveal = ctx.reducedMotion() || init ? total() : 0;
  refresh(true);
  if (!ctx.reducedMotion() && !init) setRunning(true);

  return {
    getRecord() {
      let metrics;
      if (part() === 'A') {
        metrics = [
          { name: 'Division m set', value: toy.config.m, unit: '' },
          { name: 'Division estimated from the spectrum', value: toy.mEstimate, unit: '' },
          { name: 'Peak frequency', value: toy.peak.freq * toy.config.T, unit: 'drive rates' },
          { name: 'Repeat length of the samples', value: strobePeriodA(), unit: 'drive periods', note: '0 means none found' },
        ];
      } else {
        metrics = [
          { name: 'Period found', value: B ? B.period : null, unit: B && B.kind === 'logistic' ? 'iterations' : 'drive periods', note: '0 means none found' },
          { name: 'Lyapunov exponent', value: B && B.kind === 'logistic' ? B.lyap : null, unit: '1/iteration' },
          { name: 'Escaped', value: failedMsg ? 1 : 0, unit: '', note: failedMsg || 'no' },
          { name: 'Kick test returned', value: kickTest && kickTest.ok !== false ? (kickTest.returned ? 1 : 0) : null, unit: '', note: kickTest && kickTest.ok !== false ? `kick ${kickTest.kick}, ${kickTest.periodsToReturn} periods` : 'not run' },
        ];
      }
      return { inputs: { ...vals }, seed, metrics, diagnostics: { fps: loop.fps, revealed: Math.floor(reveal), sweepMs: sweep && sweep.ms ? sweep.ms : null }, elapsedMs: performance.now() - startedAt };
    },
    getTable() {
      if (part() === 'A') return { columns: ['t', 'drive', 'response'], rows: Array.from(toy.t, (t, i) => [t, toy.drive[i], toy.response[i]]) };
      if (!B) return { columns: ['n'], rows: [] };
      if (B.kind === 'logistic') return { columns: ['n', 'x'], rows: Array.from(B.orbit, (x, i) => [i, x]) };
      return { columns: ['n', 'x', 'v'], rows: Array.from(B.strobeX, (x, i) => [i, x, B.strobeV[i]]) };
    },
    destroy() {
      stopFit();
      stopTheme();
      clearTimeout(sweepTimer);
      if (sweepJob) sweepJob.cancel();
      loop.stop();
      chartSpec.destroy();
      chartSweep.destroy();
    },
  };
}
