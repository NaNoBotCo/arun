// Headline metrics over storm sets, for a kernel folder: node tools/metrics.mjs [kernelDir --label name] [--json out]
// Default facility and network as the demo opens (hotel at -1500,-600, every proposed sensor on).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : fileURLToPath(new URL('../src/kernels/', import.meta.url));
const K = async f => import(pathToFileURL(dir.replace(/\/?$/, '/') + f).href);
const { runScenario } = await K('scenario.js'), { PROPOSED, snapToRoads } = await K('sensors.js');
const geo = JSON.parse(readFileSync(new URL('../data/geo.json', import.meta.url)));
const sensors = snapToRoads(PROPOSED, geo).map(({ id, kind, ring, x, y }) => ({ id, kind, ring, x: Math.round(x), y: Math.round(y), on: true }));
const facility = { x: -1500, y: -600, kind: 'hotel' };
const sets = { practice: Array.from({ length: 24 }, (_, i) => i + 1), heldout: Array.from({ length: 48 }, (_, i) => 101 + i) };
const out = { kernels: process.argv[2] && !process.argv[2].startsWith('--') ? (arg('--label') || 'other kernels') : 'src/kernels', sets: {} };
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
for (const [name, seeds] of Object.entries(sets)) {
  const rows = [], t0 = Date.now();
  for (const seed of seeds) {
    const r = runScenario({ seed, sensors, facility });
    const cls = (tw) => r.tWater < 0 ? (tw >= 0 ? 'false' : 'quiet') : tw < 0 ? 'miss' : tw < r.tWater ? 'hit' : 'late';
    rows.push({ seed, tWater: r.tWater, net: r.network.tWarn, alone: r.alone.tWarn, prepNet: r.network.prep, prepAlone: r.alone.prep, gain: r.gain, netClass: cls(r.network.tWarn), aloneClass: cls(r.alone.tWarn) });
  }
  const ms = Date.now() - t0, pn = rows.filter(r => r.prepNet != null).map(r => r.prepNet), pa = rows.filter(r => r.prepAlone != null).map(r => r.prepAlone);
  const count = (k, c) => rows.filter(r => r[k] === c).length;
  out.sets[name] = { seeds: [seeds[0], seeds[seeds.length - 1]], msPerStorm: Math.round(ms / seeds.length), rows,
    network: { hit: count('netClass', 'hit'), late: count('netClass', 'late'), miss: count('netClass', 'miss'), false: count('netClass', 'false'), quiet: count('netClass', 'quiet'), min: Math.min(...pn), p25: q(pn, 0.25), median: q(pn, 0.5), p75: q(pn, 0.75), max: Math.max(...pn) },
    alone: { hit: count('aloneClass', 'hit'), late: count('aloneClass', 'late'), miss: count('aloneClass', 'miss'), false: count('aloneClass', 'false'), quiet: count('aloneClass', 'quiet'), min: Math.min(...pa), p25: q(pa, 0.25), median: q(pa, 0.5), p75: q(pa, 0.75), max: Math.max(...pa) } };
  const s = out.sets[name];
  console.log(name, seeds[0] + '–' + seeds[seeds.length - 1], `${s.msPerStorm} ms/storm`, 'network', JSON.stringify(s.network), 'alone', JSON.stringify(s.alone));
}
console.log('seed 1:', JSON.stringify(out.sets.practice.rows[0]));
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
