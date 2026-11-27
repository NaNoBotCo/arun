// Solar position (NOAA's simplified equations) for Phnom Penh on the scenario day.
// Returns elevation and azimuth in degrees (azimuth clockwise from north).
export function sunPosition(date, lat = 11.5627, lon = 104.9349) {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lon) * rad;
  const ha = lst - ra, la = lat * rad;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { elevation: el / rad, azimuth: ((az / rad) + 360) % 360 };
}
// Scenario minute 0 = 15:00 ICT (UTC+7) on 27 Nov 2026.
export const scenarioDate = (tMin) => new Date(Date.UTC(2026, 10, 27, 8, 0, 0) + tMin * 60000);
