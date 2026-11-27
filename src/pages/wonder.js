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
import { sortedCopy } from '../core/stats.js';
import { makeRegion, METHOD_VERSION as E02_VERSION } from '../kernels/e02.js';
import { hazardFromSweep, simulatePath, summarize, METHOD_VERSION as E03_VERSION } from '../kernels/e03.js';
import { meta as E03_META } from '../exhibits/e03.js';
import { terrainCanvas, createWaterLayer } from '../viz/watershed.js';
import { baselineParams, sweepJobs, rowsFromArms, FLOW_VERSION } from '../wonder/flow.js';

const PLAY_FPS = 7; // 15-minute frames per second: 1¾ simulated hours each second
const E03_SEED = 20261125; // E03's own default seed, so the lab shows the same futures
const PRESETS = [
  { key: 'above', x: 0.59, y: 0.44 },
  { key: 'hill', x: 0.65, y: 0.15 },
  { key: 'below', x: 0.55, y: 0.85 },
];
const FREQS = [
  { key: 'fewer', v: 0.2 },
  { key: 'as', v: 0.35 },
  { key: 'more', v: 0.7 },
];
const BARS = [0.5, 0.8, 0.95];

// Survives language switches and back/forward, like the scenario store.
const frameStore = new Map(); // key -> { frames, done, summary }
const sweepRows = new Map(); // hydro hash -> rows
const view = { freq: 0.35, capex: null, bar: 0.5, selected: null };
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
  const clock = h('div', { class: 'w-clock', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'w-stage', dataset: { state: 'computing' } },
    h('div', { class: 'w-heads', 'aria-hidden': 'true' }, h('span', { class: 'w-h base' }, t('w.today')), h('span', { class: 'w-h alt' }, t('w.wetland'))),
    canvas, clock);
  const nowA = h('b', { class: 'w-big base' }, '—');
  const nowB = h('b', { class: 'w-big alt' }, '—');
  const lblA = h('span', { class: 'w-num-l' }, t('w.hotelNow'));
  const lblB = h('span', { class: 'w-num-l' }, t('w.hotelNow'));
  const reads = h('div', { class: 'w-read' }, h('div', { class: 'w-num' }, lblA, nowA), h('div', { class: 'w-num' }, lblB, nowB));
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
  const next1 = h('a', { href: '#w-futures', class: 'w-next' }, t('w.next2'));
  next1.addEventListener('click', (e) => {
    e.preventDefault();
    b2.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth' });
  });
  const b1 = h('section', { class: 'w-beat w-b1', 'aria-labelledby': 'w-b1-t' },
    h('h1', { id: 'w-b1-t' }, t('w.b1.t')),
    h('p', { class: 'w-lede' }, t('w.b1.d'), ' ', statusTag('SYNTHETIC')),
    stage, reads, result,
    h('div', { class: 'w-chips', role: 'group', 'aria-label': 'Wetland position' }, presetBtns, replayBtn),
    more, next1);

  // ---------- Beat 2: the futures ----------
  const fan = h('canvas', { class: 'w-fan', tabindex: '0', role: 'img', 'aria-label': t('w.b2.t') });
  const fanBox = h('div', { class: 'w-fanbox' }, fan, h('div', { class: 'w-fan-note', 'aria-hidden': 'true' }));
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
  const pickBtns = [['median', 0.5], ['bad', 0.05], ['good', 0.95]].map(([k, q]) => {
    const b = h('button', { type: 'button', class: 'w-chip small', dataset: { pick: k } }, t('w.future.' + k));
    b.addEventListener('click', () => selectQuantile(q));
    return b;
  });
  const fanTable = h('div', { class: 'w-table' });
  const b2 = h('section', { class: 'w-beat w-b2', id: 'w-futures', 'aria-labelledby': 'w-b2-t', dataset: { state: 'computing' } },
    h('h2', { id: 'w-b2-t' }, t('w.b2.t')),
    b2lede, b2state, b2prog, fanBox, pays, spread,
    h('div', { class: 'w-chips', role: 'group', 'aria-label': t('w.pick') }, pickBtns),
    caption,
    freqCtl.el,
    h('details', { class: 'w-more' }, h('summary', {}, 'Numbers by year'), fanTable));

  // ---------- Beat 3: the decision ----------
  const lossA = h('b', { class: 'w-big base' }, '—');
  const lossB = h('b', { class: 'w-big alt' }, '—');
  const lossLblA = h('span', { class: 'w-num-l' });
  const lossLblB = h('span', { class: 'w-num-l' }, t('w.lossWet'));
  const verdictWord = h('b', { class: 'w-verdict-word' }, '—');
  const verdictLine = h('p', { class: 'w-verdict-line', 'aria-live': 'polite' });
  const breakeven = h('p', { class: 'w-breakeven small' });
  const capexDef = { name: 'capex', label: t('w.cost'), type: 'range', min: 0, max: 3000000, step: 25000, default: 400000, unit: 'US$' };
  if (view.capex === null) view.capex = E03_DEFAULTS().capex_usd;
  const capexCtl = slider(capexDef, view.capex, (v) => {
    view.capex = v;
    paintDecision();
  });
  const barCtl = segmented({ name: 'bar', label: t('w.bar'), options: BARS.map((b) => ({ value: String(b), label: fmtPct(b, 0) })) }, String(view.bar), (v) => {
    view.bar = Number(v);
    paintDecision();
  });
  const computeBox = h('div', { class: 'w-compute small' });
  const b3 = h('section', { class: 'w-beat w-b3', 'aria-labelledby': 'w-b3-t', dataset: { state: 'computing' } },
    h('h2', { id: 'w-b3-t' }, t('w.b3.t')),
    h('p', { class: 'w-lede' }, t('w.b3.d')),
    h('div', { class: 'w-read' }, h('div', { class: 'w-num' }, lossLblA, lossA), h('div', { class: 'w-num' }, lossLblB, lossB)),
    h('div', { class: 'w-verdict' }, verdictWord, verdictLine),
    capexCtl.el, barCtl.el, breakeven,
    h('p', { class: 'small muted' }, statusTag('SYNTHETIC'), ' ', t('w.money')),
    h('details', { class: 'w-more', ontoggle: () => paintCompute() }, h('summary', {}, t('w.compute')), computeBox),
    h('details', { class: 'w-more' }, h('summary', {}, t('w.how')), howItWorks()));

  const foot = h('nav', { class: 'w-foot', 'aria-label': 'More of ARUN' },
    h('a', { class: 'btn', href: '#lab' }, t('w.links.lab')),
    h('a', { class: 'btn ghost', href: '#tour' }, t('w.links.tour')),
    h('a', { class: 'btn ghost', href: '#compare' }, t('nav.compare')));

  const page = h('div', { class: 'wonder wrap' }, b1, b2, b3, foot);
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
    // Crop to the river corridor: the full valley is square; the corridor is a tall strip that suits a phone.
    const us = region.centerline.map((c) => c[0]).concat(region.assets.map((a) => (a.cell % region.N) / (region.N - 1)));
    const x0 = Math.max(0, Math.min(...us) - 0.16), x1 = Math.min(1, Math.max(...us) + 0.16);
    crop = { x0, x1, aspect: x1 - x0 };
    stage.style.setProperty('--w-aspect', String(2 * crop.aspect));
  }

  function geom() {
    const W = canvas.width, H = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const gap = 8 * dpr;
    const sw = (W - gap) / 2;
    const sh = Math.min(H, sw / crop.aspect);
    return { dpr, gap, sw, sh, a: { x: 0, y: 0 }, b: { x: sw + gap, y: 0 } };
  }

  const drops = [];
  const dropRng = makeRng(deriveSeed(s0.seed, 'wonder-rain'));
  let animT = 0;

  function drawStrip(g, G, at, layer, frame, withWet) {
    const N = region.N;
    const { sw, sh, dpr } = G;
    const M = N * 4;
    g.save();
    g.beginPath();
    g.roundRect ? g.roundRect(at.x, at.y, sw, sh, 12 * dpr) : g.rect(at.x, at.y, sw, sh);
    g.clip();
    g.drawImage(terrainCanvas(region), crop.x0 * M, 0, crop.aspect * M, M, at.x, at.y, sw, sh);
    if (frame) g.drawImage(layer.canvas, crop.x0 * N, 0, crop.aspect * N, N, at.x, at.y, sw, sh);
    const px = (u) => at.x + ((u - crop.x0) / crop.aspect) * sw;
    const py = (w) => at.y + w * sh;
    const cellW = sw / (crop.aspect * N);
    const hy = scenario.get().hydro;
    if (withWet && hy.retentionCapacity_m3 > 0) {
      const cx = px((Math.round(hy.interventionX * (N - 1)) + 0.5) / N), cy = py((Math.round(hy.interventionY * (N - 1)) + 0.5) / N);
      const r = (hy.interventionRadius_cells + 0.5) * cellW;
      const fill = frame && frame.stored != null ? Math.min(1, frame.stored / hy.retentionCapacity_m3) : 0;
      g.fillStyle = `rgba(62,224,154,${0.14 + 0.36 * fill})`;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(62,224,154,0.95)';
      g.lineWidth = 2.5 * dpr;
      g.setLineDash([6 * dpr, 4 * dpr]);
      g.stroke();
      g.setLineDash([]);
    }
    const raining = frame && frame.t < hy.stormDuration_h * 3600 && hy.stormIntensity_mm_h > 0;
    if (raining && playing && drops.length) {
      g.strokeStyle = 'rgba(210,235,255,0.42)';
      g.lineWidth = 1 * dpr;
      g.beginPath();
      for (const d of drops) {
        const x = at.x + d.x * sw, y = at.y + d.y * sh;
        g.moveTo(x, y);
        g.lineTo(x - 2 * dpr, y + 9 * dpr);
      }
      g.stroke();
    }
    // Assets: the hotel large and named, the others small.
    region.assets.forEach((a, k) => {
      const ax = ((a.cell % N) + 0.5) / N, ay = (Math.floor(a.cell / N) + 0.5) / N;
      const x = px(ax), y = py(ay);
      const depth = frame ? frame.assets[k] : 0;
      const wet = depth > a.threshold_m;
      const hotel = a.id === 'hotel';
      const r = (hotel ? 11 : 5) * dpr;
      if (wet && hotel) {
        const pulse = playing ? 1 + 0.22 * Math.sin(animT * 6) : 1.1;
        g.fillStyle = 'rgba(255,107,107,0.32)';
        g.beginPath();
        g.arc(x, y, r * 2 * pulse, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = wet ? '#ff6b6b' : 'rgba(16,18,48,0.9)';
      g.strokeStyle = wet ? '#fff' : '#ffb84d';
      g.lineWidth = (hotel ? 2.5 : 1.5) * dpr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (hotel) {
        g.fillStyle = '#fff';
        g.font = `700 ${11 * dpr}px ${token('--font-display')}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('H', x, y + 0.5 * dpr);
      }
    });
    g.restore();
    g.strokeStyle = 'rgba(166,176,255,0.4)';
    g.lineWidth = 1 * dpr;
    g.beginPath();
    g.roundRect ? g.roundRect(at.x + 0.5, at.y + 0.5, sw - 1, sh - 1, 12 * dpr) : g.rect(at.x, at.y, sw, sh);
    g.stroke();
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
    if (fa) layerA.paint(fa.h);
    if (fb) layerB.paint(fb.h);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    const G = geom();
    drawStrip(g, G, G.a, layerA, fa, false);
    drawStrip(g, G, G.b, layerB, fb, true);
    const hy = scenario.get().hydro;
    if (fa) {
      const hr = fa.t / 3600;
      clock.textContent = hr < hy.stormDuration_h && hy.stormIntensity_mm_h > 0
        ? tf('w.clock.rain', { h: fmt(hr, 1), n: hy.simHours, r: fmt(hy.stormIntensity_mm_h * hy.forcingMultiplier, 0) })
        : tf('w.clock.dry', { h: fmt(hr, 1), n: hy.simHours });
      nowA.textContent = fmt(fa.assets[0], 2) + ' m';
      nowB.textContent = fmt(fb.assets[0], 2) + ' m';
      nowA.classList.toggle('wet', fa.assets[0] > hotelThreshold);
      nowB.classList.toggle('wet', fb.assets[0] > hotelThreshold);
    } else {
      clock.textContent = t('w.clock.wait');
    }
    stage.dataset.frame = String(i);
  }

  function showFinal() {
    const A = frameStore.get(keys.base), B = frameStore.get(keys.alt);
    if (!(A && A.done && B && B.done)) return;
    finished = true;
    stage.dataset.state = 'done';
    const a = A.summary.hotelHoursAbove, b = B.summary.hotelHoursAbove;
    lblA.textContent = lblB.textContent = tf('w.hours', { d: fmt(hotelThreshold, 1) });
    nowA.textContent = fmt(a, 1) + ' h';
    nowB.textContent = fmt(b, 1) + ' h';
    nowA.classList.toggle('wet', a > 0);
    nowB.classList.toggle('wet', b > 0);
    const key = b < a - 0.1 ? 'w.result.better' : Math.abs(b - a) <= 0.1 ? 'w.result.same' : 'w.result.other';
    result.textContent = tf(key, { a: fmt(a, 1), b: fmt(b, 1) });
    result.dataset.kind = key.split('.').pop();
    canvas.setAttribute('aria-label', `${t('w.b1.t')} ${result.textContent}`);
    if (A.summary.failed || B.summary.failed) result.textContent = A.summary.failed || B.summary.failed;
    announce(result.textContent, 'quiet');
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
  });
  ro.observe(canvas);
  ro.observe(fan);
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
    if (py > G.sh || px < 0 || py < 0) return;
    moveWetland(crop.x0 + (px / G.sw) * crop.aspect, py / G.sh, 'tap');
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
      loom = { key, result: r.result, config, hazard, elapsedMs: r.elapsedMs, cached: !!r.cached, rowsKey: keys.hydro };
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
      const st = loom.result.stats;
      pays.textContent = tf('w.paysIn', { p: fmtPct(st.pPositive, 0) });
      spread.textContent = tf('w.spread', { m: fmtMoney(st.median), lo: fmtMoney(st.q05), hi: fmtMoney(st.q95) });
      paintCaption();
      paintFanTable();
    }
    drawFan();
  }

  function quantilePath(q) {
    const nb = loom.result.nb;
    const idx = Array.from(nb.keys()).sort((a, b) => nb[a] - nb[b]);
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
    for (const ev of r.events) for (const s of ev.storms) {
      n++;
      if (s.m > mx) mx = s.m;
    }
    const vars = { i: p + 1, n, y: loom.config.horizon_y, m: fmt(mx, 1), nb: fmtMoney(r.nb) };
    caption.textContent = tf(n ? 'w.caption' : 'w.caption0', vars);
    caption.dataset.path = String(p);
  }

  function fanGeom() {
    const W = fan.width, H = fan.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return { W, H, dpr, L: 46 * dpr, R: 10 * dpr, T: 16 * dpr, B: 24 * dpr };
  }

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
    const { cum, paths: P, horizon: Hy, band } = loom.result;
    const step = Math.max(1, Math.ceil(P / 160));
    let lo = Infinity, hi = -Infinity;
    for (const [, a, , c] of band) {
      lo = Math.min(lo, a);
      hi = Math.max(hi, c);
    }
    const sel = view.selected;
    if (sel !== null) for (let k = 0; k <= Hy; k++) {
      lo = Math.min(lo, cum[sel * (Hy + 1) + k]);
      hi = Math.max(hi, cum[sel * (Hy + 1) + k]);
    }
    const pad = (hi - lo) * 0.12 || 1;
    lo -= pad;
    hi += pad;
    const px = (k) => L + (k / Hy) * (W - L - R);
    const py = (v) => T + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - T - B);
    fanScale = { px, py, Hy, step, lo, hi };
    const stale = !loomIsCurrent();
    g.globalAlpha = stale ? 0.35 : 1;
    // axes: round ticks, zero among them when it is in range
    const span = hi - lo;
    const raw = span / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const stepV = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) || 10 * mag;
    g.strokeStyle = token('--grid');
    g.fillStyle = token('--muted');
    g.lineWidth = 1 * dpr;
    g.font = `${11 * dpr}px ${token('--font-data')}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = Math.ceil(lo / stepV) * stepV; v <= hi; v += stepV) {
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
    // paths
    const jade = token('--jade'), rose = token('--rose');
    g.lineWidth = 1 * dpr;
    for (let p = 0; p < P; p += step) {
      const end = cum[p * (Hy + 1) + Hy];
      g.strokeStyle = end > 0 ? jade : rose;
      g.globalAlpha = (stale ? 0.12 : 0.28);
      g.beginPath();
      for (let k = 0; k <= Hy; k++) {
        const x = px(k), y = py(cum[p * (Hy + 1) + k]);
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = stale ? 0.35 : 1;
    // band and median
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
    g.setLineDash([]);
    // zero line
    g.strokeStyle = token('--fg');
    g.lineWidth = 1 * dpr;
    g.beginPath();
    g.moveTo(L, py(0));
    g.lineTo(W - R, py(0));
    g.stroke();
    // selected path
    if (sel !== null && sel < P) {
      g.strokeStyle = token('--fg');
      g.lineWidth = 3 * dpr;
      g.beginPath();
      for (let k = 0; k <= Hy; k++) {
        const x = px(k), y = py(cum[sel * (Hy + 1) + k]);
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    fan.setAttribute('aria-label', `${t('w.b2.t')} ${pays.textContent} ${spread.textContent}`);
  }

  // Tap the fan: the shown path nearest the finger at that year.
  fan.addEventListener('pointerup', (e) => {
    if (!loom || !fanScale) return;
    const r = fan.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    const { px, py, Hy, step } = fanScale;
    let k = Math.round(((x - px(0)) / (px(Hy) - px(0))) * Hy);
    k = Math.max(1, Math.min(Hy, k));
    const { cum, paths: P } = loom.result;
    let best = 0, bd = Infinity;
    for (let p = 0; p < P; p += step) {
      const d = Math.abs(py(cum[p * (Hy + 1) + k]) - y);
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
    const rows = loom.result.band.map(([k, a, m, c]) => h('tr', {}, h('td', {}, String(k)), h('td', {}, fmtMoney(a)), h('td', {}, fmtMoney(m)), h('td', {}, fmtMoney(c))));
    fanTable.replaceChildren(h('table', { class: 'dtable' },
      h('caption', { class: 'small muted' }, 'Running net benefit of the wetland (present value), across all futures'),
      h('thead', {}, h('tr', {}, ['Year', '5% of futures', 'Middle', '95% of futures'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, rows)));
  }

  // ---------- Decision (beat 3) ----------
  function paintDecision() {
    if (!loom) return;
    const { nb, pvBase, pvAlt, horizon } = loom.result;
    const c0 = loom.config.capex_usd;
    const shift = view.capex - c0;
    const nb2 = new Float64Array(nb.length);
    for (let i = 0; i < nb.length; i++) nb2[i] = nb[i] - shift;
    const st = summarize(nb2, pvBase, pvAlt);
    lossLblA.textContent = tf('w.lossToday', { y: horizon });
    lossA.textContent = fmtMoney(st.meanLossBase);
    lossB.textContent = fmtMoney(st.meanLossAlt);
    const ok = st.pPositive >= view.bar;
    verdictWord.textContent = ok ? t('w.build') : t('w.wait');
    verdictWord.dataset.ok = String(ok);
    verdictLine.textContent = tf(ok ? 'w.verdict.yes' : 'w.verdict.no', { c: fmtMoney(view.capex), p: fmtPct(st.pPositive, 0), bar: fmtPct(view.bar, 0) });
    // Highest cost that still clears the bar: the (1 − bar) quantile of benefit before cost.
    const v = sortedCopy(Float64Array.from(nb, (x) => x + c0));
    const need = Math.ceil(view.bar * v.length);
    const cmax = need > 0 ? v[v.length - need] : Infinity;
    breakeven.textContent = cmax > 0 ? tf('w.breakeven', { bar: fmtPct(view.bar, 0), c: fmtMoney(cmax) }) : tf('w.breakeven.never', { bar: fmtPct(view.bar, 0) });
    b3.dataset.p = String(st.pPositive);
    paintCompute();
  }

  function paintCompute() {
    const mine = jobLog().filter((j) => j.at >= Date.now() - (performance.now() - started) - 1000);
    const sum = (name) => mine.filter((j) => j.name === name).reduce((a, j) => a + j.elapsedMs, 0);
    const n = (name) => mine.filter((j) => j.name === name).length;
    const flood = sum('wonder.arm') + sum('wonder.stream');
    const fut = sum('e03.loom');
    const total = flood + fut;
    const cpuH1000 = (total / 3.6e6) * 1000;
    computeBox.replaceChildren(
      h('p', {}, `Measured in this visit on ${deviceLabel()}: ${n('wonder.arm')} storm runs and ${n('wonder.stream')} animated runs took ${fmt(flood / 1000, 1)} s of worker time; ${n('e03.loom')} sets of futures took ${fmt(fut / 1000, 2)} s. Runs already done in this visit are reused, not counted twice.`),
      h('p', {}, total > 0
        ? `One hotel, one wetland: ${fmt(total / 1000, 1)} s here. The same work for 1,000 sites is about ${fmt(cpuH1000, 1)} CPU-hours: this device's time × 1,000, arithmetic only, not measured on a server.`
        : 'Nothing computed in this visit yet: the results on screen were reused from earlier in the visit.'),
      h('p', { class: 'muted' }, 'Why compute matters here: each wetland position is ten full flood runs; each storm assumption is a thousand futures. A site study would add surveyed terrain, finer cells and many more storms.'));
  }

  function howItWorks() {
    return h('div', { class: 'prose small' },
      h('p', {}, `Flood: a seeded fictional valley (96 × 96 cells of 100 m) and a water model that conserves volume, from exhibit E02 (method ${E02_VERSION}). Both valleys get identical rain; the only difference is the wetland, a basin behind a 0.25 m weir. The hotel counts as flooded when water there is deeper than 0.2 m.`),
      h('p', {}, `Futures: the wetland's storm sweep (both valleys at five storm sizes) gives depth at the hotel for any storm. Exhibit E03 (method ${E03_VERSION}) then draws ${E03_DEFAULTS().paths.toLocaleString('en-US')} futures of storms with seeded randomness; both versions of a future see the same storms. Money is present value at ${fmtPct(E03_DEFAULTS().discount, 0)} a year, from a fictional depth–damage curve and a fictional cost of closure.`),
      h('p', {}, 'Limits: not a validated flood model, not a real place, not a forecast. Prices are invented for teaching.'),
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
