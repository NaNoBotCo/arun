// Frames of the opening: node test/intro.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../dist/arun-phnom-penh.html', import.meta.url));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(file)); }).listen(0);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errs = []; page.on('pageerror', e => errs.push(e.message));
mkdirSync('test/results/intro', { recursive: true });
const t0 = Date.now();
await page.goto(`http://localhost:${srv.address().port}/?shot=1`);
for (const s of [0.5, 2, 3.5, 5, 7, 9, 10.5, 12, 13.5, 15, 16.5, 19]) {
  const wait = s * 1000 - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: `test/results/intro/${String(Math.round(s * 10)).padStart(4, '0')}.png` });
}
console.log('errors', errs);
await browser.close(); srv.close();
