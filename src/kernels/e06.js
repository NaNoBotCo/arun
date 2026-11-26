// E06 Opportunity Engine: enumerate fictional solar, wetland and drip-irrigation options on the E02 valley,
// estimate each one from physical relations, drop the infeasible, and find the Pareto frontier.

import { makeRng, deriveSeed } from '../core/rng.js';
import { makeRegion } from './e02.js';
import { annualMeanTOA } from './e01.js';

export const METHOD_VERSION = 'e06-pareto-1.0.0';
export const TYPES = ['solar', 'wetland', 'drip'];
export const CV = { solar: 0.15, wetland: 0.45, drip: 0.25 }; // outcome spread used by the risk filter

export const DEFAULTS = {
  count: 12000, budget_usd: 3000000, maxPayback_y: 20, maxBurden_ha: 20, riskTolerance: 0.5, tariff_usd_kWh: 0.09,
  solarCost_usd_kWp: 650, wetlandCost_usd_m3: 3, wetlandValue_usd_m3_y: 1.2, waterValue_usd_m3: 0.15, climate: 1, latitude: 13.4,
  clearness: 0.5,
};

export function validate(c) {
  const R = {
    count: [100, 50000], budget_usd: [0, 1e8], maxPayback_y: [1, 60], maxBurden_ha: [0, 500], riskTolerance: [0, 1], tariff_usd_kWh: [0, 1],
    solarCost_usd_kWp: [100, 5000], wetlandCost_usd_m3: [0.1, 50], wetlandValue_usd_m3_y: [0, 10], waterValue_usd_m3: [0, 5], climate: [0.5, 2], latitude: [-60, 60], clearness: [0.2, 0.8],
  };
  for (const [k, [lo, hi]] of Object.entries(R)) if (!(typeof c[k] === 'number' && Number.isFinite(c[k]) && c[k] >= lo && c[k] <= hi)) throw new Error(`${k} must be between ${lo} and ${hi}.`);
  if (!Number.isInteger(c.count)) throw new Error('count must be a whole number.');
}

// D8 flow accumulation: number of cells draining through each cell (steepest descent).
export function flowAccumulation(region) {
  const { N, z } = region;
  const n = N * N;
  const down = new Int32Array(n).fill(-1);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let best = 0, bj = -1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          const j = yy * N + xx;
          const s = (z[i] - z[j]) / Math.hypot(dx, dy);
          if (s > best) {
            best = s;
            bj = j;
          }
        }
      down[i] = bj;
    }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => z[b] - z[a]);
  const acc = new Float64Array(n).fill(1);
  for (const i of order) if (down[i] >= 0) acc[down[i]] += acc[i];
  return acc;
}

function gradAt(region, i) {
  const { N, z, cellSize_m } = region;
  const x = i % N, y = Math.floor(i / N);
  const zx = (z[y * N + Math.min(N - 1, x + 1)] - z[y * N + Math.max(0, x - 1)]) / (2 * cellSize_m);
  const zy = (z[Math.min(N - 1, y + 1) * N + x] - z[Math.max(0, y - 1) * N + x]) / (2 * cellSize_m);
  return { zx, zy };
}
function slopeAt(region, i) {
  const { zx, zy } = gradAt(region, i);
  return Math.hypot(zx, zy);
}
const LAND_COST = { forest: 3000, farm: 8000, urban: 20000 }; // US$/ha, editable in code, fictional

// Annual energy per kWp from E01's top-of-atmosphere mean, an editable clearness and a performance ratio of 0.8.
export function solarYield_kWh_kWp(latitude, clearness) {
  return (annualMeanTOA(latitude) * clearness * 8760) / 1000 * 0.8;
}

export function candidates(c, seed, region, acc) {
  const rng = makeRng(deriveSeed(seed, 'candidates'));
  const N = region.N;
  const yieldKWh = solarYield_kWh_kWp(c.latitude, c.clearness);
  const sub = region.assets.find((a) => a.id === 'substation').cell;
  const sx = sub % N, sy = Math.floor(sub / N);
  const out = [];
  for (let k = 0; k < c.count; k++) {
    const type = TYPES[k % 3];
    const cell = rng.int(N * N);
    const size_ha = Math.round(rng.range(0.5, 12) * 10) / 10;
    const area = size_ha * 1e4;
    const cx = cell % N, cy = Math.floor(cell / N);
    const forest = region.forest[cell], farm = region.farm[cell], urban = region.urban[cell];
    const slope = slopeAt(region, cell);
    const cand = { id: k, type, cell, x: cx, y: cy, size_ha, feasible: true, why: [] };
    const land = size_ha * (LAND_COST.forest * forest + LAND_COST.farm * farm + LAND_COST.urban * urban);
    if (type === 'solar') {
      const kWp = area * 0.18 * 0.5;
      // Ground facing the equator gains sun, ground facing away loses it (north of the equator, south is +y on the grid).
      const { zy } = gradAt(region, cell);
      const tilt = Math.max(0.75, Math.min(1.15, 1 - 3 * zy * Math.sign(c.latitude || 1)));
      const energy = kWp * yieldKWh * tilt;
      const dist = Math.hypot(cx - sx, cy - sy);
      cand.capex = kWp * c.solarCost_usd_kWp + dist * region.cellSize_m * 120 + land;
      cand.opex = 0.015 * cand.capex;
      cand.cash = energy * c.tariff_usd_kWh - cand.opex;
      cand.benefit = kWp * 40 * Math.max(0, 1 - dist / 25); // backup value near the substation, US$/yr equivalent
      cand.burden = size_ha * (forest + 0.5 * farm);
      cand.detail = { kWp, energy_kWh_y: energy, aspectFactor: tilt, gridLine_m: dist * region.cellSize_m, distanceToSubstation_cells: dist };
      if (region.channel[cell]) {
        cand.feasible = false;
        cand.why.push('on the river channel');
      }
      if (slope > 0.12) {
        cand.feasible = false;
        cand.why.push('slope above 12%');
      }
    } else if (type === 'wetland') {
      const volume = area * 1.5;
      const upstream = acc[cell] * region.cellSize_m ** 2;
      const useful = Math.min(volume, upstream * 0.05 * c.climate); // cannot hold more than 5 cm of runoff from its catchment
      cand.capex = volume * c.wetlandCost_usd_m3 + land;
      cand.opex = 0.01 * cand.capex;
      cand.benefit = useful * c.wetlandValue_usd_m3_y;
      cand.cash = cand.benefit * 0.5 - cand.opex; // half the avoided damage is recoverable as fees or credits (assumption)
      cand.burden = size_ha * (0.8 * farm + forest);
      cand.detail = { volume_m3: volume, useful_m3: useful, upstream_m2: upstream };
      if (slope > 0.08) {
        cand.feasible = false;
        cand.why.push('slope above 8% for a basin');
      }
      if (urban > 0.3) {
        cand.feasible = false;
        cand.why.push('inside the town');
      }
    } else {
      const saved = size_ha * 2000 * (2 - c.climate); // m³ per year: 2,000 m³/ha in a normal year, more when drier
      cand.capex = size_ha * 1500;
      cand.opex = size_ha * 40;
      const used = Math.max(0, saved) * farm; // only the farmed share of the plot uses water
      cand.cash = used * c.waterValue_usd_m3 + size_ha * farm * 120 - cand.opex;
      cand.benefit = used * c.waterValue_usd_m3;
      cand.burden = 0;
      cand.detail = { waterSaved_m3_y: saved };
      if (farm < 0.3) {
        cand.feasible = false;
        cand.why.push('not on farmland');
      }
    }
    cand.payback_y = cand.cash > 0 ? cand.capex / cand.cash : Infinity;
    if (cand.capex > c.budget_usd) {
      cand.feasible = false;
      cand.why.push('over budget');
    }
    if (cand.payback_y > c.maxPayback_y) {
      cand.feasible = false;
      cand.why.push(Number.isFinite(cand.payback_y) ? `payback ${cand.payback_y.toFixed(1)} y > ${c.maxPayback_y} y` : 'never pays back');
    }
    if (cand.burden > c.maxBurden_ha) {
      cand.feasible = false;
      cand.why.push(`land burden ${cand.burden.toFixed(1)} ha > ${c.maxBurden_ha} ha`);
    }
    if (CV[type] > c.riskTolerance) {
      cand.feasible = false;
      cand.why.push(`outcome spread ${CV[type]} > tolerance ${c.riskTolerance}`);
    }
    cand.profit = cand.cash - cand.capex / Math.max(1, c.maxPayback_y); // simple annualised margin
    out.push(cand);
  }
  return out;
}

// a dominates b: at least as good on all four objectives and strictly better on one.
export function dominates(a, b) {
  const ge = a.profit >= b.profit && a.benefit >= b.benefit && a.capex <= b.capex && a.burden <= b.burden;
  const gt = a.profit > b.profit || a.benefit > b.benefit || a.capex < b.capex || a.burden < b.burden;
  return ge && gt;
}

// Frontier by a sorted scan: after sorting on profit (ties broken toward better on the rest), any dominator comes first.
export function paretoFront(items) {
  const s = items.slice().sort((a, b) => b.profit - a.profit || b.benefit - a.benefit || a.capex - b.capex || a.burden - b.burden);
  const front = [];
  for (const p of s) {
    let dom = false;
    for (const f of front)
      if (dominates(f, p)) {
        dom = true;
        break;
      }
    if (!dom) front.push(p);
  }
  return front;
}

export function bruteFront(items) {
  return items.filter((p) => !items.some((q) => q !== p && dominates(q, p)));
}

export function search(c, seed, N = 96, progress) {
  validate(c);
  const region = makeRegion(seed, N);
  progress && progress(0.1);
  const acc = flowAccumulation(region);
  progress && progress(0.25);
  const all = candidates(c, seed, region, acc);
  progress && progress(0.6);
  const feasible = all.filter((x) => x.feasible);
  const front = paretoFront(feasible);
  progress && progress(1);
  const lean = (x) => ({ id: x.id, type: x.type, x: x.x, y: x.y, size_ha: x.size_ha, capex: x.capex, opex: x.opex, cash: x.cash, profit: x.profit, benefit: x.benefit, burden: x.burden, payback_y: x.payback_y, feasible: x.feasible, why: x.why, detail: x.detail });
  return {
    count: all.length,
    feasibleCount: feasible.length,
    candidates: all.map(lean),
    frontIds: front.map((x) => x.id),
    yield_kWh_kWp: solarYield_kWh_kWp(c.latitude, c.clearness),
    N,
  };
}

export const jobs = {
  'e06.search': ({ config, seed, N }, { progress }) => search(config, seed, N, progress),
};
