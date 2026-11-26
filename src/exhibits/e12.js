// E12 Mathematical Blossoms: phyllotaxis. See CONTRACT.md.
import { analyze, GOLDEN_ANGLE_DEG, LIMITS, rationalTurns } from '../kernels/e12.js';

export const meta = {
  id: 'E12',
  title: 'Mathematical Blossoms',
  subtitle: 'phyllotaxis',
  priority: 'P1',
  kind: 'simulation',
  dataStatus: 'MATHEMATICAL',
  methodVersion: 'e12-phyllotaxis-1.0.0',
  blurb: 'Seeds placed one by one at the golden angle pack evenly; a rational angle leaves rays and gaps.',
  inputs: [
    { name: 'N', label: 'Points N', type: 'range', min: LIMITS.N[0] + 9, max: LIMITS.N[1], step: 1, default: 900, unit: '', integer: true },
    { name: 'angle_deg', label: 'Turn angle α', type: 'range', min: 0, max: 360, step: 0.001, default: GOLDEN_ANGLE_DEG, unit: '°', help: 'Each new point sits this far round from the one before.' },
    { name: 'amp', label: 'Radial modulation a', type: 'range', min: 0, max: LIMITS.amp[1], step: 0.01, default: 0, unit: '', help: 'r′ = r (1 + a sin kθ)' },
    { name: 'sym', label: 'Modulation symmetry k', type: 'range', min: 1, max: 24, step: 1, default: 5, unit: '', integer: true },
    { name: 'jitter', label: 'Position jitter', type: 'range', min: 0, max: LIMITS.jitter[1], step: 0.01, default: 0, unit: '× scale', help: 'Seeded random shift of each point. The seed changes nothing while this is 0.' },
    { name: 'scale_mm', label: 'Scale c', type: 'range', min: 0.2, max: 5, step: 0.05, default: 1, unit: 'mm', help: 'r = c √n' },
    { name: 'compare', label: 'Compare with angle', type: 'select', default: 'none', options: [
      { value: 'none', label: 'None' },
      { value: '120', label: '120° (1/3 turn)' },
      { value: '144', label: '144° (2/5 turn)' },
      { value: '137.5', label: '137.5° (11/24 turn)' },
      { value: '90', label: '90° (1/4 turn)' },
    ] },
  ],
  outputs: [
    { name: 'meanNN', label: 'Mean nearest-neighbour distance', unit: 'mm' },
    { name: 'gap', label: 'Largest empty disc', unit: '× mean spacing' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32 stream derived from the seed and the label e12.jitter. It draws the position jitter only. With jitter 0 the points are the same for every seed.',
  method: `<p>Point n (n = 0 … N−1) sits at radius r<sub>n</sub> = c √n and polar angle θ<sub>n</sub> = n α. Equal steps in n give equal steps in area, so the density is uniform: points per unit area = 1 / (π c²).</p>
<p class="eq">r′<sub>n</sub> = c √n · (1 + a sin(k θ<sub>n</sub>)),  x = r′ cos θ,  y = r′ sin θ</p>
<p>The golden angle is α = 360° / φ² = 137.50776…°, with φ = (1 + √5)/2. A turn fraction p/q (a rational angle) puts every point on q rays and leaves wide empty wedges. The exhibit tests the angle against fractions with q up to 720 at tolerance 1e-9 and reports the ray count when it finds one.</p>
<p><b>Nearest neighbours.</b> A uniform grid hash gives each point its nearest neighbour in O(N) for spread-out points; the unit test compares it with an all-pairs search. The index gap |i − j| between a point and its nearest neighbour is tallied; for the golden angle the most common gaps are Fibonacci numbers, the spiral counts you see in a sunflower head.</p>
<p><b>Radial density.</b> Points in rings of equal width divided by ring area. <b>Largest empty disc.</b> A 70 × 70 grid of sample positions inside the pattern; the largest distance from a sample to its nearest point, divided by the mean nearest-neighbour distance.</p>
<p>Disc radius on screen is half the point's own nearest-neighbour distance, so touching discs show the packing.</p>`,
  limitations: [
    'A mathematical toy. It does not model how a plant grows.',
    'The largest empty disc comes from a 70 × 70 sample grid, so it is accurate to about one sample step.',
    'Radial modulation above a = 0.95 is refused, because points would cross the centre.',
  ],
  provenance: [],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E12"] .e12-bar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 8px 12px 0; }
[data-ex="E12"] .e12-bar .ctl { padding: 0; border: 0; }
[data-ex="E12"] .e12-cap { flex: none; padding: 4px 12px 8px; font-size: 0.85rem; color: var(--muted); min-height: 2.4em; }
[data-ex="E12"] canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
[data-ex="E12"] .e12-btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
[data-ex="E12"] .e12-status { margin: 6px 0; }
[data-ex="E12"] .stage-split { background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--violet) 14%, var(--bg)), var(--bg) 70%); }
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
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const turnText = (deg) => {
  const r = rationalTurns(deg);
  return r ? `${r.p}/${r.q} turn` : 'irrational to 1e-9';
};

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const values = { ...DEFAULTS, ...((ctx.initial && ctx.initial.inputs) || {}) };
  let seed = ctx.initial && Number.isInteger(ctx.initial.seed) ? ctx.initial.seed : 12;
  let an = null, an2 = null, err = '', sel = 300, shown = 0, colourMode = 'index', pal = null;
  let geo = [null, null];
  let lastAnalyzeMs = 0, lastDrawMs = 0, drawn = 0;

  const palette = () => ({
    dawn: rgbOf(ui.token('--dawn')), rose: rgbOf(ui.token('--rose')), violet: rgbOf(ui.token('--violet')), water: rgbOf(ui.token('--water')),
    jade: rgbOf(ui.token('--jade')), fg: rgbOf(ui.token('--fg')), muted: rgbOf(ui.token('--muted')), bg: rgbOf(ui.token('--bg')),
  });
  const byIndex = (t) => (t < 0.5 ? mix(pal.dawn, pal.rose, t * 2) : mix(pal.rose, pal.violet, (t - 0.5) * 2));
  const byGap = (ratio) => {
    const t = Math.max(0, Math.min(1, (ratio - 0.6) / 1.2));
    return t < 0.5 ? mix(pal.water, pal.jade, t * 2) : mix(pal.jade, pal.dawn, (t - 0.5) * 2);
  };

  // ---- stage ----
  const c1 = h('canvas', { class: 'stage-canvas', tabindex: 0, role: 'img', 'aria-label': 'Points placed at a fixed turn angle. Arrow keys move the selected point.' });
  const c2 = h('canvas', { class: 'stage-canvas', role: 'img', 'aria-label': 'Comparison pattern at a second turn angle.' });
  const l1 = h('div', { class: 'stage-label' }, '');
  const l2 = h('div', { class: 'stage-label' }, '');
  const w2 = h('div', {}, c2, l2);
  const split = h('div', { class: 'stage-split' }, h('div', {}, c1, l1), w2);
  const cap = h('div', { class: 'e12-cap', 'aria-live': 'polite' }, '');
  const colourCtl = ui.segmented({ name: 'colour', label: 'Colour by', options: [
    { value: 'index', label: 'Order planted' }, { value: 'gap', label: 'Spacing' },
  ] }, colourMode, (v) => { colourMode = v; draw(); });
  slots.stage.append(h('div', { class: 'e12-bar' }, colourCtl.el), split, cap);

  // ---- controls ----
  const status = h('div', { class: 'e12-status', role: 'status' });
  const tp = ui.transport({
    seed, running: false, stepLabel: 'Plant 1',
    onToggle: () => {
      if (loop.running) { loop.stop(); tp.setRunning(false); return; }
      if (shown >= values.N) shown = 1;
      loop.start();
      tp.setRunning(true);
    },
    onStep: () => { loop.stop(); tp.setRunning(false); shown = Math.min(values.N, shown + 1); sel = shown - 1; update(); },
    onReset: () => {
      loop.stop(); tp.setRunning(false);
      Object.assign(values, DEFAULTS);
      panel.setAll(DEFAULTS);
      shown = values.N; sel = 300;
      recompute();
    },
    onReplay: () => { shown = 1; loop.start(); tp.setRunning(true); },
    onSeed: (v) => { seed = v; recompute(); },
  });
  const panel = ui.controlPanel(slots.controls, meta.inputs, values, () => {
    loop.stop(); tp.setRunning(false);
    shown = values.N;
    recompute();
  });
  slots.controls.prepend(tp.el);
  const setAngle = (a) => { values.angle_deg = a; panel.set('angle_deg', a); loop.stop(); tp.setRunning(false); shown = values.N; recompute(); };
  slots.controls.append(
    h('div', { class: 'e12-btns' },
      ui.button('Golden angle', () => setAngle(GOLDEN_ANGLE_DEG), { kind: 'small' }),
      ui.button('137.5° exactly', () => setAngle(137.5), { kind: 'small', title: '137.5° is 11/24 of a turn: close to golden, and rational' }),
      ui.button('Failure case: 120°', () => setAngle(120), { kind: 'small', title: 'A rational angle: three rays and wide gaps' }),
      ui.button('One ray: 0°', () => setAngle(0), { kind: 'small' })),
    h('div', { class: 'e12-btns' },
      ui.button('Previous point', () => select(sel - 1), { kind: 'small' }),
      ui.button('Next point', () => select(sel + 1), { kind: 'small' })),
    status);

  // ---- metrics ----
  const mg = ui.metricGrid(slots.metrics, [
    { name: 'N', label: 'Points', digits: 0 },
    { name: 'meanNN', label: 'Mean nearest-neighbour', unit: 'mm', digits: 3 },
    { name: 'cv', label: 'Spread of spacing (sd / mean)', digits: 3 },
    { name: 'minNN', label: 'Closest pair', unit: 'mm', digits: 3 },
    { name: 'gap', label: 'Largest empty disc', unit: '× mean spacing', digits: 2 },
    { name: 'turn', label: 'Angle as a turn fraction', wide: true },
    { name: 'spirals', label: 'Most common index gaps to nearest neighbour', wide: true },
    { name: 'cmp', label: 'Comparison: mean spacing / empty disc', wide: true },
    { name: 'selected', label: 'Selected point', wide: true },
  ]);
  const cRad = chart.chartBox(slots.metrics, { title: 'Radial density: points per mm² by distance from the centre', height: 170 });
  const cNN = chart.chartBox(slots.metrics, { title: 'Nearest-neighbour distances', height: 170 });

  // ---- logic ----
  const loop = ctx.loop((dt) => {
    const rate = Math.max(60, values.N / 5);
    shown = Math.min(values.N, shown + Math.max(1, Math.round(rate * dt)));
    drawAll();
    if (shown >= values.N) { loop.stop(); tp.setRunning(false); updateText(); }
  });

  function recompute() {
    err = '';
    const t0 = performance.now();
    try {
      const cfg = { N: values.N, angle_deg: values.angle_deg, amp: values.amp, sym: values.sym, jitter: values.jitter, scale_mm: values.scale_mm };
      an = analyze(cfg, seed);
      an2 = values.compare === 'none' ? null : analyze({ ...cfg, angle_deg: Number(values.compare) }, seed);
      if (!an.ok) throw new Error('A computed value is not finite.');
    } catch (e) {
      an = null; an2 = null;
      err = e.message;
      ctx.announce('Stopped: ' + e.message, 'error');
    }
    lastAnalyzeMs = performance.now() - t0;
    if (an) { shown = Math.min(Math.max(shown, 1), an.N); sel = Math.max(0, Math.min(an.N - 1, sel)); }
    update();
  }

  function update() {
    updateText();
    draw();
  }

  function select(i) {
    if (!an) return;
    sel = Math.max(0, Math.min(an.N - 1, i));
    if (sel >= shown) shown = Math.min(an.N, sel + 1);
    updateText();
    drawAll();
  }

  function updateText() {
    status.replaceChildren();
    if (err) {
      status.append(ui.note('Stopped: ' + err, 'error'));
      return;
    }
    if (!an) return;
    mg.set('N', an.N);
    mg.set('meanNN', an.meanNN);
    mg.set('cv', an.cvNN);
    mg.set('minNN', an.minNN);
    mg.set('gap', an.gapRatio, { tone: an.gapRatio > 2.5 ? 'bad' : an.gapRatio < 1.6 ? 'good' : '' });
    mg.set('turn', 0, { text: turnText(values.angle_deg), tone: an.rational ? 'bad' : '', sub: an.rational ? `${an.rays} rays` : `${(values.angle_deg / 360).toFixed(6)} turns` });
    mg.set('spirals', 0, { text: an.spirals.length ? an.spirals.map((s) => s.offset).join(', ') : '—', sub: 'share of points: ' + an.spirals.map((s) => Math.round((100 * s.count) / an.N) + '%').join(', ') });
    mg.set('cmp', 0, { text: an2 ? `${an2.meanNN.toFixed(3)} mm / ${an2.gapRatio.toFixed(2)}×` : 'no comparison chosen', sub: an2 ? `angle ${values.compare}°, ${turnText(Number(values.compare))}` : '' });
    const i = sel;
    mg.set('selected', 0, {
      text: `n = ${i}, r = ${an.r[i].toFixed(3)} mm, θ = ${an.thetaDeg[i].toFixed(1)}°`,
      sub: Number.isFinite(an.nn[i]) ? `nearest neighbour n = ${an.idx[i]} at ${an.nn[i].toFixed(3)} mm` : 'no neighbour',
    });
    if (an.rational) {
      status.append(ui.note(`The angle is ${turnText(values.angle_deg)}. Every point falls on one of ${an.rays} rays, and the largest empty disc is ${an.gapRatio.toFixed(1)} times the mean spacing. This is not an even packing.`, 'error'));
    } else if (values.jitter === 0 && values.amp === 0) {
      status.append(ui.note(`Seed ${seed} changes nothing here: jitter is 0. Raise jitter to draw from the seed.`));
    }
    if (values.N < 20) status.append(ui.note('Few points: the spacing numbers describe very little.'));
    drawCharts();
    const sh = shown >= an.N ? '' : ` Showing ${shown} of ${an.N} points.`;
    cap.textContent = `α = ${values.angle_deg.toFixed(3)}°, ${an.N} points, mean spacing ${an.meanNN.toFixed(3)} mm.${sh} Discs are half the distance to each point's nearest neighbour.`;
  }

  function drawCharts() {
    if (!an) return;
    const rd = an.radial;
    const s = [{ name: 'angle', color: ui.token('--dawn'), width: 2.5, points: rd.centers.map((r, i) => [r, rd.density[i]]) }];
    if (an2) s.push({ name: 'comparison', color: ui.token('--water'), width: 2, points: an2.radial.centers.map((r, i) => [r, an2.radial.density[i]]) });
    cRad.draw(() => chart.drawLines(cRad.canvas, {
      series: s, xLabel: 'distance from centre, mm', yLabel: 'points / mm²', yZero: true,
      marks: values.amp === 0 ? [{ y: 1 / (Math.PI * values.scale_mm ** 2), color: ui.token('--muted'), label: '1/(πc²)' }] : [],
    }));
    chart.dataTable(cRad.text, ['distance mm', 'points per mm²' + (an2 ? ' (angle)' : ''), ...(an2 ? ['points per mm² (comparison)'] : [])],
      rd.centers.map((r, i) => (an2 ? [r, rd.density[i], an2.radial.density[i] ?? ''] : [r, rd.density[i]])), 30);
    const fin = (a) => Array.from(a.nn).filter(Number.isFinite);
    const A = fin(an), B = an2 ? fin(an2) : [];
    const hi = Math.max(1e-9, ...A, ...B) * 1.001;
    const bins = 24;
    const hist = (v) => {
      const counts = new Array(bins).fill(0);
      for (const d of v) counts[Math.min(bins - 1, Math.floor((d / hi) * bins))]++;
      return counts;
    };
    const ca = hist(A), cb = an2 ? hist(B) : null;
    cNN.draw(() => chart.drawHistogram(cNN.canvas, {
      series: [{ lo: 0, hi, counts: ca, color: ui.token('--dawn') }, ...(cb ? [{ lo: 0, hi, counts: cb, color: ui.token('--water'), alpha: 0.55 }] : [])],
      xLabel: 'nearest-neighbour distance, mm',
    }));
    chart.dataTable(cNN.text, ['distance from mm', 'points (angle)', ...(cb ? ['points (comparison)'] : [])], ca.map((c, i) => (cb ? [(i * hi) / bins, c, cb[i]] : [(i * hi) / bins, c])), 30);
  }

  // ---- drawing ----
  function paint(canvas, a, slot, count, selIdx) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    if (!a) {
      geo[slot] = null;
      return;
    }
    let ext = 0;
    for (let i = 0; i < a.N; i++) ext = Math.max(ext, Math.hypot(a.x[i], a.y[i]));
    ext = ext || 1;
    const dpr = W / (canvas.clientWidth || W);
    const k = (Math.min(W, H) / 2 - 10 * dpr) / ext;
    const cx = W / 2, cy = H / 2;
    geo[slot] = { cx, cy, k, dpr };
    const n = Math.min(count, a.N);
    for (let i = 0; i < n; i++) {
      const rr = Math.max(1.2 * dpr, 0.5 * (Number.isFinite(a.nn[i]) ? a.nn[i] : a.meanNN) * k * 0.92);
      const col = colourMode === 'index' ? byIndex(i / Math.max(1, a.N - 1)) : byGap(a.meanNN > 0 ? a.nn[i] / a.meanNN : 1);
      g.fillStyle = rgba(col, 0.95);
      g.beginPath();
      g.arc(cx + a.x[i] * k, cy - a.y[i] * k, rr, 0, 6.2832);
      g.fill();
    }
    if (n < a.N && n > 0) {
      g.strokeStyle = rgba(pal.fg, 0.5);
      g.lineWidth = dpr;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + a.x[n - 1] * k, cy - a.y[n - 1] * k);
      g.stroke();
    }
    if (slot === 0 && selIdx < n) {
      const px = cx + a.x[selIdx] * k, py = cy - a.y[selIdx] * k;
      g.lineWidth = 1.5 * dpr;
      g.strokeStyle = rgba(pal.fg, 0.9);
      const links = new Set([a.idx[selIdx]]);
      for (const s of a.spirals.slice(0, 2)) { links.add(selIdx + s.offset); links.add(selIdx - s.offset); }
      for (const j of links) {
        if (j < 0 || j >= n || j === selIdx) continue;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(cx + a.x[j] * k, cy - a.y[j] * k);
        g.stroke();
      }
      g.beginPath();
      g.arc(px, py, 7 * dpr, 0, 6.2832);
      g.stroke();
    }
  }

  function drawAll() {
    const t0 = performance.now();
    pal = pal || palette();
    paint(c1, an, 0, shown, sel);
    if (an2) paint(c2, an2, 1, shown, -1);
    lastDrawMs = performance.now() - t0;
    drawn++;
  }

  function draw() {
    pal = palette();
    const two = !!an2;
    w2.style.display = two ? '' : 'none';
    split.style.gridTemplateColumns = two ? '' : '1fr';
    l1.textContent = an ? `α ${values.angle_deg.toFixed(3)}°` : 'stopped';
    l2.textContent = an2 ? `α ${Number(values.compare)}°` : '';
    drawAll();
  }

  // ---- input ----
  c1.addEventListener('pointerdown', (e) => {
    if (!an || !geo[0]) return;
    const r = c1.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * c1.width, y = ((e.clientY - r.top) / r.height) * c1.height;
    const { cx, cy, k, dpr } = geo[0];
    let best = -1, bd = (28 * dpr) ** 2;
    const n = Math.min(shown, an.N);
    for (let i = 0; i < n; i++) {
      const d = (cx + an.x[i] * k - x) ** 2 + (cy - an.y[i] * k - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) select(best);
    c1.focus({ preventScroll: true });
  });
  c1.addEventListener('keydown', (e) => {
    if (!an) return;
    const off = an.spirals.length ? an.spirals[0].offset : 1;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: off, ArrowDown: -off }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    select(sel + step);
  });
  const stops = [ui.fitCanvas(c1, drawAll), ui.fitCanvas(c2, drawAll)];

  shown = values.N;
  recompute();
  if (!ctx.reducedMotion()) {
    shown = 1;
    loop.start();
    tp.setRunning(true);
  }

  return {
    getRecord() {
      const m = [];
      if (an) {
        m.push({ name: 'Points', value: an.N, unit: '' });
        m.push({ name: 'Mean nearest-neighbour distance', value: an.meanNN, unit: 'mm' });
        m.push({ name: 'Spread of spacing (sd / mean)', value: an.cvNN, unit: '' });
        m.push({ name: 'Closest pair', value: an.minNN, unit: 'mm' });
        m.push({ name: 'Largest empty disc', value: an.gapRatio, unit: 'x mean spacing' });
        m.push({ name: 'Rays (rational angle only)', value: an.rays, unit: 'rays', note: an.rays ? 'angle is a fraction of a turn' : 'angle irrational to 1e-9' });
        if (an2) {
          m.push({ name: 'Comparison mean spacing', value: an2.meanNN, unit: 'mm', note: `angle ${values.compare} deg` });
          m.push({ name: 'Comparison largest empty disc', value: an2.gapRatio, unit: 'x mean spacing' });
        }
      }
      return { inputs: { ...values }, seed, metrics: m, diagnostics: { fps: Math.round(loop.fps * 10) / 10, analyzeMs: Math.round(lastAnalyzeMs * 10) / 10, drawMs: Math.round(lastDrawMs * 10) / 10, frames: drawn, shown }, elapsedMs: lastAnalyzeMs };
    },
    getTable() {
      if (!an) return { columns: ['n'], rows: [] };
      const rows = [];
      for (let i = 0; i < an.N; i++) rows.push([i, an.x[i], an.y[i], an.r[i], an.thetaDeg[i], Number.isFinite(an.nn[i]) ? an.nn[i] : '', an.idx[i]]);
      return { columns: ['n', 'x_mm', 'y_mm', 'r_mm', 'theta_deg', 'nearest_neighbour_mm', 'nearest_neighbour_n'], rows };
    },
    destroy() {
      loop.stop();
      stops.forEach((s) => s());
      cRad.destroy();
      cNN.destroy();
    },
  };
}
