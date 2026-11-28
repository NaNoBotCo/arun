// One real Mapbox check, by hand, on the local build: node test/touch-drive-real.mjs dist/arun-touch.html <outDir> [junction index]
// Makes exactly one Directions request; prints the result and saves a screenshot (no Mapbox data written to disk).
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
const [file, out, ji = '0'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const srv = createServer((q, r) => {
  const m = q.url.match(/^\/pano\/(J-\d+\.jpg)/);
  if (m) { try { r.writeHead(200, { 'content-type': 'image/jpeg' }); r.end(readFileSync(new URL('../data/panos/' + m[1], import.meta.url))); } catch { r.writeHead(404); r.end(); } return; }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(file));
}).listen(0);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); let n = 0; const errs = [];
page.on('request', q => { if (q.url().startsWith('https://api.mapbox.com/')) n++; });
page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://localhost:${srv.address().port}/?lang=en&nocoach`);
await page.waitForFunction(() => window.__ready && window.__ready.full, null, { timeout: 30000 });
await page.evaluate(i => __touch.open({ kind: 'j', i }), +ji); await page.waitForTimeout(600);
await page.tap('#drive-b');
await page.waitForFunction(() => { const o = document.querySelector('#drive-o'); return o && !/Asking/.test(o.innerText) && o.innerText.trim(); }, null, { timeout: 15000 });
await page.waitForTimeout(1600);
console.log('requests to Mapbox', n);
console.log((await page.textContent('#drive-o')).replace(/\s+/g, ' ').trim());
await page.evaluate(() => document.querySelector('#drive-o').scrollIntoView({ block: 'end' })); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/real-result.png` });
await page.evaluate(() => document.querySelector('#card').scrollTop = 0); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/real-map.png` });
console.log('errors', JSON.stringify(errs));
await browser.close(); srv.close();
