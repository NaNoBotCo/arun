// Walk the story button by button at phone size, one frame per step: node test/touch-story.mjs dist/arun-touch.html <outDir> [lang] [w] [h]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
const [file, out, lang = 'en', W = '390', H = '844'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const srv = createServer((q, r) => {
  const m = q.url.match(/^\/pano\/(J-\d+\.jpg)/);  // the real photos are served beside the page, as on the site
  if (m) { try { r.writeHead(200, { 'content-type': 'image/jpeg' }); r.end(readFileSync(new URL('../data/panos/' + m[1], import.meta.url))); } catch { r.writeHead(404); r.end(); } return; }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(file));
}).listen(0);
const base = `http://localhost:${srv.address().port}/`;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(base + '?lang=' + lang);
await page.waitForFunction(() => (window.__ready && window.__ready.full) || window.__error, null, { timeout: 30000 });
console.log('ready', JSON.stringify(await page.evaluate(() => window.__ready?.ms ?? window.__error)));
await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/00.png` });
const n = await page.evaluate(() => __touch.story());
for (let i = 1; i <= n; i++) {
  await page.tap('#coach-next'); await page.waitForTimeout(2800);
  await page.screenshot({ path: `${out}/${String(i).padStart(2, '0')}.png` });
  console.log(i, await page.evaluate(() => document.querySelector('#coach-t').textContent + ' | ' + document.querySelector('#alerts').innerText.replace(/\n/g, ' / ') + ' | ' + [...document.querySelectorAll('.cchip')].map(c => c.innerText.replace(/\n/g, ':')).join(' ')));
}
// back button closes an open card
await page.evaluate(() => __touch.open({ kind: 'air' })); await page.waitForTimeout(300); await page.goBack().catch(() => {}); await page.waitForTimeout(400);
console.log('back closes card', await page.evaluate(() => document.querySelector('#card').hidden), 'url', page.url());
console.log('errors', JSON.stringify(errs));
await browser.close(); srv.close();
