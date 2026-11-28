// "Then" photos: for each junction that has a current 360° photo, an older 360° photo of the same spot (Mapillary, CC BY-SA 4.0).
// MAPILLARY_TOKEN=… node tools/fetch-panos-old.mjs → data/panos-old/J-xx.jpg + data/panos-old.json
// Picks the panorama nearest the current photo's position that is at least two years older, within 35 m.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const tok = process.env.MAPILLARY_TOKEN; if (!tok) { console.error('MAPILLARY_TOKEN missing'); process.exit(2); }
const R = p => new URL('../' + p, import.meta.url);
const geo = JSON.parse(readFileSync(R('data/geo.json')));
const cur = JSON.parse(readFileSync(R('data/panos.json'))).panos;
mkdirSync(R('data/panos-old/'), { recursive: true });
const out = {};
for (const [id, p] of Object.entries(cur)) {
  const lon = geo.origin.lon + p.x / geo.kx, lat = geo.origin.lat + p.y / geo.ky, d = 0.0004;
  const before = Date.parse(p.date) - 2 * 3.156e10;
  const u = `https://graph.mapillary.com/images?fields=id,is_pano,captured_at,computed_compass_angle,compass_angle,computed_geometry,geometry,creator,thumb_2048_url&is_pano=true&end_captured_at=${new Date(before).toISOString()}&bbox=${lon - d},${lat - d},${lon + d},${lat + d}&limit=200`;
  const js = await (await fetch(u, { headers: { Authorization: 'OAuth ' + tok } })).json();
  const best = (js.data || []).filter(x => x.is_pano && x.thumb_2048_url && x.captured_at <= before).map(x => {
    const [plon, plat] = (x.computed_geometry || x.geometry).coordinates;
    return { x, dist: Math.hypot((plon - lon) * geo.kx, (plat - lat) * geo.ky) };
  }).filter(o => o.dist <= 35).sort((a, b) => a.dist - b.dist)[0];
  if (!best) { console.log(id, 'no older panorama nearby'); continue; }
  const f = fileURLToPath(R(`data/panos-old/${id}.jpg`));
  writeFileSync(f, Buffer.from(await (await fetch(best.x.thumb_2048_url)).arrayBuffer()));
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '-Z', '2048', f, '--out', f], { stdio: 'ignore' });
  out[id] = { id: best.x.id, date: new Date(best.x.captured_at).toISOString().slice(0, 10), by: best.x.creator?.username || '', heading: best.x.computed_compass_angle ?? best.x.compass_angle ?? 0,
    dist: Math.round(best.dist), kb: Math.round(readFileSync(f).length / 1024) };
  console.log(id, out[id].date, 'vs', p.date, out[id].dist + ' m apart', out[id].by, out[id].kb + ' kB');
}
writeFileSync(R('data/panos-old.json'), JSON.stringify({ source: 'Mapillary', licence: 'CC BY-SA 4.0', fetched: new Date().toISOString().slice(0, 10), panos: out }, null, 1));
console.log(Object.keys(out).length, 'of', Object.keys(cur).length, 'corners have a "then" photo');
