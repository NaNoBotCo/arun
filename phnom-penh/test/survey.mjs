// Screenshot every lens at every depth: node test/survey.mjs [w h]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../dist/arun-phnom-penh.html', import.meta.url));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(file)); }).listen(0);
const [w = '390', h = '844', lang = 'en'] = process.argv.slice(2);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: true, isMobile: +w < 700 });
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://localhost:${srv.address().port}/?shot=1&nointro&lang=${lang}`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
const dir = `test/results/survey-${w}x${h}-${lang}`; mkdirSync(dir, { recursive: true });
const cases = [['facility', 'fac'], ['camera', 'c4'], ['gauge', 'g4'], ['place', { x: -3000, y: 200 }], ['river', 'river'], ['compute', 'compute'], ['landmark', 'royal-palace']];
await page.waitForTimeout(800); await page.screenshot({ path: `${dir}/00-home.png` });
for (const [type, id] of cases) for (const d of [1, 2, 3]) {
  await page.evaluate(([type, id, d]) => window.__CTX.openLens(type, id, d), [type, id, d]);
  await page.waitForTimeout(type === 'camera' && d === 1 ? 6500 : 1600);
  await page.screenshot({ path: `${dir}/${type}-${d}.png` });
}
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close(); srv.close();
