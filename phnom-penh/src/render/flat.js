// The flat map: used when the phone has no WebGL2 (or ?flat). Same calls as world.js, drawn top-down
// on a 2D canvas: the ground map, rain as cyan, the forecast outline, river-model water, sensors.
import { paintGround, extentOf } from './textures.js';
import { sampleGrid } from '../kernels/storm.js';
import { PAL } from '../palette.js';
import { RAIN_DOM } from './world.js';

export function createFlat(canvas, data, opts = {}) {
  const { geo, terrain } = data;
  const ctx = canvas.getContext('2d');
  const innerExt = extentOf(geo, 'inner', terrain);
  const ground = paintGround(2048, Math.round(2048 * (innerExt.y1 - innerExt.y0) / (innerExt.x1 - innerExt.x0)), innerExt, geo, terrain, true);
  const ctrl = { target: { x: -1500, y: 0 }, dist: 12000, az: 0, el: 1.2 };
  let storm = null, t = 0, field = null, forecast = null, flood = null, sel = null, occ = { right: 0, bottom: 0 };
  const glyphs = new Map(), pulses = [];
  const rainCv = document.createElement('canvas'); rainCv.width = RAIN_DOM.nx; rainCv.height = RAIN_DOM.ny;
  const floodCv = document.createElement('canvas'); floodCv.width = terrain.grid.w; floodCv.height = terrain.grid.h;
  let W = 1, H = 1, dpr = 1;
  const mPerPx = () => ctrl.dist / Math.max(1, H - occ.bottom);
  const toScreen = (x, y) => { const k = 1 / mPerPx(); return { x: (W - occ.right) / 2 + (x - ctrl.target.x) * k, y: (H - occ.bottom) / 2 - (y - ctrl.target.y) * k }; };
  const toWorld = (sx, sy) => { const k = mPerPx(); return { x: ctrl.target.x + (sx - (W - occ.right) / 2) * k, y: ctrl.target.y - (sy - (H - occ.bottom) / 2) * k }; };
  function resize() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; }
  function drawLayer(img, ext) { const a = toScreen(ext.x0, ext.y1), b = toScreen(ext.x1, ext.y0); ctx.drawImage(img, a.x, a.y, b.x - a.x, b.y - a.y); }
  let truthOn = true;
  function paintRain() {
    if (!storm) return;
    field = truthOn ? sampleGrid(storm, t, RAIN_DOM) : new Float32Array(RAIN_DOM.nx * RAIN_DOM.ny);
    const c = rainCv.getContext('2d'), im = c.createImageData(RAIN_DOM.nx, RAIN_DOM.ny);
    for (let i = 0; i < field.length; i++) {
      const v = Math.min(1, field[i] / 60), f = forecast ? Math.abs(forecast[i] - 25) < 4 : false;
      im.data[i * 4] = f ? 235 : 60; im.data[i * 4 + 1] = f ? 240 : 150; im.data[i * 4 + 2] = f ? 250 : 200; im.data[i * 4 + 3] = f ? 230 : v * 170;
    }
    c.putImageData(im, 0, 0);
  }
  let anim = null;
  function frame(now = performance.now()) {
    if (anim) { const u = Math.min(1, (now - anim.t0) / anim.ms), e = u * u * (3 - 2 * u); ctrl.target.x = anim.a.x + (anim.b.x - anim.a.x) * e; ctrl.target.y = anim.a.y + (anim.b.y - anim.a.y) * e; ctrl.dist = anim.a.d + (anim.b.d - anim.a.d) * e; if (u >= 1) anim = null; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#c4bd8a'; ctx.fillRect(0, 0, W, H);
    { const a = toScreen(innerExt.x0, innerExt.y1), b = toScreen(innerExt.x1, innerExt.y0); ctx.fillStyle = '#6f8a8c'; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); }
    drawLayer(ground, innerExt);
    if (flood) drawLayer(floodCv, innerExt);
    ctx.imageSmoothingEnabled = true; drawLayer(rainCv, { x0: RAIN_DOM.x0, x1: RAIN_DOM.x1, y0: RAIN_DOM.y0, y1: RAIN_DOM.y1 });
    if (sel) { const p = toScreen(sel.x, sel.y); ctx.strokeStyle = PAL.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(10, sel.r / mPerPx()), 0, 7); ctx.stroke(); }
    for (const [, g] of glyphs) {
      const p = toScreen(g.userData.x, g.userData.y), col = g.userData.off ? '#6b7688' : { camera: PAL.violet, gauge: PAL.cyan, facility: PAL.jade, compute: PAL.gold, river: PAL.cyan }[g.userData.kind];
      const r = g.userData.kind === 'facility' || g.userData.kind === 'compute' ? 11 : 7;
      ctx.fillStyle = PAL.ink; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, r * (g.userData.sel ? 1.4 : 1), 0, 7); ctx.fill(); ctx.stroke();
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const q = pulses[i]; q.u += 1 / 60 / q.dur; if (q.u >= 1) { pulses.splice(i, 1); continue; }
      const a = toScreen(q.a.x, q.a.y), b = toScreen(q.b.x, q.b.y);
      ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * q.u, a.y + (b.y - a.y) * q.u, 5, 0, 7); ctx.fill();
    }
  }
  // gestures: drag pans, wheel and pinch zoom
  const ptrs = new Map(); let moved = 0, downAt = 0, last = null, pinch = null;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; downAt = performance.now(); last = { x: e.clientX, y: e.clientY }; anim = null; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; const p = ptrs.get(e.pointerId); moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1 && last) { const k = mPerPx(); ctrl.target.x -= (e.clientX - last.x) * k; ctrl.target.y += (e.clientY - last.y) * k; last = { x: e.clientX, y: e.clientY }; }
    else if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); ctrl.dist *= pinch / Math.max(10, d); pinch = d; }
  });
  const up = e => { ptrs.delete(e.pointerId); if (moved < 10 && performance.now() - downAt < 450 && opts.onTap) opts.onTap(e.clientX, e.clientY); last = null; pinch = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); ctrl.dist *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
  resize();
  return {
    flat: true, ctrl, buildingCount: 0, get fps() { return 60; }, glyphs,
    setStorm(s) { storm = s; }, setTime(tm) { t = tm; paintRain(); },
    setForecast(f) { forecast = f; paintRain(); }, setGhost() {}, clearGhost() {},
    setFlood(mask) {
      if (!mask) { flood = null; return; }
      const c = floodCv.getContext('2d'), im = c.createImageData(terrain.grid.w, terrain.grid.h);
      for (let i = 0; i < mask.length; i++) if (mask[i]) { im.data[i * 4] = 40; im.data[i * 4 + 1] = 140; im.data[i * 4 + 2] = 170; im.data[i * 4 + 3] = 200; }
      c.putImageData(im, 0, 0); flood = true;
    },
    setRise() {}, setSelect(x, y, r) { sel = r > 0 ? { x, y, r } : null; },
    removeGlyph(id) { glyphs.delete(id); }, moveGlyph(id, x, y) { const g = glyphs.get(id); if (g) { g.userData.x = x; g.userData.y = y; } },
    setTruth(v) { truthOn = !!v; paintRain(); }, get truth() { return truthOn; },
    addGlyph(id, kind, x, y, h, size) { const g = { userData: { id, kind, x, y, h, size }, position: { set: (px, py, pz) => { g.userData.x = px; g.userData.y = -pz; } } }; glyphs.set(id, g); return g; },
    finishGlyphs() {}, glyph: id => glyphs.get(id),
    setGlyphState(id, st) { const g = glyphs.get(id); if (g) Object.assign(g.userData, st); },
    setLinks() {},
    pulse(a, b, col = PAL.gold, dur = 1.2) { const A = glyphs.get(a), B = glyphs.get(b); if (A && B) pulses.push({ a: { x: A.userData.x, y: A.userData.y }, b: { x: B.userData.x, y: B.userData.y }, col, dur, u: 0 }); },
    flyTo(p, ms = 1000) { const b = { x: p.x, y: p.y, d: Math.min(40000, p.dist * 1.2) }; if (opts.reducedMotion || !ms) { ctrl.target = { x: b.x, y: b.y }; ctrl.dist = b.d; return; } anim = { t0: performance.now(), ms, a: { x: ctrl.target.x, y: ctrl.target.y, d: ctrl.dist }, b }; },
    project(x, y) { const p = toScreen(x, y); return { x: p.x, y: p.y, on: p.x > -50 && p.x < W + 50 && p.y > -50 && p.y < H + 50 }; },
    pickGlyph(cx, cy, radius = 30) { const r = canvas.getBoundingClientRect(); let best = null, bd = radius; for (const [id, g] of glyphs) { const p = toScreen(g.userData.x, g.userData.y), d = Math.hypot(p.x - (cx - r.left), p.y - (cy - r.top)); if (d < bd) { bd = d; best = id; } } return best; },
    pickGround(cx, cy) { const r = canvas.getBoundingClientRect(); return toWorld(cx - r.left, cy - r.top); },
    resize, frame, setOcclusion(right, bottom) { occ = { right, bottom }; },
  };
}
