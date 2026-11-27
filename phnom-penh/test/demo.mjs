// A silent demo recording at phone size, and timings with the CPU slowed 4× (a rough stand-in for a
// mid-range Android; not a measurement on one). node test/demo.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../dist/arun-phnom-penh.html', import.meta.url));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(file)); }).listen(0);
const base = `http://localhost:${srv.address().port}/`;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
// timings, CPU 4× slower
const timing = {};
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now(); await page.goto(base + '?nointro&tier=low');
  await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  timing.readyMs = await page.evaluate(() => window.__ready.ms); timing.loadToReadyMs = Date.now() - t0;
  await page.waitForTimeout(3000); timing.fpsIdle = Math.round(await page.evaluate(() => window.__world.fps));
  await page.click('#play'); await page.waitForTimeout(4000); timing.fpsPlaying = Math.round(await page.evaluate(() => window.__world.fps));
  const r0 = Date.now(); await page.evaluate(() => window.__CTX.setSeed(2)); timing.rerunMs = Date.now() - r0;
  await ctx.close();
}
console.log('CPU 4×, tier low, DPR 2.6:', timing);
// recording: the opening, then a few touches
mkdirSync('test/results/video', { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, recordVideo: { dir: 'test/results/video', size: { width: 390, height: 844 } } });
const page = await ctx.newPage();
await page.goto(base);
await page.waitForTimeout(18500);
const tap = async (sel, ms = 2200) => { await page.click(sel); await page.waitForTimeout(ms); };
await tap('.more', 2600);
await tap('.dtabs button[data-d="2"]', 3000);
await tap('.dtabs button[data-d="3"]', 3000);
await page.evaluate(() => { window.__CTX.setT(100, true); window.__CTX.openLens('camera', 'c7', 1); });
await page.waitForTimeout(7500);
await page.evaluate(() => window.__CTX.openLens('river', 'river', 1)); await page.waitForTimeout(2500);
await page.$$eval('#sheetBody input[type=range]', els => { const el = els[els.length - 1]; let v = 11.5; const step = () => { v -= 0.25; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); if (v > 8) setTimeout(step, 60); }; step(); });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__CTX.openLens('compute', 'compute', 3)); await page.waitForTimeout(2500);
await page.click('text=Mekong basin'); await page.waitForTimeout(2500);
await page.evaluate(() => window.__CTX.closeLens()); await page.click('#lang'); await page.waitForTimeout(2500);
await ctx.close();
const vid = readdirSync('test/results/video').filter(f => f.endsWith('.webm')).map(f => 'test/results/video/' + f).sort().pop();
renameSync(vid, 'test/results/demo.webm');
writeFileSync('test/results/timing.json', JSON.stringify({ ranAt: new Date().toISOString(), note: 'Chrome for Testing on an Apple M2 with the CPU slowed 4× by DevTools; GPU not slowed. Not a phone.', ...timing }, null, 1));
await browser.close(); srv.close();
