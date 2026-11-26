// Desk: who pays, for what, and an editable revenue sandbox for a managed computational-foresight service.
import { h, fmtMoney, fmtPct, fmt, button } from '../core/ui.js';
import { toCSV } from '../core/record.js';
import { exportPanel } from '../core/exportbox.js';

const PRODUCTS = [
  { id: 'property', buyer: 'Property and construction', pays: 'Scenario comparison and physical hazard report', recurring: 'Report credits, site monitoring, integration', benefit: 'Better environmental measurements; buildings sited and built to cope', ex: 'e02', qty: 120, price: 1200, cpuh: 40, field: 150 },
  { id: 'hotel', buyer: 'Hotel or farm', pays: 'Local weather and environmental decisions', recurring: 'Site subscription, sensor service', benefit: 'Shared, non-sensitive observations', ex: 'e04', qty: 300, price: 450, cpuh: 6, field: 60 },
  { id: 'utility', buyer: 'Infrastructure or utility', pays: 'Intervention optimisation, redundancy study', recurring: 'Project fee and model refresh', benefit: 'Services that stay up; fewer avoidable outages', ex: 'e17', qty: 12, price: 25000, cpuh: 900, field: 2000 },
  { id: 'insurer', buyer: 'Insurer or loss engineer', pays: 'Ensemble hazard analysis', recurring: 'Annual API access, usage', benefit: 'Better physical mitigation; no scoring of individual people', ex: 'e03', qty: 40, price: 8000, cpuh: 300, field: 0 },
  { id: 'owner', buyer: 'Data owner', pays: 'Controlled aggregate analysis', recurring: 'Managed processing, audit, integration', benefit: 'Less need to share sensitive data at all', ex: 'e05', qty: 24, price: 6000, cpuh: 120, field: 0 },
  { id: 'dc', buyer: 'Data-center operator', pays: 'Managed scientific inference and simulation', recurring: 'Metered jobs, reserved capacity, managed service', benefit: 'Infrastructure behind openly available, approved resilience products', ex: 'e19', qty: 1, price: 180000, cpuh: 60000, field: 0 },
];

export function desk(main) {
  const state = PRODUCTS.map((p) => ({ ...p }));
  const assume = { cpuCost: 0.08, storage: 5, fixed: 250000 };
  const tbody = h('tbody', {});
  const totals = h('div', { class: 'metrics' });
  const exportOut = h('div', {});
  const numIn = (obj, key, label, step = 1) => {
    const i = h('input', { type: 'number', class: 'num', min: 0, step, value: obj[key], 'aria-label': label });
    i.addEventListener('change', () => {
      const v = Number(i.value);
      if (!Number.isFinite(v) || v < 0) {
        i.classList.add('bad');
        i.title = 'Enter zero or a positive number.';
        return;
      }
      i.classList.remove('bad');
      obj[key] = v;
      recompute();
    });
    return i;
  };
  const tile = (l, v, sub, tone) => h('div', { class: 'metric', dataset: { tone: tone || '' } }, h('span', { class: 'ml' }, l), h('span', { class: 'mv' }, v), h('span', { class: 'ms' }, sub || ''));
  function recompute() {
    tbody.replaceChildren();
    let rev = 0, varc = 0, cpu = 0, units = 0;
    const rows = [];
    for (const p of state) {
      const r = p.qty * p.price;
      const v = p.qty * (p.cpuh * assume.cpuCost + assume.storage + p.field);
      rev += r;
      varc += v;
      cpu += p.qty * p.cpuh;
      units += p.qty;
      rows.push([p.buyer, p.qty, p.price, p.cpuh, p.field, r, v, r - v]);
      tbody.append(h('tr', {},
        h('td', {}, h('a', { href: '#' + p.ex }, p.buyer)),
        h('td', {}, numIn(p, 'qty', p.buyer + ' units per year')),
        h('td', {}, numIn(p, 'price', p.buyer + ' price per unit', 10)),
        h('td', {}, numIn(p, 'cpuh', p.buyer + ' compute hours per unit')),
        h('td', {}, numIn(p, 'field', p.buyer + ' field cost per unit', 10)),
        h('td', { class: 'num' }, fmtMoney(r)),
        h('td', { class: 'num' }, fmtMoney(r - v))));
    }
    const contrib = rev - varc;
    const unitContribution = units > 0 ? contrib / units : 0;
    const be = assume.fixed === 0 ? 0 : unitContribution > 0 ? assume.fixed / unitContribution : null;
    totals.replaceChildren(
      tile('Revenue per year', fmtMoney(rev), 'quantity × price'),
      tile('Variable cost', fmtMoney(varc), 'compute + storage + field'),
      tile('Gross contribution', fmtMoney(contrib), '', contrib >= 0 ? 'good' : 'bad'),
      tile('Margin', rev > 0 ? fmtPct(contrib / rev) : 'n/a', rev > 0 ? '' : 'no revenue'),
      tile('After fixed cost', fmtMoney(contrib - assume.fixed), `fixed ${fmtMoney(assume.fixed)}`, contrib - assume.fixed >= 0 ? 'good' : 'bad'),
      tile('Compute sold', fmt(cpu, 0) + ' CPU-h', 'allocation, not installed capacity'),
      tile('Revenue per compute-hour', cpu > 0 ? fmtMoney(rev / cpu, 2) : '—', 'value, not volume'),
      tile('Break-even (mix as entered)', be === null ? 'never' : fmt(be, 0) + ' units', 'at the average unit contribution'));
    desk._rows = rows;
  }
  const aIn = (key, label, step) => h('label', { class: 'small' }, label + ' ', numIn(assume, key, label, step));
  main.replaceChildren(h('div', { class: 'wrap page desk' },
    h('h1', {}, 'Who pays'),
    h('p', { class: 'lede' }, 'Businesses buy better decisions. A data-center partner sells the computing behind them as a managed service. Every figure on this page is hypothetical and editable.'),
    h('div', { class: 'cards' }, PRODUCTS.map((p) => h('div', { class: 'card' },
      h('span', { class: 'tagline' }, 'Buyer'), h('h3', {}, p.buyer),
      h('dl', {}, h('dt', {}, 'Pays for'), h('dd', {}, p.pays), h('dt', {}, 'Recurring'), h('dd', {}, p.recurring), h('dt', {}, 'Shared benefit'), h('dd', {}, p.benefit + ' — once validated and permitted')),
      h('p', {}, h('a', { href: '#' + p.ex }, 'See it in ' + p.ex.toUpperCase() + ' →'))))),
    h('p', {}, h('a', { class: 'btn primary', href: '#opportunity' }, 'Compare Cambodian data acquisition and pilot economics →')),
    h('h2', {}, 'Revenue sandbox'),
    h('div', { class: 'btnrow' }, aIn('cpuCost', 'Compute cost US$/CPU-h', 0.01), aIn('storage', 'Storage per unit US$', 1), aIn('fixed', 'Fixed cost per year US$', 1000),
      button('Zero every price', () => {
        state.forEach((p) => (p.price = 0));
        recompute();
      }, { kind: 'small' })),
    h('div', { class: 'table-wrap sandbox' }, h('table', { class: 'dtable' },
      h('thead', {}, h('tr', {}, ['Buyer', 'Units/yr', 'Price/unit US$', 'CPU-h/unit', 'Field US$/unit', 'Revenue', 'Contribution'].map((c) => h('th', { scope: 'col' }, c)))), tbody)),
    totals,
    h('div', { class: 'btnrow' }, button('Export the sandbox as CSV', () => exportPanel(exportOut, { filename: 'arun-revenue-sandbox.csv', mime: 'text/csv', text: toCSV(['buyer', 'units_per_year', 'price_usd', 'cpu_hours_per_unit', 'field_usd_per_unit', 'revenue_usd', 'variable_usd', 'contribution_usd'], desk._rows || []) }), { kind: 'small' })),
    exportOut,
    h('p', { class: 'small muted' }, 'Transaction value is not revenue to any one party. Compute sold is not installed capacity. Units are not unique buyers. Public benefit is listed apart from sales and is claimed only where approved measurements enter a shared aggregate and an independent check confirms the effect.'),
    h('h2', {}, 'Local partners'),
    h('p', {}, 'A map and listings site in the region could carry finished, authorised reports to buyers; a field-services company could do surveys, sensor installs and checks through consenting partners. The buyer’s desk (E07) drafts one example task. Nothing is booked, billed or dispatched from here, and no partner agreement exists.'),
    h('p', {}, h('a', { href: '#e07', class: 'btn primary' }, 'Open the buyer’s desk (E07)'), ' ', h('a', { href: '#e19', class: 'btn' }, 'Compute economics (E19)'))));
  recompute();
  return { destroy() {} };
}
