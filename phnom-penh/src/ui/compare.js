// Compare mode: the city as it opens against your experiment (or two saved experiments).
// Forecast only until the driver asks to see what happened; then the practice storm's truth and the
// scores on the unseen storms. Every number is computed from the two experiment states.
import { h, btn, nums, tag } from './kit.js';
import { t, num, hhmm } from '../i18n.js';
import { xyChart } from './chart.js';
import { PAL } from '../palette.js';
import { runScenario } from '../kernels/scenario.js';
import { BASELINE, hashState, costOf } from '../kernels/experiment.js';
import { evaluateChunked, HELDOUT, CLASSES } from '../kernels/evaluation.js';

const usd = v => 'US$' + num(v);
const pct = v => (v == null || v !== v ? '–' : num(v * 100) + '%');

export function compareSheet(body, C) {
  const { S } = C;
  const recs = S.compareRecs;
  const A = recs ? { state: recs[0].scenario, title: recs[0].title } : { state: BASELINE, title: t('v_baseline') };
  const B = recs ? { state: recs[1].scenario, title: recs[1].title } : { state: C.state, title: t('v_yours') };
  const el = h('div', 'lens cmp'); body.appendChild(el);
  el.appendChild(h('h2', '', recs ? t('v_compareRec') : t('v_compare')));
  if (recs) { const b0 = btn(t('v_useCurrent')); b0.onclick = () => { S.compareRecs = null; C.renderSheet(); }; el.appendChild(b0); }
  const same = hashState(A.state) === hashState(B.state);
  if (same) { el.appendChild(h('p', 'note', t('v_same'))); }

  const run = s => runScenario({ ...C.cfgOf(s) });
  const ra = run(A.state), rb = run(B.state), ca = costOf(A.state, C.DATA.sensors), cb = costOf(B.state, C.DATA.sensors);
  const col = (r, c) => {
    const w = r.network.tWarn;
    const rows = [[w >= 0 ? hhmm(w) : t('v_noNotice'), t('v_noticeAt'), 'gold'], [w >= 0 ? pct(r.network.cover[w]) : '–', t('v_coverNow'), 'silver'], [usd(c.usd), t('tag_assumed'), 'silver']];
    if (S.truth) rows.push([r.tWater < 0 ? t('v_noWaterShort') : r.network.prep == null ? t('v_noNotice') : `${num(r.network.prep)} ${t('min')}`, t('v_leadMin'), 'jade'], [t('v_cls_' + r.network.outcome), '', 'cyan']);
    return nums(rows);
  };
  el.appendChild(h('p', 'note', t('v_thisStorm', { n: num(A.state.seed) }) + (A.state.seed !== B.state.seed ? ` · ${num(B.state.seed)}` : '')));
  const grid = h('div', 'two'); el.appendChild(grid);
  grid.insertAdjacentHTML('beforeend', `<div><h3>${escapeHtml(A.title || '')}</h3>${col(ra, ca)}</div><div><h3>${escapeHtml(B.title || '')}</h3>${col(rb, cb)}</div>`);

  if (!S.truth) {
    el.appendChild(h('p', 'note', t('v_revealNote') + ' ' + tag('synthetic')));
    const go = btn(t('v_score'), false, 'go'); go.onclick = () => { C.setTruth(true); C.renderSheet(); }; el.appendChild(go);
    return;
  }
  el.appendChild(h('p', 'note', t('v_revealed')));
  const hide = btn(t('v_hideTruth')); hide.onclick = () => { C.setTruth(false); C.renderSheet(); }; el.appendChild(hide);

  // unseen storms
  el.appendChild(h('h3', '', t('v_heldout')));
  el.appendChild(h('p', 'note', t('v_heldoutL', { n: num(HELDOUT.length) })));
  const out = h('div'); el.appendChild(out);
  const cancels = [];
  const get = (state, done) => {
    const key = hashState(state), hit = S.evalCache.get(key);
    if (hit) { done(hit); return; }
    cancels.push(evaluateChunked(C.cfgOf(state), HELDOUT, (i, n) => { prog.textContent = t('v_scoring', { i: num(i), n: num(n) }); }, res => { S.evalCache.set(key, res); done(res); }));
  };
  const prog = h('p', 'note'); out.appendChild(prog);
  get(A.state, ea => get(B.state, eb => { prog.textContent = ''; paint(out, ea, eb, A, B); }));
  return () => cancels.forEach(c => c());
}

function paint(out, ea, eb, A, B) {
  const sa = ea.summary, sb = eb.summary;
  const line = s => `${num(s.leadNet.median)} ${t('min')} <span class="note">${t('v_range', { a: num(s.leadNet.p25), b: num(s.leadNet.p75), c: num(s.leadNet.min), d: num(s.leadNet.max) })}</span>`;
  const d = sb.leadNet.median != null && sa.leadNet.median != null ? sb.leadNet.median - sa.leadNet.median : null;
  out.insertAdjacentHTML('beforeend', `<table class="t cmpT"><tr><td></td><td>${escapeHtml(A.title || '')}</td><td>${escapeHtml(B.title || '')}</td></tr>
    <tr><td>${t('v_leadMin')} (${t('v_median')})</td><td>${line(sa)}</td><td>${line(sb)}</td></tr>
    ${CLASSES.map(c => `<tr><td>${t('v_cls_' + c)}</td><td>${num(sa.network[c])}</td><td>${num(sb.network[c])}</td></tr>`).join('')}
    <tr><td>${t('v_errDoor')}</td><td>${num(sa.err.median, 1)}</td><td>${num(sb.err.median, 1)}</td></tr>
    <tr><td>${t('v_spread')}</td><td>${num(sa.spread.median, 1)}</td><td>${num(sb.spread.median, 1)}</td></tr>
    <tr><td>${t('v_coverHour')}</td><td>${pct(sa.cover.median)}</td><td>${pct(sb.cover.median)}</td></tr></table>`);
  if (d != null) out.appendChild(h('p', '', `<b>${t('v_better', { d: (d > 0 ? '+' : d < 0 ? '−' : '±') + num(Math.abs(d)) })}</b>`));
  // one dot per unseen storm: minutes to prepare, A grey, B gold; storms with no water sit at zero
  const pts = [];
  ea.rows.forEach((r, i) => pts.push({ x: i + 1, y: r.prepNet == null ? 0 : r.prepNet, color: PAL.silver, r: 3 }));
  eb.rows.forEach((r, i) => pts.push({ x: i + 1, y: r.prepNet == null ? 0 : r.prepNet, color: PAL.gold, r: 3.5 }));
  const ymax = Math.max(30, ...pts.map(p => p.y)) * 1.1;
  xyChart(out, { points: pts, xMax: ea.rows.length + 1, yMax: ymax, xLabel: `1 … ${ea.rows.length}`, yLabel: t('v_leadMin') });
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
