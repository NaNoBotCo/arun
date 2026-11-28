// ARUN live: real readings for the Phnom Penh page (nanobotco.github.io/arun/city/), cached 10 minutes.
// GET /now → { at, air: [{ name, lat, lon, pm25, at, by, licence }], weather: { t, rain, rh, wind, at }, sources }
// The OpenAQ key stays here as a secret (OPENAQ_KEY); OpenAQ's terms say not to share it.
const OAQ = 'https://api.openaq.org/v3';
const PP = { lat: 11.5564, lon: 104.9282 };
const SITE = 'https://nanobotco.github.io';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), origin = req.headers.get('origin') || '';
    const allow = origin === SITE || /^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : SITE;
    const cors = { 'access-control-allow-origin': allow, vary: 'origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'access-control-allow-methods': 'GET' } });
    if (url.pathname !== '/now') return new Response('not found', { status: 404, headers: cors });
    const cache = caches.default, key = new Request('https://arun-live.cache/now');
    let res = await cache.match(key);
    if (!res) {
      res = new Response(JSON.stringify(await build(env)), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600' } });
      ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};

async function build(env) {
  const H = { 'X-API-Key': env.OPENAQ_KEY, 'user-agent': 'arun-live/1.0' };
  const air = [];
  try {
    const locs = await (await fetch(`${OAQ}/locations?coordinates=${PP.lat},${PP.lon}&radius=25000&parameters_id=2&limit=100`, { headers: H })).json();
    const fresh = (locs.results || []).filter(l => l.datetimeLast && Date.now() - Date.parse(l.datetimeLast.utc) < 3 * 3600e3);
    for (const l of fresh.slice(0, 8)) {
      const pm = (l.sensors || []).find(s => s.parameter && s.parameter.name === 'pm25'); if (!pm) continue;
      const lt = await (await fetch(`${OAQ}/locations/${l.id}/latest`, { headers: H })).json();
      const m = (lt.results || []).find(r => r.sensorsId === pm.id); if (!m || m.value < 0) continue;
      air.push({ name: l.name, lat: l.coordinates.latitude, lon: l.coordinates.longitude, pm25: Math.round(m.value * 10) / 10, at: m.datetime.utc,
        by: (l.provider && l.provider.name) || '', licence: (l.licenses && l.licenses[0] && l.licenses[0].name) || '' });
    }
  } catch { /* the page shows what came back */ }
  let weather = null;
  try {
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${PP.lat}&longitude=${PP.lon}&current=temperature_2m,rain,relative_humidity_2m,wind_speed_10m&timezone=Asia%2FPhnom_Penh`)).json();
    const c = w.current; weather = { t: c.temperature_2m, rain: c.rain, rh: c.relative_humidity_2m, wind: c.wind_speed_10m, at: c.time };
  } catch { /* none */ }
  return { at: new Date().toISOString(), air, weather, sources: { air: 'OpenAQ', weather: 'Open-Meteo' } };
}
