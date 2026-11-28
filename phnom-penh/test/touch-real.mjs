// Real data on existing touches, against made-up replies for the live worker and Mapbox: node test/touch-real.mjs dist/arun-touch.html <outDir>
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const [file, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const DIRS = { pano: 'panos', 'pano-then': 'panos-old', photo: 'photos' };
const srv = createServer((q, r) => {
  const m = q.url.match(/^\/(pano|pano-then|photo)\/([\w-]+\.(jpg|webp))/);
  if (m) { try { r.writeHead(200, { 'content-type': m[3] === 'jpg' ? 'image/jpeg' : 'image/webp' }); r.end(readFileSync(new URL(`../data/${DIRS[m[1]]}/${m[2]}`, import.meta.url))); } catch { r.writeHead(404); r.end(); } return; }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(file));
}).listen(0);
const base = `http://localhost:${srv.address().port}/`;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = [], calls = { live: 0, iso: 0 }; let isoUrl = null;
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await ctx.route('https://arun-live.nanobotco.workers.dev/**', route => { calls.live++; route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
  at: new Date().toISOString(), air: [{ name: 'Test sensor A', lat: 11.57, lon: 104.92, pm25: 12.4, at: new Date().toISOString(), by: 'AirGradient', licence: 'CC BY 4.0' }, { name: 'Test sensor B', lat: 11.55, lon: 104.93, pm25: 41, at: new Date().toISOString(), by: 'AirGradient', licence: 'CC BY 4.0' }],
  weather: { t: 27.6, rain: 0.4, rh: 80, wind: 12, at: '2026-11-28T19:45' } }) }); });
await ctx.route('https://api.mapbox.com/isochrone/**', route => {
  calls.iso++; isoUrl = new URL(route.request().url());
  const [lon, lat] = isoUrl.pathname.split('/').pop().split(',').map(Number), d = 0.02;
  const ring = [[lon - d, lat - d], [lon + d, lat - d], [lon + d * 1.3, lat], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]];
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { contour: 10 }, geometry: { type: 'Polygon', coordinates: [ring] } }] }) });
});
const R = {}; const ok = (k, v) => { R[k] = v; console.log(v ? '✓' : '✗', k); };
await page.goto(base + '?lang=en&nocoach');
await page.waitForFunction(() => (window.__ready && window.__ready.full) || window.__error, null, { timeout: 30000 });
await page.waitForTimeout(800);
ok('nothing asked of the worker or Mapbox on load', calls.live === 0 && calls.iso === 0);
// landmarks
const far = await page.evaluate(() => [...document.querySelectorAll('.lbl.tap')].filter(e => e.style.display !== 'none').length);
await page.evaluate(() => __world.flyTo({ x: 0, y: 1500, dist: 4200, az: __world.ctrl.az, el: 0.85 }, 0)); await page.waitForTimeout(500);
const nearN = await page.evaluate(() => [...document.querySelectorAll('.lbl.tap')].filter(e => e.style.display !== 'none').length);
ok(`more place names when zoomed in (${far} far, ${nearN} near)`, nearN > far);
const lbl = await page.evaluate(() => { const e = [...document.querySelectorAll('.lbl.tap')].find(e => e.style.display !== 'none'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: e.textContent }; });
await page.touchscreen.tap(lbl.x, lbl.y); await page.waitForTimeout(1500);
const lm = await page.evaluate(() => ({ kind: __touch.S.sel && __touch.S.sel.kind, h: document.querySelector('#card-body h2')?.textContent, img: document.querySelector('.lmk-img')?.naturalWidth || 0, t: document.querySelector('.lmk-t')?.textContent || '', links: [...document.querySelectorAll('#card-body .credit a')].map(a => a.href) }));
ok(`tapping "${lbl.t}" opens its card with a real photo and text`, lm.kind === 'lmk' && lm.h === lbl.t && lm.img > 0 && lm.t.length > 40);
ok('photo credit links to Wikimedia Commons', lm.links.some(h => h.startsWith('https://commons.wikimedia.org/')));
await page.screenshot({ path: `${out}/landmark.png` });
await page.evaluate(() => __touch.close()); await page.waitForTimeout(300);
// buses
ok('bus lines hidden when far out', !(await page.evaluate(() => { __world.flyTo({ x: 0, y: 0, dist: 15000, az: 0, el: 0.8 }, 0); return new Promise(r => setTimeout(() => r(__touch.busesNear()), 300)); })));
const stop = await page.evaluate(async () => {
  const B = JSON.parse(document.getElementById('arun-data').textContent).buses, s = B.stops.find(s => s.r.length >= 2) || B.stops[0];
  __world.flyTo({ x: s.x, y: s.y, dist: 2500, az: 0, el: 1.1 }, 0); await new Promise(r => setTimeout(r, 500));
  const p = __touch.project(s.x, s.y, 13), rc = document.querySelector('#world').getBoundingClientRect(); return { x: p.x + rc.left, y: p.y + rc.top, n: s.n, lines: s.r.length };
});
ok('bus lines shown when zoomed in', await page.evaluate(() => __touch.busesNear()));
await page.touchscreen.tap(stop.x, stop.y); await page.waitForTimeout(800);
const st = await page.evaluate(() => ({ kind: __touch.S.sel && __touch.S.sel.kind, h: document.querySelector('#card-body h2')?.textContent, rows: document.querySelectorAll('#card-body .list > div').length, t: document.querySelector('#card-body').innerText }));
ok(`tapping a stop lists its ${stop.lines} lines`, st.kind === 'stop' && st.rows === stop.lines && /OpenStreetMap/.test(st.t));
await page.screenshot({ path: `${out}/bus-stop.png` });
await page.evaluate(() => __touch.close()); await page.waitForTimeout(300);
// river: what's under the blue
await page.evaluate(() => { __world.flyTo({ x: -600, y: 700, dist: 15000, az: -0.3, el: 0.9 }, 0); __touch.open({ kind: 'water' }); }); await page.waitForTimeout(400);
await page.evaluate(() => { const r = document.querySelector('#rise'); r.value = 9; r.dispatchEvent(new Event('input')); }); await page.waitForTimeout(600);
const ub = await page.evaluate(() => ({ t: document.querySelector('#rise-s').innerText, c: __touch.underBlue() }));
ok(`river +9 m counts people and places (${ub.t.split('\n')[1] || ''})`, /In the blue: about [\d,]+ people(, \d+ (schools?|hospitals?|markets?))*\./.test(ub.t) && !/ 0 /.test(ub.t) && +ub.c.p.replace(/,/g, '') > 0);
await page.screenshot({ path: `${out}/river.png` });
await page.evaluate(() => __touch.close()); await page.waitForTimeout(300);
// ten minutes by car
await page.evaluate(() => { __world.flyTo({ x: 0, y: 500, dist: 9000, az: 0, el: 0.9 }, 0); __touch.open({ kind: 'place', x: 0, y: 500 }); }); await page.waitForTimeout(400);
ok('place card offers the ten-minute drive', /10 minutes now/.test(await page.textContent('#reach-b')));
await page.tap('#reach-b'); await page.waitForSelector('#reach-o .verdict', { timeout: 8000 }); await page.waitForTimeout(1400);
const iso = await page.evaluate(() => ({ t: document.querySelector('#reach-o').innerText, logo: !!document.querySelector('#reach-o .mb-logo') }));
ok('one isochrone call: driving-traffic, 10 minutes', calls.iso === 1 && isoUrl.pathname.includes('/driving-traffic/') && isoUrl.searchParams.get('contours_minutes') === '10');
ok('drive area counts people and places, with the Mapbox logo', /In 10 minutes by car right now: about [\d,]+ people/.test(iso.t) && iso.logo);
await page.screenshot({ path: `${out}/ten-minutes.png` });
await page.evaluate(() => __touch.close()); await page.waitForTimeout(300);
// air and rain right now
await page.evaluate(() => __touch.open({ kind: 'air' })); await page.waitForSelector('#live-air .list', { timeout: 8000 }); await page.waitForTimeout(500);
const air = await page.evaluate(() => ({ t: document.querySelector('#live-air').innerText, marks: document.querySelectorAll('.lbl.sensor').length }));
ok('air card: real sensor readings with AQI and OpenAQ credit', /Test sensor A/.test(air.t) && /12\.4 µg\/m³ · AQI \d+/.test(air.t) && /OpenAQ/.test(air.t));
ok('sensor readings appear on the map', air.marks === 2);
await page.evaluate(() => document.querySelector('#live-air').scrollIntoView({ block: 'end' })); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/air-now.png` });
await page.evaluate(() => __touch.close()); await page.waitForTimeout(300);
ok('sensor marks leave with the card', (await page.evaluate(() => document.querySelectorAll('.lbl.sensor').length)) === 0);
await page.evaluate(() => __touch.open({ kind: 'rain' })); await page.waitForSelector('#live-rain .list', { timeout: 8000 });
ok('rain card: weather now with Open-Meteo credit', /27\.6 °C/.test(await page.textContent('#live-rain')) && /Open-Meteo/.test(await page.textContent('#live-rain')));
await page.evaluate(() => __touch.close()); await ctx.setOffline(true); await page.waitForTimeout(200);
await page.evaluate(() => __touch.open({ kind: 'air' })); await page.waitForTimeout(600);
ok('offline: says live readings need a connection', /No internet/.test(await page.textContent('#live-air')));
await ctx.setOffline(false); await page.evaluate(() => __touch.close()); await page.waitForTimeout(300);
// then and now
await page.evaluate(() => __touch.open({ kind: 'j', i: 0 })); await page.waitForTimeout(2500);
const tn = await page.evaluate(() => { const h = document.querySelector('.tn-h'); return { shown: h && getComputedStyle(h).display !== 'none', years: [...document.querySelectorAll('.tn-y')].map(e => e.textContent), clip: document.querySelector('.pano-cv.then')?.style.clipPath, credit: document.querySelector('#credit').innerText }; });
ok(`then and now handle at J-01 (${tn.years.join(' / ')})`, tn.shown && tn.years.length === 2 && +tn.years[0] < +tn.years[1] && /Then:/.test(tn.credit));
const hb = await page.evaluate(() => { const r = document.querySelector('.tn-h').getBoundingClientRect(), b = document.querySelector('#street').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, bx: b.x, bw: b.width }; });
await page.mouse.move(hb.x, hb.y); await page.mouse.down(); await page.mouse.move(hb.bx + hb.bw * 0.2, hb.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
const clip2 = await page.evaluate(() => document.querySelector('.pano-cv.then').style.clipPath);
ok('dragging the handle moves the divider', clip2 !== tn.clip && /inset\(0px 8\d/.test(clip2));
const b0 = await page.evaluate(() => __touch.panoBearing());
await page.mouse.move(hb.bx + hb.bw * 0.7, hb.y + 30); await page.mouse.down(); await page.mouse.move(hb.bx + hb.bw * 0.4, hb.y + 30, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
ok('dragging the photo still looks around', Math.abs((await page.evaluate(() => __touch.panoBearing())) - b0) > 5);
await page.screenshot({ path: `${out}/then-now.png` });
// Khmer and Thai
for (const l of ['km', 'th']) {
  await page.goto(base + `?lang=${l}&nocoach`); await page.waitForFunction(() => window.__ready && window.__ready.full, null, { timeout: 30000 });
  await page.evaluate(() => __touch.open({ kind: 'lmk', id: 'wat-phnom' })); await page.waitForTimeout(500);
  const t = await page.textContent('#card-body');
  ok(`${l}: landmark card in ${l}`, l === 'km' ? /វត្តភ្នំ/.test(t) : /วัดพนม/.test(t));
  await page.screenshot({ path: `${out}/landmark-${l}.png` });
}
ok('no errors', errs.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length === 0);
if (errs.length) console.log(errs.slice(0, 6));
writeFileSync(`${out}/real.json`, JSON.stringify(R, null, 1));
console.log(Object.values(R).filter(Boolean).length + '/' + Object.keys(R).length);
await browser.close(); srv.close();
