// Browser check for the Face Shield scene: node test/faceshield.check.mjs
// Serves the project folder, opens src/lenses/faceshield/harness.html at 390×844, DPR 2.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'test/results/faceshield');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

function chromePath() {
  const sys = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(sys)) return sys;
  const base = `${process.env.HOME}/Library/Caches/ms-playwright`;
  for (const d of readdirSync(base).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    for (const p of [`${base}/${d}/chrome-mac/Chromium.app/Contents/MacOS/Chromium`, `${base}/${d}/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium`]) if (existsSync(p)) return p;
  }
  throw new Error('no Chrome found');
}

const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const body = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/src/lenses/faceshield/harness.html`);
await page.waitForFunction(() => window.sceneReady === true);

const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

const res = await page.evaluate(async () => {
  const s = window.scene; s.stop();
  const t0 = performance.now(); const cal = s.calibration(); const calMs = performance.now() - t0;
  const rains = [0, 10, 30, 60, 100];
  const rain = [];
  for (const r of rains) { s.set({ rain: r, ponding: 0.3, shield: 0, dissolve: 0, night: false }); const m = await s.measure(); rain.push({ in: r, rain: m.rain.value, vis: m.visibility.value, pictureBytes: m.pictureBytes, sentBytes: m.sentBytes }); }
  const water = [];
  for (const p of [0, 0.3, 0.6, 0.9]) { s.set({ rain: 20, ponding: p, shield: 0 }); const m = await s.measure(); water.push({ in: p, water: m.water.value }); }
  s.set({ rain: 30, ponding: 0.3, shield: 0 }); const a = (await s.measure()).rain.value;
  s.set({ shield: 1 }); const b = (await s.measure()).rain.value;
  const night = [];
  for (const r of [0, 10, 30, 60, 100]) { s.set({ rain: r, ponding: 0.4, shield: 0, night: true }); const m = await s.measure(); night.push({ in: r, rain: m.rain.value, water: m.water.value, vis: m.visibility.value }); }
  s.set({ night: false });
  // seeds: default vs strict misses
  const seeds = [];
  const cv = document.createElement('canvas'); cv.width = 780; cv.height = 1387;
  for (let seed = 1; seed <= 20; seed++) {
    const sc = window.createFaceShieldScene(cv, { seed });
    sc.set({ shield: 1, setting: 'default' }); const d = sc.faces().filter((f) => f.missed).length;
    sc.set({ setting: 'strict' }); const st = sc.faces().filter((f) => f.missed).length; const n = sc.faces().length;
    seeds.push({ seed, n, d, st }); sc.destroy();
  }
  return { calMs: Math.round(calMs), cal, rain, water, shieldRain: [a, b], night, seeds };
});

console.log('calibration', res.calMs, 'ms; water threshold', res.cal.waterThreshold.toFixed(1));
console.log('rain curve (streak fraction → mm/h):', res.cal.rain.map(([f, r]) => `${r}:${f}`).join(' '));
console.table(res.rain); console.table(res.water); console.table(res.night);
console.log('shield 0 vs 1, rain 30:', res.shieldRain);
console.log('seeds (faces, default misses, strict misses):', res.seeds.map((s) => `${s.seed}:${s.n}/${s.d}/${s.st}`).join(' '));

const rk = res.rain.map((r) => r.rain);
check(rk.every((v, i) => i === 0 || v > rk[i - 1]), `measured rain rises with input rain (${rk.join(', ')})`);
check(res.rain.filter((r) => r.in > 10).every((r) => Math.abs(r.rain - r.in) / r.in <= 0.25), 'measured rain within 25% of input above 10 mm/h');
check(Math.abs(res.rain[1].rain - 10) / 10 <= 0.25, `measured rain at 10 mm/h within 25% (${res.rain[1].rain})`);
check(res.rain[0].rain === 0, 'no rain reads 0 mm/h');
const wv = res.water.map((w) => w.water);
check(wv.every((v, i) => i === 0 || v > wv[i - 1]), `water % rises with ponding (${wv.join(', ')})`);
const vv = res.rain.map((r) => r.vis);
check(vv.every((v, i) => i === 0 || v < vv[i - 1]), `visibility falls as rain rises (${vv.join(', ')})`);
check(Math.abs(res.shieldRain[1] - res.shieldRain[0]) / res.shieldRain[0] < 0.1, `covers change measured rain by under 10% (${res.shieldRain.join(' → ')})`);
const nk = res.night.map((r) => r.rain);
check(nk.every((v, i) => i === 0 || v > nk[i - 1]), `night: measured rain rises (${nk.join(', ')})`);
const nv = res.night.map((r) => r.vis);
check(nv.every((v, i) => i === 0 || v < nv[i - 1]), `night: visibility falls (${nv.join(', ')})`);
check(res.seeds.some((s) => s.d >= 1), 'default misses at least one face on some seed');
check(res.seeds.every((s) => s.st >= s.d) && res.seeds.reduce((a, s) => a + s.st, 0) > res.seeds.reduce((a, s) => a + s.d, 0), 'strict misses more than default');
check(res.rain.every((r) => r.sentBytes > 0 && r.sentBytes < 200 && r.pictureBytes > 20000), `sent bytes ${res.rain[2].sentBytes} vs picture ${res.rain[2].pictureBytes}`);

// screenshots: shield 0, shield 1, dissolve 1, night
await mkdir(OUT, { recursive: true });
const shots = [['shield0', { rain: 30, ponding: 0.4, shield: 0, dissolve: 0, night: false, setting: 'default' }], ['shield1', { shield: 1 }], ['dissolve-half', { dissolve: 0.45 }], ['dissolve1', { dissolve: 1 }], ['night-shield1', { night: true, dissolve: 0, shield: 1, rain: 45, ponding: 0.6 }], ['strict', { night: false, setting: 'strict', rain: 30, ponding: 0.4 }]];
for (const [name, p] of shots) {
  await page.evaluate(async (p) => { window.scene.set(p); if (p.dissolve === 1) { await window.scene.measure(); window.scene.set({ dissolve: 1 }); } }, p);
  await page.locator('#c').screenshot({ path: join(OUT, `${name}.png`) });
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!overflow, 'no sideways scroll at 390 px');
check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await writeFile(join(OUT, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), viewport: '390x844@2', ...res, errors, fails }, null, 1));
await browser.close(); server.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
