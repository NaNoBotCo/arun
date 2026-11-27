// Decode Mot Dang's Phnom Penh map files (NaNoBotCo/phnom-penh docs/data/base.js + core.js,
// © OpenStreetMap contributors, ODbL 1.0) into local metres around Chaktomuk.
// Writes data/geo.json. Paths stay paths: water rings are closed (nonzero fill, outer CCW,
// holes CW, per importers/harvest_osm.py); roads and streets are polylines; parks and wats are rings.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const REPO = process.env.PP_REPO || `${process.env.HOME}/Developer/claude code projects/phnom-penh`;
export const ORIGIN = { lon: 104.93, lat: 11.56 };
export const KX = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180); // m per degree lon
export const KY = 110574;                                         // m per degree lat
const EXT = { west: 104.72, south: 11.40, east: 105.05, north: 11.72 }; // wider than dem.json for the outer ring
const blob = b => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
function load(name) {
  const b = readFileSync(`${REPO}/docs/data/${name}.js`);
  const s = b.toString('utf8');
  return { obj: JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)), sha: blob(b) };
}
function decode(obj, paths) {
  const [south, west] = obj.box, q = obj.q;
  return paths.map(p => { let x = 0, y = 0; const out = []; for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; out.push([west + x / q, south + y / q]); } return out; });
}
const inExt = pts => pts.some(([lo, la]) => lo >= EXT.west && lo <= EXT.east && la >= EXT.south && la <= EXT.north);
const toM = pts => pts.flatMap(([lo, la]) => [Math.round((lo - ORIGIN.lon) * KX * 10) / 10, Math.round((la - ORIGIN.lat) * KY * 10) / 10]);
const base = load('base'), core = load('core');
const out = { origin: ORIGIN, kx: KX, ky: KY, extent: EXT, units: 'metres east (x) and north (y) of origin; flat arrays [x0,y0,x1,y1,...]',
  credit: '© OpenStreetMap contributors, ODbL 1.0', source: { repo: 'NaNoBotCo/phnom-penh', base_blob: base.sha, core_blob: core.sha } };
for (const k of ['water', 'major', 'minor']) out[k] = decode(base.obj, base.obj[k]).filter(inExt).map(toM);
for (const k of ['streets', 'parks', 'wats']) out[k] = decode(core.obj, core.obj[k]).filter(inExt).map(toM);
writeFileSync(new URL('../data/geo.json', import.meta.url), JSON.stringify(out));
console.log('geo', Object.fromEntries(['water', 'major', 'minor', 'streets', 'parks', 'wats'].map(k => [k, out[k].length])), base.sha.slice(0, 8), core.sha.slice(0, 8));
