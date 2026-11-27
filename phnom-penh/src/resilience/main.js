import { W } from './words.js';
import { CONTROLS, ASSUME_FIELDS } from './controls.js';
import { drawChannel } from './plot.js';
import { ORDER, MODES, defaultsFor, run, ensemble } from './kernels/index.js';
import { ASSUMED } from './kernels/common.js';

const LANGS = ['en', 'km', 'th'], LANG_LABEL = { en: 'EN', km: 'ខ្មែរ', th: 'ไทย' };
const N_SEEDS = 40, DEFAULT_SEED = 8;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
};

const S = {
  lang: 'en', exp: 'water', seed: DEFAULT_SEED, reveal: false, tNow: null, playing: false,
  params: {}, assumed: { ...ASSUMED }, ev: null, ens: null,
};
for (const id of ORDER) S.params[id] = defaultsFor(id);
try { const l = localStorage.getItem('arun-res-lang'); if (LANGS.includes(l)) S.lang = l; } catch (e) { /* storage unavailable */ }
const qs = new URLSearchParams(location.search);
if (LANGS.includes(qs.get('lang'))) S.lang = qs.get('lang');
if (ORDER.includes(qs.get('exp'))) S.exp = qs.get('exp');
if (qs.get('seed') && Number.isFinite(+qs.get('seed'))) S.seed = Math.floor(+qs.get('seed'));

const t = (k, vars) => {
  const w = W[k]; let s = w ? (w[S.lang] || w.en) : k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};
const unit = u => (u && u.startsWith('u_')) ? t(u) : (u || '');

// ---------- number formats
const f = (v, d) => Number.isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toFixed(d) : t('none_val');
const FMT = {
  completeness: v => f(v * 100, 1) + '%', device: v => f(v * 100, 1) + '%',
  delay_mean: v => f(v, 0) + ' ' + t('u_min'), stale_mean: v => f(v, 0) + ' ' + t('u_min'), stale_p95: v => f(v, 0) + ' ' + t('u_min'), stale_max: v => f(v, 0) + ' ' + t('u_min'),
  gaps: v => f(v, 0), gap_min: v => f(v, 0) + ' ' + t('u_min'),
  energy_day: v => f(v, 2) + ' ' + t('u_mah'), life_days: v => f(v, 0) + ' ' + t('u_d'), swaps_month: v => f(v, 2),
  msgs_month: v => f(v, 0), visits_month: v => f(v, 1), cost_month: v => f(v, 2) + ' ' + t('u_cost'), dead_day: v => f(v, 1),
  events: v => f(v, 0), caught: v => f(v, 0), late: v => f(v, 0), missed: v => f(v, 0), false: v => f(v, 0), lead: v => f(v, 0) + ' ' + t('u_min'),
  exc_true_min: v => f(v, 0) + ' ' + t('u_min'), exc_seen_min: v => f(v, 0) + ' ' + t('u_min'), exc_in_record: v => f(v, 0), exc_not_in_record: v => f(v, 0),
  exc_longest_missed: v => f(v, 0) + ' ' + t('u_min'), cut_min: v => f(v, 0) + ' ' + t('u_min'),
  avail_true: v => f(v, 1) + '%', avail_est: v => f(v, 1) + '%', avail_err: v => f(v, 2),
  'tests.n': v => f(v, 0), 'tests.positive': v => f(v, 0), 'tests.covered': v => Number.isFinite(v) ? f(v * 100, 0) + '%' : t('none_val'),
  short_min: v => f(v, 0) + ' ' + t('u_min'), unseen_min: v => f(v, 0) + ' ' + t('u_min'),
};
const fmt = (k, v) => (FMT[k.replace(/^[a-z]+\.(events|caught|late|missed|false|lead)$/, '$1')] || (x => f(x, 2)))(v);
const metricKey = k => k.includes('.') && !k.startsWith('tests.') ? k.split('.')[1] : k;

// ---------- chrome
function buildChrome() {
  const app = $('#app'); app.textContent = '';
  const head = el('header', { class: 'top' },
    el('div', { class: 'brand' }, el('b', { text: 'ARUN' }), el('span', { text: t('title').replace(/^ARUN\s*/, '') })),
    el('button', { id: 'lang', class: 'chip', 'aria-label': t('lang'), text: LANG_LABEL[S.lang] }));
  const scope = el('section', { class: 'card scope' }, el('h2', { text: t('scope_h') }), el('p', { text: t('scope_1') }), el('p', { text: t('scope_2') }), el('p', { text: t('scope_3') }));
  const tabs = el('nav', { class: 'tabs', role: 'tablist' }, ORDER.map(id => el('button', { role: 'tab', class: 'tab', 'data-exp': id, 'aria-selected': String(id === S.exp), text: t('tab_' + id) })));
  const exp = el('section', { class: 'card', id: 'expcard' });
  const controls = el('section', { class: 'card', id: 'controls' });
  const charts = el('section', { class: 'card', id: 'chartsCard' });
  const replay = el('section', { class: 'card', id: 'replay' });
  const obs = el('section', { class: 'card', id: 'obs' });
  const truth = el('section', { class: 'card', id: 'truth' });
  const assume = el('details', { class: 'card', id: 'assume' });
  app.append(head, scope, tabs, exp, controls, charts, replay, obs, truth, assume);
  $('#lang').onclick = () => { S.lang = LANGS[(LANGS.indexOf(S.lang) + 1) % 3]; try { localStorage.setItem('arun-res-lang', S.lang); } catch (e) { /* ignore */ } rebuild(); };
  tabs.onclick = e => { const b = e.target.closest('[data-exp]'); if (!b || b.dataset.exp === S.exp) return; S.exp = b.dataset.exp; S.tNow = null; stop(); rebuild(); };
  document.documentElement.lang = S.lang === 'km' ? 'km' : S.lang === 'th' ? 'th' : 'en';
  document.title = t('title');
}

function buildExpAndControls() {
  const id = S.exp, P = S.params[id];
  const ec = $('#expcard'); ec.textContent = '';
  ec.append(el('h2', { text: `${t('f_' + id)} · ${t('x_' + id)}` }), el('p', { text: t('d_' + id) }));
  const cc = $('#controls'); cc.textContent = '';
  cc.append(el('h2', { text: t('controls') }), el('p', { class: 'hint', text: t('hint') }));
  const grid = el('div', { class: 'cgrid' });
  for (const c of CONTROLS[id]) grid.append(controlEl(c, P));
  // seed
  const sid = 'c-seed';
  const seed = el('input', { id: sid, type: 'number', inputmode: 'numeric', value: S.seed, step: 1 });
  seed.oninput = () => { const v = Math.floor(+seed.value); if (Number.isFinite(v)) { S.seed = v; recompute(); } };
  const next = el('button', { class: 'btn', text: t('c_next') });
  next.onclick = () => { S.seed++; seed.value = S.seed; recompute(); };
  grid.append(el('div', { class: 'ctl' }, el('label', { for: sid }, el('span', { text: t('c_seed') })), el('div', { class: 'seedrow' }, seed, next)));
  cc.append(grid);
}

function controlEl(c, P) {
  const id = 'c-' + c.k, name = t(c.label || 'c_' + c.k);
  const wrap = el('div', { class: 'ctl' });
  const change = () => { recompute(); };
  if (c.type === 'range') {
    const out = el('output', { for: id });
    const inp = el('input', { id, type: 'range', min: c.min, max: c.max, step: c.step, value: P[c.k] });
    const show = () => { out.textContent = `${P[c.k]}${c.unit ? ' ' + unit(c.unit) : ''}`; };
    inp.oninput = () => { P[c.k] = +inp.value; show(); change(); };
    show();
    wrap.append(el('label', { for: id }, el('span', { text: name }), out), inp);
  } else if (c.type === 'select') {
    const sl = el('select', { id });
    for (const o of c.opts) sl.append(el('option', { value: o, text: c.kinds ? t('k_' + o) : c.modes ? t('mode_' + o) : `${o} ${unit(c.unit)}`, selected: String(P[c.k]) === String(o) }));
    sl.onchange = () => { P[c.k] = isNaN(+sl.value) ? sl.value : +sl.value; change(); };
    wrap.append(el('label', { for: id }, el('span', { text: name })), sl);
  } else {
    const on = c.k === 'sf' ? P.mode === 'sf' : !!P[c.k];
    const b = el('button', { id, class: 'switch', role: 'switch', 'aria-checked': String(on) });
    b.append(el('span', { class: 'sw-label', text: name }), el('span', { class: 'sw-state', text: t(on ? 'on' : 'off') }));
    b.onclick = () => {
      const v = b.getAttribute('aria-checked') !== 'true';
      if (c.k === 'sf') P.mode = v ? 'sf' : 'direct'; else P[c.k] = v;
      b.setAttribute('aria-checked', String(v)); b.lastChild.textContent = t(v ? 'on' : 'off'); change();
    };
    wrap.append(b);
  }
  return wrap;
}

function buildAssume() {
  const d = $('#assume'); d.textContent = '';
  d.append(el('summary', { text: t('p_assume') }), el('p', { class: 'hint', text: t('p_assume_note') }));
  const g = el('div', { class: 'cgrid' });
  for (const [k, lab, step] of ASSUME_FIELDS) {
    const id = 'a-' + k;
    const inp = el('input', { id, type: 'number', inputmode: 'decimal', min: 0, step, value: S.assumed[k] });
    inp.oninput = () => { const v = +inp.value; if (Number.isFinite(v) && v >= 0) { S.assumed[k] = v; recompute(); } };
    g.append(el('div', { class: 'ctl' }, el('label', { for: id }, el('span', { text: t(lab) }), el('span', { class: 'tag', text: t('a_tag') })), inp));
  }
  d.append(g);
}

// ---------- charts and replay
const CH_NAME = { tank: 'ch_tank', flow: 'ch_flow', proxy: 'ch_proxy', temp: 'ch_temp', mains: 'ch_mains', health: 'ch_health', heat: 'ch_heat', hum: 'ch_hum', air: 'ch_air' };
function buildCharts() {
  const cc = $('#chartsCard'); cc.textContent = '';
  const rb = el('button', { id: 'reveal', class: 'btn primary', 'aria-pressed': String(S.reveal), text: t(S.reveal ? 'hide' : 'reveal') });
  rb.onclick = () => { S.reveal = !S.reveal; buildCharts(); drawAll(); renderTruth(); $('#reveal').focus(); };
  cc.append(rb);
  for (const ch of S.ev.channels) {
    const fig = el('figure', { class: 'fig', 'data-ch': ch.id });
    fig.append(el('figcaption', {}, el('b', { text: t(CH_NAME[ch.id]) }), el('span', { class: 'unit', text: ch.unit === 'idx' || ch.unit === 'on/off' ? '' : ' · ' + ch.unit }),
      ch.proxy ? el('span', { class: 'proxytag', text: t('t_proxy') }) : null));
    const box = el('div', { class: 'cv' }); const cv = el('canvas', { role: 'img', 'aria-label': t('chart_label', { name: t(CH_NAME[ch.id]) }) }); box.append(cv); fig.append(box);
    const lg = el('div', { class: 'legend' });
    const sw = (cls, label) => el('span', { class: 'lg' }, el('i', { class: cls }), label);
    lg.append(sw('s-got', t('l_received')), sw('s-pend', t('l_pending')));
    if (ch.alert) lg.append(sw('s-alert', t('l_alert')), sw('s-thr', t('l_thr')));
    if (S.ev.link.length) lg.append(sw('s-link', t('l_link')));
    if (S.reveal) lg.append(sw('s-truth', t('l_truth')), sw('s-event', t('l_event')));
    if (ch.id === 'proxy' && S.ev.def.tests) lg.append(sw('s-vpos', t('l_vpos')), sw('s-vneg', t('l_vneg')));
    fig.append(lg); cc.append(fig);
  }
}
function drawAll() {
  if (!S.ev) return;
  const tNow = S.tNow == null ? S.ev.H : S.tNow;
  document.querySelectorAll('#chartsCard .fig').forEach(fig => {
    const ch = S.ev.channels.find(c => c.id === fig.dataset.ch); if (!ch) return;
    drawChannel(fig.querySelector('canvas'), { ev: S.ev, ch, tNow, reveal: S.reveal, tests: ch.id === 'proxy' ? S.ev.def.tests : null });
  });
  updateReplayText();
}

const dayText = m => { const d = Math.floor(m / 1440) + 1, r = Math.floor(m % 1440); return t('r_day', { d, hh: String(Math.floor(r / 60)).padStart(2, '0'), mm: String(r % 60).padStart(2, '0') }); };
function buildReplay() {
  const r = $('#replay'); r.textContent = '';
  const H = S.ev.H;
  const row = el('div', { class: 'rrow' });
  const play = el('button', { id: 'play', class: 'btn', 'aria-label': t('r_play'), text: S.playing ? '❚❚' : '▶' });
  play.onclick = () => (S.playing ? stop() : start());
  if (reduced) play.hidden = true;
  const sl = el('input', { id: 'rt', type: 'range', min: 0, max: H, step: 10, value: S.tNow == null ? H : S.tNow, 'aria-label': t('r_time') });
  sl.oninput = () => { stop(); S.tNow = +sl.value; drawAll(); };
  row.append(play, sl);
  r.append(el('h2', { text: t('r_time') }), row, el('div', { id: 'rtext', class: 'rtext', 'aria-live': 'off' }));
}
function updateReplayText() {
  const box = $('#rtext'); if (!box || !S.ev) return;
  const H = S.ev.H, tn = S.tNow == null ? H : S.tNow;
  const { ts, arr } = S.ev.dev; let cur = 0;
  for (let i = 0; i < ts.length; i++) if (arr[i] <= tn && ts[i] > cur) cur = ts[i];
  const nAl = S.ev.channels.reduce((s, c) => s + c.alerts.filter(a => a.t <= tn).length, 0);
  box.textContent = `${t('now')}: ${dayText(Math.min(tn, H - 1))} · ${t('stale_now')}: ${f(tn - cur, 0)} ${t('u_min')} · ${t('alerts_now')}: ${nAl}`;
  const sl = $('#rt'); if (sl && +sl.value !== tn) sl.value = tn;
}
let timer = null;
function start() {
  if (S.tNow == null || S.tNow >= S.ev.H) S.tNow = 0;
  S.playing = true; $('#play').textContent = '❚❚'; $('#play').setAttribute('aria-label', t('r_pause'));
  timer = setInterval(() => { S.tNow = Math.min(S.ev.H, S.tNow + 60); drawAll(); if (S.tNow >= S.ev.H) stop(); }, 70);
}
function stop() {
  S.playing = false; clearInterval(timer); timer = null;
  const p = $('#play'); if (p) { p.textContent = '▶'; p.setAttribute('aria-label', t('r_play')); }
}

// ---------- results
function distBar(key, v) {
  const d = S.ens && S.ens.keys[key]; if (!d || !d.n) return null;
  const lo = Math.min(d.min, Number.isFinite(v) ? v : d.min), hi = Math.max(d.max, Number.isFinite(v) ? v : d.max);
  if (!(hi > lo)) return el('div', { class: 'dtext', text: `${t('median')} ${fmt(key, d.med)}` });
  const P = x => ((x - lo) / (hi - lo) * 100).toFixed(1) + '%';
  const bar = el('div', { class: 'bar', 'aria-hidden': 'true' },
    el('i', { class: 'rangefill', style: `left:${P(d.p10)};width:calc(${P(d.p90)} - ${P(d.p10)})` }),
    el('i', { class: 'med', style: `left:${P(d.med)}` }),
    Number.isFinite(v) ? el('i', { class: 'me', style: `left:${P(v)}` }) : null);
  return el('div', { class: 'dist' }, bar, el('div', { class: 'dtext', text: `${t('median')} ${fmt(key, d.med)} (${fmt(key, d.p10)} – ${fmt(key, d.p90)})` }));
}
const row = (key, v, label) => el('div', { class: 'row' }, el('div', { class: 'rl' }, el('span', { text: label || t('m_' + metricKey(key)) }), el('b', { class: 'rv', text: fmt(key, v) })), distBar(key, v));

const OBS_KEYS = ['completeness', 'device', 'delay_mean', 'stale_mean', 'stale_p95', 'stale_max', 'gaps', 'gap_min', 'energy_day', 'life_days', 'swaps_month', 'msgs_month', 'visits_month', 'cost_month', 'dead_day'];
function renderObs() {
  const c = $('#obs'); c.textContent = ''; const fl = S.ev.flat;
  c.append(el('h2', { text: t('p_obs') }), el('p', { class: 'hint', text: t('p_dist', { n: N_SEEDS }) }));
  const mode = S.ev.params.mode;
  for (const k of OBS_KEYS) {
    if (k === 'device' && fl.device >= 0.9995) continue;
    if (k === 'dead_day' && !Number.isFinite(fl.dead_day)) continue;
    if (k === 'msgs_month' && mode === 'local') continue;
    if (k === 'visits_month' && mode !== 'local') continue;
    c.append(row(k, fl[k]));
  }
}
const EXTRA = { cold: ['exc_true_min', 'exc_seen_min', 'exc_in_record', 'exc_not_in_record', 'exc_longest_missed', 'cut_min'], power: ['avail_true', 'avail_est', 'avail_err'], water: ['tests.n', 'tests.positive', 'tests.covered', 'short_min'], conn: [] };
const CMP_ROWS = [['short_min', true, 'u_min'], ['unseen_min', true, 'u_min'], ['completeness', false, ''], ['delay_mean', false, 'u_min'], ['stale_mean', false, 'u_min'], ['stale_max', false, 'u_min'], ['energy_day', false, 'u_mah'], ['swaps_month', false, ''], ['msgs_month', false, ''], ['visits_month', false, ''], ['cost_month', false, 'u_cost']];
function renderTruth() {
  const c = $('#truth'); c.textContent = ''; const fl = S.ev.flat;
  c.append(el('h2', { text: t('p_truth') }));
  if (!S.reveal) { c.append(el('p', { class: 'hint', text: t('p_locked') })); return; }
  c.append(el('p', { class: 'hint', text: t('p_dist', { n: N_SEEDS }) }));
  if (S.exp === 'conn') {
    const tbl = el('div', { class: 'cmp', role: 'table' });
    c.append(el('h3', { text: t('cmp_h') }));
    const hd = el('div', { class: 'crow chead', role: 'row' }, el('div', { text: '' }), MODES.map(m => el('div', { class: m === S.ev.params.mode ? 'sel' : '', role: 'columnheader', text: t('mode_' + m) })));
    tbl.append(hd);
    for (const [k, , u] of CMP_ROWS) {
      if (k === 'msgs_month' || k === 'visits_month') { /* shown in the mode that uses it */ }
      const cells = MODES.map(m => {
        const key = `cmp.${m}.${k}`, v = S.ev.flat[key], d = S.ens && S.ens.keys[key];
        const na = (k === 'msgs_month' && m === 'local') || (k === 'visits_month' && m !== 'local');
        const val = na ? t('none_val') : (Number.isFinite(v) ? (k === 'completeness' ? f(v * 100, 1) + '%' : f(v, k === 'swaps_month' ? 2 : k === 'energy_day' || k === 'cost_month' ? 2 : 0)) : t('none_val'));
        const med = !na && d && d.n ? (k === 'completeness' ? f(d.med * 100, 1) + '%' : f(d.med, k === 'swaps_month' ? 2 : k === 'energy_day' || k === 'cost_month' ? 2 : 0)) : '';
        return el('div', { class: 'cell', role: 'cell' }, el('b', { text: val }), el('small', { text: med ? `${t('median')} ${med}` : '' }));
      });
      const lab = t('m_' + k) + (u ? ` (${unit(u)})` : '');
      tbl.append(el('div', { class: 'crow', role: 'row' }, el('div', { class: 'cl', role: 'rowheader', text: lab }), cells));
    }
    c.append(tbl, el('p', { class: 'hint', text: t('cmp_note') }));
  }
  for (const ch of S.ev.channels) {
    if (!ch.alert) continue;
    const card = el('div', { class: 'sub' }, el('h3', { text: t(CH_NAME[ch.id]) }));
    for (const k of ['events', 'caught', 'late', 'missed', 'false', 'lead']) card.append(row(`${ch.id}.${k}`, fl[`${ch.id}.${k}`], t('m_' + k)));
    c.append(card);
  }
  const ex = EXTRA[S.exp] || [];
  if (ex.length) { const card = el('div', { class: 'sub' }); for (const k of ex) card.append(row(k, fl[k])); c.append(card); }
}

// ---------- compute
let ensTimer = null, rafId = 0;
function paramsNow() { return { ...S.params[S.exp], assumed: { ...S.assumed } }; }
function recompute() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    S.ev = run(S.exp, paramsNow(), S.seed);
    window.__EV = S.ev;
    if (S.tNow != null && S.tNow > S.ev.H) S.tNow = null;
    renderAll(true);
    clearTimeout(ensTimer);
    ensTimer = setTimeout(() => { S.ens = ensemble(S.exp, paramsNow(), S.seed, N_SEEDS); window.__ENS = S.ens; renderObs(); renderTruth(); window.__ready = true; }, 120);
  });
}
function renderAll(keepControls) {
  buildCharts(); drawAll(); buildReplay(); updateReplayText(); renderObs(); renderTruth();
}
function rebuild() {
  stop(); buildChrome(); buildExpAndControls(); buildAssume();
  S.ev = run(S.exp, paramsNow(), S.seed); S.ens = ensemble(S.exp, paramsNow(), S.seed, N_SEEDS);
  window.__EV = S.ev; window.__ENS = S.ens; window.__S = S;
  renderAll(); window.__ready = true;
}
let rz = 0;
addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => S.ev && drawAll()); });
window.__api = { S, run, ensemble, setLang: l => { S.lang = l; rebuild(); }, setExp: id => { S.exp = id; S.tNow = null; rebuild(); } };
try { rebuild(); } catch (e) { window.__error = String(e && e.stack || e); throw e; }
