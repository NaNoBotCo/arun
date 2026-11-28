// Two-finger gestures on the map, as real touch events: twist turns, two fingers up or down tilt, pinch zooms,
// one finger pans, a tap still opens a card. node test/touch-gestures.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync('dist/arun-touch.html')); }).listen(0);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://localhost:${srv.address().port}/?nocoach`);
await page.waitForFunction(() => window.__ready && window.__ready.full, null, { timeout: 30000 });
const cdp = await ctx.newCDPSession(page);
const cam = () => page.evaluate(() => { const c = __world.ctrl; return { az: c.az, el: c.el, dist: c.dist, x: c.target.x, z: c.target.z }; });
const two = async (from, to, steps = 14) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: from.map(([x, y], id) => ({ x, y, id })) });
  for (let s = 1; s <= steps; s++) { const u = s / steps; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: from.map(([x, y], id) => ({ x: x + (to[id][0] - x) * u, y: y + (to[id][1] - y) * u, id })) }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(250);
};
const R = []; const check = (name, ok, note) => { R.push({ name, ok, note }); console.log(ok ? 'ok  ' : 'FAIL', name, note); };
let a = await cam();
// twist: fingers turn 50° about the centre
const c = [195, 420], rad = 90, t0 = -0.4, t1 = t0 + 0.87;
await two([[c[0] + rad * Math.cos(t0), c[1] + rad * Math.sin(t0)], [c[0] - rad * Math.cos(t0), c[1] - rad * Math.sin(t0)]], [[c[0] + rad * Math.cos(t1), c[1] + rad * Math.sin(t1)], [c[0] - rad * Math.cos(t1), c[1] - rad * Math.sin(t1)]]);
let b = await cam();
check('twist turns the map, tilt unchanged', Math.abs(b.az - a.az) > 0.5 && Math.abs(b.el - a.el) < 0.02, `az ${(a.az).toFixed(2)} → ${(b.az).toFixed(2)}, el ${a.el.toFixed(2)} → ${b.el.toFixed(2)}`);
// tilt: both fingers move down together
a = b; await two([[140, 360], [250, 360]], [[140, 480], [250, 480]]); b = await cam();
check('two fingers down tilt the map, no turn', Math.abs(b.el - a.el) > 0.3 && Math.abs(b.az - a.az) < 0.02, `el ${a.el.toFixed(2)} → ${b.el.toFixed(2)}, az ${a.az.toFixed(2)} → ${b.az.toFixed(2)}`);
a = b; await two([[140, 480], [250, 480]], [[140, 330], [250, 330]]); b = await cam();
check('two fingers up tilt it back', b.el < a.el - 0.3, `el ${a.el.toFixed(2)} → ${b.el.toFixed(2)}`);
// pinch out zooms in
a = b; await two([[175, 420], [215, 420]], [[95, 420], [295, 420]]); b = await cam();
check('pinch out zooms in, no tilt', b.dist < a.dist * 0.5 && Math.abs(b.el - a.el) < 0.02, `dist ${a.dist.toFixed(0)} → ${b.dist.toFixed(0)}`);
// one finger pans
a = b; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] });
for (let s = 1; s <= 10; s++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 + 8 * s, y: 400 + 5 * s }] }); await page.waitForTimeout(16); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(250); b = await cam();
check('one finger pans, no card opens', Math.hypot(b.x - a.x, b.z - a.z) > 20 && !(await page.evaluate(() => __S.sel)), `moved ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(0)} m`);
// compass back to north; 360° spins until touched
await page.tap('#compass'); await page.waitForTimeout(900); b = await cam();
check('compass turns north up', Math.abs(b.az) < 0.01, `az ${b.az.toFixed(3)}`);
await page.tap('#orbit'); await page.waitForTimeout(1500); const o = await cam();
check('360° spins the city', Math.abs(o.az - b.az) > 0.3, `az ${b.az.toFixed(2)} → ${o.az.toFixed(2)}`);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 300 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(600); const o2 = await cam(); await page.waitForTimeout(600); const o3 = await cam();
check('a touch stops the spin', Math.abs(o3.az - o2.az) < 0.001, `az ${o2.az.toFixed(3)} → ${o3.az.toFixed(3)}`);
check('no page errors', errs.length === 0, JSON.stringify(errs));
writeFileSync('test/results/touch/gestures.json', JSON.stringify(R, null, 1));
console.log(`${R.filter(r => r.ok).length}/${R.length}`);
await browser.close(); srv.close();
