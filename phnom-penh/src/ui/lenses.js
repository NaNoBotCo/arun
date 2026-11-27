// The sheet's lenses. Each touchable thing opens at depth 1 (see), 2 (how), 3 (try).
// Depth 3 changes an input and reruns the kernels; the map and the numbers change together.
import { t, num, hhmm, dirName, getLang } from '../i18n.js';
import { PAL } from '../palette.js';
import { timeChart, xyChart } from './chart.js';
import { rainAt, series, sampleGrid } from '../kernels/storm.js';
import { fitMotion, members, pointSummary, analysisNow, fieldForecast, score, HEAVY } from '../kernels/nowcast.js';
import { ACTIONS } from '../kernels/hydro.js';
import { prepare, flood, score as srScore, sweep, streetsUnder, harAt } from '../kernels/skyreach.js';
import { buildGraph, shortest, dryCost, wetCost } from '../kernels/route.js';
import { benchmark, demand, faceShieldLaptops, PRESETS } from '../kernels/compute.js';
import { createFaceShieldScene } from '../lenses/faceshield/scene.js';
import { PRIVATE } from '#edition';
import { tag } from './kit.js';
import { mount as mountMachine } from './machine.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const nums = items => `<div class="nums">${items.map(([v, l, c]) => `<div class="num ${c || ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
const btn = (label, on, cls = '') => { const b = h('button', 'btn ' + cls + (on ? ' on' : ''), label); return b; };
const slider = (wrap, label, min, max, step, value, fmt, oninput) => {
  const l = h('label', 'sl', `${label} <output>${fmt(value)}</output>`);
  const i = h('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value; i.setAttribute('aria-label', label);
  i.addEventListener('input', () => { l.querySelector('output').textContent = fmt(+i.value); oninput(+i.value, false); });
  i.addEventListener('change', () => oninput(+i.value, true));
  wrap.append(l, i); return i;
};
const kindName = S => t('kind_' + S.facility.kind);
const prepOf = (R, net) => (net ? R.network.prep : R.alone.prep);

// ---------------- facility ----------------
function facility(body, d, C) {
  const { S } = C, R = C.R, kind = kindName(S);
  const el = h('div', 'lens'); body.appendChild(el);
  el.appendChild(h('h2', '', `${t('facTitle', { kind })} <span class="pill jade">${t('d' + d)}</span>`));
  if (d === 1) {
    if (R.tWater < 0) { el.appendChild(h('p', '', t('noWater'))); }
    else {
      el.insertAdjacentHTML('beforeend', nums([[`${num(R.network.prep)} ${t('min')}`, t('toPrepare') + ' · ' + t('network'), 'jade'], [`${num(R.alone.prep)} ${t('min')}`, t('alone'), 'silver'], [hhmm(R.tWater), t('waterAt'), 'cyan']]));
      el.appendChild(h('p', '', t('facD1', { gain: num(R.gain) })));
    }
    timeChart(el, {
      series: [{ data: R.rainAtDoor, fill: 'rgba(95,212,230,.22)' }, { data: Array.from(R.depth, v => v * 3), color: PAL.cyan }],
      marks: [{ t: R.network.tWarn, color: PAL.gold, label: `${t('warnAt')} · ${t('network')} ${hhmm(R.network.tWarn)}` }, { t: R.alone.tWarn, color: PAL.silver, label: `${t('warnAt')} · ${t('alone')} ${hhmm(R.alone.tWarn)}` }, { t: R.tWater, color: PAL.cyan, label: t('waterAt') }],
      tNow: S.t, yMax: 100, yLabel: `${t('mmh')} · cm×3`, h: 150,
    });
    return;
  }
  if (d === 2) {
    el.appendChild(h('p', '', t('facD2a')));
    timeChart(el, { series: [{ data: Array.from(R.alone.chance, v => v * 100), color: PAL.silver, width: 1.5 }, { data: Array.from(R.network.chance, v => v * 100), color: PAL.gold }], hline: { v: 50, color: PAL.paper, label: '50%' }, marks: [{ t: R.network.tWarn, color: PAL.gold }, { t: R.tWater, color: PAL.cyan }], tNow: S.t, yMax: 100, yLabel: '%' });
    const f = R.network.fit;
    if (f) el.appendChild(h('p', '', `${hhmm(R.network.tWarn)} · ` + t(f.basis === 'peak' ? 'motionPeak' : 'motionFit', { n: f.n, speed: num(f.speedKmh, 1), dir: dirName(f.headingDeg) })));
    const fNow = fitMotion(R.obs.filter(o => o.kind !== 'roof'), Math.round(S.t));
    if (fNow && fNow.basis === 'peak' && (!f || f.basis !== 'peak')) el.appendChild(h('p', '', `${hhmm(S.t)} · ` + t('motionPeak', { n: fNow.n, speed: num(fNow.speedKmh, 1), dir: dirName(fNow.headingDeg) })));
    el.appendChild(h('p', 'note', t('truthWas', { speed: num(C.storm.speedKmh, 1), dir: dirName(C.storm.headingDeg) })));
    if (f && f.basis === 'onset' && f.speedKmh > C.storm.speedKmh * 1.2) el.appendChild(h('p', 'note', t('fastWhy')));
    el.appendChild(h('p', '', t('facD2b', { catch: S.hydro.catchHa, drain: S.hydro.drainMmH, kerb: S.hydro.kerbCm })));
    timeChart(el, { series: [{ data: R.depth, color: PAL.cyan }], hline: { v: S.hydro.kerbCm, color: PAL.rose, label: `${S.hydro.kerbCm} cm` }, marks: [{ t: R.tWater, color: PAL.cyan }], tNow: S.t, yMax: Math.max(30, R.peakCm * 1.1), yLabel: 'cm', h: 100 });
    el.appendChild(h('p', 'note', t('assume')));
    const ev = btn(t('v_evidence'), false, 'go'); ev.onclick = () => C.openLens('evidence', 'fac'); el.appendChild(ev);
    return;
  }
  // depth 3: try
  const kinds = h('div', 'row'); el.appendChild(h('p', 'note', t('kindQ'))); el.appendChild(kinds);
  for (const k of ['hotel', 'hospital', 'datahall']) { const b = btn(t('kind_' + k), S.facility.kind === k); b.onclick = () => { C.act({ type: 'kind', kind: k }); C.renderSheet(); }; kinds.appendChild(b); }
  const acts = h('div'); el.appendChild(acts);
  acts.insertAdjacentHTML('beforeend', `<div class="act"><span class="note">${t('inTime')}</span><span class="note c">${t('network')}<br>${num(R.network.prep)} ${t('min')}</span><span class="note c">${t('alone')}<br>${num(R.alone.prep)} ${t('min')}</span></div>`);
  for (const a of ACTIONS[S.facility.kind]) {
    const yes = R.network.prep != null && a.min <= R.network.prep, yes2 = R.alone.prep != null && a.min <= R.alone.prep;
    acts.insertAdjacentHTML('beforeend', `<div class="act"><span>${t('a_' + a.id)} · ${a.min} ${t('min')}</span><b class="fit c ${yes ? 'y' : 'n'}">${yes ? '✓' : '–'}</b><b class="fit c ${yes2 ? 'y' : 'n'}">${yes2 ? '✓' : '–'}</b></div>`);
  }
  el.appendChild(h('p', 'note', t('assume')));
  slider(el, t('pumps') + ' (m³/min)', 0, 200, 10, S.extra.pumpM3min, v => `${v}`, (v, done) => { if (done) { C.act({ type: 'pump', value: v }); S.keepScroll = true; C.renderSheet(); } });
  slider(el, t('drains') + ` (${t('mmh')})`, 10, 45, 1, S.hydro.drainMmH, v => `${v}`, (v, done) => { if (done) { C.act({ type: 'hydro', key: 'drainMmH', value: v }); S.keepScroll = true; C.renderSheet(); } });
  el.appendChild(h('p', 'note', t('ring') + ' — ' + t('ringNote')));
  const rings = h('div', 'row'); el.appendChild(rings);
  for (const [k, l] of [['city', 'ringCity'], ['sub', 'ringSub'], ['region', 'ringRegion']]) { const b = btn(t(l), S.ring === k); b.onclick = () => { C.act({ type: 'ring', ring: k }); S.keepScroll = true; C.renderSheet(); }; rings.appendChild(b); }
  const row = h('div', 'row'); el.appendChild(row);
  const mv = btn(t('moveFac')); mv.onclick = () => C.startMove('fac'); row.appendChild(mv);
  const an = btn(t('anotherStorm'), false, 'go'); an.onclick = () => { C.nextPractice(); C.renderSheet(); }; row.appendChild(an);
  // 24 storms, computed a few at a time
  el.appendChild(h('p', '', t('storms24')));
  const box = h('div'); el.appendChild(box);
  const pts = [], key = JSON.stringify([C.state.facility, C.state.ring, C.state.off, C.state.added, C.state.hydro, C.state.extra, C.state.warnP, C.state.obs]);
  let alive = true, seed = 1;
  const cache = (C.S._storms && C.S._storms.key === key) ? C.S._storms : (C.S._storms = { key, rows: [] });
  const draw = () => {
    box.innerHTML = '';
    const rows = cache.rows.filter(r => r.net != null);
    const gains = rows.map(r => r.net - r.alone).sort((a, b) => a - b);
    xyChart(box, { points: rows.flatMap((r, i) => [{ x: i + 1, y: r.alone, color: PAL.silver, r: 3 }, { x: i + 1, y: r.net, color: PAL.gold, r: 3.5 }]), xMax: 25, yMax: 60, yLabel: `${t('min')} · ${t('network')} / ${t('alone')}`, xLabel: '1 … 24', mark: { x: S.seed <= 24 ? S.seed : 25, color: PAL.paper } });
    if (gains.length) box.appendChild(h('p', 'note', t('median', { n: num(gains[gains.length >> 1]) }) + ` · ${rows.length}/24`));
  };
  const step = () => {
    if (!alive) return;
    if (cache.rows.length >= 24) { draw(); return; }
    seed = cache.rows.length + 1;
    const r = C.scenarioFor({ seed, storm: undefined });
    cache.rows.push({ seed, net: r.network.prep, alone: r.alone.prep });
    if (cache.rows.length % 4 === 0 || cache.rows.length === 24) draw();
    setTimeout(step, 0);
  };
  draw(); step();
  const q = h('button', 'more', t('firstStreet')); q.onclick = () => mv.onclick(); el.appendChild(q);
  return () => { alive = false; };
}
facility.live = false;

// ---------------- street camera / Face Shield ----------------
function camera(body, d, C) {
  const { S } = C, id = S.lens.id, s = C.DATA.sensors.find(x => x.id === id);
  const el = h('div', 'lens'); body.appendChild(el);
  el.appendChild(h('h2', '', `${t('camTitle', { id: id.toUpperCase() })} <span class="pill violet">${t('d' + d)}</span>`));
  const truth = rainAt(C.storm, s.x, s.y, S.t);
  const wetSeries = series(C.storm, s.x, s.y, Math.max(0, Math.round(S.t) - 40), Math.round(S.t));
  let wet = 0; wetSeries.forEach((v, i) => { wet += v * Math.exp(-(wetSeries.length - 1 - i) / 14); });
  const ponding = Math.min(1, wet / 420);
  const night = S.t > 162;
  const wrap = h('div', 'fs'); const cv = h('canvas'); wrap.appendChild(cv);
  const sent = h('div', 'sent'); wrap.appendChild(sent);
  let scene = null, alive = true;
  const mount = () => {
    el.appendChild(wrap);
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    scene = createFaceShieldScene(cv, { seed: S.seed * 13 + id.charCodeAt(1), lang: getLang() });
    scene.set({ rain: truth, ponding, night, shield: 0, dissolve: 0, setting: S.fsSetting || 'default' });
    scene.start();
  };
  if (d === 1) {
    el.appendChild(h('p', '', t('camD1', { rate: num(truth), time: hhmm(S.t) })));
    if (truth < 5) {
      const ser = series(C.storm, s.x, s.y); let pk = 0; for (let k = 1; k < ser.length; k++) if (ser[k] > ser[pk]) pk = k;
      if (ser[pk] >= 10) { const go = btn(t('goRain', { time: hhmm(pk) }), false, 'go'); go.onclick = () => { C.setT(pk, true); C.renderSheet(); }; el.appendChild(go); }
    }
    mount();
    const out = h('div'); el.appendChild(out);
    const play = async () => {
      sent.textContent = ''; out.innerHTML = '';
      scene.set({ shield: 0, dissolve: 0 });
      try { scene.calibration && scene.calibration(); } catch (e) { /* calibrates lazily */ }
      const tween = (k, ms) => new Promise(res => { const t0 = performance.now(); const f = () => { if (!alive) return res(); const u = Math.min(1, (performance.now() - t0) / ms); scene.set({ [k]: u }); u < 1 ? requestAnimationFrame(f) : res(); }; f(); });
      await new Promise(r => setTimeout(r, 900)); if (!alive) return;
      await tween('shield', 1600); if (!alive) return;
      await new Promise(r => setTimeout(r, 700)); if (!alive) return;
      scene.set({ dissolve: 0 }); const m = await scene.measure(); if (!alive) return;
      await tween('dissolve', 1500); if (!alive) return;
      out.innerHTML = nums([[`${num(m.rain.value)} ${t('mmh')}`, t('mRain'), 'cyan'], [`${num(m.water.value)}%`, t('mWater'), 'cyan'], [m.visibility.value >= 1000 ? `${num(m.visibility.value / 1000, 1)} km` : `${num(m.visibility.value)} m`, t('mVis'), 'silver']])
        + `<p>${t('sentVs', { sent: m.sentBytes, pic: num(m.pictureBytes / 1024) })}</p><p class="note">${t('measuredFrom', { truth: num(truth) })}</p>`;
      const again = btn(t('replay')); again.onclick = play; out.appendChild(again);
      C.world.pulse(id, 'compute', PAL.gold, 1.2);
    };
    play();
    el.appendChild(h('p', 'note', t('drawn')));
    return () => { alive = false; scene && scene.destroy(); };
  }
  if (d === 2) {
    const rows = t('keepRows').split(';').map(r => r.split('|'));
    el.appendChild(h('p', '', `<b>${t('camD2')}</b>`));
    el.insertAdjacentHTML('beforeend', `<table class="t">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`);
    if (PRIVATE) {
      const F = PRIVATE.faceShield;
      el.appendChild(h('p', '', t('pv_marcusFS') + ` <span class="ptag assumed">${t('pv_label')}</span>`));
      el.insertAdjacentHTML('beforeend', nums([[num(F.recall * 100, 1) + '%', t('recall'), 'violet'], [num(F.covered * 100, 1) + '%', t('covered'), 'violet'], [`${F.released[0]} / ${F.released[1]}`, t('released'), 'silver']]));
      el.appendChild(h('p', 'note', t('missBy')));
      const bars = h('div', 'bars'); el.appendChild(bars);
      for (const [k, c] of [['c_clear', 'clear'], ['c_hidden', 'partly-hidden'], ['c_edge', 'edge'], ['c_screen', 'screen'], ['c_small', 'small']]) { const v = Math.round(F.misses[c] * 100); bars.insertAdjacentHTML('beforeend', `<div class="bar"><span>${t(k)}</span><span class="tr"><i style="width:${v / 30 * 100}%"></i></span><span>${v}%</span></div>`); }
      el.appendChild(h('p', '', t('numbersOnly')));
      el.appendChild(h('p', 'note', t('pv_nextTests')));
    } else {
      el.appendChild(h('p', '', t('v_fsIllus') + ' ' + tag('assumed')));
      el.appendChild(h('p', '', t('numbersOnly')));
    }
    const ev = btn(t('v_evidence'), false, 'go'); ev.onclick = () => C.openLens('evidence', id); el.appendChild(ev);
    return;
  }
  // depth 3
  mount();
  scene.set({ shield: 1, dissolve: 0 });
  const info = h('p', 'note'); el.appendChild(info);
  const showFaces = () => { const f = scene.faces(); const miss = f.filter(x => x.missed).length; info.textContent = `${f.length - miss} / ${f.length} · ${t('covered')}`; };
  if (PRIVATE) {
    el.appendChild(h('p', 'note', t('setting')));
    const row = h('div', 'row'); el.appendChild(row);
    for (const [k, l] of [['default', 'pv_sDefault'], ['strict', 'pv_sStrict']]) { const b = btn(t(l), (S.fsSetting || 'default') === k); b.onclick = () => { S.fsSetting = k; scene.set({ setting: k }); row.querySelectorAll('.btn').forEach(x => x.classList.toggle('on', x === b)); showFaces(); }; row.appendChild(b); }
  }
  const nb = btn(t('night'), night); nb.onclick = () => { const v = !nb.classList.contains('on'); nb.classList.toggle('on', v); scene.set({ night: v }); }; el.appendChild(nb);
  showFaces();
  const offRow = h('div', 'row'); el.appendChild(offRow);
  const off = S.off.has(id), ob = btn(off ? t('camOn') : t('camOff'));
  ob.onclick = () => { C.act(off ? { type: 'restore', id } : { type: 'remove', id }); C.renderSheet(); };
  offRow.appendChild(ob);
  if (S.lastEffect) el.appendChild(h('p', '', t('effect', { a: num(S.lastEffect.before), b: num(S.lastEffect.after) })));
  return () => { alive = false; scene && scene.destroy(); };
}

// ---------------- rain gauge ----------------
function gauge(body, d, C) {
  const { S } = C, id = S.lens.id, s = C.DATA.sensors.find(x => x.id === id) || S.added.find(x => x.id === id);
  const o = C.R.obs.find(x => x.id === id);
  const el = h('div', 'lens'); body.appendChild(el);
  el.appendChild(h('h2', '', `${t('gaugeTitle', { id: id.toUpperCase() })} <span class="pill cyan">${t('d' + d)}</span>`));
  const m = Math.round(S.t), rep = o ? o.rep : new Float32Array(181);
  const now = rep[m - 1]; let onset = -1; for (let k = 0; k <= m - 1; k++) if (rep[k] >= 8) { onset = k; break; }
  if (d === 1) {
    el.appendChild(h('p', '', onset >= 0 ? t('gaugeD1', { rate: num(now || 0), time: hhmm(S.t), onset: hhmm(onset) }) : t('gaugeDry', { rate: num(now || 0), time: hhmm(S.t) })));
    const known = Array.from(rep, (v, k) => (k <= m - 1 ? v : NaN));
    timeChart(el, { series: [{ data: series(C.storm, s.x, s.y), color: 'rgba(95,212,230,.35)', width: 1 }, { data: known, color: PAL.gold, width: 2 }], tNow: S.t, yLabel: t('mmh'), h: 130 });
    el.appendChild(h('p', 'note', t('reports')));
    return;
  }
  if (d === 2) {
    el.appendChild(h('p', '', t('gaugeD2')));
    const f = fitMotion(C.R.obs.filter(x => x.kind !== 'roof'), m);
    if (f) el.appendChild(h('p', '', t('motionFit', { n: f.n, speed: num(f.speedKmh, 1), dir: dirName(f.headingDeg) })));
    else el.appendChild(h('p', 'note', t('waiting')));
    const ev = btn(t('v_evidence'), false, 'go'); ev.onclick = () => C.openLens('evidence', id); el.appendChild(ev);
    return;
  }
  const row = h('div', 'row'); el.appendChild(row);
  const off = S.off.has(id), ob = btn(off ? t('camOn') : t('gaugeOff'));
  ob.onclick = () => { C.act(off ? { type: 'restore', id } : { type: 'remove', id }); C.renderSheet(); };
  row.appendChild(ob);
  const add = btn(t('addGauge'), false, 'go'); add.onclick = () => addMode(C); row.appendChild(add);
  if (S.lastEffect) el.appendChild(h('p', '', t('effect', { a: num(S.lastEffect.before), b: num(S.lastEffect.after) })));
}
function addMode(C) { C.setView('build'); C.setTool('gauge'); }

// ---------------- any spot on the map ----------------
let SR = null; const srPrep = C => (SR || (SR = prepare(C.terrain)));
function place(body, d, C) {
  const { S } = C, p = S.lens.id, m = Math.round(S.t);
  const el = h('div', 'lens'); body.appendChild(el);
  el.appendChild(h('h2', '', `${t('placeTitle')} <span class="pill">${t('d' + d)}</span>`));
  const obs = C.R.obs.filter(x => x.kind !== 'roof');
  const fit = S.net ? fitMotion(obs, m) : null;
  if (d === 1) {
    const now = rainAt(C.storm, p.x, p.y, S.t);
    let arr = null, sum = null;
    if (fit) { sum = pointSummary(obs, m, members(fit, S.seed), p.x, p.y, 120, 2); for (let k = 0; k < sum.p50.length; k++) if (sum.p50[k] >= HEAVY) { arr = m + k * 2; break; } }
    const har = harAt(srPrep(C), p.x, p.y);
    if (!S.truth) el.insertAdjacentHTML('beforeend', nums([[arr != null ? hhmm(arr) : (fit ? t('placeNo') : '–'), t('placeArr'), 'gold'], [har != null && isFinite(har) ? `${num(har, 1)} m` : '–', t('placeHAR'), 'silver']]));
    else el.insertAdjacentHTML('beforeend', nums([[`${num(now)} ${t('mmh')}`, t('placeNow') + ' · ' + t('tag_synthetic'), 'cyan'], [arr != null ? hhmm(arr) : (fit ? t('placeNo') : '–'), t('placeArr'), 'gold'], [har != null && isFinite(har) ? `${num(har, 1)} m` : '–', t('placeHAR'), 'silver']]));
    if (sum) {
      timeChart(el, { band: { lo: sum.p10, hi: sum.p90, t0: m, step: 2, color: 'rgba(201,209,220,.25)' }, series: [{ data: sum.p50, t0: m, step: 2, color: PAL.gold }], tNow: S.t, yLabel: t('mmh'), yMax: 100, h: 120 });
      el.appendChild(h('p', 'note', t('forecastBand', { time: hhmm(m) })));
    } else el.appendChild(h('p', 'note', t('waiting')));
    return;
  }
  if (d === 2) {
    el.appendChild(h('p', '', t('placeD2')));
    if (fit) el.appendChild(h('p', '', t('motionFit', { n: fit.n, speed: num(fit.speedKmh, 1), dir: dirName(fit.headingDeg) })));
    else el.appendChild(h('p', 'note', t('waiting')));
    return;
  }
  // depth 3: forecast skill on a separate truth grid, and a gauge here
  const G = { x0: -12000, x1: 8000, y0: -8000, y1: 8000, nx: 40, ny: 32 };
  const truth = sampleGrid(C.storm, m + 30, G);
  const sc = fit ? score(fieldForecast(obs, m, fit, 30, G), truth) : null;
  const pe = score(analysisNow(obs, m, G), truth);
  el.appendChild(h('p', '', t('skill')));
  el.insertAdjacentHTML('beforeend', nums([[sc ? num(sc.csi, 2) : '–', t('csi') + ' · ' + t('network'), 'gold'], [num(pe.csi, 2), t('csi') + ' · ' + t('persist'), 'silver'], [sc ? `${num(sc.rmse, 1)}` : '–', `${t('rmse')} (${t('mmh')})`, 'gold'], [num(pe.rmse, 1), `${t('rmse')} · ${t('persist')}`, 'silver']]));
  const row = h('div', 'row'); el.appendChild(row);
  const add = btn(t('addHere'), false, 'go');
  add.onclick = () => { C.act({ type: 'add', kind: 'gauge', x: p.x, y: p.y }); C.renderSheet(); };
  row.appendChild(add);
  const an = btn(t('anotherStorm')); an.onclick = () => { C.nextPractice(); C.renderSheet(); }; row.appendChild(an);
  if (S.lastEffect) el.appendChild(h('p', '', t('effect', { a: num(S.lastEffect.before), b: num(S.lastEffect.after) })));
}
place.live = true;

// ---------------- the river / Sky Reach ----------------
function river(body, d, C) {
  const { S } = C, prep = srPrep(C);
  const el = h('div', 'lens'); body.appendChild(el);
  el.appendChild(h('h2', '', `${t('riverTitle')} <span class="pill cyan">${t('d' + d)}</span>`));
  if (!S._sweep) S._sweep = { once: sweep(prep, 'once', Array.from({ length: 57 }, (_, i) => i * 0.25)), p10: sweep(prep, 'p10', Array.from({ length: 57 }, (_, i) => i * 0.25)) };
  const target = S.srTarget || 'once', sw = S._sweep[target];
  if (S.rise == null) S.rise = sw.best.rise;
  const mask = new Uint8Array(prep.N);
  const stats = h('div');
  const apply = (rise) => {
    flood(prep, rise, mask); C.world.setFlood(mask);
    const sc = srScore(prep, mask, target), km = streetsUnder(prep, mask, C.DATA.geo).km;
    stats.innerHTML = nums([[`+${num(rise, 2)} m`, t('rise'), 'cyan'], [`${num(sc.km2.model, 1)} km²`, t('floodedKm'), 'cyan'], [`${num(km, 0)} km`, t('streetsKm'), 'silver'], [num(sc.score, 2), t('scoreL'), 'gold']]) + `<p class="note">${t('baseL')} ${num(sc.baseline, 2)}</p>`;
  };
  if (d === 1) {
    el.appendChild(h('p', '', t('riverD1')));
    el.appendChild(stats);
    slider(el, t('rise'), 0, 14, 0.25, S.rise, v => `+${num(v, 2)} m`, v => { S.rise = v; apply(v); });
    apply(S.rise);
    C.world.flyTo({ x: 0, y: 0, dist: 15000, az: 0.35, el: 0.85 }, 1400);
    return () => {};
  }
  if (d === 2) {
    apply(S.rise);
    if (PRIVATE) { el.appendChild(h('p', '', t('pv_riverD2') + ` <span class="ptag assumed">${t('pv_label')}</span>`)); el.appendChild(h('p', '', t('pv_kt'))); }
    else el.appendChild(h('p', '', t('riverD2')));
    el.appendChild(h('p', '', t('pp', { score: num(sw.best.score, 2), rise: num(sw.best.rise, 2), base: num(sw.baseline, 2) })));
    el.appendChild(h('p', 'note', t('ppWhy')));
    el.appendChild(h('p', 'note', t('tonle')));
    el.appendChild(h('p', 'note', C.DATA.terrain.credits.dem + ' · ' + C.DATA.terrain.credits.gsw));
    return;
  }
  const row = h('div', 'row'); el.appendChild(row);
  for (const [k, l] of [['once', 'seenOnce'], ['p10', 'seen10']]) { const b = btn(t(l), target === k); b.onclick = () => { S.srTarget = k; S.rise = S._sweep[k].best.rise; C.renderSheet(); }; row.appendChild(b); }
  const ch = h('div'); el.appendChild(ch);
  const base = sw.baseline;
  xyChart(ch, { line: sw.rows.map(r => [r.rise, r.score]), xMax: 14, yMax: Math.max(0.5, sw.best.score * 1.3), xLabel: 'm', yLabel: t('scoreL'), hline: { v: base, color: PAL.silver, label: `${t('baseL')} ${num(base, 2)}` }, mark: { x: sw.best.rise, color: PAL.gold, label: `${t('bestFit')} +${num(sw.best.rise, 2)} m · ${num(sw.best.score, 2)}` }, color: PAL.cyan });
  el.appendChild(stats);
  slider(el, t('rise'), 0, 14, 0.25, S.rise, v => `+${num(v, 2)} m`, v => { S.rise = v; apply(v); });
  apply(S.rise);
}

// ---------------- compute ----------------
function compute(body, d, C) {
  const { S } = C;
  const el = h('div', 'lens'); body.appendChild(el);
  el.appendChild(h('h2', '', `${t('cmpTitle')} <span class="pill gold">${t('d' + d)}</span>`));
  const obs = C.R.obs.filter(x => x.kind !== 'roof'), fit = fitMotion(obs, Math.max(80, Math.round(S.t)));
  if (!S.bench && fit) S.bench = benchmark(obs, Math.round(S.t), { vx: fit.vx, vy: fit.vy, g: 1 }, { minMs: 250 });
  const rate = S.bench ? S.bench.perSec : 5e6, lap = C.DATA.bench ? C.DATA.bench.perSec : null;
  const cells = S.counter.cells + S.counter.runs * 48 * 46;
  if (d === 1) {
    el.appendChild(h('p', '', t('cmpD1', { runs: num(S.counter.runs), cells: num(cells) })));
    el.appendChild(h('p', '', t('cmpRate', { rate: num(rate) })));
    if (lap) el.appendChild(h('p', 'note', `${C.DATA.bench.machine}: ${num(lap)} / s (${C.DATA.bench.date})`));
    return;
  }
  if (d === 2) {
    el.insertAdjacentHTML('beforeend', `<p><span class="pill violet">${t('edge')}</span> ${t('edgeL')}</p><p><span class="pill gold">${t('centre')}</span> ${t('centreL')}</p>`);
    el.appendChild(h('p', '', `<b>${t('research')}</b>`));
    el.insertAdjacentHTML('beforeend', `<table class="t">${(PRIVATE ? ['pv_rSky', 'pv_rFS', 'pv_rVK', 'rArun'] : ['rArun']).map(k => `<tr><td>${t(k)}</td></tr>`).join('')}</table>`);
    el.appendChild(h('p', 'note', t('sources')));
    return;
  }
  return mountMachine(body, C);
}

// ---------------- landmark ----------------
let GRAPH = null;
function landmark(body, d, C) {
  const { S } = C, l = C.DATA.landmarks.find(x => x.id === S.lens.id), L = getLang();
  const p = C.toLocal(l.lng, l.lat), ph = C.DATA.photos[l.id];
  const el = h('div', 'lens'); body.appendChild(el);
  const name = L === 'km' ? l.km : L === 'th' ? (l.th || l.en) : l.en;
  el.appendChild(h('h2', '', `${name} <span class="pill gold">${t('d' + d)}</span>`));
  if (d === 1) {
    if (ph) { const img = h('img', 'photo'); img.src = ph.src; img.alt = name; img.decoding = 'async'; el.appendChild(img); el.appendChild(h('div', 'credit-s', `${t('photoBy')}: ${ph.author} · ${ph.licence} · Wikimedia Commons`)); }
    el.appendChild(h('p', '', (L === 'km' ? l.t_km : L === 'th' ? l.t_th : l.t_en) || ''));
    if (L !== 'km') el.appendChild(h('p', 'note', l.km));
    el.insertAdjacentHTML('beforeend', nums([[`${num(rainAt(C.storm, p.x, p.y, S.t))} ${t('mmh')}`, t('lmRain', { time: hhmm(S.t) }), 'cyan']]));
    return;
  }
  if (d === 2) {
    timeChart(el, { series: [{ data: series(C.storm, p.x, p.y), fill: 'rgba(95,212,230,.25)' }], tNow: S.t, yLabel: t('mmh'), h: 110 });
    const har = harAt(srPrep(C), p.x, p.y);
    el.insertAdjacentHTML('beforeend', nums([[`${num(l.lat, 4)}, ${num(l.lng, 4)}`, 'lat, lon', 'silver'], [har != null && isFinite(har) ? `${num(har, 1)} m` : '–', t('placeHAR'), 'silver']]));
    if (ph) el.appendChild(h('p', 'note', `${ph.title} · ${ph.author} · ${ph.licence}`));
    el.appendChild(h('p', 'note', t('sources')));
    return;
  }
  if (!GRAPH) GRAPH = buildGraph(C.DATA.geo);
  const a = { x: S.facility.x, y: S.facility.y };
  const dry = shortest(GRAPH, a, p, dryCost);
  const m = S.t;
  const wet = shortest(GRAPH, a, p, e => wetCost(e, (x, y) => rainAt(C.storm, x, y, m)));
  el.appendChild(h('p', '', t('route', { kind: kindName(S) })));
  el.insertAdjacentHTML('beforeend', nums([[dry ? `${num(dry.seconds / 60, 1)} ${t('min')}` : '–', t('dry') + (dry ? ` · ${num(dry.metres / 1000, 1)} km` : ''), 'silver'], [wet ? `${num(wet.seconds / 60, 1)} ${t('min')}` : '–', `${t('wetNow')} · ${hhmm(m)}`, 'cyan']]));
  el.appendChild(h('p', 'note', t('routeNote')));
}
landmark.live = false;

export const LENSES = { facility, camera, gauge, place, river, compute, landmark };
