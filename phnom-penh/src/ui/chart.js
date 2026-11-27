// Small canvas charts for the sheet. Time axis = scenario minutes 0..180 (15:00–18:00).
import { PAL } from '../palette.js';

export function canvasFor(el, h = 120) {
  const cv = document.createElement('canvas'); cv.className = 'chart'; cv.style.height = h + 'px';
  el.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(200, el.clientWidth || 340);
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  return { cv, c, w, h };
}

const font = '12px "Kantumruy Pro","Noto Sans Thai",sans-serif';

// series: [{data: Float32Array|Array (per minute), color, fill?, max?, dash?, width?}] ; marks: [{t, color, label}]
export function timeChart(el, { series = [], marks = [], tNow = null, yMax = null, yLabel = '', h = 120, t0 = 0, t1 = 180, hline = null, band = null }) {
  const { c, w } = canvasFor(el, h);
  const L = 6, R = 6, T = 14, B = 18, W = w - L - R, H = h - T - B;
  const X = t => L + (t - t0) / (t1 - t0) * W;
  let mx = yMax || 1; if (!yMax) for (const s of series) for (const v of s.data) if (v > mx) mx = v;
  const Y = v => T + H - Math.min(1, v / mx) * H;
  c.font = font; c.fillStyle = PAL.muted; c.strokeStyle = 'rgba(244,241,234,.12)'; c.lineWidth = 1;
  for (let hr = 0; hr <= 3; hr++) { const x = X(t0 + hr * 60); if (x < L - 1 || x > L + W + 1) continue; c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + H); c.stroke(); c.fillText(`${15 + hr}:00`, Math.min(x + 2, w - 34), h - 4); }
  if (yLabel) c.fillText(yLabel, L, 10);
  if (band) {
    c.fillStyle = band.color;
    for (let i0 = 0; i0 < band.hi.length;) {                 // one shape per run of leads with values
      if (band.hi[i0] !== band.hi[i0]) { i0++; continue; }
      let i1 = i0; while (i1 + 1 < band.hi.length && band.hi[i1 + 1] === band.hi[i1 + 1]) i1++;
      c.beginPath();
      for (let i = i0; i <= i1; i++) { const t = band.t0 + i * band.step; i > i0 ? c.lineTo(X(t), Y(band.hi[i])) : c.moveTo(X(t), Y(band.hi[i])); }
      for (let i = i1; i >= i0; i--) { const t = band.t0 + i * band.step; c.lineTo(X(t), Y(band.lo[i])); }
      c.closePath(); c.fill(); i0 = i1 + 1;
    }
  }
  if (hline) { c.strokeStyle = hline.color || PAL.silver; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(L, Y(hline.v)); c.lineTo(L + W, Y(hline.v)); c.stroke(); c.setLineDash([]); if (hline.label) { c.fillStyle = hline.color || PAL.silver; c.fillText(hline.label, L + W - c.measureText(hline.label).width, Y(hline.v) - 3); } }
  for (const s of series) {
    const st = s.t0 ?? t0, step = s.step ?? 1;
    c.beginPath();
    let pen = false;   // a missing value (NaN) breaks the line: a gap, not a bridge
    for (let i = 0; i < s.data.length; i++) { const v = s.data[i]; if (v !== v) { pen = false; continue; } const x = X(st + i * step), y = Y(v); pen ? c.lineTo(x, y) : c.moveTo(x, y); pen = true; }
    if (s.fill) { c.lineTo(X(st + (s.data.length - 1) * step), T + H); c.lineTo(X(st), T + H); c.closePath(); c.fillStyle = s.fill; c.fill(); }
    else { c.strokeStyle = s.color; c.lineWidth = s.width || 2; if (s.dash) c.setLineDash(s.dash); c.stroke(); c.setLineDash([]); }
    if (s.dots) { c.fillStyle = s.color; for (let i = 0; i < s.data.length; i += s.dots) { const v = s.data[i]; if (v !== v) continue; c.beginPath(); c.arc(X(st + i * step), Y(v), 1.8, 0, 7); c.fill(); } }
  }
  let ly = T + 2;
  for (const m of marks) {
    if (m.t == null || m.t < 0) continue;
    const x = X(m.t); c.strokeStyle = m.color; c.lineWidth = 2; c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + H); c.stroke();
    if (m.label) { const tw = c.measureText(m.label).width, lx = Math.max(L, Math.min(x + 4, L + W - tw - 4)); c.fillStyle = 'rgba(11,18,32,.82)'; c.fillRect(lx - 3, ly, tw + 6, 14); c.fillStyle = m.color; c.fillText(m.label, lx, ly + 11); ly += 16; }
  }
  if (tNow != null) { const x = X(tNow); c.strokeStyle = PAL.paper; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + H); c.stroke(); c.setLineDash([]); }
  return c;
}

export function xyChart(el, { points = [], xMax, yMax, xLabel = '', yLabel = '', h = 130, line = null, hline = null, mark = null, color = PAL.gold }) {
  const { c, w } = canvasFor(el, h);
  const L = 8, R = 8, T = 14, B = 18, W = w - L - R, H = h - T - B;
  const X = v => L + v / xMax * W, Y = v => T + H - Math.min(1, v / yMax) * H;
  c.font = font; c.fillStyle = PAL.muted; c.fillText(yLabel, L, 10); c.fillText(xLabel, L + W - c.measureText(xLabel).width, h - 4);
  c.strokeStyle = 'rgba(244,241,234,.12)'; c.beginPath(); c.moveTo(L, T + H); c.lineTo(L + W, T + H); c.stroke();
  if (hline) { c.strokeStyle = hline.color; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(L, Y(hline.v)); c.lineTo(L + W, Y(hline.v)); c.stroke(); c.setLineDash([]); c.fillStyle = hline.color; c.fillText(hline.label, L + 2, Y(hline.v) - 3); }
  if (line) { c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); line.forEach(([x, y], i) => i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))); c.stroke(); }
  for (const p of points) { c.fillStyle = p.color || color; c.beginPath(); c.arc(X(p.x), Y(p.y), p.r || 3, 0, 7); c.fill(); }
  if (mark) { c.strokeStyle = mark.color || PAL.paper; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X(mark.x), T); c.lineTo(X(mark.x), T + H); c.stroke(); if (mark.label) { c.fillStyle = mark.color || PAL.paper; c.fillText(mark.label, Math.min(X(mark.x) + 3, L + W - c.measureText(mark.label).width), T + 10); } }
  return c;
}
