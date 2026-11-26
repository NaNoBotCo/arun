// DOM helpers shared by every exhibit. Text goes in as text nodes; nothing user-typed becomes HTML.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v; // only for static strings written in this codebase
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let uid = 0;
export const nextId = (p = 'c') => `${p}-${++uid}`;

export function fmt(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e7 || a < 10 ** -(digits + 1))) return v.toExponential(Math.max(1, digits - 1)).replace('-', '−');
  const s = v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return s.replace(/^-/, '−');
}

export function fmtMoney(v, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  let s;
  if (a >= 1e9) s = (a / 1e9).toFixed(2) + 'B';
  else if (a >= 1e6) s = (a / 1e6).toFixed(2) + 'M';
  else if (a >= 1e4) s = (a / 1e3).toFixed(1) + 'k';
  else s = a.toLocaleString('en-US', { maximumFractionDigits: digits });
  return (v < 0 ? '−' : '') + 'US$' + s;
}

export function fmtPct(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return (v * 100).toFixed(digits).replace('-', '−') + '%';
}

// Status line for screen readers and sighted users alike.
export function announce(msg, level = 'info') {
  const el = document.getElementById('announcer');
  if (!el) return;
  el.textContent = '';
  el.dataset.level = level;
  requestAnimationFrame(() => {
    el.textContent = msg;
  });
  const toast = document.getElementById('toast');
  if (toast && level !== 'quiet') {
    toast.textContent = msg;
    toast.dataset.level = level;
    toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toast.hidden = true), level === 'error' ? 7000 : 3200);
  }
}

function decimals(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

// Range + number pair. Invalid typed values are refused with a message; the last good value stays.
export function slider(def, value, onChange) {
  const id = nextId(def.name);
  const range = h('input', {
    type: 'range', id, min: def.min, max: def.max, step: def.step ?? 'any', value,
    'aria-describedby': def.help ? id + '-help' : null,
  });
  const num = h('input', {
    type: 'number', min: def.min, max: def.max, step: def.step ?? 'any', value,
    'aria-label': `${def.label} (${def.unit || 'value'})`, inputmode: 'decimal', class: 'num',
  });
  const err = h('span', { class: 'ctl-err', role: 'alert', hidden: true });
  const unit = def.unit ? h('span', { class: 'unit' }, def.unit) : null;
  const wrap = h('div', { class: 'ctl ctl-range', dataset: { name: def.name } },
    h('div', { class: 'ctl-top' }, h('label', { for: id }, def.label), h('span', { class: 'ctl-num' }, num, unit)),
    range, def.help ? h('div', { class: 'ctl-help', id: id + '-help' }, def.help) : null, err);
  const d = decimals(def.step ?? 0.01);
  const show = (v) => {
    range.value = v;
    num.value = def.step ? Number(v).toFixed(Math.min(6, d)) : v;
  };
  show(value);
  range.addEventListener('input', () => {
    err.hidden = true;
    num.classList.remove('bad');
    const v = Number(range.value);
    num.value = def.step ? v.toFixed(Math.min(6, d)) : v;
    onChange(v);
  });
  num.addEventListener('change', () => {
    const v = Number(num.value);
    if (num.value.trim() === '' || !Number.isFinite(v) || v < def.min || v > def.max) {
      err.textContent = `Enter a number from ${def.min} to ${def.max}${def.unit ? ' ' + def.unit : ''}.`;
      err.hidden = false;
      num.classList.add('bad');
      return;
    }
    if (def.integer && !Number.isInteger(v)) {
      err.textContent = 'Enter a whole number.';
      err.hidden = false;
      num.classList.add('bad');
      return;
    }
    err.hidden = true;
    num.classList.remove('bad');
    range.value = v;
    onChange(v);
  });
  return { el: wrap, set: show, input: range, number: num };
}

export function select(def, value, onChange) {
  const id = nextId(def.name);
  const sel = h('select', { id }, def.options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  sel.addEventListener('change', () => onChange(def.numeric ? Number(sel.value) : sel.value));
  const wrap = h('div', { class: 'ctl ctl-select', dataset: { name: def.name } }, h('label', { for: id }, def.label), sel,
    def.help ? h('div', { class: 'ctl-help' }, def.help) : null);
  return { el: wrap, set: (v) => (sel.value = v), input: sel };
}

export function toggle(def, value, onChange) {
  const id = nextId(def.name);
  const box = h('input', { type: 'checkbox', id, role: 'switch', checked: !!value });
  box.addEventListener('change', () => onChange(box.checked));
  const wrap = h('div', { class: 'ctl ctl-toggle', dataset: { name: def.name } },
    h('label', { for: id }, box, h('span', { class: 'switch', 'aria-hidden': 'true' }), h('span', {}, def.label)),
    def.help ? h('div', { class: 'ctl-help' }, def.help) : null);
  return { el: wrap, set: (v) => (box.checked = !!v), input: box };
}

export function segmented(def, value, onChange) {
  const name = nextId(def.name);
  const btns = def.options.map((o) => {
    const b = h('button', { type: 'button', class: 'seg', 'aria-pressed': String(o.value === value), dataset: { v: o.value } }, o.label);
    b.addEventListener('click', () => {
      for (const x of btns) x.setAttribute('aria-pressed', String(x === b));
      onChange(o.value);
    });
    return b;
  });
  const wrap = h('div', { class: 'ctl ctl-seg', dataset: { name: def.name } },
    h('div', { class: 'ctl-top' }, h('span', { class: 'lbl', id: name }, def.label)),
    h('div', { class: 'segs', role: 'group', 'aria-labelledby': name }, btns));
  return {
    el: wrap,
    set: (v) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))),
  };
}

// Builds every control listed in defs into container. Returns { values, set(name, v), refs }.
export function controlPanel(container, defs, values, onChange) {
  const refs = {};
  for (const def of defs) {
    const cb = (v) => {
      values[def.name] = v;
      onChange(def.name, v, values);
    };
    let ref;
    if (def.type === 'select') ref = select(def, values[def.name], cb);
    else if (def.type === 'toggle') ref = toggle(def, values[def.name], cb);
    else if (def.type === 'segmented') ref = segmented(def, values[def.name], cb);
    else ref = slider(def, values[def.name], cb);
    refs[def.name] = ref;
    container.append(ref.el);
  }
  return {
    values,
    refs,
    set(name, v) {
      values[name] = v;
      refs[name] && refs[name].set(v);
    },
    setAll(obj) {
      for (const [k, v] of Object.entries(obj)) if (k in refs) this.set(k, v);
    },
  };
}

export function button(label, onClick, opts = {}) {
  const b = h('button', { type: 'button', class: 'btn ' + (opts.kind || ''), title: opts.title, 'aria-label': opts.aria }, opts.icon ? h('span', { class: 'ico', 'aria-hidden': 'true' }, opts.icon) : null, label);
  b.addEventListener('click', onClick);
  return b;
}

// Run/Pause, Step, Reset, seed field, New seed, Replay.
export function transport({ onToggle, onStep, onReset, onReplay, onSeed, seed, running = false, stepLabel = 'Step', hideStep = false, runLabel = 'Run' }) {
  const runBtn = h('button', { type: 'button', class: 'btn primary run', 'aria-pressed': String(running) });
  const setRunning = (r) => {
    runBtn.setAttribute('aria-pressed', String(r));
    runBtn.textContent = r ? 'Pause' : runLabel;
  };
  setRunning(running);
  runBtn.addEventListener('click', () => onToggle && onToggle());
  const seedId = nextId('seed');
  const seedIn = h('input', { type: 'number', id: seedId, class: 'num seed', min: 0, max: 4294967295, step: 1, value: seed, inputmode: 'numeric' });
  const seedErr = h('span', { class: 'ctl-err', role: 'alert', hidden: true });
  seedIn.addEventListener('change', () => {
    const v = Number(seedIn.value);
    if (!Number.isInteger(v) || v < 0 || v > 4294967295) {
      seedErr.textContent = 'Seed is a whole number from 0 to 4294967295.';
      seedErr.hidden = false;
      return;
    }
    seedErr.hidden = true;
    onSeed && onSeed(v);
  });
  const el = h('div', { class: 'transport' },
    h('div', { class: 'tp-row' }, runBtn,
      hideStep ? null : button(stepLabel, () => onStep && onStep()),
      button('Reset', () => onReset && onReset())),
    h('div', { class: 'tp-row seed-row' },
      h('label', { for: seedId }, 'Seed'), seedIn,
      button('New seed', () => {
        const v = Math.floor(Math.random() * 4294967295);
        seedIn.value = v;
        onSeed && onSeed(v);
      }, { title: 'Draw a fresh random seed' }),
      button('Replay', () => onReplay && onReplay(), { title: 'Run again from the start with this seed' })),
    seedErr);
  return { el, setRunning, setSeed: (v) => (seedIn.value = v) };
}

// Metric tiles. set(name, value, {text, tone, pair:[a,b]})
export function metricGrid(container, defs) {
  const tiles = {};
  const grid = h('div', { class: 'metrics' });
  for (const d of defs) {
    const val = h('span', { class: 'mv' }, '—');
    const sub = h('span', { class: 'ms' }, d.unit || '');
    const tile = h('div', { class: 'metric' + (d.wide ? ' wide' : ''), dataset: { name: d.name }, title: d.help || null }, h('span', { class: 'ml' }, d.label), val, sub);
    tiles[d.name] = { val, sub, tile, def: d };
    grid.append(tile);
  }
  container.append(grid);
  return {
    el: grid,
    set(name, value, opts = {}) {
      const t = tiles[name];
      if (!t) return;
      const digits = opts.digits ?? t.def.digits ?? 2;
      t.val.textContent = opts.text ?? (t.def.money ? fmtMoney(value) : t.def.pct ? fmtPct(value) : fmt(value, digits));
      if (opts.sub !== undefined) t.sub.textContent = opts.sub;
      t.tile.dataset.tone = opts.tone || '';
      t.value = value;
    },
    get(name) {
      return tiles[name] && tiles[name].value;
    },
  };
}

export function note(text, kind = 'info') {
  return h('p', { class: 'note ' + kind }, text);
}

export function sectionTitle(text) {
  return h('h3', { class: 'ptitle' }, text);
}

export const STATUS_LABEL = {
  MATHEMATICAL: 'Mathematical',
  SYNTHETIC: 'Synthetic',
  PUBLIC_HISTORICAL: 'Public historical',
  RESEARCH_MODEL: 'Research model',
  AUTHORIZED_AGGREGATE: 'Authorized aggregate',
};

export function statusTag(status) {
  return h('span', { class: 'dstat', dataset: { s: status }, title: 'Data status: ' + STATUS_LABEL[status] }, STATUS_LABEL[status] || status);
}

// Read a CSS custom property as a color string (for canvas drawing).
export function token(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim() || '#888';
}

export function reducedMotion() {
  return document.documentElement.dataset.motion === 'reduced';
}

// Canvas sized to its box at device pixel ratio. Calls draw(ctx, w, h) on resize.
export function fitCanvas(canvas, onResize) {
  const ro = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const hh = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== hh) {
      canvas.width = w;
      canvas.height = hh;
      onResize && onResize(w, hh, dpr);
    }
  });
  ro.observe(canvas);
  return () => ro.disconnect();
}
