// ARUN · a city that senses (draft for the devs to riff on).
// A simulated 48 hours in Phnom Penh on the real map: junction cameras with Face Shield, traffic, PM2.5
// and AQI, rain, water at the kerb, the river, and the warnings a sensing city would issue ahead of
// each event. Drag time back and forward; touch a junction, the air, the water or the computing node.
// Every value comes from src/touch/sim.js and the existing kernels; the page says so.
import { createWorld } from '../render/world.js';
import { buildGraph } from '../kernels/route.js';
import { decodeTerrain, prepare, flood, cellAt, streetsUnder } from '../kernels/skyreach.js';
import { sunPosition, scenarioDate } from '../render/sun.js';
import * as SIM from './sim.js';
import * as K from './reach.js';
import { createStreets } from './streets.js';
import { createTraffic, createAir, createJunctions, createSignals, STATE_COL } from './layers.js';
import { createPano } from './pano.js';
import { createDrive, CONG } from './drive.js';
import { createBuses, createSpots, createArea, inRing, fetchLive, fetchIsochrone } from './real.js';
import { createTimebar, HAZ_COL } from './timebar.js';
import { createStreetView } from './street.js';
import { WORDS } from './words.js';

const $ = s => document.querySelector(s);
const needle = document.getElementById('needle');
const DATA = JSON.parse(document.getElementById('arun-data').textContent);
const Q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.has('still');
const toLocal = (lon, lat) => ({ x: (lon - DATA.geo.origin.lon) * DATA.geo.kx, y: (lat - DATA.geo.origin.lat) * DATA.geo.ky });

let lang = 'en';
const w = (k, v = {}) => { if (k === 'nJ' && +v.n === 1) k = 'nJ1'; const s = WORDS[lang][k] ?? WORDS.en[k] ?? k; return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '') : s; };
const num = n => Math.round(n).toLocaleString('en-US');
const dur = min => { min = Math.round(min); return min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}` : `${min} min`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const START = +(Q.get('m') ?? -440);                 // Fri 27 Nov 07:40
const DC = { x: 0, y: 1800, h: 900 };                 // the shared computing node, drawn in the sky above the city
const POSE = { x: -1700, y: 300, dist: 11500, az: -0.3, el: 0.78 };
const LABELS = ['central-market', 'royal-palace', 'wat-phnom', 'independence', 'russian-market', 'koh-pich', 'chroy-changvar', 'olympic'];

export const S = { m: START, playing: false, sel: null, layers: { air: true, traffic: true, cams: true, signals: true, buses: true }, jview: null, orbit: null, story: 0, rise: 0, divider: 0.5, ready: false };
let pano = null, panoThen = null, signals = null, drive = null, buses = null, spots = null, area = null, popArr = null, placeCells = null; const panoFail = new Set();
let world, sim, ALERTS = [], FX, grid, airBuf, airLayer, traffic, junc, tbar, prepR, city, reachLayer, scene = null, simMs = 0;
let lastAirM = 1e9, lastCard = 0;
const LMK = {};

// ---------- the city at minute m ----------
const nightOf = m => { const el = sunPosition(scenarioDate(m)).elevation; return Math.max(0, Math.min(1, (4 - el) / 10)); };
function cityNow(m) {
  const k = sim.idx(m);
  let aqiMax = 0, worst = sim.J[0], rainMax = 0, wet = 0, waterMax = 0, queues = 0, qSum = 0; const aq = [];
  for (const j of sim.J) {
    const a = sim.aqiAt(j, m); aq.push(a); if (a > aqiMax) { aqiMax = a; worst = j; }
    rainMax = Math.max(rainMax, j.rain[k]); if (j.water[k] >= SIM.KERB) wet++; waterMax = Math.max(waterMax, j.water[k]);
    if (j.queue[k] >= SIM.QUEUE_ALERT) queues++; qSum += j.queue[k];
  }
  aq.sort((a, b) => a - b);
  return { k, aqiMax, aqiMed: aq[aq.length >> 1], worst, rainMax, wet, waterMax, queues, qMean: qSum / sim.J.length, traffic: SIM.trafficProfile(m) * (1 - 0.35 * Math.min(1, rainMax / 40)) };
}
function jState(i, m, k) {
  const j = sim.J[i], f = FX.junctions[i];
  const rain = j.rain[k], water = j.water[k], queue = j.queue[k];
  const warned = f.tWarn >= 0 && m >= f.tWarn && ((f.tHeavy >= 0 && m < f.tHeavy) || (f.tWater >= 0 && m < f.tWater && water < SIM.KERB) || (f.tHeavy < 0 && f.tWater < 0 && m < f.tWarn + 90));
  const a = sim.aqiAt(j, m);
  const state = water >= SIM.KERB || queue >= SIM.QUEUE_ALERT ? 'alert' : rain >= SIM.HEAVY ? 'rain' : warned ? 'warn' : a >= SIM.AQI_ALERT ? 'air' : 'ok';  // stylecheck: allow — early-warning state
  return { state, rain, water, queue, aqi: a, showWater: true, sel: S.sel && S.sel.kind === 'j' && S.sel.i === i };
}

function setTime(m, user) {
  const prev = S.m;
  S.m = Math.max(SIM.M0, Math.min(SIM.M1, m));
  world.setTime(S.m);
  const C = cityNow(S.m);
  // haze: the sky and the far city go brown-grey as the air gets worse
  const hz = Math.max(0, Math.min(0.55, (C.aqiMed - 60) / 170));
  world.U.uSkyHor.value.lerp({ r: 0.55, g: 0.48, b: 0.4, isColor: true }, hz);
  world.scene.fog.color.copy(world.U.uSkyHor.value).convertLinearToSRGB();
  if (Math.abs(S.m - lastAirM) >= 5 || user === 'force') { sim.air.field(S.m, airBuf); airLayer.set(airBuf); lastAirM = S.m; }
  junc.set(sim.J.map((_, i) => jState(i, S.m, C.k)));
  if (S.playing && Math.floor(S.m / 5) !== Math.floor(prev / 5)) {
    const step = Math.floor(S.m / 5);
    sim.J.forEach((j, i) => { if ((i * 7 + step) % 4 === 0) junc.packet(i, STATE_COL[jState(i, S.m, C.k).state]); });
  }
  renderAlerts(); chips(C);
  const L = SIM.label(S.m);
  $('#t-day').textContent = w('days')[L.day] || ''; $('#t-clock').textContent = L.hhmm;
  tbar.set(S.m, `${w('days')[L.day]} ${L.hhmm}`);
  const now = performance.now();
  if (S.sel && (now - lastCard > 120 || !S.playing)) { lastCard = now; updateCard(C); }
}

// ---------- alerts ----------
function activeAlerts(m) {
  return ALERTS.filter(a => (a.issue ?? a.event) <= m && m <= (a.end ?? SIM.M1)).map(a => ({ ...a, phase: a.event == null || m < a.event ? 'w' : 'a' }))
    .sort((a, b) => (a.phase === b.phase ? 0 : a.phase === 'a' ? -1 : 1));
}
function alertText(a, m) {
  const k = sim.idx(m);
  if (a.kind === 'air') return a.phase === 'w' ? [w('wAir'), w('next3h')] : [w('aAir'), `${w('nJ', { n: sim.J.filter(j => sim.aqiAt(j, m) >= SIM.AQI_ALERT).length })}${a.issue != null ? ' · ' + w('ahead', { t: dur(a.event - a.issue) }) : ''}`];
  if (a.kind === 'rain') {
    if (a.phase === 'w') return [w('wRain'), w('nJ', { n: FX.junctions.filter(f => f.tWarn >= 0 && f.tWarn <= m).length })];
    return [w('aRain'), `${w('nJ', { n: sim.J.filter(j => j.rain[k] >= SIM.HEAVY).length })} · ${w('leadMed', { t: dur(a.lead) })}`];
  }
  if (a.kind === 'water') return a.phase === 'w' ? [w('wWater'), w('nJ', { n: a.n })] : [w('aWater'), `${w('nJ', { n: sim.J.filter(j => j.water[k] >= SIM.KERB).length })} · ${w('leadMed', { t: dur(a.lead) })}`];
  return [w('aTraffic'), w('nJ', { n: sim.J.filter(j => j.queue[k] >= SIM.QUEUE_ALERT).length })];
}
let lastAlertKey = '';
function renderAlerts() {
  const act = activeAlerts(S.m);
  junc.alerts(act.filter(a => a.phase === 'a').slice(0, 4).map(a => ({ x: a.x, y: a.y, col: HAZ_COL[a.kind] })));
  const shown = act.slice(0, S.sel ? 1 : 2);
  const key = shown.map(a => a.kind + a.phase + alertText(a, S.m).join()).join('|') + lang;
  if (key === lastAlertKey) return; lastAlertKey = key;
  const box = $('#alerts'); box.innerHTML = '';
  for (const a of shown) {
    const [t1, t2] = alertText(a, S.m);
    const b = document.createElement('button'); b.className = 'al ' + a.phase; b.style.setProperty('--c', HAZ_COL[a.kind]);
    b.innerHTML = `<span class="ic">${a.phase === 'w' ? '!' : '●'}</span><span><b>${esc(t1)}</b><small>${esc(t2)}</small></span>`;
    b.onclick = () => openCard(a.kind === 'traffic' ? { kind: 'j', i: sim.J.findIndex(j => j.id === a.at) } : { kind: a.kind });
    box.append(b);
  }
  if (shown.length) $('#live').textContent = shown.map(a => alertText(a, S.m).join(', ')).join('. ');
}

// ---------- chips ----------
function chips(C) {
  const put = (k, word, col) => { $('#c-' + k).textContent = word; $('#c-' + k).closest('.cchip').style.setProperty('--dc', col); };
  const cat = SIM.catOf(C.aqiMax);
  const AQW = { good: 'vGood', moderate: 'vOk', usg: 'vPoor', unhealthy: 'vUnhealthy', veryUnhealthy: 'vVeryBad', hazardous: 'vHazardous' };
  put('air', w(AQW[cat.key] || 'vOk'), cat.col);
  const r = C.rainMax;
  put('rain', w(r < 0.5 ? 'vNone' : r < 10 ? 'vLight' : r < SIM.HEAVY ? 'vRain' : 'vHeavy'), r < 0.5 ? '#3ccf6e' : r < SIM.HEAVY ? '#7aa7ff' : '#ff5a4d');
  put('water', w(C.wet ? 'vFlooding' : C.waterMax >= 3 ? 'vWet' : 'vDry'), C.wet ? '#ff5a4d' : C.waterMax >= 3 ? '#3aa0ff' : '#3ccf6e');
  const t = C.traffic;
  put('traffic', w(C.queues ? 'vJammed' : t < 0.35 ? 'vClear' : t < 0.75 ? 'vBusy' : 'vThick'), C.queues ? '#ff5a4d' : t < 0.35 ? '#3ccf6e' : t < 0.75 ? '#f5c451' : '#ffb347');
}

// ---------- cards ----------
function killViews() { if (scene) { scene.destroy(); scene = null; } if (panoThen) { panoThen.destroy(); panoThen = null; } if (pano) { pano.destroy(); pano = null; } }
const mapBearing = () => -world.ctrl.az * 180 / Math.PI;
const fmtDate = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString(lang === 'km' ? 'km-KH' : lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
function openCard(sel) {
  killViews(); if (drive) drive.clear(); clearReal();
  if (reachLayer) reachLayer.visible(false);
  hideTitle();
  if (!(history.state && history.state.card)) history.pushState({ card: 1 }, '');
  S.sel = sel; document.documentElement.classList.add('carded');
  $('#card').hidden = false; $('#card').scrollTop = 0;
  buildCard(); updateCard(cityNow(S.m));
  lastAlertKey = ''; renderAlerts();
}
let skipPop = false;
function closeCard() {
  if (!S.sel) return;
  dropCard();
  if (history.state && history.state.card) { skipPop = true; history.back(); }
}
addEventListener('popstate', () => { if (skipPop) { skipPop = false; return; } dropCard(); });
function dropCard() {
  if (!S.sel) return;
  killViews(); if (drive) drive.clear(); clearReal();
  if (reachLayer) reachLayer.visible(false);
  if (S.rise) { S.rise = 0; world.setFlood(null); if (spots) spots.clear(); }
  S.sel = null; $('#card').hidden = true; document.documentElement.classList.remove('carded'); lastAlertKey = ''; renderAlerts();
  junc.set(sim.J.map((_, i) => jState(i, S.m, sim.idx(S.m))));
}
function nearName(x, y) {
  let best = null, bd = 900;
  for (const l of Object.values(LMK)) { const p = toLocal(l.lng, l.lat), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = l; } }
  return best ? w('near', { p: (best[lang] || best.en).split(' · ')[0] }) : '';
}
function buildCard() {
  const el = $('#card-body'), s = S.sel;
  if (s.kind === 'j') {
    const j = sim.J[s.i];
    const pn = DATA.panos && !panoFail.has(j.id) ? DATA.panos.panos[j.id] : null;
    if (!pn) S.jview = 'shield'; else if (!S.jview) S.jview = 'photo';
    el.innerHTML = `<h2>${j.id} <span style="font-weight:400;color:var(--muted)">${esc(nearName(j.x, j.y))}</span></h2>
      <div class="tabs" role="tablist">${pn ? `<button role="tab" data-v="photo">${w('vPhoto')}</button>` : ''}<button role="tab" data-v="shield">${w('tShield')}</button></div>
      <div class="street" id="street"><canvas></canvas><span class="hint">↔ ${esc(w('st1p').split(/[.។]/)[1] || '')}</span></div>
      <div class="credit" id="credit"></div>
      ${drive && drive.on ? `<div class="drive"><h3 class="sec">${w('liveH')} <span class="tagreal">${w('real')}</span></h3><div id="drive-o" aria-live="polite"></div><button class="btn" id="drive-b"></button></div>` : ''}
      <div class="sends-h"><b>${w('sends')}</b><span id="pbytes"></span></div>
      <div class="nums" id="jnums"></div>
      <p class="fine">${w('numbersOnly')}</p>
      <details class="raw"><summary>${w('raw')}</summary><pre class="pkt" id="pkt"></pre></details>`;
    const box = $('#street'), cv = box.querySelector('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1), r = box.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    scene = createStreetView(cv, { seed: 11 + s.i, node: j.id, lang });
    scene.set({ divider: S.divider, still: reduced });
    if (!reduced) scene.start();
    if (pn) pano = createPano(box, { url: `pano/${j.id}.jpg`, heading: pn.heading, bearing: mapBearing(),
      onFail: () => { panoFail.add(j.id); if (S.sel && S.sel.kind === 'j' && S.sel.i === s.i) { S.jview = 'shield'; killViews(); buildCard(); updateCard(cityNow(S.m)); } },
      onLoad: () => { if (S.sweepPano && pano) { pano.sweep(360, 7000); S.sweepPano = false; } setTimeout(() => { const h = box.querySelector('.hint'); if (h) h.style.opacity = 0; }, 3500); } });
    const pt = pn && DATA.panosOld ? DATA.panosOld.panos[j.id] : null;
    if (pano && pt) {
      // then and now: the same corner years apart, a handle to drag between them
      panoThen = createPano(box, { url: `pano-then/${j.id}.jpg`, heading: pt.heading, bearing: mapBearing(), follow: pano, cls: 'then', onFail: () => box.classList.remove('tn') });
      box.classList.add('tn');
      box.insertAdjacentHTML('beforeend', `<span class="tn-y l">${pt.date.slice(0, 4)}</span><span class="tn-y r">${pn.date.slice(0, 4)}</span><span class="tn-h" role="slider" aria-label="${esc(w('thenNowA'))}" tabindex="0"><i>‹ ›</i></span>`);
      const H = box.querySelector('.tn-h'), thenCv = box.querySelector('.pano-cv.then');
      const setThen = x => { S.thenX = Math.max(0, Math.min(1, x)); thenCv.style.clipPath = `inset(0 ${((1 - S.thenX) * 100).toFixed(1)}% 0 0)`; H.style.left = (S.thenX * 100).toFixed(1) + '%'; H.setAttribute('aria-valuenow', Math.round(S.thenX * 100)); };
      setThen(S.thenX ?? 0.5);
      const mv = e => { const rr = box.getBoundingClientRect(); setThen((e.clientX - rr.left) / rr.width); };
      H.addEventListener('pointerdown', e => { e.stopPropagation(); H.setPointerCapture(e.pointerId); mv(e); });
      H.addEventListener('pointermove', e => { if (H.hasPointerCapture(e.pointerId)) mv(e); });
      H.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setThen(S.thenX + (e.key === 'ArrowLeft' ? -0.05 : 0.05)); });
    }
    const setView = v => {
      S.jview = v; box.classList.toggle('shield', v === 'shield');
      el.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === v)));
      const pt = pn && panoThen && DATA.panosOld ? DATA.panosOld.panos[j.id] : null;
      $('#credit').innerHTML = v === 'photo' && pn ? `<a href="https://www.mapillary.com/app/?pKey=${pn.id}" target="_blank" rel="noopener">${esc(w('photoBy', { d: fmtDate(pn.date), by: pn.by }))}</a>${pt ? ` · <a href="https://www.mapillary.com/app/?pKey=${pt.id}" target="_blank" rel="noopener">${esc(w('thenBy', { d: fmtDate(pt.date), by: pt.by }))}</a>` : ''}${pn.dist > 40 ? ' · ' + esc(w('fromCorner', { m: pn.dist })) : ''}`
        : `<span class="tagsim">${w('camSim')}</span>`;
    };
    el.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));
    setView(S.jview);
    if (S.dkFor !== s.i) { S.dk = 0; S.dkFor = s.i; }
    if ($('#drive-b')) { driveLabel(s.i); $('#drive-b').onclick = () => runDrive(s.i); }
    const div = e => { if (S.jview === 'photo') return; const rr = box.getBoundingClientRect(); S.divider = Math.max(0, Math.min(1, (e.clientX - rr.left) / rr.width)); scene.set({ divider: S.divider }); sweep = null; };
    box.addEventListener('pointerdown', e => { if (S.jview === 'photo') return; box.setPointerCapture(e.pointerId); div(e); });
    box.addEventListener('pointermove', e => { if (box.hasPointerCapture(e.pointerId)) div(e); });
  } else if (s.kind === 'air') {
    el.innerHTML = `<h2>${w('airTitle')}</h2><div class="sub"><span class="tagsim">${w('sim')}</span><span>PM2.5 · US EPA AQI</span></div>
      <div class="big"><b id="aqi-v"></b><span class="cat" id="aqi-c"></span></div><div class="fine" id="aqi-s"></div>
      <canvas class="chart" id="achart"></canvas><p class="fine">${w('airNote')}</p>
      <h3 class="sec">${w('liveTitle')} <span class="tagreal">${w('real')}</span></h3><div id="live-air"><p class="fine">${w('liveWaitAll')}</p></div>`;
    loadLive('air');
  } else if (s.kind === 'rain' || s.kind === 'water') {
    const ra = ALERTS.find(a => a.kind === 'rain'), wa = ALERTS.find(a => a.kind === 'water');
    el.innerHTML = s.kind === 'rain'
      ? `<h2>${w('rainTitle')}</h2><div class="sub"><span class="tagsim">${w('sim')}</span></div>
        <div class="big"><b id="rain-v"></b><span>mm/h</span></div>
        <div class="list">${ra ? `<div><span>${w('wRain')}</span><b>${SIM.label(ra.issue).hhmm} · ${w('nJ', { n: ra.warned })}</b></div>
          <div><span>${w('aRain')}</span><b>${SIM.label(ra.event).hhmm} · ${w('nJ', { n: ra.n })}</b></div>
          <div><span>${w('leadMed', { t: '' }).trim()}</span><b>${dur(ra.lead)}</b></div>
          <div><span>${w('late', { n: ra.missed })}</span><b>${ra.missed}/${ra.n}</b></div>` : ''}
          ${wa ? `<div><span>${w('aWater')}</span><b>${SIM.label(wa.event).hhmm} · ${w('nJ', { n: wa.n })} · ${w('leadMed', { t: dur(wa.lead) })}</b></div>` : ''}</div>
        <canvas class="chart" id="rchart"></canvas><p class="fine">${w('rainNote')}</p>
        <h3 class="sec">${w('liveTitle')} <span class="tagreal">${w('real')}</span></h3><div id="live-rain"><p class="fine">${w('liveWaitAll')}</p></div>`
      : `<h2>${w('waterTitle')}</h2><div class="sub"><span class="tagsim">${w('sim')}</span></div>
        <div class="list"><div><span>${w('riverNow')}</span><b id="river-v"></b></div><div><span>${w('streetWater')}</span><b id="sw-v"></b></div></div>
        <canvas class="chart" id="wchart"></canvas>
        <h2 style="font-size:15px;margin-top:10px">${w('possible')}</h2>
        <div class="ruler"><input id="rise" type="range" min="0" max="14" step="0.5" value="${S.rise}" aria-label="${w('possible')}"><output id="rise-o">+${S.rise} m</output></div>
        <div class="fine" id="rise-s"></div><p class="fine">${w('possibleNote')}</p>`;
    if (s.kind === 'water') $('#rise').addEventListener('input', e => setRise(+e.target.value));
    if (s.kind === 'rain') loadLive('rain');
  } else if (s.kind === 'dc') {
    el.innerHTML = `<h2>${w('dcTitle')}</h2><div class="sub"><span class="tagsim">${w('sim')}</span></div>
      <div class="flow">
        <div class="st"><i>◉</i><span>${w('dc1')} · ${sim.J.length} + ${FX.gauges.length}</span></div><div class="ar">↓</div>
        <div class="st"><i>⬡</i><span>${w('dc2')}</span></div><div class="ar">↓</div>
        <div class="st"><i>{ }</i><span>${w('dc3')} · <span id="dc-bytes"></span></span></div><div class="ar">↓</div>
        <div class="st"><i>▦</i><span>${w('dc4')}</span></div><div class="ar">↓</div>
      </div>
      <div class="uses">${w('uses').map(u => `<span>${esc(u)}</span>`).join('')}</div>
      <h3 class="sec">${w('dcWho')}</h3><div class="who">${w('who').map(u => `<div>${esc(u)}</div>`).join('')}</div>
      <h3 class="sec">${w('dcWhy')}</h3><div class="uses">${w('why').map(u => `<span>${esc(u)}</span>`).join('')}</div>
      <p class="fine">${w('dcNote')}</p>`;
  } else if (s.kind === 'traffic') {
    const yrs = DATA.panos ? Object.values(DATA.panos.panos).map(p => +p.date.slice(0, 4)) : [];
    el.innerHTML = `<h2>${w('trafficTitle')}</h2><div class="sub"><span class="tagsim">${w('modelled')}</span></div>
      <div class="big"><b id="tr-v" style="font-size:30px"></b></div>
      <h3 class="sec">${w('busiest')}</h3><div class="list" id="tr-list"></div>
      ${drive && drive.on ? `<h3 class="sec">${w('liveTitle')} <span class="tagreal">${w('real')}</span></h3><p class="fine">${w('liveT')}</p><button class="btn" id="tr-live">${w('trLive')}</button>` : ''}
      <h3 class="sec">${w('realH')}</h3><p class="fine">${esc(w('realT', { n: signals ? signals.n : 0, y: yrs.length ? (Math.min(...yrs) === Math.max(...yrs) ? Math.max(...yrs) : Math.min(...yrs) + '–' + Math.max(...yrs)) : '' }))}</p>
      <h3 class="sec">${w('modelH')}</h3><p class="fine">${w('modelT')}</p>`;
    if ($('#tr-live')) $('#tr-live').onclick = () => { const i = busiestAt(S.m); openCard({ kind: 'j', i }); runDrive(i); };
  } else if (s.kind === 'lmk') {
    const l = LMK[s.id], ph = DATA.photos && DATA.photos[s.id], wk = (DATA.wiki && DATA.wiki[s.id]) || {}, wl = wk[lang] || wk.en;
    el.innerHTML = `<h2>${esc((l[lang] || l.en).split(' · ')[0])}</h2>
      ${ph ? `<img class="lmk-img" src="photo/${s.id}.webp" alt="" width="${ph.w}" height="${ph.h}">` : ''}
      <p class="lmk-t">${esc(l['t_' + lang] || l.t_en || '')}</p>
      <div class="credit">${ph ? `<a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(w('photoCredit', { by: ph.author, lic: ph.licence }))}</a>` : ''}${wl ? ` · <a href="${esc(wl)}" target="_blank" rel="noopener">Wikipedia</a>` : ''}</div>`;
    const im = el.querySelector('.lmk-img'); if (im) im.onerror = () => im.remove();
  } else if (s.kind === 'stop') {
    const st = DATA.buses.stops[s.i]; if (buses) buses.select(s.i);
    el.innerHTML = `<h2>${esc((lang === 'km' && st.km) || st.n || w('busStop'))}</h2>
      <div class="sub"><span class="tagreal">${w('real')}</span><span>${esc(w(st.r.length === 1 ? 'busLines1' : 'busLines', { n: st.r.length }))}</span></div>
      <div class="list">${st.r.map(ri => { const r = DATA.buses.routes[ri]; return `<div><span><i class="bdot" style="background:${buses ? buses.colOf(ri) : '#4fc3f7'}"></i>${esc([r.ref, r.name].filter(Boolean).join(' · '))}</span></div>`; }).join('')}</div>
      <p class="fine">${w('busNote')}</p>`;
  } else if (s.kind === 'place') {
    const c = prepR ? cellAt(prepR, s.x, s.y) : -1;
    if (c < 0) { el.innerHTML = `<h2>${w('hereTitle')}</h2><p class="fine">${w('unavailable')}</p>`; return; }
    const occ = prepR.t.occ[c], har = prepR.har[c];
    el.innerHTML = `<h2>${w('hereTitle')} <span style="font-weight:400;color:var(--muted)">${esc(nearName(s.x, s.y))}</span></h2>
      <div class="sub"><span class="tagsim">${w('sim')}</span></div>
      <div class="list"><div><span>AQI</span><b id="p-aqi"></b></div><div><span>${w('rain')}</span><b id="p-rain"></b></div>
        <div><span>${w('water')}</span><b>${Number.isFinite(har) ? w('har', { m: har.toFixed(1) }) : '·'}</b></div></div>
      <p class="fine">${occ === 255 ? '' : occ > 0 ? w('satWater', { p: occ }) : w('satNone')}</p>
      <button class="btn" id="reach-b">${w(drive && drive.on ? 'reach10' : 'reach')}</button><div class="fine" id="reach-o"></div>`;
    $('#reach-b').onclick = () => runReach(s.x, s.y);
  }
}
function updateCard(C) {
  const s = S.sel; if (!s) return;
  const m = S.m, k = C.k;
  if (s.kind === 'j' && scene) {
    const j = sim.J[s.i];
    scene.set({ minute: m, volume: Math.round(j.flow[k]), rain: Math.round(j.rain[k] * 10) / 10, water: Math.round(j.water[k] * 10) / 10, pm25: Math.round(j.pm[k]), lang });
    const a = sim.aqiAt(j, m), p = scene.packet();
    $('#jnums').innerHTML = [[num(p.vehiclesPerMin ?? j.flow[k]), w('vpm')], [num(j.queue[k]) + ' m', w('queue')], [a, 'AQI'], [j.water[k].toFixed(0) + ' cm', w('water')]]
      .map(([v, l]) => `<div class="num"><b>${v}</b><span>${l}</span></div>`).join('');
    $('#pkt').textContent = '{\n' + Object.entries(p).map(([kk, v]) => `  "${kk}": ${JSON.stringify(v)}`).join(',\n') + '\n}';
    $('#pbytes').textContent = w('bytes', { n: scene.packetBytes() });
    drawSeries($('#jchart'), [{ a: j.flow, col: '#ffb347', max: j.peak * 1.15 }, { a: j.queue, col: '#ff5a4d', max: 600 }]);
  } else if (s.kind === 'air') {
    const j = C.worst, cat = SIM.catOf(C.aqiMax);
    $('#aqi-v').textContent = C.aqiMax; $('#aqi-c').textContent = w(cat.key); $('#aqi-c').style.background = cat.col;
    $('#aqi-s').textContent = `${w('airWorst', { n: sim.J.length })} · ${j.id} ${nearName(j.x, j.y)} · ${j.pm[k].toFixed(0)} µg/m³`;
    drawAir($('#achart'), j);
  } else if (s.kind === 'rain') {
    $('#rain-v').textContent = Math.round(C.rainMax);
    drawSeries($('#rchart'), sim.J.slice(0, 6).map((j, i) => ({ a: j.rain, col: ['#7aa7ff', '#9fd0ff', '#5fd4e6', '#a98bff', '#c9d1dc', '#3aa0ff'][i], max: 120 })), { from: -60, to: 300, mark: 25 });
  } else if (s.kind === 'water') {
    $('#river-v').textContent = SIM.riverStage(m).toFixed(2) + ' m';
    $('#sw-v').textContent = `${w('nJ', { n: C.wet })} · ${C.waterMax.toFixed(0)} cm`;
    drawSeries($('#wchart'), sim.J.slice(0, 6).map((j, i) => ({ a: j.water, col: ['#3aa0ff', '#5fd4e6', '#7aa7ff', '#9fd0ff', '#2f7fd6', '#a0e6ff'][i], max: 60 })), { from: -30, to: 360, mark: SIM.KERB });
  } else if (s.kind === 'traffic') {
    $('#tr-v').textContent = $('#c-traffic').textContent;
    const top = sim.J.map((j, i) => ({ j, i, q: j.queue[k] })).sort((a, b) => b.q - a.q).slice(0, 4);
    $('#tr-list').innerHTML = top.map(t => `<div role="button" tabindex="0" data-i="${t.i}" style="cursor:pointer"><span>${t.j.id} ${esc(nearName(t.j.x, t.j.y))}</span><b>${num(t.q)} m</b></div>`).join('');
    $('#tr-list').querySelectorAll('[data-i]').forEach(d => d.onclick = () => openCard({ kind: 'j', i: +d.dataset.i }));
  } else if (s.kind === 'dc') {
    const bytes = new TextEncoder().encode(JSON.stringify({ t: '07:40', node: 'J-01', vehiclesPerMin: 64, peoplePerMin: 12, queueM: 120, rainMmH: 0, waterCm: 0, pm25: 72, quality: 'ok' })).length;
    $('#dc-bytes').textContent = w('bytes', { n: bytes });
  } else if (s.kind === 'place') {
    if (!prepR || cellAt(prepR, s.x, s.y) < 0 || !$('#p-aqi')) return;
    const pm = sim.air.at(s.x, s.y, m);
    $('#p-aqi').textContent = `${SIM.aqi(pm)} · ${pm.toFixed(0)} µg/m³`; $('#p-rain').textContent = `${SIM.rainAtM(s.x, s.y, m).toFixed(0)} mm/h`;
  }
}

// ---------- real drive times from Mapbox, asked when a person taps ----------
const KEYW = { low: 'kLow', moderate: 'kMod', heavy: 'kHeavy', severe: 'kSevere', unknown: 'kNone' };
const busiestAt = m => { const k = sim.idx(m); let b = 0; sim.J.forEach((j, i) => { if (j.queue[k] > sim.J[b].queue[k]) b = i; }); return b; };
function destsFor(i) {
  const a = sim.J[i];
  return sim.J.map((j, k) => ({ k, d: Math.hypot(j.x - a.x, j.y - a.y) })).filter(o => o.d >= 1000).sort((p, q) => p.d - q.d).slice(0, 4).map(o => o.k);
}
const ppTime = () => new Date().toLocaleTimeString(lang === 'km' ? 'km-KH' : lang === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' });
function driveLabel(i) { const b = $('#drive-b'), ds = destsFor(i); if (b && ds.length) b.textContent = w('liveB', { to: sim.J[ds[S.dk % ds.length]].id }); }
// a pose that fits the route into the part of the map the card leaves visible
function fitRoute(pts) {
  const c = world.ctrl, az = c.az, el = 1.0, cam = world.camera, ca = Math.cos(az), sa = Math.sin(az);
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of pts) {
    const u = p.x * ca + p.y * sa, v = -p.x * sa + p.y * ca;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const H = cam.view && cam.view.enabled ? cam.view.fullHeight : innerHeight, k = H / (2 * Math.tan(cam.fov * Math.PI / 360));
  const side = innerWidth > innerHeight && innerHeight <= 520;
  const visW = innerWidth - (side && S.sel ? $('#card').offsetWidth : 0), visH = innerHeight - (side ? 74 : (S.sel ? $('#card').offsetHeight + 74 : 130)) - 60;
  const dist = Math.max(900, k * Math.max((u1 - u0) / (visW * 0.78), (v1 - v0) * Math.sin(el) / (Math.max(160, visH) * 0.78)));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, dist, az, el };
}
async function runDrive(i) {
  const o = $('#drive-o'), b = $('#drive-b'); if (!o || !b || !drive || drive.busy) return;
  const ds = destsFor(i); if (!ds.length) return;
  const a = sim.J[i], z = sim.J[ds[S.dk % ds.length]];
  b.disabled = true; o.innerHTML = `<p class="fine">${esc(w('liveWait'))}</p>`;
  try {
    const r = await drive.ask(a, z);
    if (!(S.sel && S.sel.kind === 'j' && S.sel.i === i) || !document.body.contains(o)) { drive.clear(); return; }
    const gap = r.usualMin ? r.min / r.usualMin - 1 : null;
    const verdict = gap == null ? '' : Math.abs(gap) < 0.05 ? w('usual') : w(gap > 0 ? 'slower' : 'faster', { p: Math.round(Math.abs(gap) * 100) });
    const vcol = gap == null ? 'var(--muted)' : gap > 0.25 ? CONG.heavy : gap > 0.05 ? CONG.moderate : CONG.low;
    const key = ['low', 'moderate', 'heavy', 'severe', 'unknown'].filter(c => r.share[c] > 0.005)
      .map(c => `<span><i style="background:${CONG[c]}"></i>${esc(w(KEYW[c]))} ${Math.round(r.share[c] * 100)}%</span>`).join('');
    o.innerHTML = `<div class="list"><div><span>${a.id} → ${z.id} · ${r.km.toFixed(1)} km</span><b>${esc(w('liveNow'))} ${Math.round(r.min)} min</b></div>${r.usualMin ? `<div><span>${esc(w('liveUsual'))}</span><b>${Math.round(r.usualMin)} min</b></div>` : ''}</div>
      ${verdict ? `<p class="verdict" style="color:${vcol}">${esc(verdict)}</p>` : ''}<div class="ckey">${key}</div>
      <div class="credit mb"><a class="mb-logo" href="https://www.mapbox.com/" target="_blank" rel="noopener" aria-label="Mapbox"></a><span><a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">© Mapbox</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> <a href="${drive.feedback(a.x, a.y)}" target="_blank" rel="noopener"><b>Improve this map</b></a></span></div>
      <p class="fine">${esc(w('liveAt', { t: ppTime() }))} ${esc(w('liveNote'))}</p>`;
    world.flyTo(fitRoute(r.pts), 1200);
    o.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    S.dk++;
  } catch (e) {
    if (document.body.contains(o)) o.innerHTML = `<p class="fine">${esc(w({ offline: 'liveOff', limit: 'liveLimit' }[e && e.why] || 'liveFail'))}</p>`;
  } finally { if (document.body.contains(b)) { b.disabled = false; driveLabel(i); } }
}

// a small chart of one or more series over the window (or a part), with the playhead
function sizeChart(cv) {
  const dpr = Math.min(2, devicePixelRatio || 1), Wd = cv.clientWidth, Hd = cv.clientHeight;
  if (cv.width !== Math.round(Wd * dpr)) { cv.width = Math.round(Wd * dpr); cv.height = Math.round(Hd * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, Wd, Hd);
  return { c, Wd, Hd };
}
function axis(c, X, Hd, Wd, from, to) {
  c.fillStyle = 'rgba(11,18,32,.55)'; c.fillRect(X(S.m), 0, Wd - X(S.m), Hd);
  c.fillStyle = '#f5c451'; c.fillRect(X(S.m) - 1, 0, 2, Hd);
  c.fillStyle = '#b7c0cf'; c.font = '10px Kantumruy Pro, system-ui';
  const stepM = to - from > 1000 ? 360 : 60;
  for (let m = Math.ceil(from / stepM) * stepM; m <= to; m += stepM) c.fillText(SIM.label(m).hhmm, X(m) + 2, Hd - 3);
}
function drawSeries(cv, series, { from = SIM.M0, to = SIM.M1, mark = null } = {}) {
  if (!cv) return;
  const { c, Wd, Hd } = sizeChart(cv);
  const X = m => 4 + (m - from) / (to - from) * (Wd - 8);
  c.fillStyle = 'rgba(255,255,255,.04)'; c.fillRect(0, 0, Wd, Hd);
  series.forEach((s, si) => {
    const Y = v => Hd - 14 - Math.min(1, v / s.max) * (Hd - 24);
    if (mark != null && si === 0) { c.strokeStyle = 'rgba(255,90,77,.7)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(0, Y(mark)); c.lineTo(Wd, Y(mark)); c.stroke(); c.setLineDash([]); }
    c.strokeStyle = s.col; c.lineWidth = 1.8; c.beginPath();
    for (let m = from; m <= to; m += SIM.STEP) { const x = X(m), y = Y(s.a[sim.idx(m)]); m === from ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
  });
  axis(c, X, Hd, Wd, from, to);
}
// AQI at one sensor: what happened up to now, and the forecast made now for the next 3 hours
function drawAir(cv, j) {
  const from = Math.max(SIM.M0, Math.min(SIM.M1 - 1440, S.m - 720)), to = from + 1440, { c, Wd, Hd } = sizeChart(cv);
  const X = m => 4 + (m - from) / (to - from) * (Wd - 8), Y = a => Hd - 14 - Math.min(1, a / 220) * (Hd - 24);
  let lo = 0;
  for (const cat of SIM.CATS.slice(0, 5)) { const hi = Math.min(220, cat.max); c.fillStyle = cat.col + '40'; c.fillRect(0, Y(hi), Wd, Y(lo) - Y(hi)); lo = hi; }
  c.strokeStyle = '#f4f1ea'; c.lineWidth = 2; c.beginPath();
  for (let m = from; m <= S.m; m += 10) { const y = Y(sim.aqiAt(j, m)); m === from ? c.moveTo(X(m), y) : c.lineTo(X(m), y); }
  c.stroke();
  const now = sim.hourMean(j.pm, S.m), base = sim.air.shape(j.rd, S.m - 30);
  c.strokeStyle = '#f5c451'; c.setLineDash([5, 4]); c.lineWidth = 2; c.beginPath(); c.moveTo(X(S.m), Y(sim.aqiAt(j, S.m)));
  for (let k = 20; k <= 180; k += 20) c.lineTo(X(S.m + k), Y(SIM.aqi(now * sim.air.shape(j.rd, S.m + k) / base)));
  c.stroke(); c.setLineDash([]);
  axis(c, X, Hd, Wd, from, to);
}

// ---------- possible water level and reach ----------
let mask = null;
function setRise(r) {
  S.rise = r; const o = $('#rise-o'), t = $('#rise-s'); if (o) o.textContent = `+${r} m`;
  if (r > 0) {
    flood(prepR, r, mask); world.setFlood(mask); const u = streetsUnder(prepR, mask, DATA.geo), c = underBlue(mask);
    if (spots) spots.set(c.list);
    if (t) t.innerHTML = `${esc(w('streetsUnder', { km: u.km.toFixed(0) }))}<br><b>${esc(w('inBlue', c.w))}</b><br><span class="credit">${esc(w('popSrc'))}</span>`;
    return u.km;
  }
  world.setFlood(null); if (spots) spots.clear(); if (t) t.textContent = ''; return 0;
}
const roundP = n => n < 1000 ? Math.round(n / 10) * 10 : n < 10000 ? Math.round(n / 100) * 100 : Math.round(n / 1000) * 1000;
const countWords = (people, list) => {
  const k = { s: 0, h: 0, m: 0 }; for (const p of list) k[p[2]]++;
  const parts = ['s', 'h', 'm'].filter(c => k[c]).map(c => w('n' + c.toUpperCase() + (k[c] === 1 ? '1' : ''), { n: k[c] }));
  return { p: num(roundP(people)), rest: parts.length ? w('sep') + parts.join(w('sep')) : '' };
};
// what lies under a possible river level: people (population map) and places (OpenStreetMap)
function underBlue(mask) {
  let people = 0; if (popArr) for (let i = 0; i < mask.length; i++) if (mask[i]) people += popArr[i];
  const list = DATA.places && placeCells ? DATA.places.pts.filter((_, k) => placeCells[k] >= 0 && mask[placeCells[k]]) : [];
  return { list, w: countWords(people / 10, list) };
}
// what lies inside the ten-minute drive
function insideRings(rings) {
  const pts = rings.flat(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && rings.some(r => inRing(r, x, y));
  let people = 0;
  if (popArr && prepR) {
    const g = prepR.t.grid, o = DATA.geo.origin, kx = DATA.geo.kx, ky = DATA.geo.ky, dl = (g.east - g.west) / g.w, dt = (g.north - g.south) / g.h;
    for (let r = 0; r < g.h; r++) { const y = (g.north - (r + 0.5) * dt - o.lat) * ky; if (y < y0 || y > y1) continue;
      for (let c = 0; c < g.w; c++) { const v = popArr[r * g.w + c]; if (!v) continue; const x = (g.west + (c + 0.5) * dl - o.lon) * kx; if (inside(x, y)) people += v; } }
  }
  const list = DATA.places ? DATA.places.pts.filter(p => inside(p[0], p[1])) : [];
  return { list, w: countWords(people / 10, list) };
}
const mbCredit = (x, y) => `<div class="credit mb"><a class="mb-logo" href="https://www.mapbox.com/" target="_blank" rel="noopener" aria-label="Mapbox"></a><span><a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">© Mapbox</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> <a href="${drive.feedback(x, y)}" target="_blank" rel="noopener"><b>Improve this map</b></a></span></div>`;
const ppHM = iso => new Date(iso).toLocaleTimeString(lang === 'km' ? 'km-KH' : lang === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' });
let sensorEls = [];
function clearReal() {
  if (buses) buses.select(-1); if (area) area.clear(); if (spots && !S.rise) spots.clear();
  for (const L of sensorEls) { L.el.remove(); const k = labelEls.indexOf(L); if (k >= 0) labelEls.splice(k, 1); } sensorEls = [];
}
async function loadLive(kind) {
  const box = $('#live-' + kind); if (!box) return;
  try {
    const d = await fetchLive();
    if (!document.body.contains(box)) return;
    if (kind === 'air') {
      box.innerHTML = d.air && d.air.length
        ? `<div class="list">${d.air.map(a => { const aq = SIM.aqi(a.pm25), cat = SIM.catOf(aq); return `<div><span>${esc(a.name)} · ${esc(ppHM(a.at))}</span><b><i class="bdot" style="background:${cat.col}"></i>${a.pm25} µg/m³ · AQI ${aq}</b></div>`; }).join('')}</div>
          <p class="credit">${esc(w('airSrc'))} · <a href="https://openaq.org/" target="_blank" rel="noopener">OpenAQ</a></p>`
        : `<p class="fine">${esc(w('noSensors'))}</p>`;
      for (const a of d.air || []) {
        const el = document.createElement('div'), aq = SIM.aqi(a.pm25), cat = SIM.catOf(aq);
        el.className = 'lbl sensor'; el.innerHTML = `<i style="background:${cat.col}"></i>PM2.5 ${a.pm25}`; $('#labels').append(el);
        const L = { el, p: toLocal(a.lon, a.lat), id: 'sensor', h: 40, w: 0 }; labelEls.unshift(L); sensorEls.push(L);
      }
    } else {
      const x = d.weather;
      box.innerHTML = x ? `<div class="list"><div><span>${esc(w('temp'))}</span><b>${x.t} °C</b></div><div><span>${esc(w('rain'))}</span><b>${x.rain} mm</b></div>
          <div><span>${esc(w('humid'))}</span><b>${x.rh}%</b></div><div><span>${esc(w('windW'))}</span><b>${x.wind} km/h</b></div></div>
          <p class="credit">${esc(w('wxSrc', { t: x.at.slice(11, 16) }))} · <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></p>`
        : `<p class="fine">${esc(w('liveFailAll'))}</p>`;
    }
  } catch (e) {
    if (document.body.contains(box)) box.innerHTML = `<p class="fine">${esc(w(e && e.why === 'offline' ? 'liveOffAll' : 'liveFailAll'))}</p>`;
  }
}
let rd = null, reachAnim = null;
let reachNote = '';
async function runReach(x, y) {
  reachNote = '';
  if (drive && drive.on && navigator.onLine) {
    const o = $('#reach-o'), b = $('#reach-b'); if (!o || !b || b.disabled) return;
    b.disabled = true; o.textContent = w('liveWait');
    try {
      const rings = await fetchIsochrone(DATA.mapbox.token, DATA.geo, x, y, 10);
      if (!(S.sel && S.sel.kind === 'place') || !document.body.contains(o)) return;
      area.set(rings); if (reachLayer) reachLayer.visible(false);
      const c = insideRings(rings); if (spots) spots.set(c.list);
      o.innerHTML = `<b class="verdict">${esc(w('reach10Out', c.w))}</b>${mbCredit(x, y)}<p class="fine">${esc(w('liveAt', { t: ppTime() }))} ${esc(w('liveNote'))} ${esc(w('popSrc'))}</p>`;
      world.flyTo(fitRoute(rings.flat().map(([px, py]) => ({ x: px, y: py }))), 1200);
      if (document.body.contains(b)) b.disabled = false;
      return;
    } catch (e) {
      if (document.body.contains(b)) b.disabled = false;
      if (!(S.sel && S.sel.kind === 'place') || !document.body.contains(o)) return;
      reachNote = w({ offline: 'liveOff', limit: 'liveLimit' }[e && e.why] || 'liveFail') + ' ' + w('modelInstead');
    }
  }
  if (!city) return;
  if (!rd) rd = { dist: new Float64Array(city.nN), times: new Float32Array(city.nB) };
  const st = K.startAt(city, x, y);
  K.reach(city, st, 'tuk', null, 720, rd.dist); K.doorTimes(city, rd.dist, 0, rd.times);
  reachLayer.set(rd.dist, city.cost.tuk, null, null); reachLayer.pin(x, y); reachLayer.U.uBudget.value = 600;
  reachLayer.visible(true); reachAnim = reduced ? null : { t0: performance.now() }; if (reduced) reachLayer.U.uFront.value = 600;
  $('#reach-o').textContent = (reachNote ? reachNote + ' ' : '') + w('reachOut', { n: num(K.countWithin(rd.times, 600)) });
}

// ---------- story: one button through the day ----------
let tween = null, sweep = null, STORY = [];
function tweenTime(to) {
  setPlaying(false);
  if (reduced || Math.abs(to - S.m) < 1) { tween = null; setTime(to); return; }
  tween = { from: S.m, to, t0: performance.now(), ms: Math.min(2400, Math.max(900, 1600 * Math.abs(to - S.m) / 600)) };
}
const poseNear = (j, d = 2600) => ({ x: j.x, y: j.y - d * 0.3, dist: d, az: POSE.az, el: 0.72 });
const RISE = +(Q.get('rise') || 9), RISE_POSE = { x: -600, y: 700, dist: 15000, az: -0.3, el: 0.9 };
function makeStory() {
  const AL = k => ALERTS.find(a => a.kind === k);
  const air = AL('air'), rain = AL('rain'), water = AL('water'), tr = AL('traffic');
  const worstAir = () => { let b = 0; sim.J.forEach((j, i) => { if (sim.aqiAt(j, START) > sim.aqiAt(sim.J[b], START)) b = i; }); return b; };
  const st = [];
  st.push({ cap: () => w('st0'), go: () => { if (S.rise) { S.rise = 0; world.setFlood(null); if (spots) spots.clear(); } closeCard(); tweenTime(START); world.flyTo(POSE, 1400); } });
  st.push({ cap: () => w('stTurn'), go: () => { closeCard(); tweenTime(START); world.flyTo(POSE, 1000); if (!reduced) S.orbit = { left: 2 * Math.PI, wait: performance.now() + 1100, rate: 0.9 }; } });
  const i1 = worstAir(), hasPano = () => DATA.panos && DATA.panos.panos[sim.J[i1].id] && !panoFail.has(sim.J[i1].id);
  st.push({ cap: () => w(hasPano() ? 'st1p' : 'st1'), go: () => { S.orbit = null; tweenTime(START); world.flyTo(poseNear(sim.J[i1]), 1400); S.jview = hasPano() ? 'photo' : 'shield'; S.sweepPano = !reduced; if (S.sel && S.sel.kind === 'j') { killViews(); S.sel = { kind: 'j', i: i1 }; buildCard(); updateCard(cityNow(S.m)); } else openCard({ kind: 'j', i: i1 }); if (!hasPano() && !reduced) sweep = { t0: performance.now() + 500 }; } });
  st.push({ cap: () => w('st1'), go: () => { S.jview = 'shield'; if (!(S.sel && S.sel.kind === 'j')) openCard({ kind: 'j', i: i1 }); else { const b = document.querySelector('.tabs [data-v="shield"]'); if (b) b.click(); } if (!reduced) sweep = { t0: performance.now() + 300 }; } });
  if (air && air.issue != null && air.event != null) st.push({ cap: () => w('st2', { t: dur(air.event - air.issue) }), go: () => { world.flyTo(POSE, 1400); tweenTime(START); openCard({ kind: 'air' }); } });
  if (rain && rain.issue != null) st.push({ cap: () => w('st3'), go: () => { closeCard(); world.flyTo(POSE, 1400); tweenTime(rain.issue + 1); } });
  if (rain && rain.event != null && rain.lead != null) st.push({ cap: () => w('st4', { t: dur(rain.lead) }), go: () => { closeCard(); tweenTime(rain.event + 20); } });
  if (water && water.lead != null) st.push({ cap: () => w('st5', { t: dur(water.lead) }), go: () => { closeCard(); tweenTime(water.event + 30); } });
  if (tr) {
    const t = tr.event + Math.min(45, ((tr.end ?? SIM.M1) - tr.event) / 2);
    st.push({ cap: () => w('st6'), go: () => { const b = busiestAt(t); tweenTime(t); world.flyTo(poseNear(sim.J[b]), 1400); S.jview = 'shield'; openCard({ kind: 'j', i: b }); } });
    if (drive && drive.on) st.push({ cap: () => w('stLive'), go: () => { const b = busiestAt(t); if (!(S.sel && S.sel.kind === 'j' && S.sel.i === b)) openCard({ kind: 'j', i: b }); runDrive(b); } });
  }
  st.push({ cap: () => w('st7', { r: RISE }), go: () => { closeCard(); world.flyTo(RISE_POSE, 1400); if (prepR) setRise(RISE); } });
  st.push({ cap: () => w('st8'), go: () => { if (S.rise) { S.rise = 0; world.setFlood(null); if (spots) spots.clear(); } world.flyTo(POSE, 1400); openCard({ kind: 'dc' }); } });
  st.push({ cap: () => w('st9'), go: () => { closeCard(); world.flyTo(POSE, 1400); tween = null; setPlaying(true); } });
  return st;
}
function renderStory(animate) {
  const t = $('#coach-t'), b = $('#coach-next'), last = S.story >= STORY.length - 1;
  t.textContent = STORY.length ? STORY[S.story].cap() : '';
  b.textContent = w(last ? 'again' : 'next'); b.classList.toggle('again', last);
  if (animate) { t.classList.remove('in'); void t.offsetWidth; t.classList.add('in'); }
}
function storyNext() {
  hideTitle();
  if (!STORY.length) return;
  S.story = S.story >= STORY.length - 1 ? 0 : S.story + 1;
  STORY[S.story].go(); renderStory(true);
  $('#coach-next').classList.remove('glow');
  $('#live').textContent = STORY[S.story].cap();
}
let titleT = 0;
function hideTitle() { clearTimeout(titleT); $('#title').classList.add('gone'); }
function pulseTime() { const tb = $('#timebar'); tb.classList.remove('pulse'); void tb.offsetWidth; tb.classList.add('pulse'); }

// ---------- menus, labels, language ----------
function menu(anchor, items, multi) {
  closeMenu();
  const m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu');
  for (const [label, on, fn] of items) {
    const b = document.createElement('button'); b.textContent = label; b.setAttribute('role', multi ? 'menuitemcheckbox' : 'menuitemradio'); b.setAttribute('aria-checked', String(on));
    b.onclick = () => { fn(); if (multi) b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')); else closeMenu(); };
    m.append(b);
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px';
  setTimeout(() => addEventListener('pointerdown', outside, true), 0);
}
function outside(e) { if (!e.target.closest('.menu')) closeMenu(); }
function closeMenu() { document.querySelectorAll('.menu').forEach(m => m.remove()); removeEventListener('pointerdown', outside, true); }
const labelEls = [];
function makeLabels() {
  const d = document.createElement('div'); d.className = 'lbl dc'; $('#labels').append(d); labelEls.push({ el: d, p: DC, id: 'dc', h: DC.h, w: 0 });
  for (const id of [...LABELS, ...Object.keys(LMK).filter(k => !LABELS.includes(k))]) {
    const l = LMK[id]; if (!l) continue; const d = document.createElement('div'); d.className = 'lbl tap'; d.setAttribute('role', 'button'); d.tabIndex = 0; $('#labels').append(d);
    d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLandmark(id); } });
    labelEls.push({ el: d, p: toLocal(l.lng, l.lat), id, w: 0, minor: !LABELS.includes(id) });
  }
  labelText();
}
function openLandmark(id) {
  const l = LMK[id]; if (!l) return; hideTitle(); openCard({ kind: 'lmk', id });
  const p = toLocal(l.lng, l.lat); world.flyTo({ x: p.x, y: p.y, dist: Math.min(world.ctrl.dist, 3200), az: world.ctrl.az, el: Math.max(world.ctrl.el, 0.75) }, 1100);
}
// a tap on a place name: its box, grown to a 40 px target
function labelAt(cx, cy) {
  for (const L of labelEls) {
    if (!L.el.classList.contains('tap') || L.el.style.display === 'none') continue;
    const r = L.el.getBoundingClientRect(), pad = Math.max(0, (40 - r.height) / 2);
    if (cx >= r.left - 6 && cx <= r.right + 6 && cy >= r.top - pad && cy <= r.bottom + pad) return L.id;
  }
  return null;
}
function labelText() { for (const L of labelEls) { if (L.id === 'sensor') continue; if (L.id === 'dc') { L.el.textContent = w('dc4'); L.w = 0; continue; } const l = LMK[L.id]; L.el.textContent = (l[lang] || l.en).split(' · ')[0]; L.w = 0; } }
function placeLabels() {
  const taken = [], bottom = innerHeight - ($('#card').hidden ? 130 : $('#card').offsetHeight + 80);
  for (const L of labelEls) {
    const q = world.project(L.p.x, L.p.y, L.h || 30), wd = L.w || (L.w = L.el.offsetWidth || 80);
    if (L.id === 'dc') q.y += 34;
    let show = q.on && q.y > 130 && q.y < bottom && !(L.minor && world.ctrl.dist > 7000);
    if (show) for (const t of taken) if (Math.abs(t.x - q.x) < (t.w + wd) / 2 + 4 && Math.abs(t.y - q.y) < 22) { show = false; break; }
    L.el.style.display = show ? '' : 'none';
    if (show) { L.el.style.transform = `translate(${(q.x - wd / 2).toFixed(0)}px, ${(q.y - 10).toFixed(0)}px)`; taken.push({ x: q.x, y: q.y, w: wd }); }
  }
}
function applyLang(l) {
  lang = WORDS[l] ? l : 'en'; document.documentElement.lang = lang;
  $('#lang').textContent = { en: 'EN', km: 'ខ្មែរ', th: 'ไทย' }[lang];
  document.querySelectorAll('[data-w]').forEach(el => { el.textContent = w(el.dataset.w); });
  $('#world').setAttribute('aria-label', w('simNote'));
  $('#layers').setAttribute('aria-label', w('layers')); $('#compass').setAttribute('aria-label', w('north')); $('#orbit').setAttribute('aria-label', w('orbit'));
  if (STORY.length) renderStory(); labelText(); lastAlertKey = '';
  if (S.ready) { tbar.redraw(); if (S.sel) { killViews(); buildCard(); } setTime(S.m); }
}

// ---------- boot ----------
async function gunzip(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
function onTap(cx, cy) {
  if (!S.ready) return;
  const r = $('#world').getBoundingClientRect();
  const lb = labelAt(cx, cy); if (lb) return openLandmark(lb);
  const hit = junc.pick(world.project, cx - r.left, cy - r.top, 34);
  if (hit === 'dc') return openCard({ kind: 'dc' });
  if (hit >= 0) return openCard({ kind: 'j', i: hit });
  const stp = buses ? buses.pick(world.project, cx - r.left, cy - r.top) : -1;
  if (stp >= 0) return openCard({ kind: 'stop', i: stp });
  const g = world.pickGround(cx, cy); if (!g) { pulseTime(); return; }
  openCard({ kind: 'place', x: g.x, y: g.y });
}
function setPlaying(p) {
  S.playing = p && !reduced;
  $('#play-i').setAttribute('d', S.playing ? 'M6 4h4v16H6zM14 4h4v16h-4z' : 'M7 4v16l13-8z');
  $('#play').setAttribute('aria-label', w(S.playing ? 'pause' : 'play'));
}
async function boot() {
  const t0 = performance.now(), T = {};
  for (const l of DATA.landmarks) LMK[l.id] = l;
  FX = DATA.fixture;
  tbar = createTimebar($('#timebar'), { onTime: (m, u) => { tween = null; setPlaying(false); setTime(m, u); hideTitle(); }, alerts: () => ALERTS, dayNames: () => w('days') });
  applyLang(Q.get('lang') || (navigator.language || 'en').slice(0, 2).replace(/^(?!km|th).*/, 'en'));
  if (Q.has('nocoach')) $('#coach').hidden = true;
  const buildings = await gunzip(DATA.buildings);
  const terrain = decodeTerrain(DATA.terrain);
  const tier = Q.get('tier') || ((navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 'low' : 'mid');
  world = createWorld($('#world'), { geo: DATA.geo, terrain, buildings }, { tier, reducedMotion: reduced, preserve: Q.has('shot'), onTap, minDist: 300, twoFingerModes: true });
  world.setStorm(SIM.storm); world.setRise(1); world.flyTo(POSE, 0);
  window.__world = world; window.__S = S;
  T.world = performance.now() - t0;
  // simulate the 48 hours on the phone
  const t1 = performance.now();
  const tg = terrain.grid, o = DATA.geo.origin;
  grid = { nx: 64, ny: 52, x0: (tg.west - o.lon) * DATA.geo.kx, x1: (tg.east - o.lon) * DATA.geo.kx, y0: (tg.south - o.lat) * DATA.geo.ky, y1: (tg.north - o.lat) * DATA.geo.ky };
  sim = SIM.simulate(DATA.geo, { junctions: FX.junctions }, grid);
  sim.J.forEach((j, i) => { const f = FX.junctions[i]; Object.assign(j, { tWarn: f.tWarn, tHeavy: f.tHeavy, tHeavyEnd: f.tHeavyEnd, tWater: f.tWater, tDry: f.tDry }); });
  ALERTS = SIM.alerts(sim);
  simMs = performance.now() - t1; T.sim = simMs;
  airBuf = new Float32Array(grid.nx * grid.ny);
  airLayer = createAir(world, grid);
  traffic = createTraffic(world, DATA.geo, { count: tier === 'low' ? 2200 : 4200, extent: { x0: -12000, x1: 9000, y0: -9000, y1: 9000 } });
  junc = createJunctions(world, FX.junctions, DC);
  if (DATA.signals) signals = createSignals(world, DATA.signals.pts);
  if (DATA.buses) buses = createBuses(world, DATA.buses);
  spots = createSpots(world); area = createArea(world);
  if (DATA.mapbox && DATA.mapbox.token) {
    drive = createDrive(world, DATA.geo, DATA.mapbox.token);
    document.documentElement.style.setProperty('--mb-logo', `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(DATA.mapbox.logo)}")`);
  }
  makeLabels(); tbar.resize();
  STORY = makeStory(); renderStory();
  titleT = setTimeout(hideTitle, Q.has('shot') ? 1e9 : 6500);
  setTimeout(() => $('#coach-next').classList.add('glow'), 2500);
  S.ready = true; $('#app').classList.add('ready');
  setTime(S.m, 'force');
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (tween) { const u = Math.min(1, (now - tween.t0) / tween.ms), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; setTime(tween.from + (tween.to - tween.from) * e); if (u >= 1) tween = null; }
    if (sweep && scene && now > sweep.t0) { const u = Math.min(1, (now - sweep.t0) / 1800), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; S.divider = 0.92 - 0.6 * e; scene.set({ divider: S.divider }); if (u >= 1) sweep = null; }
    if (S.orbit && now > (S.orbit.wait || 0) && !world.ctrl.anim) { const da = Math.min(S.orbit.left, dt * (S.orbit.rate || 0.35)); world.ctrl.az += da; S.orbit.left -= da; if (S.orbit.left <= 1e-6) S.orbit = null; }
    $('#orbit').setAttribute('aria-pressed', String(!!(S.orbit && S.orbit.left === Infinity)));
    needle.setAttribute('transform', `rotate(${(world.ctrl.az * 180 / Math.PI).toFixed(1)} 12 12)`);
    if (signals) signals.frame(reduced ? 0 : now, S.layers.signals);
    if (drive) drive.frame(world.ctrl.dist, world.camera);
    if (buses) buses.frame(world.ctrl.dist, world.camera, S.layers.buses);
    if (area) area.frame(world.ctrl.dist, world.camera);
    if (S.playing) { const rate = S.m >= -30 && S.m <= 240 ? 5 : 30; setTime(S.m + dt * rate); if (S.m >= SIM.M1) setPlaying(false); }
    const k = sim.idx(S.m);
    let qm = 0, rmax = 0; for (const j of sim.J) { qm += j.queue[k]; rmax = Math.max(rmax, j.rain[k]); } qm /= sim.J.length;
    traffic.frame(reduced ? 0 : dt, SIM.trafficProfile(S.m) * (1 - 0.35 * Math.min(1, rmax / 40)), nightOf(S.m), 1 - Math.min(0.75, qm / 300), S.layers.traffic);
    airLayer.frame(reduced ? 0 : dt, S.layers.air);
    junc.frame(reduced ? 0 : dt, { cams: S.layers.cams });
    if (reachLayer && reachAnim) { const u = Math.min(1, (now - reachAnim.t0) / 1400); reachLayer.U.uFront.value = 600 * (1 - Math.pow(1 - u, 2.2)); if (u >= 1) reachAnim = null; }
    if (reachLayer) reachLayer.frame(world.ctrl.dist, dt);
    const side = innerWidth > innerHeight && innerHeight <= 520;
    world.setOcclusion(side && S.sel ? $('#card').offsetWidth : 0, side ? 74 : (S.sel ? $('#card').offsetHeight + 74 : 130));
    $('#coach').style.bottom = S.sel && !side ? `calc(${$('#card').offsetHeight + 84}px + env(safe-area-inset-bottom))` : '';
    world.frame(now); placeLabels();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  T.ready = performance.now() - t0;
  window.__ready = { ms: Math.round(T.ready), steps: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])), junctions: sim.J.length, alerts: ALERTS.map(a => ({ kind: a.kind, issue: a.issue, event: a.event, end: a.end, n: a.n, lead: a.lead })), tier };
  // the river model and the street graph for "possible water level" and "how far from here", after first paint
  await frame();
  prepR = prepare(terrain); mask = new Uint8Array(prepR.N);
  if (DATA.pop) popArr = new Uint16Array(await gunzip(DATA.pop.pop));
  if (DATA.places) placeCells = DATA.places.pts.map(p => cellAt(prepR, p[0], p[1]));
  city = K.prepareCity(buildGraph(DATA.geo), prepR, K.buildingCentres(new Uint8Array(buildings)));
  reachLayer = createStreets(world, city); reachLayer.visible(false);
  window.__ready.full = Math.round(performance.now() - t0);
  if (Q.get('open')) openCard(Q.get('open') === 'j' ? { kind: 'j', i: +(Q.get('i') || 0) } : { kind: Q.get('open') });
}

$('#play').addEventListener('click', () => { tween = null; hideTitle(); if (S.m >= SIM.M1) setTime(SIM.M0); setPlaying(!S.playing); });
$('#card-x').addEventListener('click', closeCard);
$('#compass').addEventListener('click', () => { hideTitle(); S.orbit = null; const c = world.ctrl; let az = c.az % (2 * Math.PI); if (az > Math.PI) az -= 2 * Math.PI; if (az < -Math.PI) az += 2 * Math.PI; c.az = az; world.flyTo({ x: c.target.x, y: -c.target.z, dist: c.dist, az: 0, el: c.el }, 700); });
$('#orbit').addEventListener('click', () => { hideTitle(); S.orbit = S.orbit && S.orbit.left === Infinity ? null : { left: Infinity, rate: 0.35 }; });
$('#world').addEventListener('pointerdown', () => { if (S.orbit) S.orbit = null; });
$('#coach-next').addEventListener('click', storyNext);
addEventListener('pointerdown', e => { if (!e.target.closest('#coach')) hideTitle(); }, { capture: true, passive: true });
$('#lang').addEventListener('click', e => menu(e.currentTarget, [['English', 'en'], ['ខ្មែរ', 'km'], ['ไทย', 'th']].map(([n, l]) => [n, l === lang, () => applyLang(l)])));
$('#layers').addEventListener('click', e => menu(e.currentTarget, [['lAir', 'air'], ['lTraffic', 'traffic'], ['lSignals', 'signals'], ['lBuses', 'buses'], ['lCams', 'cams']].map(([k, id]) => [w(k), S.layers[id], () => { S.layers[id] = !S.layers[id]; }]), true));
document.querySelectorAll('.cchip').forEach(b => b.addEventListener('click', () => {
  openCard({ kind: b.dataset.k });
}));
addEventListener('resize', () => { if (world) { world.resize(); tbar.resize(); } });
addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); if (S.sel) closeCard(); } });

window.__touch = { panoBearing: () => pano ? pano.bearing() : null, busesNear: () => !!(buses && buses.near), underBlue: () => S.rise ? underBlue(mask).w : null, live: k => loadLive(k), drive: i => runDrive(i), dests: i => destsFor(i), route: () => !!(drive && drive.shown), next: storyNext, story: () => STORY.length, S, setTime: m => setTime(m, true), open: sel => openCard(sel), close: closeCard, play: p => setPlaying(p), alerts: () => ALERTS, active: () => activeAlerts(S.m), sim: () => sim, project: (x, y, h) => world.project(x, y, h) };
boot().catch(e => { console.error(e); window.__error = String(e && e.stack || e); });
