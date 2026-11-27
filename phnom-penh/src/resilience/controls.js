// Control descriptors per experiment. Labels come from words.js (c_<key>, c_<key>_<exp>).
const KINDS = ['none', 'scattered', 'single', 'daily'];
const sel = (k, opts, extra = {}) => ({ k, type: 'select', opts, ...extra });
const rng = (k, min, max, step, unit, extra = {}) => ({ k, type: 'range', min, max, step, unit, ...extra });

const logger = [
  sel('interval', [1, 5, 15, 30, 60, 120, 240], { unit: 'u_min' }),
  sel('linkKind', KINDS, { kinds: true }),
  rng('linkLen', 10, 1440, 10, 'u_min'),
  rng('battery', 100, 3000, 50, 'u_mah'),
];

export const CONTROLS = {
  water: [rng('thr', 5, 60, 1, '%', { label: 'c_thr_water' }), rng('thr2', 30, 90, 1, '', { label: 'c_thr2_water' }), rng('verifiedEvery', 6, 72, 6, 'u_h', { label: 'c_verified' }), ...logger, { k: 'sf', type: 'toggle' }, { k: 'localAlert', type: 'toggle', label: 'c_local' }],
  cold: [rng('thr', 5, 12, 0.5, '°C', { label: 'c_thr_cold' }), sel('cutKind', KINDS, { kinds: true, label: 'c_cutKind' }), rng('cutLen', 10, 360, 10, 'u_min', { label: 'c_cutLen' }), ...logger, { k: 'sf', type: 'toggle' }, { k: 'localAlert', type: 'toggle', label: 'c_local' }],
  power: [rng('thr', 20, 70, 1, '', { label: 'c_thr_power' }), sel('outKind', KINDS, { kinds: true, label: 'c_outKind' }), rng('outLen', 10, 360, 10, 'u_min', { label: 'c_outLen' }), ...logger, { k: 'sf', type: 'toggle' }, { k: 'localAlert', type: 'toggle', label: 'c_local' }],
  env: [rng('thr', 28, 40, 0.5, '°C', { label: 'c_thr_env' }), rng('thr2', 60, 200, 5, '', { label: 'c_thr2_env' }), ...logger, { k: 'sf', type: 'toggle' }, { k: 'localAlert', type: 'toggle', label: 'c_local' }],
  conn: [rng('thr', 5, 60, 1, '%', { label: 'c_thr_conn' }), sel('mode', ['local', 'direct', 'sf'], { modes: true, label: 'c_mode' }), rng('pickupDays', 1, 7, 1, 'u_d', { label: 'c_pickup' }), ...logger, { k: 'localAlert', type: 'toggle', label: 'c_local' }],
};
export const ASSUME_FIELDS = [
  ['sleepMA', 'a_sleep', 0.001, 'f3'], ['mAhSample', 'a_sample', 0.0005, 'f4'], ['mAhMsg', 'a_msg', 0.005, 'f3'],
  ['costMsg', 'a_cmsg', 0.0005, 'f4'], ['costVisit', 'a_cvisit', 0.5, 'f1'], ['costSwap', 'a_cswap', 0.5, 'f1'],
];
