// E20 The Pareto Parliament: a fictional allocation of water, power, soil and investment.
import { DEFAULT_PROBLEM, cloneProblem, feasibleVertices, solve, frontier, sampleFeasible, hull2D, outcomes } from '../kernels/e20.js';

const R = (name, label, min, max, step, def, unit, help) => ({ name, label, type: 'range', min, max, step, default: def, unit, help });
const GROUPS = [
  {
    id: 'caps', title: 'Resource caps',
    defs: [
      R('cap_water', 'Water available', 0, 600, 5, 260, 'ML'),
      R('cap_power', 'Power available', 0, 150, 1, 60, 'MWh'),
      R('cap_soil', 'Soil available', 0, 120, 1, 50, 'ha'),
      R('cap_invest', 'Investment available', 0, 1200, 10, 520, 'US$k'),
    ],
  },
  {
    id: 'rules', title: 'Rules and prices',
    defs: [
      R('price', 'Price index on revenue', 0.5, 2, 0.05, 1, '×', '1 is the starting price. Costs stay fixed.'),
      R('accessFloor', 'Minimum aggregate access', 0, 600, 5, 100, 'units', 'A service floor. The allocation must reach it.'),
      { name: 'useBurdenCap', label: 'Apply a burden threshold', type: 'toggle', default: true },
      R('burdenCap', 'Ecological burden threshold', -300, 400, 5, 120, 'index', 'Net burden may not exceed this. Wetland lowers it.'),
    ],
  },
  {
    id: 'weights', title: 'Weights (human choices)',
    defs: [
      R('w_profit', 'Weight on profit', 0, 1, 0.05, 0.34, '', 'Weights pick among feasible allocations. They never change which are feasible.'),
      R('w_burden', 'Weight on lower ecological burden', 0, 1, 0.05, 0.33, ''),
      R('w_access', 'Weight on aggregate access', 0, 1, 0.05, 0.33, ''),
    ],
  },
];
const ALL_DEFS = GROUPS.flatMap((g) => g.defs);
const COMPACT = new Set(['cap_water', 'w_profit', 'w_burden', 'w_access']);

const PRESETS = {
  balanced: { label: 'Balanced', v: {} },
  profit: { label: 'Profit first', v: { w_profit: 1, w_burden: 0, w_access: 0 } },
  nature: { label: 'Nature first', v: { w_profit: 0, w_burden: 1, w_access: 0 } },
  access: { label: 'Access first', v: { w_profit: 0, w_burden: 0, w_access: 1 } },
  fails: { label: 'Floor too high (fails)', v: { accessFloor: 600 } },
};

export const meta = {
  id: 'E20',
  title: 'The Pareto Parliament',
  subtitle: 'tradeoff explorer',
  priority: 'P1',
  kind: 'decision',
  dataStatus: 'SYNTHETIC',
  methodVersion: 'e20-lp-vertex-1.0.0',
  blurb: 'Share fictional water, power, soil and money. Drag across the tradeoff between profit and nature.',
  inputs: ALL_DEFS.map(({ name, label, type, min, max, step, default: d, unit }) => ({ name, label, type, min, max, step, default: d, unit })),
  outputs: [
    { name: 'profit', label: 'Profit', unit: 'US$k' },
    { name: 'burden', label: 'Ecological burden', unit: 'index' },
    { name: 'access', label: 'Aggregate access', unit: 'units' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'The solver has no randomness. The seed draws the grey sample of feasible allocations on the chart (convex mixes of feasible corners).',
  method: `<p>Four fictional activities share four resources. The decision is how much of each activity to run, x ≥ 0. Each activity uses some of each resource and adds to profit, ecological burden and aggregate access.</p>
<p class="eq">resource i:  Σ use[i][j] · x[j] ≤ cap[i]
burden:      Σ burden[j] · x[j] ≤ threshold
access:      Σ access[j] · x[j] ≥ floor
profit:      Σ (price · revenue[j] − cost[j]) · x[j]</p>
<p>These constraints define a convex region. The solver lists every corner of it (every choice of as many binding constraints as there are activities, solved exactly, kept if feasible). A linear objective is best at a corner, so the best allocation for any weights is the best corner.</p>
<p class="eq">score = w_profit · profit* + w_burden · (burden range − burden)* + w_access · access*     (each * scaled 0 to 1 over the feasible corners)</p>
<p>The weights are normalised to sum to 1. They choose among feasible allocations. They do not change which allocations are feasible, so moving them moves the marker and leaves the grey region where it is.</p>
<p>The frontier is a grid of weights in steps of 1/12 over the three weights. Each is solved, duplicates are dropped, and any point beaten on all three outcomes by another is removed. It lists corners that some weights prefer. Allocations between them are mixes of corners.</p>
<p>Shadow prices come from the binding constraints at the chosen corner: they solve c = Σ y·g over the binding rows. They are shown only when exactly as many constraints bind as there are activities, the system solves, and every price is at least 0. Otherwise the table says why it is withheld. Prices are in score points per unit of the cap, and as a profit equivalent when the profit weight is above 0.</p>
<p>No infeasible case is repaired. If no allocation meets every constraint, the exhibit stops, says so, and lists which single constraint, if relaxed, would restore feasibility.</p>`,
  limitations: [
    'Four invented activities with invented numbers. It models no real farm, firm, place or group of people.',
    'Linear relationships only. Real allocations have diminishing returns, timing and uncertainty.',
    'Ecological burden and access are index numbers someone chose. Weights are human choices about what matters, not moral truth.',
    'The frontier lists corner solutions found by a weight grid. Mixes between corners are feasible but are not listed.',
  ],
  provenance: [],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E20"] .stage-wrap { position: relative; flex: 1; min-height: 0; }
[data-ex="E20"] .stage-wrap .stage-canvas { position: absolute; inset: 0; cursor: crosshair; }
[data-ex="E20"] .stage-wrap .stage-canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
[data-ex="E20"] .hint { padding: 6px 12px 8px; font-size: 0.85rem; color: var(--muted); border-top: 1px solid var(--line); }
[data-ex="E20"] .fail-banner { position: absolute; inset: auto 12px 12px 12px; padding: 12px 14px; border: 1px solid var(--danger); border-radius: var(--r-m); background: color-mix(in srgb, var(--bg) 88%, var(--danger)); font-weight: 700; }
[data-ex="E20"] .grp { border: 1px solid var(--line); border-radius: var(--r-m); margin: 8px 0; padding: 0 10px; }
[data-ex="E20"] .grp > summary { cursor: pointer; font-weight: 700; padding: 9px 0; }
[data-ex="E20"] .bar { display: block; height: 8px; border-radius: 4px; background: var(--line); position: relative; min-width: 60px; }
[data-ex="E20"] .bar > i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--water); }
[data-ex="E20"] .bar.full > i { background: var(--dawn); }
[data-ex="E20"] .chip { display: inline-block; padding: 2px 9px; margin: 2px 4px 2px 0; border: 1px solid var(--dawn); border-radius: 999px; font-size: 0.82rem; font-weight: 700; }
`;

function hexToRgb(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(a, b, f) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return f > 0.5 ? b : a;
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(',')})`;
}

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const values = {};
  for (const d of ALL_DEFS) values[d.name] = d.default;
  let seed = 20;
  if (ctx.initial) {
    if (Number.isInteger(ctx.initial.seed)) seed = ctx.initial.seed;
    for (const [k, v] of Object.entries(ctx.initial.inputs || {})) if (k in values && typeof v === typeof values[k]) values[k] = v;
  }
  let prob = null;
  let vctx = null;
  let front = null;
  let cloud = [];
  let hull = [];
  let sol = null;
  let sweep = [];
  let tour = -1;
  let tourClock = 0;
  const t0 = performance.now();

  /* ----------------------------------------------------------------- stage */
  const canvas = h('canvas', { class: 'stage-canvas', tabindex: 0, role: 'img', 'aria-label': 'Tradeoff chart of profit against ecological burden' });
  const label = h('div', { class: 'stage-label' }, '');
  const banner = h('div', { class: 'fail-banner', role: 'alert', hidden: true });
  slots.stage.append(
    h('div', { class: 'stage-wrap' }, canvas, label, banner),
    h('div', { class: 'hint' }, 'Drag across the chart, or press the left and right arrow keys on it, to move along the frontier. The grey region is every feasible outcome. Dots are frontier points, coloured by access.'));
  const tk = (n) => ui.token(n);
  let geo = null;

  function problemFromValues() {
    const p = cloneProblem(DEFAULT_PROBLEM);
    p.resources[0].cap = values.cap_water;
    p.resources[1].cap = values.cap_power;
    p.resources[2].cap = values.cap_soil;
    p.resources[3].cap = values.cap_invest;
    p.price = values.price;
    p.accessFloor = values.accessFloor;
    p.burdenCap = values.useBurdenCap ? values.burdenCap : null;
    return p;
  }
  const weightsNow = () => ({ profit: values.w_profit, burden: values.w_burden, access: values.w_access });

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    if (!W || !H) return;
    const g = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.clearRect(0, 0, W, H);
    const muted = tk('--muted');
    const grid = tk('--grid');
    g.font = `${11 * dpr}px ${tk('--font-data') || 'monospace'}`;
    if (!front || front.status !== 'ok' || !sol || sol.status !== 'optimal') {
      g.fillStyle = muted;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('No feasible region to draw.', W / 2, H / 2);
      geo = null;
      return;
    }
    const pts = hull.concat(cloud.map((c) => [c.outcomes.profit_usd_k, c.outcomes.burden]));
    let x0 = Math.min(...pts.map((p) => p[0]));
    let x1 = Math.max(...pts.map((p) => p[0]));
    let y0 = Math.min(...pts.map((p) => p[1]));
    let y1 = Math.max(...pts.map((p) => p[1]));
    const px = (x1 - x0 || 1) * 0.06;
    const py = (y1 - y0 || 1) * 0.08;
    x0 -= px; x1 += px; y0 -= py; y1 += py;
    const L = 58 * dpr, Rr = 14 * dpr, T = 64 * dpr, B = 38 * dpr;
    const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - Rr);
    const Y = (v) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);
    geo = { X, Y, W, H, dpr };
    const ticks = (lo, hi, n) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
    g.strokeStyle = grid;
    g.fillStyle = muted;
    g.lineWidth = dpr;
    for (const v of ticks(x0, x1, 5)) {
      g.beginPath(); g.moveTo(X(v), T); g.lineTo(X(v), H - B); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(ui.fmt(v, 0), X(v), H - B + 5 * dpr);
    }
    for (const v of ticks(y0, y1, 5)) {
      g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - Rr, Y(v)); g.stroke();
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(ui.fmt(v, 0), L - 6 * dpr, Y(v));
    }
    g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillText('profit, US$k (hypothetical) →', W - Rr, H - 2 * dpr);
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('net ecological burden index (lower is better)', L + 4 * dpr, T - 20 * dpr);
    // feasible region
    g.beginPath();
    hull.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
    g.closePath();
    g.fillStyle = tk('--violet');
    g.globalAlpha = 0.16;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = tk('--violet');
    g.lineWidth = 1.5 * dpr;
    g.stroke();
    // sample cloud
    g.fillStyle = muted;
    g.globalAlpha = 0.35;
    for (const c of cloud) {
      g.beginPath();
      g.arc(X(c.outcomes.profit_usd_k), Y(c.outcomes.burden), 1.6 * dpr, 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;
    // frontier points coloured by access
    const aLo = sol.ranges.access.lo;
    const aSpan = sol.ranges.access.span || 1;
    const lo = tk('--rose');
    const hi = tk('--jade');
    for (const p of front.points) {
      const f = (p.outcomes.access - aLo) / aSpan;
      g.fillStyle = lerpColor(lo, hi, Math.max(0, Math.min(1, f)));
      g.beginPath();
      g.arc(X(p.outcomes.profit_usd_k), Y(p.outcomes.burden), 5 * dpr, 0, 6.283);
      g.fill();
      g.strokeStyle = tk('--bg');
      g.lineWidth = dpr;
      g.stroke();
    }
    // chosen allocation
    const s = sol.outcomes;
    g.strokeStyle = tk('--dawn');
    g.lineWidth = 3 * dpr;
    g.beginPath();
    g.arc(X(s.profit_usd_k), Y(s.burden), 10 * dpr, 0, 6.283);
    g.stroke();
    label.textContent = `Chosen: profit US$${ui.fmt(s.profit_usd_k, 0)}k · burden ${ui.fmt(s.burden, 0)} · access ${ui.fmt(s.access, 0)}`;
    canvas.setAttribute('aria-label', `Tradeoff chart. ${front.points.length} frontier points. Chosen allocation: profit ${ui.fmt(s.profit_usd_k, 0)} thousand dollars, burden ${ui.fmt(s.burden, 0)}, access ${ui.fmt(s.access, 0)}. Left and right arrows move along the frontier.`);
  }
  const stopFit = ui.fitCanvas(canvas, draw);

  /* -------------------------------------------------------------- controls */
  const transport = ui.transport({
    seed, running: false, stepLabel: 'Next point', runLabel: 'Walk frontier',
    onToggle() { if (loop.running) pause(); else walk(); },
    onStep() { pause(); stepFrontier(1); },
    onReset() { pause(); applyPreset('balanced'); },
    onReplay() { pause(); tour = -1; walk(); },
    onSeed(v) { seed = v; recompute(false); },
  });
  slots.controls.append(transport.el);
  const presetSeg = ui.segmented({ name: 'preset', label: 'Preset', options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })) }, 'balanced', (k) => applyPreset(k));
  slots.controls.append(presetSeg.el);
  const panels = [];
  for (const grp of GROUPS) {
    const defs = ctx.compact ? grp.defs.filter((d) => COMPACT.has(d.name)) : grp.defs;
    if (!defs.length) continue;
    const body = h('div', {});
    slots.controls.append(h('details', { class: 'grp', open: ctx.compact || grp.id !== 'rules' }, h('summary', {}, grp.title), body));
    panels.push(ui.controlPanel(body, defs, values, (name) => onInput(name)));
  }
  slots.controls.append(ui.note('Weights say what the person choosing cares about. They are human choices, not moral truth.'));

  const metrics = ui.metricGrid(slots.metrics, [
    { name: 'profit', label: 'Profit (hypothetical)', unit: 'US$k', digits: 1 },
    { name: 'burden', label: 'Net ecological burden', unit: 'index', digits: 1 },
    { name: 'access', label: 'Aggregate access', unit: 'units', digits: 1 },
    { name: 'score', label: 'Weighted score', unit: '0 to 1', digits: 3 },
    { name: 'binding', label: 'Binding constraints', unit: '', digits: 0 },
    { name: 'corners', label: 'Feasible corners', unit: '', digits: 0 },
    { name: 'frontier', label: 'Frontier points', unit: '', digits: 0 },
  ]);
  const detail = h('div', {});
  slots.metrics.append(detail);
  const c1 = chart.chartBox(slots.metrics, { title: 'Outcomes as the profit weight rises (the rest shared equally)', height: 170 });

  /* ------------------------------------------------------------ computation */
  function recompute(resample = true) {
    try {
      prob = problemFromValues();
      front = frontier(prob, 12);
      vctx = front.ctx;
    } catch (e) {
      front = null;
      sol = null;
      banner.textContent = 'Not run: ' + e.message + '.';
      banner.hidden = false;
      ctx.announce(banner.textContent, 'error');
      draw();
      return;
    }
    if (front.status !== 'ok') {
      sol = solve(prob, weightsNow(), vctx);
      banner.textContent = 'No allocation meets every constraint. ' + (sol.diagnosis.relaxingAnyOneOf.length ? `Relaxing any one of these restores feasibility: ${sol.diagnosis.relaxingAnyOneOf.join(', ')}.` : 'Relaxing a single constraint is not enough.') + (sol.diagnosis.maxAccessWithoutFloor !== null ? ` Without the floor, the most access reachable is ${ui.fmt(sol.diagnosis.maxAccessWithoutFloor, 0)}.` : '');
      banner.hidden = false;
      for (const n of ['profit', 'burden', 'access', 'score', 'binding', 'corners', 'frontier']) metrics.set(n, NaN, { text: '—', tone: '' });
      detail.replaceChildren();
      c1.draw(() => chart.drawLines(c1.canvas, { series: [] }));
      ctx.announce(banner.textContent, 'error');
      draw();
      return;
    }
    banner.hidden = true;
    if (resample) cloud = sampleFeasible(prob, vctx, 700, seed);
    hull = hull2D(vctx.vertices.map((x) => { const o = outcomes(prob, x); return [o.profit_usd_k, o.burden]; }));
    sweep = [];
    for (let i = 0; i <= 20; i++) {
      const wp = i / 20;
      const s = solve(prob, { profit: wp, burden: (1 - wp) / 2, access: (1 - wp) / 2 }, vctx);
      const rg = s.ranges;
      sweep.push([wp, (s.outcomes.profit_usd_k - rg.profit.lo) / (rg.profit.span || 1), (rg.burden.hi - s.outcomes.burden) / (rg.burden.span || 1), (s.outcomes.access - rg.access.lo) / (rg.access.span || 1)]);
    }
    refreshSolution();
    c1.draw(() => chart.drawLines(c1.canvas, {
      series: [
        { name: 'profit', points: sweep.map((r) => [r[0], r[1]]), color: tk('--dawn') },
        { name: 'lower burden', points: sweep.map((r) => [r[0], r[2]]), color: tk('--jade') },
        { name: 'access', points: sweep.map((r) => [r[0], r[3]]), color: tk('--water') },
      ],
      xRange: [0, 1], yRange: [0, 1.05], xLabel: 'weight on profit', yLabel: 'scaled outcome (1 is best feasible)',
      marks: [{ x: sol.weights.profit, color: tk('--rose') }],
    }));
    chart.dataTable(c1.text, ['profit weight', 'profit (0–1)', 'lower burden (0–1)', 'access (0–1)'], sweep);
    draw();
  }

  function refreshSolution() {
    sol = solve(prob, weightsNow(), vctx);
    const o = sol.outcomes;
    metrics.set('profit', o.profit_usd_k);
    metrics.set('burden', o.burden);
    metrics.set('access', o.access);
    metrics.set('score', sol.score);
    metrics.set('binding', sol.binding.length, { digits: 0 });
    metrics.set('corners', vctx.vertices.length, { digits: 0 });
    metrics.set('frontier', front.points.length, { digits: 0 });
    renderDetail();
  }

  function renderDetail() {
    const rowsAlloc = prob.activities.map((a, j) => h('tr', {}, h('td', {}, a.name), h('td', {}, ui.fmt(sol.x[j], 2))));
    const rowsUse = sol.use.map((u) => {
      const f = u.cap > 0 ? Math.min(1, u.used / u.cap) : 0;
      return h('tr', {}, h('td', {}, u.name), h('td', {}, `${ui.fmt(u.used, 1)} of ${ui.fmt(u.cap, 1)} ${u.unit}`),
        h('td', {}, h('span', { class: 'bar' + (u.unused < 1e-6 ? ' full' : '') }, h('i', { style: { width: f * 100 + '%' } }))), h('td', {}, ui.fmt(u.unused, 1)));
    });
    const bind = sol.binding.length ? sol.binding.map((n) => h('span', { class: 'chip' }, n)) : h('span', { class: 'muted' }, 'None: no constraint limits this allocation.');
    const shadowRows = sol.shadow.filter((s) => s.price_score_per_unit !== null && s.price_score_per_unit > 1e-9);
    detail.replaceChildren(
      ui.sectionTitle('What this allocation runs'),
      h('div', { class: 'scrollx' }, h('table', { class: 'dtable' }, h('thead', {}, h('tr', {}, ['Activity', 'Level (units)'].map((c) => h('th', { scope: 'col' }, c)))), h('tbody', {}, rowsAlloc))),
      ui.sectionTitle('Resources: used, cap, unused'),
      h('div', { class: 'scrollx' }, h('table', { class: 'dtable' }, h('thead', {}, h('tr', {}, ['Resource', 'Used', '', 'Unused'].map((c) => h('th', { scope: 'col' }, c)))), h('tbody', {}, rowsUse))),
      ui.sectionTitle('Constraints that bind'),
      h('div', {}, bind),
      ui.sectionTitle('Shadow prices'),
      sol.shadowValid
        ? (shadowRows.length
            ? h('div', { class: 'scrollx' }, h('table', { class: 'dtable' }, h('thead', {}, h('tr', {}, ['Constraint', 'Score per unit', 'Profit-equivalent US$k per unit'].map((c) => h('th', { scope: 'col' }, c)))),
                h('tbody', {}, shadowRows.map((s) => h('tr', {}, h('td', {}, s.name), h('td', {}, ui.fmt(s.price_score_per_unit, 4)), h('td', {}, s.profit_equivalent_usd_k_per_unit === null ? 'needs a profit weight above 0' : ui.fmt(s.profit_equivalent_usd_k_per_unit, 3)))))))
            : h('p', { class: 'small muted' }, 'No constraint has a positive price here.'))
        : ui.note('Shadow prices withheld. ' + sol.shadowReason, 'info'));
  }

  /* ------------------------------------------------------- direct handling */
  function selectPoint(i) {
    const p = front.points[i];
    if (!p) return;
    tour = i;
    for (const [k, v] of [['w_profit', p.weights.profit], ['w_burden', p.weights.burden], ['w_access', p.weights.access]]) {
      values[k] = v;
    }
    for (const pn of panels) pn.setAll({ w_profit: values.w_profit, w_burden: values.w_burden, w_access: values.w_access });
    refreshSolution();
    draw();
  }
  function nearest(ev) {
    if (!geo || !front || front.status !== 'ok') return -1;
    const r = canvas.getBoundingClientRect();
    const mx = ((ev.clientX - r.left) * canvas.width) / r.width;
    const my = ((ev.clientY - r.top) * canvas.height) / r.height;
    let best = -1;
    let bd = Infinity;
    front.points.forEach((p, i) => {
      const d = (geo.X(p.outcomes.profit_usd_k) - mx) ** 2 + (geo.Y(p.outcomes.burden) - my) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    pause();
    const i = nearest(e);
    if (i >= 0) selectPoint(i);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const i = nearest(e);
    if (i >= 0 && i !== tour) selectPoint(i);
  });
  const endDrag = () => (dragging = false);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); stepFrontier(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); stepFrontier(-1); }
  });
  function stepFrontier(d) {
    if (!front || front.status !== 'ok') return ctx.announce('No frontier to move along: the constraints cannot all be met.', 'error');
    let i = tour;
    if (i < 0) {
      // start from the point nearest the current weights' outcome
      i = front.points.findIndex((p) => Math.abs(p.outcomes.profit_usd_k - sol.outcomes.profit_usd_k) < 1e-6 && Math.abs(p.outcomes.burden - sol.outcomes.burden) < 1e-6);
      if (i < 0) i = 0;
      else i = Math.max(0, Math.min(front.points.length - 1, i + d));
    } else i = (i + d + front.points.length) % front.points.length;
    selectPoint(i);
    ctx.announce(`Frontier point ${i + 1} of ${front.points.length}: profit ${ui.fmt(sol.outcomes.profit_usd_k, 0)}, burden ${ui.fmt(sol.outcomes.burden, 0)}, access ${ui.fmt(sol.outcomes.access, 0)}.`, 'quiet');
  }

  const loop = ctx.loop((dt) => {
    tourClock += dt;
    if (tourClock < 0.7) return;
    tourClock = 0;
    if (!front || front.status !== 'ok' || tour >= front.points.length - 1) return pause();
    selectPoint(tour + 1);
  });
  function walk() {
    if (!front || front.status !== 'ok') return ctx.announce('Nothing to walk: no feasible allocation exists.', 'error');
    if (tour >= front.points.length - 1) tour = -1;
    tourClock = 1;
    loop.start();
    transport.setRunning(true);
  }
  function pause() {
    loop.stop();
    transport.setRunning(false);
  }

  function applyPreset(k) {
    const next = {};
    for (const d of ALL_DEFS) next[d.name] = d.default;
    Object.assign(next, PRESETS[k].v);
    Object.assign(values, next);
    for (const pn of panels) pn.setAll(next);
    presetSeg.set(k);
    tour = -1;
    recompute();
  }

  let pending = 0;
  function onInput(name) {
    if (!String(name).startsWith('w_')) tour = -1;
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (String(name).startsWith('w_') && front && front.status === 'ok') {
        if (!(values.w_profit + values.w_burden + values.w_access > 0)) {
          ctx.announce('At least one weight must be above 0.', 'error');
          return;
        }
        tour = -1;
        refreshSolution();
        draw();
      } else recompute();
    }, 60);
  }

  recompute();

  return {
    getRecord() {
      const ok = sol && sol.status === 'optimal';
      const num = (label, v, unit, note) => ({ name: label, value: Number.isFinite(v) ? v : null, unit, note });
      const m = ok
        ? [
            num('Profit', sol.outcomes.profit_usd_k, 'US$k', 'hypothetical'),
            num('Net ecological burden', sol.outcomes.burden, 'index'),
            num('Aggregate access', sol.outcomes.access, 'units'),
            num('Weighted score', sol.score, ''),
            num('Binding constraints', sol.binding.length, ''),
            num('Feasible corners', vctx.vertices.length, ''),
            num('Frontier points', front.points.length, ''),
            ...sol.use.map((u) => num(`${u.name} used`, u.used, u.unit)),
            ...sol.x.map((v, j) => num(`${prob.activities[j].name} level`, v, 'units')),
          ]
        : [num('Feasible', 0, '', sol && sol.reason ? sol.reason : 'no feasible allocation')];
      return { inputs: { ...values }, seed, metrics: m, diagnostics: { shadow_prices_valid: ok ? String(sol.shadowValid) : 'false' }, elapsedMs: performance.now() - t0 };
    },
    getTable() {
      const pts = front && front.status === 'ok' ? front.points : [];
      return {
        columns: ['w_profit', 'w_burden', 'w_access', 'profit_usd_k', 'burden_index', 'access_units', ...(prob ? prob.activities.map((a) => a.name.replace(/\s+/g, '_').toLowerCase()) : [])],
        rows: pts.map((p) => [p.weights.profit, p.weights.burden, p.weights.access, p.outcomes.profit_usd_k, p.outcomes.burden, p.outcomes.access, ...p.x]),
      };
    },
    destroy() {
      clearTimeout(pending);
      loop.dispose();
      stopFit();
      c1.destroy();
    },
  };
}
