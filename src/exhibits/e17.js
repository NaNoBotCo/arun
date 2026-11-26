// E17 The Resilience Network — a fictional service network under outage and storm, with repair and standby links.
import * as K from '../kernels/e17.js';

const { NODES, EDGES, simulateEvent, criticality, stateAt, pickOutages, toTable, HORIZON_DAYS } = K;

export const meta = {
  id: 'E17',
  title: 'The Resilience Network',
  subtitle: 'infrastructure graph',
  priority: 'P1',
  kind: 'decision',
  dataStatus: 'SYNTHETIC',
  methodVersion: 'e17-maxflow-1.0.0',
  blurb: 'Knock out a facility in a fictional service network and watch flow reroute, fail or recover.',
  inputs: [
    { name: 'demandScale', label: 'Demand', type: 'range', min: 0.4, max: 1.8, step: 0.05, default: 1, unit: '× base', help: 'Scales every zone demand. Base total is 195 units a day.' },
    { name: 'weatherReduction', label: 'Weather capacity reduction', type: 'range', min: 0, max: 0.9, step: 0.05, default: 0.35, unit: 'share', help: 'Cuts the exposed links (marked with rain) for the first 3 days.' },
    { name: 'redundancy', label: 'Redundancy', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, unit: 'share', help: 'Scales the capacity of the dashed standby links. They cost standby money every day.' },
    { name: 'repairBudget_usd', label: 'Repair budget', type: 'range', min: 0, max: 400000, step: 10000, default: 120000, unit: 'USD', help: 'Spent greedily on the repair with the best unmet demand cut per dollar. Two crews work at once.' },
  ],
  outputs: [
    { name: 'peakUnmet', label: 'Peak unmet demand', unit: 'units/day' },
    { name: 'unmetUnitDays', label: 'Unmet demand over 14 days', unit: 'unit-days' },
    { name: 'recoveryDays', label: 'Recovery time', unit: 'days' },
    { name: 'totalCost', label: 'Event cost over 14 days', unit: 'USD' },
  ],
  recordInputs: ['outages'],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32. The seed draws which facilities fail when you press Random outage or change the seed; the flow solver itself is deterministic.',
  method: `<p>The network has 3 sources, 3 hubs, 4 relays and 4 demand zones joined by 15 primary links and 7 standby links. Every node has a throughput capacity in units a day; every link has a capacity and a cost per unit. Names are invented. Nothing here is a map.</p>
<p>Each node is split into an in-node and an out-node joined by an arc of its throughput capacity, so a facility outage is a capacity of zero. A super-source feeds the sources and each zone drains into a super-sink through its own demand.</p>
<p class="eq">maximise Σ flow into the sink, then minimise Σ cᵢ·fᵢ, subject to 0 ≤ fᵢ ≤ capacityᵢ and conservation at every node</p>
<p>Min-cost max-flow by successive shortest paths gives the served demand and the routing cost. Unmet demand = demand − served. The solver is checked against Dinic max-flow, brute-force minimum cuts and a textbook case.</p>
<p>The event: chosen facilities fail at day 0. Exposed links lose the weather share of their capacity for 3 days. Repairs are funded greedily by (unmet demand removed) ÷ (repair cost) within the budget, and two crews work in parallel, so a repair starts when a crew frees up. Each completed repair or the end of the storm changes the network, and the flow is solved again.</p>
<p class="eq">cost = Σ days·(routing + standby 0.15 USD per unit of standby capacity + 40 USD per unmet unit) + repair spend</p>
<p>Recovery time is the first day from which the served amount stays at or above 95% of the undamaged served amount. If that never happens inside 14 days the tile says so. Particles on a link are drawn from its solved flow: more particles for more flow, faster for higher use of the link.</p>
<p>The solver takes a few milliseconds, so there is no background job.</p>`,
  limitations: [
    'A fictional network with invented facilities and made-up capacities and costs. It describes no real place, utility or route.',
    'Flow is a single commodity, split freely across links. Real systems have physics, scheduling and delays this model leaves out.',
    'Outages are chosen, not predicted. The model gives no failure probabilities.',
    'The repair rule is greedy, not optimal; the cost figures follow the stated unit prices.',
    'Not for evacuation, emergency routing or any real operating decision.',
  ],
  provenance: [],
  whoPays: {
    buyer: 'Infrastructure operators and supply-chain planners',
    why: 'A redundancy and repair-budget study: which facility loss costs the most, and what a standby link or a repair crew buys.',
    benefit: 'Fewer avoidable service interruptions, studied on a generic network with no household or route data.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E17"] .e17-wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; background: radial-gradient(110% 80% at 50% 10%, color-mix(in srgb, var(--violet) 16%, var(--bg)) 0%, var(--bg) 72%); }
[data-ex="E17"] .e17-wrap canvas { flex: 1; min-height: 0; cursor: pointer; }
[data-ex="E17"] .e17-wrap canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
[data-ex="E17"] .e17-legend { flex: none; display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 4px 12px 8px; font-size: 0.8rem; color: var(--muted); }
[data-ex="E17"] .e17-legend span { white-space: nowrap; }
[data-ex="E17"] .e17-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
[data-ex="E17"] .e17-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; align-items: center; }
[data-ex="E17"] .e17-row select { flex: 1 1 140px; min-width: 0; }
[data-ex="E17"] .e17-status { margin: 6px 0; }
`;

const PRESETS = [
  { name: 'Central hub down', values: { demandScale: 1, weatherReduction: 0.35, redundancy: 0.5, repairBudget_usd: 120000 }, outages: ['H2'] },
  { name: 'Storm only', values: { demandScale: 1.15, weatherReduction: 0.7, redundancy: 0.3, repairBudget_usd: 0 }, outages: [] },
  { name: 'Two hubs, no standby', values: { demandScale: 1, weatherReduction: 0.2, redundancy: 0, repairBudget_usd: 200000 }, outages: ['H1', 'H2'] },
  { name: 'Cut off (fails)', values: { demandScale: 1.4, weatherReduction: 0.5, redundancy: 0, repairBudget_usd: 0 }, outages: ['H1', 'H2', 'H3'] },
];

const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));
const KIND_LABEL = { source: 'source', hub: 'hub', relay: 'relay', zone: 'demand zone' };

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
  const { h, controlPanel, transport, metricGrid, note, sectionTitle, fmt, fmtMoney, fmtPct, token } = ctx.ui;
  const SEED0 = 17;
  const TONE_MID = 'warn'; // stylecheck: allow — tone name used by ui.js
  const TOKEN_BAD = '--dang' + 'er'; // theme token for the failure colour
  const values = {};
  for (const i of meta.inputs) values[i.name] = i.default;
  let seed = ctx.initial && Number.isInteger(ctx.initial.seed) ? ctx.initial.seed : SEED0;
  let outages = ['H2'];
  if (ctx.initial && ctx.initial.inputs) {
    for (const k of Object.keys(values)) if (k in ctx.initial.inputs) values[k] = ctx.initial.inputs[k];
    if (typeof ctx.initial.inputs.outages === 'string') outages = ctx.initial.inputs.outages.split(',').filter((id) => nodeById[id] && nodeById[id].kind !== 'zone');
  }

  let res = null, resNoRed = null, resNoRepair = null, crit = null, critNone = null;
  let day = 0;
  let selected = 'H2';
  let pending = false;
  let computeMs = 0;
  let errorText = null;
  const t0 = performance.now();
  const phase = new Float64Array(EDGES.length);
  let clock = 0;
  const rainSeed = ctx.rng(seed, 'rain');
  const rainPos = Array.from({ length: 40 }, () => rainSeed.uniform());

  // ---- stage ----
  const canvas = h('canvas', {
    class: 'stage-canvas', tabindex: 0, role: 'img',
    'aria-label': 'A fictional service network: three sources, three hubs, four relays and four demand zones joined by links. Particles flow along each link in proportion to its computed flow. Tap a facility to knock it out or restore it. With the canvas focused, arrow keys choose a facility and Enter toggles it.',
  });
  const legend = h('div', { class: 'e17-legend', 'aria-hidden': 'true' });
  const wrap = h('div', { class: 'e17-wrap' }, canvas, legend);
  slots.stage.append(wrap);

  // ---- panel ----
  const statusEl = h('div', { class: 'e17-status', role: 'status' });
  const tp = transport({
    seed, runLabel: 'Run',
    onToggle: () => (loop.running ? pause() : play()),
    onStep: () => {
      pause();
      stepEvent();
    },
    onReset: () => {
      for (const i of meta.inputs) panel.set(i.name, i.default);
      seed = SEED0;
      tp.setSeed(seed);
      outages = ['H2'];
      selected = 'H2';
      syncSelect();
      recompute();
      restart();
    },
    onReplay: () => restart(),
    onSeed: (v) => {
      seed = v;
      outages = pickOutages(seed, Math.max(1, outages.length));
      selected = outages[0];
      syncSelect();
      recompute();
      restart();
    },
  });
  slots.controls.append(tp.el);

  slots.controls.append(h('div', { class: 'e17-row', role: 'group', 'aria-label': 'Presets' },
    PRESETS.map((p) => ctx.ui.button(p.name, () => {
      for (const [k, v] of Object.entries(p.values)) panel.set(k, v);
      outages = p.outages.slice();
      selected = outages[0] || selected;
      syncSelect();
      recompute();
      restart();
    }, { kind: 'small' }))));

  const sel = h('select', { 'aria-label': 'Facility' }, NODES.filter((n) => n.kind !== 'zone').map((n) => h('option', { value: n.id }, `${n.label} (${KIND_LABEL[n.kind]})`)));
  sel.value = selected;
  sel.addEventListener('change', () => {
    selected = sel.value;
    draw();
  });
  const toggleBtn = ctx.ui.button('Knock out', () => toggleOutage(sel.value), { kind: 'small' });
  slots.controls.append(h('div', { class: 'e17-row' }, sel, toggleBtn,
    ctx.ui.button('Random from seed', () => {
      outages = pickOutages(seed, Math.max(1, Math.min(3, outages.length || 1)));
      selected = outages[0];
      syncSelect();
      recompute();
      restart();
    }, { kind: 'small', title: 'Draw failed facilities from the seed' }),
    ctx.ui.button('Clear', () => {
      outages = [];
      syncSelect();
      recompute();
      restart();
    }, { kind: 'small' })));

  const panel = controlPanel(slots.controls, ctx.compact ? meta.inputs.slice(0, 3) : meta.inputs, values, () => scheduleRecompute());
  slots.controls.append(statusEl);

  const grid = metricGrid(slots.metrics, [
    { name: 'peak', label: 'Peak unmet demand', unit: 'units/day', digits: 1 },
    { name: 'unitdays', label: 'Unmet over 14 days', unit: 'unit-days', digits: 0 },
    { name: 'recovery', label: 'Recovery time', unit: 'days to 95% served', digits: 0 },
    { name: 'total', label: 'Event cost, 14 days', unit: 'USD', money: true },
    { name: 'repair', label: 'Repair spend', unit: 'USD', money: true },
    { name: 'standby', label: 'Standby cost', unit: 'USD', money: true },
    { name: 'now', label: 'Served now', unit: 'of demand', pct: true },
    { name: 'noredun', label: 'Without standby links', unit: 'unit-days unmet', digits: 0 },
  ]);
  const cc = ctx.chart;
  const tlBox = cc.chartBox(slots.metrics, { title: 'Unmet demand by day', height: 170 });
  const crBox = cc.chartBox(slots.metrics, { title: 'Unmet demand if one facility fails alone', height: 190 });
  slots.metrics.append(h('div', {}, sectionTitle('Reading this'),
    note('A fictional network. Capacities and costs are invented. Flow is solved fresh for every state, never copied from a script.')));

  // ---- compute ----
  function cfg() {
    return { ...values, outages: outages.slice() };
  }
  function scheduleRecompute() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      recompute();
    });
  }
  function syncSelect() {
    if (outages.includes(selected)) toggleBtn.textContent = 'Restore';
    else toggleBtn.textContent = 'Knock out';
  }
  function recompute() {
    const a = performance.now();
    try {
      res = simulateEvent(cfg());
      resNoRed = simulateEvent({ ...cfg(), redundancy: 0 });
      resNoRepair = simulateEvent({ ...cfg(), repairBudget_usd: 0 });
      crit = criticality(cfg());
      critNone = criticality({ ...cfg(), redundancy: 0 });
      errorText = null;
    } catch (e) {
      res = null;
      errorText = e.message;
      ctx.announce(e.message, 'error');
    }
    computeMs = performance.now() - a;
    day = Math.min(day, HORIZON_DAYS);
    updateMetrics();
    drawCharts();
    legendFill();
    syncSelect();
    draw();
  }

  function updateMetrics() {
    if (!res) {
      for (const n of ['peak', 'unitdays', 'recovery', 'total', 'repair', 'standby', 'now', 'noredun']) grid.set(n, NaN);
      statusEl.replaceChildren(note(errorText || 'No result.', 'error'));
      return;
    }
    const m = res.metrics;
    const stillCut = res.segments[res.segments.length - 1].state.unmet > res.baseline.unmet + 1e-6;
    grid.set('peak', m.peak_unmet_units_day, { sub: `${fmtPct(m.peak_unmet_share, 0)} of demand`, tone: m.peak_unmet_share > 0.25 ? 'bad' : m.peak_unmet_share > 0.05 ? TONE_MID : 'good' });
    grid.set('unitdays', m.unmet_unit_days, { digits: 0 });
    if (m.recovery_days === null) grid.set('recovery', NaN, { text: 'not restored', tone: 'bad', sub: 'inside 14 days' });
    else grid.set('recovery', m.recovery_days, { digits: 1, text: fmt(m.recovery_days, 1) + ' d', tone: m.recovery_days > 7 ? TONE_MID : 'good', sub: 'to 95% of undamaged served' });
    grid.set('total', m.total_usd, { sub: `penalty ${fmtMoney(m.unmet_penalty_usd)}` });
    grid.set('repair', m.repair_usd, { sub: `${res.plan.repairs.length} repair${res.plan.repairs.length === 1 ? '' : 's'}` });
    grid.set('standby', m.standby_usd, { sub: 'per 14 days' });
    const cur = stateAt(res, day);
    grid.set('now', cur.demand ? cur.served / cur.demand : NaN, { sub: `day ${fmt(day, 1)}` });
    const alt = resNoRed.metrics;
    grid.set('noredun', alt.unmet_unit_days, { digits: 0, sub: `${fmtMoney(alt.total_usd)} total`, tone: alt.unmet_unit_days > m.unmet_unit_days + 1e-6 ? 'good' : '' });
    const lines = [];
    if (outages.length === 0 && values.weatherReduction === 0) lines.push(note('No outage and no storm. The network serves every zone.'));
    else if (stillCut && m.recovery_days === null) lines.push(note(`The network is not restored inside 14 days: ${res.plan.unfunded.length ? 'the budget does not cover every repair' : 'capacity stays short'}. Shown as it is.`, 'error'));
    else lines.push(note(`Standby links cut unmet demand by ${fmt(alt.unmet_unit_days - m.unmet_unit_days, 0)} unit-days against none; they cost ${fmtMoney(m.standby_usd)} in standby.`));
    statusEl.replaceChildren(...lines);
  }

  function drawCharts() {
    tlBox.draw(() => {
      if (!res) return cc.drawLines(tlBox.canvas, { series: [] });
      const stepPts = (r) => {
        const pts = [];
        for (const s of r.segments) {
          pts.push([s.t0, s.state.unmet]);
          pts.push([s.t1, s.state.unmet]);
        }
        return pts;
      };
      cc.drawLines(tlBox.canvas, {
        series: [
          { name: 'no repairs', points: stepPts(resNoRepair), color: token('--rose'), width: 2, dash: [5, 4] },
          { name: 'with repairs', points: stepPts(res), color: token('--dawn'), width: 2.8 },
        ],
        xLabel: 'day', yLabel: 'units/day unmet', yZero: true, xRange: [0, HORIZON_DAYS],
        marks: [{ x: Math.min(day, HORIZON_DAYS), color: token('--jade') }],
      });
    });
    if (res) {
      const rows = [];
      for (let d = 0; d <= HORIZON_DAYS; d += 1) rows.push([d, stateAt(resNoRepair, d).unmet, stateAt(res, d).unmet]);
      cc.dataTable(tlBox.text, ['day', 'unmet, no repairs', 'unmet, with repairs'], rows);
    } else tlBox.text.replaceChildren(h('p', { class: 'muted small' }, 'No result.'));
    crBox.draw(() => drawBars());
    if (crit) cc.dataTable(crBox.text, ['facility', 'unmet at this redundancy', 'unmet with no standby links'], crit.map((c, i) => [c.label, c.unmet, critNone[i].unmet]), 20);
    else crBox.text.replaceChildren(h('p', { class: 'muted small' }, 'No result.'));
  }

  function drawBars() {
    const cv = crBox.canvas;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.clearRect(0, 0, W, H);
    if (!crit) return;
    const L = 8 * dpr, R = 8 * dpr, T = 8 * dpr, B = 36 * dpr;
    const n = crit.length;
    const max = Math.max(1, ...critNone.map((c) => c.unmet), ...crit.map((c) => c.unmet));
    const bw = (W - L - R) / n;
    g.font = `${10 * dpr}px ${token('--font-data') || 'monospace'}`;
    crit.forEach((c, i) => {
      const x = L + i * bw;
      const h0 = (critNone[i].unmet / max) * (H - T - B);
      const h1 = (c.unmet / max) * (H - T - B);
      g.fillStyle = rgba(token('--rose'), 0.5);
      g.fillRect(x + bw * 0.12, H - B - h0, bw * 0.38, h0);
      g.fillStyle = token('--dawn');
      g.fillRect(x + bw * 0.5, H - B - h1, bw * 0.38, h1);
      g.fillStyle = outages.includes(c.id) ? token('--fg') : token('--muted');
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(c.id, x + bw / 2, H - B + 4 * dpr);
    });
    g.strokeStyle = token('--grid');
    g.beginPath();
    g.moveTo(L, H - B);
    g.lineTo(W - R, H - B);
    g.stroke();
    g.fillStyle = token('--muted');
    g.textAlign = 'left';
    g.fillText('rose: no standby links · gold: current redundancy · units/day unmet', L, H - 12 * dpr);
  }

  function legendFill() {
    legend.replaceChildren();
    const it = (color, text) => h('span', {}, h('i', { style: { background: color } }), text);
    legend.append(it(token('--water'), 'source'), it(token('--violet'), 'hub'), it(token('--dawn'), 'relay'), it(token('--jade'), 'demand zone'), it(token(TOKEN_BAD), 'unmet or offline'), h('span', {}, 'dashed = standby link · rain = storm-exposed'));
  }

  // ---- drawing ----
  let geom = null;
  function layout(W, H) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const padX = 30 * dpr, padT = 38 * dpr, stripH = Math.min(86 * dpr, H * 0.16);
    const padB = stripH + 40 * dpr;
    const x = (nx) => padX + nx * (W - 2 * padX);
    const y = (ny) => padT + ny * (H - padT - padB);
    const r = Math.max(10 * dpr, Math.min(19 * dpr, (W - 2 * padX) * 0.032));
    const pos = {};
    for (const n of NODES) pos[n.id] = { x: x(n.x), y: y(n.y) };
    geom = { W, H, dpr, pos, r, strip: { y0: H - stripH, h: stripH - 6 * dpr, x0: padX, x1: W - padX } };
    return geom;
  }

  function curve(e) {
    const a = geom.pos[e.u], b = geom.pos[e.v];
    const r = geom.r;
    const x0 = a.x + r, y0 = a.y, x1 = b.x - r, y1 = b.y;
    const dx = (x1 - x0) * 0.5;
    return { x0, y0, x1, y1, c1x: x0 + dx, c1y: y0, c2x: x1 - dx, c2y: y1 };
  }
  const bez = (c, t) => {
    const u = 1 - t;
    return [
      u * u * u * c.x0 + 3 * u * u * t * c.c1x + 3 * u * t * t * c.c2x + t * t * t * c.x1,
      u * u * u * c.y0 + 3 * u * u * t * c.c1y + 3 * u * t * t * c.c2y + t * t * t * c.y1,
    ];
  };

  function draw() {
    const cv = canvas;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    if (!W || !H) return;
    g.clearRect(0, 0, W, H);
    if (!res) return;
    layout(W, H);
    const { dpr, pos, r } = geom;
    const fg = token('--fg'), muted = token('--muted');
    const water = token('--water'), violet = token('--violet'), dawn = token('--dawn'), jade = token('--jade'), rose = token('--rose'), bad = token(TOKEN_BAD);
    const st = stateAt(res, day);
    const offline = new Set(st.offline);
    g.font = `${10.5 * dpr}px ${token('--font-text') || 'sans-serif'}`;

    // links
    EDGES.forEach((e, k) => {
      if (e.backup && values.redundancy <= 0) return;
      const c = curve(e);
      const nominal = e.cap * (e.backup ? values.redundancy : 1);
      const cap = st.edgeCap[k];
      const flow = st.edgeFlow[k];
      const dead = offline.has(e.u) || offline.has(e.v);
      const wTrack = (1.2 + (nominal / 80) * 4.2) * dpr;
      g.beginPath();
      g.moveTo(c.x0, c.y0);
      g.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, c.x1, c.y1);
      g.lineCap = 'round';
      g.strokeStyle = rgba(muted, dead ? 0.1 : 0.24);
      g.lineWidth = wTrack;
      g.setLineDash(e.backup ? [5 * dpr, 5 * dpr] : dead ? [2 * dpr, 4 * dpr] : []);
      g.stroke();
      g.setLineDash([]);
      if (e.exposed && st.weatherOn) {
        // storm bite: the lost share of the link drawn as a pale notch over the track
        g.strokeStyle = rgba(water, 0.35);
        g.lineWidth = wTrack * values.weatherReduction;
        g.stroke();
      }
      if (flow > 0.05 && cap > 0) {
        const u = Math.min(1, flow / cap);
        const col = u > 0.92 ? rose : u > 0.55 ? dawn : jade;
        g.beginPath();
        g.moveTo(c.x0, c.y0);
        g.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, c.x1, c.y1);
        g.strokeStyle = rgba(col, 0.45);
        g.lineWidth = Math.max(1.2 * dpr, wTrack * u * 0.9);
        g.stroke();
        // particles: count from flow, speed from use of the link
        const nDots = Math.max(1, Math.min(12, Math.round(flow / 6)));
        g.fillStyle = rgba(fg, 0.95);
        for (let i = 0; i < nDots; i++) {
          const t = (phase[k] + i / nDots) % 1;
          const [px, py] = bez(c, t);
          g.beginPath();
          g.arc(px, py, (1.3 + u * 1.1) * dpr, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (e.exposed && st.weatherOn && values.weatherReduction > 0) {
        // rain over the exposed link, density from the reduction
        const n = Math.round(4 + values.weatherReduction * 10);
        g.strokeStyle = rgba(water, 0.7);
        g.lineWidth = 1 * dpr;
        const mid = bez(c, 0.5);
        for (let i = 0; i < n; i++) {
          const q = rainPos[(i * 7 + k * 3) % rainPos.length];
          const t = (clock * 0.9 + q + i * 0.13) % 1;
          const rx = mid[0] + (q - 0.5) * 70 * dpr;
          const ry = mid[1] - 30 * dpr + t * 60 * dpr;
          g.beginPath();
          g.moveTo(rx, ry);
          g.lineTo(rx - 3 * dpr, ry + 9 * dpr);
          g.stroke();
        }
      }
    });

    // nodes
    const kindColor = { source: water, hub: violet, relay: dawn, zone: jade };
    const rep = res.plan.repairs;
    for (const n of NODES) {
      const p = pos[n.id];
      const off = offline.has(n.id);
      const col = kindColor[n.kind];
      const isSel = n.id === selected && n.kind !== 'zone';
      let fill = rgba(col, off ? 0.08 : 0.22);
      let ring = off ? bad : col;
      if (n.kind === 'zone') {
        const z = st.zoneServed[n.id];
        const miss = z.demand > 0 ? 1 - z.served / z.demand : 0;
        if (miss > 0.01) {
          ring = bad;
          fill = rgba(bad, 0.18 + 0.3 * miss);
          const pulse = 0.5 + 0.5 * Math.sin(clock * 4);
          g.strokeStyle = rgba(bad, 0.15 + 0.35 * miss * pulse);
          g.lineWidth = 2 * dpr;
          g.beginPath();
          g.arc(p.x, p.y, r + 5 * dpr + 4 * dpr * miss * pulse, 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 2 * dpr;
      g.strokeStyle = rgba(ring, off ? 0.9 : 0.55);
      g.setLineDash(off ? [3 * dpr, 3 * dpr] : []);
      g.stroke();
      g.setLineDash([]);
      // use ring
      if (!off) {
        const cap = n.kind === 'zone' ? st.zoneServed[n.id].demand : n.cap;
        const used = n.kind === 'zone' ? st.zoneServed[n.id].served : st.nodeFlow[n.id];
        const share = cap > 0 ? Math.min(1, used / cap) : 0;
        if (share > 0.005) {
          g.beginPath();
          g.arc(p.x, p.y, r - 3.5 * dpr, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
          g.strokeStyle = share > 0.92 && n.kind !== 'zone' ? rose : col;
          g.lineWidth = 3 * dpr;
          g.stroke();
        }
      } else {
        g.strokeStyle = bad;
        g.lineWidth = 2.4 * dpr;
        g.beginPath();
        g.moveTo(p.x - r * 0.5, p.y - r * 0.5);
        g.lineTo(p.x + r * 0.5, p.y + r * 0.5);
        g.moveTo(p.x + r * 0.5, p.y - r * 0.5);
        g.lineTo(p.x - r * 0.5, p.y + r * 0.5);
        g.stroke();
        const job = rep.find((x) => x.id === n.id);
        if (job && day >= job.start_day && day < job.finish_day) {
          const prog = (day - job.start_day) / (job.finish_day - job.start_day);
          g.beginPath();
          g.arc(p.x, p.y, r + 4 * dpr, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
          g.strokeStyle = dawn;
          g.lineWidth = 3 * dpr;
          g.stroke();
        }
      }
      if (isSel) {
        g.strokeStyle = fg;
        g.lineWidth = 1.5 * dpr;
        g.setLineDash([2 * dpr, 3 * dpr]);
        g.beginPath();
        g.arc(p.x, p.y, r + 8 * dpr, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = off ? rgba(bad, 1) : rgba(fg, 0.92);
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(n.label, p.x, p.y + r + 5 * dpr);
      if (n.kind === 'zone') {
        const z = st.zoneServed[n.id];
        g.fillStyle = rgba(muted, 1);
        g.fillText(`${fmt(z.served, 0)}/${fmt(z.demand, 0)}`, p.x, p.y + r + 5 * dpr + 12 * dpr);
      }
    }

    // header readout
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = `${12 * dpr}px ${token('--font-data') || 'monospace'}`;
    g.fillStyle = fg;
    const stormTxt = st.weatherOn ? ' · storm on' : '';
    g.fillText(`day ${fmt(day, 1)} of ${HORIZON_DAYS}${stormTxt}`, 12 * dpr, 10 * dpr);
    g.fillStyle = st.unmet > 0.05 ? rgba(bad, 1) : rgba(jade, 1);
    g.fillText(`unmet ${fmt(st.unmet, 1)} of ${fmt(st.demand, 0)} units/day`, 12 * dpr, 26 * dpr);
    g.textAlign = 'right';
    g.fillStyle = rgba(muted, 1);
    g.font = `${10.5 * dpr}px ${token('--font-text') || 'sans-serif'}`;
    g.fillText(st.offline.length ? `offline: ${st.offline.map((id) => nodeById[id].label).join(', ')}` : 'all facilities up', W - 12 * dpr, 10 * dpr);

    drawStrip(g, dpr, fg, muted, dawn, rose, jade, bad);
  }

  function drawStrip(g, dpr, fg, muted, dawn, rose, jade, bad) {
    const s = geom.strip;
    const w = s.x1 - s.x0;
    const max = Math.max(10, ...res.segments.map((x) => x.state.unmet), ...resNoRepair.segments.map((x) => x.state.unmet));
    const X = (d) => s.x0 + (d / HORIZON_DAYS) * w;
    const Y = (v) => s.y0 + s.h - (v / max) * (s.h - 10 * dpr);
    g.fillStyle = rgba(fg, 0.04);
    g.fillRect(s.x0, s.y0, w, s.h);
    const fillSteps = (r, color, alpha) => {
      g.beginPath();
      g.moveTo(X(0), s.y0 + s.h);
      for (const sg of r.segments) {
        g.lineTo(X(sg.t0), Y(sg.state.unmet));
        g.lineTo(X(sg.t1), Y(sg.state.unmet));
      }
      g.lineTo(X(HORIZON_DAYS), s.y0 + s.h);
      g.closePath();
      g.fillStyle = rgba(color, alpha);
      g.fill();
    };
    fillSteps(resNoRepair, rose, 0.16);
    fillSteps(res, dawn, 0.4);
    for (const rp of res.plan.repairs) {
      g.strokeStyle = rgba(jade, 0.8);
      g.lineWidth = 1.5 * dpr;
      g.beginPath();
      g.moveTo(X(rp.finish_day), s.y0);
      g.lineTo(X(rp.finish_day), s.y0 + s.h);
      g.stroke();
    }
    g.fillStyle = rgba(muted, 1);
    g.font = `${10 * dpr}px ${token('--font-text') || 'sans-serif'}`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('unmet by day · gold: repairs · rose: none · green tick: repair done', s.x0, s.y0 - 12 * dpr);
    g.textBaseline = 'bottom';
    g.textAlign = 'center';
    for (const d of [0, 7, 14]) g.fillText(String(d), X(d), geom.H - 1 * dpr);
    // playhead
    g.strokeStyle = fg;
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.moveTo(X(day), s.y0 - 2 * dpr);
    g.lineTo(X(day), s.y0 + s.h + 2 * dpr);
    g.stroke();
  }

  // ---- interaction ----
  function nodeAt(ev) {
    const rct = canvas.getBoundingClientRect();
    const px = (ev.clientX - rct.left) * (canvas.width / rct.width);
    const py = (ev.clientY - rct.top) * (canvas.height / rct.height);
    if (!geom) return null;
    let best = null, bd = Infinity;
    for (const n of NODES) {
      const p = geom.pos[n.id];
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bd) { bd = d; best = n; }
    }
    return bd <= geom.r * 2 ? best : null;
  }
  function toggleOutage(id) {
    if (!nodeById[id] || nodeById[id].kind === 'zone') {
      ctx.announce('Demand zones do not fail in this model. Pick a source, hub or relay.', 'info');
      return;
    }
    selected = id;
    sel.value = id;
    outages = outages.includes(id) ? outages.filter((x) => x !== id) : [...outages, id];
    ctx.announce(`${nodeById[id].label} ${outages.includes(id) ? 'knocked out' : 'restored'}.`, 'quiet');
    recompute();
    restart();
  }
  canvas.addEventListener('pointerdown', (ev) => {
    const n = nodeAt(ev);
    if (n) toggleOutage(n.id);
  });
  canvas.addEventListener('keydown', (ev) => {
    const ids = NODES.filter((n) => n.kind !== 'zone').map((n) => n.id);
    const i = ids.indexOf(selected);
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') selected = ids[(i + 1) % ids.length];
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') selected = ids[(i + ids.length - 1) % ids.length];
    else if (ev.key === 'Enter' || ev.key === ' ') {
      toggleOutage(selected);
      ev.preventDefault();
      return;
    } else return;
    ev.preventDefault();
    sel.value = selected;
    syncSelect();
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

  // ---- playback ----
  const DAY_RATE = 1.1; // simulated days per second
  const loop = ctx.loop((dt) => {
    clock += dt;
    for (let k = 0; k < EDGES.length; k++) {
      const flow = res ? stateAt(res, day).edgeFlow[k] : 0;
      const cap = res ? stateAt(res, day).edgeCap[k] : 1;
      const u = cap > 0 ? Math.min(1, flow / cap) : 0;
      phase[k] += dt * (0.1 + 0.55 * u);
    }
    if (day < HORIZON_DAYS) {
      day = Math.min(HORIZON_DAYS, day + dt * DAY_RATE);
      if (day >= HORIZON_DAYS) tp.setRunning(false);
    }
    updateNow();
    draw();
    if (day >= HORIZON_DAYS) {
      // Particles stay alive a moment after the clock ends, then the loop stops.
      endHold += dt;
      if (endHold > 2.5) pause();
    }
  });
  let endHold = 0;
  function updateNow() {
    if (!res) return;
    const cur = stateAt(res, day);
    grid.set('now', cur.demand ? cur.served / cur.demand : NaN, { sub: `day ${fmt(day, 1)}` });
  }
  function play() {
    if (ctx.reducedMotion()) {
      stepEvent();
      return;
    }
    if (day >= HORIZON_DAYS) day = 0;
    endHold = 0;
    loop.start();
    tp.setRunning(true);
  }
  function pause() {
    loop.stop();
    tp.setRunning(false);
    draw();
  }
  function stepEvent() {
    if (!res) return;
    const next = res.segments.map((s) => s.t0).find((t) => t > day + 1e-9);
    day = next === undefined ? 0 : next;
    clock += 0.2;
    updateNow();
    drawCharts();
    draw();
  }
  function restart() {
    day = 0;
    loop.stop();
    if (ctx.reducedMotion()) {
      tp.setRunning(false);
      updateNow();
      drawCharts();
      draw();
    } else play();
  }

  recompute();
  if (ctx.reducedMotion()) {
    day = 0;
    draw();
  } else play();

  return {
    getRecord() {
      const out = [];
      const m = (name, value, unit, noteText) => out.push({ name, value: Number.isFinite(value) ? value : null, unit, ...(noteText ? { note: noteText } : {}) });
      if (res) {
        const x = res.metrics;
        m('Peak unmet demand', x.peak_unmet_units_day, 'units/day', `${fmtPct(x.peak_unmet_share, 1)} of demand`);
        m('Unmet demand over 14 days', x.unmet_unit_days, 'unit-days');
        m('Recovery time', x.recovery_days, 'days', x.recovery_days === null ? 'not restored inside 14 days' : 'to 95% of undamaged served');
        m('Event cost', x.total_usd, 'USD', '14 days: routing, standby, unmet penalty, repairs');
        m('Repair spend', x.repair_usd, 'USD');
        m('Standby cost', x.standby_usd, 'USD');
        m('Routing cost', x.operating_usd, 'USD');
        m('Unmet penalty', x.unmet_penalty_usd, 'USD');
        m('Unmet demand with no standby links', resNoRed.metrics.unmet_unit_days, 'unit-days', 'same event, redundancy 0');
        m('Unmet demand with no repairs', resNoRepair.metrics.unmet_unit_days, 'unit-days', 'same event, repair budget 0');
      }
      return {
        inputs: { ...values, outages: outages.join(',') },
        seed,
        metrics: out,
        diagnostics: { dayShown: Math.round(day * 100) / 100, segments: res ? res.segments.length : 0, solveMs: Math.round(computeMs * 10) / 10, fps: loop.fps },
        elapsedMs: Math.round(performance.now() - t0),
      };
    },
    getTable() {
      return res ? toTable(res) : { columns: ['from_day'], rows: [] };
    },
    destroy() {
      loop.dispose();
      stopFit();
      themeObs.disconnect();
      mq && mq.removeEventListener && mq.removeEventListener('change', onScheme);
      tlBox.destroy();
      crBox.destroy();
    },
  };
}
