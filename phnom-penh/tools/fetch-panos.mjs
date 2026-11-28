// Real 360° street photos for the junction cameras, from Mapillary (CC BY-SA 4.0).
// node tools/fetch-panos.mjs  → data/panos/J-xx.jpg + data/panos.json (credit, date, heading, distance)
// Needs MAPILLARY_TOKEN in the environment. Picks, per junction, the panorama nearest the junction centre,
// newer photos preferred (each year older counts as 12 m further away).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../src/touch/fixture.js';
const tok = process.env.MAPILLARY_TOKEN; if (!tok) { console.error('MAPILLARY_TOKEN missing'); process.exit(2); }
const R = p => new URL('../' + p, import.meta.url);
const geo = JSON.parse(readFileSync(R('data/geo.json')));
const fx = makeFixture(geo);
mkdirSync(R('data/panos/'), { recursive: true });
const out = {}, now = Date.now();
for (const j of fx.junctions) {
  const lon = geo.origin.lon + j.x / geo.kx, lat = geo.origin.lat + j.y / geo.ky, d = 0.0012;
  const u = `https://graph.mapillary.com/images?fields=id,is_pano,captured_at,computed_compass_angle,compass_angle,computed_geometry,geometry,creator,thumb_2048_url&is_pano=true&bbox=${lon - d},${lat - d},${lon + d},${lat + d}&limit=200`;
  const r = await fetch(u, { headers: { Authorization: 'OAuth ' + tok } }); const js = await r.json();
  const best = (js.data || []).filter(x => x.is_pano && x.thumb_2048_url).map(x => {
    const [plon, plat] = (x.computed_geometry || x.geometry).coordinates;
    const dist = Math.hypot((plon - lon) * geo.kx, (plat - lat) * geo.ky), age = (now - x.captured_at) / 3.15e10;
    return { x, dist, score: dist + 12 * age };
  }).sort((a, b) => a.score - b.score)[0];
  if (!best) { console.log(j.id, 'no panorama'); continue; }
  const img = Buffer.from(await (await fetch(best.x.thumb_2048_url)).arrayBuffer());
  const f = fileURLToPath(R(`data/panos/${j.id}.jpg`)); writeFileSync(f, img);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '-Z', '2048', f, '--out', f], { stdio: 'ignore' });
  const [plon, plat] = (best.x.computed_geometry || best.x.geometry).coordinates;
  out[j.id] = { id: best.x.id, date: new Date(best.x.captured_at).toISOString().slice(0, 10), by: best.x.creator?.username || '', heading: best.x.computed_compass_angle ?? best.x.compass_angle ?? 0,
    dist: Math.round(best.dist), x: Math.round((plon - geo.origin.lon) * geo.kx), y: Math.round((plat - geo.origin.lat) * geo.ky), kb: Math.round(readFileSync(f).length / 1024) };
  console.log(j.id, out[j.id].date, out[j.id].dist + ' m', out[j.id].by, out[j.id].kb + ' kB');
}
writeFileSync(R('data/panos.json'), JSON.stringify({ source: 'Mapillary', licence: 'CC BY-SA 4.0', fetched: new Date().toISOString().slice(0, 10), panos: out }, null, 1));
