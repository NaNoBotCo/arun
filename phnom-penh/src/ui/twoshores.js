// Two shores: the sheet module. mount(container, C) -> cleanup. Settings live in C.S.shores.
import { t, num } from '../i18n.js';
import { h, txt, nums, btn, slider } from './kit.js';
import { run, normalizeSettings, SIDES, ARMS, TEST_N, HEAVY, MIN_TRAIN, MAX_TRAIN } from '../kernels/twoshores.js';
import '../words/twoshores.js';

const sgn = (v, d = 1) => (Math.abs(v) < 0.05 && d === 1 ? '' : v > 0 ? '+' : '−') + num(Math.abs(v), d);
const lab = s => t('ts_lab_' + s), short = s => t('ts_' + s);
const procName = (r, side, arm) => {
  const o = side === 'cm' ? 'pp' : 'cm';
  if (arm === 'method' || arm === 'params') return t('ts_prov_from', { lab: short(o) });
  if (arm === 'pooled' || arm === 'pooledSide') return t('ts_proc_pooled');
  return t('ts_prov_own');
};
const provLine = (side, arm, p) => t('ts_prov', {
  list: p.records.map(r => t('ts_prov_item', { lab: short(r.side), n: num(r.n) })).join(', '),
  proc: procName(null, side, arm),
});

export function mount(container, C) {
  const store = (C && C.S) || {};
  store.shores = normalizeSettings(store.shores || {});
  const S = store.shores;
  const root = h('div', 'lens ts'); container.appendChild(root);
  const out = h('div'); // results, redrawn on every change
  let alive = true;

  const head = h('h2', '', `${t('ts_title')} <span class="pill silver">${t('ts_pill')}</span>`);
  root.append(head, txt('p', '', t('ts_sim')), txt('p', 'note', t('ts_task', { n: num(TEST_N), h: HEAVY })));

  // settings cards
  const cards = h('div', 'ts-cards'); root.appendChild(cards);
  for (const side of SIDES) {
    const card = h('div', 'ts-card ' + side);
    card.append(txt('h3', '', lab(side)), txt('p', 'note', t('ts_proc_' + (side === 'cm' ? 'logNight' : 'scale'))));
    for (const [f, key] of [['shareObs', 'ts_share_obs'], ['shareMethod', 'ts_share_method'], ['shareParams', 'ts_share_params']]) {
      const b = h('button', 'btn ts-tog'); b.type = 'button';
      const draw = () => { b.setAttribute('aria-pressed', String(S[side][f])); b.classList.toggle('on', S[side][f]); b.innerHTML = ''; b.append(txt('span', '', t(key)), txt('b', '', t(S[side][f] ? 'ts_yes' : 'ts_no'))); };
      b.onclick = () => { S[side][f] = !S[side][f]; draw(); render(); };
      draw(); card.appendChild(b);
    }
    slider(card, t('ts_cases'), MIN_TRAIN, MAX_TRAIN, 1, S[side].n, v => num(v), v => { S[side].n = v; render(); });
    cards.appendChild(card);
  }
  const g = h('div'); root.appendChild(g);
  slider(g, t('ts_reps'), 5, 100, 5, S.replicates, v => num(v), v => { S.replicates = v; render(); });
  slider(g, t('ts_gap'), 0, 2, 0.1, S.gap, v => num(v, 1), v => { S.gap = Math.round(v * 10) / 10; render(); });
  const rr = h('div', 'row'); const nd = btn(t('ts_redraw')); nd.type = 'button';
  nd.onclick = () => { S.seed = (S.seed * 7 + 13) % 100000; render(); };
  rr.appendChild(nd); g.appendChild(rr);

  root.appendChild(out);
  const det = h('details'); det.appendChild(txt('summary', '', t('ts_arms_title')));
  for (const a of ARMS) det.appendChild(txt('p', '', t('ts_d_' + a)));
  root.appendChild(det);
  root.appendChild(txt('p', 'note', ''));
  const legend = root.lastChild;
  const nt = h('div', 'ts-note'); nt.append(txt('h3', '', t('ts_note_title')), txt('p', '', t('ts_note'))); root.appendChild(nt);

  function arm(res, side, a, M) {
    const r = res.sides[side].arms[a], row = h('div', 'ts-arm');
    const name = t('ts_arm_' + a);
    if (!r.available) {
      row.classList.add('na');
      const who = r.missing.needs, whoList = (Array.isArray(who) ? who : [who]).map(lab).join(t('ts_and'));
      row.append(txt('div', 'ts-head', ''), txt('div', 'ts-sub', t('ts_na', { who: whoList, what: t('ts_what_' + r.missing.what) })));
      row.firstChild.append(txt('b', '', name), txt('span', 'ts-sign', '–'));
      return row;
    }
    const b = r.benefit, state = Math.abs(b.median) < 0.05 ? 'zero' : b.median > 0 ? 'pos' : 'neg';
    row.classList.add(state);
    const stateWord = t(state === 'pos' ? 'ts_better' : state === 'neg' ? 'ts_worse' : 'ts_same');
    const sign = t('ts_row', { v: sgn(b.median) || num(0, 1) });
    const hd = h('div', 'ts-head'); hd.append(txt('b', '', name), txt('span', 'ts-sign', sign)); row.appendChild(hd);
    const P = v => 50 + Math.max(-M, Math.min(M, v)) / M * 50;
    const bar = h('div', 'ts-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${name}: ${sign}. ${stateWord}`);
    const lo = Math.min(0, b.median), hi = Math.max(0, b.median);
    const fill = h('i', 'fill'); fill.style.left = P(lo) + '%'; fill.style.width = (P(hi) - P(lo)) + '%';
    const w = h('i', 'whisk'); w.style.left = P(b.p10) + '%'; w.style.width = (P(b.p90) - P(b.p10)) + '%';
    const c1 = h('i', 'cap'), c2 = h('i', 'cap'); c1.style.left = P(b.p10) + '%'; c2.style.left = P(b.p90) + '%';
    bar.append(h('i', 'axis'), fill, w, c1, c2); row.appendChild(bar);
    row.appendChild(txt('div', 'ts-sub', t('ts_sub', { lo: sgn(b.p10), hi: sgn(b.p90), pct: num(Math.round(r.worseShare * 100)), mae: num(r.mae.median, 1) })));
    row.appendChild(txt('div', 'ts-sub', t('ts_hitgain', { v: sgn(r.hitGain.median * 100, 0) || '0' })));
    row.appendChild(txt('span', 'ts-tag', stateWord));
    row.appendChild(txt('div', 'ts-prov', provLine(side, a, r.provenance)));
    return row;
  }

  function render() {
    if (!alive) return;
    const res = run(S);
    let M = 0.5;
    for (const side of SIDES) for (const a of ARMS) { const r = res.sides[side].arms[a]; if (r.available) M = Math.max(M, Math.abs(r.benefit.p10), Math.abs(r.benefit.p90), Math.abs(r.benefit.median)); }
    M = Math.ceil(M * 2) / 2;
    out.replaceChildren();
    for (const side of SIDES) {
      const sec = h('div', 'ts-res'), R = res.sides[side];
      sec.appendChild(txt('h3', '', t('ts_results', { lab: lab(side) })));
      sec.insertAdjacentHTML('beforeend', nums([
        [num(R.local.mae.median, 1), t('ts_localmae') + ' · ' + t('mmh'), side === 'cm' ? 'gold' : 'cyan'],
        [num(R.local.hitRate.median * 100) + '%', t('ts_localhit'), ''],
        [num(R.local.falseAlarm.median), t('ts_localfa'), ''],
      ]));
      sec.appendChild(txt('div', 'ts-prov', provLine(side, 'local', R.local.provenance)));
      const ax = h('div', 'ts-axis'); ax.append(txt('span', '', '← ' + t('ts_axis_worse')), txt('span', '', t('ts_axis_zero')), txt('span', '', t('ts_axis_better') + ' →'));
      sec.appendChild(ax);
      for (const a of ARMS) sec.appendChild(arm(res, side, a, M));
      out.appendChild(sec);
    }
    legend.textContent = t('ts_legend', { n: num(res.replicates) });
  }
  render();
  return () => { alive = false; root.remove(); };
}
