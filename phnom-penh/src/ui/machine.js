// "The machine behind the miracle": compute and unit-economics lens. mount(container, C) → cleanup.
// Reads C.phoneBench ({perSec} | null), C.DATA.bench ({perSec, machine, date}), C.counter ({runs, cells}), C.S (state; settings in C.S.machine).
import { h, txt, nums, btn, slider, tag } from './kit.js';
import { t, num, addWords } from '../i18n.js';
import { WORDS } from '../words/machine.js';
import { PRESETS } from '../kernels/compute.js';
import {
  workPerDay, makeTenants, tenantsWork, tierCoreHours, DEFAULT_INPUTS, costRange, tornado, costPerTenant, placement,
} from '../kernels/business.js';

addWords(WORDS);

const STREET = { areaKm2: 4, cellM: 100, horizonMin: 120, stepMin: 2, members: 48, updateMin: 5 };
const SHAPES = {
  street: STREET,
  city: { ...STREET, ...PRESETS.city },
  cambodia: { ...STREET, ...PRESETS.cambodia },
  mekong: { ...STREET, ...PRESETS.mekong },
};
const PRICE_KEYS = ['overhead', 'serverPerSec', 'corePrice', 'storageGB', 'storagePrice', 'egressGB', 'egressPrice', 'sensors', 'ingestPrice', 'support', 'redundancy'];
const defaults = () => ({ ...SHAPES.city, preset: 'city', tenants: 10, shared: true, facilityKm2: 4, share: 0.5, serverCores: 64, inputs: DEFAULT_INPUTS(), open: false });

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UNITS = [[1e15, 'mc_Q'], [1e12, 'mc_T'], [1e9, 'mc_B'], [1e6, 'mc_M'], [1e3, 'mc_k']];
export function big(v) {
  if (v == null || !Number.isFinite(v)) return v === Infinity ? '∞' : '–';
  const a = Math.abs(v);
  for (const [d, k] of UNITS) if (a >= d) { const x = v / d; return num(x, Math.abs(x) < 10 ? 2 : Math.abs(x) < 100 ? 1 : 0) + ' ' + t(k); }
  return small(v);
}
const small = v => num(v, v === 0 ? 0 : Math.abs(v) < 0.01 ? 4 : Math.abs(v) < 10 ? 2 : 0);
const usd = v => 'US$ ' + (Math.abs(v) >= 1e4 ? big(v) : small(v));
const sig2 = x => Number(Number(x).toPrecision(2));
const sig3 = x => Number(Number(x).toPrecision(3));

export function mount(container, C) {
  const S = C.S.machine || (C.S.machine = defaults());
  const root = h('div', 'lens mc');
  container.appendChild(root);
  root.append(txt('h2', '', t('mc_title')), txt('p', '', t('mc_intro')), txt('p', 'note', t('mc_unit')));

  const res = h('div');
  const syncs = [];
  const update = () => { try { renderResults(); } catch (e) { res.replaceChildren(txt('p', 'note', e instanceof RangeError ? t('mc_bad') : String(e.message))); } };

  // presets
  const pr = h('div', 'presets'); root.appendChild(pr);
  const pbtn = {};
  for (const k of Object.keys(SHAPES)) {
    const b = btn(t('mc_p_' + k), S.preset === k); pbtn[k] = b;
    b.addEventListener('click', () => {
      Object.assign(S, SHAPES[k], { preset: k });
      for (const [kk, bb] of Object.entries(pbtn)) bb.classList.toggle('on', kk === k);
      syncs.forEach(f => f()); update();
    });
    pr.appendChild(b);
  }

  // controls
  const box = h('div'); root.appendChild(box);
  const fmtArea = v => `${v < 1000 ? num(v, Number.isInteger(v) ? 0 : 1) : big(v)} ${t('mc_km2')}`;
  function ctl(label, key, { log, min, max, step, round, fmt }) {
    const toRaw = v => log ? Math.log10(v) : v, fromRaw = r => round(log ? 10 ** r : r);
    const inp = slider(box, label, toRaw(min), toRaw(max), step, toRaw(S[key]), r => fmt(fromRaw(r)), (r, fin) => {
      S[key] = fromRaw(r); if (key in SHAPES.street) { S.preset = null; for (const bb of Object.values(pbtn)) bb.classList.remove('on'); } update();
    });
    syncs.push(() => { inp.value = toRaw(S[key]); inp.previousElementSibling.querySelector('output').textContent = fmt(S[key]); });
    return inp;
  }
  const int = Math.round;
  ctl(t('mc_area'), 'areaKm2', { log: true, min: 1, max: 1e6, step: 0.005, round: sig3, fmt: fmtArea });
  ctl(t('mc_cell'), 'cellM', { log: true, min: 10, max: 1000, step: 0.005, round: int, fmt: v => `${num(v)} ${t('mc_m')}` });
  ctl(t('mc_horizon'), 'horizonMin', { min: 10, max: 360, step: 10, round: int, fmt: v => `${num(v)} ${t('mc_min')}` });
  ctl(t('mc_step'), 'stepMin', { min: 1, max: 30, step: 1, round: int, fmt: v => `${num(v)} ${t('mc_min')}` });
  ctl(t('mc_members'), 'members', { log: true, min: 1, max: 1000, step: 0.005, round: int, fmt: v => num(v) });
  ctl(t('mc_refresh'), 'updateMin', { min: 1, max: 60, step: 1, round: int, fmt: v => `${num(v)} ${t('mc_min')}` });
  ctl(t('mc_tenants'), 'tenants', { log: true, min: 1, max: 1000, step: 0.005, round: int, fmt: v => num(v) });
  const sh = h('div', 'row'); box.appendChild(sh);
  const bShared = btn(t('mc_shared'), S.shared), bInd = btn(t('mc_indep'), !S.shared);
  const setShared = v => { S.shared = v; bShared.classList.toggle('on', v); bInd.classList.toggle('on', !v); update(); };
  bShared.addEventListener('click', () => setShared(true)); bInd.addEventListener('click', () => setShared(false));
  sh.append(bShared, bInd);
  ctl(t('mc_fac'), 'facilityKm2', { min: 1, max: 25, step: 1, round: int, fmt: v => fmtArea(v) });
  ctl(t('mc_share'), 'share', { min: 0.1, max: 1, step: 0.05, round: v => Math.round(v * 100) / 100, fmt: v => `${num(v * 100)}%` });

  // prices
  const det = h('details'); det.open = !!S.open; root.appendChild(det);
  det.addEventListener('toggle', () => { S.open = det.open; });
  det.appendChild(h('summary', '', `${esc(t('mc_prices'))} ${tag('assumed')}`));
  det.appendChild(txt('p', 'note', t('mc_prices_note')));
  const pg = h('div', 'pg'); det.appendChild(pg);
  for (const w of ['low', 'mid', 'high']) pg.appendChild(txt('span', 'note', t('mc_' + w)));
  const field = (get, set, label, suffix) => {
    const i = h('input'); i.type = 'number'; i.step = 'any'; i.inputMode = 'decimal'; i.value = get(); i.setAttribute('aria-label', label + suffix);
    i.addEventListener('input', () => { set(i.value === '' ? NaN : Number(i.value)); update(); });
    return i;
  };
  for (const k of PRICE_KEYS) {
    pg.appendChild(txt('span', 'pl', t('mc_in_' + k)));
    for (const w of ['low', 'mid', 'high']) pg.appendChild(field(() => S.inputs[k][w], v => { S.inputs[k][w] = v; }, t('mc_in_' + k), ' ' + t('mc_' + w)));
  }
  pg.appendChild(txt('span', 'pl', t('mc_in_serverCores')));
  pg.appendChild(field(() => S.serverCores, v => { S.serverCores = v; }, t('mc_in_serverCores'), ''));

  root.appendChild(res);

  function renderResults() {
    res.replaceChildren();
    const W = { areaKm2: S.areaKm2, cellM: S.cellM, horizonMin: S.horizonMin, stepMin: S.stepMin, members: S.members, updateMin: S.updateMin };
    const base = workPerDay(W);
    const tw = tenantsWork(makeTenants(W, S.tenants, S.shared));
    const per = tw.perTenant[0];
    const A = tag('assumed');
    const add = (...n) => res.append(...n);

    // work
    add(txt('h3', '', t('mc_h_work')));
    add(h('div', '', nums([
      [big(base.cells), `${esc(t('mc_cells'))} ${A}`, 'cyan'],
      [num(base.leads), `${esc(t('mc_leads'))} ${A}`, 'cyan'],
      [big(base.perRun), `${esc(t('mc_perrun'))} ${A}`, 'gold'],
      [num(base.runsPerDay, 1), `${esc(t('mc_runs'))} ${A}`, 'cyan'],
      [big(tw.perDay), `${esc(t('mc_perday'))} ${A}`, 'gold'],
      [big(per.shared), `${esc(t('mc_pertenant'))} ${A}`, 'silver'],
    ])));
    if (S.tenants > 1) add(txt('p', 'note', `${t('mc_groups', { n: num(S.tenants) })}: ${num(tw.groups.length)} · ${t('mc_alone')}: ${big(per.alone)}`));
    if (C.counter) add(h('p', 'note', `${esc(t('mc_session', { runs: num(C.counter.runs), cells: num(C.counter.cells) }))} ${tag('measured')}`));

    // core-hours
    const oh = S.inputs.overhead.mid;
    const bench = C.DATA && C.DATA.bench;
    const tiers = tierCoreHours(tw.perDay, { overhead: oh, phonePerSec: C.phoneBench ? C.phoneBench.perSec : null, laptopPerSec: bench ? bench.perSec : null, serverPerSec: S.inputs.serverPerSec.mid, serverCores: S.serverCores });
    add(txt('h3', '', t('mc_h_hours')));
    for (const r of tiers) {
      const d = h('div', 'tier');
      const kind = r.kind === 'hypothetical' ? 'assumed' : r.kind;
      let html = `${esc(t('mc_tier_' + r.id))} ${tag(kind)}<br>`;
      if (r.perSec == null) html += `<span class="note">${esc(t('mc_nophone'))}</span>`;
      else {
        html += `<b>${esc(big(r.coreHours))}</b> ${esc(t('mc_h_hours'))} · ${esc(t('mc_rate', { rate: big(r.perSec) }))}`;
        html += `<span class="calc">${esc(t('mc_calc', { work: big(r.work), oh: num(r.overhead, 2), rate: big(r.perSec), h: big(r.coreHours) }))}</span>`;
        if (r.id === 'server') html += `<span class="calc">${esc(t('mc_wall', { n: num(r.cores), h: big(r.wallHours) }))}</span>`;
        if (r.id === 'laptop' && bench) html += `<span class="calc">${esc(t('mc_benchnote', { machine: bench.machine, date: bench.date }))}</span>`;
      }
      d.innerHTML = html; add(d);
    }

    // cost
    const rg = costRange(S.inputs, tw.perDay);
    add(h('h3', '', `${esc(t('mc_h_cost'))} ${A}`));
    add(txt('p', 'note', t('mc_per_month')));
    const rows = [
      [t('mc_all_low'), usd(rg.low.total)], [t('mc_all_mid'), usd(rg.mid.total)], [t('mc_all_high'), usd(rg.high.total)],
    ];
    const m = rg.mid;
    const parts = [[t('mc_c_compute'), m.compute], [t('mc_c_storage'), m.storage], [t('mc_c_egress'), m.egress], [t('mc_c_ingest'), m.ingest], [t('mc_c_support'), m.support]];
    const tb = h('table', 't');
    for (const [a, b] of rows) tb.appendChild(h('tr', '', `<td><b>${esc(a)}</b></td><td><b>${esc(b)}</b></td>`));
    for (const [a, b] of parts) tb.appendChild(h('tr', '', `<td>${esc(a)}</td><td>${esc(usd(b))}</td>`));
    tb.appendChild(h('tr', '', `<td>${esc(t('mc_c_redundancy', { n: num(m.redundancy, 2) }))}</td><td>${esc(usd(m.total - m.subtotal))}</td>`));
    tb.appendChild(h('tr', '', `<td>${esc(t('mc_c_pertenant'))}</td><td>${esc(usd(costPerTenant(m.total, S.tenants)))}</td>`));
    add(tb);

    const tn = tornado(S.inputs, tw.perDay), top = tn[0].swing || 1;
    add(txt('h3', '', t('mc_h_tornado')), txt('p', 'note', t('mc_tornado_note')));
    const tdiv = h('div', 'torn');
    for (const r of tn) {
      tdiv.append(txt('span', 'nm', t('mc_in_' + r.key)), txt('span', 'v', usd(r.swing)));
      const bar = h('div', 'bar'); const i = h('i'); i.style.width = `${Math.max(1, r.swing / top * 100)}%`; bar.appendChild(i); tdiv.appendChild(bar);
    }
    add(tdiv);

    // placement
    const fac = { ...W, areaKm2: S.facilityKm2 };
    const pl = placement({ facility: fac, regionPerRun: base.perRun, tenants: S.tenants, shared: S.shared, devicePerSec: C.phoneBench ? C.phoneBench.perSec : null, overhead: oh, share: S.share });
    add(txt('h3', '', t('mc_h_where')));
    const ans = h('div', 'answer');
    const win = pl.winner === 'device' ? 'mc_win_device' : pl.winner === 'central' ? 'mc_win_central' : 'mc_win_unknown';
    ans.append(txt('b', '', t(win)), txt('p', '', t(pl.reason, { s: pl.deviceSec == null ? '–' : small(pl.deviceSec), b: num(pl.budgetSec), n: num(S.tenants), x: pl.crossover === Infinity ? '∞' : num(pl.crossover) })));
    ans.append(h('p', 'note', `${esc(t('mc_own', { work: big(pl.ownPerRun) }))} ${tag(C.phoneBench ? 'measured' : 'assumed')}`));
    ans.append(txt('p', 'note', t('mc_region', { work: big(base.perRun) })));
    ans.append(txt('p', 'note', pl.crossover === Infinity ? t('mc_cross_none') : t('mc_cross', { x: num(pl.crossover) })));
    add(ans);
  }

  update();
  return () => { container.contains(root) && container.removeChild(root); };
}
