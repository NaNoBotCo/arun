// #mornings (candidate B: the street map first, then the city in minutes) and
// #minutes (candidate C: the city in minutes first, the streets behind it on request).
// One fictional city, three changes, 512 seeded mornings. Numbers from src/mornings/city.js; drawing in draw.js.

import { h } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { runJob, deviceLabel } from '../core/jobs.js';
import { createLoop } from '../core/loop.js';
import {
  N, W, OPTIONS, PLACES, EXAMPLE_START, EDGES, ORIGINS, world, solve, tripPath, pathMinutes, savings, timeLayout, tripRecord, replay,
  typicalMorning, leastUsefulMorning, DEFAULT_MORNING, DEFAULT_OPTION, METHOD_VERSION, FIXTURE_HASH, SEED_BASE,
} from '../mornings/city.js';
import { createRenderer, INK } from '../mornings/draw.js';
import { GEOMETRY_VERSION } from '../mornings/geometry.js';

const COUNT = 512;
const RACE_MIN_PER_S = 10; // simulated minutes per second of the race
const ASSUME = { places: 300, changes: 30, pick: 3 };

// Survives language switches and moves between the two openings.
const keep = { option: DEFAULT_OPTION, place: 0, start: EXAMPLE_START[0], userStart: false, morning: DEFAULT_MORNING, lens: 'strands', view: {}, introDone: {} };
const results = { run: null, meta: null, bench: null };

function tf(key, vars = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : '{' + k + '}'));
}
// *words* in a line become emphasis.
function rich(text) {
  return text.split('*').map((part, i) => (i % 2 ? h('em', {}, part) : part));
}
const rainKey = (r) => (r < 0.33 ? 0 : r < 0.66 ? 1 : 2);
const q = (sorted, p) => sorted[Math.floor(p * (sorted.length - 1))];
const fmt1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
const fmt2 = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
const choose = (n, k) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
};

function page(main, variant) {
  let disposed = false;
  const cleanups = [];
  const reduced = () => document.documentElement.dataset.motion === 'reduced';
  const dprNow = () => Math.min(2, window.devicePixelRatio || 1);
  if (!keep.view[variant]) keep.view[variant] = variant === 'c' ? 'time' : 'geo';
  let viewMode = keep.view[variant];

  // ---------- Beat 1: the city ----------
  const canvas = h('canvas', { class: 'm-canvas', tabindex: '0', role: 'img' });
  const tagMorning = h('span', { class: 'm-tag' }, '');
  const tagFiction = h('span', { class: 'm-tag', title: 'Data status: Synthetic' }, t('m.tag.fiction'));
  const tripBig = h('b', { class: 'm-big' }, '—');
  const tripLine = h('span', { class: 'm-line' }, '');
  const allBig = h('b', { class: 'm-big m-all' }, '—');
  const panel = h('div', { class: 'm-panel' },
    h('div', { class: 'm-p1' }, tripBig, h('span', { class: 'm-pl' }, t('m.trip.saved')), tripLine),
    h('div', { class: 'm-p2' }, allBig, h('span', { class: 'm-pl' }, t('m.all.saved'))));
  const tags = h('div', { class: 'm-tags' }, tagMorning, tagFiction);
  const stage = h('div', { class: 'm-stage', dataset: { view: viewMode } }, canvas, tags, panel);
  const summary = h('p', { class: 'sr-only', 'aria-live': 'polite' });

  const viewOrder = variant === 'c' ? ['time', 'geo'] : ['geo', 'time'];
  const viewBtns = viewOrder.map((k) => {
    const b = h('button', { type: 'button', class: 'm-tab', 'aria-pressed': String(viewMode === k), dataset: { view: k } }, t('m.view.' + k));
    b.addEventListener('click', () => setView(k));
    return b;
  });
  const placeBtns = PLACES.map((pl, k) => {
    const b = h('button', { type: 'button', class: 'm-chip', 'aria-pressed': String(keep.place === k), dataset: { place: pl.key } }, t('m.place.' + pl.key));
    b.addEventListener('click', () => setPlace(k));
    return b;
  });
  const optBtns = OPTIONS.map((o, k) => {
    const b = h('button', { type: 'button', class: 'm-opt', 'aria-pressed': String(keep.option === k), dataset: { opt: o.key } },
      h('span', { class: 'm-opt-n' }, t('m.opt.' + o.key)), h('span', { class: 'm-opt-d' }, t('m.optd.' + o.key)));
    b.addEventListener('click', () => setOption(k));
    return b;
  });
  const hint = h('p', { class: 'm-hint' });
  const resetBtn = h('button', { type: 'button', class: 'm-reset' }, t('m.reset'));
  resetBtn.addEventListener('click', () => {
    keep.userStart = false;
    keep.morning = DEFAULT_MORNING;
    keep.place = 0;
    keep.start = EXAMPLE_START[0];
    placeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === 0)));
    setOption(DEFAULT_OPTION);
  });
  const legend = h('p', { class: 'm-legend' },
    h('span', { class: 'm-key today' }, t('m.legend.today')),
    h('span', { class: 'm-key change' }, t('m.legend.change')), resetBtn);

  const title = variant === 'c' ? 'm.c.t' : 'm.b.t';
  const lede = variant === 'c' ? 'm.c.d' : 'm.b.d';
  const b1 = h('section', { class: 'm-beat m-b1', 'aria-labelledby': 'm-b1-t' },
    h('h1', { id: 'm-b1-t' }, rich(t(title))),
    h('p', { class: 'm-lede' }, t(lede)),
    h('div', { class: 'm-play' }, stage,
      h('div', { class: 'm-side' },
        h('p', { class: 'm-choose', id: 'm-choose' }, t('m.choose')),
        h('div', { class: 'm-opts', role: 'group', 'aria-labelledby': 'm-choose' }, optBtns),
        h('div', { class: 'm-row' }, h('div', { class: 'm-tabs', role: 'group', 'aria-label': t('m.viewl') }, viewBtns),
          h('div', { class: 'm-places', role: 'group', 'aria-label': t('m.to') }, h('span', { class: 'm-to' }, t('m.to')), placeBtns)),
        legend, hint)),
    summary);

  // ---------- Beat 2: 512 mornings ----------
  const lens = h('canvas', { class: 'm-lens', tabindex: '0', role: 'img' });
  const lensState = h('p', { class: 'm-lens-state' });
  const lensBtns = ['strands', 'dots'].map((k) => {
    const b = h('button', { type: 'button', class: 'm-tab', 'aria-pressed': String(keep.lens === k), dataset: { lens: k } }, t('m.lens.' + k));
    b.addEventListener('click', () => {
      keep.lens = k;
      lensBtns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.lens === k)));
      drawLens();
    });
    return b;
  });
  const selInfo = h('div', { class: 'm-sel' }, h('span', {}, '—'), h('b', {}, '—'));
  const statEls = ['median', 'share', 'p10'].map((k) => h('div', { class: 'm-stat' }, h('b', {}, '—'), h('span', {}, t('m.st.' + k))));
  const cmpBox = h('div', { class: 'm-cmp', hidden: true });
  const typicalBtn = h('button', { type: 'button', class: 'm-chip' }, t('m.typical'));
  const leastBtn = h('button', { type: 'button', class: 'm-chip' }, t('m.least'));
  const cmpBtn = h('button', { type: 'button', class: 'm-chip', 'aria-expanded': 'false' }, t('m.compare'));
  typicalBtn.addEventListener('click', () => results.run && setMorning(typicalMorning(savings(results.run, keep.option))));
  leastBtn.addEventListener('click', () => results.run && setMorning(leastUsefulMorning(savings(results.run, keep.option))));
  cmpBtn.addEventListener('click', () => {
    cmpBox.hidden = !cmpBox.hidden;
    cmpBtn.setAttribute('aria-expanded', String(!cmpBox.hidden));
    paintCompare();
  });
  const b2 = h('section', { class: 'm-beat m-b2', 'aria-labelledby': 'm-b2-t', dataset: { state: 'computing' } },
    h('h2', { id: 'm-b2-t' }, t('m.b2.t')),
    h('p', { class: 'm-lede' }, t('m.b2.d')),
    h('div', { class: 'm-tabs', role: 'group', 'aria-label': t('m.lensl') }, lensBtns),
    h('div', { class: 'm-lensbox' }, lens, lensState),
    selInfo,
    h('div', { class: 'm-stats' }, statEls),
    h('div', { class: 'm-chips' }, typicalBtn, leastBtn, cmpBtn),
    cmpBox);

  // ---------- Beat 3: why a data center ----------
  const ranLine = h('p', { class: 'm-ran' }, '');
  const arith = h('ol', { class: 'm-arith small' });
  const recPre = h('pre', { class: 'm-rec' });
  const recCheck = h('p', { class: 'small m-recok' });
  const copyBtn = h('button', { type: 'button', class: 'btn small' }, t('m.copy'));
  copyBtn.addEventListener('click', () => {
    const txt = recPre.textContent;
    const done = () => (copyBtn.textContent = '✓ ' + t('m.copy'));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => {});
  });
  const b3 = h('section', { class: 'm-beat m-b3', 'aria-labelledby': 'm-b3-t' },
    h('h2', { id: 'm-b3-t' }, t('m.b3.t')),
    ranLine, arith,
    h('p', { class: 'small muted' }, 'Arithmetic from the assumptions in the list, not a server measurement. Reusing searches and dropping weak changes early cut it; the size of that cut is unmeasured here.'),
    h('details', { class: 'm-more' }, h('summary', {}, t('m.how')), howItWorks()),
    h('details', { class: 'm-more' }, h('summary', {}, t('m.rec')), recCheck, recPre, h('div', { class: 'btnrow' }, copyBtn)),
    h('p', { class: 'm-strap' }, t('strap1')));

  const root = h('div', { class: 'mornings wrap', dataset: { variant } }, b1, b2, b3);
  main.replaceChildren(root);

  // ---------- computed state for the chosen morning ----------
  let detail = null; // { w, today, changed }
  function computeDetail() {
    const w = world(keep.morning - 1);
    detail = { w, today: solve(w, -1), changed: solve(w, keep.option) };
  }

  // ---------- animation: tweens on corner positions, the map's mode, and the race ----------
  const R = createRenderer(canvas);
  const anim = { m: viewMode === 'time' ? 1 : 0, s: viewMode === 'time' ? 1 : 0, posA: null, posB: null, tau: null };
  let tweens = [];
  let race = null; // { t0, end }
  let rings = { max: 40, pxPerMin: 1 };
  let layouts = null; // { A, B }
  const loop = createLoop(() => frame());
  cleanups.push(() => loop.dispose());
  let pending = 0;

  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  function tweenNum(key, to, dur, delay = 0) {
    tweens = tweens.filter((tw) => tw.key !== key);
    if (reduced() || dur === 0) {
      anim[key] = to;
      return;
    }
    tweens.push({ key, from: anim[key], to, t0: performance.now() + delay, dur });
  }
  function tweenArr(key, to, dur, delay = 0) {
    tweens = tweens.filter((tw) => tw.key !== key);
    if (!anim[key] || reduced() || dur === 0) {
      anim[key] = Float64Array.from(to);
      return;
    }
    tweens.push({ key, from: Float64Array.from(anim[key]), to: Float64Array.from(to), t0: performance.now() + delay, dur, arr: true });
  }
  function frame() {
    const now = performance.now();
    const left = [];
    for (const tw of tweens) {
      const p = Math.max(0, Math.min(1, (now - tw.t0) / tw.dur));
      const e = ease(p);
      if (tw.arr) {
        const out = anim[tw.key];
        for (let i = 0; i < out.length; i++) out[i] = tw.from[i] + (tw.to[i] - tw.from[i]) * e;
      } else anim[tw.key] = tw.from + (tw.to - tw.from) * e;
      if (p < 1) left.push(tw);
    }
    tweens = left;
    if (race) {
      anim.tau = Math.min(race.end, ((now - race.t0) / 1000) * RACE_MIN_PER_S);
      if (anim.tau >= race.end) race = null;
    }
    paint();
    if (!tweens.length && !race) loop.stop();
  }
  function kick() {
    if (disposed) return;
    if (tweens.length || race) loop.start();
    else if (!pending)
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (!disposed) paint();
      });
  }
  cleanups.push(() => cancelAnimationFrame(pending));

  function computeLayouts() {
    if (!R.ready || !detail) return;
    const dA = detail.today.dist[keep.place];
    const dB = detail.changed.dist[keep.place];
    let mx = 0;
    for (let i = 0; i < N; i++) mx = Math.max(mx, dA[i], dB[i]);
    const max = Math.max(30, Math.ceil(mx / 10) * 10);
    const anchor = PLACES[keep.place].node;
    // One scale for both maps, set so today's (the wider) fills the frame; the centre shifts to fit it.
    const unit = timeLayout(R.geo, dA, anchor, 0, 0, 1);
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (let i = 0; i < N; i++) {
      x0 = Math.min(x0, unit[2 * i]);
      x1 = Math.max(x1, unit[2 * i]);
      y0 = Math.min(y0, unit[2 * i + 1]);
      y1 = Math.max(y1, unit[2 * i + 1]);
    }
    const fr = R.frame();
    const k = 0.9 * Math.min(fr.w / Math.max(1, x1 - x0), fr.h / Math.max(1, y1 - y0));
    const ox = fr.x + fr.w / 2 - (k * (x0 + x1)) / 2;
    const oy = fr.y + fr.h / 2 - (k * (y0 + y1)) / 2;
    rings = { max, pxPerMin: k, cx: ox, cy: oy };
    layouts = { A: timeLayout(R.geo, dA, anchor, ox, oy, k), B: timeLayout(R.geo, dB, anchor, ox, oy, k) };
  }

  function startRace() {
    if (!detail) return;
    const a = detail.today.dist[keep.place][keep.start];
    const b = detail.changed.dist[keep.place][keep.start];
    if (reduced()) {
      race = null;
      anim.tau = Math.max(a, b);
      return;
    }
    anim.tau = 0;
    race = { t0: performance.now() + 250, end: Math.max(a, b) };
  }

  // ---------- painting ----------
  function paint() {
    if (!R.ready || !detail || !anim.posA) return;
    const pl = keep.place;
    const A = detail.today;
    const B = detail.changed;
    const routeA = tripPath(A.prev[pl], A.dist[pl], keep.start);
    const routeB = tripPath(B.prev[pl], B.dist[pl], keep.start);
    R.paint({
      m: anim.m,
      s: anim.s,
      posA: anim.posA,
      posB: anim.posB,
      option: keep.option,
      place: pl,
      start: keep.start,
      routeA,
      routeB,
      minsA: routeA ? pathMinutes(routeA, A.dist[pl]) : null,
      minsB: routeB ? pathMinutes(routeB, B.dist[pl]) : null,
      tau: anim.tau,
      rings,
      startTrip: { a: fmt1(A.dist[pl][keep.start]) + ' min', b: fmt1(B.dist[pl][keep.start]) + ' min' },
      labels: {
        places: PLACES.map((p) => t('m.place.' + p.key)),
        start: t('m.start'),
        option: t('m.opt.' + OPTIONS[keep.option].key),
        ring: (mm) => tf('m.ring', { m: mm }),
      },
    });
  }

  function paintNumbers() {
    if (!detail) return;
    const pl = keep.place;
    const a = detail.today.dist[pl][keep.start];
    const b = detail.changed.dist[pl][keep.start];
    const rain = t('m.rain.' + rainKey(detail.w.rain));
    const place = t('m.place.' + PLACES[pl].key);
    tagMorning.textContent = tf('m.tag.morning', { n: keep.morning }) + ' · ' + rain;
    tripBig.textContent = fmt1(a - b) + ' min';
    tripLine.textContent = tf('m.trip.line', { a: fmt1(a), b: fmt1(b), place });
    allBig.textContent = fmt2(detail.today.mean - detail.changed.mean) + ' min';
    const s = tf('m.sum', { n: keep.morning, rain, option: t('m.opt.' + OPTIONS[keep.option].key), place, a: fmt1(a), b: fmt1(b), avg: fmt2(detail.today.mean - detail.changed.mean) });
    summary.textContent = s;
    canvas.setAttribute('aria-label', (viewMode === 'time' ? t('m.view.time') : t('m.view.geo')) + '. ' + s);
    hint.textContent = viewMode === 'time' ? tf('m.hint.time', { place }) : t('m.hint');
    paintRecord();
  }

  // ---------- changes ----------
  function settle(dur) {
    computeLayouts();
    if (!layouts) return;
    if (viewMode === 'time') {
      tweenArr('posA', layouts.A, dur);
      tweenArr('posB', layouts.B, dur);
    } else {
      tweenArr('posA', R.geo, dur);
      tweenArr('posB', R.geo, dur);
      startRace();
    }
    paintNumbers();
    kick();
  }

  function setView(k) {
    if (k === viewMode) return;
    viewMode = k;
    keep.view[variant] = k;
    stage.dataset.view = k;
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === k)));
    computeLayouts();
    if (!layouts) return;
    race = null;
    if (k === 'time') {
      // The streets fold into minutes as today's network, then the change pulls the corners in.
      anim.tau = null;
      tweenNum('m', 1, 800);
      tweenArr('posA', layouts.A, 900);
      tweenArr('posB', layouts.A, 900);
      tweenNum('s', 0, 0);
      tweenArr('posB', layouts.B, 1200, 1100);
      if (reduced()) anim.posB = Float64Array.from(layouts.B);
      tweenNum('s', 1, 1200, 1100);
    } else {
      tweenNum('m', 0, 900);
      tweenNum('s', 0, 700);
      tweenArr('posA', R.geo, 900);
      tweenArr('posB', R.geo, 900);
      anim.tau = 0;
      race = reduced() ? null : { t0: performance.now() + 900, end: Math.max(detail.today.dist[keep.place][keep.start], detail.changed.dist[keep.place][keep.start]) };
      if (reduced()) startRace();
    }
    paintNumbers();
    kick();
  }

  function setOption(k) {
    keep.option = k;
    optBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)));
    computeDetail();
    settle(900);
    drawLens();
    paintStats();
  }

  function setPlace(k) {
    keep.place = k;
    placeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)));
    if (!keep.userStart) keep.start = EXAMPLE_START[k];
    settle(900);
  }

  function setMorning(n) {
    keep.morning = n;
    computeDetail();
    settle(700);
    drawLens();
  }

  function setStart(node) {
    if (node < 0 || node === keep.start) return;
    keep.start = node;
    keep.userStart = true;
    if (viewMode === 'geo') startRace();
    paintNumbers();
    kick();
  }

  // Tap or click: move the pin to the nearest corner.
  canvas.addEventListener('click', (e) => {
    if (!R.ready) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) * canvas.width) / r.width;
    const y = ((e.clientY - r.top) * canvas.height) / r.height;
    const p = R.pick(x, y, anim);
    if (p.dist < 48 * dprNow()) setStart(p.node);
  });
  canvas.addEventListener('keydown', (e) => {
    const x = keep.start % W;
    const y = Math.floor(keep.start / W);
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (viewMode === 'geo') {
        startRace();
        kick();
      }
      return;
    }
    if (!mv) return;
    e.preventDefault();
    const nx = Math.max(0, Math.min(W - 1, x + mv[0]));
    const ny = Math.max(0, Math.min(N / W - 1, y + mv[1]));
    setStart(ny * W + nx);
  });

  // ---------- sizing ----------
  const ro = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    const d = dprNow();
    const w = Math.max(1, Math.round(r.width * d));
    const hh = Math.max(1, Math.round(r.height * d));
    if (canvas.width === w && canvas.height === hh && R.ready) return;
    canvas.width = w;
    canvas.height = hh;
    const top = (tags.offsetHeight + 12) * d;
    const bottom = (panel.offsetHeight + 12) * d;
    R.resize(w, hh, d, top, bottom);
    computeLayouts();
    const first = !anim.posA;
    if (viewMode === 'time') {
      if (first && !keep.introDone[variant] && !reduced()) {
        // Opening on minutes: today's city first, then the change pulls it in.
        anim.posA = Float64Array.from(layouts.A);
        anim.posB = Float64Array.from(layouts.A);
        anim.m = 1;
        anim.s = 0;
        tweenArr('posB', layouts.B, 1400, 700);
        tweenNum('s', 1, 1400, 700);
      } else {
        anim.posA = Float64Array.from(layouts.A);
        anim.posB = Float64Array.from(layouts.B);
        anim.m = 1;
        anim.s = 1;
      }
    } else {
      anim.posA = Float64Array.from(R.geo);
      anim.posB = Float64Array.from(R.geo);
      anim.m = 0;
      anim.s = 0;
      if (first && !keep.introDone[variant]) startRace();
      else anim.tau = Math.max(detail.today.dist[keep.place][keep.start], detail.changed.dist[keep.place][keep.start]);
    }
    keep.introDone[variant] = true;
    tweens = tweens.filter((tw) => !first || tw.t0 > performance.now()); // drop stale tweens sized for the old canvas
    kick();
  });
  ro.observe(canvas);
  cleanups.push(() => ro.disconnect());

  // ---------- Beat 2 drawing ----------
  let lensGeom = null;
  function lensSize() {
    const r = lens.getBoundingClientRect();
    const d = dprNow();
    const w = Math.max(1, Math.round(r.width * d));
    const hh = Math.max(1, Math.round(r.height * d));
    if (lens.width !== w || lens.height !== hh) {
      lens.width = w;
      lens.height = hh;
    }
    return d;
  }
  function drawLens() {
    const run = results.run;
    const d = lensSize();
    const g = lens.getContext('2d');
    const w = lens.width;
    const hh = lens.height;
    g.clearRect(0, 0, w, hh);
    g.fillStyle = '#0b2421';
    g.fillRect(0, 0, w, hh);
    if (!run) return;
    const k = keep.option;
    const sav = savings(run, k);
    const plot = { x: 40 * d, y: 22 * d, w: w - 52 * d, h: hh - 54 * d };
    const font = (s, wt = 400) => `${wt} ${s * d}px 'ARUN Text', ui-sans-serif, system-ui, sans-serif`;
    g.font = font(11);
    g.fillStyle = '#b8d3c8';
    const sel = keep.morning - 1;
    const least = leastUsefulMorning(sav) - 1;
    if (keep.lens === 'strands') {
      const order = Array.from({ length: run.count }, (_, i) => i).sort((a, b) => run.base[a] - run.base[b] || a - b);
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < run.count; i++) {
        lo = Math.min(lo, run.base[i], ...run.alt.map((a) => a[i]));
        hi = Math.max(hi, run.base[i], ...run.alt.map((a) => a[i]));
      }
      lo = Math.floor(lo / 5) * 5;
      hi = Math.ceil(hi / 5) * 5;
      const Y = (v) => plot.y + ((hi - v) / (hi - lo)) * plot.h;
      for (let v = lo; v <= hi; v += 5) {
        g.strokeStyle = 'rgba(184, 211, 200, 0.14)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(plot.x, Y(v));
        g.lineTo(plot.x + plot.w, Y(v));
        g.stroke();
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.fillStyle = '#b8d3c8';
        g.fillText(String(v), plot.x - 6 * d, Y(v));
      }
      const sw = plot.w / run.count;
      const smax = Math.max(0.5, ...sav);
      const xs = new Float64Array(run.count);
      order.forEach((j, rank) => {
        const x = plot.x + (rank + 0.5) * sw;
        xs[j] = x;
        const f = Math.max(0, Math.min(1, sav[j] / smax));
        g.strokeStyle = `rgba(${Math.round(90 + (77 - 90) * f)}, ${Math.round(120 + (240 - 120) * f)}, ${Math.round(112 + (168 - 112) * f)}, ${0.45 + 0.5 * f})`;
        g.lineWidth = Math.max(1, sw * 0.9);
        g.beginPath();
        g.moveTo(x, Y(run.base[j]));
        g.lineTo(x, Y(run.alt[k][j]));
        g.stroke();
        g.fillStyle = INK.today;
        g.fillRect(x - Math.max(0.5, sw * 0.45), Y(run.base[j]) - 1 * d, Math.max(1, sw * 0.9), 2 * d);
      });
      // Least useful: a mark under the axis. Chosen morning: drawn last, bright.
      g.fillStyle = '#ff9db4';
      g.beginPath();
      g.moveTo(xs[least], plot.y + plot.h + 4 * d);
      g.lineTo(xs[least] - 5 * d, plot.y + plot.h + 12 * d);
      g.lineTo(xs[least] + 5 * d, plot.y + plot.h + 12 * d);
      g.fill();
      const x = xs[sel];
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3 * d;
      g.beginPath();
      g.moveTo(x, Y(run.base[sel]));
      g.lineTo(x, Y(run.alt[k][sel]));
      g.stroke();
      for (const [v, c] of [[run.base[sel], INK.today], [run.alt[k][sel], INK.change]]) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, Y(v), 5 * d, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#0b2421';
        g.lineWidth = 2 * d;
        g.stroke();
      }
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = '#d9efe4';
      g.fillText(t('m.lens.axisY'), plot.x, 4 * d);
      g.textAlign = 'center';
      g.fillText(t('m.lens.axisX'), plot.x + plot.w / 2, plot.y + plot.h + 16 * d);
      lensGeom = { kind: 'strands', plot, order, sw };
    } else {
      const top = Math.max(0.5, Math.ceil(Math.max(...sav) * 2) / 2);
      const X = (v) => plot.x + (Math.max(0, v) / top) * plot.w;
      const Y = (r) => plot.y + (1 - r) * plot.h;
      for (let i = 0; i <= 4; i++) {
        const x = plot.x + (plot.w * i) / 4;
        g.strokeStyle = 'rgba(184, 211, 200, 0.14)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, plot.y);
        g.lineTo(x, plot.y + plot.h);
        g.stroke();
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillStyle = '#b8d3c8';
        g.fillText(((top * i) / 4).toFixed(1), x, plot.y + plot.h + 4 * d);
      }
      const pts = new Float64Array(2 * run.count);
      for (let i = 0; i < run.count; i++) {
        const x = X(sav[i]);
        const y = Y(run.rain[i]);
        pts[2 * i] = x;
        pts[2 * i + 1] = y;
        g.fillStyle = sav[i] >= 1 ? 'rgba(77, 240, 168, 0.65)' : 'rgba(255, 207, 110, 0.7)';
        g.beginPath();
        g.arc(x, y, 2.6 * d, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2.5 * d;
      g.beginPath();
      g.arc(pts[2 * sel], pts[2 * sel + 1], 8 * d, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#ff9db4';
      g.lineWidth = 2 * d;
      g.beginPath();
      g.arc(pts[2 * least], pts[2 * least + 1], 6 * d, 0, Math.PI * 2);
      g.stroke();
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = '#d9efe4';
      g.fillText(t('m.dots.wet'), plot.x, 4 * d);
      g.textBaseline = 'bottom';
      g.fillText(t('m.dots.dry'), plot.x + 4 * d, plot.y + plot.h - 2 * d);
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(t('m.dots.axisX'), plot.x + plot.w / 2, plot.y + plot.h + 18 * d);
      lensGeom = { kind: 'dots', pts };
    }
    const sv = sav[sel];
    selInfo.firstChild.textContent = tf('m.sel', { n: keep.morning, rain: t('m.rain.' + rainKey(run.rain[sel])) });
    selInfo.lastChild.textContent = tf('m.selv', { v: fmt2(sv) });
    lens.setAttribute('aria-label', t('m.b2.t') + ' ' + selInfo.textContent);
  }
  function pickLens(e) {
    if (!results.run || !lensGeom) return;
    const r = lens.getBoundingClientRect();
    const x = ((e.clientX - r.left) * lens.width) / r.width;
    const y = ((e.clientY - r.top) * lens.height) / r.height;
    if (lensGeom.kind === 'strands') {
      const rank = Math.max(0, Math.min(results.run.count - 1, Math.floor((x - lensGeom.plot.x) / lensGeom.sw)));
      setMorning(lensGeom.order[rank] + 1);
    } else {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < results.run.count; i++) {
        const dd = Math.hypot(lensGeom.pts[2 * i] - x, lensGeom.pts[2 * i + 1] - y);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      setMorning(best + 1);
    }
  }
  lens.addEventListener('click', pickLens);
  lens.addEventListener('keydown', (e) => {
    if (!results.run || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    if (lensGeom && lensGeom.kind === 'strands') {
      const rank = lensGeom.order.indexOf(keep.morning - 1);
      const nr = Math.max(0, Math.min(results.run.count - 1, rank + step));
      setMorning(lensGeom.order[nr] + 1);
    } else setMorning(Math.max(1, Math.min(results.run.count, keep.morning + step)));
  });
  const lro = new ResizeObserver(() => drawLens());
  lro.observe(lens);
  cleanups.push(() => lro.disconnect());

  function paintStats() {
    const run = results.run;
    if (!run) return;
    const s = Array.from(savings(run, keep.option)).sort((a, b) => a - b);
    statEls[0].firstChild.textContent = fmt2(q(s, 0.5)) + ' min';
    statEls[1].firstChild.textContent = Math.round((s.filter((v) => v >= 1).length / s.length) * 100) + '%';
    statEls[2].firstChild.textContent = fmt2(q(s, 0.1)) + ' min';
    paintCompare();
  }
  function paintCompare() {
    if (cmpBox.hidden || !results.run) return;
    const rows = OPTIONS.map((o, k) => {
      const s = Array.from(savings(results.run, k)).sort((a, b) => a - b);
      return h('tr', { 'aria-current': k === keep.option ? 'true' : null }, h('th', { scope: 'row' }, t('m.opt.' + o.key)), h('td', {}, fmt2(q(s, 0.5))), h('td', {}, fmt2(q(s, 0.1))), h('td', {}, Math.round((s.filter((v) => v >= 1).length / s.length) * 100) + '%'));
    });
    cmpBox.replaceChildren(
      h('table', { class: 'm-table' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, t('m.cmp.median')), h('th', {}, t('m.cmp.p10')), h('th', {}, t('m.cmp.share')))), h('tbody', {}, rows)),
      h('p', { class: 'small muted' }, t('m.cmp.note')));
  }

  // ---------- Beat 3 ----------
  function paintCompute() {
    const m = results.meta;
    if (!m) return;
    ranLine.textContent = tf('m.b3.ran', { s: m.searches.toLocaleString('en-US'), n: COUNT, sec: (m.elapsedMs / 1000).toFixed(2) }) + ` (${m.where}, ${m.device}).`;
    const b = results.bench;
    if (!b) {
      arith.replaceChildren(h('li', {}, 'Timing a city-sized search on this device…'));
      return;
    }
    const nets = choose(ASSUME.changes, ASSUME.pick) + 1;
    const searches = nets * ASSUME.places * COUNT;
    const hours = (searches * b.msMedian) / 1000 / 3600;
    arith.replaceChildren(
      h('li', {}, `A city near the size of a ${b.corners.toLocaleString('en-US')}-corner street grid. One search on that grid here: ${b.msMedian.toFixed(1)} ms (measured just now, median of ${b.searches}).`),
      h('li', {}, `${ASSUME.places} places people go, from clinics to markets. One search per place gives every home's trip there.`),
      h('li', {}, `${ASSUME.changes} changes on the table, tried ${ASSUME.pick} at a time: ${(nets - 1).toLocaleString('en-US')} combinations, plus today: ${nets.toLocaleString('en-US')} networks. Some changes pay off only together, so sets are searched, not single changes.`),
      h('li', {}, `${COUNT} mornings each.`),
      h('li', {}, h('b', {}, `${nets.toLocaleString('en-US')} × ${ASSUME.places} × ${COUNT} = ${searches.toLocaleString('en-US')} searches × ${b.msMedian.toFixed(1)} ms ≈ ${Math.round(hours).toLocaleString('en-US')} CPU-hours for one refresh.`)));
  }

  function paintRecord() {
    if (!detail) return;
    let rec;
    try {
      rec = tripRecord({ morning: keep.morning, option: keep.option, place: keep.place, start: keep.start });
    } catch (e) {
      recPre.textContent = String(e.message || e);
      return;
    }
    const again = replay(JSON.parse(JSON.stringify(rec)));
    const same = JSON.stringify(again) === JSON.stringify(rec);
    recCheck.textContent = same ? '✓ ' + t('m.rec.ok') : t('m.rec.bad');
    recCheck.dataset.ok = String(same);
    const extra = { geometry: GEOMETRY_VERSION, view: viewMode, opening: variant === 'c' ? 'minutes' : 'mornings' };
    if (results.meta) extra.run = { mornings: COUNT, searches: results.meta.searches, ms: Math.round(results.meta.elapsedMs), where: results.meta.where, device: results.meta.device };
    recPre.textContent = JSON.stringify({ ...rec, ...extra }, null, 2);
  }

  function howItWorks() {
    return h('div', { class: 'prose small' },
      h('p', {}, `City: fictional. ${N} street corners, ${EDGES.length} streets including 2 old bridges, a river between them. ${ORIGINS.length} homes and 3 places (market, clinic, jobs): ${ORIGINS.length * PLACES.length} trips, each counted the same.`),
      h('p', {}, `Mornings: morning n draws rain and traffic from seed n + ${SEED_BASE}, and every street gets its minutes from them. Today and each change use the same minutes on every street they share.`),
      h('p', {}, 'Trips: shortest minutes by Dijkstra\'s method, checked against Floyd–Warshall in the tests. Each change adds one link and removes none, so in this model no trip gets longer; the tests also run a closed bridge and a slowed one to show a loss stays a loss.'),
      h('p', {}, 'City in time: each corner sits on the same bearing from the chosen place as on the street map, and its distance from the centre is its trip in minutes, on one scale for today and with the change. Streets drawn there are not geographic and can cross.'),
      h('p', {}, 'The race: two travellers leave the pin together and move by their computed minutes, ten minutes to the second.'),
      h('p', {}, 'Not in the model: costs, budgets, capacity, queues, land, demand that shifts, step-free access, measured travel data.'),
      h('p', {}, 'Buildings, trees, fields and water are drawn from a seed around the street graph. They are not in the model.'),
      h('p', {}, `Method ${METHOD_VERSION} · city ${FIXTURE_HASH} · drawing ${GEOMETRY_VERSION}.`));
  }

  // ---------- the 512-morning run ----------
  let job = null;
  function startRun() {
    b2.dataset.state = 'computing';
    lensState.textContent = tf('m.loading', { d: 0, n: COUNT });
    lensState.hidden = false;
    job = runJob('mornings.run', { count: COUNT }, {
      onFrame: (f) => {
        if (!disposed) lensState.textContent = tf('m.loading', { d: f.done, n: f.count });
      },
    });
    job.promise.then(
      (r) => {
        if (disposed) return;
        results.run = r.result;
        results.meta = { searches: r.result.searches, elapsedMs: r.elapsedMs, where: r.where, device: r.device || deviceLabel(), cached: !!r.cached };
        b2.dataset.state = 'ready';
        lensState.hidden = true;
        drawLens();
        paintStats();
        paintCompute();
        paintRecord();
        startBench();
      },
      (e) => {
        if (disposed || e.cancelled) return;
        b2.dataset.state = 'failed';
        const retry = h('button', { type: 'button', class: 'btn small' }, t('m.retry'));
        retry.addEventListener('click', startRun);
        lensState.replaceChildren(tf('m.error', { e: e.message }), ' ', retry);
      });
  }
  let benchJob = null;
  function startBench() {
    if (results.bench) return paintCompute();
    paintCompute();
    benchJob = runJob('mornings.bench', { side: 141, searches: 6 }, {});
    benchJob.promise.then(
      (r) => {
        if (disposed) return;
        results.bench = r.result;
        paintCompute();
      },
      () => {});
  }
  cleanups.push(() => {
    if (job) job.cancel();
    if (benchJob) benchJob.cancel();
  });

  computeDetail();
  paintNumbers();
  if (results.run) {
    b2.dataset.state = 'ready';
    lensState.hidden = true;
    drawLens();
    paintStats();
    paintCompute();
    if (!results.bench) startBench();
  } else startRun();
  stage.dataset.ready = '1';

  // For tests: read-only state of the route.
  window.__arun_mornings = () => ({ variant, view: viewMode, m: anim.m, s: anim.s, tau: anim.tau, racing: !!race, tweens: tweens.length, morning: keep.morning, option: keep.option, place: keep.place, start: keep.start, posB: anim.posB && Array.from(anim.posB.slice(0, 8)), ready: !!results.run, bench: !!results.bench });
  cleanups.push(() => {
    delete window.__arun_mornings;
  });

  return {
    destroy() {
      disposed = true;
      for (const f of cleanups) {
        try {
          f();
        } catch {}
      }
    },
  };
}

export const mornings = (main) => page(main, 'b');
export const minutes = (main) => page(main, 'c');
