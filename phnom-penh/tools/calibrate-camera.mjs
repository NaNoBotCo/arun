// Camera measurement table: render the drawn street (src/lenses/faceshield/scene.js) at a grid of rain
// rates, day and night, and record the rain the camera measures from its own pixels. A second set of
// conditions, never used to build the table, checks it. Writes data/camera-calibration.json.
// node tools/calibrate-camera.mjs        (Chrome for Testing, about a minute)
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const js = (await build({ stdin: { contents: "import { createFaceShieldScene } from './src/lenses/faceshield/scene.js'; window.createFaceShieldScene = createFaceShieldScene;", resolveDir: fileURLToPath(new URL('..', import.meta.url)) }, bundle: true, format: 'iife', write: false })).outputFiles[0].text;
const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#000"><canvas id=c width=716 height=448 style="width:358px;height:224px"></canvas><script>${js}</script>`;
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(0);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${srv.address().port}/`);
const t0 = Date.now();
const measure = (conds) => page.evaluate((conds) => {
  const out = [];
  for (const c of conds) {
    const cv = document.getElementById('c');
    const sc = window.createFaceShieldScene(cv, { seed: c.seed, lang: 'en' });
    sc.set({ rain: c.R, ponding: c.ponding, night: c.night, shield: 1, dissolve: 0, setting: 'default' });
    const reps = [];
    for (let k = 0; k < c.frames; k++) reps.push(sc.measureSync().rain.value);
    sc.destroy();
    out.push({ ...c, measured: reps });
  }
  return out;
}, conds);
const TABLE_R = [0, 1, 2, 3, 5, 8, 12, 18, 25, 35, 50, 70, 100];
const conds = [];
for (const night of [false, true]) for (const R of TABLE_R) for (const seed of [1, 2, 3]) conds.push({ R, night, ponding: 0.3, seed, frames: 4 });
const held = [];
for (const night of [false, true]) for (const R of [4, 10, 15, 30, 42, 60, 85]) for (const seed of [7, 8]) held.push({ R, night, ponding: 0.6, seed, frames: 2 });
const a = await measure(conds), b = await measure(held);
const stats = v => { const m = v.reduce((s, x) => s + x, 0) / v.length; return { mean: m, sd: Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1)) }; };
const table = {};
for (const night of [false, true]) table[night ? 'night' : 'day'] = TABLE_R.map(R => { const v = a.filter(c => c.R === R && c.night === night).flatMap(c => c.measured); const s = stats(v); return [R, +s.mean.toFixed(2), +s.sd.toFixed(2), v.length]; });
writeFileSync(new URL('../data/camera-calibration.json', import.meta.url), JSON.stringify({
  made: new Date().toISOString().slice(0, 10), renders: a.length * 4 + b.length * 2, ms: Date.now() - t0,
  scene: 'src/lenses/faceshield/scene.js, 716×448 px, default setting, ponding 0.3, scene seeds 1–3, 4 frames each',
  table, heldout: b.map(({ R, night, ponding, seed, measured }) => ({ R, night, ponding, seed, measured })),
}, null, 1));
console.log('renders', a.length * 4 + b.length * 2, 'in', Date.now() - t0, 'ms');
for (const k of ['day', 'night']) console.log(k, table[k].map(r => `${r[0]}→${r[1]}±${r[2]}`).join('  '));
await browser.close(); srv.close();
