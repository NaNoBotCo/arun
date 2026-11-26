// Canvas charts drawn to one scale, coloured from theme tokens, each with a text version.

import { h, token, fmt, fitCanvas } from './ui.js';

function niceTicks(lo, hi, n = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi === lo) {
    hi = lo + 1;
  }
  const span = hi - lo;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

// A chart box: title, canvas, and a <details> holding the same numbers as text.
export function chartBox(container, { title, height = 180, className = '' } = {}) {
  const canvas = h('canvas', { class: 'chart', role: 'img', 'aria-label': title || 'chart', style: { height: height + 'px' } });
  const text = h('div', { class: 'chart-text' });
  const box = h('figure', { class: 'chartbox ' + className },
    title ? h('figcaption', {}, title) : null, canvas,
    h('details', { class: 'chart-data' }, h('summary', {}, 'Numbers as text'), text));
  container.append(box);
  let last = null;
  const stop = fitCanvas(canvas, () => last && last());
  return {
    el: box, canvas, text,
    draw(fn) {
      last = fn;
      fn();
    },
    destroy: stop,
  };
}

// series: [{ name, points: [[x,y],...], color, width, dash, fill }]
export function drawLines(canvas, { series, xLabel = '', yLabel = '', xRange, yRange, marks = [], bands = [], yZero = false }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, W, H);
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const s of series)
    for (const [x, y] of s.points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
  for (const b of bands)
    for (const p of b.lower.concat(b.upper)) {
      if (p[1] < ymin) ymin = p[1];
      if (p[1] > ymax) ymax = p[1];
    }
  if (xRange) [xmin, xmax] = xRange;
  if (yRange) [ymin, ymax] = yRange;
  if (yZero) ymin = Math.min(0, ymin);
  if (!Number.isFinite(xmin)) {
    xmin = 0;
    xmax = 1;
  }
  if (!Number.isFinite(ymin)) {
    ymin = 0;
    ymax = 1;
  }
  if (ymax === ymin) ymax = ymin + 1;
  if (xmax === xmin) xmax = xmin + 1;
  const pad = 0.06 * (ymax - ymin);
  if (!yRange) {
    ymax += pad;
    if (!(yZero && ymin === 0)) ymin -= pad;
  }
  const L = 52 * dpr, R = 10 * dpr, T = 10 * dpr, B = 30 * dpr;
  const px = (x) => L + ((x - xmin) / (xmax - xmin)) * (W - L - R);
  const py = (y) => H - B - ((y - ymin) / (ymax - ymin)) * (H - T - B);
  const fg = token('--muted');
  const grid = token('--grid');
  ctx.font = `${11 * dpr}px ${token('--font-data') || 'monospace'}`;
  ctx.fillStyle = fg;
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1 * dpr;
  for (const t of niceTicks(ymin, ymax, 4)) {
    const y = py(t);
    ctx.beginPath();
    ctx.moveTo(L, y);
    ctx.lineTo(W - R, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(t, 3), L - 6 * dpr, y);
  }
  for (const t of niceTicks(xmin, xmax, 5)) {
    const x = px(t);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(t, 3), x, H - B + 6 * dpr);
  }
  if (xLabel) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(xLabel, W - R, H - 2 * dpr);
  }
  if (yLabel) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(yLabel, L + 4 * dpr, T);
    ctx.restore();
  }
  for (const b of bands) {
    ctx.beginPath();
    b.upper.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    for (let i = b.lower.length - 1; i >= 0; i--) ctx.lineTo(px(b.lower[i][0]), py(b.lower[i][1]));
    ctx.closePath();
    ctx.fillStyle = b.color;
    ctx.globalAlpha = b.alpha ?? 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const s of series) {
    ctx.beginPath();
    let started = false;
    for (const [x, y] of s.points) {
      if (!Number.isFinite(y)) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(px(x), py(y));
        started = true;
      } else ctx.lineTo(px(x), py(y));
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = (s.width || 2) * dpr;
    ctx.globalAlpha = s.alpha ?? 1;
    ctx.setLineDash(s.dash ? s.dash.map((d) => d * dpr) : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  for (const m of marks) {
    ctx.strokeStyle = m.color || fg;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    if (m.x !== undefined) {
      ctx.moveTo(px(m.x), T);
      ctx.lineTo(px(m.x), H - B);
    } else {
      ctx.moveTo(L, py(m.y));
      ctx.lineTo(W - R, py(m.y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (m.label) {
      ctx.fillStyle = m.color || fg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(m.label, (m.x !== undefined ? px(m.x) : L) + 4 * dpr, m.y !== undefined ? py(m.y) + 2 * dpr : T + 2 * dpr);
    }
  }
  return { px, py, xmin, xmax, ymin, ymax };
}

// Same scale for every series. bins: { lo, hi, counts:[...] } per series.
export function drawHistogram(canvas, { series, xLabel = '', marks = [] }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, W, H);
  if (!series.length) return;
  const lo = Math.min(...series.map((s) => s.lo));
  const hi = Math.max(...series.map((s) => s.hi));
  const cmax = Math.max(1, ...series.flatMap((s) => s.counts));
  const L = 40 * dpr, R = 10 * dpr, T = 10 * dpr, B = 30 * dpr;
  const px = (x) => L + ((x - lo) / (hi - lo || 1)) * (W - L - R);
  const py = (c) => H - B - (c / cmax) * (H - T - B);
  ctx.font = `${11 * dpr}px ${token('--font-data') || 'monospace'}`;
  ctx.fillStyle = token('--muted');
  ctx.strokeStyle = token('--grid');
  for (const t of niceTicks(lo, hi, 5)) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(t, 3), px(t), H - B + 6 * dpr);
  }
  ctx.beginPath();
  ctx.moveTo(L, H - B);
  ctx.lineTo(W - R, H - B);
  ctx.stroke();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  if (xLabel) ctx.fillText(xLabel, W - R, H - 2 * dpr);
  for (const s of series) {
    const w = (s.hi - s.lo) / s.counts.length;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = s.alpha ?? 0.7;
    s.counts.forEach((c, i) => {
      const x0 = px(s.lo + i * w);
      const x1 = px(s.lo + (i + 1) * w);
      ctx.fillRect(x0 + 0.5 * dpr, py(c), Math.max(1, x1 - x0 - 1 * dpr), H - B - py(c));
    });
    ctx.globalAlpha = 1;
  }
  for (const m of marks) {
    ctx.strokeStyle = m.color || token('--fg');
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(px(m.x), T);
    ctx.lineTo(px(m.x), H - B);
    ctx.stroke();
    if (m.label) {
      ctx.fillStyle = m.color || token('--fg');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(m.label, px(m.x) + 4 * dpr, T);
    }
  }
}

// A small table for the "Numbers as text" panel.
export function dataTable(target, columns, rows, maxRows = 60) {
  target.replaceChildren();
  const step = Math.max(1, Math.ceil(rows.length / maxRows));
  const shown = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);
  const t = h('table', { class: 'dtable' },
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', {}, shown.map((r) => h('tr', {}, r.map((v) => h('td', {}, typeof v === 'number' ? fmt(v, 4) : v))))));
  target.append(t);
  if (step > 1) target.append(h('p', { class: 'muted small' }, `Every ${step}th row of ${rows.length}.`));
}
