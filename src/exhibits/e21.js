// E21 The Laboratory of Alternatives: compare candidate projects on typed 1 to 5 ratings. It orders; people decide.
import {
  CRITERIA, CRITERION_IDS, SEED_CANDIDATES, MAX_CANDIDATES, newCandidate, rank, sensitivity, sampleRatings, safetyFlag, blankRatings, validateWeights,
} from '../kernels/e21.js';

const defs = [
  ...CRITERIA.map((c) => ({ name: 'w_' + c.id, label: `Weight: ${c.label}`, type: 'range', min: 0, max: 10, step: 0.5, default: 1, unit: '', help: c.help })),
  { name: 'spread', label: 'How far weights may drift in the test', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, unit: '', help: '0 uses your weights as set. 1 draws weights at random.' },
];

export const meta = {
  id: 'E21',
  title: 'The Laboratory of Alternatives',
  subtitle: 'idea comparison',
  priority: 'P1',
  kind: 'decision',
  dataStatus: 'SYNTHETIC',
  methodVersion: 'e21-weighted-ratings-1.0.0',
  blurb: 'Rate candidate projects side by side and see how the order shifts when weights change.',
  inputs: defs.map(({ name, label, type, min, max, step, default: d, unit }) => ({ name, label, type, min, max, step, default: d, unit })),
  outputs: [
    { name: 'gap', label: 'Score gap between the first two', unit: 'points' },
    { name: 'firstShare', label: 'Share of weight tests with the same first place', unit: '' },
  ],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32. The seed draws the example ratings (one stream per concept and criterion) and the drifting weights in the sensitivity test.',
  method: `<p>Each concept gets a rating from 1 to 5 on six criteria, or leaves a criterion empty. A concept's score is the weighted mean of the criteria it has ratings for. Empty criteria are left out, not counted as zero.</p>
<p class="eq">score = Σ w[k] · r[k] ÷ Σ w[k]      (over rated criteria k)</p>
<p>The band around a score is an assumption: low confidence widens it by up to one rating point each way. Scores within 0.05 share a rank and are marked as tied.</p>
<p>Sensitivity: each of 2000 draws blends your weights with random weights (a flat Dirichlet draw). The blend share is the drift slider. The strip under each bar shows how often the concept lands at each rank. A second table drops each criterion, then doubles it, and shows whether first place changes.</p>
<p>The result has no winner field. It is an ordering of typed ratings. A safety concern is a separate flag. It stays on screen whatever the score and whatever the weight on trust and safety. A trust and safety rating of 2 or below also raises a notice.</p>
<p>Every concept is scored the same way. Origin and position do not enter the score. Example ratings are random draws, one stream per concept and criterion, so adding a concept does not change another concept's ratings. Sky Reach and Face Shield are concepts owned by their developers and appear with the same standing as the others.</p>`,
  limitations: [
    'A decision aid for people who type ratings. It is not a science model and it measures nothing about the concepts.',
    'Example ratings are random numbers (trust and safety draws run 3 to 5). They say nothing about Sky Reach, Face Shield, ARUN or any other concept.',
    'The confidence band is an assumption. Weighted means treat the 1 to 5 scale as even steps.',
    'The order depends on the people who rated. Different raters give different orders.',
  ],
  provenance: [],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E21"] .scroll { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px 18px; }
[data-ex="E21"] .safety { margin: 0; padding: 9px 14px; border-bottom: 2px solid var(--danger); background: color-mix(in srgb, var(--bg) 85%, var(--danger)); font-size: 0.92rem; }
[data-ex="E21"] .safety.clear { border-bottom-color: var(--line); background: transparent; color: var(--muted); }
[data-ex="E21"] .safety b { color: var(--danger); }
[data-ex="E21"] .order { margin: 0 0 8px; font-size: 0.95rem; }
[data-ex="E21"] .grid { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
[data-ex="E21"] .grid th, [data-ex="E21"] .grid td { padding: 4px 6px; border-bottom: 1px solid var(--line); text-align: center; }
[data-ex="E21"] .grid th:first-child, [data-ex="E21"] .grid td:first-child { text-align: left; }
[data-ex="E21"] .grid select { width: auto; min-width: 4.2em; padding: 4px 6px; }
[data-ex="E21"] .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; margin-top: 12px; }
[data-ex="E21"] .card { border: 1px solid var(--line); border-radius: var(--r-m); padding: 10px 12px; background: color-mix(in srgb, var(--bg-2) 70%, transparent); min-width: 0; }
[data-ex="E21"] .card.flag { border-color: var(--danger); }
[data-ex="E21"] .card h4 { margin: 0 0 2px; }
[data-ex="E21"] .card label { display: block; font-weight: 700; font-size: 0.85rem; margin-top: 8px; }
[data-ex="E21"] .card textarea, [data-ex="E21"] .card input[type=text] { width: 100%; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-s); padding: 6px 8px; min-height: 2.4em; resize: vertical; }
[data-ex="E21"] .card .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
[data-ex="E21"] .origin { font-size: 0.78rem; color: var(--muted); }
[data-ex="E21"] .addrow { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
[data-ex="E21"] .addrow input { flex: 1 1 160px; min-width: 0; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-s); padding: 6px 8px; }
`;

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'concept';

export function mount(slots, ctx) {
  const { ui, chart } = ctx;
  const { h } = ui;
  const values = {};
  for (const d of defs) values[d.name] = d.default;
  let seed = 2121;
  if (ctx.initial) {
    if (Number.isInteger(ctx.initial.seed)) seed = ctx.initial.seed;
    for (const [k, v] of Object.entries(ctx.initial.inputs || {})) if (k in values && typeof v === typeof values[k]) values[k] = v;
  }
  let cands = sampleRatings(SEED_CANDIDATES.map(newCandidate), seed);
  let result = null;
  let sens = null;
  let error = '';
  let draws = 2000;
  let counter = 0;
  const t0 = performance.now();

  const weights = () => Object.fromEntries(CRITERION_IDS.map((k) => [k, values['w_' + k]]));

  /* ----------------------------------------------------------------- stage */
  const safetyBox = h('p', { class: 'safety', role: 'status' }, '');
  const orderLine = h('p', { class: 'order' }, '');
  const gridHost = h('div', { class: 'scrollx' });
  const cardsHost = h('div', { class: 'cards' });
  const sensHost = h('div', {});
  const cb = chart.chartBox(h('div'), { title: 'Scores, bands and how often each concept takes each rank', height: 300 });
  const addIn = h('input', { type: 'text', maxlength: 60, placeholder: 'Name a concept to add', 'aria-label': 'New concept name' });
  const addBtn = ui.button('Add concept', () => {
    const name = addIn.value.trim();
    if (!name) return ctx.announce('Type a name first.', 'error');
    if (cands.length >= MAX_CANDIDATES) return ctx.announce(`At most ${MAX_CANDIDATES} concepts.`, 'error');
    counter++;
    cands.push(newCandidate({ id: `${slug(name)}-${counter}`, name, origin: 'team', ownerNote: 'Added in this session.' }));
    addIn.value = '';
    rebuild();
  }, { kind: 'small' });
  addIn.addEventListener('keydown', (e) => e.key === 'Enter' && addBtn.click());
  const scroll = h('div', { class: 'scroll' },
    orderLine, cb.el,
    h('h3', { class: 'ptitle' }, 'Ratings, 1 to 5 (leave empty if unrated)'), gridHost,
    h('div', { class: 'addrow' }, addIn, addBtn),
    h('h3', { class: 'ptitle' }, 'Notes, retelling and safety'), cardsHost,
    h('h3', { class: 'ptitle' }, 'Sensitivity of the order'), sensHost);
  slots.stage.append(safetyBox, scroll);
  const tk = (n) => ui.token(n);

  function drawChart() {
    const cv = cb.canvas;
    const W = cv.width;
    const H = cv.height;
    if (!W) return;
    const g = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.clearRect(0, 0, W, H);
    g.font = `${12 * dpr}px ${tk('--font-text') || 'sans-serif'}`;
    if (!result) {
      g.fillStyle = tk('--muted');
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(error || 'Nothing to order yet.', W / 2, H / 2);
      return;
    }
    const nameW = Math.min(150 * dpr, W * 0.32);
    const L = nameW + 10 * dpr;
    const Rr = 16 * dpr;
    const rowH = 52 * dpr;
    const x = (v) => L + ((v - 1) / 4) * (W - L - Rr);
    g.strokeStyle = tk('--grid');
    g.fillStyle = tk('--muted');
    g.textBaseline = 'top';
    g.textAlign = 'center';
    for (let v = 1; v <= 5; v++) {
      g.beginPath(); g.moveTo(x(v), 14 * dpr); g.lineTo(x(v), H - 4 * dpr); g.stroke();
      g.fillText(String(v), x(v), 0);
    }
    const rankCol = [tk('--jade'), tk('--water'), tk('--violet'), tk('--muted')];
    result.rows.forEach((r, i) => {
      const y = 22 * dpr + i * rowH;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = tk('--fg');
      let nm = r.name;
      const maxW = nameW - (r.safety.visible ? 18 * dpr : 0);
      while (g.measureText(nm).width > maxW && nm.length > 2) nm = nm.slice(0, -2) + '…';
      if (r.safety.visible) {
        g.fillStyle = tk('--danger'); // stylecheck: allow — CSS token name
        g.font = `bold ${13 * dpr}px ${tk('--font-text') || 'sans-serif'}`;
        g.fillText('▲', 2 * dpr, y + 12 * dpr);
        g.font = `${12 * dpr}px ${tk('--font-text') || 'sans-serif'}`;
      }
      g.fillStyle = tk('--fg');
      g.fillText(nm, r.safety.visible ? 18 * dpr : 2 * dpr, y + 12 * dpr);
      g.fillStyle = tk('--muted');
      g.fillText(r.rank === null ? 'no ratings' : `${r.tiedWithPrevious || r.tiedWithNext ? 'tied ' : 'rank '}${r.rank} · n=${r.rated}`, 2 * dpr, y + 30 * dpr);
      if (r.score === null) return;
      g.fillStyle = tk('--water');
      g.globalAlpha = 0.85;
      g.fillRect(L, y + 4 * dpr, x(r.score) - L, 16 * dpr);
      g.globalAlpha = 1;
      g.strokeStyle = tk('--dawn');
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.moveTo(x(r.band[0]), y + 12 * dpr); g.lineTo(x(r.band[1]), y + 12 * dpr);
      g.moveTo(x(r.band[0]), y + 7 * dpr); g.lineTo(x(r.band[0]), y + 17 * dpr);
      g.moveTo(x(r.band[1]), y + 7 * dpr); g.lineTo(x(r.band[1]), y + 17 * dpr);
      g.stroke();
      g.lineWidth = dpr;
      g.fillStyle = tk('--fg');
      g.textAlign = 'left';
      g.fillText(r.score.toFixed(2), Math.min(W - 40 * dpr, x(r.score) + 6 * dpr), y + 12 * dpr);
      const f = sens && sens.freq[r.id];
      if (f) {
        let cx = L;
        const total = W - L - Rr;
        f.forEach((p, k) => {
          g.fillStyle = rankCol[Math.min(k, 3)];
          g.globalAlpha = 0.8;
          g.fillRect(cx, y + 26 * dpr, p * total, 9 * dpr);
          cx += p * total;
        });
        g.globalAlpha = 1;
      }
    });
    g.fillStyle = tk('--muted');
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillText('Bar: score. Whisker: band set by confidence. Strip: share of drifting-weight tests at rank 1 (green), 2 (blue), 3 (violet), lower (grey).', L, H - 1);
  }

  /* ------------------------------------------------------------ computation */
  function update() {
    error = '';
    result = null;
    sens = null;
    // The safety line comes from the candidates themselves, so it shows even when ranking fails.
    const flags = cands.map((c) => ({ c, f: safetyFlag(c) })).filter((x) => x.f.visible);
    if (flags.length) {
      safetyBox.className = 'safety';
      safetyBox.replaceChildren(h('b', {}, `Safety: ${flags.length} open ${flags.length === 1 ? 'item' : 'items'}. `), ...flags.map((x, i) => h('span', {}, (i ? ' · ' : '') + x.c.name + ': ' + (x.f.concern ? (x.f.note || 'concern flagged, no note') : 'trust and safety rated ' + x.c.ratings.trust) + (x.f.concern && x.f.lowRating ? ' (also rated low)' : ''))));
    } else {
      safetyBox.className = 'safety clear';
      safetyBox.textContent = 'Safety: no open items flagged. Flag one on a concept card and it shows here whatever the scores say.';
    }
    try {
      validateWeights(weights());
      result = rank(cands, weights());
      sens = result.rows.some((r) => r.score !== null) ? sensitivity(cands, weights(), { draws, spread: values.spread }, seed) : null;
    } catch (e) {
      error = e.message;
      ctx.announce('Not ordered: ' + e.message, 'error');
    }
    renderOrder();
    renderMetrics();
    renderSens();
    const n = result ? result.rows.length : 0;
    cb.canvas.style.height = Math.max(120, 34 + n * 52) + 'px';
    cb.draw(drawChart);
    chart.dataTable(cb.text, ['Concept', 'Score', 'Band low', 'Band high', 'Rated of 6', 'First place share', 'Mean rank', 'Safety'],
      result ? result.rows.map((r) => [r.name, r.score === null ? '—' : r.score, r.band ? r.band[0] : '—', r.band ? r.band[1] : '—', r.rated, sens && sens.firstShare[r.id] !== undefined ? sens.firstShare[r.id] : '—', sens && sens.meanRank[r.id] !== undefined ? sens.meanRank[r.id] : '—', r.safety.visible ? 'open' : 'none flagged']) : []);
    cb.canvas.setAttribute('aria-label', result ? 'Scores by concept: ' + result.rows.map((r) => `${r.name} ${r.score === null ? 'not rated' : r.score.toFixed(2)}${r.safety.visible ? ', safety item open' : ''}`).join('; ') : 'No ordering');
  }

  function renderOrder() {
    if (!result) {
      orderLine.textContent = error ? 'Not ordered: ' + error + '.' : '';
      return;
    }
    const sc = result.rows.filter((r) => r.score !== null);
    orderLine.replaceChildren(h('b', {}, 'Order under your weights: '),
      sc.length ? sc.map((r, i) => `${i ? (r.tiedWithPrevious ? ' = ' : ' › ') : ''}${r.name} ${r.score.toFixed(2)}`).join('') : 'no ratings yet', '. ',
      h('span', { class: 'muted' }, result.note));
  }

  const metrics = ui.metricGrid(slots.metrics, [
    { name: 'concepts', label: 'Concepts', digits: 0 },
    { name: 'rated', label: 'Ratings given', unit: 'of cells', digits: 0 },
    { name: 'gap', label: 'Gap between the first two', unit: 'points', digits: 2 },
    { name: 'share', label: 'Same first place across weight tests', pct: true },
    { name: 'flips', label: 'Single-criterion changes that alter first place', unit: 'of 12', digits: 0 },
    { name: 'safety', label: 'Open safety items', digits: 0 },
  ]);
  function renderMetrics() {
    const none = (n) => metrics.set(n, NaN, { text: '—', tone: '' });
    metrics.set('concepts', cands.length, { digits: 0 });
    metrics.set('rated', cands.reduce((s, c) => s + CRITERION_IDS.filter((k) => c.ratings[k] !== null).length, 0), { digits: 0, sub: `of ${cands.length * CRITERION_IDS.length} cells` });
    const flags = cands.filter((c) => safetyFlag(c).visible).length;
    metrics.set('safety', flags, { digits: 0, tone: flags ? 'bad' : '' });
    const sc = result ? result.rows.filter((r) => r.score !== null) : [];
    if (sc.length >= 2) metrics.set('gap', sc[0].score - sc[1].score, { tone: sc[0].score - sc[1].score < 0.05 ? 'warn' : '' }); // stylecheck: allow — CSS tone name
    else none('gap');
    if (sens && sens.ids.length) {
      const top = Math.max(...Object.values(sens.firstShare));
      metrics.set('share', top);
      const flips = sens.oneAtATime.filter((o) => o.firstChanges).length;
      metrics.set('flips', flips, { digits: 0 });
    } else {
      none('share');
      none('flips');
    }
  }

  function renderSens() {
    if (!sens) {
      sensHost.replaceChildren(ui.note(error ? 'No sensitivity test: ' + error + '.' : 'Rate at least one criterion to run the test.', 'info'));
      return;
    }
    const nm = Object.fromEntries(cands.map((c) => [c.id, c.name]));
    const crit = Object.fromEntries(CRITERIA.map((c) => [c.id, c.label]));
    const orderTxt = (o) => (o ? o.map((id) => nm[id]).join(' › ') : 'no weights left');
    sensHost.replaceChildren(
      h('p', { class: 'small muted' }, `${sens.draws} draws, drift ${Math.round(sens.spread * 100)}%. Each concept's share of first place: ` + sens.ids.map((id) => `${nm[id]} ${Math.round(sens.firstShare[id] * 100)}%`).join(', ') + '.'),
      h('div', { class: 'scrollx' }, h('table', { class: 'dtable' },
        h('thead', {}, h('tr', {}, ['Change to one weight', 'Order after the change', 'First place changes?'].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, sens.oneAtATime.map((o) => h('tr', {}, h('td', {}, `${o.mode === 'drop' ? 'Drop' : 'Double'} ${crit[o.criterion]}`), h('td', {}, orderTxt(o.order)), h('td', {}, o.firstChanges === null ? '—' : o.firstChanges ? 'yes' : 'no')))))));
  }

  /* ------------------------------------------------------------ rating grid */
  function rebuild() {
    // grid
    const head = h('tr', {}, h('th', { scope: 'col' }, 'Criterion'), cands.map((c) => h('th', { scope: 'col' }, c.name)));
    const rows = CRITERIA.map((cr) => h('tr', {}, h('th', { scope: 'row', title: cr.help }, cr.label),
      cands.map((c) => {
        const sel = h('select', { 'aria-label': `${c.name}: ${cr.label} rating` },
          h('option', { value: '' }, '—'), [1, 2, 3, 4, 5].map((v) => h('option', { value: v, selected: c.ratings[cr.id] === v }, String(v))));
        sel.addEventListener('change', () => {
          c.ratings[cr.id] = sel.value === '' ? null : Number(sel.value);
          update();
        });
        return h('td', {}, sel);
      })));
    const conf = h('tr', {}, h('th', { scope: 'row', title: 'How sure the rater is. Low confidence widens the band.' }, 'Confidence'),
      cands.map((c) => {
        const sel = h('select', { 'aria-label': `${c.name}: confidence` }, [1, 2, 3, 4, 5].map((v) => h('option', { value: v, selected: c.confidence === v }, String(v))));
        sel.addEventListener('change', () => {
          c.confidence = Number(sel.value);
          update();
        });
        return h('td', {}, sel);
      }));
    gridHost.replaceChildren(h('table', { class: 'grid' }, h('thead', {}, head), h('tbody', {}, rows, conf)));
    // cards
    cardsHost.replaceChildren(...cands.map((c) => {
      const name = h('input', { type: 'text', maxlength: 60, 'aria-label': 'Concept name' });
      name.value = c.name;
      name.addEventListener('input', () => {
        c.name = name.value.slice(0, 60) || 'Unnamed';
        update();
        head.children[cands.indexOf(c) + 1].textContent = c.name;
        title.textContent = c.name;
      });
      const title = h('h4', {}, c.name);
      const own = h('textarea', { rows: 2, 'aria-label': `${c.name}: notes` });
      own.value = c.notes;
      own.addEventListener('input', () => (c.notes = own.value.slice(0, 2000)));
      const ret = h('textarea', { rows: 3, 'aria-label': `${c.name}: retelling in your words` });
      ret.value = c.retelling;
      ret.addEventListener('input', () => (c.retelling = ret.value.slice(0, 2000)));
      const flag = h('input', { type: 'checkbox', id: `flag-${c.id}`, checked: c.safety.concern });
      const note = h('textarea', { rows: 2, 'aria-label': `${c.name}: safety concern note` });
      note.value = c.safety.note;
      const card = h('div', { class: 'card' + (c.safety.concern ? ' flag' : '') });
      flag.addEventListener('change', () => {
        c.safety.concern = flag.checked;
        card.classList.toggle('flag', flag.checked);
        update();
      });
      note.addEventListener('input', () => {
        c.safety.note = note.value.slice(0, 600);
        update();
      });
      const del = ui.button('Remove', () => {
        cands = cands.filter((x) => x !== c);
        rebuild();
      }, { kind: 'small ghost' });
      card.append(title, h('div', { class: 'origin' }, c.origin === 'developer' ? 'Developer-owned concept' : c.origin === 'project' ? 'Project concept' : 'Team concept', c.ownerNote ? ' · ' + c.ownerNote : ''),
        h('label', {}, 'Name'), name,
        h('label', {}, 'Notes'), own,
        h('label', {}, 'Retelling in your words'), ret,
        h('div', { class: 'row' }, flag, h('label', { for: `flag-${c.id}`, style: { margin: 0 } }, 'Open safety concern')), note, h('div', { class: 'row', style: { marginTop: '8px' } }, del));
      return card;
    }));
    update();
  }

  /* ---------------------------------------------------------- controls etc. */
  const transport = ui.transport({
    seed, running: false, runLabel: 'Re-run test', hideStep: true,
    onToggle() {
      if (loop.running) stopRun();
      else startRun();
    },
    onReset() { applyPreset('example'); },
    onReplay() { startRun(); },
    onSeed(v) {
      seed = v;
      cands = cands.map((c) => ({ ...c, ...sampleRatings([c], seed)[0], safety: c.safety, notes: c.notes, retelling: c.retelling, name: c.name }));
      rebuild();
    },
  });
  slots.controls.append(transport.el);
  const presetSeg = ui.segmented({ name: 'preset', label: 'Ratings and weights', options: [
    { value: 'example', label: 'Example ratings' },
    { value: 'blank', label: 'Clear ratings' },
    { value: 'equal', label: 'Equal weights' },
    { value: 'zero', label: 'All weights 0 (fails)' },
  ] }, 'example', (k) => applyPreset(k));
  slots.controls.append(presetSeg.el);
  const panel = ui.controlPanel(slots.controls, ctx.compact ? defs.filter((d) => ['w_trust', 'w_wonder', 'spread'].includes(d.name)) : defs, values, () => {
    clearTimeout(pend);
    pend = setTimeout(update, 50);
  });
  let pend = 0;
  slots.controls.append(ui.note('Weights are your choices about what matters. The result is an ordering, not a decision. Sky Reach and Face Shield are developer-owned concepts and have the same standing as every other concept.'));
  slots.footer.append(h('p', { class: 'small' }, h('a', { href: '#ideas' }, 'Pitch editor, retelling test and exports →')));

  const loop = ctx.loop(() => {
    draws = Math.min(2000, draws + 100);
    update();
    if (draws >= 2000) stopRun();
  });
  function startRun() {
    draws = 100;
    update();
    loop.start();
    transport.setRunning(true);
  }
  function stopRun() {
    loop.stop();
    draws = 2000;
    transport.setRunning(false);
    update();
  }

  function applyPreset(k) {
    stopRun();
    if (k === 'example') {
      for (const d of defs) values[d.name] = d.default;
      cands = sampleRatings(SEED_CANDIDATES.map(newCandidate), seed);
    } else if (k === 'blank') {
      cands.forEach((c) => (c.ratings = blankRatings()));
    } else if (k === 'equal') {
      for (const d of defs) if (d.name.startsWith('w_')) values[d.name] = 1;
    } else if (k === 'zero') {
      for (const d of defs) if (d.name.startsWith('w_')) values[d.name] = 0;
    }
    panel.setAll(values);
    presetSeg.set(k);
    rebuild();
  }

  const stopFit = ui.fitCanvas(cb.canvas, () => drawChart());
  rebuild();

  return {
    getRecord() {
      const num = (name, v, unit, note) => ({ name, value: Number.isFinite(v) ? v : null, unit, note });
      const m = [num('Concepts', cands.length, ''), num('Open safety items', cands.filter((c) => safetyFlag(c).visible).length, '')];
      if (result) {
        result.rows.forEach((r) => m.push(num(`Score: ${r.id}`, r.score, 'points of 5', r.band ? `band ${r.band[0].toFixed(2)} to ${r.band[1].toFixed(2)}` : 'no ratings')));
        const sc = result.rows.filter((r) => r.score !== null);
        if (sc.length >= 2) m.push(num('Gap between the first two', sc[0].score - sc[1].score, 'points'));
      }
      if (sens) m.push(num('Highest first-place share across weight tests', Math.max(...Object.values(sens.firstShare)), ''));
      return { inputs: { ...values }, seed, metrics: m, diagnostics: { draws: sens ? sens.draws : 0, ordered: result ? 'true' : 'false', decision: 'none' }, elapsedMs: performance.now() - t0 };
    },
    getTable() {
      return {
        columns: ['concept_id', 'score', 'band_low', 'band_high', 'rated_of_6', 'first_place_share', 'safety_item_open'],
        rows: result ? result.rows.map((r) => [r.id, r.score, r.band ? r.band[0] : null, r.band ? r.band[1] : null, r.rated, sens && sens.firstShare[r.id] !== undefined ? sens.firstShare[r.id] : null, r.safety.visible ? 'yes' : 'no']) : [],
      };
    },
    destroy() {
      clearTimeout(pend);
      loop.dispose();
      stopFit();
      cb.destroy();
    },
  };
}
