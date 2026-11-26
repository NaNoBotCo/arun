// E07 The buyer's desk (commercial product sandbox)
import { METHOD_VERSION, BUYERS, LEVELS, economics, sensitivity, measuredCpuHours } from '../kernels/e07.js';
import { jobLog, deviceLabel } from '../core/jobs.js';
import { escapeHTML } from '../core/record.js';

export const meta = {
  id: 'E07',
  title: 'The buyer’s desk',
  subtitle: 'commercial product sandbox',
  priority: 'P0',
  kind: 'decision',
  dataStatus: 'SYNTHETIC',
  methodVersion: METHOD_VERSION,
  blurb: 'The runs become a report, a sample quote and a price per compute-hour. Every number links back to a run.',
  inputs: [
    { name: 'buyer', label: 'Buyer', type: 'select', options: Object.entries(BUYERS).map(([value, b]) => ({ value, label: b.label })), default: 'hotel' },
    { name: 'level', label: 'Report level', type: 'segmented', options: Object.entries(LEVELS).map(([value, l]) => ({ value, label: `${l.label} · ${l.credits} credit${l.credits > 1 ? 's' : ''}` })), default: 'standard' },
    { name: 'pricePerCredit_usd', label: 'Price per credit', type: 'range', min: 0, max: 3000, step: 25, default: 400, unit: 'US$' },
    { name: 'reportsPerYear', label: 'Reports sold per year', type: 'range', min: 0, max: 5000, step: 10, default: 200, unit: 'reports', integer: true },
    { name: 'computeSource', label: 'Compute per report from', type: 'segmented', options: [{ value: 'measured', label: 'Measured here × scale' }, { value: 'entered', label: 'Entered' }], default: 'measured' },
    { name: 'productionScale', label: 'A production run is this many times this demo', type: 'range', min: 1, max: 100000, step: 1, default: 2000, unit: '×', integer: true },
    { name: 'cpuHoursEntered', label: 'Compute per report (entered)', type: 'range', min: 0, max: 5000, step: 1, default: 40, unit: 'CPU-h' },
    { name: 'cpuCost_usd_h', label: 'Compute cost', type: 'range', min: 0, max: 5, step: 0.01, default: 0.08, unit: 'US$/CPU-h' },
    { name: 'storage_usd', label: 'Storage and transfer per report', type: 'range', min: 0, max: 200, step: 1, default: 5, unit: 'US$' },
    { name: 'field_usd', label: 'Field visit per report (partner)', type: 'range', min: 0, max: 2000, step: 10, default: 150, unit: 'US$' },
    { name: 'fixed_usd_y', label: 'Fixed cost per year', type: 'range', min: 0, max: 1000000, step: 5000, default: 60000, unit: 'US$' },
    { name: 'sharing', label: 'Buyer permits its sensor readings to join the shared aggregate (example)', type: 'toggle', default: false },
  ],
  outputs: [{ name: 'contribution', label: 'Gross contribution per year', unit: 'US$' }],
  recordInputs: [],
  dependencies: ['E02', 'E03', 'E04', 'E05', 'E06'],
  feeds: [],
  seedStrategy: 'No randomness of its own. It reads the stored results of E02–E06 together with their input hashes and seeds.',
  method: `<p>The desk reads the latest stored result of each core exhibit and checks it against the scenario now: <b>current</b> if the inputs that produced it are unchanged, <b>stale</b> if they changed, <b>missing</b> if it was never run. Stale and missing results are shown as such and are not used as current.</p>
<p>Compute per report comes from wall time measured on this device for the runs behind the report (E02 storm, E02 sweep, E03 loom, E06 search), converted to CPU-hours and multiplied by a production scale you set, or from a number you enter. No hardware is assumed.</p>
<p class="eq">price per report = price per credit × credits for the level
variable cost per report = CPU-h × cost per CPU-h + storage + field visit
revenue = reports × price        gross contribution = revenue − reports × variable cost
margin = contribution ÷ revenue (shown only when revenue > 0)
break-even reports = fixed cost ÷ (price − variable cost), or never if price ≤ variable cost
revenue per compute-hour = revenue ÷ total CPU-hours</p>
<p>The bars under the numbers move each assumption ±20% alone and show how far the yearly contribution moves. Commercial benefit (what the buyer gains) and shared benefit (what enters a shared, permitted aggregate) are listed apart; shared benefit is claimed only when the sharing switch is on.</p>`,
  limitations: [
    'Fictional buyers, prices and reports. Not a real sale, offer or cost commitment.',
    'Measured compute is this browser on this device; a production run would differ and the scale factor is a guess you set.',
    'Transaction value is not revenue to any one party; installed capacity is not compute used.',
    'The partner tasks are inert examples: nothing is booked, billed or dispatched.',
  ],
  provenance: [],
  whoPays: {
    buyer: 'Hotels, farms, developers, insurers, engineers',
    why: 'A decision report built from runs they can replay, priced per credit.',
    benefit: 'Only when a buyer permits it: their sensor readings join a shared, coarse picture of the valley.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E07"].ex-stage { background: linear-gradient(160deg, color-mix(in srgb, var(--dawn) 8%, var(--bg)), var(--bg) 60%); }
[data-ex="E07"] .paper { flex: 1; min-height: 0; overflow: auto; margin: 10px; border-radius: 18px; background: var(--panel-solid); border: 1px solid var(--line); box-shadow: var(--shadow); padding: 20px clamp(14px, 3vw, 34px); }
[data-ex="E07"] .paper h2 { font-size: var(--step-2); margin-bottom: 2px; }
[data-ex="E07"] .paper h3 { font-size: 1.05rem; margin: 18px 0 6px; display: flex; align-items: center; gap: 8px; text-transform: uppercase; letter-spacing: 0.1em; }
[data-ex="E07"] .st { font-family: var(--font-data); font-size: 0.7rem; padding: 2px 8px; border-radius: 99px; border: 1px solid currentColor; letter-spacing: 0.06em; }
[data-ex="E07"] .st.current { color: var(--jade); }
[data-ex="E07"] .st.stale { color: var(--dawn-text); }
[data-ex="E07"] .st.missing { color: var(--muted); }
[data-ex="E07"] .paper table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
[data-ex="E07"] .paper td, [data-ex="E07"] .paper th { border-bottom: 1px solid var(--line); padding: 4px 6px; text-align: right; font-variant-numeric: tabular-nums; }
[data-ex="E07"] .paper td:first-child, [data-ex="E07"] .paper th:first-child { text-align: left; }
[data-ex="E07"] .quote { border: 2px dashed var(--dawn); border-radius: 14px; padding: 10px 14px; margin-top: 8px; }
[data-ex="E07"] .quote .total { font-family: var(--font-data); font-size: 1.3rem; color: var(--dawn-text); }
[data-ex="E07"] .meta-line { color: var(--muted); font-size: 0.85rem; }
[data-ex="E07"] .goto { font-size: 0.85rem; margin-left: auto; }
[data-ex="E07"] pre.task { font-size: 0.72rem; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 6px; max-height: 180px; overflow: auto; }
`;

function statusOf(store, id) {
  const r = store.getResult(id);
  if (!r) return { state: 'missing', r: null };
  if (id === 'E02') return { state: r.inputHash === store.inputHash('hydro') ? 'current' : 'stale', r };
  if (id === 'E03') return { state: !r.data.linked || r.inputHash.split(':')[0] === store.inputHash('hydro') ? 'current' : 'stale', r };
  return { state: 'current', r };
}

export function mount(slots, ctx) {
  const { h, controlPanel, metricGrid, sectionTitle, note, fmt, fmtMoney, fmtPct, token, button } = ctx.ui;
  const store = ctx.scenario;
  const defaults = Object.fromEntries(meta.inputs.map((i) => [i.name, i.default]));
  const v = { ...defaults, ...(ctx.initial ? ctx.initial.inputs : {}) };
  const paper = h('article', { class: 'paper', 'aria-label': 'Sample report preview' });
  slots.stage.append(paper);

  slots.controls.append(note('Run E02 (storm and sweep), E03, E04 and E06 to fill the report. Each section says whether its result is current, stale or missing.'));
  const shown = ctx.compact ? meta.inputs.filter((i) => ['buyer', 'pricePerCredit_usd', 'reportsPerYear'].includes(i.name)) : meta.inputs;
  controlPanel(slots.controls, shown, v, () => render());
  slots.controls.append(h('div', { class: 'btnrow' }, button('Zero price', () => {
    v.pricePerCredit_usd = 0;
    render();
    ctx.announce('Price set to zero: revenue is zero and margin is not shown.');
  }, { kind: 'small' })));

  const mg = metricGrid(slots.metrics, [
    { name: 'price', label: 'Price per report', money: true },
    { name: 'var', label: 'Variable cost per report', money: true },
    { name: 'rev', label: 'Revenue per year', money: true },
    { name: 'contrib', label: 'Gross contribution', money: true },
    { name: 'margin', label: 'Margin', pct: true },
    { name: 'be', label: 'Break-even reports', digits: 0 },
    { name: 'cpu', label: 'Compute per report', unit: 'CPU-h', digits: 3 },
    { name: 'rph', label: 'Revenue per compute-hour', money: true },
    { name: 'op', label: 'After fixed cost', money: true },
  ]);
  const tor = ctx.chart.chartBox(slots.metrics, { title: 'What moves the yearly contribution most (each input ±20%)', height: 170 });
  const taskBox = h('div', {});
  slots.metrics.append(sectionTitle('Partner handoff (inert example)'), taskBox);

  let econ = null, lastSens = [], cpu = null;

  function compute() {
    const e02 = statusOf(store, 'E02'), e03 = statusOf(store, 'E03'), e06 = statusOf(store, 'E06');
    const log = jobLog().filter((j) => /^e0[236]\./.test(j.name));
    const mainMs = e02.r && e02.r.where === 'main thread' ? e02.r.elapsedMs : 0;
    cpu = measuredCpuHours(log, mainMs, v.productionScale);
    const perReport = v.computeSource === 'measured' ? cpu.cpuHours : v.cpuHoursEntered;
    const p = { reportsPerYear: v.reportsPerYear, pricePerCredit_usd: v.pricePerCredit_usd, level: v.level, cpuHoursPerReport: perReport, cpuCost_usd_h: v.cpuCost_usd_h, storage_usd: v.storage_usd, field_usd: v.field_usd, fixed_usd_y: v.fixed_usd_y };
    econ = economics(p);
    lastSens = sensitivity(p);
    return { e02, e03, e06, e04: statusOf(store, 'E04'), e05: statusOf(store, 'E05'), p, log };
  }

  function stTag(state) {
    return h('span', { class: 'st ' + state }, state.toUpperCase());
  }

  function render() {
    const d = compute();
    const b = BUYERS[v.buyer];
    mg.set('price', econ.price);
    mg.set('var', econ.variablePerReport);
    mg.set('rev', econ.revenue);
    mg.set('contrib', econ.contribution, { tone: econ.contribution >= 0 ? 'good' : 'bad' });
    mg.set('margin', econ.margin, { text: econ.margin === null ? 'n/a (no revenue)' : undefined });
    mg.set('be', econ.breakEvenReports, { text: econ.breakEvenReports === null ? 'never' : undefined });
    mg.set('cpu', d.p.cpuHoursPerReport, { sub: v.computeSource === 'measured' ? `${fmt(cpu.measuredMs, 0)} ms measured × ${v.productionScale}` : 'entered' });
    mg.set('rph', econ.revenuePerCpuHour, { text: econ.revenuePerCpuHour === null ? '—' : undefined });
    mg.set('op', econ.operatingResult, { tone: econ.operatingResult >= 0 ? 'good' : 'bad' });
    drawTornado();

    const sections = [];
    sections.push(h('p', { class: 'meta-line' }, `SYNTHETIC · fictional valley · sample only · seed ${store.get().seed} · scenario ${store.inputHash('hydro').slice(0, 8)} · ${new Date().toISOString().slice(0, 10)}`));
    sections.push(h('h2', {}, b.product), h('p', {}, `Prepared for: ${b.label} (fictional). Recurring service: ${b.recurring}.`));

    // E02
    // The sweep's ×1.0 row is the same computation as the storm run (same seed, inputs and grid).
    const s02 = d.e02.r && (d.e02.r.data.single || (d.e02.r.data.curve && d.e02.r.data.curve.find((r) => r.multiplier === 1)) || null);
    sections.push(h('h3', {}, 'Site comparison · E02', stTag(d.e02.state), h('a', { class: 'goto', href: '#e02' }, 'open')));
    if (d.e02.state === 'current' && s02) {
      sections.push(h('table', {}, h('thead', {}, h('tr', {}, ['Asset', 'Peak today', 'Peak with wetland', 'Hours above, today', 'Hours above, wetland'].map((t) => h('th', {}, t)))),
        h('tbody', {}, s02.baseline.assets.map((a, i) => h('tr', {}, h('td', {}, a.id), h('td', {}, fmt(a.peak_m, 2) + ' m'), h('td', {}, fmt(s02.intervention.assets[i].peak_m, 2) + ' m'), h('td', {}, fmt(a.hoursAbove, 1)), h('td', {}, fmt(s02.intervention.assets[i].hoursAbove, 1)))))));
      sections.push(h('p', {}, `Peak river outflow ${fmt(s02.baseline.peakQ_m3_s, 0)} → ${fmt(s02.intervention.peakQ_m3_s, 0)} m³/s. Water budget residual ${fmt(s02.baseline.residual_m3, 4)} m³.`));
    } else sections.push(h('p', { class: 'meta-line' }, d.e02.state === 'stale' ? 'The storm inputs changed after the last run. Rerun E02; the old numbers are not shown as current.' : d.e02.state === 'current' ? 'The storm run is still going. Open E02 and let it finish.' : 'Not run yet.'));

    // E03
    const s03 = d.e03.r && d.e03.r.data.stats;
    sections.push(h('h3', {}, 'A thousand futures · E03', stTag(d.e03.state), h('a', { class: 'goto', href: '#e03' }, 'open')));
    if (d.e03.state === 'current' && s03) {
      sections.push(h('p', {}, `${s03.paths.toLocaleString()} paired futures over ${d.e03.r.data.config.horizon_y} years (hazard: ${d.e03.r.data.hazardSource}). Chance the measure pays off ${fmtPct(s03.pPositive, 0)}; median net benefit ${fmtMoney(s03.median)}; middle 90% ${fmtMoney(s03.q05)} to ${fmtMoney(s03.q95)}; average of the worst 5% ${fmtMoney(s03.esNB5)}.`));
    } else sections.push(h('p', { class: 'meta-line' }, d.e03.state === 'stale' ? 'E03 used an E02 sweep that is now out of date. Rerun E03.' : 'Not run yet.'));

    // E04
    const s04 = d.e04.r && d.e04.r.data;
    sections.push(h('h3', {}, 'Sensor plan · E04', stTag(d.e04.state), h('a', { class: 'goto', href: '#e04' }, 'open')));
    if (s04) sections.push(h('p', {}, `${s04.sensors} sensors (${s04.method === 'oi' ? 'optimal interpolation' : 'kernel correction'}): test-cell error ${fmt(s04.rmseBackground, 2)} → ${fmt(s04.rmseAnalysis, 2)} mm; sensor cost ${fmtMoney(s04.sensorCost_usd_y)} a year.`));
    else sections.push(h('p', { class: 'meta-line' }, 'Not run yet.'));

    // E06
    const s06 = d.e06.r && d.e06.r.data.selected;
    sections.push(h('h3', {}, 'Short-listed option · E06', stTag(d.e06.state), h('a', { class: 'goto', href: '#e06' }, 'open')));
    if (s06) sections.push(h('p', {}, `Option #${s06.id}: ${s06.type}, ${s06.size_ha} ha. Build ${fmtMoney(s06.capex)}; profit ${fmtMoney(s06.profit)}/yr; resilience value ${fmtMoney(s06.benefit)}/yr; land ${fmt(s06.burden, 1)} ha. One of ${d.e06.r.data.frontCount} frontier options from ${d.e06.r.data.searched.toLocaleString()} searched.`));
    else sections.push(h('p', { class: 'meta-line' }, 'No option sent yet. In E06, select an option and press “Send to the buyer’s desk”.'));

    // Compute
    sections.push(h('h3', {}, 'Compute used'));
    sections.push(h('p', {}, `${d.log.length} background jobs and the E02 storm took ${fmt(cpu.measuredMs, 0)} ms of wall time on this device (${deviceLabel()}). ${v.computeSource === 'measured' ? `At ${v.productionScale}× for a production run: ${fmt(d.p.cpuHoursPerReport, 3)} CPU-hours per report.` : `Entered: ${fmt(d.p.cpuHoursPerReport, 1)} CPU-hours per report.`} No GPU was used or assumed.`));

    // Quote
    const sensors = s04 ? s04.sensors : 0;
    const lines = [
      [`${LEVELS[v.level].label} report (${LEVELS[v.level].credits} credits × ${fmtMoney(v.pricePerCredit_usd)})`, econ.price],
      [`Sensor service, ${sensors} sensors, first year`, s04 ? s04.sensorCost_usd_y : 0],
      ['Field visit by a local partner', v.field_usd],
    ];
    const total = lines.reduce((s, l) => s + l[1], 0);
    sections.push(h('h3', {}, 'Sample quote'));
    sections.push(h('div', { class: 'quote' }, h('table', {}, h('tbody', {}, lines.map(([l, x]) => h('tr', {}, h('td', {}, l), h('td', {}, fmtMoney(x)))))),
      h('p', {}, 'Total ', h('span', { class: 'total' }, fmtMoney(total))), h('p', { class: 'meta-line' }, 'Sample quote with editable, hypothetical prices. Not an offer.')));

    // Benefits
    sections.push(h('h3', {}, 'Benefit'));
    const commercial = s02 && d.e02.state === 'current' ? `Commercial: the hotel stands in water ${fmt(s02.baseline.hotelHoursAbove, 1)} h today and ${fmt(s02.intervention.hotelHoursAbove, 1)} h with the wetland, in this storm.` : 'Commercial: run E02 to fill this line.';
    sections.push(h('p', {}, commercial));
    sections.push(h('p', {}, v.sharing ? `Shared: ${sensors} sensors × 24 readings a day ≈ ${(sensors * 24 * 365).toLocaleString()} readings a year join a coarse shared aggregate, with the buyer's permission (example).` : 'Shared: none claimed. The buyer has not permitted sharing in this example.'));
    sections.push(h('h3', {}, 'Limits'), h('ul', {}, [...meta.limitations, 'Each section above lists its own exhibit’s limits on that exhibit’s Limits tab.'].map((l) => h('li', {}, l))));
    paper.replaceChildren(...sections);

    // Inert partner task
    const task = {
      status: 'draft-example', kind: 'site survey and sensor install', partner: 'local field partner (fictional)', region: 'fictional valley, grid cells only',
      tasks: [
        { id: 'T1', title: 'Walk the wetland site and note access', deliverable: 'photo-free site notes', acceptance: 'notes cover access, slope, standing water' },
        { id: 'T2', title: `Install ${sensors || 3} rain sensors at the E04 positions`, deliverable: 'sensors reporting', acceptance: '7 days of readings with under 5% missing' },
      ],
      billing: 'none (example only)', dispatch: 'none (example only)',
    };
    taskBox.replaceChildren(h('pre', { class: 'task' }, JSON.stringify(task, null, 1)), h('p', { class: 'small muted' }, 'A map site could show the finished report to the buyer; a field partner could do the survey. Nothing here is booked, billed or sent.'));
  }

  function drawTornado() {
    tor.draw(() => {
      const c = tor.canvas, g = c.getContext('2d');
      const W = c.width, H = c.height, dpr = Math.min(2, window.devicePixelRatio || 1);
      g.clearRect(0, 0, W, H);
      const rows = lastSens;
      const max = Math.max(1, ...rows.map((r) => Math.max(Math.abs(r.low), Math.abs(r.high))));
      const L = 120 * dpr, R = 10 * dpr, mid = L + (W - L - R) / 2;
      const bh = (H - 20 * dpr) / rows.length;
      g.font = `${11 * dpr}px ${token('--font-text')}`;
      rows.forEach((r, i) => {
        const y = 6 * dpr + i * bh;
        const lbl = { pricePerCredit_usd: 'price', reportsPerYear: 'reports/yr', cpuHoursPerReport: 'compute/report', cpuCost_usd_h: 'compute cost', field_usd: 'field visit', storage_usd: 'storage' }[r.key];
        g.fillStyle = token('--fg');
        g.textBaseline = 'middle';
        g.fillText(lbl, 6 * dpr, y + bh / 2);
        for (const [val, col] of [[r.low, token('--rose')], [r.high, token('--jade')]]) {
          const w = (val / max) * ((W - L - R) / 2);
          g.fillStyle = col;
          g.fillRect(Math.min(mid, mid + w), y + bh * 0.2, Math.abs(w), bh * 0.6);
        }
      });
      g.strokeStyle = token('--muted');
      g.beginPath();
      g.moveTo(mid, 0);
      g.lineTo(mid, H);
      g.stroke();
    });
    ctx.chart.dataTable(tor.text, ['Input', '−20% → change (US$/yr)', '+20% → change (US$/yr)'], lastSens.map((r) => [r.key, Math.round(r.low), Math.round(r.high)]));
  }

  const unsub = store.subscribe(() => render());
  ctx.onCleanup(unsub);
  render();

  return {
    getRecord() {
      const d = compute();
      return {
        inputs: { ...v },
        seed: store.get().seed,
        metrics: [
          { name: 'Price per report', value: econ.price, unit: 'USD' },
          { name: 'Variable cost per report', value: econ.variablePerReport, unit: 'USD' },
          { name: 'Revenue per year', value: econ.revenue, unit: 'USD' },
          { name: 'Gross contribution per year', value: econ.contribution, unit: 'USD' },
          { name: 'Margin', value: econ.margin, unit: 'ratio', note: econ.margin === null ? 'no revenue' : undefined },
          { name: 'Break-even reports per year', value: econ.breakEvenReports, unit: 'reports', note: econ.breakEvenReports === null ? 'never at this price' : undefined },
          { name: 'Compute per report', value: d.p.cpuHoursPerReport, unit: 'CPU-h', note: v.computeSource },
          { name: 'Measured wall time behind the report', value: cpu.measuredMs, unit: 'ms' },
          { name: 'Revenue per compute-hour', value: econ.revenuePerCpuHour, unit: 'USD/CPU-h' },
        ],
        diagnostics: { E02: d.e02.state, E03: d.e03.state, E04: d.e04.state, E06: d.e06.state, jobs: d.log.length },
      };
    },
    getTable() {
      return { columns: ['input', 'change_minus20pct_usd_y', 'change_plus20pct_usd_y'], rows: lastSens.map((r) => [r.key, r.low, r.high]) };
    },
    getReport() {
      return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sample report (fictional)</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 16px;color:#14173d}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccd;padding:4px 6px;text-align:right}td:first-child,th:first-child{text-align:left}h3{text-transform:uppercase;letter-spacing:.08em;font-size:1rem;margin-top:1.4em}.st{font:11px monospace;border:1px solid;border-radius:99px;padding:1px 7px}.quote{border:2px dashed #b86200;border-radius:12px;padding:8px 12px}.goto{display:none}</style></head><body>${escapeHTML('') }${paper.innerHTML}<p style="color:#667">Generated ${new Date().toISOString()} by ARUN (working name), exhibit E07, method ${METHOD_VERSION}.</p></body></html>`;
    },
    destroy() {},
  };
}
