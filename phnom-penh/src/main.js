// ARUN 11 — Worlds in your hands: Phnom Penh. One world, one timeline, every number from the kernels.
// The experiment (what is built, where, with which settings) lives in one immutable state changed by
// actions (src/kernels/experiment.js); the view (time, open sheet, tool, truth shown or hidden) lives in S.
import './words/v11.js';
import { PRIVATE } from '#edition';
import { createWorld, RAIN_DOM } from './render/world.js';
import { createFlat } from './render/flat.js';
import { decodeTerrain } from './kernels/skyreach.js';
import { makeStorm } from './kernels/storm.js';
import { runScenario } from './kernels/scenario.js';
import { fitMotion, fieldForecast, ONSET, KERNEL_VERSION } from './kernels/nowcast.js';
import { ADAPTER_VERSION } from './kernels/observe.js';
import { benchmark } from './kernels/compute.js';
import * as X from './kernels/experiment.js';
import { PRACTICE } from './kernels/evaluation.js';
import { t, setLang, getLang, hhmm, num } from './i18n.js';
import { PAL } from './palette.js';
import { LENSES } from './ui/lenses.js';
import { buildSheet, buildTap, dragStart } from './ui/build.js';
import { compareSheet } from './ui/compare.js';
import { EXTRA_LENSES, CHALLENGES } from './ui/discover.js';
import { mount as mountNotebook } from './ui/notebook.js';

const $ = s => document.querySelector(s);
const DATA = JSON.parse(document.getElementById('arun-data').textContent);
const Q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.has('still');
const BUILD = { version: DATA.version || '11', edition: DATA.edition || 'external', built: DATA.built };
const ALL_LENSES = { ...LENSES, ...EXTRA_LENSES };

let H = X.history();
const st = () => H.present;
export const S = {
  t: 0, playing: false, net: true, lens: null, depth: 0, counter: { runs: 0, cells: 0 },
  view: 'observe', tool: null, pending: null, moveId: null, truth: true, challenge: null, attempts: [],
  coach: 0, show: null, replay: null, lastEffect: null, intro: false, evalCache: new Map(),
  get seed() { return st().seed; }, get facility() { return st().facility; }, get ring() { return st().ring; },
  get hydro() { return st().hydro; }, get extra() { return st().extra; }, get added() { return st().added; },
  get off() { return new Set(st().off); },
};
let R = null, world = null, storm = null;
const LMK_SHOW = ['royal-palace', 'wat-phnom', 'central-market', 'independence', 'koh-pich', 'chroy-changvar', 'russian-market', 'olympic', 'chaktomuk'];

const activeSensors = () => X.activeSensors(st(), DATA.sensors);
const cfgOf = state => ({ ...X.configOf(state, DATA.sensors), storm: state.seed === st().seed ? storm : undefined });
export function scenarioFor(over = {}) { return runScenario({ ...cfgOf(st()), ...over }); }

// ---------- experiment actions ----------
function syncWorld(prev, next) {
  if (prev.seed !== next.seed) { storm = makeStorm(next.seed); world.setStorm(storm); facePoses(); world.setTime(S.t); }
  const pa = new Map(prev.added.map(a => [a.id, a])), na = new Map(next.added.map(a => [a.id, a]));
  for (const [id] of pa) if (!na.has(id)) world.removeGlyph(id);
  for (const [id, a] of na) {
    const o = pa.get(id);
    if (!o || !world.glyph(id)) { if (world.glyph(id)) world.removeGlyph(id); world.addGlyph(id, a.kind, a.x, a.y, a.kind === 'camera' ? 190 : 150, 0.03); }
    else if (o.x !== a.x || o.y !== a.y) world.moveGlyph(id, a.x, a.y);
  }
  world.finishGlyphs();
  if (prev.facility.x !== next.facility.x || prev.facility.y !== next.facility.y) moveFacilityGlyph();
}
function setH(h2) { const prev = st(); H = h2; syncWorld(prev, st()); recompute(); saveSession(); }
export function act(a) {
  const before = R ? R.network.prep : null;
  let h2; try { h2 = X.apply(H, a); } catch (e) { flash(String(e.message || e)); return null; }
  setH(h2);
  S.lastEffect = { before, after: R.network.prep, type: a.type };
  if (['add', 'remove', 'move', 'restore'].includes(a.type) && S.coach <= 1) coachTo(2);
  return S.lastEffect;
}
function preview(a) {
  try {
    const next = X.reduce(st(), a);
    return { state: next, R: runScenario(cfgOf(next)), cost: X.costOf(next, DATA.sensors) };
  } catch (e) { return { error: String(e.message || e) }; }
}
const undo = () => { S.pending = null; setH(X.undo(H)); renderSheet(); };
const redo = () => { S.pending = null; setH(X.redo(H)); renderSheet(); };
const reset = () => { S.pending = null; S.challenge = null; act({ type: 'reset' }); renderSheet(); };
function loadState(state, log = []) {
  const e = X.validateState(state); if (e.length) { flash(e.join(', ')); return false; }
  const prev = st(); H = { past: [...H.past, prev].slice(-200), present: JSON.parse(JSON.stringify(state)), future: [], log: log.slice(-500) };
  syncWorld(prev, st()); recompute(); saveSession(); return true;
}

// ---------- scenario and map ----------
function recompute() {
  R = scenarioFor();
  S.counter.runs += 181;
  const m = $('#marks'); m.innerHTML = '';
  const mk = (tm, col) => { if (tm == null || tm < 0) return; const i = document.createElement('i'); i.style.left = (tm / 180 * 100) + '%'; i.style.background = col; m.appendChild(i); };
  mk(S.net ? R.network.tWarn : R.alone.tWarn, PAL.gold); if (S.truth) mk(R.tWater, PAL.cyan);
  const act = activeSensors(), on = new Map(act.map(s => [s.id, s.on]));
  for (const s of [...DATA.sensors, ...st().added]) if (world.glyph(s.id)) world.setGlyphState(s.id, { off: !on.get(s.id) });
  world.setLinks(S.net ? act.filter(s => s.on).map(s => s.id) : [], 'compute', S.net);
  updateGhost(true);
  $('#scenario').textContent = S.truth ? t('v_truthTag') : t('v_fcTag');
  renderSheet();
}
let ghostT = -1;
function updateGhost(force) {
  const tm = Math.floor(S.t);
  if (!force && tm === ghostT) return; ghostT = tm;
  if (!S.net || !R) { world.setForecast(null); return; }
  const obs = R.obs.filter(o => o.kind !== 'roof');
  const fit = fitMotion(obs, tm);
  if (!fit) { world.setForecast(null); return; }
  const f = fieldForecast(obs, tm, fit, 30, RAIN_DOM);
  S.counter.runs++; S.counter.cells += RAIN_DOM.nx * RAIN_DOM.ny * 2;
  world.setForecast(f);
}
function setTruth(v) { S.truth = !!v; world.setTruth(S.truth); $('#scenario').textContent = S.truth ? t('v_truthTag') : t('v_fcTag'); const m = $('#marks'); if (R) { m.innerHTML = ''; recompute(); } }

// ---------- labels ----------
const labels = [];
function makeLabels() {
  const box = $('#labels');
  const add = (key, x, y, h, cls, onClick) => {
    const el = document.createElement('div'); el.className = 'lbl ' + (cls || ''); box.appendChild(el);
    el.addEventListener('pointerup', e => { e.stopPropagation(); if (S.view === 'build' && S.tool) return; onClick(); });
    labels.push({ key, x, y, h, el, cls });
  };
  add('fac', 0, 0, 260, 'fac', () => openLens('facility', 'fac'));
  add('cmp', 3000, 5200, 1600, 'cmp', () => openLens('compute', 'compute'));
  for (const l of DATA.landmarks) if (LMK_SHOW.includes(l.id)) { const p = toLocal(l.lng, l.lat); add('lm:' + l.id, p.x, p.y, 40, '', () => openLens('landmark', l.id)); }
}
function labelText() {
  const L = getLang();
  for (const lb of labels) {
    if (lb.key === 'fac') lb.el.textContent = t('facTitle', { kind: t('kind_' + st().facility.kind) });
    else if (lb.key === 'cmp') lb.el.textContent = t('cmpTitle');
    else { const l = DATA.landmarks.find(x => 'lm:' + x.id === lb.key); lb.el.textContent = L === 'km' ? l.km : L === 'th' ? (l.th || l.en) : l.en; }
  }
}
function placeLabels() {
  const taken = [], top = 96, bottom = $('#sheet').getBoundingClientRect().top;
  for (const lb of labels) {
    if (lb.key === 'fac') { lb.x = st().facility.x; lb.y = st().facility.y; }
    const p = world.project(lb.x, lb.y, lb.h);
    let show = p.on && p.y > top && p.y < bottom - 8 && p.x > 40 && p.x < innerWidth - 40;
    if (show) for (const q of taken) if (Math.abs(q.x - p.x) < 70 && Math.abs(q.y - p.y) < 20) { show = false; break; }
    if (lb.cls === 'fac' || lb.cls === 'cmp') show = p.on && p.y > top && p.y < bottom - 8;
    lb.el.classList.toggle('dim', !show || S.intro);
    if (show) { lb.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`; taken.push(p); }
  }
}
const toLocal = (lon, lat) => ({ x: (lon - DATA.geo.origin.lon) * DATA.geo.kx, y: (lat - DATA.geo.origin.lat) * DATA.geo.ky });

// ---------- sheet ----------
export function openLens(type, id, depth = 1) {
  if (!ALL_LENSES[type]) return;
  S.lens = { type, id }; S.depth = depth;
  const g = type === 'landmark' ? (() => { const l = DATA.landmarks.find(x => x.id === id); return toLocal(l.lng, l.lat); })()
    : type === 'place' ? id : (type === 'facility' || (type === 'evidence' && id === 'fac')) ? st().facility : (DATA.sensors.find(s => s.id === id) || st().added.find(s => s.id === id));
  if (g && g.x != null) {
    world.setSelect(g.x, g.y, type === 'place' ? 250 : 420);
    if (!S.intro && type !== 'river' && type !== 'compute') { const c = world.ctrl; world.flyTo({ x: g.x, y: g.y, dist: Math.min(c.dist, g.ring === 'region' ? 16000 : 6500), az: c.az, el: Math.max(0.45, c.el) }, 1100); }
  } else world.setSelect(0, 0, -1);
  if (type === 'compute' && !S.intro) world.flyTo({ x: 0, y: 1500, dist: 17000, az: 0.5, el: 0.42 }, 1200);
  for (const [, sp] of world.glyphs) sp.userData.sel = sp.userData.id === id;
  if ((type === 'camera' || type === 'gauge') && S.coach === 0) coachTo(1);
  renderSheet();
}
export function closeLens() { S.lens = null; S.depth = 0; world.setSelect(0, 0, -1); world.setFlood(null); for (const [, sp] of world.glyphs) sp.userData.sel = false; renderSheet(); }
export function setView(v) {
  if (S.replay) return;
  clearPending();
  S.view = v; S.lens = null; S.depth = 0; S.tool = null; S.moveId = null;
  world.setSelect(0, 0, -1); world.setFlood(null);
  if (v === 'compare') { setTruth(false); if (S.coach === 2) coachTo(3); } else if (!S.truth) setTruth(true);
  if (v === 'notebook' && S.coach === 3) coachTo(4);
  caption('');
  renderSheet(); saveSession();
}
function clearPending() {
  if (S.pending && S.pending.restore) S.pending.restore();
  S.pending = null; if (world && world.glyph('_preview')) world.removeGlyph('_preview');
}
let cleanup = null;
export function renderSheet() {
  const app = $('#app'), body = $('#sheetBody');
  if (!body) return;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  const scroll = body.scrollTop; body.innerHTML = '';
  document.querySelectorAll('#modes button').forEach(b => { b.textContent = t('v_' + b.dataset.v); b.setAttribute('aria-current', String(!S.lens && S.view === b.dataset.v)); b.classList.toggle('on', S.view === b.dataset.v); });
  let size = 'small';
  if (S.lens) {
    const lens = ALL_LENSES[S.lens.type], tabs = lens.tabs !== false;
    app.dataset.depth = String(tabs ? S.depth : 1);
    $('#depths').hidden = false; $('.dtabs').hidden = !tabs;
    document.querySelectorAll('.dtabs button').forEach(b => { const d = +b.dataset.d; b.textContent = `${d} · ${t('d' + d)}`; b.setAttribute('aria-current', String(d === S.depth)); });
    cleanup = lens(body, S.depth, CTX) || null; size = 'tall';
  } else {
    $('#depths').hidden = true; app.dataset.depth = '0';
    if (S.view === 'observe') observeSheet(body);
    else if (S.view === 'build') { cleanup = buildSheet(body, CTX) || null; size = S.pending ? 'mid' : 'build'; }
    else if (S.view === 'compare') { cleanup = compareSheet(body, CTX) || null; size = 'tall'; }
    else if (S.view === 'notebook') { cleanup = mountNotebook(body, CTX) || null; size = 'tall'; }
  }
  app.dataset.size = size; app.dataset.view = S.view; app.classList.toggle('tooling', S.view === 'build' && !!S.tool);
  if (S.keepScroll) { body.scrollTop = scroll; S.keepScroll = false; } else body.scrollTop = 0;
}
function observeSheet(body) {
  if (!R) return;
  const r = S.net ? R.network : R.alone, kind = t('kind_' + st().facility.kind);
  const el = document.createElement('div'); el.className = 'head'; el.setAttribute('role', 'button'); el.tabIndex = 0;
  if (R.tWater < 0) el.innerHTML = `<div><div class="k">${t('facTitle', { kind })}</div><div class="sub">${t('noWater')}</div></div>`;
  else el.innerHTML = `<div><div class="k">${t('facTitle', { kind })}</div><div class="big">${num(r.prep)}<small>${t('min')}</small></div><div class="sub">${t('toPrepare')}</div></div>
    <div class="alt">${S.net ? `${t('alone')}<b>${num(R.alone.prep)} ${t('min')}</b>` : t('networkOff', { kind })}</div>`;
  el.addEventListener('click', () => openLens('facility', 'fac'));
  body.appendChild(el);
  const inv = document.createElement('div'); inv.className = 'invite';
  inv.innerHTML = `<span>${t('v_invite')}</span>`;
  const b = document.createElement('button'); b.className = 'btn go'; b.textContent = t('v_discover'); b.addEventListener('click', () => openLens('discover', 'discover'));
  inv.appendChild(b); body.appendChild(inv);
  coachLine(body);
}
export function coachLine(body) {
  if (S.coach > 3 || S.intro || S.show) return;
  const c = document.createElement('div'); c.className = 'coach';
  const s = document.createElement('span'); s.textContent = t('v_coach' + (S.coach + 1)); c.appendChild(s);
  const x = document.createElement('button'); x.className = 'iconbtn'; x.setAttribute('aria-label', t('v_coachX')); x.textContent = '×';
  x.addEventListener('click', () => { S.coach = 99; saveSession(); renderSheet(); }); c.appendChild(x);
  body.appendChild(c);
}
function coachTo(n) { if (S.coach < n && S.coach < 99) { S.coach = n; saveSession(); } }

// ---------- time ----------
let lastMin = -1;
function setT(tm, fromUser) {
  S.t = Math.max(0, Math.min(180, tm));
  world.setTime(S.t);
  $('#time').value = String(Math.round(S.t));
  $('#clock').textContent = hhmm(Math.floor(S.t)) + (S.replay ? ' · ' + t('v_clockExp', { i: num(S.replay.i) }) : '');
  const m = Math.floor(S.t);
  if (m !== lastMin) {
    const prev = lastMin; lastMin = m;
    if (R && S.net && !fromUser && m > prev) {
      for (const o of R.obs) {
        if (o.kind === 'roof') continue;
        const v = o.rep[m - o.lat];
        if (v >= ONSET && (m + o.id.charCodeAt(1)) % 3 === 0) world.pulse(o.id, 'compute', PAL.gold, 1.1);
      }
      const tw = R.network.tWarn;
      if (tw >= 0 && prev < tw && m >= tw) world.pulse('compute', 'fac', PAL.jade, 1.6);
    }
    for (const o of R ? R.obs : []) { const g = world.glyph(o.id); if (g) g.userData.pulse = o.rep[m - o.lat] >= ONSET; }
    updateGhost();
    if (S.lens && ALL_LENSES[S.lens.type].live) { S.keepScroll = true; renderSheet(); }
  }
}
function setPlaying(p) {
  S.playing = p; $('#play').textContent = p ? '❚❚' : '▶'; $('#play').setAttribute('aria-label', t(p ? 'pause' : 'play'));
  if (p && S.t >= 179.5) setT(0);
}

// ---------- taps on the map ----------
function onTap(cx, cy) {
  if (S.intro) { skipIntro(); return; }
  if (S.view === 'build' && S.tool) { buildTap(cx, cy, CTX); return; }
  const gp = world.pickGround(cx, cy);
  const id = world.pickGlyph(cx, cy);
  if (id && id !== '_preview') {
    if (id === 'fac') return openLens('facility', 'fac');
    if (id === 'compute') return openLens('compute', 'compute');
    if (id === 'river') return openLens('river', 'river');
    const s = DATA.sensors.find(x => x.id === id) || st().added.find(x => x.id === id);
    if (s) return openLens(s.kind === 'camera' ? 'camera' : 'gauge', id);
  }
  if (gp) {
    if (isWater(gp.x, gp.y)) return openLens('river', 'river');
    openLens('place', { x: Math.round(gp.x), y: Math.round(gp.y) });
  }
}
let terrain = null;
function isWater(x, y) {
  const g = terrain.grid, lon = DATA.geo.origin.lon + x / DATA.geo.kx, lat = DATA.geo.origin.lat + y / DATA.geo.ky;
  const c = Math.floor((lon - g.west) / (g.east - g.west) * g.w), r = Math.floor((g.north - lat) / (g.north - g.south) * g.h);
  return c >= 0 && r >= 0 && c < g.w && r < g.h && terrain.water[r * g.w + c] === 1;
}
function moveFacilityGlyph() { world.moveGlyph('fac', st().facility.x, st().facility.y); }

// ---------- opening ----------
const POSE = {
  photo: { x: 900, y: -700, dist: 2900, az: 0.35, el: 0.2 },
  region: { x: -9000, y: 0, dist: 27000, az: 0.42, el: 0.55 },
  hero: { x: -2600, y: -200, dist: 12500, az: 0.5, el: 0.42 },
};
function facePoses() {
  const az = Math.atan2(storm.ux, -storm.uy) - 0.45;
  POSE.region.az = az; POSE.hero.az = az;
  POSE.region.x = -9000 * storm.ux; POSE.region.y = -9000 * storm.uy;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let introAbort = false;
function caption(s) { const c = $('#caption'); c.textContent = s || ''; c.classList.toggle('on', !!s); }
let flashT = 0;
function flash(s, ms = 2600) { caption(s); const k = ++flashT; setTimeout(() => { if (k === flashT && !S.intro && !S.replay) caption(''); }, ms); }
async function tweenT(a, b, ms) {
  const t0 = performance.now();
  while (!introAbort) { const u = Math.min(1, (performance.now() - t0) / ms); setT(a + (b - a) * u); if (u >= 1) break; await new Promise(r => requestAnimationFrame(r)); }
}
async function intro(short = false) {
  introAbort = false; S.intro = true; setLang(getLang()); facePoses();
  $('#app').classList.add('intro');
  const op = $('#opening'); op.classList.remove('gone');
  world.flyTo(POSE.photo, 0); world.setRise(0); setT(30);
  await sleep(short ? 700 : 1700); if (introAbort) return;
  op.classList.add('gone');
  const r0 = performance.now(), riseMs = short ? 1200 : 2600;
  (async () => { while (!introAbort) { const u = Math.min(1, (performance.now() - r0) / riseMs); world.setRise(u); if (u >= 1) break; await new Promise(r => requestAnimationFrame(r)); } world.setRise(1); })();
  const tw = R.network.tWarn >= 0 ? R.network.tWarn : 90;
  if (!short) {
    caption(t('cap1', { time: hhmm(30) }));
    await sleep(1300); if (introAbort) return;
    world.flyTo(POSE.region, 3000); caption(t('cap2'));
    await tweenT(30, Math.max(32, tw - 10), 3000); if (introAbort) return;
    caption(t('cap3'));
  }
  world.flyTo(POSE.hero, short ? 1400 : 2600);
  await tweenT(S.t, tw - 2, short ? 900 : 1600); if (introAbort) return;
  caption(t('cap5'));
  await tweenT(S.t, tw, short ? 600 : 1000); if (introAbort) return;
  caption(R.tWater >= 0 ? t('cap6', { kind: t('kind_' + st().facility.kind), n: num(R.network.prep) }) : t('capNone'));
  $('#app').classList.remove('intro'); countUp();
  await sleep(short ? 1600 : 2600); if (introAbort) return;
  if (!short) { await privacyBeat(); if (introAbort) return; }
  endIntro();
}
async function privacyBeat() {
  let cam = null;
  const f = st().facility, cams = R.obs.filter(o => o.kind === 'camera').sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y));
  for (const o of cams) { for (let k = Math.floor(S.t); k < Math.min(170, S.t + 30); k++) if (o.rep[k] >= 10) { cam = { o, k, v: 0 }; break; } if (cam) break; }
  if (!cam) return;
  await tweenT(S.t, cam.k + 6, 1400); if (introAbort) return;
  let pk = 0; for (let k = cam.k; k <= cam.k + 5; k++) pk = Math.max(pk, cam.o.rep[k] || 0); cam.v = pk;
  const bub = $('#bubble'); bub.hidden = false;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 88; bub.innerHTML = ''; bub.appendChild(cv);
  const val = document.createElement('b'); bub.appendChild(val);
  const c = cv.getContext('2d');
  const draw = u => {
    c.fillStyle = '#26303f'; c.fillRect(0, 0, 128, 88);
    c.strokeStyle = 'rgba(200,220,255,.5)'; for (let k = 0; k < 26; k++) { const x = (k * 37) % 128, y = (k * 53 + u * 90) % 88; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y + 10); c.stroke(); }
    c.fillStyle = '#e8b98f'; c.beginPath(); c.arc(64, 38, 16, 0, 7); c.fill(); c.fillStyle = '#d36d8c'; c.fillRect(46, 56, 36, 32);
    if (u > 0.35) { c.fillStyle = PAL.violet; c.globalAlpha = Math.min(1, (u - 0.35) * 4); for (let k = 0; k < 7; k++) { const a = k * Math.PI / 3; c.beginPath(); for (let j = 0; j < 6; j++) { const b = j * Math.PI / 3 + Math.PI / 6; c.lineTo(64 + (k ? Math.cos(a) * 11 : 0) + Math.cos(b) * 7, 38 + (k ? Math.sin(a) * 11 : 0) + Math.sin(b) * 7); } c.fill(); } c.globalAlpha = 1; }
    if (u > 0.7) { c.fillStyle = `rgba(11,18,32,${Math.min(1, (u - 0.7) * 4)})`; c.fillRect(0, 0, 128, 88); }
  };
  caption(t('cap4'));
  world.flyTo({ x: cam.o.x, y: cam.o.y, dist: 6500, az: world.ctrl.az, el: 0.42 }, 1200);
  const t0 = performance.now();
  while (!introAbort) {
    const u = Math.min(1, (performance.now() - t0) / 2600); draw(u);
    const p = world.project(cam.o.x, cam.o.y, 180); bub.style.left = p.x + 'px'; bub.style.top = p.y + 'px';
    val.textContent = u > 0.75 ? `${num(cam.v)} ${t('mmh')}` : '';
    if (u >= 1) break; await new Promise(r => requestAnimationFrame(r));
  }
  world.pulse(cam.o.id, 'compute', PAL.gold, 1.0);
  await sleep(700); bub.hidden = true;
}
function countUp() {
  renderSheet();
  const big = document.querySelector('.head .big'); if (!big || reduced) return;
  const n = R.network.prep || 0, t0 = performance.now(), unit = big.querySelector('small').outerHTML;
  const f = () => { const u = Math.min(1, (performance.now() - t0) / 900); big.innerHTML = `${Math.round(n * (1 - Math.pow(1 - u, 3)))}${unit}`; if (u < 1) requestAnimationFrame(f); };
  f();
}
function endIntro() { S.intro = false; caption(''); $('#app').classList.remove('intro'); renderSheet(); }
function skipIntro() {
  if (!S.intro) return;
  introAbort = true; $('#bubble').hidden = true; $('#opening').classList.add('gone');
  world.setRise(1); world.flyTo(POSE.hero, reduced ? 0 : 900);
  if (R && R.network.tWarn >= 0 && S.t < R.network.tWarn) setT(R.network.tWarn, true);
  endIntro();
}
function replayOpening() { closeLens(); setView('observe'); intro(true).catch(e => { console.error(e); skipIntro(); }); }

function occlude() {
  const sh = $('#sheet').getBoundingClientRect(), tb = $('#timebar').getBoundingClientRect(), W = innerWidth, H2 = innerHeight;
  if (sh.left > W * 0.3) world.setOcclusion(W - sh.left, H2 - tb.top);
  else world.setOcclusion(0, H2 - sh.top);
}

// ---------- replay and show mode ----------
async function replay(rec, { inShow = false } = {}) {
  const states = X.replayLog(rec.actions || [], X.BASELINE);
  if (!states.length) return;
  closeLens(); clearPending(); S.view = 'observe'; S.tool = null;
  S.replay = { i: 0, n: states.length - 1, title: rec.title || '' };
  setPlaying(false);
  if (!loadState(states[0])) { S.replay = null; return; }
  caption(t('v_replaying', { title: rec.title || '' }));
  for (let i = 1; i < states.length && S.replay; i++) {
    await sleep(reduced ? 150 : 850);
    if (!S.replay) return;
    S.replay.i = i;
    const prev = st(); H = { past: [], present: states[i], future: [], log: rec.actions.slice(0, i) }; syncWorld(prev, st()); recompute();
    caption(`${t('v_replaying', { title: rec.title || '' })} · ${t('v_step', { i: num(i), n: num(states.length - 1) })}`);
    setT(S.t, true);
  }
  if (!S.replay) return;
  const final = X.validateState(rec.scenario).length ? states[states.length - 1] : rec.scenario;
  H = { past: [], present: JSON.parse(JSON.stringify(final)), future: [], log: (rec.actions || []).slice(-500) };
  syncWorld(states[states.length - 1], st()); recompute();
  S.replay = null; caption(''); setT(S.t, true);
  if (!inShow) { setT(0, true); setPlaying(true); }
  saveSession(); renderSheet();
}
function showMode(recs) {
  if (!recs || !recs.length) return;
  S.show = { recs, i: 0 }; $('#app').classList.add('show');
  const bar = $('#showbar'); bar.hidden = false;
  const paint = () => {
    const r = S.show.recs[S.show.i];
    bar.querySelector('.st').textContent = `${t('v_showMode')} · ${S.show.i + 1}/${S.show.recs.length} · ${r.title || ''}`;
  };
  const go = async () => { paint(); await replay(S.show.recs[S.show.i], { inShow: true }); setT(0, true); setPlaying(true); };
  bar.querySelector('.nx').onclick = () => { S.replay = null; S.show.i = (S.show.i + 1) % S.show.recs.length; go(); };
  bar.querySelector('.ex').onclick = () => exitShow();
  bar.querySelector('.ch').onclick = () => { exitShow(); setView('build'); };
  go();
}
function exitShow() { S.replay = null; S.show = null; $('#app').classList.remove('show'); $('#showbar').hidden = true; caption(''); renderSheet(); }

// ---------- session ----------
const SKEY = 'arun11.session';
function saveSession() {
  try { localStorage.setItem(SKEY, JSON.stringify({ v: 1, state: st(), log: H.log.slice(-200), t: Math.round(S.t), lang: getLang(), view: S.view === 'notebook' ? 'observe' : S.view, coach: S.coach })); } catch (e) { /* storage blocked: the session lives in memory only */ }
}
function loadSession() {
  if (Q.has('fresh')) return null;
  try { const o = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (o && o.v === 1 && !X.validateState(o.state).length) return o; } catch (e) { /* none */ }
  return null;
}

// ---------- boot ----------
async function gunzip(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
function metrics() {
  const hc = S.evalCache.get(X.hashState(st()));
  const s = hc && hc.summary;
  const at = R.network.tWarn;
  return {
    outcome: { seed: st().seed, tWater: R.tWater, gain: R.gain, net: { tWarn: R.network.tWarn, prep: R.network.prep, outcome: R.network.outcome }, alone: { tWarn: R.alone.tWarn, prep: R.alone.prep, outcome: R.alone.outcome } },
    uncertainty: {
      coverAtNotice: at >= 0 ? +R.network.cover[at].toFixed(3) : null, chanceAtNotice: at >= 0 ? +R.network.chance[at].toFixed(3) : null,
      heldout: s ? { n: s.n, median: s.leadNet.median, p25: s.leadNet.p25, p75: s.leadNet.p75, miss: s.network.miss, late: s.network.late, false: s.network.false } : null,
    },
  };
}
const INPUTS = [
  { name: 'OpenStreetMap streets and rivers', kind: 'source' }, { name: 'Overture buildings 2026-11-18.0', kind: 'source' },
  { name: 'Copernicus DEM GLO-30', kind: 'source' }, { name: 'JRC Global Surface Water', kind: 'source' },
  { name: 'illustrative storm', kind: 'synthetic' }, { name: 'camera table from drawn-street renders', kind: 'synthetic' },
  { name: 'proposed sensor positions', kind: 'proposed' }, { name: 'street water bucket', kind: 'assumed' },
];
const CTX = {
  S, DATA, BUILD, PRIVATE, CHALLENGES,
  get R() { return R; }, get world() { return world; }, get storm() { return storm; }, get terrain() { return terrain; },
  get state() { return st(); }, get H() { return H; }, get counter() { return S.counter; },
  get phoneBench() {
    if (!S.bench && R) { const obs = R.obs.filter(x => x.kind !== 'roof'), fit = fitMotion(obs, Math.max(80, Math.floor(S.t))); if (fit) S.bench = benchmark(obs, Math.max(80, Math.floor(S.t)), { vx: fit.vx, vy: fit.vy, g: 1 }, { minMs: 250 }); }
    return S.bench || null;
  },
  recompute, openLens, closeLens, renderSheet, scenarioFor, setT, toLocal, activeSensors, act, preview, undo, redo, reset,
  setView, setTruth, caption, flash, loadState, clearPending, replayOpening, cfgOf, coachLine,
  setSeed(seed) { act({ type: 'seed', seed }); },
  nextPractice() { const i = PRACTICE.indexOf(st().seed); act({ type: 'seed', seed: PRACTICE[(i + 1) % PRACTICE.length] }); },
  setTool(tool) { clearPending(); S.tool = S.tool === tool ? null : tool; S.moveId = null; caption(''); renderSheet(); },
  startMove(id) { setView('build'); S.tool = 'move'; S.moveId = id; caption(t('v_hintMove2', { id: id === 'fac' ? t('kind_' + st().facility.kind) : id.toUpperCase() })); renderSheet(); },
  exp: {
    state: () => st(), log: () => H.log, metrics, inputs: () => INPUTS.map(x => ({ ...x })),
    load(rec) { if (loadState(rec.scenario, rec.actions || [])) { setView('observe'); flash(rec.title || ''); } },
    replay(rec) { replay(rec); },
    show(recs) { showMode(recs); },
    compare(a, b) { S.compareRecs = [a, b]; setView('compare'); },
  },
  versions: { kernel: KERNEL_VERSION, adapter: ADAPTER_VERSION },
};

function applyLang(l) {
  setLang(l); document.documentElement.lang = l;
  $('#lang').textContent = { en: 'EN', km: 'ខ្មែរ', th: 'ไทย' }[l];
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  $('#scenario').textContent = S.truth ? t('v_truthTag') : t('v_fcTag');
  labelText(); renderSheet(); saveSession();
}

async function boot() {
  const t0 = performance.now();
  const saved = loadSession();
  if (saved) { H = { past: [], present: saved.state, future: [], log: saved.log || [] }; S.coach = saved.coach || 0; }
  const buildings = await gunzip(DATA.buildings);
  terrain = decodeTerrain(DATA.terrain);
  const tier = Q.get('tier') || ((navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 'low' : 'mid');
  const hasGL = !Q.has('flat') && (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } })();
  try { if (!hasGL) throw new Error('no WebGL2'); world = createWorld($('#world'), { geo: DATA.geo, terrain, buildings }, { tier, reducedMotion: reduced, preserve: Q.has('shot'), onTap }); }
  catch (e) { const old = $('#world'), cv = old.cloneNode(); old.replaceWith(cv); world = createFlat(cv, { geo: DATA.geo, terrain }, { reducedMotion: reduced, onTap }); document.documentElement.classList.add('flat'); }
  window.__world = world; window.__S = S; window.__CTX = CTX;
  storm = makeStorm(st().seed); world.setStorm(storm); facePoses();
  for (const s of DATA.sensors) world.addGlyph(s.id, s.kind, s.x, s.y, s.ring === 'region' ? 320 : s.kind === 'camera' ? 190 : 150, s.ring === 'region' ? 0.026 : 0.03);
  for (const a of st().added) world.addGlyph(a.id, a.kind, a.x, a.y, a.kind === 'camera' ? 190 : 150, 0.03);
  world.addGlyph('fac', 'facility', st().facility.x, st().facility.y, 260, 0.045);
  world.addGlyph('compute', 'compute', 3000, 5200, 1600, 0.048);
  const ch = toLocal(104.9349, 11.56267); world.addGlyph('river', 'river', ch.x, ch.y, 120, 0.032);
  world.finishGlyphs();
  makeLabels();
  applyLang(Q.get('lang') || (saved && saved.lang) || (navigator.language || 'en').slice(0, 2).replace(/^(?!km|th).*/, 'en'));
  recompute();

  // controls
  $('#play').addEventListener('click', () => setPlaying(!S.playing));
  $('#time').addEventListener('input', e => { setPlaying(false); setT(+e.target.value, true); if (S.lens) { S.keepScroll = true; renderSheet(); } });
  $('#net').addEventListener('click', () => { S.net = !S.net; $('#net').classList.toggle('on', S.net); $('#net').setAttribute('aria-pressed', String(S.net)); recompute(); });
  $('#lang').addEventListener('click', () => applyLang({ en: 'km', km: 'th', th: 'en' }[getLang()]));
  $('#back').addEventListener('click', () => { const tabs = S.lens && ALL_LENSES[S.lens.type].tabs !== false; if (tabs && S.depth > 1) { S.depth--; renderSheet(); } else closeLens(); });
  $('#close').addEventListener('click', closeLens);
  document.querySelectorAll('.dtabs button').forEach(b => b.addEventListener('click', () => { S.depth = +b.dataset.d; renderSheet(); }));
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));
  $('#opening').addEventListener('pointerdown', skipIntro);
  // drag an added sensor or the facility in Build: captured before the map's own orbit handler
  $('#app').addEventListener('pointerdown', e => { if (S.view === 'build' && !S.intro && e.target.closest('#world')) dragStart(e, CTX); }, true);
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (S.intro) skipIntro(); else if (S.show) exitShow(); else if (S.pending) { clearPending(); renderSheet(); } else closeLens(); }
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying(!S.playing); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.target === document.body) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  });
  addEventListener('resize', () => { world.resize(); if (S.lens) renderSheet(); });

  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.playing && !S.intro) { setT(S.t + dt * 4); if (S.t >= 180) setPlaying(false); }
    occlude(); world.frame(now); placeLabels();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__ready = { ms: Math.round(performance.now() - t0), buildings: world.buildingCount, tier, flat: !!world.flat, edition: BUILD.edition, restored: !!saved };
  const startT = Q.has('t') ? +Q.get('t') : saved ? saved.t : (R.network.tWarn >= 0 ? R.network.tWarn : 90);
  if (Q.has('nointro') || reduced || saved) {
    $('#opening').classList.add('gone'); world.setRise(1); world.flyTo(POSE.hero, 0); setT(startT, true);
    if (saved && saved.view && saved.view !== 'observe' && !Q.get('lens')) setView(saved.view);
    if (Q.get('view')) setView(Q.get('view'));
    if (Q.get('lens')) openLens(Q.get('lens'), Q.get('id') || (Q.get('lens') === 'facility' ? 'fac' : Q.get('lens')), +(Q.get('depth') || 1)); else renderSheet();
    if (saved && !Q.has('nointro')) flash(t('v_restored'));
  } else intro().catch(e => { console.error(e); skipIntro(); });
}
boot().catch(e => { console.error(e); window.__error = String(e && e.stack || e); });
