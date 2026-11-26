// E01 Planetary clock (Dawn Globe)
import * as K from '../kernels/e01.js';
import { createGlobe, isLand } from '../viz/globe.js';
import { LAND_SOURCE } from '../data/land.js';

export const meta = {
  id: 'E01',
  title: 'Planetary clock',
  subtitle: 'Dawn Globe',
  priority: 'P0',
  kind: 'simulation',
  dataStatus: 'MATHEMATICAL',
  methodVersion: 'e01-solar-geometry-1.0.0',
  blurb: 'Day and night on a globe, from solar geometry. Tap anywhere for its daylight, sun height and sunlight.',
  inputs: [
    { name: 'day', label: 'Day of year', type: 'range', min: 1, max: 365, step: 1, default: 330, unit: 'day', integer: true },
    { name: 'hourUTC', label: 'Time (UTC)', type: 'range', min: 0, max: 24, step: 0.05, default: 3, unit: 'h' },
    { name: 'lat', label: 'Latitude of the pin', type: 'range', min: -90, max: 90, step: 0.1, default: 13.4, unit: '°' },
    { name: 'lon', label: 'Longitude of the pin', type: 'range', min: -180, max: 180, step: 0.1, default: 103.9, unit: '°' },
    { name: 'speed', label: 'Clock speed', type: 'range', min: 0, max: 24, step: 0.25, default: 2, unit: 'h per s' },
    { name: 'flow', label: 'Analytic flow tracers', type: 'toggle', default: true },
    { name: 'wave', label: 'Flow wave strength', type: 'range', min: 0, max: 1.5, step: 0.05, default: 0.6, unit: '' },
  ],
  outputs: [
    { name: 'daylight', label: 'Daylight', unit: 'h' },
    { name: 'elevation', label: 'Sun elevation', unit: '°' },
    { name: 'toa', label: 'Top-of-atmosphere flux', unit: 'W/m²' },
  ],
  dependencies: [],
  feeds: ['E06'],
  seedStrategy: 'The seed places the flow tracers. Solar values have no randomness.',
  method: `<p>The sun's declination on day <i>d</i> uses the approximation in the brief:</p>
<p class="eq">δ ≈ 23.44° · sin(2π(284 + d)/365)</p>
<p>Sunrise hour angle and daylight length at latitude φ:</p>
<p class="eq">cos H₀ = −tan φ · tan δ        daylight = 24·H₀/π hours</p>
<p>When −tan φ tan δ ≤ −1 the sun does not set (polar day, 24 h); when it is ≥ 1 the sun does not rise (polar night, 0 h). The code checks this before calling acos.</p>
<p>Sun height uses local solar time <i>t</i> (hours, noon = 12), with hour angle h = 15°(t − 12):</p>
<p class="eq">cos z = sin φ sin δ + cos φ cos δ cos h        noon zenith = |φ − δ|</p>
<p>Top-of-atmosphere flux on a flat surface is S₀·max(0, cos z) with S₀ = 1361 W/m². The daily mean is the closed form (S₀/π)(H₀ sin φ sin δ + cos φ cos δ sin H₀); a test checks it against numerical integration.</p>
<p>The globe is an orthographic projection. Each pixel is turned back into latitude and longitude, lit by the same cos z, and coloured land or sea from Natural Earth outlines. Rotating the view changes only what you see; the numbers come from latitude, longitude, day and time.</p>
<p>The tracers follow an analytic flow from a streamfunction ψ = U sin φ cos²φ + A cos⁴φ sin φ sin(kλ − ct), so the flow has zero divergence by construction. It is a drawing aid, not wind.</p>`,
  limitations: [
    'Solar time, not clock time: no equation of time and no time zones.',
    'Top-of-atmosphere sunlight, not sunlight at the ground: no air, cloud, haze or terrain.',
    'Declination from a one-line approximation; error up to about 1° against an ephemeris.',
    'Earth–sun distance is fixed at 1 au, so flux ignores the ±3.4% yearly swing.',
    'The tracer flow is invented mathematics. It does not show any observed or forecast wind.',
  ],
  provenance: [LAND_SOURCE],
  whoPays: null,
  researchOnly: true,
};

export const css = `
[data-ex="E01"].ex-stage { background: radial-gradient(ellipse at 50% 120%, color-mix(in srgb, var(--rose) 22%, transparent), transparent 60%), radial-gradient(ellipse at 50% 50%, var(--bg-2), var(--bg)); }
[data-ex="E01"] .globe-box { position: absolute; inset: 0; cursor: grab; touch-action: none; }
[data-ex="E01"] .globe-box:active { cursor: grabbing; }
[data-ex="E01"] .readout { position: absolute; left: 12px; top: 12px; max-width: min(320px, 70%); background: color-mix(in srgb, var(--bg) 78%, transparent); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; font-size: 0.9rem; pointer-events: none; backdrop-filter: blur(6px); }
[data-ex="E01"] .readout b { font-family: var(--font-display); font-size: 1.05rem; }
[data-ex="E01"] .readout .big { font-family: var(--font-data); font-size: 1.3rem; color: var(--dawn-text); }
[data-ex="E01"] .presets { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
[data-ex="E01"] .hint { position: absolute; right: 12px; bottom: 10px; font-size: 0.8rem; color: var(--muted); pointer-events: none; }
`;

function fmtHM(h) {
  if (h === null || h === undefined) return '—';
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
function fmtClock(h) {
  if (h === null || h === undefined) return '—';
  const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function mount(slots, ctx) {
  const { h, controlPanel, transport, metricGrid, button, note, sectionTitle, fmt } = ctx.ui;
  const now = new Date();
  const defaults = Object.fromEntries(meta.inputs.map((i) => [i.name, i.default]));
  defaults.day = Math.min(365, K.dayOfYearUTC(now));
  defaults.hourUTC = Math.round((now.getUTCHours() + now.getUTCMinutes() / 60) * 20) / 20;
  const v = { ...defaults, ...(ctx.initial ? ctx.initial.inputs : {}) };
  let seed = ctx.initial ? ctx.initial.seed : 7;

  const box = h('div', { class: 'globe-box', tabindex: '0', role: 'application', 'aria-label': 'Globe. Drag or use arrow keys to turn it. Click or press Enter to put the pin at the centre.' });
  const readout = h('div', { class: 'readout', 'aria-live': 'polite' });
  slots.stage.append(box, readout, h('div', { class: 'hint' }, 'Drag to turn · tap to pin'));
  let globe = createGlobe(box, { seed, particles: ctx.reducedMotion() ? 0 : 900, streamlines: v.flow && !ctx.reducedMotion(), spinDegPerSec: 0, lon0: v.lon, lat0: Math.max(-60, Math.min(60, v.lat)), flowParams: { U: 1, A: v.wave, k: 4, c: 0.3 } });

  // Transport
  let running = !ctx.reducedMotion();
  const tp = transport({
    seed,
    running,
    stepLabel: '+1 hour',
    onToggle: () => setRunning(!running),
    onStep: () => advance(1),
    onReset: () => {
      panel.setAll(defaults);
      Object.assign(v, defaults);
      globe.setView(v.lon, v.lat);
      update();
    },
    onReplay: () => rebuildGlobe(),
    onSeed: (s) => {
      seed = s;
      rebuildGlobe();
    },
  });
  slots.controls.append(tp.el);
  const presets = h('div', { class: 'presets' },
    [['March equinox', 80], ['June solstice', 172], ['September equinox', 266], ['December solstice', 355]].map(([l, d]) =>
      button(l, () => {
        panel.set('day', d);
        v.day = d;
        update();
      }, { kind: 'small' })),
    button('Now', () => {
      const n = new Date();
      v.day = Math.min(365, K.dayOfYearUTC(n));
      v.hourUTC = n.getUTCHours() + n.getUTCMinutes() / 60;
      panel.set('day', v.day);
      panel.set('hourUTC', Math.round(v.hourUTC * 20) / 20);
      update();
    }, { kind: 'small' }));
  slots.controls.append(presets);
  const panel = controlPanel(slots.controls, meta.inputs, v, (name, val) => {
    if (name === 'flow') globe.setStreamlines(val && !ctx.reducedMotion(), 900);
    if (name === 'wave') globe.setFlow({ A: val });
    if (name === 'lat' || name === 'lon') globe.flyTo(v.lat, v.lon);
    update();
  });
  if (ctx.reducedMotion()) slots.controls.append(note('Calm motion is on: the clock waits for Run, and the tracers stay off.'));

  slots.metrics.append(sectionTitle('At the pin'));
  const mg = metricGrid(slots.metrics, [
    { name: 'place', label: 'Pin', wide: true },
    { name: 'solar', label: 'Local solar time', unit: 'hh:mm' },
    { name: 'elev', label: 'Sun elevation', unit: '°', digits: 1 },
    { name: 'daylight', label: 'Daylight', unit: 'today' },
    { name: 'rise', label: 'Sunrise → sunset', unit: 'solar time' },
    { name: 'noonz', label: 'Noon zenith', unit: '°', digits: 2 },
    { name: 'toa', label: 'TOA flux now', unit: 'W/m²', digits: 0 },
    { name: 'mean', label: 'TOA daily mean', unit: 'W/m²', digits: 0 },
    { name: 'decl', label: 'Declination δ', unit: '°', digits: 2 },
  ]);
  const chartA = ctx.chart.chartBox(slots.metrics, { title: 'Daylight through the year at this latitude', height: 150 });
  const chartB = ctx.chart.chartBox(slots.metrics, { title: 'Daily mean top-of-atmosphere sunlight', height: 150 });
  const perf = h('p', { class: 'small muted' });
  slots.metrics.append(perf);

  let last = null;
  function compute() {
    const dec = K.declinationDeg(v.day);
    const solar = K.localSolarHour(v.hourUTC, v.lon);
    const elev = K.sunElevationDeg(v.lat, v.lon, v.day, v.hourUTC);
    const dl = K.daylightHours(v.lat, v.day);
    const rs = K.sunriseSunset(v.lat, v.day);
    return {
      dec, solar, elev, dl, rs,
      noonz: K.noonZenithDeg(v.lat, v.day),
      toa: K.toaFlux(v.lat, v.day, solar),
      mean: K.dailyMeanTOA(v.lat, v.day),
      land: isLand(v.lat, v.lon),
    };
  }
  let lastChartLat = null;
  function update() {
    globe.setTime(v.day, v.hourUTC);
    globe.setMarker({ lat: v.lat, lon: v.lon });
    const r = compute();
    last = r;
    const place = `${fmt(Math.abs(v.lat), 1)}°${v.lat >= 0 ? 'N' : 'S'} ${fmt(Math.abs(v.lon), 1)}°${v.lon >= 0 ? 'E' : 'W'} · ${r.land ? 'land' : 'sea'}`;
    mg.set('place', null, { text: place });
    mg.set('solar', null, { text: fmtClock(r.solar) });
    mg.set('elev', r.elev, { tone: r.elev > 0 ? 'good' : '' });
    mg.set('daylight', null, { text: r.rs.polar === 'day' ? '24 h (polar day)' : r.rs.polar === 'night' ? '0 h (polar night)' : fmtHM(r.dl) });
    mg.set('rise', null, { text: r.rs.polar ? '—' : `${fmtClock(r.rs.sunrise)} → ${fmtClock(r.rs.sunset)}` });
    mg.set('noonz', r.noonz);
    mg.set('toa', r.toa);
    mg.set('mean', r.mean);
    mg.set('decl', r.dec);
    readout.replaceChildren(
      h('b', {}, place), h('br'),
      h('span', { class: 'big' }, r.elev > 0 ? `Sun ${fmt(r.elev, 1)}° up` : `Sun ${fmt(-r.elev, 1)}° below`), h('br'),
      `Day ${v.day} · ${fmtClock(v.hourUTC)} UTC · solar ${fmtClock(r.solar)}`, h('br'),
      `Daylight ${r.rs.polar === 'day' ? '24 h' : r.rs.polar === 'night' ? '0 h' : fmtHM(r.dl)} · ${fmt(r.toa, 0)} W/m² at the top of the air`);
    drawCharts();
  }
  function drawCharts() {
    const rows = K.yearTable(v.lat);
    if (lastChartLat !== v.lat) {
      ctx.chart.dataTable(chartA.text, ['Day', 'Daylight (h)', 'Daily mean TOA (W/m²)', 'Noon zenith (°)'], rows, 52);
      lastChartLat = v.lat;
    }
    chartA.draw(() => ctx.chart.drawLines(chartA.canvas, {
      series: [{ name: 'daylight', points: rows.map((r) => [r[0], r[1]]), color: ctx.ui.token('--dawn'), width: 2.2 }],
      xLabel: 'day of year', yLabel: 'hours', yRange: [0, 24], marks: [{ x: v.day, label: `day ${v.day}`, color: ctx.ui.token('--rose') }],
    }));
    chartB.draw(() => ctx.chart.drawLines(chartB.canvas, {
      series: [{ name: 'TOA', points: rows.map((r) => [r[0], r[2]]), color: ctx.ui.token('--water'), width: 2.2 }],
      xLabel: 'day of year', yLabel: 'W/m²', yZero: true, marks: [{ x: v.day, color: ctx.ui.token('--rose') }],
    }));
  }

  function advance(hours) {
    v.hourUTC += hours;
    while (v.hourUTC >= 24) {
      v.hourUTC -= 24;
      v.day = v.day >= 365 ? 1 : v.day + 1;
    }
    panel.set('hourUTC', Math.round(v.hourUTC * 20) / 20);
    panel.set('day', v.day);
    update();
  }

  function rebuildGlobe() {
    const view = globe.view;
    globe.destroy();
    globe = createGlobe(box, { seed, particles: 900, streamlines: v.flow && !ctx.reducedMotion(), spinDegPerSec: 0, lon0: view.lon0, lat0: view.lat0, flowParams: { U: 1, A: v.wave, k: 4, c: 0.3 } });
    update();
    globe.draw();
  }

  // Direct manipulation: drag turns the view, a tap pins a place.
  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    box.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, moved: 0, view: globe.view };
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    const k = 180 / Math.max(200, box.clientWidth);
    globe.setView(drag.view.lon0 - dx * k, drag.view.lat0 + dy * k);
    if (!loop.running) globe.draw();
  });
  box.addEventListener('pointerup', (e) => {
    if (drag && drag.moved < 5) {
      const p = globe.pick(e.clientX, e.clientY);
      if (p) pin(p.lat, p.lon);
    }
    drag = null;
  });
  box.addEventListener('keydown', (e) => {
    const vw = globe.view;
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowLeft') globe.setView(vw.lon0 - step, vw.lat0);
    else if (e.key === 'ArrowRight') globe.setView(vw.lon0 + step, vw.lat0);
    else if (e.key === 'ArrowUp') globe.setView(vw.lon0, vw.lat0 + step);
    else if (e.key === 'ArrowDown') globe.setView(vw.lon0, vw.lat0 - step);
    else if (e.key === 'Enter' || e.key === ' ') pin(vw.lat0, vw.lon0);
    else return;
    e.preventDefault();
    if (!loop.running) globe.draw();
  });
  function pin(lat, lon) {
    v.lat = Math.round(lat * 10) / 10;
    v.lon = Math.round(K.wrapLon(lon) * 10) / 10;
    panel.set('lat', v.lat);
    panel.set('lon', v.lon);
    globe.pulse(v.lat, v.lon);
    update();
    ctx.announce(`Pinned ${fmt(v.lat, 1)}°, ${fmt(v.lon, 1)}°. Daylight ${fmtHM(last.dl)}.`, 'quiet');
  }

  let frames = 0;
  const t0 = performance.now();
  const loop = ctx.loop((dt) => {
    if (running && v.speed > 0) advance(v.speed * dt);
    globe.frame(dt);
    frames++;
    if (frames % 30 === 0) perf.textContent = `Rendering ${fmt(loop.fps, 0)} frames/s · ${globe.particleCount()} tracers`;
  });
  function setRunning(r) {
    running = r;
    tp.setRunning(r);
  }
  update();
  loop.start(); // the globe redraws for dragging; the clock only advances while Run is on
  setRunning(running);
  ctx.onCleanup(() => globe.destroy());

  return {
    getRecord() {
      const r = compute();
      return {
        inputs: { ...v },
        seed,
        metrics: [
          { name: 'Declination', value: r.dec, unit: 'deg' },
          { name: 'Local solar time', value: r.solar, unit: 'h' },
          { name: 'Sun elevation', value: r.elev, unit: 'deg' },
          { name: 'Daylight', value: r.dl, unit: 'h', note: r.rs.polar ? 'polar ' + r.rs.polar : undefined },
          { name: 'Noon zenith', value: r.noonz, unit: 'deg' },
          { name: 'TOA horizontal flux', value: r.toa, unit: 'W/m2', note: 'top of atmosphere, not ground' },
          { name: 'TOA daily mean', value: r.mean, unit: 'W/m2' },
        ],
        diagnostics: { fps: loop.fps, tracers: globe.particleCount(), elapsedSinceOpen_s: (performance.now() - t0) / 1000 },
      };
    },
    getTable() {
      return { columns: ['day', 'daylight_h', 'toa_daily_mean_W_m2', 'noon_zenith_deg'], rows: K.yearTable(v.lat) };
    },
    destroy() {},
  };
}
