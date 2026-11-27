// Compute arithmetic, from throughput measured on the device in hand.
// A "cell-step" is one forecast value: one grid cell, one lead time, one ensemble member, all sensors read.
import { forecastPoint } from './nowcast.js';

export function benchmark(obs, tNow, mem, { grid = 16, minMs = 220 } = {}) {
  const t0 = performance.now(); let calls = 0;
  const n = grid * grid;
  while (performance.now() - t0 < minMs) {
    for (let k = 0; k < n; k++) forecastPoint(obs, tNow, mem, -9000 + (k % grid) * 600, -6000 + Math.floor(k / grid) * 600, 120, 2);
    calls++;
  }
  const ms = performance.now() - t0;
  return { cellSteps: calls * n * 61, ms, perSec: calls * n * 61 / (ms / 1000) };
}

export function demand({ areaKm2, cellM, members, horizonMin = 120, stepMin = 2, updateMin }) {
  const cells = areaKm2 * 1e6 / (cellM * cellM);
  const leads = horizonMin / stepMin + 1;
  const perRun = cells * leads * members;
  return { cells, perRun, perDay: perRun * 1440 / updateMin };
}

import { PRIVATE } from '#edition';
// Frames one laptop covers per minute: the team's preliminary test in the private edition, not set in the external one.
export const FACE_SHIELD_LAPTOP_PER_MIN = PRIVATE ? PRIVATE.faceShield.laptopPerMin : null;
export const faceShieldLaptops = (cameras, framesPerMin) => FACE_SHIELD_LAPTOP_PER_MIN ? cameras * framesPerMin / FACE_SHIELD_LAPTOP_PER_MIN : null;

export const PRESETS = {
  city: { areaKm2: 400, cellM: 100, members: 48, updateMin: 5 },
  cambodia: { areaKm2: 181035, cellM: 100, members: 200, updateMin: 5 },
  mekong: { areaKm2: 795000, cellM: 30, members: 1000, updateMin: 5 },
};
