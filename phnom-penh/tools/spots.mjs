// Held-out storms (101–148) at twelve facility spots across the city, the demo's network as it opens.
// Shows the cases one spot hides: storms with no water at the door, and notices with no water.
// node tools/spots.mjs [--json out]
import { readFileSync, writeFileSync } from 'node:fs';
import { PROPOSED, snapToRoads } from '../src/kernels/sensors.js';
import { BASELINE, configOf } from '../src/kernels/experiment.js';
import { evaluateSet, summarize, HELDOUT } from '../src/kernels/evaluation.js';
const geo = JSON.parse(readFileSync(new URL('../data/geo.json', import.meta.url)));
const P = snapToRoads(PROPOSED, geo).map(({ id, kind, ring, x, y }) => ({ id, kind, ring, x: Math.round(x), y: Math.round(y) }));
const SPOTS = [[-1500, -600], [-4000, 2000], [-6500, -3000], [1500, 1000], [2500, -2500], [-9000, 500], [-2500, -4500], [500, 4000], [-5500, 5000], [3500, 3500], [-12000, -6000], [-800, 800]];
const cfg = configOf(BASELINE, P), out = { storms: [HELDOUT[0], HELDOUT[HELDOUT.length - 1]], spots: [] }, all = [];
for (const [x, y] of SPOTS) {
  const r = evaluateSet({ ...cfg, facility: { x, y, kind: 'hotel' } }, HELDOUT);
  all.push(...r.rows); out.spots.push({ x, y, network: r.summary.network, alone: r.summary.alone, leadNet: r.summary.leadNet, leadAlone: r.summary.leadAlone });
  console.log(x, y, JSON.stringify(r.summary.network), 'median', r.summary.leadNet.median, 'vs', r.summary.leadAlone.median);
}
out.all = summarize(all);
console.log('all', JSON.stringify(out.all.network), JSON.stringify(out.all.alone), 'lead', out.all.leadNet.median, out.all.leadAlone.median, 'err', out.all.err.median.toFixed(1), 'spread', out.all.spread.median.toFixed(1), 'cover', out.all.cover.median.toFixed(2));
const i = process.argv.indexOf('--json'); if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
