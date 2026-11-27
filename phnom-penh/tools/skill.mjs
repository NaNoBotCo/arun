// Motion fit and +30 min skill across storms, at the network's notice time and at +20 min.
import { readFileSync } from 'node:fs';
import { PROPOSED, snapToRoads } from '../src/kernels/sensors.js';
import { runScenario } from '../src/kernels/scenario.js';
import { fitMotion, fieldForecast, analysisNow, score } from '../src/kernels/nowcast.js';
import { sampleGrid } from '../src/kernels/storm.js';
const geo = JSON.parse(readFileSync(new URL('../data/geo.json', import.meta.url)));
const sensors = snapToRoads(PROPOSED, geo), facility = { x: -1500, y: -600 };
const G = { x0: -12000, x1: 8000, y0: -8000, y1: 8000, nx: 40, ny: 32 };
const rows = [];
for (let seed = 1; seed <= 24; seed++) {
  const r = runScenario({ seed, sensors, facility });
  const obs = r.obs.filter(o => o.kind !== 'roof');
  for (const tm of [r.network.tWarn, r.network.tWarn + 20]) {
    if (tm < 0) continue;
    const f = fitMotion(obs, tm); if (!f) continue;
    const truth = sampleGrid(r.storm, tm + 30, G);
    const sc = score(fieldForecast(obs, tm, f, 30, G), truth), pe = score(analysisNow(obs, tm, G), truth);
    rows.push({ seed, tm, basis: f.basis, n: f.n, fitK: +f.speedKmh.toFixed(1), trueK: +r.storm.speedKmh.toFixed(1), dHead: Math.round(((f.headingDeg - r.storm.headingDeg + 540) % 360) - 180), csi: +sc.csi.toFixed(2), csiP: +pe.csi.toFixed(2), prep: r.network.prep, alone: r.alone.prep });
  }
}
console.table(rows);
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
console.log('median speed ratio', med(rows.map(r => r.fitK / r.trueK)).toFixed(2), 'median CSI', med(rows.map(r => r.csi)), 'persist', med(rows.map(r => r.csiP)), 'median prep', med(rows.filter(r => r.prep != null).map(r => r.prep)), 'alone', med(rows.filter(r => r.alone != null).map(r => r.alone)));
