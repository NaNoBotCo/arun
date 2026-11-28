// Does Mapbox have measured (live) road speeds for Phnom Penh? A one-off evaluation check.
// node tools/probe-mapbox-traffic.mjs          (token: ~/.tokens/MAPBOX_TOKEN)
//
// Asks the Directions API (driving-traffic) for six short drives between camera corners and prints,
// per drive, how much of the road has a known congestion level and how far the live time is from the
// typical time. Results are printed only, never written to disk: Mapbox Product Terms 2.10.1 bar
// storing or caching Navigation API results.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const tokFile = `${homedir()}/.tokens/MAPBOX_TOKEN`;
if (!existsSync(tokFile)) { console.error('no MAPBOX_TOKEN yet: copy the token, then run  token save MAPBOX_TOKEN'); process.exit(2); }
const token = readFileSync(tokFile, 'utf8').trim();

const R = p => new URL('../' + p, import.meta.url);
const geo = JSON.parse(readFileSync(R('data/geo.json')));
const panos = JSON.parse(readFileSync(R('data/panos.json'))).panos;
const ll = p => [geo.origin.lon + p.x / geo.kx, geo.origin.lat + p.y / geo.ky];
const ids = Object.keys(panos).sort();

// Six pairs of corners 1.2–4 km apart, each corner used once where possible.
const used = new Set(), pairs = [];
for (const a of ids) {
  if (used.has(a) || pairs.length >= 6) continue;
  let best = null;
  for (const b of ids) {
    if (b === a || used.has(b)) continue;
    const d = Math.hypot(panos[a].x - panos[b].x, panos[a].y - panos[b].y);
    if (d >= 1200 && d <= 4000 && (!best || d < best.d)) best = { b, d };
  }
  if (best) { used.add(a); used.add(best.b); pairs.push([a, best.b, best.d]); }
}

const rows = [];
for (const [a, b, d] of pairs) {
  const [x0, y0] = ll(panos[a]), [x1, y1] = ll(panos[b]);
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${x0.toFixed(5)},${y0.toFixed(5)};${x1.toFixed(5)},${y1.toFixed(5)}`
    + `?annotations=congestion,speed&overview=full&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const js = await r.json().catch(() => ({}));
  if (!r.ok || js.code !== 'Ok') { rows.push({ a, b, error: `${r.status} ${js.code || ''} ${js.message || ''}`.trim() }); continue; }
  const rt = js.routes[0], cong = rt.legs.flatMap(l => l.annotation?.congestion || []);
  const by = {}; for (const c of cong) by[c] = (by[c] || 0) + 1;
  const known = cong.length ? 1 - (by.unknown || 0) / cong.length : 0;
  rows.push({ a, b, km: +(rt.distance / 1000).toFixed(1), min: +(rt.duration / 60).toFixed(1),
    typicalMin: rt.duration_typical != null ? +(rt.duration_typical / 60).toFixed(1) : null,
    knownPct: Math.round(known * 100), levels: by });
}

console.log(`Phnom Penh, ${new Date().toISOString().slice(0, 16)}Z, Mapbox driving-traffic\n`);
for (const r of rows) {
  if (r.error) { console.log(`${r.a} → ${r.b}  error: ${r.error}`); continue; }
  const gap = r.typicalMin ? Math.round((r.min / r.typicalMin - 1) * 100) : null;
  console.log(`${r.a} → ${r.b}  ${r.km} km  now ${r.min} min  typical ${r.typicalMin ?? '—'} min  (${gap == null ? '—' : (gap >= 0 ? '+' : '') + gap + '%'})  road with a known level ${r.knownPct}%  ${JSON.stringify(r.levels)}`);
}
const ok = rows.filter(r => !r.error);
if (!ok.length) process.exit(1);
const known = ok.reduce((s, r) => s + r.knownPct, 0) / ok.length;
const moved = ok.filter(r => r.typicalMin && Math.abs(r.min / r.typicalMin - 1) > 0.05).length;
console.log(`\nAverage road with a known congestion level: ${Math.round(known)}%. Drives where now differs from typical by more than 5%: ${moved} of ${ok.length}.`);
console.log(known >= 50 ? (moved ? 'Looks like measured speeds: levels are known and live times move away from typical.'
  : 'Levels are known but live equals typical: likely typical (historical) speeds, not live. Run again at rush hour.')
  : 'Mostly unknown: Mapbox has little or no traffic data on these roads.');
