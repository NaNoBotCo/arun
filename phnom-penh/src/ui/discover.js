// Sheets opened from "What would you like to discover?": the challenge list, the evidence chain, and the
// challenge lenses. Every number is computed by the kernels from the current experiment.
import { h, txt, btn, nums, slider, tag } from './kit.js';
import { t, num, hhmm, dirName, getLang } from '../i18n.js';
import { timeChart, xyChart } from './chart.js';
import { PAL } from '../palette.js';
import { fitMotion, members, pointSummary, knownIndex, HEAVY } from '../kernels/nowcast.js';
import { CALIBRATION, heldOutCheck, sceneReading, Q, OBS_DEFAULTS } from '../kernels/observe.js';
import { evaluateChunked, PRACTICE } from '../kernels/evaluation.js';
import { BASELINE, hashState } from '../kernels/experiment.js';
import { makeRecord } from '../kernels/notebook.js';
import { createStore } from './store.js';
import { sunPosition, scenarioDate } from '../render/sun.js';
import { createFaceShieldScene } from '../lenses/faceshield/scene.js';
import { mount as mountMachine } from './machine.js';
import { mount as mountShores } from './twoshores.js';
import { OUTRUN_BUDGET } from './build.js';

const usd = v => 'US$' + num(v);
export const CHALLENGES = [
  { id: 'outrun', lens: null, line: () => t('ch_outrunL', { usd: usd(OUTRUN_BUDGET) }), measure: 'ch_outrunM' },
  { id: 'wrong', lens: 'wrong', measure: 'ch_wrongM' },
  { id: 'machine', lens: 'machine' },
  { id: 'invisible', lens: 'invisible' },
  { id: 'shores', lens: 'shores' },
  { id: 'ordinary', lens: 'ordinary' },
];

// ---------------- the list ----------------
function discover(body, d, C) {
  const el = h('div', 'lens disc'); body.appendChild(el);
  el.appendChild(h('h2', '', t('v_invite')));
  for (const ch of CHALLENGES) {
    const card = h('div', 'card'); el.appendChild(card);
    card.appendChild(h('h3', '', t('ch_' + ch.id)));
    card.appendChild(txt('p', '', ch.line ? ch.line() : t('ch_' + ch.id + 'L')));
    if (ch.measure) card.appendChild(h('p', 'note', t(ch.measure)));
    const b = btn(t(ch.lens ? 'ch_open' : 'ch_start'), false, 'go'); card.appendChild(b);
    b.onclick = () => ch.id === 'outrun' ? startOutrun(C) : C.openLens(ch.lens, ch.lens);
  }
  const card = h('div', 'card'); el.appendChild(card);
  card.appendChild(h('h3', '', t('v_sandbox'))); card.appendChild(h('p', '', t('v_sandboxL')));
  const row = h('div', 'row'); card.appendChild(row);
  const b = btn(t('close')); b.onclick = () => C.closeLens(); row.appendChild(b);
  const op = btn('▶ ' + t('cap5')); op.onclick = () => C.replayOpening(); row.appendChild(op);
}
discover.tabs = false;

function startOutrun(C) {
  // a city with every proposed network sensor switched off; the facility keeps its roof gauge
  const s = JSON.parse(JSON.stringify(C.state));
  s.off = C.DATA.sensors.map(x => x.id).sort(); s.added = [];
  C.loadState(s, [...C.H.log, { type: 'load' }]);
  C.S.challenge = 'outrun'; C.S.attempts = [];
  C.setView('build'); C.flash(t('or_setup'), 4000);
}

// ---------------- the evidence chain ----------------
const qName = q => t('v_q' + q);
function evidence(body, d, C) {
  const { S } = C, id = S.lens.id, R = C.R, m = Math.floor(S.t);
  const el = h('div', 'lens ev'); body.appendChild(el);
  const isFac = id === 'fac';
  const o = isFac ? R.obs.find(x => x.kind === 'roof') : R.obs.find(x => x.id === id);
  el.appendChild(h('h2', '', t('v_evTitle', { id: isFac ? t('kind_' + C.state.facility.kind) : id.toUpperCase() })));
  // 1 · the reading
  el.appendChild(h('h3', '', t('v_ev1')));
  if (!o) el.appendChild(h('p', 'note', t('v_noReading', { id: id.toUpperCase() })));
  else {
    const k = knownIndex(o, S.t);
    if (k < 0) el.appendChild(h('p', '', t('v_noReading', { id: id.toUpperCase() })));
    else {
      const v = o.rep[k], q = o.q ? o.q[k] : 0;
      if (v !== v) el.appendChild(h('p', '', t('v_lastMissing', { id: id.toUpperCase() })));
      else el.appendChild(h('p', '', t('v_ev1L', { value: num(v, v < 10 ? 1 : 0), fell: hhmm(k), got: hhmm(k + o.lat), age: num(m - (k + o.lat)), q: qName(q) }) + ' ' + tag('synthetic') + ' ' + tag('proposed')));
      const miss = o.q ? [...o.q.slice(0, k + 1)].filter(x => x === Q.missing).length : 0;
      el.appendChild(h('p', 'note', `${num(miss)} / ${num(k + 1)} ${t('v_q2')}`));
      const hc = heldOutCheck();
      el.appendChild(h('p', 'note', o.kind === 'camera' ? t('v_camPath', { n: num(CALIBRATION.renders), mae: num(hc.mae, 1), fe: num(C.state.obs.fieldError * 100) }) : t('v_gaugePath')));
      const known = Array.from(o.rep, (x, i) => (i <= k ? x : NaN));
      timeChart(el, { series: [{ data: known, color: PAL.gold, width: 2 }], tNow: S.t, yLabel: t('mmh'), h: 100 });
    }
  }
  // 2 · motion
  el.appendChild(h('h3', '', t('v_ev2')));
  const obs = R.obs.filter(x => x.kind !== 'roof'), fit = fitMotion(obs, S.t);
  if (!fit) el.appendChild(h('p', 'note', t('v_noFit')));
  else {
    el.appendChild(h('p', '', t('v_ev2L', { basis: t(fit.basis === 'peak' ? 'v_basisPeak' : 'v_basisOnset'), n: num(fit.n), speed: num(fit.speedKmh, 1), dir: dirName(fit.headingDeg) })));
    const pts = [...fit.points].sort((a, b) => Math.abs(b.resid) - Math.abs(a.resid)).slice(0, 8);
    const mx = Math.max(2, ...pts.map(p => Math.abs(p.resid)));
    const bars = h('div', 'bars'); el.appendChild(bars);
    for (const p of pts) bars.insertAdjacentHTML('beforeend', `<div class="bar${p.id === id ? ' me' : ''}"><span>${p.id.toUpperCase()}</span><span class="tr"><i style="width:${Math.abs(p.resid) / mx * 100}%;background:${p.resid >= 0 ? PAL.gold : PAL.cyan}"></i></span><span>${p.resid >= 0 ? '+' : '−'}${num(Math.abs(p.resid), 1)}</span></div>`);
  }
  // 3 · members at the facility
  el.appendChild(h('h3', '', t('v_ev3')));
  if (fit) {
    const ps = pointSummary(obs, m, members(fit, C.state.seed), C.state.facility.x, C.state.facility.y, 120, 2);
    timeChart(el, { band: { lo: ps.p10, hi: ps.p90, t0: m, step: 2, color: 'rgba(201,209,220,.28)' }, series: [{ data: ps.p50, t0: m, step: 2, color: PAL.gold }], hline: { v: HEAVY, color: PAL.rose, label: `${HEAVY} ${t('mmh')}` }, tNow: S.t, yLabel: t('mmh'), yMax: 100, h: 110 });
    el.appendChild(h('p', 'note', t('v_ev3L')));
  } else el.appendChild(h('p', 'note', t('v_noFit')));
  // 4 · threshold and notice
  el.appendChild(h('h3', '', t('v_ev4')));
  el.appendChild(h('p', '', t('v_ev4L', { p: num(C.state.warnP * 100) })));
  const low = Array.from(R.network.chance, (c, i) => (R.network.state[i] === 2 ? c * 100 : NaN));
  timeChart(el, { series: [{ data: Array.from(R.network.chance, v => v * 100), color: PAL.gold }, { data: low, color: PAL.silver, width: 4 }], hline: { v: C.state.warnP * 100, color: PAL.paper, label: `${num(C.state.warnP * 100)}%` }, marks: [{ t: R.network.tWarn, color: PAL.gold, label: `${t('warnAt')} ${hhmm(R.network.tWarn)}` }], tNow: S.t, yMax: 100, yLabel: '%' });
  // 5 · hydro
  el.appendChild(h('h3', '', t('v_ev5')));
  const hy = C.state.hydro;
  el.appendChild(h('p', '', t('v_ev5L', { catch: num(hy.catchHa), runoff: num(hy.runoff * 100), drain: num(hy.drainMmH), pond: num(hy.pondHa, 1), kerb: num(hy.kerbCm) }) + ' ' + tag('assumed')));
  // change one thing
  el.appendChild(h('h3', '', t('v_alter')));
  const eff = h('p'); el.appendChild(eff);
  const showEff = e => { if (e) eff.textContent = t('v_effect', { a: num(e.before), b: num(e.after) }); };
  if (S.lastEffect && S.lastEffect.type !== 'seed') showEff(S.lastEffect);
  const commit = a => { const e = C.act(a); S.keepScroll = true; C.renderSheet(); return e; };
  slider(el, t('v_threshold'), 10, 90, 5, Math.round(C.state.warnP * 100), v => `${v}`, (v, done) => { if (done) commit({ type: 'threshold', value: v / 100 }); });
  if (!isFac) {
    const off = C.state.off.includes(id), added = C.state.added.some(s => s.id === id);
    const b = btn(off ? t('v_restoreThis') : t('v_removeThis')); b.onclick = () => commit(off ? { type: 'restore', id } : { type: 'remove', id }); el.appendChild(b);
    if (added && off) b.hidden = true;
  }
}
evidence.tabs = false; evidence.live = true;

// ---------------- prove ARUN wrong ----------------
function wrong(body, d, C) {
  const { S } = C, R = C.R;
  const el = h('div', 'lens wrong'); body.appendChild(el);
  el.appendChild(h('h2', '', t('ch_wrong')));
  el.appendChild(h('p', '', t('ch_wrongL')));
  const commit = a => { C.act(a); S.keepScroll = true; C.renderSheet(); };
  const o = C.state.obs;
  slider(el, t('v_drop'), 0, 60, 2, Math.round(o.drop * 100), v => `${v}`, (v, done) => { if (done) commit({ type: 'obs', key: 'drop', value: v / 100 }); });
  slider(el, t('v_delay'), 0, 30, 1, o.delay, v => `${v}`, (v, done) => { if (done) commit({ type: 'obs', key: 'delay', value: v }); });
  slider(el, t('v_noise'), 0, 4, 0.25, o.noiseScale, v => `${num(v, 2)}`, (v, done) => { if (done) commit({ type: 'obs', key: 'noiseScale', value: v }); });
  slider(el, t('v_threshold'), 10, 90, 5, Math.round(C.state.warnP * 100), v => `${v}`, (v, done) => { if (done) commit({ type: 'threshold', value: v / 100 }); });
  el.appendChild(h('p', 'note', `${tag('assumed')} ${OBS_DEFAULTS.drop * 100}% · ${OBS_DEFAULTS.delay} · ${OBS_DEFAULTS.noiseScale}×`));
  // motion fit at the notice against the simulated storm (truth, shown deliberately here)
  const f = R.network.fit, s = C.storm;
  if (f) el.appendChild(h('p', '', t('wr_bias', { fs: num(f.speedKmh, 1), fd: dirName(f.headingDeg), ts: num(s.speedKmh, 1), td: dirName(s.headingDeg) }) + ' ' + tag('synthetic')));
  el.appendChild(h('p', '', `${t('v_thisStorm', { n: num(C.state.seed) })}: ${R.tWater < 0 ? t('v_noWaterShort') : R.network.prep == null ? t('v_cls_miss') : `${num(R.network.prep)} ${t('min')}`} · ${t('v_cls_' + R.network.outcome)}`));
  const ev = btn(t('v_evidence')); ev.onclick = () => C.openLens('evidence', 'fac'); el.appendChild(ev);
  // failures on the practice storms
  const go = btn(t('wr_find'), false, 'go'); el.appendChild(go);
  const out = h('div'); el.appendChild(out);
  const key = 'practice:' + hashState(C.state);
  let cancel = null;
  const paint = res => {
    out.innerHTML = '';
    const bad = res.rows.filter(r => r.netClass === 'late' || r.netClass === 'miss' || r.netClass === 'false' || (r.prepNet != null && r.prepAlone != null && r.prepNet < r.prepAlone));
    if (!bad.length) { out.appendChild(h('p', '', t('wr_none'))); return; }
    out.appendChild(h('p', '', t('wr_found', { n: num(bad.length) })));
    const row = h('div', 'row'); out.appendChild(row);
    for (const r of bad.slice(0, 12)) { const b = btn(`${t('wr_openStorm', { n: num(r.seed) })} · ${t('v_cls_' + r.netClass)}`); b.onclick = () => { C.setSeed(r.seed); S.keepScroll = true; C.renderSheet(); }; row.appendChild(b); }
  };
  go.onclick = () => {
    const hit = S.evalCache.get(key); if (hit) { paint(hit); return; }
    go.disabled = true;
    cancel = evaluateChunked(C.cfgOf(C.state), PRACTICE, (i, n) => { out.textContent = t('v_scoring', { i: num(i), n: num(n) }); }, res => { S.evalCache.set(key, res); go.disabled = false; paint(res); });
  };
  if (S.evalCache.get(key)) paint(S.evalCache.get(key));
  // save the current storm as a failure record
  if (R.network.outcome !== 'hit' || (R.network.prep != null && R.alone.prep != null && R.network.prep < R.alone.prep)) {
    const sv = btn(t('wr_save')); el.appendChild(sv);
    sv.onclick = async () => {
      try {
        const store = await createStore(), mtr = C.exp.metrics();
        const rec = makeRecord({ state: C.state, log: C.H.log, outcome: mtr.outcome, uncertainty: mtr.uncertainty }, { title: t('wr_failTitle', { n: num(C.state.seed), cls: t('v_cls_' + R.network.outcome) }).slice(0, 80), notes: '', locale: getLang(), buildVersion: `${C.BUILD.version} ${C.BUILD.edition}`, inputs: C.exp.inputs() });
        await store.put(rec); sv.disabled = true; C.flash(t('wr_saved'));
      } catch (e) { C.flash(String(e.message || e)); }
    };
  }
  return () => { if (cancel) cancel(); };
}
wrong.tabs = false;

// ---------------- invisible city ----------------
function invisible(body, d, C) {
  const { S } = C, R = C.R;
  const el = h('div', 'lens inv'); body.appendChild(el);
  el.appendChild(h('h2', '', t('ch_invisible')));
  el.appendChild(h('p', '', t('ch_invisibleL')));
  const cfg = S.inv || (S.inv = { rain: 30, night: false });
  const wrap = h('div', 'fs'); const cv = h('canvas'); wrap.appendChild(cv); el.appendChild(wrap);
  let scene = null;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round((r.width || 340) * dpr); cv.height = Math.round((r.height || 212) * dpr);
  scene = createFaceShieldScene(cv, { seed: 7, lang: getLang() });
  scene.set({ rain: cfg.rain, ponding: 0.3, night: cfg.night, shield: 1, dissolve: 0, setting: 'default' }); scene.start();
  const out = h('div'); el.appendChild(out);
  slider(el, t('iv_rain'), 0, 100, 1, cfg.rain, v => `${v}`, (v, done) => { cfg.rain = v; scene.set({ rain: v }); if (done) out.innerHTML = ''; });
  const row = h('div', 'row'); el.appendChild(row);
  const nb = btn(t('night'), cfg.night); nb.onclick = () => { cfg.night = !cfg.night; nb.classList.toggle('on', cfg.night); scene.set({ night: cfg.night }); out.innerHTML = ''; }; row.appendChild(nb);
  const mb = btn(t('iv_measure'), false, 'go'); row.appendChild(mb);
  mb.onclick = async () => {
    const m = await scene.measure(), tb = sceneReading(cfg.rain, cfg.night).mean;
    out.innerHTML = `<p>${t('iv_result', { m: num(m.rain.value, 1), tb: num(tb, 1), r: num(cfg.rain) })} ${tag('measured')}</p><p class="note">${t('iv_bytes', { s: num(m.sentBytes), p: num(m.pictureBytes / 1024) })}</p>`;
  };
  // the nearest gauge at the same minute, and lost camera reports in this storm
  const mm = Math.floor(S.t), cams = R.obs.filter(o => o.kind === 'camera'), gauges = R.obs.filter(o => o.kind === 'gauge');
  if (cams.length && gauges.length) {
    const c0 = cams[0]; let g0 = gauges[0], bd = Infinity;
    for (const g of gauges) { const dd = Math.hypot(g.x - c0.x, g.y - c0.y); if (dd < bd) { bd = dd; g0 = g; } }
    const k = knownIndex(g0, S.t);
    if (k >= 0) el.appendChild(h('p', 'note', t('iv_vsGauge', { id: g0.id.toUpperCase(), g: num(g0.rep[k], 1) })));
    const lost = cams.reduce((a, o) => a + [...o.q].filter(q => q === Q.missing).length, 0), all = cams.length * 181;
    el.appendChild(h('p', 'note', t('iv_lost', { p: num(C.state.obs.drop * 100), n: num(lost), m: num(all) })));
  }
  void mm;
  el.appendChild(h('p', 'note', t('iv_table') + ' ' + tag('synthetic')));
  const tb = CALIBRATION.table;
  el.insertAdjacentHTML('beforeend', `<table class="t"><tr><td>${t('mmh')}</td><td>☀</td><td>☾</td></tr>${tb.day.filter((_, i) => i % 2 === 0 || i === tb.day.length - 1).map((row, i) => { const n = tb.night.find(x => x[0] === row[0]); return `<tr><td>${num(row[0])}</td><td>${num(row[1], 1)} ± ${num(row[2], 1)}</td><td>${num(n[1], 1)} ± ${num(n[2], 1)}</td></tr>`; }).join('')}</table>`);
  const hc = heldOutCheck();
  el.appendChild(h('p', 'note', t('v_camPath', { n: num(CALIBRATION.renders), mae: num(hc.mae, 1), fe: num(C.state.obs.fieldError * 100) })));
  return () => { scene && scene.destroy(); };
}
invisible.tabs = false;

// ---------------- beautiful ordinary ----------------
function ordinary(body, d, C) {
  const { S } = C;
  const el = h('div', 'lens ord'); body.appendChild(el);
  el.appendChild(h('h2', '', t('ch_ordinary')));
  el.appendChild(h('p', '', t('ch_ordinaryL')));
  const H0 = S.ordH || (S.ordH = 24);
  const sp = sunPosition(scenarioDate(S.t));
  const az = sp.azimuth, shadowDir = dirName(90 - ((az + 180) % 360));
  if (sp.elevation > 0) {
    const len = H0 / Math.tan(sp.elevation * Math.PI / 180);
    el.appendChild(h('p', '', t('so_sun', { time: hhmm(S.t), el: num(sp.elevation, 1), dir: dirName(90 - az) })));
    el.insertAdjacentHTML('beforeend', nums([[`${num(len, len < 100 ? 1 : 0)} m`, t('so_shadow', { dir: shadowDir }), 'gold'], [`${num(H0)} m`, t('so_height'), 'silver']]));
  } else el.appendChild(h('p', '', t('so_below', { time: hhmm(S.t) })));
  slider(el, t('so_height'), 3, 120, 1, H0, v => `${v}`, (v, done) => { S.ordH = v; if (done) { S.keepScroll = true; C.renderSheet(); } });
  const len = Array.from({ length: 181 }, (_, k) => { const e = sunPosition(scenarioDate(k)).elevation; return e > 2 ? Math.min(400, H0 / Math.tan(e * Math.PI / 180)) : NaN; });
  timeChart(el, { series: [{ data: len, color: PAL.gold }], tNow: S.t, yLabel: t('so_chart'), h: 110 });
  el.appendChild(h('p', 'note', t('so_math')));
  el.appendChild(h('p', 'note', t('so_heightNote') + ' ' + tag('estimated')));
  el.appendChild(h('p', 'note', t('so_scrub')));
}
ordinary.tabs = false; ordinary.live = true;

function machine(body, d, C) { return mountMachine(body, C); }
machine.tabs = false;
function shores(body, d, C) { return mountShores(body, C); }
shores.tabs = false;

export const EXTRA_LENSES = { discover, evidence, wrong, invisible, ordinary, machine, shores };
export { BASELINE };
