// Throughput of the nowcast kernel on this machine (one core), for the compute lens. Writes data/bench.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { PROPOSED, snapToRoads } from '../src/kernels/sensors.js';
import { makeStorm } from '../src/kernels/storm.js';
import { observe, fitMotion } from '../src/kernels/nowcast.js';
import { benchmark } from '../src/kernels/compute.js';
const geo = JSON.parse(readFileSync(new URL('../data/geo.json', import.meta.url)));
const obs = observe(makeStorm(1), snapToRoads(PROPOSED, geo), 1);
const fit = fitMotion(obs, 80);
benchmark(obs, 80, { vx: fit.vx, vy: fit.vy, g: 1 }, { minMs: 400 });
const runs = [0, 1, 2].map(() => benchmark(obs, 80, { vx: fit.vx, vy: fit.vy, g: 1 }, { minMs: 1000 }).perSec).sort((a, b) => a - b);
const out = { perSec: Math.round(runs[1]), machine: `${cpus()[0].model}, Node ${process.version}, one core`, date: new Date().toISOString().slice(0, 10), sensors: obs.length };
writeFileSync(new URL('../data/bench.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out);
