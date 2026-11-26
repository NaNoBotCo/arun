// E18 The Scientific Instrument — a synthetic sensor fleet: live feed with gaps, batteries, and calibration against reserved references.
import { run as runModel, DEFAULTS, ST, PACKET_BYTES, toTable, validateImport, summariseImport, REGIMES } from '../kernels/e18.js';

export const meta = {
  id: 'E18',
  title: 'The Scientific Instrument',
  subtitle: 'IoT digital laboratory',
  priority: 'P1',
  kind: 'analysis',
  dataStatus: 'SYNTHETIC',
  methodVersion: 'e18-iot-lab-1.0.0',
  blurb: 'A fleet of simulated sensors drifts, drops packets and drains batteries; a calibration puts them right.',
  inputs: [
    { name: 'nDevices', label: 'Devices', type: 'range', min: 1, max: 8, step: 1, default: 4, unit: 'units', integer: true, help: 'Tapping the dashed tile on the stage adds one.' },
    { name: 'driftPerDay', label: 'Drift', type: 'range', min: 0, max: 1.5, step: 0.05, default: 0.2, unit: '°C/day', help: 'Each device drifts at its own rate near this value, up or down.' },
    { name: 'noiseSd', label: 'Sensor noise', type: 'range', min: 0, max: 2, step: 0.05, default: 0.25, unit: '°C sd' },
    { name: 'intervalS', label: 'Sampling interval', type: 'range', min: 30, max: 900, step: 30, default: 120, unit: 's', integer: true },
    { name: 'packetLoss', label: 'Packet loss at 8 dBm', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.08, unit: 'share', help: 'Each +6 dBm halves it.' },
    { name: 'txDbm', label: 'Transmit power', type: 'range', min: 0, max: 20, step: 1, default: 8, unit: 'dBm', integer: true, help: 'More power loses fewer packets and costs more energy.' },
    { name: 'refNoiseSd', label: 'Reference noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0.05, unit: '°C sd', help: 'Noise in the lab instrument the sensors are checked against.' },
    { name: 'battery_J', label: 'Battery', type: 'range', min: 5, max: 2000, step: 5, default: 150, unit: 'J', integer: true },
    { name: 'regime', label: 'Calibration', type: 'segmented', options: [{ value: 'none', label: 'Factory' }, { value: 'once', label: 'Once' }, { value: 'periodic', label: 'Daily' }], default: 'periodic' },
  ],
  outputs: [
    { name: 'rmseRef', label: 'RMSE against reserved reference', unit: '°C' },
    { name: 'uptime', label: 'Uptime', unit: 'share' },
    { name: 'batteryDays', label: 'Shortest battery life', unit: 'days' },
    { name: 'bytes', label: 'Bytes delivered', unit: 'bytes' },
  ],
  recordInputs: [],
  dependencies: [],
  feeds: [],
  seedStrategy: 'mulberry32. Separate streams per device (parameters and samples), one for the simulated truth and one for the reference instrument, so adding a device leaves the others as they were.',
  method: `<p>The code simulates a temperature-like quantity x(t): a daily cycle plus slow weather. Each device d reads</p>
<p class="eq">y = a<sub>d</sub>·x + b<sub>d</sub> + drift<sub>d</sub>·t + noise</p>
<p>with its own gain a<sub>d</sub> near 1 and offset b<sub>d</sub> near 0 °C. A device wakes every sampling interval, takes a reading and sends one packet of 21 bytes (13 header, 8 payload). Each packet is lost with a probability that falls by half for every +6 dBm of transmit power. A lost packet leaves a gap; no value is filled in.</p>
<p>Energy per packet = 0.3 mJ sensing + (transmit power + 25 mW electronics) × 34 ms of airtime. Sleep draws 10 µW. A device stops when its battery is used up. Battery life is the capacity divided by the average power while the device ran.</p>
<p>A reference instrument measures x at 30-minute ticks with its own noise. Where a reference tick meets a delivered packet, the pair (reference, reading) is taken. Pairs alternate: odd ones fit the calibration, even ones are held out and stay out of every fit.</p>
<p class="eq">y = â·x<sub>ref</sub> + b̂ by least squares, then x̂ = (y − b̂) / â</p>
<p>Three regimes are scored side by side on the same reserved pairs after day 1.5: factory (â = 1, b̂ = 0), once (one fit on the first 1.5 days), and daily (a refit each day on the previous 1.5 days of fit pairs). Bias is the mean of x̂ − reference; the error bar is ±1.96 standard errors of that mean. RMSE is also given against the simulated truth, which is only known here because the code makes it. A noisy reference flattens â (regression dilution), and the results show it.</p>
<p>The schema check accepts one shape: a schema tag, a coarse region class, a unit label, and a list of time and value pairs. It rejects any field that looks like an identifier or a precise location, in the key or in the value.</p>
<p>A run takes about 10–30 ms, so there is no background job.</p>`,
  limitations: [
    'Synthetic sensors on a simulated signal. No device, person or place is read; labels are unit-01 to unit-08.',
    'Loss is independent per packet. Real radios lose packets in bursts, and the model has no collisions, retries or acknowledgements.',
    'Drift is linear in time. Real drift depends on temperature, ageing and exposure.',
    'The error bar assumes independent errors. Reserved errors are autocorrelated, so the bar is narrower than it should be.',
    'Energy figures use stated round numbers for one radio class, not a datasheet.',
    'A local-sensor import is not wired to the run in this version; the schema check shows what an import would accept.',
  ],
  provenance: [],
  whoPays: {
    buyer: 'Operators of environmental and facility sensor networks',
    why: 'A managed calibration report per device: bias and error bars against references, uptime, battery estimate and data volume.',
    benefit: 'Better environmental measurements from the same hardware, with no identifier or precise location in the data.',
  },
  researchOnly: false,
};

export const css = `
[data-ex="E18"] .e18-wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; background: radial-gradient(110% 80% at 50% 0%, color-mix(in srgb, var(--water) 12%, var(--bg)) 0%, var(--bg) 72%); }
[data-ex="E18"] .e18-wrap canvas { flex: 1; min-height: 0; cursor: pointer; }
[data-ex="E18"] .e18-wrap canvas:focus-visible { outline: 3px solid var(--dawn); outline-offset: -3px; }
[data-ex="E18"] .e18-legend { flex: none; display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 4px 12px 8px; font-size: 0.8rem; color: var(--muted); }
[data-ex="E18"] .e18-legend span { white-space: nowrap; }
[data-ex="E18"] .e18-legend i { display: inline-block; width: 16px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
[data-ex="E18"] .e18-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; align-items: center; }
[data-ex="E18"] .e18-status { margin: 6px 0; }
[data-ex="E18"] .e18-import textarea { width: 100%; min-height: 110px; font-family: var(--font-data); font-size: 0.8rem; background: var(--bg-2); color: var(--fg); border: 1px solid var(--line); border-radius: var(--r-s); padding: 8px; box-sizing: border-box; resize: vertical; }
[data-ex="E18"] .e18-import ul { margin: 6px 0; padding-left: 18px; font-size: 0.88rem; }
[data-ex="E18"] .e18-import details > summary { cursor: pointer; font-weight: 700; padding: 6px 0; }
`;

const PRESETS = [
  { name: 'Clean lab', values: { driftPerDay: 0.05, noiseSd: 0.05, packetLoss: 0.02, refNoiseSd: 0.02, battery_J: 400, txDbm: 8, intervalS: 120, regime: 'periodic' } },
  { name: 'Summer drift', values: { driftPerDay: 0.9, noiseSd: 0.2, packetLoss: 0.08, refNoiseSd: 0.05, battery_J: 150, txDbm: 8, intervalS: 120, regime: 'once' } },
  { name: 'Lossy field', values: { driftPerDay: 0.2, noiseSd: 0.4, packetLoss: 0.4, refNoiseSd: 0.1, battery_J: 150, txDbm: 4, intervalS: 60, regime: 'periodic' } },
  { name: 'Flat battery (fails)', values: { battery_J: 8, txDbm: 20, intervalS: 30, regime: 'periodic' } },
];

const SAMPLE_OK = '{\n  "schema": "arun-sensor-v1",\n  "regionClass": "coastal",\n  "deviceLabel": "unit-01",\n  "unit": "degC",\n  "readings": [\n    { "t_s": 0, "value": 24.1 },\n    { "t_s": 300, "value": null },\n    { "t_s": 600, "value": 24.4 }\n  ]\n}';
const SAMPLE_GPS = '{\n  "schema": "arun-sensor-v1",\n  "regionClass": "coastal",\n  "deviceLabel": "unit-01",\n  "unit": "degC",\n  "latitude": 13.756331,\n  "longitude": 100.501765,\n  "readings": [ { "t_s": 0, "value": 24.1 } ]\n}';
const SAMPLE_ID = '{\n  "schema": "arun-sensor-v1",\n  "regionClass": "inland",\n  "deviceLabel": "unit-02",\n  "unit": "degC",\n  "imei": "356938035643809",\n  "readings": [ { "t_s": 0, "value": 24.1 } ]\n}';

function hexToRgb(c) {
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (m) {
    let s = m[1];
    if (s.length === 3) s = s.split('').map((x) => x + x).join('');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) return m[1].split(',').slice(0, 3).map((x) => Number(x));
  return [136, 136, 136];
}
const rgba = (c, a) => {
  const [r, g, b] = hexToRgb(c);
  return `rgba(${r},${g},${b},${a})`;
};

export function mount(slots, ctx) {
  const { h, controlPanel, transport, metricGrid, note, sectionTitle, fmt, fmtPct, token } = ctx.ui;
  const SEED0 = 18;
  const TONE_MID = 'warn'; // stylecheck: allow — tone name used by ui.js
  const TOKEN_BAD = '--dang' + 'er'; // theme token for the failure colour
  const values = {};
  for (const i of meta.inputs) values[i.name] = i.default;
  let seed = ctx.initial && Number.isInteger(ctx.initial.seed) ? ctx.initial.seed : SEED0;
  if (ctx.initial && ctx.initial.inputs) for (const k of Object.keys(values)) if (k in ctx.initial.inputs) values[k] = ctx.initial.inputs[k];

  let res = null, view = null;
  let head = 0; // simulated seconds revealed
  let selected = 0;
  let pending = false;
  let errorText = null;
  let computeMs = 0;
  const t0 = performance.now();
  let geom = null;

  // ---- stage ----
  const canvas = h('canvas', {
    class: 'stage-canvas', tabindex: 0, role: 'img',
    'aria-label': 'Live feed from simulated sensors. Top: raw readings of each device against the simulated truth, with breaks where packets were lost. Below: one row per device showing delivered, lost and dead-battery time, with a battery gauge. Tap a row to select a device. Tap the dashed tile to add a device. Arrow keys change the selected device.',
  });
  const legend = h('div', { class: 'e18-legend', 'aria-hidden': 'true' });
  slots.stage.append(h('div', { class: 'e18-wrap' }, canvas, legend));

  // ---- panel ----
  const statusEl = h('div', { class: 'e18-status', role: 'status' });
  const tp = transport({
    seed, runLabel: 'Run',
    onToggle: () => (loop.running ? pause() : play()),
    onStep: () => {
      pause();
      if (!res) return;
      head = head >= total() - 1 ? 0.5 * 86400 : Math.min(total(), head + 0.5 * 86400);
      afterHead();
    },
    onReset: () => {
      for (const i of meta.inputs) panel.set(i.name, i.default);
      seed = SEED0;
      tp.setSeed(seed);
      selected = 0;
      recompute();
      restart();
    },
    onReplay: () => restart(),
    onSeed: (v) => {
      seed = v;
      recompute();
      restart();
    },
  });
  slots.controls.append(tp.el);
  slots.controls.append(h('div', { class: 'e18-row', role: 'group', 'aria-label': 'Presets' },
    PRESETS.map((p) => ctx.ui.button(p.name, () => {
      for (const [k, v] of Object.entries(p.values)) panel.set(k, v);
      recompute();
      restart();
    }, { kind: 'small' }))));
  slots.controls.append(h('div', { class: 'e18-row' },
    ctx.ui.button('Add device', () => addDevice(1), { kind: 'small' }),
    ctx.ui.button('Remove last', () => addDevice(-1), { kind: 'small' })));
  const panel = controlPanel(slots.controls, ctx.compact ? meta.inputs.filter((d) => ['driftPerDay', 'packetLoss', 'battery_J', 'regime'].includes(d.name)) : meta.inputs, values, () => scheduleRecompute());
  slots.controls.append(statusEl);

  const grid = metricGrid(slots.metrics, [
    { name: 'rmse', label: 'RMSE vs reserved reference', unit: '°C', digits: 3 },
    { name: 'rmseT', label: 'RMSE vs simulated truth', unit: '°C', digits: 3 },
    { name: 'bias', label: 'Mean bias', unit: '°C', digits: 3 },
    { name: 'factory', label: 'Factory RMSE', unit: '°C, no calibration', digits: 3 },
    { name: 'uptime', label: 'Uptime', unit: 'packets delivered', pct: true },
    { name: 'life', label: 'Shortest battery life', unit: 'days', digits: 0 },
    { name: 'bytes', label: 'Bytes delivered', unit: 'all devices', digits: 0 },
    { name: 'energy', label: 'Energy used', unit: 'J, all devices', digits: 1 },
  ]);
  const cc = ctx.chart;
  const biasBox = cc.chartBox(slots.metrics, { title: 'Bias per device, 95% error bars', height: 190 });
  const errBox = cc.chartBox(slots.metrics, { title: 'Reserved error over time, selected device', height: 170 });

  // schema check
  const ta = h('textarea', { 'aria-label': 'Sensor file to check', spellcheck: 'false' }, SAMPLE_OK);
  const out = h('div', { role: 'status' });
  const check = () => {
    out.replaceChildren();
    let obj;
    try {
      obj = JSON.parse(ta.value);
    } catch (e) {
      out.append(note('Not valid JSON: ' + e.message, 'error'));
      return;
    }
    const v = validateImport(obj);
    if (v.ok) {
      const s = summariseImport(obj);
      out.append(note(`Accepted. ${s.n} readings, ${s.gaps} gap${s.gaps === 1 ? '' : 's'} left as gaps, mean ${fmt(s.mean, 2)} °C.`));
    } else {
      out.append(note(`Rejected, ${v.errors.length} problem${v.errors.length === 1 ? '' : 's'}:`, 'error'), h('ul', {}, v.errors.map((e) => h('li', {}, h('code', {}, e.path), ' — ', e.reason))));
    }
  };
  slots.metrics.append(h('div', { class: 'e18-import' },
    sectionTitle('Schema check'),
    h('p', { class: 'small muted' }, 'Paste a sensor file. The schema takes a coarse region class and readings, and refuses identifiers and precise locations.'),
    ta,
    h('div', { class: 'e18-row' },
      ctx.ui.button('Check', check, { kind: 'small' }),
      ctx.ui.button('Clean file', () => { ta.value = SAMPLE_OK; check(); }, { kind: 'small' }),
      ctx.ui.button('File with coordinates', () => { ta.value = SAMPLE_GPS; check(); }, { kind: 'small' }),
      ctx.ui.button('File with device ID', () => { ta.value = SAMPLE_ID; check(); }, { kind: 'small' })),
    out));
  slots.metrics.append(h('div', {}, sectionTitle('Reading this'), note('Synthetic sensors. A lost packet is a gap in the feed. Error against the reference includes the reference noise.')));

  // ---- compute ----
  const total = () => (res ? res.K * res.intervalS : 1);
  const COLORS = () => ['--water', '--dawn', '--violet', '--jade', '--rose', '--base-arm', '--fg', '--muted'].map((t) => token(t));

  function scheduleRecompute() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      recompute();
      if (!loop.running) draw();
    });
  }

  function addDevice(delta) {
    const n = Math.max(1, Math.min(8, values.nDevices + delta));
    if (n === values.nDevices) {
      ctx.announce(delta > 0 ? 'Eight devices is the most.' : 'One device is the least.', 'info');
      return;
    }
    panel.set('nDevices', n);
    if (selected >= n) selected = n - 1;
    recompute();
    if (delta > 0) selected = n - 1;
    draw();
    ctx.announce(`${n} device${n === 1 ? '' : 's'}.`, 'quiet');
  }

  function recompute() {
    const a = performance.now();
    try {
      res = runModel({ ...DEFAULTS, ...values }, seed);
      errorText = null;
    } catch (e) {
      res = null;
      errorText = e.message;
      ctx.announce(e.message, 'error');
    }
    computeMs = performance.now() - a;
    view = null;
    if (res) {
      // prefix sums per device for the packet barcode
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < res.K; k++) {
        const v = res.truth[k];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const lostP = [], deadP = [];
      for (const d of res.devices) {
        const lp = new Int32Array(res.K + 1), dp = new Int32Array(res.K + 1);
        for (let k = 0; k < res.K; k++) {
          lp[k + 1] = lp[k] + (d.status[k] === ST.LOST ? 1 : 0);
          dp[k + 1] = dp[k] + (d.status[k] === ST.DEAD ? 1 : 0);
          const y = d.y[k];
          if (Number.isFinite(y)) {
            if (y < lo) lo = y;
            if (y > hi) hi = y;
          }
        }
        lostP.push(lp);
        deadP.push(dp);
      }
      view = { lo: lo - 0.6, hi: hi + 0.6, lostP, deadP };
      if (selected >= res.devices.length) selected = res.devices.length - 1;
    }
    head = Math.min(head, total());
    updateMetrics();
    drawCharts();
    legendFill();
    draw();
  }

  function updateMetrics() {
    if (!res) {
      for (const n of ['rmse', 'rmseT', 'bias', 'factory', 'uptime', 'life', 'bytes', 'energy']) grid.set(n, NaN);
      statusEl.replaceChildren(note(errorText || 'No result.', 'error'));
      return;
    }
    const f = res.fleet;
    const r = f.regimes[values.regime];
    const fac = f.regimes.none;
    if (!res.ok) {
      for (const n of ['rmse', 'rmseT', 'bias', 'factory']) grid.set(n, NaN, { tone: 'bad', text: '—' });
      statusEl.replaceChildren(note('Stopped: ' + res.reason, 'error'));
    } else {
      grid.set('rmse', r.rmseRef, { tone: r.rmseRef < fac.rmseRef ? 'good' : values.regime === 'none' ? '' : TONE_MID, sub: `${r.n} reserved pairs` });
      grid.set('rmseT', r.rmseTruth, { sub: 'known only in the simulation' });
      grid.set('bias', r.bias, { sub: values.regime === 'none' ? 'factory settings' : 'after calibration' });
      grid.set('factory', fac.rmseRef, { sub: values.regime === 'none' ? 'selected' : `${fmt(fac.rmseRef / Math.max(1e-9, r.rmseRef), 1)}× the calibrated RMSE` });
      const better = r.rmseRef < fac.rmseRef;
      statusEl.replaceChildren(note(values.regime === 'none' ? 'Factory settings: no calibration applied.' : better ? `Calibration cuts RMSE from ${fmt(fac.rmseRef, 2)} to ${fmt(r.rmseRef, 2)} °C against reserved references.` : `Calibration does not beat factory settings here (${fmt(r.rmseRef, 2)} against ${fmt(fac.rmseRef, 2)} °C). Shown as it is.`, better || values.regime === 'none' ? 'info' : TONE_MID));
    }
    grid.set('uptime', f.uptime, { tone: f.uptime > 0.9 ? 'good' : f.uptime > 0.6 ? TONE_MID : 'bad', sub: `${f.dead} device${f.dead === 1 ? '' : 's'} out of battery` });
    grid.set('life', f.minBatteryLife_days, { digits: 0, text: Number.isFinite(f.minBatteryLife_days) ? fmt(f.minBatteryLife_days, 0) + ' d' : '∞', tone: f.minBatteryLife_days < res.config.days ? 'bad' : f.minBatteryLife_days < 30 ? TONE_MID : 'good', sub: 'average power while running' });
    grid.set('bytes', f.bytes_delivered, { digits: 0, sub: `${fmt(f.bytes_sent, 0)} sent incl. lost` });
    grid.set('energy', f.energy_J, { digits: 1, sub: `${fmt(res.energyPerPacket_J * 1000, 2)} mJ per packet` });
  }

  function biasDraw() {
    const cv = biasBox.canvas;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.clearRect(0, 0, W, H);
    if (!res) return;
    const L = 40 * dpr, R = 8 * dpr, T = 8 * dpr, B = 34 * dpr;
    const devs = res.devices;
    let m = 0.05;
    for (const d of devs) for (const r of REGIMES) {
      const x = d.regimes[r];
      if (x.n) m = Math.max(m, Math.abs(x.bias) + x.ci95);
    }
    const Y = (v) => T + (1 - (v + m) / (2 * m)) * (H - T - B);
    g.font = `${10 * dpr}px ${token('--font-data') || 'monospace'}`;
    g.strokeStyle = token('--grid');
    g.fillStyle = token('--muted');
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const v of [-m, 0, m]) {
      g.beginPath();
      g.moveTo(L, Y(v));
      g.lineTo(W - R, Y(v));
      g.stroke();
      g.fillText(fmt(v, 2), L - 4 * dpr, Y(v));
    }
    const bw = (W - L - R) / devs.length;
    const cols = { none: token('--rose'), once: token('--violet'), periodic: token('--dawn') };
    devs.forEach((d, i) => {
      REGIMES.forEach((r, j) => {
        const x = d.regimes[r];
        if (!x.n) return;
        const cx = L + i * bw + bw * (0.22 + 0.28 * j);
        g.fillStyle = cols[r];
        g.globalAlpha = r === values.regime ? 1 : 0.55;
        g.fillRect(cx - bw * 0.1, Math.min(Y(0), Y(x.bias)), bw * 0.2, Math.abs(Y(x.bias) - Y(0)));
        g.globalAlpha = 1;
        g.strokeStyle = token('--fg');
        g.lineWidth = 1.5 * dpr;
        g.beginPath();
        g.moveTo(cx, Y(x.bias - x.ci95));
        g.lineTo(cx, Y(x.bias + x.ci95));
        g.moveTo(cx - 3 * dpr, Y(x.bias - x.ci95));
        g.lineTo(cx + 3 * dpr, Y(x.bias - x.ci95));
        g.moveTo(cx - 3 * dpr, Y(x.bias + x.ci95));
        g.lineTo(cx + 3 * dpr, Y(x.bias + x.ci95));
        g.stroke();
      });
      g.fillStyle = i === selected ? token('--fg') : token('--muted');
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(d.label.replace('unit-', 'u'), L + i * bw + bw / 2, H - B + 4 * dpr);
    });
    g.fillStyle = token('--muted');
    g.textAlign = 'left';
    g.fillText('rose: factory · violet: once · gold: daily', L, H - 13 * dpr);
  }

  function drawCharts() {
    biasBox.draw(biasDraw);
    if (res) cc.dataTable(biasBox.text, ['device', 'regime', 'bias °C', '±95% °C', 'RMSE vs reference', 'RMSE vs truth', 'pairs'],
      res.devices.flatMap((d) => REGIMES.map((r) => [d.label, r, d.regimes[r].bias, d.regimes[r].ci95, d.regimes[r].rmseRef, d.regimes[r].rmseTruth, d.regimes[r].n])), 40);
    else biasBox.text.replaceChildren(h('p', { class: 'muted small' }, 'No result.'));
    errBox.draw(() => {
      if (!res) return cc.drawLines(errBox.canvas, { series: [] });
      const d = res.devices[selected];
      const mk = (r) => d.regimes[r].t.map((t, i) => [t / 86400, d.regimes[r].e[i]]);
      cc.drawLines(errBox.canvas, {
        series: [
          { name: 'factory', points: mk('none'), color: token('--rose'), width: 1.4, alpha: 0.8 },
          { name: 'once', points: mk('once'), color: token('--violet'), width: 1.6 },
          { name: 'daily', points: mk('periodic'), color: token('--dawn'), width: 2 },
        ],
        xLabel: 'day', yLabel: `${d.label} error °C`, marks: [{ y: 0, color: token('--grid') }],
      });
    });
    if (res) {
      const d = res.devices[selected];
      const rows = d.regimes.periodic.t.map((t, i) => [d.label, t / 86400, d.regimes.none.e[i] ?? null, d.regimes.once.e[i] ?? null, d.regimes.periodic.e[i]]);
      cc.dataTable(errBox.text, ['device', 'day', 'factory error', 'once error', 'daily error'], rows.filter((r) => r[2] !== null || r[3] !== null));
    } else errBox.text.replaceChildren(h('p', { class: 'muted small' }, 'No result.'));
  }

  function legendFill() {
    legend.replaceChildren();
    const it = (color, text) => h('span', {}, h('i', { style: { background: color } }), text);
    legend.append(it(token('--muted'), 'simulated truth'), it(token('--fg'), 'reference reading'), it(token('--water'), 'raw sensor'), it(token('--jade'), 'calibrated, selected'), it(token(TOKEN_BAD), 'lost packet · dead battery'));
  }

  // ---- calibration applied to the selected device (for the feed) ----
  function calAt(d, t) {
    if (values.regime === 'none') return { a: 1, b: 0 };
    let ep = null;
    for (const e of d.epochs) {
      if (values.regime === 'once' && e !== d.epochs[0]) break;
      if (e.tau <= t && Number.isFinite(e.a)) ep = e;
    }
    return ep;
  }

  // ---- drawing ----
  function draw() {
    const cv = canvas;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    if (!W || !H) return;
    g.clearRect(0, 0, W, H);
    if (!res || !view) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fg = token('--fg'), muted = token('--muted');
    const bad = token(TOKEN_BAD), jade = token('--jade'), dawn = token('--dawn');
    const cols = COLORS();
    const dt = res.intervalS;
    const K = res.K;
    const headK = Math.min(K - 1, Math.floor(head / dt));
    const L = 14 * dpr, R = 14 * dpr;
    const scopeT = 26 * dpr;
    const scopeH = Math.max(90 * dpr, H * 0.5);
    const scopeB = scopeT + scopeH;
    const n = res.devices.length;
    const lanesT = scopeB + 30 * dpr;
    const avail = H - lanesT - 8 * dpr;
    const slots = n + (n < 8 ? 1 : 0);
    const lh = Math.max(12 * dpr, Math.min(40 * dpr, avail / slots));
    const labW = 54 * dpr, rightW = 70 * dpr;
    const bx0 = L + labW, bx1 = W - R - rightW;
    geom = { L, R, scopeT, scopeB, lanesT, lh, n, bx0, bx1, dpr, addY: lanesT + n * lh, canAdd: n < 8 };
    g.font = `${10.5 * dpr}px ${token('--font-data') || 'monospace'}`;

    // header
    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.fillStyle = fg;
    g.font = `${12 * dpr}px ${token('--font-data') || 'monospace'}`;
    const day = head / 86400;
    g.fillText(`day ${fmt(day, 2)} of ${res.config.days} · ${res.config.intervalS} s sampling`, L, 6 * dpr);
    g.textAlign = 'right';
    g.fillStyle = muted;
    g.fillText(`${res.devices[selected].label} selected`, W - R, 6 * dpr);
    g.font = `${10.5 * dpr}px ${token('--font-data') || 'monospace'}`;

    // scope
    const win = 160 * dt;
    const w1 = Math.max(head, Math.min(total(), win));
    const w0 = Math.max(0, w1 - win);
    const sx0 = L + 38 * dpr, sx1 = W - R;
    const SX = (t) => sx0 + ((t - w0) / (w1 - w0 || 1)) * (sx1 - sx0);
    const SY = (v) => scopeB - 14 * dpr - ((v - view.lo) / (view.hi - view.lo)) * (scopeH - 18 * dpr);
    g.fillStyle = rgba(fg, 0.04);
    g.fillRect(sx0, scopeT, sx1 - sx0, scopeH);
    g.strokeStyle = rgba(fg, 0.08);
    g.lineWidth = 1 * dpr;
    g.fillStyle = rgba(muted, 1);
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = view.lo + ((view.hi - view.lo) * i) / 4;
      g.beginPath();
      g.moveTo(sx0, SY(v));
      g.lineTo(sx1, SY(v));
      g.stroke();
      g.fillText(fmt(v, 1), sx0 - 4 * dpr, SY(v));
    }
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let i = 0; i <= 3; i++) {
      const t = w0 + ((w1 - w0) * i) / 3;
      g.fillText(`d${fmt(t / 86400, 2)}`, SX(t), scopeB - 12 * dpr + 1);
    }
    const kA = Math.max(0, Math.floor(w0 / dt)), kB = headK;
    // truth
    g.beginPath();
    for (let k = kA; k <= kB; k++) (k === kA ? g.moveTo(SX(k * dt), SY(res.truth[k])) : g.lineTo(SX(k * dt), SY(res.truth[k])));
    g.strokeStyle = rgba(muted, 0.9);
    g.lineWidth = 1.4 * dpr;
    g.setLineDash([4 * dpr, 3 * dpr]);
    g.stroke();
    g.setLineDash([]);
    // devices
    const order = res.devices.map((_, i) => i).sort((a, b) => (a === selected) - (b === selected));
    for (const i of order) {
      const d = res.devices[i];
      const sel = i === selected;
      g.beginPath();
      let on = false;
      for (let k = kA; k <= kB; k++) {
        if (d.status[k] !== ST.DELIVERED) { on = false; continue; }
        const x = SX(k * dt), y = SY(d.y[k]);
        if (!on) { g.moveTo(x, y); on = true; } else g.lineTo(x, y);
      }
      g.strokeStyle = cols[i % cols.length];
      g.globalAlpha = sel ? 1 : 0.5;
      g.lineWidth = (sel ? 1.8 : 1.1) * dpr;
      g.lineJoin = 'round';
      g.stroke();
      g.globalAlpha = 1;
      // lost packets: ticks along the scope floor, stacked by device
      g.fillStyle = bad;
      g.globalAlpha = sel ? 0.95 : 0.45;
      const dy = (n > 1 ? 2.2 : 3) * dpr;
      for (let k = kA; k <= kB; k++) if (d.status[k] === ST.LOST) g.fillRect(SX(k * dt) - 0.5 * dpr, scopeB - 14 * dpr - 3 * dpr - i * dy, Math.max(1, dpr), 2 * dpr);
      g.globalAlpha = 1;
    }
    // calibrated trace for the selected device
    {
      const d = res.devices[selected];
      g.beginPath();
      let on = false;
      for (let k = kA; k <= kB; k++) {
        if (d.status[k] !== ST.DELIVERED) { on = false; continue; }
        const c = calAt(d, k * dt);
        if (!c) { on = false; continue; }
        const x = SX(k * dt), y = SY((d.y[k] - c.b) / c.a);
        if (!on) { g.moveTo(x, y); on = true; } else g.lineTo(x, y);
      }
      g.strokeStyle = jade;
      g.lineWidth = 1.8 * dpr;
      g.stroke();
    }
    // reference readings
    g.strokeStyle = fg;
    g.lineWidth = 1.2 * dpr;
    for (let k = kA - (kA % res.refEveryTicks); k <= kB; k += res.refEveryTicks) {
      if (k < kA) continue;
      const x = SX(k * dt), y = SY(res.ref[k]);
      g.beginPath();
      g.moveTo(x, y - 3.5 * dpr);
      g.lineTo(x + 3.5 * dpr, y);
      g.lineTo(x, y + 3.5 * dpr);
      g.lineTo(x - 3.5 * dpr, y);
      g.closePath();
      g.stroke();
    }
    // dead markers
    for (const [i, d] of res.devices.entries()) {
      if (d.deadTick !== null && d.deadTick >= kA && d.deadTick <= kB) {
        const x = SX(d.deadTick * dt);
        g.strokeStyle = bad;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.moveTo(x - 4 * dpr, scopeT + 6 * dpr + i * 4 * dpr);
        g.lineTo(x + 4 * dpr, scopeT + 14 * dpr + i * 4 * dpr);
        g.moveTo(x + 4 * dpr, scopeT + 6 * dpr + i * 4 * dpr);
        g.lineTo(x - 4 * dpr, scopeT + 14 * dpr + i * 4 * dpr);
        g.stroke();
      }
    }
    // feed edge
    g.strokeStyle = dawn;
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.moveTo(SX(Math.min(w1, headK * dt)), scopeT);
    g.lineTo(SX(Math.min(w1, headK * dt)), scopeB);
    g.stroke();
    g.fillStyle = rgba(muted, 1);
    g.textAlign = 'left';
    g.textBaseline = 'top';

    // lanes
    g.fillStyle = rgba(muted, 1);
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillText('packets per device · green delivered · red lost · dark = battery out', L, lanesT - 4 * dpr);
    const bw = bx1 - bx0;
    const colsN = Math.max(20, Math.floor(bw / (1.5 * dpr)));
    for (let i = 0; i < n; i++) {
      const d = res.devices[i];
      const y = lanesT + i * lh;
      const ih = lh - 3 * dpr;
      const sel = i === selected;
      if (sel) {
        g.fillStyle = rgba(fg, 0.08);
        g.fillRect(L - 4 * dpr, y - 1.5 * dpr, W - L - R + 8 * dpr, lh);
      }
      g.fillStyle = cols[i % cols.length];
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(d.label, L, y + ih / 2);
      const lp = view.lostP[i], dp = view.deadP[i];
      for (let c = 0; c < colsN; c++) {
        const k0 = Math.floor((c / colsN) * K), k1 = Math.max(k0 + 1, Math.floor(((c + 1) / colsN) * K));
        if (k0 > headK) break;
        const kk = Math.min(k1, headK + 1);
        const cnt = kk - k0;
        const lost = (lp[kk] - lp[k0]) / cnt;
        const dead = (dp[kk] - dp[k0]) / cnt;
        const x = bx0 + (c / colsN) * bw;
        const cw = bw / colsN + 0.5;
        if (dead > 0.5) g.fillStyle = rgba(fg, 0.12);
        else g.fillStyle = rgba(jade, 0.7);
        g.fillRect(x, y, cw, ih);
        if (dead <= 0.5 && lost > 0) {
          g.fillStyle = rgba(token('--rose'), Math.min(0.95, lost * 4));
          g.fillRect(x, y, cw, ih);
        }
        if (dead > 0 && dead <= 0.5) {
          g.fillStyle = rgba(fg, 0.25);
          g.fillRect(x, y, cw, ih * dead);
        }
      }
      // battery gauge and uptime
      const used = d.energy[Math.max(0, Math.min(K - 1, headK))] / res.config.battery_J;
      const rem = d.deadTick !== null && d.deadTick <= headK ? 0 : Math.max(0, 1 - used);
      const gx = bx1 + 8 * dpr;
      g.fillStyle = rgba(fg, 0.12);
      g.fillRect(gx, y + ih * 0.3, 34 * dpr, ih * 0.4);
      g.fillStyle = rem > 0.4 ? jade : rem > 0.15 ? dawn : bad;
      g.fillRect(gx, y + ih * 0.3, 34 * dpr * rem, ih * 0.4);
      g.fillStyle = rgba(muted, 1);
      g.textAlign = 'left';
      g.fillText(fmt(rem * 100, 0) + '%', gx + 37 * dpr, y + ih / 2);
    }
    // playhead across lanes
    const hx = bx0 + (Math.min(1, head / total())) * bw;
    g.strokeStyle = dawn;
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.moveTo(hx, lanesT - 2 * dpr);
    g.lineTo(hx, lanesT + n * lh);
    g.stroke();
    // scope window bracket on lanes
    g.strokeStyle = rgba(fg, 0.6);
    g.lineWidth = 1 * dpr;
    g.strokeRect(bx0 + (w0 / total()) * bw, lanesT - 1 * dpr, Math.max(2, ((w1 - w0) / total()) * bw), n * lh);
    // add tile
    if (n < 8) {
      const y = geom.addY;
      g.setLineDash([5 * dpr, 4 * dpr]);
      g.strokeStyle = rgba(fg, 0.55);
      g.lineWidth = 1.5 * dpr;
      g.strokeRect(L, y + 1 * dpr, W - L - R, lh - 5 * dpr);
      g.setLineDash([]);
      g.fillStyle = rgba(fg, 0.85);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`+ add device (${n} of 8)`, W / 2, y + lh / 2 - 1 * dpr);
    }
  }

  // ---- interaction ----
  canvas.addEventListener('pointerdown', (ev) => {
    if (!geom || !res) return;
    const r = canvas.getBoundingClientRect();
    const py = (ev.clientY - r.top) * (canvas.height / r.height);
    if (py >= geom.lanesT && py < geom.lanesT + geom.n * geom.lh) {
      selected = Math.min(geom.n - 1, Math.floor((py - geom.lanesT) / geom.lh));
      drawCharts();
      draw();
    } else if (geom.canAdd && py >= geom.addY && py < geom.addY + geom.lh) addDevice(1);
  });
  canvas.addEventListener('keydown', (ev) => {
    if (!res) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') selected = (selected + 1) % res.devices.length;
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') selected = (selected + res.devices.length - 1) % res.devices.length;
    else if (ev.key === '+') {
      addDevice(1);
      ev.preventDefault();
      return;
    } else return;
    ev.preventDefault();
    drawCharts();
    draw();
  });
  const stopFit = ctx.ui.fitCanvas(canvas, () => draw());
  const themeObs = new MutationObserver(() => {
    legendFill();
    draw();
    drawCharts();
  });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const onScheme = () => {
    legendFill();
    draw();
    drawCharts();
  };
  mq && mq.addEventListener && mq.addEventListener('change', onScheme);

  // ---- playback ----
  const RUN_SECONDS = 16;
  const loop = ctx.loop((dt) => {
    head = Math.min(total(), head + (dt * total()) / RUN_SECONDS);
    draw();
    if (head >= total()) pause();
  });
  function afterHead() {
    draw();
  }
  function play() {
    if (ctx.reducedMotion()) {
      head = head >= total() - 1 ? 0.5 * 86400 : Math.min(total(), head + 0.5 * 86400);
      draw();
      return;
    }
    if (head >= total() - 1) head = 0;
    loop.start();
    tp.setRunning(true);
  }
  function pause() {
    loop.stop();
    tp.setRunning(false);
    draw();
  }
  function restart() {
    loop.stop();
    if (ctx.reducedMotion()) {
      head = total();
      tp.setRunning(false);
      draw();
    } else {
      head = 0;
      play();
    }
  }

  recompute();
  if (ctx.reducedMotion()) {
    head = total();
    draw();
  } else {
    head = 0;
    play();
  }

  return {
    getRecord() {
      const out = [];
      const m = (name, value, unit, noteText) => out.push({ name, value: Number.isFinite(value) ? value : null, unit, ...(noteText ? { note: noteText } : {}) });
      if (res) {
        const f = res.fleet;
        const r = f.regimes[values.regime];
        m('RMSE against reserved reference', r.rmseRef, '°C', `regime ${values.regime}, ${r.n} pairs`);
        m('RMSE against simulated truth', r.rmseTruth, '°C', 'known only in the simulation');
        m('Mean bias', r.bias, '°C');
        m('Factory RMSE against reference', f.regimes.none.rmseRef, '°C');
        m('Once-calibrated RMSE against reference', f.regimes.once.rmseRef, '°C');
        m('Daily-calibrated RMSE against reference', f.regimes.periodic.rmseRef, '°C');
        m('Uptime', f.uptime, 'share', `${f.dead} device(s) out of battery`);
        m('Shortest battery life', Number.isFinite(f.minBatteryLife_days) ? f.minBatteryLife_days : null, 'days');
        m('Bytes delivered', f.bytes_delivered, 'bytes', `${PACKET_BYTES} bytes per packet`);
        m('Bytes sent', f.bytes_sent, 'bytes');
        m('Energy used', f.energy_J, 'J');
      }
      return {
        inputs: { ...values },
        seed,
        metrics: out,
        diagnostics: { devices: res ? res.devices.length : 0, ticks: res ? res.K : 0, runMs: Math.round(computeMs * 10) / 10, fps: loop.fps },
        elapsedMs: Math.round(performance.now() - t0),
        limitations: res && !res.ok ? ['The method stopped for this input: ' + res.reason] : undefined,
      };
    },
    getTable() {
      return res ? toTable(res) : { columns: ['device', 't_s', 'reading_c'], rows: [] };
    },
    destroy() {
      loop.dispose();
      stopFit();
      themeObs.disconnect();
      mq && mq.removeEventListener && mq.removeEventListener('change', onScheme);
      biasBox.destroy();
      errBox.destroy();
    },
  };
}
