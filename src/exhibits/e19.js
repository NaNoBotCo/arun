// E19 The Infinite Laboratory: a job queue for compute economics. Jobs arrive, wait, and run on slots.
import { simulate, stateAt, timeSeries, byType, TYPE_NAMES, DEFAULTS, gpuStatus } from '../kernels/e19.js';
import { jobLog, deviceLabel } from '../core/jobs.js';
import { histogram } from '../core/stats.js';

const R = (name, label, min, max, step, def, unit, help) => ({ name, label, type: 'range', min, max, step, default: def, unit, help });
const GROUPS = [
  {
    id: 'work', title: 'Workload',
    defs: [
      R('arrivals_per_h', 'Demand', 0, 200, 1, 30, 'jobs/h', 'Average jobs that arrive per hour.'),
      R('horizon_h', 'Length of the run', 4, 72, 1, 24, 'h'),
      R('mixE', 'Share: ensemble members', 0, 100, 5, 40, '%'),
      R('mixC', 'Share: climate inference', 0, 100, 5, 30, '%'),
      R('mixG', 'Share: geospatial batch', 0, 100, 5, 30, '%'),
      R('svcE', 'Service time: ensemble member', 0.05, 8, 0.05, 0.5, 'h', 'Hours one job occupies one slot.'),
      R('svcC', 'Service time: climate inference', 0.05, 8, 0.05, 1.5, 'h'),
      R('svcG', 'Service time: geospatial batch', 0.05, 8, 0.05, 0.75, 'h'),
      R('memE', 'Memory: ensemble member', 1, 512, 1, 8, 'GB'),
      R('memC', 'Memory: climate inference', 1, 512, 1, 32, 'GB', 'A job larger than any node cannot start. Try 200.'),
      R('memG', 'Memory: geospatial batch', 1, 512, 1, 16, 'GB'),
      R('cv', 'Service-time spread', 0, 2, 0.05, 0.6, '', '0 gives identical jobs of each type. Higher gives a long tail.'),
    ],
  },
  {
    id: 'cap', title: 'Capacity and power',
    defs: [
      R('cpuNodes', 'CPU nodes', 1, 32, 1, 8, 'nodes'),
      R('slotsPerNode', 'Concurrent jobs per node', 1, 16, 1, 4, 'slots'),
      R('nodeMemory_gb', 'Memory per node', 16, 512, 16, 128, 'GB'),
      R('idle_w', 'Node power, idle', 0, 1000, 10, 120, 'W'),
      R('busy_w', 'Node power, all slots busy', 0, 2000, 10, 380, 'W'),
      R('nodeCost_usd_h', 'Cost per node-hour (hypothetical)', 0, 20, 0.05, 0.9, 'US$/h'),
    ],
  },
  {
    id: 'gpu', title: 'GPU (an assumption you enter)',
    defs: [
      R('gpuNodes', 'GPU nodes you assume', 0, 8, 1, 0, 'nodes', '0 means no GPU. Nothing here says a partner has one.'),
      R('gpu_speedup', 'Assumed speed-up on GPU-capable jobs', 1, 50, 0.5, 8, '×', 'Only climate inference can use a GPU in this model.'),
      R('gpu_busy_w', 'GPU node power, busy', 0, 3000, 50, 700, 'W'),
      R('gpuCost_usd_h', 'GPU node cost per hour (hypothetical)', 0, 50, 0.1, 2.5, 'US$/h'),
    ],
  },
  {
    id: 'policy', title: 'Queue policy',
    defs: [
      { name: 'policy', label: 'Queue policy', type: 'select', default: 'fifo', options: [
        { value: 'fifo', label: 'First in, first out' },
        { value: 'priority', label: 'Priority (climate inference first)' },
        { value: 'fair', label: 'Priority with aging (fairness)' },
      ] },
      R('aging_h', 'Aging: hours waited that equal one priority step', 0.25, 48, 0.25, 6, 'h', 'Used by the aging policy. Short values let waiting jobs catch up quickly.'),
      R('reserve_fraction', 'Reserved for priority jobs', 0, 0.5, 0.05, 0, '', 'Fraction of slots only climate inference can use.'),
    ],
  },
  {
    id: 'money', title: 'Prices and costs (hypothetical, editable)',
    defs: [
      R('price_cpu_usd_slot_h', 'Price per allocated CPU slot-hour', 0, 5, 0.05, 0.4, 'US$'),
      R('price_gpu_usd_slot_h', 'Price per allocated GPU slot-hour', 0, 20, 0.1, 2, 'US$'),
      R('electricity_usd_kwh', 'Electricity price', 0, 0.6, 0.01, 0.12, 'US$/kWh'),
      R('pue', 'Facility overhead on power (PUE)', 1, 2.5, 0.05, 1.4, '×'),
      R('value_per_job_usd', 'Value of a buyer decision per job', 0, 500, 5, 25, 'US$', 'Transaction value for the buyer. It is not the operator revenue.'),
    ],
  },
];
const TONE = 'warn'; // stylecheck: allow — name of the shared CSS class
const ALL_DEFS = GROUPS.flatMap((g) => g.defs);
const COMPACT = new Set(['arrivals_per_h', 'cpuNodes', 'policy', 'gpuNodes']);

const PRESETS = {
  balanced: { label: 'Balanced day', v: {} },
  overload: { label: 'Overloaded', v: { arrivals_per_h: 46 } },
  fair: { label: 'Priority with aging', v: { arrivals_per_h: 36, policy: 'fair', aging_h: 3, reserve_fraction: 0.1 } },
  gpu: { label: 'Assume a GPU', v: { arrivals_per_h: 36, gpuNodes: 2, gpu_speedup: 8 } },
  fails: { label: 'Job too big (fails)', v: { memC: 200 } },
};

export const meta = {
  id: 'E19',
  title: 'The Infinite Laboratory',
  subtitle: 'compute economics',
  priority: 'P1',
  kind: 'simulation',
  dataStatus: 'SYNTHETIC',
  methodVersion: 'e19-des-1.0.0',
  blurb: 'Jobs queue for machines you describe. See waiting time, energy, cost and revenue.',
  inputs: ALL_DEFS.map(({ name, label, type, min, max, step, default: d, unit, options }) => ({ name, label, type, min, max, step, default: d, unit, options })),
  outputs: [
    { name: 'throughput_jobs_h', label: 'Throughput', unit: 'jobs/h' },
    { name: 'latency_p95_h', label: 'Latency, 95th percentile', unit: 'h' },
    { name: 'utilization', label: 'Utilisation of installed slots', unit: '' },
    { name: 'energy_kwh', label: 'Energy', unit: 'kWh' },
    { name: 'revenue_usd', label: 'Revenue (hypothetical)', unit: 'US$' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32 from the seed. Arrivals, job types and service times each draw from their own stream, so changing the queue policy does not change the jobs.',
  method: `<p>A discrete-event simulation. Jobs arrive as a Poisson process with the demand you set. Each job has a type, a memory need and a service time drawn from a lognormal distribution (or exponential in tests) around the mean you enter. A job needs one slot and enough free memory on a node. Waiting jobs sit in a queue; the policy picks who starts next.</p>
<p class="eq">latency = wait + service      wait = start − arrival</p>
<p>First in, first out starts the oldest job and waits if it does not fit. Priority starts the highest class that fits. Priority with aging scores a job by its class plus the hours it has waited divided by the aging time, so a long-waiting low class job eventually passes newer high class jobs. A reserve keeps a fraction of slots for the top class.</p>
<p class="eq">utilisation = allocated slot-hours ÷ (slots × window)
energy = PUE × Σ nodes [ idle_W × window + (busy_W − idle_W) ÷ slots × busy slot-hours ] ÷ 1000
revenue = price × allocated slot-hours
break-even price = (capacity cost + energy cost) ÷ allocated slot-hours
marginal cost per slot-hour = energy cost of the busy share ÷ allocated slot-hours</p>
<p>Allocated slot-hours are hours jobs actually held a slot. Installed slot-hours are every slot for the whole window, used or not. Revenue per installed slot-hour is revenue spread over the installed total. Transaction value is what the buyer's decision is worth to the buyer, and is shown apart from revenue.</p>
<p>A GPU shows as unavailable until you enter GPU nodes. When you do, climate inference jobs use a free GPU slot first and run faster by the speed-up you assume.</p>
<p>The device measurement is a separate fixed numeric workload (a 160×160 diffusion stencil, 120 steps) timed in a worker. It does not feed the model.</p>`,
  limitations: [
    'A queue model with numbers you type. It describes no real machine, partner, price or customer.',
    'Jobs run on one slot each and do not slow each other down; memory is the only shared limit on a node.',
    'GPU speed-up is a single assumed factor, not a benchmark of any device.',
    'The measured device number times a small stencil in this browser tab. It says nothing about a data center.',
  ],
  provenance: [],
  whoPays: {
    buyer: 'Data-center operator',
    why: 'Managed scientific inference and simulation sold as metered jobs or reserved capacity.',
    benefit: 'Capacity that supports openly accessible, approved resilience products once validated and permitted. Hypothetical.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E19"] .stage-wrap { position: relative; flex: 1; min-height: 0; }
[data-ex="E19"] .stage-wrap .stage-canvas { position: absolute; inset: 0; }
[data-ex="E19"] .scrub { display: flex; gap: 10px; align-items: center; padding: 6px 12px 8px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--bg-2) 60%, transparent); }
[data-ex="E19"] .scrub label { font-size: 0.85rem; font-weight: 700; white-space: nowrap; }
[data-ex="E19"] .scrub input { flex: 1; min-width: 0; }
[data-ex="E19"] .fail-banner { position: absolute; inset: auto 12px 12px 12px; padding: 12px 14px; border: 1px solid var(--danger); border-radius: var(--r-m); background: color-mix(in srgb, var(--bg) 88%, var(--danger)); font-weight: 700; }
[data-ex="E19"] .grp { border: 1px solid var(--line); border-radius: var(--r-m); margin: 8px 0; padding: 0 10px; }
[data-ex="E19"] .grp > summary { cursor: pointer; font-weight: 700; padding: 9px 0; }
[data-ex="E19"] .bench { border: 1px dashed var(--violet); border-radius: var(--r-m); padding: 10px 12px; margin: 12px 0; }
[data-ex="E19"] .bench h4 { margin: 0 0 4px; color: var(--violet); }
[data-ex="E19"] .bench progress { width: 100%; }
[data-ex="E19"] .legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
@media (max-width: 560px) { [data-ex="E19"] .stage-legend { display: none; } }
[data-ex="E19"] .gpu-chip { display: inline-block; padding: 2px 9px; border-radius: 999px; border: 1px solid currentColor; font-size: 0.8rem; font-weight: 700; }
[data-ex="E19"] .gpu-chip.off { color: var(--muted); }
[data-ex="E19"] .gpu-chip.on { color: var(--violet); }
`;

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const values = {};
  for (const d of ALL_DEFS) values[d.name] = d.default;
  let seed = 4242;
  if (ctx.initial) {
    if (Number.isInteger(ctx.initial.seed)) seed = ctx.initial.seed;
    for (const [k, v] of Object.entries(ctx.initial.inputs || {})) if (k in values && typeof v === typeof values[k]) values[k] = v;
  }
  let res = null;
  let base = null;
  let series = [];
  let hist = null;
  let t = 0;
  let speed = 2;
  let lastChartT = -1;
  let t0 = performance.now();
  let benchResult = null;
  let elapsedMs = 0;

  /* ----------------------------------------------------------------- stage */
  const canvas = h('canvas', { class: 'stage-canvas', role: 'img', 'aria-label': 'A queue of jobs flowing into machine slots' });
  const label = h('div', { class: 'stage-label', 'aria-live': 'off' }, '');
  const legend = h('div', { class: 'stage-legend' },
    TYPE_NAMES.map((n, i) => h('span', {}, h('span', { class: 'legend-dot', style: { background: `var(${['--water', '--dawn', '--jade'][i]})` } }), n)));
  const banner = h('div', { class: 'fail-banner', role: 'alert', hidden: true });
  const wrap = h('div', { class: 'stage-wrap' }, canvas, label, legend, banner);
  const scrub = h('input', { type: 'range', id: 'e19-scrub', min: 0, max: 24, step: 0.05, value: 0, 'aria-label': 'Time in the run, hours' });
  const scrubOut = h('output', { for: 'e19-scrub', class: 'mono small' }, '0.0 h');
  slots.stage.append(wrap, h('div', { class: 'scrub' }, h('label', { for: 'e19-scrub' }, 'Time'), scrub, scrubOut));

  const tk = (n) => ui.token(n);

  function layoutNodes(list, x, y, w, hgt) {
    const n = list.length;
    if (!n) return [];
    const gap = 6;
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (w - gap * (cols - 1)) / cols;
      const ch = (hgt - gap * (rows - 1)) / rows;
      const score = Math.min(cw, ch) * (cw > 12 && ch > 12 ? 1 : 0.2);
      if (!best || score > best.score) best = { cols, rows, cw, ch, score };
    }
    return list.map((nd, i) => {
      const c = i % best.cols;
      const r = Math.floor(i / best.cols);
      const nx = x + c * (best.cw + gap);
      const ny = y + r * (best.ch + gap);
      const sc = Math.ceil(Math.sqrt((nd.slots * best.cw) / best.ch));
      const cols = Math.max(1, Math.min(nd.slots, sc));
      const rows = Math.ceil(nd.slots / cols);
      const pad = 3;
      const cs = Math.min((best.cw - pad * 2) / cols, (best.ch - pad * 2) / rows);
      const cells = Array.from({ length: nd.slots }, (_, k) => ({
        cx: nx + best.cw / 2 - (cols * cs) / 2 + (k % cols) * cs + cs / 2,
        cy: ny + best.ch / 2 - (rows * cs) / 2 + Math.floor(k / cols) * cs + cs / 2,
        s: cs,
      }));
      return { x: nx, y: ny, w: best.cw, h: best.ch, cells };
    });
  }

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    if (!W || !H) return;
    const g = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.clearRect(0, 0, W, H);
    const fg = tk('--fg');
    const muted = tk('--muted');
    const line = tk('--line');
    const bg2 = tk('--bg-2');
    const typeCol = [tk('--water'), tk('--dawn'), tk('--jade')];
    const violet = tk('--violet');
    g.font = `${12 * dpr}px ${tk('--font-data') || 'monospace'}`;
    if (!res || !res.ok) {
      g.fillStyle = muted;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('No run to show.', W / 2, H / 2);
      return;
    }
    const st = stateAt(res, t);
    const pad = 14 * dpr;
    const top = 66 * dpr;
    const qx0 = pad;
    const qx1 = W * 0.27;
    const mx0 = W * 0.31;
    const mx1 = W * 0.85;
    const dx0 = W * 0.88;
    const bottom = H - 12 * dpr;
    // zones
    g.fillStyle = muted;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('QUEUE', qx0, top - 18 * dpr);
    g.fillText('MACHINES', mx0, top - 18 * dpr);
    g.textAlign = 'right';
    g.fillText('DONE', W - pad, top - 18 * dpr);
    // machines
    const cpuNodes = res.nodes.filter((n) => n.pool === 0);
    const gpuNodes = res.nodes.filter((n) => n.pool === 1);
    const gpuH = (bottom - top) * (gpuNodes.length ? 0.22 : 0.1);
    const cpuRect = { x: mx0, y: top, w: mx1 - mx0, h: bottom - top - gpuH - 8 * dpr };
    const cpuL = layoutNodes(cpuNodes, cpuRect.x, cpuRect.y, cpuRect.w, cpuRect.h);
    const gpuRect = { x: mx0, y: bottom - gpuH, w: mx1 - mx0, h: gpuH };
    const gpuL = layoutNodes(gpuNodes, gpuRect.x, gpuRect.y, gpuRect.w, gpuRect.h);
    const nodeBox = (b, color) => {
      g.strokeStyle = color;
      g.lineWidth = 1 * dpr;
      g.fillStyle = bg2;
      g.beginPath();
      g.roundRect(b.x, b.y, b.w, b.h, 6 * dpr);
      g.fill();
      g.stroke();
      for (const c of b.cells) {
        g.fillStyle = line;
        g.beginPath();
        g.roundRect(c.cx - c.s * 0.42, c.cy - c.s * 0.42, c.s * 0.84, c.s * 0.84, Math.max(1, c.s * 0.14));
        g.fill();
      }
    };
    cpuL.forEach((b) => nodeBox(b, line));
    gpuL.forEach((b) => nodeBox(b, violet));
    if (!gpuNodes.length) {
      g.strokeStyle = violet;
      g.setLineDash([5 * dpr, 4 * dpr]);
      g.strokeRect(gpuRect.x, gpuRect.y, gpuRect.w, gpuRect.h);
      g.setLineDash([]);
      g.fillStyle = muted;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('GPU: unavailable. None entered.', gpuRect.x + gpuRect.w / 2, gpuRect.y + gpuRect.h / 2);
    }
    const cellOf = (j) => {
      const i = res.jobs.node[j];
      const nd = res.nodes[i];
      const L = nd.pool === 0 ? cpuL[i] : gpuL[i - cpuNodes.length];
      return L && L.cells[res.jobs.slot[j]];
    };
    // queue squares
    const sq = Math.max(4 * dpr, Math.min(12 * dpr, (bottom - top) / 34));
    const gp = Math.max(1, sq * 0.2);
    const rowsQ = Math.max(1, Math.floor((bottom - top) / (sq + gp)));
    const cap = Math.min(st.queued.length, rowsQ * Math.floor((qx1 - qx0) / (sq + gp)));
    const qpos = (i) => ({ x: qx1 - sq - Math.floor(i / rowsQ) * (sq + gp), y: top + (i % rowsQ) * (sq + gp) });
    for (let i = 0; i < cap; i++) {
      const j = st.queued[i];
      const p = qpos(i);
      g.fillStyle = typeCol[res.jobs.type[j]];
      g.fillRect(p.x, p.y, sq, sq);
    }
    if (st.queued.length > cap) {
      g.fillStyle = fg;
      g.textAlign = 'left';
      g.textBaseline = 'bottom';
      g.fillText(`+${st.queued.length - cap} more`, qx0, bottom);
    }
    // running jobs in cells, with progress
    const anim = !ctx.reducedMotion();
    for (const j of st.running) {
      const c = cellOf(j);
      if (!c) continue;
      const prog = (t - res.jobs.start[j]) / (res.jobs.end[j] - res.jobs.start[j]);
      const s = c.s * 0.84;
      g.fillStyle = typeCol[res.jobs.type[j]];
      g.globalAlpha = 0.28;
      g.fillRect(c.cx - s / 2, c.cy - s / 2, s, s);
      g.globalAlpha = 1;
      g.fillRect(c.cx - s / 2, c.cy + s / 2 - s * Math.min(1, prog), s, s * Math.min(1, prog));
      const enter = (t - res.jobs.start[j]) / 0.25;
      if (anim && enter < 1 && cap > 0) {
        const p = qpos(0);
        const x = p.x + (c.cx - p.x) * enter;
        const y = p.y + (c.cy - p.y) * enter;
        g.fillStyle = typeCol[res.jobs.type[j]];
        g.beginPath();
        g.arc(x, y, Math.max(3 * dpr, sq * 0.6), 0, Math.PI * 2);
        g.fill();
      }
    }
    // jobs leaving: a short stream to the done bar
    if (anim) {
      const { end, start } = res.jobs;
      for (let j = Math.max(0, st.arrived - 1500); j < res.n; j++) {
        if (res.jobs.arrival[j] > t) break;
        if (start[j] < 0 || end[j] > t || t - end[j] > 0.3) continue;
        const c = cellOf(j);
        if (!c) continue;
        const f = (t - end[j]) / 0.3;
        g.globalAlpha = 1 - f;
        g.fillStyle = typeCol[res.jobs.type[j]];
        g.beginPath();
        g.arc(c.cx + (dx0 + 8 * dpr - c.cx) * f, c.cy, Math.max(2.5 * dpr, c.s * 0.25), 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    }
    // done bar: completed share of jobs that have arrived
    const bw = Math.min(38 * dpr, W - dx0 - pad);
    const bx = dx0 + (W - pad - dx0 - bw) / 2;
    g.strokeStyle = line;
    g.strokeRect(bx, top, bw, bottom - top);
    const share = res.n ? st.completed / res.n : 0;
    g.fillStyle = tk('--jade');
    g.fillRect(bx + 1, bottom - (bottom - top) * share, bw - 2, (bottom - top) * share);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillStyle = share > 0.06 ? tk('--bg') : fg;
    g.fillText(String(st.completed), bx + bw / 2, bottom - 3 * dpr);
    label.textContent = `t = ${t.toFixed(1)} h of ${res.window_h.toFixed(0)} h · waiting ${st.queued.length} · running ${st.running.length} · done ${st.completed}`;
    canvas.setAttribute('aria-label', `A queue flowing into machines. At hour ${t.toFixed(1)}: ${st.queued.length} jobs waiting, ${st.running.length} running of ${res.totalSlots} slots, ${st.completed} done. GPU ${res.gpu.status}.`);
  }

  const stopFit = ui.fitCanvas(canvas, draw);

  /* ---------------------------------------------------------------- panels */
  const transport = ui.transport({
    seed,
    running: false,
    stepLabel: 'Step 1 h',
    onToggle() {
      if (loop.running) pause();
      else play();
    },
    onStep() {
      pause();
      seek(Math.min(res && res.ok ? res.window_h : 0, t + 1));
    },
    onReset() {
      pause();
      seek(0);
    },
    onReplay() {
      seek(0);
      play();
    },
    onSeed(v) {
      seed = v;
      recompute();
      seek(0);
    },
  });
  slots.controls.append(transport.el);

  const presetSeg = ui.segmented({ name: 'preset', label: 'Preset', options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })) }, 'balanced', (k) => applyPreset(k));
  slots.controls.append(presetSeg.el);

  const panels = [];
  for (const grp of GROUPS) {
    const defs = ctx.compact ? grp.defs.filter((d) => COMPACT.has(d.name)) : grp.defs;
    if (!defs.length) continue;
    const body = h('div', {});
    const det = h('details', { class: 'grp', open: ctx.compact || grp.id === 'work' }, h('summary', {}, grp.title), body);
    slots.controls.append(det);
    panels.push(ui.controlPanel(body, defs, values, () => onInput()));
  }
  const speedPanel = ui.controlPanel(h('div', {}), [R('speed', 'Playback speed', 0.25, 12, 0.25, speed, 'sim h/s')], { speed }, (n, v) => (speed = v));
  slots.controls.append(h('details', { class: 'grp' }, h('summary', {}, 'Playback'), speedPanel.refs.speed.el));

  const metrics = ui.metricGrid(slots.metrics, [
    { name: 'throughput', label: 'Throughput', unit: 'jobs/h', digits: 2 },
    { name: 'p50', label: 'Latency, median', unit: 'h', digits: 2 },
    { name: 'p95', label: 'Latency, 95th pct', unit: 'h', digits: 2 },
    { name: 'p99', label: 'Latency, 99th pct', unit: 'h', digits: 2 },
    { name: 'util', label: 'Utilisation (installed slots)', pct: true },
    { name: 'queue', label: 'Longest queue', unit: 'jobs', digits: 0 },
    { name: 'energy', label: 'Energy incl. overhead', unit: 'kWh', digits: 1 },
    { name: 'marg', label: 'Marginal cost per job', unit: 'US$ (energy only)', digits: 3 },
    { name: 'margh', label: 'Marginal cost per slot-hour', unit: 'US$ (energy only)', digits: 4 },
    { name: 'breakeven', label: 'Break-even price per slot-hour', unit: 'US$', digits: 3 },
    { name: 'rev', label: 'Revenue (hypothetical)', money: true },
    { name: 'revalloc', label: 'Revenue per allocated slot-hour', unit: 'US$', digits: 3 },
    { name: 'revinst', label: 'Revenue per installed slot-hour', unit: 'US$', digits: 3 },
    { name: 'result', label: 'Revenue − capacity − energy', money: true },
    { name: 'tv', label: 'Transaction value for buyers', money: true, help: 'What the decisions are worth to the buyers. Not operator revenue.' },
    { name: 'counts', label: 'Done / running / waiting', unit: 'at the end of the window', wide: true },
  ]);
  const gpuChip = h('span', { class: 'gpu-chip off' }, 'GPU: unavailable');
  slots.metrics.append(h('p', { class: 'small' }, gpuChip, ' ', h('span', { class: 'muted' }, 'GPU nodes show only when you enter them as an assumption.')));
  slots.metrics.append(ui.note('All money here is hypothetical and editable. Slot-hours billed (allocated) differ from slot-hours installed.', TONE));
  const cmpBox = h('div', {});
  slots.metrics.append(cmpBox);
  const c1 = chart.chartBox(slots.metrics, { title: 'Jobs waiting and slots busy over the run', height: 170 });
  const c2 = chart.chartBox(slots.metrics, { title: 'Latency of completed jobs (hours)', height: 150 });

  /* -------------------------------------------------- measured benchmark */
  const benchOut = h('div', { class: 'small', 'aria-live': 'polite' }, 'Not measured yet.');
  const prog = h('progress', { max: 1, value: 0, hidden: true, 'aria-label': 'Benchmark progress' });
  const logBox = h('div', {});
  let benchHandle = null;
  const benchBtn = ui.button('Measure this device', () => {
    if (benchHandle && benchHandle.state === 'running') return;
    prog.hidden = false;
    prog.value = 0;
    benchOut.textContent = 'Measuring…';
    benchHandle = ctx.runJob('e19.benchmark', { size: 160, steps: 120 }, { onProgress: (p) => (prog.value = p), useCache: false });
    benchHandle.promise.then(
      (r) => {
        prog.hidden = true;
        benchResult = { ms: r.elapsedMs, where: r.where, device: r.device || deviceLabel(), updates: r.result.cell_updates, checksum: r.result.checksum };
        const rate = benchResult.updates / (benchResult.ms / 1000) / 1e6;
        benchResult.rate = rate;
        benchOut.replaceChildren(
          h('div', {}, `${ui.fmt(r.elapsedMs, 1)} ms for ${ui.fmt(r.result.cell_updates)} cell updates, ${ui.fmt(rate, 1)} million per second.`),
          h('div', { class: 'muted' }, `Ran in: ${r.where}. Device: ${benchResult.device}. Checksum ${r.result.checksum.toFixed(6)}.`));
        showLog();
        ctx.announce('Device measurement finished.');
      },
      (e) => {
        prog.hidden = true;
        if (!e.cancelled) {
          benchOut.textContent = 'Measurement stopped: ' + e.message;
          ctx.announce('Measurement stopped: ' + e.message, 'error');
        }
      });
  }, { kind: 'small' });
  function showLog() {
    const rows = jobLog().filter((e) => e.name === 'e19.benchmark').slice(-5).reverse();
    logBox.replaceChildren(rows.length
      ? h('table', { class: 'dtable' }, h('thead', {}, h('tr', {}, ['Job', 'ms', 'Where', 'Bytes moved'].map((c) => h('th', { scope: 'col' }, c)))),
          h('tbody', {}, rows.map((e) => h('tr', {}, h('td', {}, e.name), h('td', {}, ui.fmt(e.elapsedMs, 1)), h('td', {}, e.where), h('td', {}, e.bytes === null ? '—' : ui.fmt(e.bytes))))))
      : null);
  }
  slots.footer.append(h('div', { class: 'bench' },
    h('h4', {}, 'Measured on this device'),
    h('p', { class: 'small muted' }, 'A fixed numeric job timed here, separate from the model above. It does not set any input and says nothing about a data center.'),
    benchBtn, prog, benchOut, logBox));

  /* ------------------------------------------------------------ simulation */
  function config() {
    const v = values;
    return {
      horizon_h: v.horizon_h, arrivals_per_h: v.arrivals_per_h,
      mix: [v.mixE / 100, v.mixC / 100, v.mixG / 100], service_h: [v.svcE, v.svcC, v.svcG], memory_gb: [v.memE, v.memC, v.memG],
      cv: v.cv, cpuNodes: v.cpuNodes, slotsPerNode: v.slotsPerNode, nodeMemory_gb: v.nodeMemory_gb, idle_w: v.idle_w, busy_w: Math.max(v.busy_w, v.idle_w),
      nodeCost_usd_h: v.nodeCost_usd_h, gpuNodes: v.gpuNodes, gpu_speedup: v.gpu_speedup, gpu_busy_w: v.gpu_busy_w, gpuCost_usd_h: v.gpuCost_usd_h,
      policy: v.policy, aging_h: v.aging_h, reserve_fraction: v.reserve_fraction, pue: v.pue, electricity_usd_kwh: v.electricity_usd_kwh,
      price_cpu_usd_slot_h: v.price_cpu_usd_slot_h, price_gpu_usd_slot_h: v.price_gpu_usd_slot_h, value_per_job_usd: v.value_per_job_usd,
    };
  }

  function clearMetrics() {
    for (const n of ['throughput', 'p50', 'p95', 'p99', 'util', 'queue', 'energy', 'marg', 'margh', 'breakeven', 'rev', 'revalloc', 'revinst', 'result', 'tv', 'counts']) metrics.set(n, NaN, { text: '—', tone: '' });
  }

  function recompute() {
    elapsedMs = 0;
    const t1 = performance.now();
    banner.hidden = true;
    try {
      res = simulate(config(), seed);
      base = res.ok && values.policy !== 'fifo' ? simulate({ ...config(), policy: 'fifo' }, seed) : null;
    } catch (e) {
      res = null;
      base = null;
      banner.textContent = 'Not run: ' + e.message + '.';
      banner.hidden = false;
      clearMetrics();
      cmpBox.replaceChildren();
      scrub.max = 1;
      ctx.announce(banner.textContent, 'error');
      draw();
      return;
    }
    elapsedMs = performance.now() - t1;
    if (!res.ok) {
      banner.textContent = 'Cannot run: ' + res.reason;
      banner.hidden = false;
      clearMetrics();
      cmpBox.replaceChildren();
      scrub.max = 1;
      gpuChip.textContent = 'GPU: ' + gpuStatus(config()).status;
      c1.draw(() => chart.drawLines(c1.canvas, { series: [] }));
      c2.draw(() => chart.drawLines(c2.canvas, { series: [] }));
      ctx.announce(banner.textContent, 'error');
      draw();
      return;
    }
    scrub.max = res.window_h;
    if (t > res.window_h) t = res.window_h;
    series = timeSeries(res, 96);
    const lat = [];
    const { start, end, arrival } = res.jobs;
    for (let j = 0; j < res.n; j++) if (start[j] >= 0 && end[j] <= res.window_h) lat.push(end[j] - arrival[j]);
    const hi = lat.length ? Math.max(...lat) : 1;
    hist = histogram(lat, 24, 0, Math.max(hi, 0.1));
    const m = res.metrics;
    const bad = (cond) => (cond ? 'bad' : '');
    metrics.set('throughput', m.throughput_jobs_h);
    metrics.set('p50', m.latency_p50_h);
    metrics.set('p95', m.latency_p95_h, { tone: m.latency_p95_h > 4 * values.svcC ? TONE : '' });
    metrics.set('p99', m.latency_p99_h);
    metrics.set('util', m.utilization, { tone: m.utilization > 0.95 ? TONE : '' });
    metrics.set('queue', m.max_queue, { digits: 0, tone: m.queued > 0 ? TONE : '' });
    metrics.set('energy', m.energy_kwh);
    metrics.set('marg', m.marginal_cost_per_job_usd);
    metrics.set('margh', m.marginal_cost_per_slot_h_usd);
    metrics.set('breakeven', m.break_even_price_usd_slot_h);
    metrics.set('rev', m.revenue_usd);
    metrics.set('revalloc', m.revenue_per_allocated_slot_h_usd);
    metrics.set('revinst', m.revenue_per_installed_slot_h_usd);
    metrics.set('result', m.operating_result_usd, { tone: bad(m.operating_result_usd < 0) });
    metrics.set('tv', m.transaction_value_usd);
    metrics.set('counts', 0, { text: `${m.completed} / ${m.running} / ${m.queued}`, sub: m.queued > 0 ? 'jobs still waiting: demand exceeds what the slots clear' : 'at the end of the window' });
    gpuChip.textContent = res.gpu.status === 'unavailable' ? 'GPU: unavailable' : `GPU: ${res.config.gpuNodes} node(s), assumed`;
    gpuChip.className = 'gpu-chip ' + (res.gpu.status === 'unavailable' ? 'off' : 'on');
    gpuChip.title = res.gpu.reason;
    drawCharts(true);
    renderCompare();
    draw();
  }

  function renderCompare() {
    if (!res || !res.ok) return;
    const a = byType(res);
    const b = base && base.ok ? byType(base) : null;
    const f = (x) => (Number.isFinite(x) ? ui.fmt(x, 2) : '—');
    cmpBox.replaceChildren(
      ui.sectionTitle(b ? 'Same jobs, FIFO and the chosen policy' : 'Mean latency by job type'),
      h('div', { class: 'scrollx' }, h('table', { class: 'dtable' },
        h('thead', {}, h('tr', {}, ['Job type', 'Jobs', b ? 'FIFO latency (h)' : 'Latency (h)', b ? 'Chosen policy (h)' : null].filter(Boolean).map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, a.map((r, i) => h('tr', {}, h('td', {}, r.name), h('td', {}, String(r.arrivals)), b ? h('td', {}, f(b[i].mean_latency_h)) : null, h('td', {}, f(r.mean_latency_h))))))),
      b ? h('p', { class: 'small muted' }, `95th percentile latency: ${f(base.metrics.latency_p95_h)} h with FIFO, ${f(res.metrics.latency_p95_h)} h with this policy. Both runs use identical jobs.`) : null);
  }

  function drawCharts(full) {
    if (!res || !res.ok) return;
    const T = res.window_h;
    c1.draw(() => chart.drawLines(c1.canvas, {
      series: [
        { name: 'waiting', points: series.map((p) => [p.t, p.queued]), color: ui.token('--rose'), width: 2 },
        { name: 'busy slots', points: series.map((p) => [p.t, p.running]), color: ui.token('--water'), width: 2 },
      ],
      xRange: [0, T], yZero: true, xLabel: 'hours', yLabel: 'jobs and slots',
      marks: [{ x: t, color: ui.token('--dawn') }, { y: res.totalSlots, color: ui.token('--muted'), label: 'installed slots' }],
    }));
    if (full) {
      c2.draw(() => chart.drawHistogram(c2.canvas, {
        series: [{ lo: hist.lo, hi: hist.hi, counts: hist.counts, color: ui.token('--violet') }],
        xLabel: 'hours from arrival to done',
        marks: [
          { x: Math.min(hist.hi, res.metrics.latency_p50_h || 0), color: ui.token('--jade'), label: 'median' },
          { x: Math.min(hist.hi, res.metrics.latency_p95_h || 0), color: ui.token('--rose'), label: '95th' },
        ],
      }));
      chart.dataTable(c1.text, ['hour', 'waiting', 'busy slots', 'busy share'], series.map((p) => [p.t, p.queued, p.running, p.utilization]));
      const w = hist.width;
      const tb = h('div', {});
      c2.text.replaceChildren(tb);
      chart.dataTable(tb, ['from (h)', 'to (h)', 'jobs'], hist.counts.map((c, i) => [hist.lo + i * w, hist.lo + (i + 1) * w, c]));
    }
    lastChartT = t;
  }

  /* ------------------------------------------------------------- playback */
  const loop = ctx.loop((dt) => {
    if (!res || !res.ok) return pause();
    t = Math.min(res.window_h, t + dt * speed);
    sync();
    if (t >= res.window_h) pause();
  });
  function sync() {
    scrub.value = t;
    scrubOut.textContent = t.toFixed(1) + ' h';
    draw();
    if (res && res.ok && Math.abs(t - lastChartT) > res.window_h / 120) drawCharts(false);
  }
  function play() {
    if (!res || !res.ok) return ctx.announce('Nothing to run: ' + (banner.textContent || 'fix the inputs first.'), 'error');
    if (t >= res.window_h) t = 0;
    loop.start();
    transport.setRunning(true);
  }
  function pause() {
    loop.stop();
    transport.setRunning(false);
  }
  function seek(x) {
    t = Math.max(0, x);
    sync();
  }
  scrub.addEventListener('input', () => {
    pause();
    seek(Number(scrub.value));
  });

  function applyPreset(k) {
    const p = PRESETS[k];
    const next = {};
    for (const d of ALL_DEFS) next[d.name] = d.default;
    Object.assign(next, p.v);
    for (const [n, v] of Object.entries(next)) values[n] = v;
    for (const pn of panels) pn.setAll(next);
    pause();
    recompute();
    seek(0);
    if (!ctx.reducedMotion() && res && res.ok) play();
  }

  let pending = 0;
  function onInput() {
    // a short wait so a dragged slider recomputes once, not on every pixel
    clearTimeout(pending);
    pending = setTimeout(() => {
      const keep = loop.running;
      recompute();
      sync();
      if (keep && res && res.ok && t < res.window_h) loop.start();
    }, 60);
  }

  recompute();
  if (ctx.reducedMotion() && res && res.ok) seek(res.window_h * 0.5);
  else {
    sync();
    if (res && res.ok) play();
  }
  t0 = performance.now();

  return {
    getRecord() {
      const m = res && res.ok ? res.metrics : null;
      const num = (name, label, v, unit, note) => ({ name: label, value: Number.isFinite(v) ? v : null, unit, note });
      const metricsList = m
        ? [
            num('throughput', 'Throughput', m.throughput_jobs_h, 'jobs/h'),
            num('p50', 'Latency, median', m.latency_p50_h, 'h'),
            num('p95', 'Latency, 95th percentile', m.latency_p95_h, 'h'),
            num('p99', 'Latency, 99th percentile', m.latency_p99_h, 'h'),
            num('util', 'Utilisation of installed slots', m.utilization, ''),
            num('energy', 'Energy including overhead', m.energy_kwh, 'kWh'),
            num('marg', 'Marginal energy cost per job', m.marginal_cost_per_job_usd, 'US$', 'hypothetical prices'),
            num('breakeven', 'Break-even price per allocated slot-hour', m.break_even_price_usd_slot_h, 'US$', 'hypothetical'),
            num('rev', 'Revenue', m.revenue_usd, 'US$', 'hypothetical; transaction value is separate'),
            num('revalloc', 'Revenue per allocated slot-hour', m.revenue_per_allocated_slot_h_usd, 'US$'),
            num('revinst', 'Revenue per installed slot-hour', m.revenue_per_installed_slot_h_usd, 'US$'),
            num('result', 'Revenue minus capacity and energy', m.operating_result_usd, 'US$', 'hypothetical'),
            num('tv', 'Transaction value for buyers', m.transaction_value_usd, 'US$', 'not operator revenue'),
            num('arr', 'Arrivals', m.arrivals, 'jobs'),
            num('done', 'Completed', m.completed, 'jobs'),
            num('run', 'Running at end', m.running, 'jobs'),
            num('que', 'Waiting at end', m.queued, 'jobs'),
          ]
        : [];
      const diagnostics = { sim_ms: elapsedMs, gpu: res && res.ok ? res.gpu.status : 'unavailable', digest: res && res.ok ? res.digest : '' };
      if (benchResult) Object.assign(diagnostics, { measured_ms: benchResult.ms, measured_where: benchResult.where, measured_device: benchResult.device, measured_million_updates_per_s: benchResult.rate, measured_is_separate: 'true' });
      return { inputs: { ...values }, seed, metrics: metricsList, diagnostics, elapsedMs: performance.now() - t0 };
    },
    getTable() {
      return { columns: ['hour', 'waiting_jobs', 'busy_slots', 'busy_share'], rows: series.map((p) => [p.t, p.queued, p.running, p.utilization]) };
    },
    destroy() {
      clearTimeout(pending);
      loop.dispose();
      stopFit();
      c1.destroy();
      c2.destroy();
      if (benchHandle) benchHandle.cancel();
    },
  };
}
