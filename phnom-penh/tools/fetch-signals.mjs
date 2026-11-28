// Traffic lights from OpenStreetMap (ODbL) inside the map's extent → data/signals.json (local metres).
// node tools/fetch-signals.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const R = p => new URL('../' + p, import.meta.url);
const geo = JSON.parse(readFileSync(R('data/geo.json'))), e = geo.extent;
const q = `[out:json][timeout:60];node["highway"="traffic_signals"](${e.south},${e.west},${e.north},${e.east});out;`;
const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'arun-demo-build/1.0' } });
const js = await r.json();
const pts = js.elements.map(n => [Math.round((n.lon - geo.origin.lon) * geo.kx), Math.round((n.lat - geo.origin.lat) * geo.ky), n.id % 997]);
writeFileSync(R('data/signals.json'), JSON.stringify({ source: 'OpenStreetMap contributors', licence: 'ODbL 1.0', fetched: new Date().toISOString().slice(0, 10), n: pts.length, pts }));
console.log('traffic lights', pts.length, 'extent', JSON.stringify(e));
