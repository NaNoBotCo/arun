// Does a kernel folder's forecast read reports from after the cutoff? node tools/leak-demo.mjs [kernelDir]
// Two report sets equal through minute K and different after; a forecast made with reports up to K
// should not tell them apart. Prints how many forecast values differ.
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
const dir = process.argv[2] || fileURLToPath(new URL('../src/kernels/', import.meta.url));
const K = async f => import(pathToFileURL(dir.replace(/\/?$/, '/') + f).href);
const { makeStorm } = await K('storm.js'), N = await K('nowcast.js'), { PROPOSED, snapToRoads } = await K('sensors.js');
const geo = JSON.parse(readFileSync(new URL('../data/geo.json', import.meta.url)));
const sens = snapToRoads(PROPOSED, geo).map(({ id, kind, x, y }) => ({ id, kind, x: Math.round(x), y: Math.round(y) }));
let diff = 0, total = 0, cases = 0;
for (const seed of [1, 2, 3, 4, 5]) {
  const obs = N.observe(makeStorm(seed), sens, seed);
  for (const tNow of [50, 60, 70, 80, 90, 100]) {
    const k = tNow - 1;
    const A = obs.map(o => { const rep = Float32Array.from(o.rep); rep[k] = NaN; rep[k - 1] = NaN; return { ...o, rep }; });
    const B = A.map(o => { const rep = Float32Array.from(o.rep); for (let j = k + 1; j < rep.length; j++) rep[j] = 200; return { ...o, rep }; });
    const fit = N.fitMotion(A, tNow); if (!fit) continue; cases++;
    const mem = { vx: fit.vx, vy: fit.vy, g: 1 };
    for (const [x, y] of [[-1500, -600], [-4000, 1000], [1000, 2000]]) {
      const a = N.forecastPoint(A, tNow, mem, x, y).v, b = N.forecastPoint(B, tNow, mem, x, y).v;
      for (let i = 0; i < a.length; i++) { total++; if (!(Object.is(a[i], b[i]) || (a[i] !== a[i] && b[i] !== b[i]))) diff++; }
    }
  }
}
console.log(JSON.stringify({ kernels: dir.split('/').slice(-4).join('/'), cases, forecastValues: total, changedByFutureReports: diff }));
