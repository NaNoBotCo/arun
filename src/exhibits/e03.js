// E03 Probability Loom (Buy a Thousand Futures)
import { METHOD_VERSION, hazardFromSweep, simulatePath, damageShare, REF_DEPTH_M } from '../kernels/e03.js';
import { histogram } from '../core/stats.js';

export const meta = {
  id: 'E03',
  title: 'Probability Loom',
  subtitle: 'Buy a Thousand Futures',
  priority: 'P0',
  kind: 'analysis',
  dataStatus: 'SYNTHETIC',
  methodVersion: METHOD_VERSION,
  blurb: 'A thousand possible twenty-year futures for one investment. Each thread is a future; the cloth is the spread.',
  inputs: [
    { name: 'paths', label: 'Futures (paths)', type: 'range', min: 100, max: 10000, step: 100, default: 1000, unit: 'paths', integer: true },
    { name: 'horizon_y', label: 'Horizon', type: 'range', min: 10, max: 30, step: 1, default: 20, unit: 'years', integer: true },
    { name: 'freq_per_y', label: 'Big storms per year', type: 'range', min: 0, max: 3, step: 0.05, default: 0.35, unit: 'per year' },
    { name: 'severity', label: 'Typical storm size', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 0.85, unit: '× design storm' },
    { name: 'variability', label: 'Storm-to-storm spread', type: 'range', min: 0, max: 1.2, step: 0.05, default: 0.35, unit: 'σ (log)' },
    { name: 'correlation', label: 'Bad years run together', type: 'range', min: 0, max: 0.95, step: 0.05, default: 0.5, unit: 'ρ year to year' },
    { name: 'efficacy', label: 'Measure efficacy (when not linked to E02)', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, unit: 'share of loss avoided' },
    { name: 'capex_usd', label: 'Up-front cost', type: 'range', min: 0, max: 5000000, step: 25000, default: 400000, unit: 'US$' },
    { name: 'opex_usd_y', label: 'Running cost', type: 'range', min: 0, max: 200000, step: 1000, default: 10000, unit: 'US$/yr' },
    { name: 'discount', label: 'Discount rate', type: 'range', min: 0, max: 0.2, step: 0.005, default: 0.06, unit: 'per year' },
    { name: 'exposedValue_usd', label: 'Value exposed to water', type: 'range', min: 0, max: 20000000, step: 100000, default: 2000000, unit: 'US$' },
    { name: 'downtime_usd_h', label: 'Cost of closure', type: 'range', min: 0, max: 50000, step: 500, default: 8000, unit: 'US$/h' },
    { name: 'useE02', label: 'Use the E02 storm-size sweep as the hazard', type: 'toggle', default: true },
  ],
  outputs: [
    { name: 'mean', label: 'Mean net benefit', unit: 'US$' },
    { name: 'pPositive', label: 'Chance the measure pays off', unit: 'probability' },
    { name: 'esNB5', label: 'Average of the worst 5%', unit: 'US$' },
  ],
  recordInputs: ['hazardSource'],
  dependencies: ['E02'],
  feeds: ['E07'],
  seedStrategy: 'Path p draws from its own stream seeded by (seed, p). Both versions of a path see the same storms (common random numbers). Any path can be recomputed alone.',
  method: `<p>Each path is one possible future of <i>H</i> years for one investment: a fictional wetland share bought by a riverside hotel.</p>
<p class="eq">climate factor  xₜ = ρ·xₜ₋₁ + √(1−ρ²)·εₜ        εₜ ~ N(0,1)
storms per year nₜ ~ Poisson(λ)
storm size      m = exp(μ + σ(0.6·xₜ + 0.8·z)),  z ~ N(0,1),  μ = ln(severity) − σ²/2</p>
<p>So storms in the same year share part of their size, bad years tend to follow bad years when ρ is high, and the mean storm size equals the severity input.</p>
<p><b>Linked to E02:</b> the hotel's peak depth and hours above 0.2 m come from the E02 storm-size sweep, interpolated at <i>m</i> (linear between sweep points, scaled toward zero below the smallest, extended linearly above the largest). Both versions use the same storm. <b>Not linked:</b> depth = ${REF_DEPTH_M} m × m, and the measure removes the chosen share of the loss.</p>
<p>Loss per storm = exposed value × damage share(depth) + closure cost × hours. The damage share is a fictional curve: 0 below 5 cm, then ((d − 0.05)/1.5)^0.8, capped at 1.</p>
<p class="eq">net benefit = Σₜ (loss todayₜ − loss with measureₜ − running cost) / (1+r)ᵗ − up-front cost</p>
<p>Reported: mean, median, 5% and 95% quantiles (type 7: linear between order statistics), chance of a positive net benefit, the average of the worst 5% of net benefits, and expected shortfall of losses (mean of the worst 5% of present-value losses, each version).</p>`,
  limitations: [
    'The spread comes from assumed numbers you can edit. It is a sample of a made-up model, not a calibrated probability of loss.',
    'The damage curve and costs are fictional and illustrative, not actuarial data.',
    'Assumptions, not a recommendation: whether to buy is a human choice.',
    'Storms in the model change only the hotel; other assets and indirect effects are left out.',
  ],
  provenance: [],
  whoPays: {
    buyer: 'Insurers, engineers, developers',
    why: 'Thousands of matched futures for one decision: the middle, the spread and the bad tail, on identical storms.',
    benefit: 'Fewer losses from water, through better siting and building. No scoring of individual people.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E03"].ex-stage { background: radial-gradient(ellipse at 30% 0%, color-mix(in srgb, var(--violet) 14%, transparent), transparent 60%), var(--bg); }
[data-ex="E03"] .loom { position: relative; flex: 1; min-height: 0; }
[data-ex="E03"] .loom canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
[data-ex="E03"] .drill { position: absolute; right: 10px; top: 10px; width: min(300px, 46%); max-height: calc(100% - 20px); overflow: auto; background: color-mix(in srgb, var(--panel-solid) 92%, transparent); border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; font-size: 0.82rem; }
[data-ex="E03"] .drill table { width: 100%; border-collapse: collapse; }
[data-ex="E03"] .drill td, [data-ex="E03"] .drill th { padding: 2px 4px; text-align: right; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
[data-ex="E03"] .drill td:first-child, [data-ex="E03"] .drill th:first-child { text-align: left; }
[data-ex="E03"] .linkstate { font-size: 0.88rem; }
[data-ex="E03"] progress { width: 100%; accent-color: var(--dawn); }
`;

export function mount(slots, ctx) {
  const { h, controlPanel, transport, metricGrid, note, sectionTitle, fmt, fmtMoney, fmtPct, token, button } = ctx.ui;
  const defaults = Object.fromEntries(meta.inputs.map((i) => [i.name, i.default]));
  const v = { ...defaults, ...(ctx.initial ? ctx.initial.inputs : {}) };
  if (ctx.compact) v.paths = 1000;
  let seed = ctx.initial ? ctx.initial.seed : 20261125;

  const canvas = h('canvas', { role: 'img', tabindex: '0', 'aria-label': 'The loom: each thin line is one possible future of cumulative net benefit over the years; green ends above zero, rose below. The bright line is the median, the band covers the middle 90%. Click a line to inspect it.' });
  const drill = h('div', { class: 'drill', hidden: true });
  slots.stage.append(h('div', { class: 'loom' }, canvas, drill));

  const tp = transport({
    seed, running: false, runLabel: 'Weave', hideStep: true,
    onToggle: () => run(),
    onReset: () => {
      panel.setAll(defaults);
      Object.assign(v, defaults);
      run();
    },
    onReplay: () => run(),
    onSeed: (s) => {
      seed = s;
      run();
    },
  });
  slots.controls.append(tp.el);
  const linkBox = h('div', { class: 'linkstate' });
  const prog = h('progress', { max: 1, value: 0, hidden: true });
  slots.controls.append(linkBox, prog);
  const shown = ctx.compact ? meta.inputs.filter((i) => ['freq_per_y', 'capex_usd', 'useE02'].includes(i.name)) : meta.inputs;
  const yearDef = { name: 'year', label: 'Look at year', type: 'range', min: 0, max: 30, step: 1, default: 20, unit: 'year', integer: true };
  const local = { year: v.horizon_y };
  const yearCtl = controlPanel(slots.controls, [yearDef], local, () => draw());
  slots.controls.append(sectionTitle('Assumptions (editable, hypothetical)'));
  const panel = controlPanel(slots.controls, shown, v, (name) => {
    if (name === 'horizon_y') {
      local.year = v.horizon_y;
      yearCtl.set('year', v.horizon_y);
    }
    schedule();
  });

  const mg = metricGrid(slots.metrics, [
    { name: 'mean', label: 'Mean net benefit', money: true },
    { name: 'median', label: 'Median', money: true },
    { name: 'p', label: 'Chance it pays off', pct: true },
    { name: 'q05', label: '5% quantile', money: true },
    { name: 'q95', label: '95% quantile', money: true },
    { name: 'es', label: 'Worst 5% average', money: true },
    { name: 'lb', label: 'Losses today (PV, mean)', money: true },
    { name: 'la', label: 'Losses with measure (PV, mean)', money: true },
    { name: 'eslb', label: 'Expected shortfall today', money: true, help: 'Mean of the worst 5% of present-value losses' },
  ]);
  const hist = ctx.chart.chartBox(slots.metrics, { title: 'Net benefit at the horizon, all paths', height: 150 });
  const info = h('p', { class: 'small muted' });
  slots.metrics.append(info);

  let result = null, hazardUsed = null, hazardSource = 'none', job = null, timer = null, weave = 1, selected = -1, lastElapsed = 0;

  function linkState() {
    const st = ctx.scenario.resultStatus('E02', 'hydro');
    linkBox.replaceChildren();
    if (!v.useE02) {
      linkBox.append(note('Not linked: the efficacy slider sets how much loss the measure removes.'));
      return null;
    }
    if (st.state === 'missing' || !st.result.data.curve) {
      linkBox.append(note('No E02 sweep yet, so the efficacy slider stands in. Run E02 (it runs the sweep when the storm finishes) to link the two.', 'amber'),
        h('a', { href: '#e02', class: 'btn small' }, 'Open E02'));
      return null;
    }
    if (st.state === 'stale') {
      linkBox.append(note('The E02 sweep is stale: its inputs changed after it ran. Using the efficacy slider until E02 runs again.', 'amber'));
      return null;
    }
    linkBox.append(note(`Linked: hotel depths come from the E02 sweep (${st.result.data.curve.length} storm sizes, scenario hash ${st.result.inputHash.slice(0, 8)}). Efficacy slider not used.`));
    return { hazard: hazardFromSweep(st.result.data.curve), source: 'E02 sweep ' + st.result.inputHash.slice(0, 8) };
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 180);
  }

  function run() {
    if (job) job.cancel();
    const link = linkState();
    hazardUsed = link ? link.hazard : null;
    hazardSource = link ? link.source : 'efficacy slider';
    const config = { ...v };
    delete config.useE02;
    prog.hidden = false;
    prog.value = 0;
    tp.setRunning(true);
    const t0 = performance.now();
    job = ctx.runJob('e03.loom', { config, seed, hazard: hazardUsed }, { onProgress: (p) => (prog.value = p) });
    const mine = job;
    job.promise.then((r) => {
      if (mine !== job) return; // a newer run replaced this one
      result = r.result;
      lastElapsed = r.elapsedMs;
      selected = -1;
      drill.hidden = true;
      weave = ctx.reducedMotion() ? 1 : 0;
      const s = result.stats;
      mg.set('mean', s.mean, { tone: s.mean > 0 ? 'good' : 'bad' });
      mg.set('median', s.median);
      mg.set('p', s.pPositive);
      mg.set('q05', s.q05);
      mg.set('q95', s.q95);
      mg.set('es', s.esNB5, { tone: s.esNB5 < 0 ? 'bad' : '' });
      mg.set('lb', s.meanLossBase);
      mg.set('la', s.meanLossAlt);
      mg.set('eslb', s.esLossBase5);
      info.textContent = `${s.paths.toLocaleString()} paths × ${result.horizon} years in ${fmt(r.elapsedMs, 0)} ms (${r.where}${r.cached ? ', reused' : ''}). Hazard: ${hazardSource}. Mean ± 1 standard error: ${fmtMoney(s.mean)} ± ${fmtMoney(s.stdErrMean)}.`;
      ctx.scenario.putResult('E03', { inputHash: ctx.scenario.inputHash('hydro') + ':' + seed, data: { stats: s, config, hazardSource, seed, linked: !!hazardUsed }, elapsedMs: r.elapsedMs, where: r.where });
      drawHist();
      ctx.announce(`${fmtPct(s.pPositive, 0)} of ${s.paths} futures pay off; mean ${fmtMoney(s.mean)}.`, 'quiet');
    }).catch((e) => {
      if (!e.cancelled) ctx.announce('Loom failed: ' + e.message, 'error');
    }).finally(() => {
      if (mine === job) {
        prog.hidden = true;
        tp.setRunning(false);
      }
    });
  }

  function drawHist() {
    if (!result) return;
    const nb = result.nb;
    let lo = Infinity, hi = -Infinity;
    for (const x of nb) {
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    const neg = [], pos = [];
    for (const x of nb) (x > 0 ? pos : neg).push(x);
    const bins = 40;
    const hn = histogram(neg, bins, lo, hi), hp = histogram(pos, bins, lo, hi);
    hist.draw(() => ctx.chart.drawHistogram(hist.canvas, {
      series: [{ ...hn, color: token('--rose') }, { ...hp, color: token('--jade') }],
      xLabel: 'US$ net benefit', marks: [{ x: 0, label: '0', color: token('--fg') }, { x: result.stats.median, label: 'median', color: token('--dawn') }],
    }));
    const all = histogram(nb, bins, lo, hi);
    ctx.chart.dataTable(hist.text, ['From (US$)', 'To (US$)', 'Paths'], all.counts.map((c, i) => [Math.round(all.lo + i * all.width), Math.round(all.lo + (i + 1) * all.width), c]));
  }

  function geometry() {
    const W = canvas.width, H = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const L = 64 * dpr, R = Math.max(70 * dpr, W * 0.16), T = 22 * dpr, B = 34 * dpr;
    return { W, H, dpr, L, R, T, B };
  }

  function draw() {
    const g = canvas.getContext('2d');
    const { W, H, dpr, L, R, T, B } = geometry();
    g.clearRect(0, 0, W, H);
    if (!result) {
      g.fillStyle = token('--muted');
      g.font = `${14 * dpr}px ${token('--font-text')}`;
      g.fillText('Weaving…', L, T + 20 * dpr);
      return;
    }
    const Hy = result.horizon, P = result.paths, cum = result.cum;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < cum.length; i++) {
      if (cum[i] < lo) lo = cum[i];
      if (cum[i] > hi) hi = cum[i];
    }
    if (hi - lo < 1) hi = lo + 1;
    const px = (t) => L + (t / Hy) * (W - L - R);
    const py = (y) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
    // grid and axes
    g.strokeStyle = token('--grid');
    g.fillStyle = token('--muted');
    g.lineWidth = dpr;
    g.font = `${11 * dpr}px ${token('--font-data')}`;
    const span = hi - lo;
    const stepRaw = span / 5;
    const mag = 10 ** Math.floor(Math.log10(stepRaw));
    const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= stepRaw);
    for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) {
      g.beginPath();
      g.moveTo(L, py(y));
      g.lineTo(W - R, py(y));
      g.stroke();
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText(fmtMoney(y), L - 6 * dpr, py(y));
    }
    for (let t = 0; t <= Hy; t += 5) {
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(`yr ${t}`, px(t), H - B + 8 * dpr);
    }
    g.strokeStyle = token('--fg');
    g.globalAlpha = 0.5;
    g.beginPath();
    g.moveTo(L, py(0));
    g.lineTo(W - R, py(0));
    g.stroke();
    g.globalAlpha = 1;
    // threads, revealed left to right while weaving
    const reveal = Hy * Math.min(1, weave);
    const maxDraw = 2500;
    const stride = Math.max(1, Math.ceil(P / maxDraw));
    const alpha = Math.min(0.4, 70 / Math.min(P, maxDraw));
    g.lineWidth = 1 * dpr;
    g.globalCompositeOperation = 'lighter';
    const cg = token('--jade'), cr = token('--rose');
    for (let p = 0; p < P; p += stride) {
      const o = p * (Hy + 1);
      g.strokeStyle = cum[o + Hy] > 0 ? cg : cr;
      g.globalAlpha = alpha;
      g.beginPath();
      g.moveTo(px(0), py(cum[o]));
      const end = Math.floor(reveal);
      for (let t = 1; t <= end; t++) g.lineTo(px(t), py(cum[o + t]));
      if (reveal > end && end < Hy) {
        const f = reveal - end;
        g.lineTo(px(end + f), py(cum[o + end] + f * (cum[o + end + 1] - cum[o + end])));
      }
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    // band and median
    const band = result.band.filter((b) => b[0] <= reveal);
    g.strokeStyle = token('--dawn');
    g.lineWidth = 3 * dpr;
    g.beginPath();
    band.forEach((b, i) => (i ? g.lineTo(px(b[0]), py(b[2])) : g.moveTo(px(b[0]), py(b[2]))));
    g.stroke();
    g.setLineDash([5 * dpr, 4 * dpr]);
    g.lineWidth = 1.5 * dpr;
    for (const k of [1, 3]) {
      g.beginPath();
      band.forEach((b, i) => (i ? g.lineTo(px(b[0]), py(b[k])) : g.moveTo(px(b[0]), py(b[k]))));
      g.stroke();
    }
    g.setLineDash([]);
    // cloth: horizontal histogram of the selected year
    const yr = Math.min(Hy, local.year);
    const col = new Float64Array(P);
    for (let p = 0; p < P; p++) col[p] = cum[p * (Hy + 1) + yr];
    const bins = 48;
    const counts = new Array(bins).fill(0);
    for (const x of col) counts[Math.min(bins - 1, Math.max(0, Math.floor(((x - lo) / (hi - lo)) * bins)))]++;
    const cmax = Math.max(...counts);
    const x0 = W - R + 10 * dpr, wmax = R - 18 * dpr;
    for (let k = 0; k < bins; k++) {
      const y1 = py(lo + ((k + 1) / bins) * (hi - lo)), y0 = py(lo + (k / bins) * (hi - lo));
      const mid = lo + ((k + 0.5) / bins) * (hi - lo);
      g.fillStyle = mid > 0 ? cg : cr;
      g.globalAlpha = 0.85;
      g.fillRect(x0, y1 + 0.5, (counts[k] / cmax) * wmax * Math.min(1, weave), Math.max(1, y0 - y1 - 1));
    }
    g.globalAlpha = 1;
    if (weave >= 1) {
      g.strokeStyle = token('--fg');
      g.setLineDash([3 * dpr, 3 * dpr]);
      g.beginPath();
      g.moveTo(px(yr), T);
      g.lineTo(px(yr), H - B);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = token('--fg');
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText(`year ${yr}`, px(yr), T);
    }
    if (selected >= 0) {
      const o = selected * (Hy + 1);
      g.strokeStyle = token('--fg');
      g.lineWidth = 2.5 * dpr;
      g.beginPath();
      for (let t = 0; t <= Hy; t++) {
        if (t) g.lineTo(px(t), py(cum[o + t]));
        else g.moveTo(px(0), py(cum[o]));
      }
      g.stroke();
    }
    g.fillStyle = token('--muted');
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = `${11 * dpr}px ${token('--font-text')}`;
    g.fillText(`cumulative discounted net benefit · ${P > maxDraw ? `showing ${Math.ceil(P / stride).toLocaleString()} of ${P.toLocaleString()} threads` : `${P.toLocaleString()} threads`}`, L + 4 * dpr, 4 * dpr);
    canvas._geo = { px, py, lo, hi, L, R, W, Hy };
  }

  function pick(clientX, clientY) {
    if (!result || !canvas._geo) return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const x = (clientX - r.left) * dpr, y = (clientY - r.top) * dpr;
    const { px, py, L, R, W, Hy } = canvas._geo;
    if (x < L || x > W - R) return;
    const t = Math.round(((x - L) / (W - L - R)) * Hy);
    let best = -1, bd = Infinity;
    const cum = result.cum;
    for (let p = 0; p < result.paths; p++) {
      const d = Math.abs(py(cum[p * (Hy + 1) + t]) - y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (bd < 14 * dpr) showPath(best);
  }

  function showPath(p) {
    selected = p;
    const config = { ...v };
    const r = simulatePath(config, seed, p, hazardUsed, true);
    const rows = r.events.filter((e) => e.storms.length);
    drill.hidden = false;
    drill.replaceChildren(
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '6px' } }, h('b', {}, `Future #${p + 1}`), button('Close', () => {
        selected = -1;
        drill.hidden = true;
        draw();
      }, { kind: 'small ghost' })),
      h('p', {}, `Net benefit ${fmtMoney(r.nb)} · ${rows.length} storm years of ${v.horizon_y}`),
      h('table', {}, h('thead', {}, h('tr', {}, ['Year', 'Storms', 'Loss today', 'With measure'].map((c) => h('th', {}, c)))),
        h('tbody', {}, rows.map((e) => h('tr', {}, h('td', {}, String(e.year)), h('td', {}, e.storms.map((s) => '×' + fmt(s.m, 2)).join(' ')), h('td', {}, fmtMoney(e.lossBase)), h('td', {}, fmtMoney(e.lossAlt))))))
    );
    draw();
  }

  canvas.addEventListener('pointerup', (e) => pick(e.clientX, e.clientY));
  canvas.addEventListener('keydown', (e) => {
    if (!result) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      local.year = Math.max(0, Math.min(result.horizon, local.year + (e.key === 'ArrowRight' ? 1 : -1)));
      yearCtl.set('year', local.year);
      draw();
    } else if (e.key === 'Enter') {
      // Inspect the path closest to the median at the horizon.
      const H = result.horizon;
      let best = 0, bd = Infinity;
      for (let p = 0; p < result.paths; p++) {
        const d = Math.abs(result.cum[p * (H + 1) + H] - result.stats.median);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      showPath(best);
    }
  });
  ctx.ui.fitCanvas(canvas, draw);
  const loop = ctx.loop((dt) => {
    if (weave < 1) {
      weave = Math.min(1, weave + dt / 1.6);
      draw();
    }
  });
  loop.start();
  const unsub = ctx.scenario.subscribe((s, change) => {
    if (change.path === 'result:E02' || change.path.startsWith('hydro') || change.path === '*' || change.path === 'seed') {
      linkState();
      if (v.useE02) schedule();
    }
  });
  ctx.onCleanup(unsub);
  run();

  return {
    getRecord() {
      const s = result ? result.stats : null;
      const m = (name, val, unit, note) => ({ name, value: val, unit, note });
      return {
        inputs: { ...v, hazardSource },
        seed,
        metrics: s ? [
          m('Mean net benefit', s.mean, 'USD'), m('Median net benefit', s.median, 'USD', 'quantile type 7'),
          m('5% quantile', s.q05, 'USD'), m('95% quantile', s.q95, 'USD'), m('Probability net benefit > 0', s.pPositive, 'probability'),
          m('Mean of worst 5% net benefit', s.esNB5, 'USD'), m('Mean PV loss today', s.meanLossBase, 'USD'), m('Mean PV loss with measure', s.meanLossAlt, 'USD'),
          m('Expected shortfall 5% of loss today', s.esLossBase5, 'USD'), m('Expected shortfall 5% of loss with measure', s.esLossAlt5, 'USD'),
          m('Standard error of the mean', s.stdErrMean, 'USD'),
        ] : [],
        diagnostics: { paths: v.paths, horizon: v.horizon_y, linked: !!hazardUsed, fps: loop.fps },
        elapsedMs: lastElapsed,
      };
    },
    getTable() {
      if (!result) return { columns: ['year'], rows: [] };
      return { columns: ['year', 'q05_cum_net_benefit_usd', 'median_cum_net_benefit_usd', 'q95_cum_net_benefit_usd'], rows: result.band };
    },
    destroy() {
      clearTimeout(timer);
    },
  };
}
