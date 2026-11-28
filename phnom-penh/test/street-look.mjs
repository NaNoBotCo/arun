// Frames and timing for the junction street view: node test/street-look.mjs [outDir]
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'test/results/touch/street';
mkdirSync(out, { recursive: true });
const bundle = await build({
  stdin: { contents: `import { createStreetView } from './src/touch/street.js';
    window.__make = (w, h, cfg, warm) => {
      document.body.innerHTML = '<canvas id="c" style="width:' + w + 'px;height:' + h + 'px;display:block"></canvas>';
      const c = document.getElementById('c'); c.width = w * 2; c.height = h * 2;
      const v = createStreetView(c, { seed: cfg.seed || 1, node: 'J-01', lang: cfg.lang || 'en' });
      v.set({ ...cfg, still: true }); v.step(warm || 6); v.render(); window.__v = v; return JSON.stringify({ counts: v.counts(), packet: v.packet(), bytes: v.packetBytes() });
    };
    window.__time = (w, h, cfg, n) => {
      document.body.innerHTML = '<canvas id="c" style="width:' + w + 'px;height:' + h + 'px"></canvas>';
      const c = document.getElementById('c'); c.width = w; c.height = h;
      const v = createStreetView(c, { seed: 1 }); v.set({ ...cfg, still: true }); v.step(5); v.render();
      const ctx = c.getContext('2d'); const ts = []; 
      for (let i = 0; i < n; i++) { const t0 = performance.now(); v.step(1 / 30); v.render(); ts.push(performance.now() - t0); }
      ctx.getImageData(0, 0, 1, 1);
      const t1 = performance.now(); for (let i = 0; i < n; i++) { v.step(1 / 30); v.render(); } ctx.getImageData(0, 0, 1, 1); const flushed = (performance.now() - t1) / n;
      ts.sort((a, b) => a - b); return JSON.stringify({ median: ts[n >> 1], p95: ts[Math.floor(n * 0.95)], flushed });
    };`, resolveDir: process.cwd(), loader: 'js' },
  bundle: true, write: false, format: 'iife', platform: 'browser',
});
const code = bundle.outputFiles[0].text;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 700, height: 400 }, deviceScaleFactor: 2 });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.setContent('<html><body style="margin:0;background:#111"></body></html>');
await page.addScriptTag({ content: code });
// minute = minutes after 15:00 27 Nov
const at = (h, m, dayOff = 0) => (h * 60 + m) - 15 * 60 + dayOff * 1440;
const cases = [
  ['1-rush-0740', 390, 240, { minute: at(7, 40, 1), volume: 90, rain: 0, water: 0, pm25: 85, divider: 0.5 }],
  ['2-night-0300', 390, 240, { minute: at(3, 0, 1), volume: 7, rain: 0, water: 0, pm25: 35, divider: 0.5 }],
  ['3-rain-1610', 390, 240, { minute: at(16, 10), volume: 60, rain: 60, water: 18, pm25: 40, divider: 0.35 }],
  ['4a-midday-camera', 390, 240, { minute: at(12, 30, 1), volume: 55, rain: 0, water: 0, pm25: 25, divider: 1.0 }],
  ['4b-midday-edge', 390, 240, { minute: at(12, 30, 1), volume: 55, rain: 0, water: 0, pm25: 25, divider: 0.0 }],
  ['5-dusk-1830-rain5', 390, 240, { minute: at(18, 30), volume: 85, rain: 5, water: 1, pm25: 60, divider: 0.5 }],
  ['6-small-360x220', 360, 220, { minute: at(7, 40, 1), volume: 90, rain: 0, water: 0, pm25: 85, divider: 0.5 }],
  ['7-wide-640x300', 640, 300, { minute: at(18, 30), volume: 85, rain: 5, water: 1, pm25: 60, divider: 0.5 }],
  ['8-night-rain', 390, 240, { minute: at(22, 0), volume: 40, rain: 25, water: 6, pm25: 60, divider: 0.5 }],
  ['10-rush-ew-queue', 390, 240, { minute: at(7, 40, 1), volume: 90, rain: 0, water: 0, pm25: 85, divider: 0.0 }, 50],
  ['9-haze-250', 390, 240, { minute: at(10, 0, 1), volume: 70, rain: 0, water: 0, pm25: 250, divider: 0.5 }],
];
const only = process.argv[3];
for (const [name, w, h, cfg, warm] of cases) {
  if (only && !name.includes(only)) continue;
  const r = await page.evaluate(([w, h, cfg, warm]) => window.__make(w, h, cfg, warm), [w, h, cfg, warm || 8]);
  await page.locator('#c').screenshot({ path: `${out}/${name}.png` });
  const j = JSON.parse(r); console.log(name, JSON.stringify(j.counts.perMin), 'faces', j.counts.faces, 'missed', j.counts.coversMissed, 'q', JSON.stringify(j.counts.queueM), j.packet.quality, j.bytes + 'B');
}
if (!only) {
  const t = await page.evaluate(() => window.__time(780, 480, { minute: 1000, volume: 90, rain: 0, water: 0, pm25: 85, divider: 0.5 }, 150));
  console.log('ms/frame 780x480 rush', t);
  const t2 = await page.evaluate(() => window.__time(780, 480, { minute: 70, volume: 60, rain: 60, water: 18, pm25: 40, divider: 0.35 }, 150));
  console.log('ms/frame 780x480 rain', t2);
}
console.log('errors', JSON.stringify(errs));
await browser.close();
