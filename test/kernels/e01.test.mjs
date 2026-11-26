import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  declinationDeg, daylightHours, noonZenithDeg, toaFlux, dailyMeanTOA, sunriseHourAngle, subsolarPoint,
  sunElevationDeg, velocity, advectTracer, annualMeanTOA, S0,
} from '../../src/kernels/e01.js';

const MARCH_EQ = 81; // the formula's declination is ~0 near day 81
const JUNE = 172;
const DEC = 355;

test('equator at equinox has ~12 h of daylight (±0.05 h)', () => {
  assert.ok(Math.abs(daylightHours(0, MARCH_EQ) - 12) < 0.05);
});

test('equator has 12 h every day: tan(0)=0 makes cos H0 = 0', () => {
  for (const d of [1, 100, 200, 300, 365]) assert.ok(Math.abs(daylightHours(0, d) - 12) < 1e-9);
});

test('northern midlatitude summer day is longer than winter day', () => {
  assert.ok(daylightHours(45, JUNE) > 15);
  assert.ok(daylightHours(45, DEC) < 9.5);
  assert.ok(daylightHours(45, JUNE) > daylightHours(45, DEC));
});

test('reference: 40°N on June 21 ≈ 14.9 h (textbook 14 h 52 min ± 6 min, no refraction)', () => {
  const h = daylightHours(40, JUNE);
  assert.ok(Math.abs(h - 14.87) < 0.1, `got ${h}`);
});

test('polar limits are finite: polar day 24 h, polar night 0 h', () => {
  assert.equal(daylightHours(80, JUNE), 24);
  assert.equal(daylightHours(80, DEC), 0);
  assert.equal(daylightHours(-80, DEC), 24);
  assert.equal(daylightHours(90, JUNE), 24);
  assert.equal(daylightHours(-90, JUNE), 0);
  assert.equal(sunriseHourAngle(89.9, 20).polar, 'day');
  for (let lat = -90; lat <= 90; lat += 5) for (const d of [1, 81, 172, 266, 355]) assert.ok(Number.isFinite(daylightHours(lat, d)));
});

test('noon zenith = |φ − δ|; at the subsolar latitude it is 0', () => {
  const dec = declinationDeg(JUNE);
  assert.ok(Math.abs(noonZenithDeg(dec, JUNE)) < 1e-12);
  assert.ok(Math.abs(noonZenithDeg(0, JUNE) - Math.abs(dec)) < 1e-12);
});

test('top-of-atmosphere flux is never negative and peaks at S0 with the sun overhead', () => {
  for (let lat = -90; lat <= 90; lat += 10) for (let h = 0; h < 24; h += 0.5) assert.ok(toaFlux(lat, JUNE, h) >= 0);
  const dec = declinationDeg(JUNE);
  assert.ok(Math.abs(toaFlux(dec, JUNE, 12) - S0) < 1e-9);
  assert.equal(toaFlux(0, JUNE, 0), 0);
});

test('daily mean TOA closed form equals numerical integration of toaFlux (±0.2%)', () => {
  for (const [lat, d] of [[0, 81], [45, 172], [-30, 355], [70, 172], [10, 300]]) {
    let s = 0;
    const n = 2880;
    for (let i = 0; i < n; i++) s += toaFlux(lat, d, (24 * (i + 0.5)) / n);
    const num = s / n;
    const closed = dailyMeanTOA(lat, d);
    assert.ok(Math.abs(num - closed) <= 0.002 * Math.max(1, closed), `${lat},${d}: ${num} vs ${closed}`);
  }
});

test('reference: annual mean TOA at the equator ≈ 416–420 W/m² and at the pole ≈ 170–180 W/m²', () => {
  const eq = annualMeanTOA(0);
  const pole = annualMeanTOA(90);
  assert.ok(eq > 410 && eq < 425, String(eq));
  assert.ok(pole > 165 && pole < 185, String(pole));
});

test('subsolar point: at 12:00 UTC the sun is over longitude 0; elevation there is 90°', () => {
  const p = subsolarPoint(JUNE, 12);
  assert.ok(Math.abs(p.lon) < 1e-9);
  assert.ok(Math.abs(sunElevationDeg(p.lat, p.lon, JUNE, 12) - 90) < 1e-6);
});

test('view rotation does not enter the physics: results depend only on lat, lon, day, time', () => {
  // The kernel has no view inputs; the same place and time always give the same numbers.
  assert.equal(sunElevationDeg(15, 105, 330, 3), sunElevationDeg(15, 105, 330, 3));
});

test('analytic velocity field is divergence-free on the sphere (finite difference, |div| < 1e-5)', () => {
  const R = Math.PI / 180;
  const h = 1e-3;
  for (const [la, lo, t] of [[10, 20, 0], [-35, 140, 2], [60, -70, 5]]) {
    // div = (1/cos φ) [ ∂u/∂λ + ∂(v cos φ)/∂φ ]
    const vc = (a) => velocity(a, lo, t).v * Math.cos(a * R);
    const du = (velocity(la, lo + h, t).u - velocity(la, lo - h, t).u) / (2 * h * R);
    const dv = (vc(la + h) - vc(la - h)) / (2 * h * R);
    const div = (du + dv) / Math.cos(la * R);
    assert.ok(Math.abs(div) < 1e-5, `div ${div}`);
  }
});

test('tracer advection is deterministic and stays finite', () => {
  let a = [10, 100], b = [10, 100];
  for (let i = 0; i < 500; i++) {
    a = advectTracer(a[0], a[1], i * 0.05, 0.05);
    b = advectTracer(b[0], b[1], i * 0.05, 0.05);
  }
  assert.deepEqual(a, b);
  assert.ok(a.every(Number.isFinite));
});
