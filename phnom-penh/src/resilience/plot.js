// Canvas chart for one channel. The receiver's side is always drawn; the synthetic truth only when revealed.
const C = { gold: '#f5c451', cyan: '#5fd4e6', violet: '#a98bff', jade: '#3ed6a0', silver: '#c9d1dc', rose: '#ff8a8a', paper: '#f4f1ea', muted: '#a9b4c4' };
const FONT = '14px "Kantumruy Pro","Noto Sans Thai",system-ui,sans-serif';

export function sizeCanvas(cv, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(200, Math.floor(cv.parentElement.clientWidth));
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, w, h };
}

export function drawChannel(cv, o) {
  const { ev, ch, tNow, reveal, tests, h = 170 } = o;
  const { c, w } = sizeCanvas(cv, h);
  const H = ev.H, L = 38, R = 8, T = 22, B = 22, W = w - L - R, Hc = h - T - B;
  const lo = ch.min, hi = ch.max;
  const X = t => L + t / H * W, Y = v => T + Hc - Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * Hc;
  c.clearRect(0, 0, w, h);
  c.font = FONT; c.textBaseline = 'alphabetic';
  // grid and labels
  c.strokeStyle = 'rgba(244,241,234,.12)'; c.fillStyle = C.muted; c.lineWidth = 1;
  const days = Math.round(H / 1440);
  for (let d = 0; d < days; d++) { const x = Math.round(X(d * 1440)) + .5; c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + Hc); c.stroke(); c.fillText(String(d + 1), x + 4, h - 5); }
  for (const v of [lo, (lo + hi) / 2, hi]) { const y = Math.round(Y(v)) + .5; c.beginPath(); c.moveTo(L, y); c.lineTo(L + W, y); c.stroke(); c.fillText(String(Math.round(v * 10) / 10), 2, Math.min(y + 5, T + Hc)); }
  // link outages
  c.fillStyle = 'rgba(95,212,230,.45)';
  for (const [a, b] of ev.link) { if (a >= tNow) break; const x0 = X(a), x1 = X(Math.min(b, tNow)); c.fillRect(x0, T + Hc + 3, Math.max(2, x1 - x0), 5); }
  if (reveal) {
    c.fillStyle = 'rgba(255,138,138,.2)';
    for (const e of ch.events) { if (e.start >= tNow) break; const x0 = X(e.start), x1 = X(Math.min(e.end, tNow)); c.fillRect(x0, T, Math.max(2, x1 - x0), Hc); }
    if (ch.band != null) { c.strokeStyle = 'rgba(255,138,138,.6)'; c.setLineDash([2, 4]); const y = Y(ch.band); c.beginPath(); c.moveTo(L, y); c.lineTo(L + W, y); c.stroke(); c.setLineDash([]); }
    c.strokeStyle = C.silver; c.lineWidth = 1; c.globalAlpha = .9; c.beginPath();
    const tEnd = Math.min(H, Math.floor(tNow));
    for (let px = 0; px < W; px++) {
      const a = Math.floor(px / W * H), b = Math.min(tEnd, Math.floor((px + 1) / W * H));
      if (a >= tEnd) break;
      let mn = Infinity, mx = -Infinity;
      for (let t = a; t <= b; t++) { const v = ch.truth[t]; if (v < mn) mn = v; if (v > mx) mx = v; }
      c.moveTo(L + px + .5, Y(mn)); c.lineTo(L + px + .5, Y(mx) - (mx === mn ? 1 : 0));
    }
    c.stroke(); c.globalAlpha = 1;
  }
  // alert level
  if (ch.alert && ch.thr != null && !ch.digital) {
    c.strokeStyle = C.gold; c.globalAlpha = .7; c.setLineDash([5, 4]); const y = Y(ch.thr); c.beginPath(); c.moveTo(L, y); c.lineTo(L + W, y); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  }
  // receiver's record
  const { ts, arr } = ev.dev, vals = ch.vals, iv = Math.max(1, Math.round(ev.params.interval));
  const pxPer = W / (H / iv), dots = pxPer >= 5;
  c.strokeStyle = C.gold; c.lineWidth = 1.6; c.beginPath();
  let prevT = -1e9, started = false;
  for (let i = 0; i < ts.length; i++) {
    if (!(arr[i] <= tNow) ) continue;
    const x = X(ts[i]), y = Y(vals[i]);
    if (!started || ts[i] - prevT > 1.5 * iv) c.moveTo(x, y); else c.lineTo(x, y);
    started = true; prevT = ts[i];
  }
  c.stroke();
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] > tNow) break;
    const got = arr[i] <= tNow, x = X(ts[i]), y = Y(vals[i]);
    if (got) { if (dots) { c.fillStyle = C.gold; c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill(); } }
    else {
      c.strokeStyle = C.silver; c.lineWidth = 1;
      if (dots) { c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.stroke(); }
      c.beginPath(); c.moveTo(x + .5, T + Hc - 1); c.lineTo(x + .5, T + Hc - 5); c.stroke();
    }
  }
  // alerts
  c.fillStyle = C.jade;
  for (const a of ch.alerts) { if (a.t > tNow) break; const x = X(a.t); c.beginPath(); c.moveTo(x - 6, T - 14); c.lineTo(x + 6, T - 14); c.lineTo(x, T - 2); c.closePath(); c.fill(); c.fillRect(x - .5, T - 2, 1, Hc + 2); }
  // verified tests
  if (tests) for (const t of tests) {
    if (!(t.arr <= tNow)) continue;
    const x = X(t.arr), y = T + 12;
    c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath();
    c.strokeStyle = C.violet; c.lineWidth = 2; if (t.positive) { c.fillStyle = C.violet; c.fill(); } c.stroke();
  }
  if (tNow < H) { c.strokeStyle = C.paper; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(X(tNow) + .5, T - 14); c.lineTo(X(tNow) + .5, T + Hc); c.stroke(); c.setLineDash([]); }
}
