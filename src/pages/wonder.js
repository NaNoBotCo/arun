// #wonder: the phone-first, over-the-shoulder route. Three beats on one scroll, one cause and effect:
//   1 flood   the same storm on two copies of the fictional valley; tap to move the wetland (E02 kernel)
//   2 futures that wetland's storm sweep feeds 1,000 seeded futures (E03 kernel)
//   3 decide  paired losses, one cost lever, one buyer's bar (E03 results, fictional prices)
// No new science: every number comes from the existing kernels; this file schedules and draws.

import { h, button, announce, fmt, fmtMoney, fmtPct, token, statusTag, slider, segmented } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { scenario } from '../core/scenario.js';
import { runJob, jobLog, deviceLabel } from '../core/jobs.js';
import { createLoop } from '../core/loop.js';
import { hashData } from '../core/hash.js';
import { makeRng, deriveSeed } from '../core/rng.js';
import { sortedCopy, quantileSorted } from '../core/stats.js';
import { makeRegion, METHOD_VERSION as E02_VERSION } from '../kernels/e02.js';
import { hazardFromSweep, simulatePath, summarize, METHOD_VERSION as E03_VERSION } from '../kernels/e03.js';
import { meta as E03_META } from '../exhibits/e03.js';
import { vividTerrain as terrainCanvas, vividWater as createWaterLayer } from '../wonder/render.js';
import { baselineParams, sweepJobs, rowsFromArms, FLOW_VERSION } from '../wonder/flow.js';
import { loadMap, indexOf, positionOf, mapApplies, PMAP_SIDE } from '../wonder/pmap.js';

const PLAY_FPS = 7; // 15-minute frames per second: 1¾ simulated hours each second
const E03_SEED = 20261125; // E03's own default seed, so the lab shows the same futures
const PMAP = loadMap();
const BEST = positionOf(PMAP.best.hotel);
const PRESETS = [
  { key: 'above', x: 0.59, y: 0.44 },
  { key: 'best', x: BEST.x, y: BEST.y },
  { key: 'below', x: 0.55, y: 0.85 },
];
const FREQS = [
  { key: 'fewer', v: 0.2 },
  { key: 'as', v: 0.35 },
  { key: 'more', v: 0.7 },
];

// Survives language switches and back/forward, like the scenario store.
const frameStore = new Map(); // key -> { frames, done, summary }
const sweepRows = new Map(); // hydro hash -> rows
const view = { freq: 0.35, capex: null, selected: null, layer: 'hotel', flood: 'map' };
const liveArms = new Map(); // job key -> handle of an arm job running in a worker

function tf(key, vars = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : '{' + k + '}'));
}

// Short axis labels: 0, 250k, −1.5M.
function axisMoney(v) {
  const a = Math.abs(v);
  if (a < 0.5) return '0';
  const sgn = v < 0 ? '−' : '';
  if (a >= 1e6) return sgn + (a / 1e6).toFixed(a % 1e6 === 0 ? 0 : 1) + 'M';
  if (a >= 1e3) return sgn + Math.round(a / 1e3) + 'k';
  return sgn + Math.round(a);
}

function trimStore() {
  while (frameStore.size > 6) frameStore.delete(frameStore.keys().next().value);
}

export function wonder(main) {
  const started = performance.now();
  let disposed = false;
  const cleanups = [];
  const s0 = scenario.get();
  const hotelThreshold = 0.2;

  // ---------- Beat 1: the flood ----------
  const canvas = h('canvas', { class: 'w-canvas', tabindex: '0', role: 'img', 'aria-label': t('w.b1.t') });
  const stage = h('div', { class: 'w-stage', dataset: { state: 'computing', view: view.flood } }, canvas);
  const nowA = h('b', { class: 'w-big base' }, '—');
  const nowB = h('b', { class: 'w-big alt' }, '—');
  const lblA = h('span', { class: 'w-num-l' }, t('w.hotelNow'));
  const lblB = h('span', { class: 'w-num-l' }, t('w.hotelNow'));
  const reads = h('div', { class: 'w-read sr-only' }, h('div', { class: 'w-num' }, lblA, nowA), h('div', { class: 'w-num' }, lblB, nowB));
  const viewBtns = ['map', 'section', 'gauge'].map((k) => {
    const b = h('button', { type: 'button', class: 'w-tab', 'aria-pressed': String(view.flood === k), dataset: { view: k } }, t('w.view.' + k));
    b.addEventListener('click', () => {
      view.flood = k;
      viewBtns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === k)));
      stage.dataset.view = k;
      paint(true);
    });
    return b;
  });
  const result = h('p', { class: 'w-result', 'aria-live': 'polite' });
  const presetBtns = PRESETS.map((p) => {
    const b = h('button', { type: 'button', class: 'w-chip', 'aria-pressed': 'false', dataset: { preset: p.key } }, t('w.preset.' + p.key));
    b.addEventListener('click', () => moveWetland(p.x, p.y, 'preset'));
    return b;
  });
  const replayBtn = h('button', { type: 'button', class: 'w-chip w-replay' }, t('w.replay'));
  replayBtn.addEventListener('click', () => restartPlayback(true));
  const moreBox = h('div', { class: 'w-more-in' });
  const more = h('details', { class: 'w-more' }, h('summary', {}, t('w.more')), moreBox);
  const stormDef = { name: 'storm', label: 'Storm intensity', type: 'range', min: 10, max: 100, step: 5, default: 45, unit: 'mm/h' };
  const basinDef = { name: 'basin', label: 'Wetland basin size', type: 'range', min: 0, max: 2000000, step: 100000, default: 1000000, unit: 'm³' };
  let changeTimer = 0;
  const debounced = (fn) => {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(fn, 250);
  };
  const stormCtl = slider(stormDef, s0.hydro.stormIntensity_mm_h, (v) => debounced(() => safeSet({ 'hydro.stormIntensity_mm_h': v })));
  const basinCtl = slider(basinDef, s0.hydro.retentionCapacity_m3, (v) => debounced(() => safeSet({ 'hydro.retentionCapacity_m3': v })));
  const resetBtn = button('Reset to the first storm', () => {
    scenario.reset();
  }, { kind: 'small' });
  moreBox.append(stormCtl.el, basinCtl.el, h('div', { class: 'btnrow' }, resetBtn));
  const next1 = h('a', { href: '#w-map', class: 'w-next' }, t('w.next2'));
  next1.addEventListener('click', (e) => {
    e.preventDefault();
    bm.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth' });
  });
  const b1 = h('section', { class: 'w-beat w-b1', 'aria-labelledby': 'w-b1-t' },
    h('h1', { id: 'w-b1-t' }, t('w.b1.t')),
    h('p', { class: 'w-lede' }, t('w.b1.d'), ' ', statusTag('SYNTHETIC')),
    h('div', { class: 'w-tabs', role: 'group', 'aria-label': 'View' }, viewBtns),
    stage, reads, result,
    h('div', { class: 'w-chips', role: 'group', 'aria-label': 'Wetland position' }, presetBtns, replayBtn),
    more, next1);

  // ---------- Beat 2: where the wetland protects most (precomputed map, checked live) ----------
  const mapCanvas = h('canvas', { class: 'w-map', tabindex: '0', role: 'img', 'aria-label': t('w.map.t') });
  const layerBtns = ['hotel', 'river'].map((k) => {
    const b = h('button', { type: 'button', class: 'w-chip', 'aria-pressed': String(view.layer === k), dataset: { layer: k } }, t('w.map.' + k));
    b.addEventListener('click', () => {
      view.layer = k;
      layerBtns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.layer === k)));
      drawMap();
      paintCheck();
    });
    return b;
  });
  const mapKey = h('p', { class: 'w-mapkey small' });
  const check = h('p', { class: 'w-check', 'aria-live': 'polite' });
  const mapFacts = h('p', { class: 'small muted' });
  const dcBox = h('div', { class: 'w-compute small' });
  const bm = h('section', { class: 'w-beat w-bm', id: 'w-map', 'aria-labelledby': 'w-bm-t' },
    h('h2', { id: 'w-bm-t' }, t('w.map.t')),
    h('p', { class: 'w-lede' }, t('w.map.d')),
    h('div', { class: 'w-chips', role: 'group', 'aria-label': t('w.map.t') }, layerBtns),
    mapCanvas, mapKey, check, mapFacts,
    h('details', { class: 'w-more', ontoggle: () => paintCompute() }, h('summary', {}, t('w.dc')), dcBox));

  // ---------- Beat 3: a thousand tomorrows, one better today ----------
  const fan = h('canvas', { class: 'w-fan', tabindex: '0', role: 'img', 'aria-label': t('w.b2.t') });
  const fanBox = h('div', { class: 'w-fanbox' }, fan);
  const b2lede = h('p', { class: 'w-lede' });
  const b2state = h('p', { class: 'w-state small', 'aria-live': 'polite' });
  const b2prog = h('progress', { class: 'w-prog', max: 1, value: 0, hidden: true });
  const pays = h('p', { class: 'w-pays' });
  const spread = h('p', { class: 'w-spread small' });
  const caption = h('p', { class: 'w-caption', 'aria-live': 'polite' });
  const freqCtl = segmented({ name: 'freq', label: t('w.storms'), options: FREQS.map((f) => ({ value: String(f.v), label: `${t('w.storms.' + f.key)} · ${f.v}` })) }, String(view.freq), (v) => {
    view.freq = Number(v);
    view.selected = null;
    startLoom();
  });
  const pickBtns = [['little', 0.05], ['median', 0.5], ['lot', 0.95]].map(([k, q]) => {
    const b = h('button', { type: 'button', class: 'w-chip small', dataset: { pick: k } }, t('w.future.' + k));
    b.addEventListener('click', () => selectQuantile(q));
    return b;
  });
  const fanTable = h('div', { class: 'w-table' });
  const lossA = h('b', { class: 'w-big base' }, '—');
  const lossB = h('b', { class: 'w-big alt' }, '—');
  const lossLblA = h('span', { class: 'w-num-l' });
  const lossLblB = h('span', { class: 'w-num-l' }, t('w.lossWet'));
  const protHotel = h('li', {});
  const protRiver = h('li', {});
  const payLine = h('p', { class: 'w-payline', 'aria-live': 'polite' });
  const pay90 = h('p', { class: 'w-breakeven small' });
  const capexDef = { name: 'capex', label: t('w.cost'), type: 'range', min: 0, max: 3000000, step: 25000, default: 400000, unit: 'US$' };
  if (view.capex === null) view.capex = E03_DEFAULTS().capex_usd;
  const capexCtl = slider(capexDef, view.capex, (v) => {
    view.capex = v;
    paintDecision();
    drawFan();
  });
  const computeBox = h('div', { class: 'w-compute small' });
  const b3 = h('div', { class: 'w-value', dataset: { state: 'computing' } },
    h('h3', { id: 'w-b3-t' }, t('w.b3.t')),
    h('div', { class: 'w-read' }, h('div', { class: 'w-num' }, lossLblA, lossA), h('div', { class: 'w-num' }, lossLblB, lossB)),
    h('p', { class: 'w-protects-t' }, t('w.protects')),
    h('ul', { class: 'w-protects' }, protHotel, protRiver),
    capexCtl.el, payLine, pay90,
    h('p', { class: 'small muted' }, statusTag('SYNTHETIC'), ' ', t('w.money')),
    h('details', { class: 'w-more', ontoggle: () => paintCompute() }, h('summary', {}, t('w.compute')), computeBox),
    h('details', { class: 'w-more' }, h('summary', {}, t('w.how')), howItWorks()));
  const b2 = h('section', { class: 'w-beat w-b2', id: 'w-futures', 'aria-labelledby': 'w-b2-t', dataset: { state: 'computing' } },
    h('h2', { id: 'w-b2-t' }, t('w.b2.t')),
    b2lede, b2state, b2prog, fanBox, pays, spread,
    h('div', { class: 'w-chips', role: 'group', 'aria-label': t('w.pick') }, pickBtns),
    caption,
    freqCtl.el,
    h('details', { class: 'w-more' }, h('summary', {}, 'Numbers by year'), fanTable),
    b3);

  const foot = h('nav', { class: 'w-foot', 'aria-label': 'More of ARUN' },
    h('a', { class: 'btn', href: '#lab' }, t('w.links.lab')),
    h('a', { class: 'btn ghost', href: '#tour' }, t('w.links.tour')),
    h('a', { class: 'btn ghost', href: '#compare' }, t('nav.compare')));

  const page = h('div', { class: 'wonder wrap' }, b1, bm, b2, foot);
  main.replaceChildren(page);

  // ---------- Region and drawing ----------
  let region = null, regionKey = '', crop = null, layerA = null, layerB = null;
  function ensureRegion() {
    const s = scenario.get();
    const key = s.seed + ':' + s.hydro.grid;
    if (key === regionKey) return;
    region = makeRegion(s.seed, s.hydro.grid, s.region.cellSize_m);
    regionKey = key;
    layerA = createWaterLayer(region.N);
    layerB = createWaterLayer(region.N);
    // The river corridor: the strips are cut around it, as wide as the screen's shape allows.
    const us = region.centerline.map((c) => c[0]).concat(region.assets.map((a) => (a.cell % region.N) / (region.N - 1)));
    crop = { centre: (Math.min(...us) + Math.max(...us)) / 2, min: Math.max(...us) - Math.min(...us) + 0.1 };
  }

  // Two strips fill the stage; a bar for the hour sits under them. The cut widens or narrows to fit.
  function geom() {
    const W = canvas.width, H = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const gap = 8 * dpr, bar = 30 * dpr;
    const sw = (W - gap) / 2;
    const room = Math.max(40, H - bar - 6 * dpr);
    const aspect = Math.min(1, Math.max(crop.min, sw / room));
    const x0 = Math.min(1 - aspect, Math.max(0, crop.centre - aspect / 2));
    const sh = Math.min(room, sw / aspect);
    const top = Math.max(0, (room - sh) / 2);
    return { dpr, gap, bar, sw, sh, W, H, cut: { x0, aspect }, a: { x: 0, y: top }, b: { x: sw + gap, y: top } };
  }

  const drops = [];
  const dropRng = makeRng(deriveSeed(s0.seed, 'wonder-rain'));
  let animT = 0;

  function roundRect(g, x, y, w, hh, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, hh, r);
    else g.rect(x, y, w, hh);
  }

  function drawStrip(g, G, at, layer, frame, withWet) {
    const N = region.N;
    const { sw, sh, dpr, cut } = G;
    const M = N * 4;
    g.save();
    roundRect(g, at.x, at.y, sw, sh, 14 * dpr);
    g.clip();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(terrainCanvas(region), cut.x0 * M, 0, cut.aspect * M, M, at.x, at.y, sw, sh);
    if (frame) g.drawImage(layer.canvas, cut.x0 * N, 0, cut.aspect * N, N, at.x, at.y, sw, sh);
    const px = (u) => at.x + ((u - cut.x0) / cut.aspect) * sw;
    const py = (w) => at.y + w * sh;
    const cellW = sw / (cut.aspect * N);
    const hy = scenario.get().hydro;
    if (withWet && hy.retentionCapacity_m3 > 0) {
      const cx = px((hy.interventionX * (N - 1) + 0.5) / N), cy = py((hy.interventionY * (N - 1) + 0.5) / N);
      const r = (hy.interventionRadius_cells + 0.5) * cellW;
      const fill = frame && frame.stored != null ? Math.min(1, frame.stored / hy.retentionCapacity_m3) : 0;
      g.fillStyle = `rgba(52,240,170,${0.18 + 0.42 * fill})`;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#7dffcf';
      g.lineWidth = 2.5 * dpr;
      g.setLineDash([6 * dpr, 4 * dpr]);
      g.stroke();
      g.setLineDash([]);
    }
    const raining = frame && frame.t < hy.stormDuration_h * 3600 && hy.stormIntensity_mm_h > 0;
    if (raining && playing && drops.length) {
      g.strokeStyle = 'rgba(225,242,255,0.5)';
      g.lineWidth = 1.1 * dpr;
      g.beginPath();
      for (const d of drops) {
        const x = at.x + d.x * sw, y = at.y + d.y * sh;
        g.moveTo(x, y);
        g.lineTo(x - 2 * dpr, y + 10 * dpr);
      }
      g.stroke();
    }
    region.assets.forEach((a, k) => {
      const ax = ((a.cell % N) + 0.5) / N, ay = (Math.floor(a.cell / N) + 0.5) / N;
      const x = px(ax), y = py(ay);
      const depth = frame ? frame.assets[k] : 0;
      const wet = depth > a.threshold_m;
      const hotel = a.id === 'hotel';
      const r = (hotel ? 12 : 5) * dpr;
      if (wet && hotel) {
        const pulse = playing ? 1 + 0.2 * Math.sin(animT * 5) : 1.1;
        g.fillStyle = 'rgba(255,82,96,0.38)';
        g.beginPath();
        g.arc(x, y, r * 2 * pulse, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = wet ? '#ff4d5e' : '#11142e';
      g.strokeStyle = wet ? '#ffffff' : '#ffc45e';
      g.lineWidth = (hotel ? 2.5 : 1.5) * dpr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (hotel) {
        g.fillStyle = '#fff';
        g.font = `700 ${12 * dpr}px ${token('--font-display')}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('H', x, y + 0.5 * dpr);
      }
    });
    g.restore();
  }

  // Cross-section through the hotel, west to east: ground, and the water on it, height stretched.
  // Two wide panels, one above the other: a section is wide, not tall.
  function sectionGeom() {
    const { W, H, dpr, bar } = geom();
    const gap = 10 * dpr;
    const ph = (H - bar - 6 * dpr - gap) / 2;
    return { a: { x: 0, y: 0, w: W, h: ph }, b: { x: 0, y: ph + gap, w: W, h: ph }, dpr };
  }

  function drawSection(g, P, frame, label, color, sum) {
    const N = region.N;
    const dpr = P.dpr;
    const at = P.box;
    const hotel = region.assets[0];
    const row = Math.floor(hotel.cell / N), hc = hotel.cell % N;
    // Widen from the hotel while the ground stays within 2.4 m of the hotel's floor: the river trough and its banks.
    const zH = region.z[hotel.cell];
    const low = (c) => region.z[row * N + c] < zH + 2.4;
    let c0 = hc, c1 = hc;
    while (c0 > 0 && hc - c0 < 14 && low(c0 - 1)) c0--;
    while (c1 < N - 1 && c1 - hc < 14 && low(c1 + 1)) c1++;
    c0 = Math.max(0, c0 - 1);
    c1 = Math.min(N - 1, c1 + 1);
    let zlo = Infinity;
    for (let c = c0; c <= c1; c++) zlo = Math.min(zlo, region.z[row * N + c]);
    zlo -= 0.4;
    const zhi = zH + 2.8;
    const X = (c) => at.x + ((c - c0 + 0.5) / (c1 - c0 + 1)) * at.w;
    const Y = (zz) => at.y + (1 - (Math.min(zhi, Math.max(zlo, zz)) - zlo) / (zhi - zlo)) * at.h;
    g.save();
    roundRect(g, at.x, at.y, at.w, at.h, 14 * dpr);
    g.clip();
    const sky = g.createLinearGradient(0, at.y, 0, at.y + at.h);
    sky.addColorStop(0, '#232f7a');
    sky.addColorStop(1, '#4a3278');
    g.fillStyle = sky;
    g.fillRect(at.x, at.y, at.w, at.h);
    if (frame) {
      g.fillStyle = 'rgba(64,196,255,0.95)';
      g.beginPath();
      for (let c = c0; c <= c1; c++) {
        const top = region.z[row * N + c] + frame.h[row * N + c];
        c === c0 ? g.moveTo(X(c), Y(top)) : g.lineTo(X(c), Y(top));
      }
      for (let c = c1; c >= c0; c--) g.lineTo(X(c), Y(region.z[row * N + c]));
      g.closePath();
      g.fill();
    }
    const earth = g.createLinearGradient(0, Y(zH), 0, at.y + at.h);
    earth.addColorStop(0, '#6aa83f');
    earth.addColorStop(0.06, '#4d7a2c');
    earth.addColorStop(0.25, '#6b4a2b');
    earth.addColorStop(1, '#2e1f12');
    g.fillStyle = earth;
    g.beginPath();
    g.moveTo(X(c0), at.y + at.h);
    for (let c = c0; c <= c1; c++) g.lineTo(X(c), Y(region.z[row * N + c]));
    g.lineTo(X(c1), at.y + at.h);
    g.closePath();
    g.fill();
    // the flood line at the hotel, and the hotel
    const ty = Y(zH + hotel.threshold_m);
    g.strokeStyle = '#ff6b7a';
    g.lineWidth = 1.5 * dpr;
    g.setLineDash([4 * dpr, 3 * dpr]);
    g.beginPath();
    g.moveTo(at.x, ty);
    g.lineTo(at.x + at.w, ty);
    g.stroke();
    g.setLineDash([]);
    const hx = X(hc), hy0 = Y(zH);
    const bw = 22 * dpr, bh = 20 * dpr;
    const wet = frame && frame.assets[0] > hotel.threshold_m;
    g.fillStyle = wet ? '#ff4d5e' : '#f4e6c8';
    g.fillRect(hx - bw / 2, hy0 - bh, bw, bh);
    g.fillStyle = '#1a1d44';
    g.beginPath();
    g.moveTo(hx - bw * 0.68, hy0 - bh);
    g.lineTo(hx, hy0 - bh - 10 * dpr);
    g.lineTo(hx + bw * 0.68, hy0 - bh);
    g.closePath();
    g.fill();
    g.fillStyle = wet ? '#fff' : '#1a1d44';
    g.font = `700 ${11 * dpr}px ${token('--font-display')}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', hx, hy0 - bh / 2);
    // label and the hotel's number
    g.fillStyle = 'rgba(6,8,26,0.72)';
    roundRect(g, at.x + 8 * dpr, at.y + 8 * dpr, at.w * 0.5, 24 * dpr, 8 * dpr);
    g.fill();
    g.fillStyle = color;
    g.font = `700 ${11.5 * dpr}px ${token('--font-display')}`;
    g.textAlign = 'left';
    g.fillText(label.toUpperCase(), at.x + 16 * dpr, at.y + 20 * dpr, at.w * 0.5 - 16 * dpr);
    const big = sum ? fmt(sum.hotelHoursAbove, 1) + ' h' : frame ? fmt(frame.assets[0], 2) + ' m' : '—';
    const small = sum ? t('w.badge.hours') : t('w.badge.now');
    const bx = at.x + 8 * dpr, by = at.y + at.h - 54 * dpr;
    g.fillStyle = 'rgba(6,8,26,0.72)';
    roundRect(g, bx, by, 130 * dpr, 46 * dpr, 10 * dpr);
    g.fill();
    g.textAlign = 'center';
    g.fillStyle = 'rgba(241,242,255,0.78)';
    g.font = `600 ${10.5 * dpr}px ${token('--font-text')}`;
    g.fillText(small, bx + 65 * dpr, by + 12 * dpr, 122 * dpr);
    g.fillStyle = wet && !sum ? '#ff6b7a' : color;
    g.font = `700 ${19 * dpr}px ${token('--font-display')}`;
    g.fillText(big, bx + 65 * dpr, by + 32 * dpr, 122 * dpr);
    g.restore();
  }

  // Water at the hotel through the storm: both valleys on one chart, the flood line across it.
  function drawGauge(g, G, A, B, i) {
    const { W, dpr, bar } = G;
    const H = G.H - bar - 6 * dpr;
    const L = 40 * dpr, R = 14 * dpr, T = 40 * dpr, Bt = 22 * dpr;
    const hy = scenario.get().hydro;
    const hotel = region.assets[0];
    let peak = 0.6;
    for (const f of [A, B]) for (const fr of f.frames) peak = Math.max(peak, fr.assets[0]);
    peak *= 1.1;
    const X = (tt) => L + (tt / (hy.simHours * 3600)) * (W - L - R);
    const Y = (d) => T + (1 - d / peak) * (H - T - Bt);
    g.fillStyle = '#0e1236';
    roundRect(g, 0, 0, W, H, 14 * dpr);
    g.fill();
    g.strokeStyle = 'rgba(166,176,255,0.16)';
    g.fillStyle = token('--muted');
    g.font = `${11 * dpr}px ${token('--font-data')}`;
    g.lineWidth = 1 * dpr;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let d = 0; d <= peak; d += 0.1) {
      g.beginPath();
      g.moveTo(L, Y(d));
      g.lineTo(W - R, Y(d));
      g.stroke();
      if (Math.round(d * 10) % 2 === 0) g.fillText(d.toFixed(1) + ' m', L - 5 * dpr, Y(d));
    }
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let hr = 0; hr <= hy.simHours; hr += 4) g.fillText(hr + ' h', X(hr * 3600), H - Bt + 5 * dpr);
    // stormy hours shaded
    g.fillStyle = 'rgba(120,160,255,0.08)';
    g.fillRect(X(0), T, X(hy.stormDuration_h * 3600) - X(0), H - T - Bt);
    // flood line
    g.strokeStyle = '#ff6b7a';
    g.setLineDash([5 * dpr, 4 * dpr]);
    g.beginPath();
    g.moveTo(L, Y(hotel.threshold_m));
    g.lineTo(W - R, Y(hotel.threshold_m));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#ff8a95';
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillText(t('w.gauge.flood'), L + 4 * dpr, Y(hotel.threshold_m) - 3 * dpr);
    const series = [[A, '#ff9a6b', 'rgba(255,154,107,0.22)'], [B, '#3ef0aa', 'rgba(62,240,170,0.22)']];
    for (const [F, line, fill] of series) {
      if (i < 0) break;
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(X(F.frames[0].t), Y(hotel.threshold_m));
      for (let k = 0; k <= i; k++) g.lineTo(X(F.frames[k].t), Y(Math.max(hotel.threshold_m, F.frames[k].assets[0])));
      g.lineTo(X(F.frames[i].t), Y(hotel.threshold_m));
      g.closePath();
      g.fill();
      g.strokeStyle = line;
      g.lineWidth = 3 * dpr;
      g.beginPath();
      for (let k = 0; k <= i; k++) (k ? g.lineTo : g.moveTo).call(g, X(F.frames[k].t), Y(F.frames[k].assets[0]));
      g.stroke();
    }
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = `700 ${12 * dpr}px ${token('--font-display')}`;
    g.fillStyle = '#ff9a6b';
    g.fillText(t('w.without').toUpperCase(), L, 10 * dpr);
    g.fillStyle = '#3ef0aa';
    g.fillText(t('w.wetland').toUpperCase(), L + g.measureText(t('w.without').toUpperCase()).width + 16 * dpr, 10 * dpr);
  }

  // Labels on the strips, the hotel's number at their foot, and one steady bar for the hour.
  function drawLabels(g, G, fa, fb) {
    const { dpr, sw, sh } = G;
    const font = token('--font-display');
    const sides = [[G.a, t('w.without'), '#ffa27a', fa], [G.b, t('w.wetland'), '#4ff5b6', fb]];
    for (const [at, label, color, fr] of sides) {
      g.fillStyle = 'rgba(6,8,26,0.7)';
      roundRect(g, at.x + 6 * dpr, at.y + 6 * dpr, sw - 12 * dpr, 24 * dpr, 8 * dpr);
      g.fill();
      g.fillStyle = color;
      g.font = `700 ${11.5 * dpr}px ${font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label.toUpperCase(), at.x + sw / 2, at.y + 18 * dpr, sw - 20 * dpr);
      // hotel number
      const A = frameStore.get(keys.base), B = frameStore.get(keys.alt);
      const fin = finished && A && B && A.summary && B.summary;
      const sum = fr === fa ? A && A.summary : B && B.summary;
      const big = fin ? fmt(sum.hotelHoursAbove, 1) + ' h' : fr ? fmt(fr.assets[0], 2) + ' m' : '—';
      const small = fin ? t('w.badge.hours') : t('w.badge.now');
      const bh = 50 * dpr;
      g.fillStyle = 'rgba(6,8,26,0.78)';
      roundRect(g, at.x + 6 * dpr, at.y + sh - bh - 6 * dpr, sw - 12 * dpr, bh, 10 * dpr);
      g.fill();
      g.fillStyle = 'rgba(241,242,255,0.78)';
      g.font = `600 ${10.5 * dpr}px ${token('--font-text')}`;
      g.fillText(small, at.x + sw / 2, at.y + sh - bh + 6 * dpr, sw - 20 * dpr);
      const wet = fin ? sum.hotelHoursAbove > 0 : fr && fr.assets[0] > hotelThreshold;
      g.fillStyle = wet && !fin ? '#ff6b7a' : color;
      g.font = `700 ${22 * dpr}px ${font}`;
      g.fillText(big, at.x + sw / 2, at.y + sh - 22 * dpr, sw - 20 * dpr);
    }
  }

  let barText = '';
  function drawBar(g, G, fa) {
    const { W, H, dpr, bar } = G;
    const hy = scenario.get().hydro;
    const y = H - bar;
    const frac = fa ? fa.t / (hy.simHours * 3600) : 0;
    g.fillStyle = 'rgba(166,176,255,0.14)';
    roundRect(g, 0, y + bar - 6 * dpr, W, 4 * dpr, 2 * dpr);
    g.fill();
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#a796ff');
    grad.addColorStop(0.5, '#ff6b8b');
    grad.addColorStop(1, '#ffb84d');
    g.fillStyle = grad;
    roundRect(g, 0, y + bar - 6 * dpr, Math.max(4 * dpr, W * frac), 4 * dpr, 2 * dpr);
    g.fill();
    // Whole hours only, so the words change once an hour of storm, not every frame.
    if (fa) {
      const hr = Math.floor(fa.t / 3600 + 1e-9);
      const raining = fa.t < hy.stormDuration_h * 3600 && hy.stormIntensity_mm_h > 0;
      barText = tf(raining ? 'w.bar.rain' : 'w.bar.dry', { h: hr, n: hy.simHours, r: fmt(hy.stormIntensity_mm_h * hy.forcingMultiplier, 0) });
    } else if (!barText) barText = t('w.clock.wait');
    g.fillStyle = 'rgba(241,242,255,0.86)';
    g.font = `600 ${11.5 * dpr}px ${token('--font-data')}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(barText, W / 2, y + 9 * dpr);
  }

  // ---------- Flood frames: stream, cache, play ----------
  const streams = new Map(); // frame key -> { handle, arm }
  let playIdx = 0, playing = false, finished = false, lastDrawn = -1;
  let keys = { base: '', alt: '', hydro: '' };

  function computeKeys() {
    const s = scenario.get();
    return {
      base: hashData({ seed: s.seed, N: s.hydro.grid, p: baselineParams(s.hydro), v: FLOW_VERSION }),
      alt: hashData({ seed: s.seed, N: s.hydro.grid, p: s.hydro, v: FLOW_VERSION, arm: 'intervention' }),
      hydro: scenario.inputHash('hydro'),
    };
  }

  // One worker per valley, so each keeps pace with playback on a slower phone.
  // The baseline valley ignores the wetland: its stream carries on, or is reused, across wetland moves.
  function ensureStream() {
    const s = scenario.get();
    const wanted = new Map([[keys.base, 'baseline'], [keys.alt, 'intervention']]);
    for (const [k, st] of streams) {
      if (wanted.has(k)) continue;
      st.handle.cancel();
      streams.delete(k);
      const e = frameStore.get(k);
      if (e && !e.done) frameStore.delete(k);
    }
    for (const [k, arm] of wanted) {
      if (frameStore.has(k)) continue;
      const entry = { frames: [], done: false, summary: null };
      frameStore.set(k, entry);
      trimStore();
      const mine = { arm };
      mine.handle = runJob('wonder.stream', { seed: s.seed, params: s.hydro, N: s.hydro.grid, arms: [arm] }, {
        useCache: false,
        timeoutMs: 240000,
        onFrame: (f) => {
          if (streams.get(k) !== mine) return;
          const d = f.arms[arm];
          entry.frames.push({ t: f.t, h: d.h, assets: d.assets, q: d.q, stored: d.stored });
        },
      });
      streams.set(k, mine);
      mine.handle.promise.then((r) => {
        if (streams.get(k) !== mine) return;
        streams.delete(k);
        entry.done = true;
        entry.summary = r.result.summaries[arm];
        entry.elapsedMs = r.elapsedMs;
        publishSingle();
        paintCheck();
        paintDecision();
      }).catch((e) => {
        if (streams.get(k) === mine) streams.delete(k);
        if (frameStore.get(k) === entry && !entry.done) frameStore.delete(k);
        if (!e.cancelled && !disposed) {
          result.textContent = 'The flood run stopped: ' + e.message;
          announce('The flood run stopped: ' + e.message, 'error');
        }
      });
    }
  }

  // Both arms finished for these inputs: share the result with E02/E03 in the lab, as E02 itself does.
  function publishSingle() {
    const A = frameStore.get(keys.base), B = frameStore.get(keys.alt);
    if (!(A && A.done && B && B.done)) return;
    const prev = scenario.getResult('E02');
    const curve = prev && prev.inputHash === keys.hydro ? prev.data.curve : sweepRows.get(keys.hydro) || null;
    if (prev && prev.inputHash === keys.hydro && prev.data.single) return;
    scenario.putResult('E02', { inputHash: keys.hydro, data: { single: { baseline: A.summary, intervention: B.summary }, curve }, elapsedMs: (A.elapsedMs || 0) + (B.elapsedMs || 0), where: 'Web Workers (route #wonder)' });
  }

  function restartPlayback(play) {
    playIdx = 0;
    finished = false;
    lastDrawn = -1;
    playing = !!play;
    result.textContent = '';
    stage.dataset.state = 'computing';
    if (playing) loop.start();
    paint(true);
  }

  function framesNow() {
    const A = frameStore.get(keys.base), B = frameStore.get(keys.alt);
    return { A, B, n: A && B ? Math.min(A.frames.length, B.frames.length) : 0 };
  }

  function paint(force = false) {
    if (!region || !canvas.width) return;
    const { A, B, n } = framesNow();
    const i = n ? Math.min(Math.floor(playIdx), n - 1) : -1;
    if (!force && i === lastDrawn && !(playing && drops.length)) return;
    lastDrawn = i;
    const fa = i >= 0 ? A.frames[i] : null, fb = i >= 0 ? B.frames[i] : null;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    const G = geom();
    if (view.flood === 'gauge') {
      drawGauge(g, G, A, B, i);
    } else if (view.flood === 'section') {
      const S = sectionGeom();
      const done = finished && A && B && A.summary && B.summary;
      drawSection(g, { dpr: S.dpr, box: S.a }, fa, t('w.without'), '#ffa27a', done ? A.summary : null);
      drawSection(g, { dpr: S.dpr, box: S.b }, fb, t('w.wetland'), '#4ff5b6', done ? B.summary : null);
    } else {
      if (fa) layerA.paint(fa.h);
      if (fb) layerB.paint(fb.h);
      drawStrip(g, G, G.a, layerA, fa, false);
      drawStrip(g, G, G.b, layerB, fb, true);
      drawLabels(g, G, fa, fb);
    }
    drawBar(g, G, fa);
    if (fa && !finished) {
      nowA.textContent = fmt(fa.assets[0], 2) + ' m';
      nowB.textContent = fmt(fb.assets[0], 2) + ' m';
    }
    stage.dataset.frame = String(i);
  }

  function showFinal() {
    const A = frameStore.get(keys.base), B = frameStore.get(keys.alt);
    if (!(A && A.done && B && B.done)) return;
    finished = true;
    stage.dataset.state = 'done';
    paint(true);
    const a = A.summary.hotelHoursAbove, b = B.summary.hotelHoursAbove;
    lblA.textContent = lblB.textContent = tf('w.hours', { d: fmt(hotelThreshold, 1) });
    nowA.textContent = fmt(a, 1) + ' h';
    nowB.textContent = fmt(b, 1) + ' h';
    nowA.classList.toggle('wet', a > 0);
    nowB.classList.toggle('wet', b > 0);
    const key = b < a - 0.1 ? 'w.result.better' : Math.abs(b - a) <= 0.1 ? 'w.result.same' : 'w.result.other';
    result.textContent = tf(key, { a: fmt(a, 1), b: fmt(b, 1), s: fmt(a - b, 1) });
    result.dataset.kind = key.split('.').pop();
    canvas.setAttribute('aria-label', `${t('w.b1.t')} ${result.textContent}`);
    if (A.summary.failed || B.summary.failed) result.textContent = A.summary.failed || B.summary.failed;
    announce(result.textContent, 'quiet');
    paintCheck();
    paintDecision();
  }

  // Reduced motion: no autoplay. Once the run is in, show the moment the hotel was deepest today.
  function showPeakStill() {
    const { A, n } = framesNow();
    if (!n) return;
    let best = 0;
    for (let i = 0; i < n; i++) if (A.frames[i].assets[0] > A.frames[best].assets[0]) best = i;
    playIdx = best;
    paint(true);
  }

  const loop = createLoop((dt) => {
    animT += dt;
    const { A, B, n } = framesNow();
    const hy = scenario.get().hydro;
    if (playing && n) {
      const last = A.done && B.done ? A.frames.length - 1 : Infinity;
      playIdx = Math.min(playIdx + dt * PLAY_FPS, n - 1);
      if (playIdx >= last) {
        playing = false;
        playIdx = last;
        paint(true);
        showFinal();
      }
    }
    const raining = playing && n && A.frames[Math.min(n - 1, Math.floor(playIdx))].t < hy.stormDuration_h * 3600;
    const target = raining ? Math.round(Math.min(160, hy.stormIntensity_mm_h * 2)) : 0;
    while (drops.length < target) drops.push({ x: dropRng.uniform(), y: dropRng.uniform() });
    if (drops.length > target) drops.length = target;
    for (const d of drops) {
      d.y += dt * (0.6 + hy.stormIntensity_mm_h / 110);
      d.x -= dt * 0.06;
      if (d.y > 1) {
        d.y = 0;
        d.x = dropRng.uniform();
      }
      if (d.x < 0) d.x += 1;
    }
    paint();
    if (!playing) {
      if (reduced() && n && !finished) {
        if (A.done && B.done) {
          showPeakStill();
          showFinal();
          loop.stop();
        }
      } else if (finished || !n) {
        if (finished) loop.stop();
      }
    }
  });
  cleanups.push(() => loop.dispose());

  function reduced() {
    return document.documentElement.dataset.motion === 'reduced';
  }

  // Pause the flood when it scrolls out of view; resume where it was.
  let stageVisible = true;
  if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        stageVisible = e.isIntersecting;
        if (!stageVisible) loop.stop();
        else if (playing || !finished) loop.start();
      }
    }, { threshold: 0.05 });
    io.observe(stage);
    cleanups.push(() => io.disconnect());
  }

  const ro = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== hh) {
      canvas.width = w;
      canvas.height = hh;
      paint(true);
    }
    const fr = fan.getBoundingClientRect();
    const fw = Math.max(1, Math.round(fr.width * dpr)), fh = Math.max(1, Math.round(fr.height * dpr));
    if (fan.width !== fw || fan.height !== fh) {
      fan.width = fw;
      fan.height = fh;
      drawFan();
    }
    const mr = mapCanvas.getBoundingClientRect();
    const mw = Math.max(1, Math.round(mr.width * dpr)), mh = Math.max(1, Math.round(mr.height * dpr));
    if (mapCanvas.width !== mw || mapCanvas.height !== mh) {
      mapCanvas.width = mw;
      mapCanvas.height = mh;
      drawMap();
    }
  });
  ro.observe(canvas);
  ro.observe(fan);
  ro.observe(mapCanvas);
  cleanups.push(() => ro.disconnect());

  // ---------- Moving the wetland ----------
  function safeSet(patch) {
    try {
      scenario.patch(patch, 'wonder');
    } catch (e) {
      announce(e.message, 'error');
    }
  }

  function moveWetland(u, w, how) {
    const x = Math.min(1, Math.max(0, Math.round(u * 100) / 100));
    const y = Math.min(1, Math.max(0, Math.round(w * 100) / 100));
    safeSet({ 'hydro.interventionX': x, 'hydro.interventionY': y });
    if (how === 'tap') announce(t('w.moved'), 'quiet');
  }

  function paintPresets() {
    const hy = scenario.get().hydro;
    presetBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(Math.abs(PRESETS[k].x - hy.interventionX) < 0.005 && Math.abs(PRESETS[k].y - hy.interventionY) < 0.005)));
  }

  // A tap, not a scroll: short, and the finger barely moved. Either valley takes the tap.
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointercancel', () => (down = null));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || !region) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 700;
    down = null;
    if (moved > 12 || !quick) return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const G = geom();
    let px = (e.clientX - r.left) * dpr;
    const py = (e.clientY - r.top) * dpr;
    if (px > G.b.x) px -= G.b.x;
    else if (px > G.sw) return;
    if (py - G.a.y > G.sh || px < 0 || py < G.a.y) return;
    if (view.flood !== 'map') return;
    moveWetland(G.cut.x0 + (px / G.sw) * G.cut.aspect, (py - G.a.y) / G.sh, 'tap');
  });
  canvas.addEventListener('keydown', (e) => {
    const hy = scenario.get().hydro;
    const d = 0.03;
    const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      restartPlayback(true);
      return;
    }
    if (!mv) return;
    e.preventDefault();
    moveWetland(hy.interventionX + mv[0], hy.interventionY + mv[1], 'key');
  });

  // ---------- Storm sweep (feeds beat 2) ----------
  let sweep = null; // { key, done, total, handles }
  function ensureSweep() {
    const key = keys.hydro;
    if (sweepRows.has(key)) {
      sweep = { key, done: 10, total: 10 };
      // A sweep made earlier in this visit: share it with the lab again, since another may have replaced it there.
      const prev = scenario.getResult('E02');
      if (!(prev && prev.inputHash === key && prev.data.curve)) {
        const A = frameStore.get(keys.base), B = frameStore.get(keys.alt);
        const single = A && A.done && B && B.done ? { baseline: A.summary, intervention: B.summary } : null;
        scenario.putResult('E02', { inputHash: key, data: { curve: sweepRows.get(key), single }, elapsedMs: 0, where: 'reused (route #wonder)' });
      }
      startLoom();
      return;
    }
    if (sweep && sweep.key === key) return;
    const s = scenario.get();
    const list = sweepJobs(s.seed, s.hydro, s.hydro.grid);
    const wanted = new Set(list.map((j) => 'wonder.arm:' + hashData(j.payload)));
    for (const [k, hd] of liveArms) {
      if (!wanted.has(k)) {
        hd.cancel();
        liveArms.delete(k);
      }
    }
    const mine = { key, done: 0, total: list.length, byKey: {}, ms: 0 };
    sweep = mine;
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    const K = Math.max(1, Math.min(5, cores - 2));
    let next = 0, active = 0;
    paintFutures();
    const pump = () => {
      if (sweep !== mine || disposed) return;
      while (active < K && next < list.length) {
        const j = list[next++];
        const jk = 'wonder.arm:' + hashData(j.payload);
        const hd = runJob('wonder.arm', j.payload, { timeoutMs: 240000 });
        if (!hd.cached) {
          active++;
          liveArms.set(jk, hd);
        }
        hd.promise.then((r) => {
          if (!hd.cached) active--;
          liveArms.delete(jk);
          if (sweep !== mine) return;
          mine.byKey[j.m + ':' + j.arm] = r.result;
          mine.ms += r.cached ? 0 : r.elapsedMs;
          mine.done++;
          if (mine.done === mine.total) {
            const rows = rowsFromArms(s.hydro, mine.byKey);
            sweepRows.set(key, rows);
            if (sweepRows.size > 8) sweepRows.delete(sweepRows.keys().next().value);
            const prev = scenario.getResult('E02');
            const single = prev && prev.inputHash === key ? prev.data.single : null;
            scenario.putResult('E02', { inputHash: key, data: { curve: rows, single }, elapsedMs: mine.ms, where: `Web Workers × ${K} (route #wonder)` });
            startLoom();
          }
          paintFutures();
          pump();
        }).catch((e) => {
          if (!hd.cached) active--;
          liveArms.delete(jk);
          if (e.cancelled || sweep !== mine || disposed) return;
          b2state.textContent = 'The storm sweep stopped: ' + e.message;
          pump();
        });
      }
    };
    pump();
  }

  // ---------- Futures (beat 2) ----------
  let loom = null; // { key, result, config, hazard, elapsedMs, cached }
  let loomJob = null;

  function E03_DEFAULTS() {
    const d = Object.fromEntries(E03_META.inputs.map((i) => [i.name, i.default]));
    delete d.useE02;
    return d;
  }

  function loomConfig() {
    return { ...E03_DEFAULTS(), freq_per_y: view.freq };
  }

  function startLoom() {
    const rows = sweepRows.get(keys.hydro);
    if (!rows) return paintFutures();
    const config = loomConfig();
    const hazard = hazardFromSweep(rows);
    const key = keys.hydro + ':' + hashData(config);
    if (loom && loom.key === key) return paintFutures();
    if (loomJob) loomJob.cancel();
    const mine = runJob('e03.loom', { config, seed: E03_SEED, hazard }, { timeoutMs: 120000 });
    loomJob = mine;
    paintFutures();
    mine.promise.then((r) => {
      if (loomJob !== mine || disposed) return;
      loomJob = null;
      loom = { key, result: r.result, config, hazard, elapsedMs: r.elapsedMs, cached: !!r.cached, rowsKey: keys.hydro, sv: savingsOf(r.result, config) };
      if (view.selected === null || view.selected >= r.result.paths) view.selected = quantilePath(0.5);
      paintFutures();
      paintDecision();
    }).catch((e) => {
      if (!e.cancelled && !disposed) b2state.textContent = 'The futures stopped: ' + e.message;
    });
  }

  function loomIsCurrent() {
    return !!loom && loom.key === keys.hydro + ':' + hashData(loomConfig());
  }

  // Savings per future: E03's running net benefit plus the cost already taken out of it.
  // S[p][t] = cum[p][t] + capex + opex · Σ_{k≤t} (1+d)^−k  =  Σ_{k≤t} (loss today − loss with wetland) · (1+d)^−k
  function savingsOf(result, config) {
    const { cum, paths: P, horizon: Hy } = result;
    const ann = new Float64Array(Hy + 1);
    for (let k = 1; k <= Hy; k++) ann[k] = ann[k - 1] + Math.pow(1 + config.discount, -k);
    const sav = new Float32Array(P * (Hy + 1));
    for (let p = 0; p < P; p++) for (let k = 0; k <= Hy; k++) sav[p * (Hy + 1) + k] = cum[p * (Hy + 1) + k] + config.capex_usd + config.opex_usd_y * ann[k];
    const band = [];
    const col = new Float64Array(P);
    for (let k = 0; k <= Hy; k++) {
      for (let p = 0; p < P; p++) col[p] = sav[p * (Hy + 1) + k];
      const sc = sortedCopy(col);
      band.push([k, quantileSorted(sc, 0.05), quantileSorted(sc, 0.5), quantileSorted(sc, 0.95)]);
    }
    const total = Float64Array.from(result.pvBase, (v, p) => v - result.pvAlt[p]);
    return { sav, band, ann, total, sorted: sortedCopy(total) };
  }

  function paintFutures() {
    const cur = loomIsCurrent();
    const state = cur ? 'current' : loom ? 'stale' : 'computing';
    b2.dataset.state = state;
    b3.dataset.state = state;
    b2.dataset.hash = cur ? keys.hydro : '';
    const cfg = loomConfig();
    b2lede.textContent = tf('w.b2.d', { n: cfg.paths.toLocaleString('en-US'), y: cfg.horizon_y });
    if (!cur) {
      const sw = sweep && sweep.key === keys.hydro ? sweep : null;
      const k = sw ? sw.done : 0, n = sw ? sw.total : 10;
      b2prog.hidden = false;
      b2prog.value = sw ? k / n : 0;
      b2state.textContent = loom ? tf('w.stale', { k, n }) : tf('w.first', { k, n });
    } else {
      b2prog.hidden = true;
      const sw = sweep && sweep.key === keys.hydro ? sweep : null;
      b2state.textContent = `${t('w.linked')} · ${loom.result.paths.toLocaleString('en-US')} × ${loom.result.horizon} y in ${fmt(loom.elapsedMs, 0)} ms${loom.cached ? ' (reused)' : ''} · storm sweep ${keys.hydro.slice(0, 8)}${sw && sw.ms ? ` (${fmt(sw.ms / 1000, 1)} s of worker time)` : ''}`;
    }
    if (loom) {
      const S = loom.sv.sorted;
      pays.textContent = tf('w.saves', { m: fmtMoney(quantileSorted(S, 0.5)), y: loom.result.horizon });
      spread.textContent = tf('w.saves.spread', { lo: fmtMoney(quantileSorted(S, 0.05)), hi: fmtMoney(quantileSorted(S, 0.95)) });
      paintCaption();
      paintFanTable();
    }
    drawFan();
  }

  function quantilePath(q) {
    const v = loom.sv.total;
    const idx = Array.from(v.keys()).sort((a, b) => v[a] - v[b]);
    return idx[Math.min(idx.length - 1, Math.max(0, Math.round(q * (idx.length - 1))))];
  }

  function selectQuantile(q) {
    if (!loom) return;
    view.selected = quantilePath(q);
    paintCaption();
    drawFan();
  }

  function paintCaption() {
    if (!loom || view.selected === null) return;
    const p = view.selected;
    const r = simulatePath(loom.config, E03_SEED, p, loom.hazard, true);
    let n = 0, mx = 0;
    for (const ev of r.events) for (const st of ev.storms) {
      n++;
      if (st.m > mx) mx = st.m;
    }
    const vars = { i: p + 1, n, y: loom.config.horizon_y, m: fmt(mx, 1), sv: fmtMoney(r.pvBase - r.pvAlt) };
    caption.textContent = tf(n ? 'w.caption' : 'w.caption0', vars);
    caption.dataset.path = String(p);
  }

  function fanGeom() {
    const W = fan.width, H = fan.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return { W, H, dpr, L: 46 * dpr, R: 10 * dpr, T: 16 * dpr, B: 24 * dpr };
  }

  // Rising lines: what the wetland has saved the hotel so far, year by year, in each future. The grey line is its cost.
  let fanScale = null;
  function drawFan() {
    const g = fan.getContext('2d');
    const { W, H, dpr, L, R, T, B } = fanGeom();
    g.clearRect(0, 0, W, H);
    if (!loom || W < 50) {
      g.fillStyle = token('--muted');
      g.font = `${13 * dpr}px ${token('--font-text')}`;
      g.fillText(t('w.clock.wait'), L, T + 24 * dpr);
      return;
    }
    const { paths: P, horizon: Hy } = loom.result;
    const { sav, band, ann } = loom.sv;
    const step = Math.max(1, Math.ceil(P / 160));
    const opex = loom.config.opex_usd_y;
    const cost = (k) => view.capex + opex * ann[k];
    let hi = Math.max(band[Hy][3], cost(Hy));
    const sel = view.selected;
    if (sel !== null) for (let k = 0; k <= Hy; k++) hi = Math.max(hi, sav[sel * (Hy + 1) + k]);
    hi = hi * 1.08 || 1;
    const lo = 0;
    const px = (k) => L + (k / Hy) * (W - L - R);
    const py = (v) => T + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - T - B);
    fanScale = { px, py, Hy, step };
    const stale = !loomIsCurrent();
    g.globalAlpha = stale ? 0.35 : 1;
    const raw = hi / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const stepV = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) || 10 * mag;
    g.strokeStyle = token('--grid');
    g.fillStyle = token('--muted');
    g.lineWidth = 1 * dpr;
    g.font = `${11 * dpr}px ${token('--font-data')}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = 0; v <= hi; v += stepV) {
      g.beginPath();
      g.moveTo(L, py(v));
      g.lineTo(W - R, py(v));
      g.stroke();
      g.fillText(axisMoney(v), L - 6 * dpr, py(v));
    }
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('US$', 2 * dpr, 0);
    g.textAlign = 'center';
    for (const k of [0, Math.round(Hy / 2), Hy]) g.fillText(k + ' y', Math.min(W - R - 12 * dpr, Math.max(L + 8 * dpr, px(k))), H - B + 6 * dpr);
    g.strokeStyle = token('--jade');
    g.lineWidth = 1 * dpr;
    g.globalAlpha = stale ? 0.1 : 0.22;
    for (let p = 0; p < P; p += step) {
      g.beginPath();
      for (let k = 0; k <= Hy; k++) {
        const x = px(k), y = py(sav[p * (Hy + 1) + k]);
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = stale ? 0.35 : 1;
    g.strokeStyle = token('--dawn');
    g.lineWidth = 2.5 * dpr;
    g.beginPath();
    band.forEach(([k, , m], i) => (i ? g.lineTo(px(k), py(m)) : g.moveTo(px(k), py(m))));
    g.stroke();
    g.setLineDash([4 * dpr, 4 * dpr]);
    g.lineWidth = 1.5 * dpr;
    for (const col of [1, 3]) {
      g.beginPath();
      band.forEach((b, i) => (i ? g.lineTo(px(b[0]), py(b[col])) : g.moveTo(px(b[0]), py(b[col]))));
      g.stroke();
    }
    // cost to restore and keep the wetland, present value, rising with upkeep
    g.strokeStyle = token('--muted');
    g.setLineDash([2 * dpr, 5 * dpr]);
    g.lineWidth = 2 * dpr;
    g.beginPath();
    for (let k = 0; k <= Hy; k++) (k ? g.lineTo(px(k), py(cost(k))) : g.moveTo(px(k), py(cost(k))));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = token('--muted');
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillText(t('w.costline'), px(0) + 4 * dpr, py(cost(0)) - 3 * dpr);
    if (sel !== null && sel < P) {
      g.strokeStyle = token('--fg');
      g.lineWidth = 3 * dpr;
      g.beginPath();
      for (let k = 0; k <= Hy; k++) {
        const x = px(k), y = py(sav[sel * (Hy + 1) + k]);
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    fan.setAttribute('aria-label', `${t('w.b2.t')} ${pays.textContent} ${spread.textContent}`);
  }

  // Tap the fan: the shown future nearest the finger at that year.
  fan.addEventListener('pointerup', (e) => {
    if (!loom || !fanScale) return;
    const r = fan.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    const { px, py, Hy, step } = fanScale;
    let k = Math.round(((x - px(0)) / (px(Hy) - px(0))) * Hy);
    k = Math.max(1, Math.min(Hy, k));
    const P = loom.result.paths, sav = loom.sv.sav;
    let best = 0, bd = Infinity;
    for (let p = 0; p < P; p += step) {
      const d = Math.abs(py(sav[p * (Hy + 1) + k]) - y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    view.selected = best;
    paintCaption();
    drawFan();
  });
  fan.addEventListener('keydown', (e) => {
    if (!loom) return;
    const step = Math.max(1, Math.ceil(loom.result.paths / 160));
    const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[e.key];
    if (!d) return;
    e.preventDefault();
    const base = view.selected === null ? 0 : view.selected - (view.selected % step);
    view.selected = (base + d + loom.result.paths) % loom.result.paths;
    paintCaption();
    drawFan();
  });

  function paintFanTable() {
    const rows = loom.sv.band.map(([k, a, m, c]) => h('tr', {}, h('td', {}, String(k)), h('td', {}, fmtMoney(a)), h('td', {}, fmtMoney(m)), h('td', {}, fmtMoney(c))));
    fanTable.replaceChildren(h('table', { class: 'dtable' },
      h('caption', { class: 'small muted' }, 'Flood costs the wetland has saved the hotel so far (present value), across all futures'),
      h('thead', {}, h('tr', {}, ['Year', '5% of futures', 'Middle', '95% of futures'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, rows)));
  }

  // ---------- What it saves, who it protects ----------
  function paintDecision() {
    const A = frameStore.get(keys.base), B = frameStore.get(keys.alt);
    if (A && A.done && B && B.done) {
      const q = (A.summary.peakQ_m3_s - B.summary.peakQ_m3_s) / A.summary.peakQ_m3_s;
      protRiver.textContent = tf('w.protects.river', { q: fmtPct(Math.max(0, q), 1) });
    } else protRiver.textContent = tf('w.protects.river', { q: '…' });
    if (!loom) {
      protHotel.textContent = tf('w.protects.hotel', { m: '…' });
      return;
    }
    const { nb, pvBase, pvAlt, horizon } = loom.result;
    const c0 = loom.config.capex_usd;
    const shift = view.capex - c0;
    const nb2 = new Float64Array(nb.length);
    for (let i = 0; i < nb.length; i++) nb2[i] = nb[i] - shift;
    const st = summarize(nb2, pvBase, pvAlt);
    lossLblA.textContent = tf('w.lossToday', { y: horizon });
    lossA.textContent = fmtMoney(st.meanLossBase);
    lossB.textContent = fmtMoney(st.meanLossAlt);
    protHotel.textContent = tf('w.protects.hotel', { m: fmtMoney(quantileSorted(loom.sv.sorted, 0.5)) });
    payLine.textContent = tf('w.payback', { c: fmtMoney(view.capex), p: fmtPct(st.pPositive, 0) });
    // Highest cost at which it pays for itself in 9 of 10 futures: the 10% quantile of benefit before cost.
    const v = sortedCopy(Float64Array.from(nb, (x) => x + c0));
    const c90 = v[v.length - Math.ceil(0.9 * v.length)];
    pay90.textContent = c90 > 0 ? tf('w.payback90', { c: fmtMoney(c90) }) : t('w.payback.small');
    b3.dataset.p = String(st.pPositive);
    paintCompute();
  }

  function paintCompute() {
    const mine = jobLog().filter((j) => j.at >= Date.now() - (performance.now() - started) - 1000);
    const sum = (name) => mine.filter((j) => j.name === name).reduce((a, j) => a + j.elapsedMs, 0);
    const n = (name) => mine.filter((j) => j.name === name).length;
    const flood = sum('wonder.arm') + sum('wonder.stream');
    const fut = sum('e03.loom');
    computeBox.replaceChildren(
      h('p', {}, `Measured in this visit on ${deviceLabel()}: ${n('wonder.arm')} storm runs and ${n('wonder.stream')} animated runs took ${fmt(flood / 1000, 1)} s of worker time; ${n('e03.loom')} sets of futures took ${fmt(fut / 1000, 2)} s. Runs already done in this visit are reused, not counted twice.`));
    // Scale, from measured times only; every step of arithmetic shown.
    const M = PMAP.meta;
    const perRunH = M.cpuHours / M.positions;
    const B = frameStore.get(keys.alt);
    const phoneS = B && B.done && B.elapsedMs ? B.elapsedMs / 1000 : null;
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    const cellsX = (20000 / 5) ** 2 / (96 * 96), stepsX = 100 / 5, spots = (20000 / 100) ** 2;
    const bigRunH = perRunH * cellsX * stepsX;
    const bigTotalH = bigRunH * spots;
    dcBox.replaceChildren(
      h('p', {}, `This map: ${M.positions.toLocaleString('en-US')} flood runs, ${fmt(M.cpuHours, 1)} CPU-hours, ${fmt(M.wallSeconds / 60, 0)} minutes on one ${M.machine.replace(/ × \d+$/, '')} laptop (${M.machine.match(/× (\d+)$/)?.[1] || '?'} cores), ${M.at.slice(0, 10)}.`),
      h('p', {}, phoneS ? `This device, one run: ${fmt(phoneS, 1)} s. The whole map here: about ${fmt((phoneS * M.positions) / Math.max(1, cores - 2) / 3600, 1)} hours on ${Math.max(1, cores - 2)} workers.` : 'This device: one run still computing.'),
      h('p', {}, `A 20 × 20 km river at 5 m cells: ${fmt(cellsX, 0)} × the cells of this valley in each run, and ${stepsX} × the time steps (a step must be short enough that water crosses one cell at most). About ${fmt(bigRunH, 0)} CPU-hours a run; one wetland spot every 100 m is ${spots.toLocaleString('en-US')} spots, about ${fmt(bigTotalH / 1000, 0)} thousand CPU-hours: some ${fmt(bigTotalH / 10000 / 24, 1)} days on 10,000 cores.`),
      h('p', { class: 'muted' }, 'Arithmetic from the laptop’s measured time with this simple solver, not a measurement on a server. Faster solvers and GPUs change the numbers, not the shape: every spot is a separate run, so the search spreads across as many cores as a building has.'));
  }

  // ---------- The map ----------
  const heat = document.createElement('canvas');
  heat.width = heat.height = PMAP_SIDE;
  function mapGeom() {
    const W = mapCanvas.width, H = mapCanvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const side = Math.min(W, H);
    return { dpr, side, x0: (W - side) / 2, y0: 0 };
  }

  function paintHeat() {
    const vals = view.layer === 'river' ? PMAP.riverPct : PMAP.hotelSaved_h;
    let mx = 0;
    for (const v of vals) if (v > mx) mx = v;
    const g = heat.getContext('2d');
    const img = g.createImageData(PMAP_SIDE, PMAP_SIDE);
    // Low protection: a faint teal; the most: near white. Spots that protect nothing stay clear.
    const lo = view.layer === 'river' ? [40, 120, 255] : [20, 170, 120];
    const mid = view.layer === 'river' ? [90, 210, 255] : [60, 240, 160];
    const top = [240, 255, 235];
    for (let i = 0; i < vals.length; i++) {
      const t01 = mx > 0 ? Math.max(0, vals[i]) / mx : 0;
      const o = i * 4;
      const c = t01 < 0.6 ? lo.map((v, k) => v + (mid[k] - v) * (t01 / 0.6)) : mid.map((v, k) => v + (top[k] - v) * ((t01 - 0.6) / 0.4));
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = t01 < 0.02 ? 0 : Math.round(250 * Math.pow(t01, 0.45));
    }
    g.putImageData(img, 0, 0);
    return mx;
  }

  function drawMap() {
    if (!region || !mapCanvas.width) return;
    const g = mapCanvas.getContext('2d');
    const { dpr, side, x0, y0 } = mapGeom();
    const N = region.N;
    g.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    g.save();
    g.beginPath();
    g.roundRect ? g.roundRect(x0, y0, side, side, 12 * dpr) : g.rect(x0, y0, side, side);
    g.clip();
    g.drawImage(terrainCanvas(region), x0, y0, side, side);
    g.fillStyle = 'rgba(8,10,30,0.5)';
    g.fillRect(x0, y0, side, side);
    const mx = paintHeat();
    // Position p (0–1) puts the wetland centre at cell p·(N−1); cell c spans [c, c+1]/N of the side.
    const a = (0.5 / N) * side, span = ((N - 1) / N) * side;
    g.imageSmoothingEnabled = true;
    g.drawImage(heat, x0 + a, y0 + a, span, span);
    const at = (x, y) => [x0 + ((x * (N - 1) + 0.5) / N) * side, y0 + ((y * (N - 1) + 0.5) / N) * side];
    region.assets.forEach((as) => {
      const [x, y] = at((as.cell % N) / (N - 1), Math.floor(as.cell / N) / (N - 1));
      const hotel = as.id === 'hotel';
      g.fillStyle = 'rgba(16,18,48,0.9)';
      g.strokeStyle = '#ffb84d';
      g.lineWidth = (hotel ? 2.5 : 1.5) * dpr;
      g.beginPath();
      g.arc(x, y, (hotel ? 10 : 4) * dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (hotel) {
        g.fillStyle = '#fff';
        g.font = `700 ${10 * dpr}px ${token('--font-display')}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('H', x, y + 0.5 * dpr);
      }
    });
    const bi = view.layer === 'river' ? PMAP.best.river : PMAP.best.hotel;
    const bp = positionOf(bi);
    const [bx, by] = at(bp.x, bp.y);
    g.strokeStyle = '#ffd27a';
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.arc(bx, by, 7 * dpr, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffd27a';
    g.font = `700 ${11 * dpr}px ${token('--font-display')}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(t('w.map.best'), bx + 10 * dpr, by);
    const hy = scenario.get().hydro;
    const [wx, wy] = at(hy.interventionX, hy.interventionY);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 2.5 * dpr;
    g.setLineDash([5 * dpr, 4 * dpr]);
    g.beginPath();
    g.arc(wx, wy, ((hy.interventionRadius_cells + 0.5) / N) * side, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.restore();
    const bv = view.layer === 'river' ? fmtPct(PMAP.riverPct[bi], 1) : fmt(PMAP.hotelSaved_h[bi], 1) + ' h';
    mapKey.textContent = tf(view.layer === 'river' ? 'w.map.key.river' : 'w.map.key.hotel', { best: bv });
    mapCanvas.dataset.max = String(mx);
    mapCanvas.dataset.best = `${bp.x},${bp.y}`;
    mapCanvas.setAttribute('aria-label', `${t('w.map.t')} ${mapKey.textContent}`);
  }

  // The map says one thing for the spot; this device computes the spot again and says whether it agrees.
  function paintCheck() {
    const s = scenario.get();
    const i = indexOf(s.hydro.interventionX, s.hydro.interventionY);
    const M = PMAP.meta;
    mapFacts.textContent = tf('w.map.facts', { n: M.positions.toLocaleString('en-US'), h: fmt(M.cpuHours, 1) });
    if (!mapApplies(s.seed, s.hydro)) {
      check.textContent = t('w.map.off');
      check.dataset.match = 'off';
      return;
    }
    const mapH = PMAP.hotelSaved_h[i], mapQ = PMAP.riverPct[i];
    const B = frameStore.get(keys.alt);
    const mv = { h: fmt(mapH, 2), q: fmtPct(mapQ, 1) };
    if (!(B && B.done)) {
      check.textContent = tf('w.map.checking', mv);
      check.dataset.match = 'pending';
      return;
    }
    const phoneSeconds = B.summary.hotelHoursAbove * 3600;
    const same = Math.abs(phoneSeconds - PMAP.hotelSeconds[i]) < 1e-6 && Math.abs(Math.round(B.summary.peakQ_m3_s * 10) / 10 - PMAP.peakQ[i]) < 1e-9;
    const ph = (M.baseHotelSeconds - phoneSeconds) / 3600;
    check.textContent = tf(same ? 'w.map.same' : 'w.map.diff', { ...mv, ph: fmt(ph, 2) });
    check.dataset.match = same ? 'yes' : 'no';
  }

  // Tap the map: the wetland goes there; the flood above reruns and this device checks the map.
  let mdown = null;
  mapCanvas.addEventListener('pointerdown', (e) => (mdown = { x: e.clientX, y: e.clientY, t: performance.now() }));
  mapCanvas.addEventListener('pointercancel', () => (mdown = null));
  mapCanvas.addEventListener('pointerup', (e) => {
    if (!mdown || !region) return;
    const moved = Math.hypot(e.clientX - mdown.x, e.clientY - mdown.y);
    const quick = performance.now() - mdown.t < 700;
    mdown = null;
    if (moved > 12 || !quick) return;
    const r = mapCanvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { side, x0, y0 } = mapGeom();
    const N = region.N;
    const fx = ((e.clientX - r.left) * dpr - x0) / side, fy = ((e.clientY - r.top) * dpr - y0) / side;
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return;
    moveWetland((fx * N - 0.5) / (N - 1), (fy * N - 0.5) / (N - 1), 'tap');
  });
  mapCanvas.addEventListener('keydown', (e) => {
    const hy = scenario.get().hydro;
    const mv = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key];
    if (e.key === 'Enter') {
      e.preventDefault();
      const b = positionOf(view.layer === 'river' ? PMAP.best.river : PMAP.best.hotel);
      moveWetland(b.x, b.y, 'key');
      return;
    }
    if (!mv) return;
    e.preventDefault();
    moveWetland(hy.interventionX + mv[0], hy.interventionY + mv[1], 'key');
  });

  function howItWorks() {
    return h('div', { class: 'prose small' },
      h('p', {}, `Flood: a seeded fictional valley (96 × 96 cells of 100 m) and a water model that conserves volume, from exhibit E02 (method ${E02_VERSION}). Both valleys get identical rain; the only difference is the wetland, a basin behind a 0.25 m weir. The hotel counts as flooded when water there is deeper than 0.2 m.`),
      h('p', {}, `Futures: the wetland's storm sweep (both valleys at five storm sizes) gives depth at the hotel for any storm. Exhibit E03 (method ${E03_VERSION}) then draws ${E03_DEFAULTS().paths.toLocaleString('en-US')} futures of storms with seeded randomness; both versions of a future see the same storms. Money is present value at ${fmtPct(E03_DEFAULTS().discount, 0)} a year, from a fictional depth–damage curve and a fictional cost of closure.`),
      h('p', {}, 'Map: the same wetland run ahead of time at all 10,201 positions the page can set (every 0.01 of the valley each way), for the first storm. When you move the wetland, this device runs that spot again; the line under the map says whether the two agree.'), h('p', {}, 'Limits: not a validated flood model, not a real place, not a forecast. Prices are invented for teaching.'),
      h('p', {}, h('a', { href: '#e02' }, 'E02 method and limits'), ' · ', h('a', { href: '#e03' }, 'E03 method and limits'), ' · ', h('a', { href: '#e07' }, 'Buyer’s desk'), ' · ', h('a', { href: '#sources' }, t('nav.sources'))));
  }

  // ---------- Wiring ----------
  function refresh(initial = false) {
    ensureRegion();
    const s = scenario.get();
    stormCtl.set(s.hydro.stormIntensity_mm_h);
    basinCtl.set(s.hydro.retentionCapacity_m3);
    paintPresets();
    const prev = keys;
    keys = computeKeys();
    const changed = prev.base !== keys.base || prev.alt !== keys.alt;
    ensureStream();
    if (changed || initial) {
      lblA.textContent = lblB.textContent = t('w.hotelNow');
      restartPlayback(!reduced());
      if (reduced()) loop.start(); // runs until the still is ready, then stops
    }
    ensureSweep();
    paintFutures();
    paintDecision();
    drawMap();
    paintCheck();
  }

  const unsub = scenario.subscribe((state, change) => {
    if (disposed || change.path.startsWith('result:')) return;
    refresh();
  });
  cleanups.push(unsub);

  refresh(true);
  stage.dataset.ready = '1';

  return {
    destroy() {
      disposed = true;
      clearTimeout(changeTimer);
      for (const [k, st] of streams) {
        st.handle.cancel();
        const e = frameStore.get(k);
        if (e && !e.done) frameStore.delete(k);
      }
      streams.clear();
      if (loomJob) loomJob.cancel();
      for (const [k, hd] of liveArms) {
        hd.cancel();
        liveArms.delete(k);
      }
      for (const f of cleanups) {
        try {
          f();
        } catch {}
      }
    },
  };
}
