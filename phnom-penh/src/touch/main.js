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
import { createTraffic, createAir, createJunctions, STATE_COL } from './layers.js';
import { createTimebar, HAZ_COL } from './timebar.js';
import { createStreetView } from './street.js';
import { WORDS } from './words.js';

const $ = s => document.querySelector(s);
const DATA = JSON.parse(document.getElementById('arun-data').textContent);
const Q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.has('still');
const toLocal = (lon, lat) => ({ x: (lon - DATA.geo.origin.lon) * DATA.geo.kx, y: (lat - DATA.geo.origin.lat) * DATA.geo.ky });

let lang = 'en';
const w = (k, v = {}) => { const s = WORDS[lang][k] ?? WORDS.en[k] ?? k; return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '') : s; };
const num = n => Math.round(n).toLocaleString('en-US');
const dur = min => { min = Math.round(min); return min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}` : `${min} min`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const START = +(Q.get('m') ?? -440);                 // Fri 27 Nov 07:40
const DC = { x: 0, y: 1800, h: 900 };                 // the shared computing node, drawn in the sky above the city
const POSE = { x: -1700, y: 300, dist: 11500, az: -0.3, el: 0.78 };
const LABELS = ['central-market', 'royal-palace', 'wat-phnom', 'independence', 'russian-market', 'koh-pich', 'chroy-changvar', 'olympic'];

export const S = { m: START, playing: false, sel: null, layers: { air: true, traffic: true, cams: true }, coach: 0, rise: 0, divider: 0.5, ready: false };
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
  if (user && S.coach === 2 && S.m >= 60) setCoach(9);
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
  if (a.kind === 'air') return a.phase === 'w' ? [w('wAir'), `${SIM.label(a.issue).hhmm} · 3 h`] : [w('aAir'), `${w('nJ', { n: sim.J.filter(j => sim.aqiAt(j, m) >= SIM.AQI_ALERT).length })}${a.issue != null ? ' · ' + w('ahead', { t: dur(a.event - a.issue) }) : ''}`];
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
  const cat = SIM.catOf(C.aqiMax);
  $('#c-air').textContent = C.aqiMax; document.querySelector('.cchip[data-k="air"]').style.setProperty('--aq', cat.col);
  $('#c-rain').textContent = Math.round(C.rainMax);
  $('#c-river').textContent = SIM.riverStage(S.m).toFixed(2) + ' m';
  $('#c-traffic').textContent = Math.min(100, Math.round(C.traffic * 100)) + '%';
}

// ---------- cards ----------
function openCard(sel) {
  if (scene) { scene.destroy(); scene = null; }
  if (reachLayer) reachLayer.visible(false);
  S.sel = sel; document.documentElement.classList.add('carded');
  $('#card').hidden = false; $('#card').scrollTop = 0;
  buildCard(); updateCard(cityNow(S.m));
  if (sel.kind === 'j' && S.coach === 0) setCoach(1);
  lastAlertKey = ''; renderAlerts();
}
function closeCard() {
  if (scene) { scene.destroy(); scene = null; }
  if (reachLayer) reachLayer.visible(false);
  if (S.rise) { S.rise = 0; world.setFlood(null); }
  S.sel = null; $('#card').hidden = true; document.documentElement.classList.remove('carded'); lastAlertKey = ''; renderAlerts(); setCoach(S.coach);
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
    el.innerHTML = `<h2>${j.id} <span style="font-weight:400;color:var(--muted)">${esc(nearName(j.x, j.y))}</span></h2>
      <div class="sub"><span class="tagsim">${w('camSim')}</span><span>Face Shield</span></div>
      <div class="street" id="street"><canvas></canvas></div>
      <div class="nums" id="jnums"></div>
      <div class="pkt-h"><span>${w('leaves')}</span><span id="pbytes"></span></div>
      <pre class="pkt" id="pkt"></pre>
      <p class="fine">${w('stays')}</p>
      <canvas class="chart" id="jchart" aria-label="${w('traffic')}"></canvas>`;
    const box = $('#street'), cv = box.querySelector('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1), r = box.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    scene = createStreetView(cv, { seed: 11 + s.i, node: j.id, lang });
    scene.set({ divider: S.divider, still: reduced });
    if (!reduced) scene.start();
    const div = e => { const rr = box.getBoundingClientRect(); S.divider = Math.max(0, Math.min(1, (e.clientX - rr.left) / rr.width)); scene.set({ divider: S.divider }); if (S.coach === 1) setCoach(2); };
    box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); div(e); });
    box.addEventListener('pointermove', e => { if (box.hasPointerCapture(e.pointerId)) div(e); });
  } else if (s.kind === 'air') {
    el.innerHTML = `<h2>${w('airTitle')}</h2><div class="sub"><span class="tagsim">${w('sim')}</span><span>PM2.5 · US EPA AQI</span></div>
      <div class="big"><b id="aqi-v"></b><span class="cat" id="aqi-c"></span></div><div class="fine" id="aqi-s"></div>
      <canvas class="chart" id="achart"></canvas><p class="fine">${w('airNote')}</p>`;
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
        <canvas class="chart" id="rchart"></canvas><p class="fine">${w('rainNote')}</p>`
      : `<h2>${w('waterTitle')}</h2><div class="sub"><span class="tagsim">${w('sim')}</span></div>
        <div class="list"><div><span>${w('riverNow')}</span><b id="river-v"></b></div><div><span>${w('streetWater')}</span><b id="sw-v"></b></div></div>
        <canvas class="chart" id="wchart"></canvas>
        <h2 style="font-size:15px;margin-top:10px">${w('possible')}</h2>
        <div class="ruler"><input id="rise" type="range" min="0" max="14" step="0.5" value="${S.rise}" aria-label="${w('possible')}"><output id="rise-o">+${S.rise} m</output></div>
        <div class="fine" id="rise-s"></div><p class="fine">${w('possibleNote')}</p>`;
    if (s.kind === 'water') $('#rise').addEventListener('input', e => setRise(+e.target.value));
  } else if (s.kind === 'dc') {
    el.innerHTML = `<h2>${w('dcTitle')}</h2><div class="sub"><span class="tagsim">${w('sim')}</span></div>
      <div class="flow">
        <div class="st"><i>◉</i><span>${w('dc1')} · ${sim.J.length} + ${FX.gauges.length}</span></div><div class="ar">↓</div>
        <div class="st"><i>⬡</i><span>${w('dc2')}</span></div><div class="ar">↓</div>
        <div class="st"><i>{ }</i><span>${w('dc3')} · <span id="dc-bytes"></span></span></div><div class="ar">↓</div>
        <div class="st"><i>▦</i><span>${w('dc4')}</span></div><div class="ar">↓</div>
      </div>
      <div class="uses">${w('uses').map(u => `<span>${esc(u)}</span>`).join('')}</div>
      <p class="fine">${w('dcRuns', { ms: num(simMs), n: sim.J.length })}</p><p class="fine">${w('dcNote')}</p>
      <p><a class="lab" href="https://nanobotco.github.io/arun/phnom-penh/">${w('lab')}</a></p>`;
  } else if (s.kind === 'place') {
    const c = prepR ? cellAt(prepR, s.x, s.y) : -1;
    if (c < 0) { el.innerHTML = `<h2>${w('hereTitle')}</h2><p class="fine">${w('unavailable')}</p>`; return; }
    const occ = prepR.t.occ[c], har = prepR.har[c];
    el.innerHTML = `<h2>${w('hereTitle')} <span style="font-weight:400;color:var(--muted)">${esc(nearName(s.x, s.y))}</span></h2>
      <div class="sub"><span class="tagsim">${w('sim')}</span></div>
      <div class="list"><div><span>AQI</span><b id="p-aqi"></b></div><div><span>${w('rain')}</span><b id="p-rain"></b></div>
        <div><span>${w('water')}</span><b>${Number.isFinite(har) ? w('har', { m: har.toFixed(1) }) : '·'}</b></div></div>
      <p class="fine">${occ === 255 ? '' : occ > 0 ? w('satWater', { p: occ }) : w('satNone')}</p>
      <button class="btn" id="reach-b">${w('reach')}</button><p class="fine" id="reach-o"></p>`;
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
  } else if (s.kind === 'dc') {
    const bytes = new TextEncoder().encode(JSON.stringify({ t: '07:40', node: 'J-01', vehiclesPerMin: 64, peoplePerMin: 12, queueM: 120, rainMmH: 0, waterCm: 0, pm25: 72, quality: 'ok' })).length;
    $('#dc-bytes').textContent = w('bytes', { n: bytes });
  } else if (s.kind === 'place') {
    if (!prepR || cellAt(prepR, s.x, s.y) < 0 || !$('#p-aqi')) return;
    const pm = sim.air.at(s.x, s.y, m);
    $('#p-aqi').textContent = `${SIM.aqi(pm)} · ${pm.toFixed(0)} µg/m³`; $('#p-rain').textContent = `${SIM.rainAtM(s.x, s.y, m).toFixed(0)} mm/h`;
  }
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
  S.rise = r; $('#rise-o').textContent = `+${r} m`;
  if (r > 0) { flood(prepR, r, mask); world.setFlood(mask); const u = streetsUnder(prepR, mask, DATA.geo); $('#rise-s').textContent = w('streetsUnder', { km: u.km.toFixed(0) }); }
  else { world.setFlood(null); $('#rise-s').textContent = ''; }
}
let rd = null, reachAnim = null;
function runReach(x, y) {
  if (!city) return;
  if (!rd) rd = { dist: new Float64Array(city.nN), times: new Float32Array(city.nB) };
  const st = K.startAt(city, x, y);
  K.reach(city, st, 'tuk', null, 720, rd.dist); K.doorTimes(city, rd.dist, 0, rd.times);
  reachLayer.set(rd.dist, city.cost.tuk, null, null); reachLayer.pin(x, y); reachLayer.U.uBudget.value = 600;
  reachLayer.visible(true); reachAnim = reduced ? null : { t0: performance.now() }; if (reduced) reachLayer.U.uFront.value = 600;
  $('#reach-o').textContent = w('reachOut', { n: num(K.countWithin(rd.times, 600)) });
}

// ---------- coach ----------
const COACH = ['coachJ', 'coachD', 'coachT'];
function setCoach(n) {
  S.coach = n; const el = $('#coach');
  const show = n < COACH.length && (n !== 1 || (S.sel && S.sel.kind === 'j'));
  el.hidden = !show; if (show) $('#coach-t').textContent = w(COACH[n]);
}

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
  for (const id of LABELS) { const l = LMK[id]; if (!l) continue; const d = document.createElement('div'); d.className = 'lbl'; $('#labels').append(d); labelEls.push({ el: d, p: toLocal(l.lng, l.lat), id, w: 0 }); }
  labelText();
}
function labelText() { for (const L of labelEls) { if (L.id === 'dc') { L.el.textContent = w('dc4'); L.w = 0; continue; } const l = LMK[L.id]; L.el.textContent = (l[lang] || l.en).split(' · ')[0]; L.w = 0; } }
function placeLabels() {
  const taken = [], bottom = innerHeight - ($('#card').hidden ? 130 : $('#card').offsetHeight + 80);
  for (const L of labelEls) {
    const q = world.project(L.p.x, L.p.y, L.h || 30), wd = L.w || (L.w = L.el.offsetWidth || 80);
    if (L.id === 'dc') q.y += 34;
    let show = q.on && q.y > 130 && q.y < bottom;
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
  $('#layers').setAttribute('aria-label', w('layers'));
  setCoach(S.coach); labelText(); lastAlertKey = '';
  if (S.ready) { tbar.redraw(); if (S.sel) { if (scene) { scene.destroy(); scene = null; } buildCard(); } setTime(S.m); }
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
  const hit = junc.pick(world.project, cx - r.left, cy - r.top, 34);
  if (hit === 'dc') return openCard({ kind: 'dc' });
  if (hit >= 0) return openCard({ kind: 'j', i: hit });
  const g = world.pickGround(cx, cy); if (!g) return;
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
  tbar = createTimebar($('#timebar'), { onTime: (m, u) => { setPlaying(false); setTime(m, u); }, alerts: () => ALERTS, dayNames: () => w('days') });
  applyLang(Q.get('lang') || (navigator.language || 'en').slice(0, 2).replace(/^(?!km|th).*/, 'en'));
  setCoach(Q.has('nocoach') ? 9 : 0);
  const buildings = await gunzip(DATA.buildings);
  const terrain = decodeTerrain(DATA.terrain);
  const tier = Q.get('tier') || ((navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 'low' : 'mid');
  world = createWorld($('#world'), { geo: DATA.geo, terrain, buildings }, { tier, reducedMotion: reduced, preserve: Q.has('shot'), onTap });
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
  makeLabels(); tbar.resize();
  S.ready = true; $('#app').classList.add('ready');
  setTime(S.m, 'force');
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
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
  city = K.prepareCity(buildGraph(DATA.geo), prepR, K.buildingCentres(new Uint8Array(buildings)));
  reachLayer = createStreets(world, city); reachLayer.visible(false);
  window.__ready.full = Math.round(performance.now() - t0);
  if (Q.get('open')) openCard(Q.get('open') === 'j' ? { kind: 'j', i: +(Q.get('i') || 0) } : { kind: Q.get('open') });
}

$('#play').addEventListener('click', () => { if (S.m >= SIM.M1) setTime(SIM.M0); setPlaying(!S.playing); if (S.coach === 2) setCoach(9); });
$('#card-x').addEventListener('click', closeCard);
$('#coach-skip').addEventListener('click', () => setCoach(9));
$('#lang').addEventListener('click', e => menu(e.currentTarget, [['English', 'en'], ['ខ្មែរ', 'km'], ['ไทย', 'th']].map(([n, l]) => [n, l === lang, () => applyLang(l)])));
$('#layers').addEventListener('click', e => menu(e.currentTarget, [['lAir', 'air'], ['lTraffic', 'traffic'], ['lCams', 'cams']].map(([k, id]) => [w(k), S.layers[id], () => { S.layers[id] = !S.layers[id]; }]), true));
document.querySelectorAll('.cchip').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.k !== 'traffic') return openCard({ kind: b.dataset.k });
  const k = sim.idx(S.m); let best = 0; sim.J.forEach((j, i) => { if (j.queue[k] > sim.J[best].queue[k]) best = i; }); openCard({ kind: 'j', i: best });
}));
addEventListener('resize', () => { if (world) { world.resize(); tbar.resize(); } });
addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); if (S.sel) closeCard(); } });

window.__touch = { S, setTime: m => setTime(m, true), open: sel => openCard(sel), close: closeCard, play: p => setPlaying(p), alerts: () => ALERTS, active: () => activeAlerts(S.m), sim: () => sim, project: (x, y, h) => world.project(x, y, h) };
boot().catch(e => { console.error(e); window.__error = String(e && e.stack || e); });
