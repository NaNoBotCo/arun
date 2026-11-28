// The time bar: 48 simulated hours, day and night, every alert as a band from its warning to its end,
// and a playhead to drag back and forward. A native range input carries keyboard and screen-reader use.
import { M0, M1, clock } from './sim.js';
import { sunPosition, scenarioDate } from '../render/sun.js';

export const HAZ_COL = { air: '#c77dff', rain: '#7aa7ff', water: '#3aa0ff', traffic: '#ff5a4d' };

export function createTimebar(wrap, { onTime, alerts, dayNames }) {
  const cv = wrap.querySelector('canvas'), input = wrap.querySelector('input');
  input.min = M0; input.max = M1; input.step = 5;
  const ctx = cv.getContext('2d');
  let m = M0, W = 0, H = 0, dpr = 1, bg = null;
  const X = t => 10 + (t - M0) / (M1 - M0) * (W - 20);
  const T = x => M0 + (x - 10) / (W - 20) * (M1 - M0);
  function drawBg() {
    bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    const b = bg.getContext('2d'); b.scale(dpr, dpr);
    // sky: the sun's height minute by minute
    for (let x = 10; x < W - 10; x++) {
      const el = sunPosition(scenarioDate(T(x))).elevation;
      const d = Math.max(0, Math.min(1, (el + 6) / 26));
      b.fillStyle = `rgb(${Math.round(16 + 40 * d)},${Math.round(24 + 60 * d)},${Math.round(44 + 80 * d)})`;
      b.fillRect(x, 4, 1, 18);
    }
    b.font = '10px Kantumruy Pro, Noto Sans Thai, system-ui'; b.textBaseline = 'top';
    for (let t = M0; t <= M1; t += 60) {
      const { h, day } = clock(t), x = X(t), major = Math.round(h) % 6 === 0;
      b.fillStyle = major ? 'rgba(244,241,234,.55)' : 'rgba(244,241,234,.18)'; b.fillRect(Math.round(x), major ? 16 : 19, 1, major ? 6 : 3);
      if (Math.round(h) === 0 && t < M1 - 120) { b.fillStyle = 'rgba(244,241,234,.85)'; b.fillText((dayNames()[day] ?? '').split(' ')[0], x + 3, 6); }
      else if (Math.round(h) === 12) { b.fillStyle = 'rgba(244,241,234,.45)'; b.fillText('12', x + 2, 6); }
    }
    // alert bands: thin from warning to event, thick from event to end
    const lanes = { air: 0, rain: 1, water: 2, traffic: 3 };
    for (const a of alerts()) {
      const y = 26 + lanes[a.kind] * 4.5, c = HAZ_COL[a.kind];
      if (a.issue != null && a.event != null && a.event > a.issue) { b.fillStyle = c + '88'; b.fillRect(X(a.issue), y + 1, X(a.event) - X(a.issue), 1.5); b.fillRect(X(a.issue), y - 1, 1.5, 5); }
      if (a.event != null) { b.fillStyle = c; b.fillRect(X(a.event), y, Math.max(3, X(a.end ?? M1) - X(a.event)), 3.5); }
    }
  }
  function draw() {
    if (!W) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (bg) ctx.drawImage(bg, 0, 0);
    ctx.scale(dpr, dpr);
    const x = X(m);
    ctx.fillStyle = 'rgba(11,18,32,.45)'; ctx.fillRect(x, 4, W - 10 - x, 18);   // what has not happened yet, dimmed
    ctx.fillStyle = '#f5c451'; ctx.fillRect(x - 1, 2, 2, H - 4);
    ctx.beginPath(); ctx.arc(x, 13, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 2; ctx.stroke();
  }
  function resize() {
    const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    drawBg(); draw();
  }
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = e.pointerId; cv.setPointerCapture(e.pointerId); move(e); });
  cv.addEventListener('pointermove', e => { if (drag === e.pointerId) move(e); });
  const end = e => { if (drag === e.pointerId) drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  function move(e) { const r = cv.getBoundingClientRect(); const t = Math.round(T(e.clientX - r.left) / 5) * 5; onTime(Math.max(M0, Math.min(M1, t)), true); }
  input.addEventListener('input', () => onTime(+input.value, true));
  return {
    set(t, text) { m = t; input.value = String(Math.round(t / 5) * 5); if (text) input.setAttribute('aria-valuetext', text); draw(); },
    resize, redraw() { drawBg(); draw(); },
  };
}
