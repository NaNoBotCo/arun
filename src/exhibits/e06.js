// E06 Opportunity Engine (multi-objective discovery)
import { METHOD_VERSION, DEFAULTS, CV, dominates } from '../kernels/e06.js';
import { makeRegion } from '../kernels/e02.js';
import { terrainCanvas } from '../viz/watershed.js';

export const meta = {
  id: 'E06',
  title: 'Opportunity Engine',
  subtitle: 'multi-objective discovery',
  priority: 'P0',
  kind: 'decision',
  dataStatus: 'SYNTHETIC',
  methodVersion: METHOD_VERSION,
  blurb: 'Thousands of solar, wetland and irrigation options on the valley, narrowed to the ones nothing else beats on every count.',
  inputs: [
    { name: 'count', label: 'Options to search', type: 'range', min: 1000, max: 50000, step: 1000, default: DEFAULTS.count, unit: 'options', integer: true },
    { name: 'budget_usd', label: 'Budget per project', type: 'range', min: 0, max: 10000000, step: 100000, default: DEFAULTS.budget_usd, unit: 'US$' },
    { name: 'maxPayback_y', label: 'Payback required within', type: 'range', min: 1, max: 40, step: 1, default: DEFAULTS.maxPayback_y, unit: 'years', integer: true },
    { name: 'maxBurden_ha', label: 'Land burden allowed', type: 'range', min: 0, max: 100, step: 1, default: DEFAULTS.maxBurden_ha, unit: 'ha of forest or farm' },
    { name: 'riskTolerance', label: 'Outcome spread tolerated', type: 'range', min: 0, max: 1, step: 0.05, default: DEFAULTS.riskTolerance, unit: 'CV' },
    { name: 'climate', label: 'Wetter (>1) or drier (<1) years', type: 'range', min: 0.5, max: 2, step: 0.05, default: DEFAULTS.climate, unit: '×' },
    { name: 'tariff_usd_kWh', label: 'Electricity price', type: 'range', min: 0.02, max: 0.3, step: 0.005, default: DEFAULTS.tariff_usd_kWh, unit: 'US$/kWh' },
    { name: 'solarCost_usd_kWp', label: 'Solar build cost', type: 'range', min: 200, max: 2000, step: 25, default: DEFAULTS.solarCost_usd_kWp, unit: 'US$/kWp' },
    { name: 'wetlandCost_usd_m3', label: 'Wetland build cost', type: 'range', min: 0.5, max: 20, step: 0.25, default: DEFAULTS.wetlandCost_usd_m3, unit: 'US$/m³' },
    { name: 'wetlandValue_usd_m3_y', label: 'Value of water stored', type: 'range', min: 0, max: 5, step: 0.1, default: DEFAULTS.wetlandValue_usd_m3_y, unit: 'US$/m³/yr' },
    { name: 'yAxis', label: 'Up the chart', type: 'segmented', options: [{ value: 'profit', label: 'Profit' }, { value: 'benefit', label: 'Resilience' }, { value: 'burden', label: 'Land burden' }], default: 'profit' },
  ],
  outputs: [{ name: 'front', label: 'Options on the frontier', unit: 'count' }],
  recordInputs: ['weights', 'selected'],
  dependencies: ['E01', 'E02'],
  feeds: ['E07', 'E02'],
  seedStrategy: 'The seed builds the same valley as E02 and draws every option’s type, place and size.',
  method: `<p>Each option is a fictional project of one type, on one cell of the E02 valley, of 0.5–12 ha:</p>
<p class="eq">solar    kWp = area × 0.18 kW/m² × 0.5 packing;  energy = kWp × yield
         yield = E01 annual mean top-of-atmosphere sunlight at the latitude × clearness × 8.76 × 0.8
wetland  volume = area × 1.5 m;  useful = min(volume, catchment area × 5 cm × climate)
drip     water saved = 2,000 m³/ha × (2 − climate)</p>
<p>The catchment area comes from D8 flow accumulation on the E02 terrain (each cell drains to its steepest neighbour). The solar yield comes from the E01 kernel. These are the two places this exhibit reads another exhibit's computation.</p>
<p>Each option gets four numbers: <b>profit</b> (cash per year minus build cost spread over the payback limit), <b>resilience</b> (backup power near the substation, water stored, water saved, in US$ per year at the editable values), <b>build cost</b>, and <b>land burden</b> (hectares of forest or farm taken).</p>
<p>Options that break a rule are dropped and the reason is kept: river channel, steep slope, inside the town, not farmland, over budget, slow payback, too much land, too uncertain.</p>
<p>The <b>frontier</b> is every feasible option that no other option beats on all four at once (at least as good on each, better on one). It is found by sorting on profit and comparing each option with the frontier so far; a test checks it against the brute-force definition. The weights below rank the frontier for a short list; they do not change which options are on it. A frontier option is not the morally best choice; it is one nothing else strictly beats.</p>`,
  limitations: [
    'Fictional options on a fictional valley. No real sites are recommended.',
    'Costs, prices and values are editable assumptions, not quotes.',
    'Resilience is a single money figure built from assumed values; real resilience has many dimensions.',
    'Options are judged one at a time; combining several on the same land is not modelled.',
  ],
  provenance: [],
  whoPays: {
    buyer: 'Developers, utilities, farm groups',
    why: 'A short list of options worth a site visit, each with the reasons others were dropped.',
    benefit: 'Fewer projects built where they do harm; more where they protect.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E06"].ex-stage { background: radial-gradient(ellipse at 70% 0%, color-mix(in srgb, var(--water) 10%, transparent), transparent 60%), var(--bg); }
[data-ex="E06"] .sky { position: relative; flex: 1; min-height: 0; }
[data-ex="E06"] .sky canvas.main { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; }
[data-ex="E06"] .inset { position: absolute; left: 84px; top: 40px; width: min(190px, 30%); aspect-ratio: 1; border-radius: 12px; border: 1px solid var(--line); overflow: hidden; }
[data-ex="E06"] .inset canvas { width: 100%; height: 100%; display: block; }
[data-ex="E06"] .legend { position: absolute; left: 70px; top: 10px; display: flex; gap: 12px; font-size: 0.82rem; flex-wrap: wrap; pointer-events: none; }
[data-ex="E06"] .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
[data-ex="E06"] .pick { font-size: 0.88rem; border: 1px solid var(--dawn); border-radius: 12px; padding: 8px 10px; margin: 8px 0; }
[data-ex="E06"] .short { font-size: 0.85rem; width: 100%; border-collapse: collapse; }
[data-ex="E06"] .short td, [data-ex="E06"] .short th { padding: 3px 4px; border-bottom: 1px solid var(--line); text-align: right; }
[data-ex="E06"] .short td:first-child, [data-ex="E06"] .short th:first-child { text-align: left; }
[data-ex="E06"] .short tr { cursor: pointer; }
[data-ex="E06"] progress { width: 100%; accent-color: var(--dawn); }
`;

const TYPE_LABEL = { solar: 'Solar', wetland: 'Wetland', drip: 'Drip irrigation' };

export function mount(slots, ctx) {
  const { h, controlPanel, transport, metricGrid, note, sectionTitle, fmt, fmtMoney, button, token } = ctx.ui;
  const defaults = Object.fromEntries(meta.inputs.map((i) => [i.name, i.default]));
  const v = { ...defaults, ...(ctx.initial ? ctx.initial.inputs : {}) };
  const weights = { profit: 1, benefit: 1, capex: 0.5, burden: 1, ...(ctx.initial && ctx.initial.inputs.weights ? ctx.initial.inputs.weights : {}) };
  let seed = ctx.initial ? ctx.initial.seed : ctx.scenario.get().seed;

  const canvas = h('canvas', { class: 'main', role: 'img', tabindex: '0', 'aria-label': 'Every option as a dot: across is build cost, up is the chosen measure. Faint dots break a rule. Bright ringed dots are on the frontier. Click a dot to inspect it.' });
  const inset = h('canvas', { 'aria-hidden': 'true' });
  const legend = h('div', { class: 'legend' });
  slots.stage.append(h('div', { class: 'sky' }, canvas, legend, h('div', { class: 'inset' }, inset)));

  const tp = transport({
    seed, running: false, runLabel: 'Search', hideStep: true,
    onToggle: () => run(), onReset: () => {
      Object.assign(v, defaults);
      panel.setAll(defaults);
      run();
    }, onReplay: () => run(), onSeed: (s) => {
      seed = s;
      run();
    },
  });
  slots.controls.append(tp.el);
  const prog = h('progress', { max: 1, value: 0, hidden: true });
  slots.controls.append(prog, h('div', { class: 'btnrow' }, button('Impossible constraints', () => {
    Object.assign(v, { budget_usd: 0 });
    panel.setAll(v);
    run();
  }, { kind: 'small', title: 'A zero budget: the search must return nothing' })));
  const shown = ctx.compact ? meta.inputs.filter((i) => ['budget_usd', 'yAxis'].includes(i.name)) : meta.inputs;
  const panel = controlPanel(slots.controls, shown, v, (name) => (name === 'yAxis' ? draw() : schedule()));
  slots.controls.append(sectionTitle('Rank the frontier (weights)'));
  const wDefs = [
    { name: 'profit', label: 'Weight: profit', type: 'range', min: 0, max: 3, step: 0.1, default: 1, unit: '' },
    { name: 'benefit', label: 'Weight: resilience', type: 'range', min: 0, max: 3, step: 0.1, default: 1, unit: '' },
    { name: 'capex', label: 'Weight: low build cost', type: 'range', min: 0, max: 3, step: 0.1, default: 0.5, unit: '' },
    { name: 'burden', label: 'Weight: low land burden', type: 'range', min: 0, max: 3, step: 0.1, default: 1, unit: '' },
  ];
  controlPanel(slots.controls, wDefs, weights, () => rank());

  const mg = metricGrid(slots.metrics, [
    { name: 'n', label: 'Options searched', digits: 0 },
    { name: 'feas', label: 'Pass every rule', digits: 0 },
    { name: 'front', label: 'On the frontier', digits: 0 },
    { name: 'yield', label: 'Solar yield (from E01)', unit: 'kWh/kWp/yr', digits: 0 },
    { name: 'ms', label: 'Search time', unit: 'ms', digits: 0 },
  ]);
  const pickBox = h('div', {});
  const shortBox = h('div', {});
  const dropBox = h('div', {});
  slots.metrics.append(sectionTitle('Selected option'), pickBox, sectionTitle('Short list (top 10 of the frontier by weight)'), shortBox, sectionTitle('Why options were dropped'), dropBox);

  let res = null, front = new Set(), byId = new Map(), selected = null, ranked = [], job = null, timer = null, region = null, regionSeed = null, lastMs = 0;

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  }
  function config() {
    const c = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (k in v) c[k] = v[k];
    return c;
  }
  function run() {
    if (job) job.cancel();
    prog.hidden = false;
    tp.setRunning(true);
    const N = ctx.scenario.get().hydro.grid;
    job = ctx.runJob('e06.search', { config: config(), seed, N }, { onProgress: (p) => (prog.value = p) });
    const mine = job;
    job.promise.then((r) => {
      if (mine !== job) return;
      res = r.result;
      lastMs = r.elapsedMs;
      front = new Set(res.frontIds);
      byId = new Map(res.candidates.map((c) => [c.id, c]));
      if (regionSeed !== seed) {
        region = makeRegion(seed, res.N);
        regionSeed = seed;
      }
      mg.set('n', res.count);
      mg.set('feas', res.feasibleCount);
      mg.set('front', res.frontIds.length, { tone: res.frontIds.length ? 'good' : 'bad' });
      mg.set('yield', res.yield_kWh_kWp);
      mg.set('ms', r.elapsedMs);
      const reasons = {};
      for (const c of res.candidates) for (const w of c.why) {
        const k = w.replace(/[\d.]+/g, '#');
        reasons[k] = (reasons[k] || 0) + 1;
      }
      dropBox.replaceChildren(h('ul', { class: 'small' }, Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => h('li', {}, `${n.toLocaleString()} × ${k.replace(/#/g, 'n')}`))));
      if (!res.frontIds.length) {
        selected = null;
        pickBox.replaceChildren(note('Nothing passes the rules. The search returns an empty list rather than inventing an option. Loosen a constraint.', 'error'));
        shortBox.replaceChildren();
      } else rank();
      draw();
    }).catch((e) => {
      if (!e.cancelled) ctx.announce('Search failed: ' + e.message, 'error');
    }).finally(() => {
      if (mine === job) {
        prog.hidden = true;
        tp.setRunning(false);
      }
    });
  }

  function rank() {
    if (!res || !res.frontIds.length) return;
    const F = res.frontIds.map((id) => byId.get(id));
    const keys = ['profit', 'benefit', 'capex', 'burden'];
    const mm = {};
    for (const k of keys) {
      const vals = F.map((c) => c[k]);
      mm[k] = [Math.min(...vals), Math.max(...vals)];
    }
    const norm = (c, k) => (mm[k][1] === mm[k][0] ? 0.5 : (c[k] - mm[k][0]) / (mm[k][1] - mm[k][0]));
    ranked = F.map((c) => ({ c, score: weights.profit * norm(c, 'profit') + weights.benefit * norm(c, 'benefit') + weights.capex * (1 - norm(c, 'capex')) + weights.burden * (1 - norm(c, 'burden')) })).sort((a, b) => b.score - a.score);
    shortBox.replaceChildren(h('table', { class: 'short' },
      h('thead', {}, h('tr', {}, ['Option', 'Profit/yr', 'Resilience/yr', 'Cost', 'Land'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ranked.slice(0, 10).map(({ c }) => {
        const tr = h('tr', { tabindex: '0' }, h('td', {}, `#${c.id} ${TYPE_LABEL[c.type]} ${c.size_ha} ha`), h('td', {}, fmtMoney(c.profit)), h('td', {}, fmtMoney(c.benefit)), h('td', {}, fmtMoney(c.capex)), h('td', {}, fmt(c.burden, 1) + ' ha'));
        tr.addEventListener('click', () => select(c));
        tr.addEventListener('keydown', (e) => e.key === 'Enter' && select(c));
        return tr;
      }))));
    if (!selected || !front.has(selected.id)) select(ranked[0].c, true);
    draw();
  }

  function select(c, quiet) {
    selected = c;
    const onFront = front.has(c.id);
    let dominator = null;
    if (!onFront && c.feasible) for (const id of res.frontIds) {
      const f = byId.get(id);
      if (dominates(f, c)) {
        dominator = f;
        break;
      }
    }
    const lines = [
      h('b', {}, `#${c.id} · ${TYPE_LABEL[c.type]} · ${c.size_ha} ha at column ${c.x}, row ${c.y}`),
      h('div', {}, `Build ${fmtMoney(c.capex)} · cash ${fmtMoney(c.cash)}/yr · payback ${Number.isFinite(c.payback_y) ? fmt(c.payback_y, 1) + ' yr' : 'never'}`),
      h('div', {}, `Profit ${fmtMoney(c.profit)}/yr · resilience ${fmtMoney(c.benefit)}/yr · land ${fmt(c.burden, 1)} ha · spread ${CV[c.type]}`),
      c.detail.kWp ? h('div', {}, `${fmt(c.detail.kWp, 0)} kWp → ${fmt(c.detail.energy_kWh_y / 1e6, 2)} GWh/yr`) : null,
      c.detail.useful_m3 !== undefined ? h('div', {}, `Stores ${fmt(c.detail.useful_m3, 0)} of ${fmt(c.detail.volume_m3, 0)} m³ (limited by its catchment)`) : null,
      c.detail.waterSaved_m3_y !== undefined ? h('div', {}, `Saves ${fmt(c.detail.waterSaved_m3_y, 0)} m³ of water a year`) : null,
      h('div', {}, !c.feasible ? `Dropped: ${c.why.join('; ')}` : onFront ? 'On the frontier: no other option is at least as good on all four and better on one.' : dominator ? `Beaten on every count by #${dominator.id} (${TYPE_LABEL[dominator.type]}).` : 'Feasible.'),
    ];
    const acts = h('div', { class: 'btnrow' },
      button('Send to the buyer’s desk', () => {
        ctx.scenario.putResult('E06', { inputHash: 'e06:' + seed, data: { selected: c, frontCount: res.frontIds.length, feasibleCount: res.feasibleCount, searched: res.count, config: config() }, elapsedMs: lastMs, where: 'Web Worker' });
        ctx.announce(`Option #${c.id} sent to E07.`);
      }, { kind: 'small primary' }),
      c.type === 'wetland' ? button('Try this wetland in E02', () => {
        const N = res.N;
        const r = Math.max(1, Math.min(14, Math.round(Math.sqrt((c.size_ha * 1e4) / Math.PI) / 100)));
        ctx.scenario.patch({ 'hydro.interventionX': Math.round((c.x / (N - 1)) * 100) / 100, 'hydro.interventionY': Math.round((c.y / (N - 1)) * 100) / 100, 'hydro.interventionRadius_cells': r, 'hydro.retentionCapacity_m3': Math.min(2000000, Math.round(c.detail.volume_m3 / 50000) * 50000 || 50000) }, 'E06');
        location.hash = '#e02';
      }, { kind: 'small' }) : null);
    pickBox.replaceChildren(h('div', { class: 'pick' }, lines, acts));
    if (!quiet) ctx.announce(`Selected option ${c.id}.`, 'quiet');
    draw();
  }

  function geo() {
    const W = canvas.width, H = canvas.height, dpr = Math.min(2, window.devicePixelRatio || 1);
    return { W, H, dpr, L: 70 * dpr, R: 16 * dpr, T: 40 * dpr, B: 34 * dpr };
  }

  function draw() {
    const g = canvas.getContext('2d');
    const { W, H, dpr, L, R, T, B } = geo();
    if (!W) return;
    g.clearRect(0, 0, W, H);
    const col = { solar: token('--dawn'), wetland: token('--jade'), drip: token('--water') };
    legend.replaceChildren(...Object.entries(TYPE_LABEL).map(([k, l]) => h('span', {}, h('i', { style: { background: col[k] } }), l)), h('span', { class: 'muted' }, '· faint = breaks a rule · ringed = frontier'));
    if (!res) return;
    const ya = v.yAxis;
    const xs = res.candidates.map((c) => c.capex), ys = res.candidates.map((c) => c[ya]);
    // Build cost on a log scale: options span three orders of magnitude.
    const lx = (x) => Math.log10(Math.max(1000, x));
    const x0 = lx(Math.min(...xs)), x1 = Math.max(x0 + 0.5, lx(Math.max(...xs)));
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (y1 === y0) y1 = y0 + 1;
    const sx = (x) => L + ((lx(x) - x0) / (x1 - x0)) * (W - L - R);
    const sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    g.strokeStyle = token('--grid');
    g.fillStyle = token('--muted');
    g.font = `${11 * dpr}px ${token('--font-data')}`;
    for (let k = 0; k <= 4; k++) {
      const yv = y0 + ((y1 - y0) * k) / 4, xv = 10 ** (x0 + ((x1 - x0) * k) / 4);
      g.beginPath();
      g.moveTo(L, sy(yv));
      g.lineTo(W - R, sy(yv));
      g.stroke();
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText(ya === 'burden' ? fmt(yv, 1) + ' ha' : fmtMoney(yv), L - 6 * dpr, sy(yv));
      g.textAlign = k === 0 ? 'left' : k === 4 ? 'right' : 'center';
      g.textBaseline = 'top';
      g.fillText(fmtMoney(xv), sx(xv), H - B + 8 * dpr);
    }
    g.textAlign = 'right';
    g.fillText('build cost (log scale) →', W - R, H - 14 * dpr);
    const r = Math.max(1, Math.min(2.2, 2600 / Math.sqrt(res.count))) * dpr * 0.8;
    for (const c of res.candidates) {
      if (c.feasible) continue;
      g.fillStyle = col[c.type];
      g.globalAlpha = 0.09;
      g.fillRect(sx(c.capex) - r / 2, sy(c[ya]) - r / 2, r, r);
    }
    g.globalAlpha = 0.6;
    for (const c of res.candidates) {
      if (!c.feasible || front.has(c.id)) continue;
      g.fillStyle = col[c.type];
      g.fillRect(sx(c.capex) - r, sy(c[ya]) - r, 2 * r, 2 * r);
    }
    g.globalAlpha = 1;
    g.lineWidth = 1.3 * dpr;
    for (const id of res.frontIds) {
      const c = byId.get(id);
      g.strokeStyle = col[c.type];
      g.beginPath();
      g.arc(sx(c.capex), sy(c[ya]), 3.2 * dpr, 0, Math.PI * 2);
      g.stroke();
    }
    if (selected) {
      const x = sx(selected.capex), y = sy(selected[ya]);
      g.strokeStyle = token('--fg');
      g.lineWidth = 2.5 * dpr;
      g.beginPath();
      g.arc(x, y, 9 * dpr, 0, Math.PI * 2);
      g.stroke();
    }
    canvas._s = { sx, sy, ya };
    drawInset();
  }

  function drawInset() {
    if (!region) return;
    const g = inset.getContext('2d');
    const s = inset.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    inset.width = Math.max(1, Math.round(s.width * dpr));
    inset.height = Math.max(1, Math.round(s.height * dpr));
    g.drawImage(terrainCanvas(region), 0, 0, inset.width, inset.height);
    const cell = inset.width / region.N;
    if (res && ranked.length) {
      for (const { c } of ranked.slice(0, 10)) {
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillRect((c.x + 0.25) * cell, (c.y + 0.25) * cell, cell * 0.5, cell * 0.5);
      }
    }
    if (selected) {
      g.strokeStyle = '#ffb84d';
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.arc((selected.x + 0.5) * cell, (selected.y + 0.5) * cell, Math.max(4 * dpr, Math.sqrt((selected.size_ha * 1e4) / Math.PI) / 100 * cell), 0, Math.PI * 2);
      g.stroke();
    }
  }

  canvas.addEventListener('pointerup', (e) => {
    if (!res || !canvas._s) return;
    const rr = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const x = (e.clientX - rr.left) * dpr, y = (e.clientY - rr.top) * dpr;
    const { sx, sy, ya } = canvas._s;
    let best = null, bd = Infinity;
    for (const c of res.candidates) {
      const d = (sx(c.capex) - x) ** 2 + (sy(c[ya]) - y) ** 2 - (front.has(c.id) ? 40 * dpr * dpr : 0);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best) select(best);
  });
  canvas.addEventListener('keydown', (e) => {
    if (!ranked.length) return;
    const i = ranked.findIndex((r) => selected && r.c.id === selected.id);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') select(ranked[Math.min(ranked.length - 1, i + 1)].c);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') select(ranked[Math.max(0, i - 1)].c);
    else return;
    e.preventDefault();
  });
  ctx.ui.fitCanvas(canvas, draw);
  run();

  return {
    getRecord() {
      return {
        inputs: { ...v, weights: { ...weights }, selected: selected ? selected.id : null },
        seed,
        metrics: res ? [
          { name: 'Options searched', value: res.count, unit: 'count' },
          { name: 'Options passing every rule', value: res.feasibleCount, unit: 'count' },
          { name: 'Options on the frontier', value: res.frontIds.length, unit: 'count' },
          { name: 'Solar yield from E01 geometry', value: res.yield_kWh_kWp, unit: 'kWh/kWp/yr' },
          { name: 'Selected option build cost', value: selected ? selected.capex : null, unit: 'USD' },
          { name: 'Selected option profit', value: selected ? selected.profit : null, unit: 'USD/yr' },
          { name: 'Selected option resilience value', value: selected ? selected.benefit : null, unit: 'USD/yr' },
        ] : [],
        diagnostics: { searchMs: lastMs },
        elapsedMs: lastMs,
      };
    },
    getTable() {
      if (!res) return { columns: ['id'], rows: [] };
      const rows = (ranked.length ? ranked.map((r) => r.c) : []).map((c) => [c.id, c.type, c.x, c.y, c.size_ha, c.capex, c.cash, c.profit, c.benefit, c.burden, c.payback_y]);
      return { columns: ['id', 'type', 'col', 'row', 'size_ha', 'capex_usd', 'cash_usd_y', 'profit_usd_y', 'resilience_usd_y', 'land_burden_ha', 'payback_y'], rows };
    },
    destroy() {
      clearTimeout(timer);
    },
  };
}
