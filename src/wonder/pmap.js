// Reads the precomputed protection map (tools/protection-map.mjs). Pure; runs in node or the page.
import { PMAP_META, PMAP_HOTEL, PMAP_PEAKQ } from './protection-map.data.js';
import { hashData } from '../core/hash.js';

export const PMAP_SIDE = 101;

function u16(b64) {
  let bytes;
  if (typeof atob === 'function') {
    const s = atob(b64);
    bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  } else {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const out = new Uint16Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = bytes[2 * i] | (bytes[2 * i + 1] << 8);
  return out;
}

let cached = null;

// hotelSeconds: wetland-arm seconds above threshold; peakQ: wetland-arm peak outflow (m³/s), both per position.
export function loadMap() {
  if (cached) return cached;
  const step = PMAP_META.hydro.timestep_s;
  const h = u16(PMAP_HOTEL), q = u16(PMAP_PEAKQ);
  const n = PMAP_SIDE * PMAP_SIDE;
  const hotelSeconds = new Float64Array(n), peakQ = new Float64Array(n);
  const hotelSaved_h = new Float32Array(n), riverPct = new Float32Array(n);
  let bh = 0, bq = 0;
  for (let i = 0; i < n; i++) {
    hotelSeconds[i] = h[i] * step;
    peakQ[i] = q[i] / 10;
    hotelSaved_h[i] = (PMAP_META.baseHotelSeconds - hotelSeconds[i]) / 3600;
    riverPct[i] = (PMAP_META.basePeakQ - peakQ[i]) / PMAP_META.basePeakQ;
    if (hotelSaved_h[i] > hotelSaved_h[bh]) bh = i;
    if (riverPct[i] > riverPct[bq]) bq = i;
  }
  cached = { meta: PMAP_META, hotelSeconds, peakQ, hotelSaved_h, riverPct, best: { hotel: bh, river: bq } };
  return cached;
}

export function indexOf(x, y) {
  return Math.round(y * 100) * PMAP_SIDE + Math.round(x * 100);
}

export function positionOf(i) {
  return { x: (i % PMAP_SIDE) / 100, y: Math.floor(i / PMAP_SIDE) / 100 };
}

// The map holds for these inputs only when everything but the wetland position matches what it was computed with.
function rest(hydro) {
  return hashData({ ...hydro, interventionX: 0, interventionY: 0 });
}

export function mapApplies(seed, hydro) {
  return seed === PMAP_META.seed && rest(hydro) === rest(PMAP_META.hydro);
}
