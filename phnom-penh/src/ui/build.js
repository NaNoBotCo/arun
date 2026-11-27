// Build mode: tools that change the network on the map. Choose a tool, tap the map, see the preview and
// its assumed cost, then commit or cancel. Added sensors and the facility can also be dragged.
import { h, btn } from './kit.js';
import { t, num, hhmm } from '../i18n.js';
import { evaluateChunked, HELDOUT } from '../kernels/evaluation.js';
import { hashState, costOf } from '../kernels/experiment.js';
import { PAL } from '../palette.js';

const usd = v => 'US$' + num(v);
const kindWord = k => t('v_kind_' + k);
const minLine = (r) => r.tWater < 0 ? t('v_noWaterShort') : r.network.prep == null ? t('v_noNotice') : `${num(r.network.prep)} ${t('min')}`;
export const OUTRUN_BUDGET = 6000;

function changes(C) {
  const s = C.state;
  return s.added.length + s.off.length + (s.facility.x !== -1500 || s.facility.y !== -600 ? 1 : 0) + (s.warnP !== 0.5 ? 1 : 0) + (s.ring !== 'region' ? 1 : 0) + (s.seed !== 1 ? 1 : 0);
}

export function buildSheet(body, C) {
  const { S } = C;
  const el = h('div', 'lens build'); body.appendChild(el);
  const tools = h('div', 'tools'); el.appendChild(tools);
  for (const [k, label] of [['gauge', 'v_addGauge'], ['camera', 'v_addCamera'], ['remove', 'v_remove'], ['move', 'v_move']]) {
    const b = btn(t(label), S.tool === k); b.setAttribute('aria-pressed', String(S.tool === k)); b.onclick = () => C.setTool(k); tools.appendChild(b);
  }
  const hist = h('div', 'row hist'); el.appendChild(hist);
  const u = btn(t('v_undo')); u.disabled = !C.H.past.length; u.onclick = C.undo; hist.appendChild(u);
  const r = btn(t('v_redo')); r.disabled = !C.H.future.length; r.onclick = C.redo; hist.appendChild(r);
  const z = btn(t('v_reset')); z.onclick = C.reset; hist.appendChild(z);

  if (S.pending) { pendingCard(el, C); return; }
  const hint = S.tool === 'gauge' || S.tool === 'camera' ? t('v_hintAdd', { kind: kindWord(S.tool) }) : S.tool === 'remove' ? t('v_hintRemove') : S.tool === 'move' ? (S.moveId ? t('v_hintMove2', { id: S.moveId === 'fac' ? t('kind_' + C.state.facility.kind) : S.moveId.toUpperCase() }) : t('v_hintMove')) : t('v_hintTool');
  el.appendChild(h('p', 'hint', hint));
  const cost = costOf(C.state, C.DATA.sensors);
  el.appendChild(h('p', 'note', `${t('v_netLine', { g: num(cost.gauge), c: num(cost.camera), usd: usd(cost.usd) })} · ${t('v_changes', { n: num(changes(C)) })}`));
  if (S.lastEffect && S.lastEffect.before !== undefined && S.lastEffect.type !== 'seed') el.appendChild(h('p', '', t('v_effect', { a: num(S.lastEffect.before), b: num(S.lastEffect.after) })));
  if (S.challenge === 'outrun') outrunPanel(el, C, cost);
  if (!S.tool) C.coachLine(el);
}

function pendingCard(el, C) {
  const { S } = C, p = S.pending, a = p.a;
  const card = h('div', 'pending'); el.appendChild(card);
  const id = a.id === 'fac' ? t('kind_' + C.state.facility.kind) : (a.id || '').toUpperCase();
  card.appendChild(h('p', 'q', a.type === 'add' ? t('v_previewAdd', { kind: kindWord(a.kind) }) : a.type === 'move' ? t('v_previewMove', { id }) : a.type === 'restore' ? t('v_previewRestore', { id }) : t('v_previewRemove', { id })));
  if (p.error) { card.appendChild(h('p', 'note', p.error)); }
  else {
    const before = C.R, after = p.R, c0 = costOf(C.state, C.DATA.sensors), d = p.cost.usd - c0.usd;
    card.appendChild(h('p', '', t('v_previewEffect', { a: minLine(before), b: minLine(after) }).replace(/ min min/g, ' min')));
    card.appendChild(h('p', 'note', `${hhmm(before.network.tWarn)} → ${hhmm(after.network.tWarn)} · ${t('v_costDelta', { d: (d >= 0 ? '+' : '−') + usd(Math.abs(d)) })}`));
    if (S.challenge === 'outrun' && p.cost.usd > OUTRUN_BUDGET) { p.over = true; card.appendChild(h('p', 'over', t('v_overBudget', { usd: usd(p.cost.usd - OUTRUN_BUDGET) }))); }
  }
  const row = h('div', 'row'); card.appendChild(row);
  const ok = btn(t('v_confirm'), false, 'go'); ok.disabled = !!(p.error || p.over);
  ok.onclick = () => { const act = p.a; p.restore = null; C.clearPending(); S.moveId = null; C.act(act); C.renderSheet(); };
  const no = btn(t('v_cancel')); no.onclick = () => { C.clearPending(); S.moveId = null; C.renderSheet(); };
  row.append(ok, no);
}

// The map tap with a tool in hand.
export function buildTap(cx, cy, C) {
  const { S, world } = C;
  const gp = world.pickGround(cx, cy), id = world.pickGlyph(cx, cy);
  C.clearPending();
  const isSensor = i => i && (C.DATA.sensors.some(s => s.id === i) || C.state.added.some(s => s.id === i));
  if (S.tool === 'gauge' || S.tool === 'camera') {
    if (!gp) { C.flash(t('v_cantAdd')); return; }
    const a = { type: 'add', kind: S.tool, x: Math.round(gp.x), y: Math.round(gp.y) };
    S.pending = { a, ...C.preview(a) };
    world.addGlyph('_preview', S.tool, a.x, a.y, S.tool === 'camera' ? 190 : 150, 0.034);
  } else if (S.tool === 'remove') {
    if (!isSensor(id)) { C.flash(t('v_hintRemove')); return; }
    const a = C.state.off.includes(id) ? { type: 'restore', id } : { type: 'remove', id };
    S.pending = { a, ...C.preview(a) };
    world.setSelect(world.glyph(id).userData.x, world.glyph(id).userData.y, 420);
  } else if (S.tool === 'move') {
    if (!S.moveId) {
      if (id === 'fac' || C.state.added.some(s => s.id === id)) { S.moveId = id; world.setSelect(world.glyph(id).userData.x, world.glyph(id).userData.y, 420); }
      else if (isSensor(id)) C.flash(t('v_onlyAdded'));
      else C.flash(t('v_hintMove'));
    } else {
      if (!gp) { C.flash(t('v_cantAdd')); return; }
      const mid = S.moveId, g = world.glyph(mid), from = { x: g.userData.x, y: g.userData.y };
      const a = { type: 'move', id: mid, x: Math.round(gp.x), y: Math.round(gp.y) };
      world.moveGlyph(mid, a.x, a.y);
      S.pending = { a, ...C.preview(a), restore: () => world.moveGlyph(mid, from.x, from.y) };
    }
  }
  C.renderSheet();
}

// Dragging: pointer down on an added sensor or the facility, move, release. The preview follows the
// finger (debounced); release commits the move, and Undo takes it back.
export function dragStart(e, C) {
  const { S, world } = C;
  if (S.tool && S.tool !== 'move') return;
  const id = world.pickGlyph(e.clientX, e.clientY);
  if (!(id === 'fac' || C.state.added.some(s => s.id === id))) return;
  e.stopPropagation(); e.preventDefault();
  const g = world.glyph(id), from = { x: g.userData.x, y: g.userData.y }, x0 = e.clientX, y0 = e.clientY;
  let moved = false, timer = 0, last = null;
  const move = ev => {
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) moved = true;
    if (!moved) return;
    const gp = world.pickGround(ev.clientX, ev.clientY); if (!gp) return;
    last = { x: Math.round(gp.x), y: Math.round(gp.y) }; world.moveGlyph(id, last.x, last.y);
    clearTimeout(timer);
    timer = setTimeout(() => { const a = { type: 'move', id, ...last }; S.pending = { a, ...C.preview(a), restore: () => world.moveGlyph(id, from.x, from.y), dragging: true }; C.renderSheet(); }, 250);
  };
  const up = () => {
    removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
    clearTimeout(timer);
    if (moved && last) { C.clearPending(); world.moveGlyph(id, from.x, from.y); C.act({ type: 'move', id, ...last }); S.moveId = null; C.renderSheet(); }
    else { S.tool = 'move'; S.moveId = id; world.setSelect(from.x, from.y, 420); C.renderSheet(); }
  };
  addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
}

// Outrun the rain: budget bar, score on the unseen storms, attempts.
function outrunPanel(el, C, cost) {
  const { S } = C;
  const box = h('div', 'chal'); el.appendChild(box);
  box.appendChild(h('p', '', `<b>${t('ch_active', { name: t('ch_outrun') })}</b>`));
  const pct = Math.min(100, cost.usd / OUTRUN_BUDGET * 100);
  box.insertAdjacentHTML('beforeend', `<div class="budget"><i style="width:${pct}%;background:${cost.usd > OUTRUN_BUDGET ? PAL.rose : PAL.gold}"></i></div><p class="note">${t('v_budget', { usd: usd(OUTRUN_BUDGET), used: usd(cost.usd) })} · ${t('or_practice', { n: num(C.state.seed) })}</p>`);
  const row = h('div', 'row'); box.appendChild(row);
  const sc = btn(t('or_score'), false, 'go'); row.appendChild(sc);
  const lv = btn(t('ch_leave')); lv.onclick = () => { S.challenge = null; C.renderSheet(); }; row.appendChild(lv);
  const out = h('div'); box.appendChild(out);
  const key = hashState(C.state);
  const show = res => {
    const s = res.summary, n = s.network;
    out.innerHTML = `<p>${t('or_result', { m: num(s.leadNet.median), a: num(s.leadNet.p25), b: num(s.leadNet.p75), late: num(n.late), miss: num(n.miss), fa: num(n.false), usd: usd(cost.usd) })}</p>`;
  };
  let cancel = null;
  sc.onclick = () => {
    if (cost.usd > OUTRUN_BUDGET) { C.flash(t('v_overBudget', { usd: usd(cost.usd - OUTRUN_BUDGET) })); return; }
    const hit = S.evalCache.get(key); if (hit) { show(hit); return; }
    sc.disabled = true;
    cancel = evaluateChunked(C.cfgOf(C.state), HELDOUT, (i, n) => { out.innerHTML = `<p class="note">${t('v_scoring', { i: num(i), n: num(n) })}</p>`; }, res => {
      S.evalCache.set(key, res); sc.disabled = false; show(res);
      S.attempts.push({ key, usd: cost.usd, median: res.summary.leadNet.median, miss: res.summary.network.miss + res.summary.network.late, fa: res.summary.network.false });
      paintAttempts();
    });
  };
  const att = h('div'); box.appendChild(att);
  const paintAttempts = () => {
    att.innerHTML = '';
    if (!S.attempts.length) return;
    att.appendChild(h('p', 'note', t('or_attempts')));
    att.insertAdjacentHTML('beforeend', `<table class="t">${S.attempts.slice(-6).map((a, i) => `<tr><td>${i + 1}</td><td>${num(a.median)} ${t('min')}</td><td>${num(a.miss)} · ${num(a.fa)}</td><td>${usd(a.usd)}</td></tr>`).join('')}</table>`);
  };
  paintAttempts();
  if (S.evalCache.get(key)) show(S.evalCache.get(key));
  return () => { if (cancel) cancel(); };
}
