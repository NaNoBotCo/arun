// Real places and bus lines from OpenStreetMap (ODbL) inside the map's extent.
// node tools/fetch-places.mjs [places] [buses] → data/places.json (hospitals, schools, markets) and data/buses.json (routes + stops), local metres.
// Bus routes: ids from Overpass, then each route in full from the OpenStreetMap API (Overpass times out on the geometry).
import { readFileSync, writeFileSync } from 'node:fs';
const R = p => new URL('../' + p, import.meta.url);
const geo = JSON.parse(readFileSync(R('data/geo.json'))), e = geo.extent;
const bb = `(${e.south},${e.west},${e.north},${e.east})`;
const L = (lon, lat) => [Math.round((lon - geo.origin.lon) * geo.kx), Math.round((lat - geo.origin.lat) * geo.ky)];
async function overpass(q) {
  for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    const r = await fetch(host, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'arun-demo-build/1.0' } });
    if (r.ok) return r.json();
    console.error(host, r.status);
  }
  throw new Error('overpass failed');
}
const nm = t => ({ en: t['name:en'] || '', km: t['name:km'] || '', name: t.name || '' });

const ARGS = process.argv.slice(2), DO = k => !ARGS.length || ARGS.includes(k);
// ---- places ----
if (DO('places')) {
const KIND = { hospital: 'h', school: 's', marketplace: 'm' };
const pj = await overpass(`[out:json][timeout:120];(nwr["amenity"~"^(hospital|school|marketplace)$"]${bb};);out center tags;`);
const places = [];
for (const el of pj.elements) {
  const c = el.type === 'node' ? el : el.center; if (!c) continue;
  const [x, y] = L(c.lon, c.lat), t = el.tags || {};
  places.push([x, y, KIND[t.amenity], (t['name:en'] || t.name || '').slice(0, 60)]);
}
const count = k => places.filter(p => p[2] === k).length;
writeFileSync(R('data/places.json'), JSON.stringify({ source: 'OpenStreetMap contributors', licence: 'ODbL 1.0', fetched: new Date().toISOString().slice(0, 10), kinds: { h: 'hospital', s: 'school', m: 'market' }, pts: places }));
console.log('places', places.length, 'hospitals', count('h'), 'schools', count('s'), 'markets', count('m'));
}

// ---- buses ----
if (DO('buses')) {
const ids = (await overpass(`[out:json][timeout:60];relation["route"="bus"]${bb};out tags;`)).elements.map(r => r.id);
const simplify = (pts, tol = 8) => {   // Douglas–Peucker in metres
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) { const [px, py] = pts[i]; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)); const d = Math.hypot(px - ax - t * dx, py - ay - t * dy); if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
};
const routes = [], stopPts = [];
for (const id of ids) {
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`, { headers: { 'user-agent': 'arun-demo-build/1.0' } });
  if (!r.ok) { console.error('relation', id, r.status); continue; }
  const els = (await r.json()).elements;
  const N = new Map(), Wy = new Map(); let rel = null;
  for (const el of els) { if (el.type === 'node') N.set(el.id, el); else if (el.type === 'way') Wy.set(el.id, el); else if (el.id === id) rel = el; }
  if (!rel) continue;
  const t = rel.tags || {}, lines = [], ri = routes.length;
  for (const m of rel.members || []) {
    if (m.type === 'way' && !/platform/.test(m.role || '')) { const w = Wy.get(m.ref); if (w) { const pts = w.nodes.map(n => N.get(n)).filter(Boolean).map(n => L(n.lon, n.lat)); if (pts.length > 1) lines.push(simplify(pts).flat()); } }
    if (m.type === 'node' && /stop|platform/.test(m.role || '')) { const n = N.get(m.ref); if (n) { const [x, y] = L(n.lon, n.lat); stopPts.push({ x, y, r: ri, n: nm(n.tags || {}) }); } }
  }
  if (!lines.length) continue;
  routes.push({ ref: t.ref || '', name: (t['name:en'] || t.name || '').slice(0, 80), from: t.from || '', to: t.to || '', colour: /^#[0-9a-f]{6}$/i.test(t.colour || '') ? t.colour : '', lines });
  await new Promise(res => setTimeout(res, 300));
}
// stops: stop points within 30 m merge into one stop with the routes that call there
const stops = [];
for (const s of stopPts) {
  let st = stops.find(o => Math.hypot(o.x - s.x, o.y - s.y) < 30);
  if (!st) stops.push(st = { x: s.x, y: s.y, r: [], n: '' });
  if (!st.r.includes(s.r)) st.r.push(s.r);
  if (!st.n && (s.n.en || s.n.name)) st.n = (s.n.en || s.n.name).slice(0, 60);
  if (!st.km && s.n.km) st.km = s.n.km.slice(0, 60);
}
writeFileSync(R('data/buses.json'), JSON.stringify({ source: 'OpenStreetMap contributors', licence: 'ODbL 1.0', fetched: new Date().toISOString().slice(0, 10), routes, stops }));
console.log('bus routes', routes.length, 'stops', stops.length, 'named', stops.filter(s => s.n).length, 'kB', (JSON.stringify({ routes, stops }).length / 1024).toFixed(0));
}
