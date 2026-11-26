// Trust: how the minimum-knowledge design is meant to work, what this demo does today, and live checks.
import { h, fmt } from '../core/ui.js';

const BOUNDARIES = [
  ['Browser demo', 'Fictional fixtures only. No sign-in. Every number is computed in this tab. Saving or exporting happens only when you press a button.', 'Built'],
  ['Public science inputs', 'An allowlist of providers and products, each with its licence, version, checksum and provenance. No arbitrary URLs or executable data. Coarse resolution for any sensitive geography.', 'Interface built, real adapters off'],
  ['Partner data at the source', 'Raw records stay with the partner. A fixed, reviewed query runs on their side, with one bounded contribution per person and coarse bins. Only approved totals leave, with privacy noise where meaningful. No free-form queries.', 'Shown in E05 with fictional people'],
  ['Compute', 'Isolated workers, signed and versioned jobs, least-privilege accounts, encryption, an egress allowlist, scratch wiped after each job. Confidential computing only on hardware that can attest; attestation shows which code ran, not whether an output is right.', 'Proposal, not built'],
  ['What leaves', 'A schema allowlist, approved regions and precision, a privacy ledger per underlying dataset that reserves and commits atomically and survives restarts, duplicates answered without spending twice, refusals by fixed public rules.', 'Ledger shown in E05; production ledger not built'],
  ['Retention and deletion', 'A minimum retention per data class, expiry for scratch, caches and backups, audit records of jobs without payloads, customer data stored apart from the public baseline and left out of training by default.', 'Proposal, not built'],
];

const THREATS = [
  ['Someone reads the page files', 'The bundle contains code, fonts, map outlines and fictional seeds. Exports are plain text you can read before saving.', 'Browser test scans the built file for keys and tokens'],
  ['Repeated queries to subtract answers', 'E05 refuses groupings finer than district and stops when the budget is spent; repeats get the stored answer.', 'Kernel tests: budget, duplicates, two at once'],
  ['Another customer’s data', 'Not applicable in the demo: one visitor at a time, nothing stored on a server. Production needs permission checks on every storage call and endpoint.', 'Production test plan in TEST-REPORT'],
  ['An operator misuses access', 'Not applicable in the demo. Production: no key release without attestation, independent audit of job identity and output policy.', 'Proposal'],
  ['A bad file or link', 'Imports accept only scenario or run-record JSON under 200 KB, checked field by field. Spreadsheet exports neutralise cells that start like formulas. No outside links are fetched.', 'Kernel and browser tests'],
  ['Pressure to change the purpose', 'Open item for a partner agreement: restrictions on persecution, identity discovery and exclusion; independent review before sensitive places or new datasets; suspension of a feature whose guard fails.', 'To be set in an agreement'],
];

export function trust(main) {
  const live = h('div', { class: 'livefacts' });
  const measure = () => {
    const res = performance.getEntriesByType('resource').filter((e) => !/^(data|blob):/.test(e.name));
    let keys = [];
    try {
      keys = Object.keys(localStorage).filter((k) => k.startsWith('arun.'));
    } catch {}
    const cookies = (() => {
      try {
        return document.cookie ? document.cookie.split(';').length : 0;
      } catch {
        return 0;
      }
    })();
    const tile = (label, value, sub) => h('div', { class: 'metric' }, h('span', { class: 'ml' }, label), h('span', { class: 'mv' }, value), h('span', { class: 'ms' }, sub));
    live.replaceChildren(
      tile('Requests to other servers since this page opened', String(res.length), 'counted by your browser just now'),
      tile('Cookies', String(cookies), 'on this page'),
      tile('Saved in this browser', String(keys.length), keys.length ? keys.join(', ') : 'nothing saved'),
      tile('Where the maths runs', typeof Worker !== 'undefined' ? 'this device' : 'this tab', `${navigator.hardwareConcurrency || '?'} logical cores`));
  };
  main.replaceChildren(h('div', { class: 'wrap page trust' },
    h('h1', {}, 'Minimum knowledge'),
    h('p', { class: 'lede' }, 'Collect the least data that does the job. Raw records stay where they are. Coarse totals leave, against a budget. This page separates what the demo does today from what a production system would need.'),
    h('h2', {}, 'Checked live in your browser'),
    live,
    h('p', { class: 'small muted' }, 'These numbers are read from the browser each time the page opens. They describe this demo only. The demo is not a production privacy system.'),
    h('h2', {}, 'Six boundaries'),
    h('div', { class: 'flow' }, BOUNDARIES.map(([t, d, s]) => h('div', { class: 'card' }, h('h3', {}, t), h('p', { class: 'small' }, d), h('span', { class: 'pill ' + (s === 'Built' ? 'ok' : s.startsWith('Proposal') ? 'no' : 'part') }, s)))),
    h('h2', {}, 'Try it'),
    h('p', {}, h('a', { href: '#e05', class: 'btn primary' }, 'Open the privacy box (E05)'), ' ', h('a', { href: '#e16', class: 'btn' }, 'Signals from coarse totals (E16)')),
    h('h2', {}, 'Threats and what answers them'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'dtable' },
      h('thead', {}, h('tr', {}, ['Threat', 'In this demo', 'Checked by'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, THREATS.map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))))),
    h('h2', {}, 'What the exhibits take as input'),
    h('p', {}, 'Fictional regions, fictional assets and coarse totals. No exhibit takes a person, a household or a protected trait as input, and none issues alerts, routes or automatic decisions.'),
    h('p', { class: 'small muted' }, 'Proposed measures of benefit: data not collected, approved environmental observations contributed, forecast improvement checked against independent observations, services that stayed up in evaluated deployments, and cases with no benefit.')));
  measure();
  return { destroy() {} };
}
