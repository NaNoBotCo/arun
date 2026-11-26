// E01 Planetary clock: solar geometry from the spec's formulas. Pure.
// Declination δ ≈ 23.44° sin(2π(284+d)/365) (Cooper 1969 approximation; no equation of time, no eccentricity).

export const S0 = 1361; // W/m², total solar irradiance at 1 au (top of atmosphere)
const RAD = Math.PI / 180;

export function dayOfYearUTC(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
}

export function declinationDeg(day) {
  if (!(day >= 1 && day <= 366)) throw new Error('Day of year must be 1–366.');
  return 23.44 * Math.sin((2 * Math.PI * (284 + day)) / 365);
}

// Sunrise hour angle H0 (radians). Handles polar day and night before acos.
export function sunriseHourAngle(latDeg, declDeg) {
  if (!(latDeg >= -90 && latDeg <= 90)) throw new Error('Latitude must be −90 to 90.');
  const phi = latDeg * RAD;
  const d = declDeg * RAD;
  // tan(±90°) is infinite; nudge the pole so the sign still decides day or night.
  const c = -Math.tan(Math.min(Math.abs(phi), Math.PI / 2 - 1e-9) * Math.sign(phi || 1)) * Math.tan(d);
  if (c <= -1) return { H0: Math.PI, polar: 'day' };
  if (c >= 1) return { H0: 0, polar: 'night' };
  return { H0: Math.acos(c), polar: null };
}

export function daylightHours(latDeg, day) {
  const { H0 } = sunriseHourAngle(latDeg, declinationDeg(day));
  return (24 * H0) / Math.PI;
}

export function noonZenithDeg(latDeg, day) {
  return Math.abs(latDeg - declinationDeg(day));
}

// cos(zenith) at local solar time (hours; 12 = solar noon).
export function cosZenith(latDeg, declDeg, solarHour) {
  const phi = latDeg * RAD;
  const d = declDeg * RAD;
  const h = (15 * (solarHour - 12)) * RAD;
  return Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h);
}

// Top-of-atmosphere flux on a horizontal surface. Not ground irradiance: no air, cloud or terrain.
export function toaFlux(latDeg, day, solarHour) {
  return S0 * Math.max(0, cosZenith(latDeg, declinationDeg(day), solarHour));
}

// Daily mean top-of-atmosphere insolation (W/m²), the closed form of the integral of toaFlux over 24 h.
export function dailyMeanTOA(latDeg, day) {
  const decl = declinationDeg(day);
  const { H0 } = sunriseHourAngle(latDeg, decl);
  const phi = latDeg * RAD;
  const d = decl * RAD;
  return (S0 / Math.PI) * (H0 * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(H0));
}

export function annualMeanTOA(latDeg) {
  let s = 0;
  for (let d = 1; d <= 365; d++) s += dailyMeanTOA(latDeg, d);
  return s / 365;
}

export function localSolarHour(utcHours, lonDeg) {
  return (((utcHours + lonDeg / 15) % 24) + 24) % 24;
}

export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

// Point where the sun is overhead: latitude δ, longitude where local solar time is noon.
export function subsolarPoint(day, utcHours) {
  return { lat: declinationDeg(day), lon: wrapLon(15 * (12 - utcHours)) };
}

// Sun elevation in degrees (90 − zenith) at a place and UTC time.
export function sunElevationDeg(latDeg, lonDeg, day, utcHours) {
  const c = cosZenith(latDeg, declinationDeg(day), localSolarHour(utcHours, lonDeg));
  return 90 - Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
}

// Sunrise and sunset in local solar time (hours), or null in polar day/night.
export function sunriseSunset(latDeg, day) {
  const { H0, polar } = sunriseHourAngle(latDeg, declinationDeg(day));
  if (polar) return { polar, sunrise: null, sunset: null };
  const half = (12 * H0) / Math.PI;
  return { polar: null, sunrise: 12 - half, sunset: 12 + half };
}

// Analytic, divergence-free velocity field on the unit sphere from a streamfunction.
// ψ(λ, φ, t) = U sin φ cos² φ + A cos⁴ φ sin φ sin(k λ − c t).  u = −∂ψ/∂φ,  v = (1/cos φ) ∂ψ/∂λ.
// Illustrative only: no observed wind.
export function velocity(latDeg, lonDeg, t, p = { U: 1, A: 0.6, k: 4, c: 0.3 }) {
  const phi = latDeg * RAD;
  const lam = lonDeg * RAD;
  const s = Math.sin(phi), co = Math.cos(phi);
  const wave = Math.sin(p.k * lam - p.c * t);
  // dψ/dφ
  const dZonal = p.U * (co * co * co - 2 * s * s * co);
  const dWave = p.A * wave * (co ** 5 - 4 * s * s * co ** 3);
  const u = -(dZonal + dWave);
  // dψ/dλ / cos φ
  const v = (p.A * co ** 4 * s * p.k * Math.cos(p.k * lam - p.c * t)) / Math.max(1e-6, co);
  return { u, v };
}

// One RK2 step of a tracer on the unit sphere (angular units). Returns new [lat, lon] in degrees.
export function advectTracer(latDeg, lonDeg, t, dt, p) {
  const f = (la, lo, tt) => {
    const { u, v } = velocity(la, lo, tt, p);
    const c = Math.max(0.05, Math.cos(la * RAD));
    return [v / RAD, u / c / RAD];
  };
  const [k1a, k1o] = f(latDeg, lonDeg, t);
  const [k2a, k2o] = f(latDeg + 0.5 * dt * k1a, lonDeg + 0.5 * dt * k1o, t + 0.5 * dt);
  let la = latDeg + dt * k2a;
  const lo = wrapLon(lonDeg + dt * k2o);
  if (la > 89) la = 89;
  if (la < -89) la = -89;
  return [la, lo];
}

// Year table for charts and for E06's explicit mapping (annual mean TOA by latitude).
export function yearTable(latDeg) {
  const rows = [];
  for (let d = 1; d <= 365; d++) rows.push([d, daylightHours(latDeg, d), dailyMeanTOA(latDeg, d), noonZenithDeg(latDeg, d)]);
  return rows;
}

export const jobs = {
  'e01.annualByLatitude': ({ step = 5 } = {}) => {
    const out = [];
    for (let lat = -90; lat <= 90; lat += step) out.push([lat, annualMeanTOA(lat)]);
    return out;
  },
};
