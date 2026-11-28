// Live drive times, checked against a made-up Mapbox reply (no real Mapbox calls): node test/touch-drive.mjs dist/arun-touch.html <outDir>
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const [file, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const srv = createServer((q, r) => {
  const m = q.url.match(/^\/pano\/(J-\d+\.jpg)/);
  if (m) { try { r.writeHead(200, { 'content-type': 'image/jpeg' }); r.end(readFileSync(new URL('../data/panos/' + m[1], import.meta.url))); } catch { r.writeHead(404); r.end(); } return; }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(file));
}).listen(0);
const base = `http://localhost:${srv.address().port}/`;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = [], outside = [], asks = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('request', q => { const u = new URL(q.url()); if (u.hostname !== 'localhost' && !u.protocol.startsWith('data')) outside.push(u.hostname); });
// the made-up reply: a bent line between the two corners asked for, four congestion levels, 10 min now against 8 usually
let mode = 'ok';
await ctx.route('https://arun-live.nanobotco.workers.dev/**', r => r.abort());  // the air card in the story asks the worker; refused here
await ctx.route('https://api.mapbox.com/**', route => {
  const u = new URL(route.request().url()); asks.push(u);
  if (mode === 'limit') return route.fulfill({ status: 429, contentType: 'application/json', body: '{"message":"Too Many Requests"}' });
  const [[x0, y0], [x1, y1]] = u.pathname.split('/').pop().split(';').map(s => s.split(',').map(Number));
  const n = 24, coords = [...Array(n)].map((_, i) => { const t = i / (n - 1); return [x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * 0.004, y0 + (y1 - y0) * t]; });
  const cong = coords.slice(1).map((_, i) => ['low', 'low', 'moderate', 'heavy', 'unknown', 'low'][i % 6]);
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ distance: 2700, duration: 600, duration_typical: 480, geometry: { type: 'LineString', coordinates: coords }, legs: [{ annotation: { congestion: cong } }] }] }) });
});
const R = {}; const ok = (k, v) => { R[k] = v; console.log(v ? '✓' : '✗', k); };
await page.goto(base + '?lang=en&nocoach');
await page.waitForFunction(() => (window.__ready && window.__ready.full) || window.__error, null, { timeout: 30000 });
await page.waitForTimeout(800);
ok('no Mapbox call on load', asks.length === 0);
await page.evaluate(() => __touch.open({ kind: 'j', i: 0 })); await page.waitForTimeout(500);
const lbl = await page.textContent('#drive-b');
ok('button names the next corner', /^Check the drive to J-\d\d now$/.test(lbl));
ok('no Mapbox call on opening the card', asks.length === 0);
const az0 = await page.evaluate(() => __world.ctrl.dist);
await page.tap('#drive-b'); await page.waitForSelector('#drive-o .verdict', { timeout: 8000 }); await page.waitForTimeout(1500);
const q = asks[0];
ok('one call, driving-traffic, congestion, full geometry, pk token', asks.length === 1 && q.pathname.includes('/driving-traffic/') && q.searchParams.get('annotations') === 'congestion' && q.searchParams.get('overview') === 'full' && q.searchParams.get('geometries') === 'geojson' && (q.searchParams.get('access_token') || '').startsWith('pk.'));
const res = await page.evaluate(() => ({ t: document.querySelector('#drive-o').innerText, logo: (() => { const l = document.querySelector('.mb-logo'), r = l.getBoundingClientRect(); return { w: r.width, h: r.height, bg: getComputedStyle(l).backgroundImage.slice(0, 30) }; })(), links: [...document.querySelectorAll('#drive-o a')].map(a => a.href), route: __touch.route(), dist: __world.ctrl.dist }));
ok('now 10 min, usually 8 min, 25% slower', /Now 10 min/.test(res.t) && /Usually\s+8 min/.test(res.t) && /25% slower than usual/.test(res.t));
ok('colour key with shares', /Light \d+%/.test(res.t) && /Moderate \d+%/.test(res.t) && /Heavy \d+%/.test(res.t) && /No data \d+%/.test(res.t));
ok('Mapbox logo shown 88×23', res.logo.w === 88 && res.logo.h === 23 && res.logo.bg.startsWith('url("data:image/svg'));
ok('credit links: Mapbox, OpenStreetMap, Improve this map', res.links.some(h => h.startsWith('https://www.mapbox.com/about/maps')) && res.links.some(h => h.startsWith('https://www.openstreetmap.org/copyright')) && res.links.some(h => h.startsWith('https://apps.mapbox.com/feedback/#/104.')));
ok('road-sign line shown', /follow road signs, traffic lights and the law/.test(res.t));
ok('route drawn and camera framed it', res.route && Math.abs(res.dist - az0) > 1);
await page.screenshot({ path: `${out}/drive-result.png` });
await page.evaluate(() => document.querySelector('#card').scrollTop = 0); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/drive-map.png` });
const lbl2 = await page.textContent('#drive-b');
ok('button moves on to another corner', lbl2 !== lbl && /^Check the drive to J-\d\d now$/.test(lbl2));
await page.evaluate(() => __touch.close()); await page.waitForTimeout(300);
ok('closing the card removes the route', !(await page.evaluate(() => __touch.route())));
mode = 'limit';
await page.evaluate(() => __touch.open({ kind: 'j', i: 3 })); await page.waitForTimeout(300); await page.tap('#drive-b'); await page.waitForTimeout(800);
ok('monthly limit message', /free Mapbox checks are used up/.test(await page.textContent('#drive-o')));
mode = 'ok'; await ctx.setOffline(true); await page.waitForTimeout(200);
const before = asks.length; await page.tap('#drive-b'); await page.waitForTimeout(600);
ok('offline message, no call', /No internet/.test(await page.textContent('#drive-o')) && asks.length === before);
await ctx.setOffline(false); await page.waitForTimeout(200);
await page.evaluate(() => __touch.open({ kind: 'traffic' })); await page.waitForTimeout(300);
ok('traffic card no longer says live traffic is missing', !/not in this demo/.test(await page.textContent('#card-body')));
const n0 = asks.length; await page.tap('#tr-live'); await page.waitForSelector('#drive-o .verdict', { timeout: 8000 });
ok('traffic card button opens a camera and checks a drive', asks.length === n0 + 1 && await page.evaluate(() => __touch.S.sel.kind === 'j'));
await page.evaluate(() => __touch.close()); await page.waitForTimeout(300);
// the story: one step asks Mapbox, only when Next is pressed
const steps = await page.evaluate(() => __touch.story()); let liveStep = -1;
for (let i = 1; i <= steps; i++) {
  const a0 = asks.length; await page.evaluate(() => __touch.next()); await page.waitForTimeout(1800);
  if (asks.length > a0) { liveStep = i; await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/story-live.png` }); }
}
ok(`story has a live step (${steps} steps, live at ${liveStep})`, liveStep > 0);
// Khmer and Thai
for (const l of ['km', 'th']) {
  await page.goto(base + `?lang=${l}&nocoach`); await page.waitForFunction(() => window.__ready && window.__ready.full, null, { timeout: 30000 });
  await page.evaluate(() => __touch.open({ kind: 'j', i: 1 })); await page.waitForTimeout(300); await page.tap('#drive-b'); await page.waitForSelector('#drive-o .verdict', { timeout: 8000 }); await page.waitForTimeout(400);
  const t = await page.textContent('#card-body');
  ok(`${l}: words in ${l}`, l === 'km' ? /ពិនិត្យ/.test(t) && /យឺត/.test(t) : /เช็ก/.test(t) && /ช้ากว่าปกติ/.test(t));
  await page.screenshot({ path: `${out}/drive-${l}.png` });
}
ok('no outside requests except Mapbox and the live worker (none real)', outside.every(h => h === 'api.mapbox.com' || h === 'arun-live.nanobotco.workers.dev'));
ok('no errors', errs.filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length === 0);
if (errs.length) console.log(errs);
writeFileSync(`${out}/drive.json`, JSON.stringify(R, null, 1));
console.log(Object.values(R).filter(Boolean).length + '/' + Object.keys(R).length);
await browser.close(); srv.close();
