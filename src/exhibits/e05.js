// E05 Minimum Knowledge (privacy-budget experiment)
import { METHOD_VERSION, TOTAL_EPSILON, DISTRICTS, BANDS, RULES, population, Ledger, release, trueCounts, canonical } from '../kernels/e05.js';

export const meta = {
  id: 'E05',
  title: 'Minimum Knowledge',
  subtitle: 'privacy-budget experiment',
  priority: 'P0',
  kind: 'analysis',
  dataStatus: 'SYNTHETIC',
  methodVersion: METHOD_VERSION,
  blurb: 'Records stay in the box. Only noisy totals come out, each answer spends budget, and the box stops when it runs out.',
  inputs: [
    { name: 'groupBy', label: 'Question: count people', type: 'segmented', options: [
      { value: 'district', label: 'by district' }, { value: 'band', label: 'by delivery band' }, { value: 'district×band', label: 'by district × band' },
      { value: 'village', label: 'by village' }, { value: 'religion', label: 'by religion' }], default: 'district' },
    { name: 'epsilon', label: 'Privacy spend ε for this answer', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.5, unit: 'ε' },
    { name: 'population', label: 'Fictional people in the box', type: 'range', min: 500, max: 20000, step: 500, default: 5000, unit: 'people', integer: true },
  ],
  outputs: [{ name: 'spent', label: 'Budget spent', unit: 'ε' }],
  recordInputs: ['scope'],
  dependencies: [],
  feeds: ['E07'],
  seedStrategy: 'The seed makes the fictional people. Each answer’s noise comes from a stream keyed by the seed and the canonical question, so a repeated question gets the same answer.',
  method: `<p>The box holds fictional people. Each one sits in exactly one cell of a district × weekly-delivery-band table, so adding or removing one person changes one count by one: the L1 sensitivity of any grouping of these cells is 1.</p>
<p>An answer adds independent Laplace noise to every count:</p>
<p class="eq">released = true count + Laplace(0, 1/ε)        95% interval: ± ln(20)/ε</p>
<p>Negative results are set to zero afterwards; that is post-processing and spends nothing. Answers compose by simple addition: the box has a total of ε = ${TOTAL_EPSILON}, and each answer spends its ε. Three answers at ε = 1 use it all; the fourth is refused.</p>
<p>The ledger reserves budget and then commits it in one step, so two questions sent at the same moment cannot both take the last of it. A question asked again in the same canonical form (same grouping, same ε) gets the stored answer and spends nothing.</p>
<p>Refusals come from fixed public rules written before any data: groupings finer than district, households, and categories outside the schema (religion, ethnicity) are refused whatever the counts are. Small counts are not hidden by looking at them first, since that would itself leak.</p>
<p>“New fictional experiment” makes a new box of new fictional people with a new budget. It does not reset anything real.</p>`,
  limitations: [
    'A teaching model of differential privacy on synthetic people. This page is not a production privacy mechanism and its ledger lives only in this browser tab.',
    'Simple sequential composition; tighter accounting methods exist.',
    'The privacy unit is one fictional person with one row. Real data with several rows per person needs bounded contributions first.',
    'Totals can still reveal patterns about places. Real releases need a review of the geography as well as the budget.',
  ],
  provenance: [{ source: 'NIST SP 800-226, Guidelines for Evaluating Differential Privacy Guarantees', version: 'final, March 2025', license: 'US Government work', attribution: 'Used as a reading reference for the privacy unit and composition; no code taken.' }],
  whoPays: {
    buyer: 'Data owners and private analytics',
    why: 'Answers from sensitive records without handing the records over.',
    benefit: 'Less need to share raw data at all.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E05"].ex-stage { background: var(--bg); }
[data-ex="E05"] .split { flex: 1; min-height: 0; display: grid; grid-template-columns: 1.1fr 1fr; gap: 10px; padding: 10px; }
[data-ex="E05"] .pane { position: relative; min-width: 0; min-height: 0; border-radius: 16px; border: 1px solid var(--line); background: var(--bg-2); overflow: hidden; }
[data-ex="E05"] .pane.vault { border: 2px solid var(--rose); }
[data-ex="E05"] .pane canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
[data-ex="E05"] .ptag { position: absolute; left: 10px; top: 8px; font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; pointer-events: none; }
[data-ex="E05"] .budget { display: flex; gap: 6px; align-items: center; padding: 0 10px 10px; }
[data-ex="E05"] .tok { flex: 1; height: 16px; border-radius: 99px; background: var(--bg-2); border: 1px solid var(--line); overflow: hidden; position: relative; }
[data-ex="E05"] .tok > i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, var(--dawn), var(--rose)); transition: width .4s; }
[data-ex="E05"] .budget b { font-family: var(--font-data); white-space: nowrap; }
[data-ex="E05"] .log { font-size: 0.85rem; display: grid; gap: 4px; }
[data-ex="E05"] .log .row { padding: 5px 8px; border-radius: 8px; background: var(--bg-2); border-left: 3px solid var(--jade); }
[data-ex="E05"] .log .row.no { border-left-color: var(--danger); } /* stylecheck: allow — CSS token name */
[data-ex="E05"] .log .row.dup { border-left-color: var(--violet); }
[data-ex="E05"] pre { font-size: 0.75rem; max-height: 200px; overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 6px; }
@media (max-width: 860px) { [data-ex="E05"] .split { grid-template-columns: 1fr 1fr; gap: 6px; padding: 6px; } }
`;

export function mount(slots, ctx) {
  const { h, controlPanel, transport, metricGrid, sectionTitle, fmt, button, token, toggle } = ctx.ui;
  const defaults = Object.fromEntries(meta.inputs.map((i) => [i.name, i.default]));
  const v = { ...defaults, ...(ctx.initial ? ctx.initial.inputs : {}) };
  let seed = ctx.initial ? ctx.initial.seed : 20261125;
  let scopeN = 1;
  let pop = population(seed, v.population);
  let ledger = new Ledger(TOTAL_EPSILON, 'scope-' + scopeN);
  let last = null;
  let lastReq = null;
  let peek = false;
  const log = [];

  const vaultC = h('canvas', { role: 'img', 'aria-label': 'The box at the source: one dot per fictional person, grouped by district and coloured by delivery band. The dots stay inside.' });
  const outC = h('canvas', { role: 'img', 'aria-label': 'What leaves: noisy counts for the last answer, with 95% intervals.' });
  const toks = [0, 1, 2].map(() => h('i', { style: { width: '0%' } }));
  const budgetLbl = h('b', {});
  slots.stage.append(
    h('div', { class: 'split' },
      h('div', { class: 'pane vault' }, vaultC, h('span', { class: 'ptag' }, '🔒 Stays at the source')),
      h('div', { class: 'pane' }, outC, h('span', { class: 'ptag' }, 'What leaves'))),
    h('div', { class: 'budget', role: 'meter', 'aria-label': 'Privacy budget spent', 'aria-valuemin': 0, 'aria-valuemax': TOTAL_EPSILON }, h('span', { class: 'small' }, 'Budget'), toks.map((i) => h('span', { class: 'tok' }, i)), budgetLbl));

  const tp = transport({
    seed, running: false, runLabel: 'Ask', hideStep: true,
    onToggle: () => ask(),
    onReset: () => newScope(),
    onReplay: () => ask(),
    onSeed: (s) => {
      seed = s;
      newScope();
    },
  });
  slots.controls.append(tp.el);
  const panel = controlPanel(slots.controls, ctx.compact ? meta.inputs.filter((i) => i.name !== 'population') : meta.inputs, v, (name) => {
    if (name === 'population') newScope();
  });
  slots.controls.append(h('div', { class: 'btnrow' },
    button('Ask twice at the same moment', () => askTwice(), { kind: 'small', title: 'Sends the same question twice together; the ledger answers both from one spend' }),
    button('New fictional experiment', () => newScope(), { kind: 'small' })));
  slots.controls.append(toggle({ name: 'peek', label: 'Show the true counts (possible only because these people are fictional)' }, false, (on) => {
    peek = on;
    drawOut();
  }).el);

  const mg = metricGrid(slots.metrics, [
    { name: 'spent', label: 'Budget spent', unit: `of ε ${TOTAL_EPSILON}` },
    { name: 'left', label: 'Left', unit: 'ε' },
    { name: 'answers', label: 'Answers given', digits: 0 },
    { name: 'width', label: '95% interval ±', unit: 'people' },
    { name: 'err', label: 'Mean error of last answer', unit: 'people', help: 'Computable only because the data is fictional' },
    { name: 'people', label: 'People in the box', digits: 0 },
  ]);
  const logBox = h('div', { class: 'log', 'aria-live': 'polite' });
  const reqPre = h('pre', {});
  const resPre = h('pre', {});
  slots.metrics.append(sectionTitle('Answers'), logBox, sectionTitle('Last request, as sent'), reqPre, sectionTitle('Last response, as returned'), resPre);

  function newScope() {
    scopeN++;
    pop = population(seed, v.population);
    ledger = new Ledger(TOTAL_EPSILON, 'scope-' + scopeN);
    last = null;
    log.length = 0;
    ctx.announce('New fictional experiment: new people, full budget.');
    update();
  }

  function request() {
    return { purpose: 'regional service planning (fictional)', region: 'fictional-region-1', groupBy: v.groupBy, epsilon: v.epsilon, scope: ledger.scope };
  }

  function ask() {
    lastReq = request();
    const r = release(pop, ledger, { groupBy: v.groupBy, epsilon: v.epsilon }, seed);
    record(r);
  }

  function askTwice() {
    lastReq = request();
    const q = { groupBy: v.groupBy, epsilon: v.epsilon };
    Promise.all([Promise.resolve().then(() => release(pop, ledger, q, seed)), Promise.resolve().then(() => release(pop, ledger, q, seed))]).then(([a, b]) => {
      record(a);
      record(b);
      ctx.announce(`Two at once: ${a.ok && !a.duplicate ? 'first spent ε ' + v.epsilon : a.ok ? 'first reused' : 'first refused'}; ${b.duplicate ? 'second reused the same answer, spending nothing' : b.ok ? 'second spent' : 'second refused'}.`);
    });
  }

  function record(r) {
    const label = `${RULES.allowed[v.groupBy] || 'by ' + v.groupBy}, ε ${v.epsilon}`;
    if (r.ok) {
      last = r.release;
      log.unshift({ cls: r.duplicate ? 'dup' : '', text: r.duplicate ? `${label}: same question as before, same answer, nothing spent` : `${label}: answered, spent ε ${v.epsilon}` });
    } else {
      log.unshift({ cls: 'no', text: `${label}: ${r.reason}` });
      ctx.announce(r.reason, 'error');
    }
    resPre.textContent = JSON.stringify(r.ok ? r.release : { refused: r.reason }, null, 1);
    reqPre.textContent = JSON.stringify(lastReq, null, 1);
    update();
  }

  function update() {
    const spent = ledger.spent;
    toks.forEach((t, i) => (t.style.width = Math.max(0, Math.min(1, spent - i)) * 100 + '%'));
    budgetLbl.textContent = `ε ${fmt(spent, 2)} / ${TOTAL_EPSILON}`;
    mg.set('spent', spent, { tone: spent >= TOTAL_EPSILON - 1e-9 ? 'bad' : '' });
    mg.set('left', Math.max(0, ledger.remaining()));
    mg.set('answers', ledger.log.length);
    mg.set('people', pop.n);
    if (last) {
      mg.set('width', last.bins[0].interval95);
      const truth = trueCounts(pop, last.query.groupBy);
      mg.set('err', truth.reduce((s, b, i) => s + Math.abs(b.count - last.bins[i].noisyCount), 0) / truth.length);
    } else {
      mg.set('width', null, { text: '—' });
      mg.set('err', null, { text: '—' });
    }
    logBox.replaceChildren(...log.slice(0, 8).map((l) => h('div', { class: 'row ' + l.cls }, l.text)));
    if (!lastReq) reqPre.textContent = JSON.stringify(request(), null, 1);
    drawVault();
    drawOut();
  }

  let pulse = 0;
  function drawVault() {
    const g = vaultC.getContext('2d');
    const W = vaultC.width, H = vaultC.height;
    if (!W) return;
    g.clearRect(0, 0, W, H);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cols = 4, rows = 2, pad = 8 * dpr, top = 26 * dpr, foot = 16 * dpr;
    const cw = (W - pad * (cols + 1)) / cols, ch = (H - top - foot - pad * (rows + 1)) / rows;
    const colors = [token('--muted'), token('--water'), token('--jade'), token('--dawn'), token('--rose')];
    const rng = ctx.rng(seed, 'dots');
    g.font = `${10 * dpr}px ${token('--font-text')}`;
    for (let d = 0; d < DISTRICTS.length; d++) {
      const cx = pad + (d % cols) * (cw + pad), cy = top + pad + Math.floor(d / cols) * (ch + pad);
      g.strokeStyle = token('--line');
      g.lineWidth = dpr;
      g.strokeRect(cx, cy, cw, ch);
      g.fillStyle = token('--muted');
      g.fillText(DISTRICTS[d], cx + 4 * dpr, cy + 12 * dpr);
      const r = Math.max(0.8, Math.min(2.2, Math.sqrt((cw * ch) / (pop.n / 8)) * 0.22)) * dpr;
      for (let b = 0; b < BANDS.length; b++) {
        const n = pop.cells[d * BANDS.length + b];
        g.fillStyle = colors[b];
        for (let k = 0; k < n; k++) {
          const x = cx + 4 * dpr + rng.uniform() * (cw - 8 * dpr);
          const y = cy + 18 * dpr + rng.uniform() * (ch - 22 * dpr);
          g.fillRect(x, y, r, r);
        }
      }
    }
    g.fillStyle = token('--muted');
    g.textAlign = 'left';
    g.fillText(`${pop.n.toLocaleString()} fictional people · colour = weekly deliveries ${BANDS.join(' / ')}`, 10 * dpr, H - 6 * dpr);
  }

  function drawOut() {
    const g = outC.getContext('2d');
    const W = outC.width, H = outC.height;
    if (!W) return;
    g.clearRect(0, 0, W, H);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.font = `${11 * dpr}px ${token('--font-text')}`;
    if (!last) {
      g.fillStyle = token('--muted');
      g.fillText('Nothing has left the box yet. Press Ask.', 12 * dpr, 50 * dpr);
      return;
    }
    const truth = trueCounts(pop, last.query.groupBy);
    const bins = last.bins;
    const n = bins.length;
    const top = 30 * dpr, bottom = 24 * dpr, left = 10 * dpr;
    const labelW = n > 10 ? 0 : 92 * dpr;
    const bh = (H - top - bottom) / n;
    const max = Math.max(...bins.map((b) => b.noisyCount + b.interval95), ...truth.map((t) => t.count)) || 1;
    const sx = (x) => left + labelW + (x / max) * (W - left - labelW - 16 * dpr);
    bins.forEach((b, i) => {
      const y = top + i * bh;
      g.fillStyle = token('--dawn');
      g.globalAlpha = 0.9;
      g.fillRect(sx(0), y + bh * 0.18, sx(b.noisyCount) - sx(0), bh * 0.64);
      g.globalAlpha = 1;
      g.strokeStyle = token('--fg');
      g.lineWidth = 1.2 * dpr;
      g.beginPath();
      g.moveTo(sx(Math.max(0, b.noisyCount - b.interval95)), y + bh / 2);
      g.lineTo(sx(b.noisyCount + b.interval95), y + bh / 2);
      g.stroke();
      if (peek) {
        g.strokeStyle = token('--rose');
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.moveTo(sx(truth[i].count), y + bh * 0.1);
        g.lineTo(sx(truth[i].count), y + bh * 0.9);
        g.stroke();
      }
      if (labelW) {
        g.fillStyle = token('--fg');
        g.textBaseline = 'middle';
        g.fillText(b.label, left, y + bh / 2);
      }
    });
    g.fillStyle = token('--muted');
    g.textBaseline = 'alphabetic';
    g.fillText(`${RULES.allowed[last.query.groupBy]} · ε ${last.query.epsilon} · white bar = 95% interval${peek ? ' · rose line = true count' : ''}`, 10 * dpr, H - 7 * dpr);
  }

  let pulsing = 0;
  ctx.ui.fitCanvas(vaultC, drawVault);
  ctx.ui.fitCanvas(outC, drawOut);
  update();
  if (ctx.compact) ask();

  return {
    getRecord() {
      const truth = last ? trueCounts(pop, last.query.groupBy) : [];
      return {
        inputs: { ...v, scope: ledger.scope },
        seed,
        metrics: [
          { name: 'Budget spent', value: ledger.spent, unit: 'epsilon' },
          { name: 'Budget left', value: Math.max(0, ledger.remaining()), unit: 'epsilon' },
          { name: 'Answers given', value: ledger.log.length, unit: 'count' },
          { name: 'Last answer 95% interval half-width', value: last ? last.bins[0].interval95 : null, unit: 'people' },
          { name: 'Last answer mean absolute error', value: last ? truth.reduce((s, b, i) => s + Math.abs(b.count - last.bins[i].noisyCount), 0) / truth.length : null, unit: 'people', note: 'fictional data only' },
        ],
        diagnostics: { scope: ledger.scope, log: ledger.log.map((l) => ({ eps: l.eps, at: l.at })) },
      };
    },
    getTable() {
      if (!last) return { columns: ['label', 'noisy_count', 'interval95'], rows: [] };
      return { columns: ['label', 'noisy_count', 'interval95'], rows: last.bins.map((b) => [b.label, b.noisyCount, b.interval95]) };
    },
    destroy() {},
  };
}
