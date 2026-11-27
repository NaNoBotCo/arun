// Browser checks on the built file: node test/run.mjs   (Chromium for Testing, GPU via Metal on this Mac)
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../dist/arun-phnom-penh.html', import.meta.url));
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(file)); }).listen(0);
const base = `http://localhost:${srv.address().port}/`;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
mkdirSync('test/results', { recursive: true });
const results = []; let fails = 0;
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, info); };

async function open(q, vp = { width: 390, height: 844 }, extra = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: vp.width < 700, ...extra });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base + '?' + q);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
  return { ctx, page, errs };
}
const LENSES = [['facility', 'fac'], ['camera', 'c4'], ['gauge', 'g4'], ['place', { x: -3000, y: 200 }], ['river', 'river'], ['compute', 'compute'], ['landmark', 'royal-palace']];

for (const vp of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 915, height: 412 }]) {
  const tag = `${vp.width}x${vp.height}`;
  const { ctx, page, errs } = await open('nointro', vp);
  const ready = await page.evaluate(() => window.__ready);
  check(`${tag} loads`, ready && !ready.flat && ready.buildings > 80000, JSON.stringify(ready));
  const head = await page.textContent('#sheetBody');
  check(`${tag} headline has minutes`, /\d+\s*min/.test(head), head.slice(0, 60));
  let bad = [];
  for (const [type, id] of LENSES) for (const d of [1, 2, 3]) {
    await page.evaluate(([type, id, d]) => window.__CTX.openLens(type, id, d), [type, id, d]);
    await page.waitForTimeout(type === 'camera' && d === 1 ? 300 : 120);
    const txt = await page.textContent('#sheetBody');
    if (txt.trim().length < 20 || /undefined|NaN|\[object/.test(txt)) bad.push(`${type}${d}: ${txt.slice(0, 80)}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1);
    if (over) bad.push(`${type}${d}: page wider than screen`);
  }
  check(`${tag} 7 lenses × 3 depths have content, no NaN/undefined, no sideways scroll`, !bad.length, bad.join(' | '));
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input[type=range], .lbl')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.classList.contains('dim') && (r.height < 44 && !e.classList.contains('lbl') || r.width < 44); }).map(e => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
  check(`${tag} buttons and sliders at least 44 px`, !small.length, small.slice(0, 6).join(', '));
  check(`${tag} no errors`, !errs.length, errs.slice(0, 3).join(' | '));
  if (vp.width === 390) {
    await page.evaluate(() => window.__CTX.closeLens());
    // a real tap on the map opens a lens
    // a ground point on screen (the sheet in ARUN 11 is taller, so a fixed pixel can land on sky after a fly-to)
    await page.waitForTimeout(1300);
    const gp = await page.evaluate(() => window.__world.project(-3000, 600, 0));
    await page.touchscreen.tap(gp.x, gp.y); await page.waitForTimeout(300);
    const depth = await page.evaluate(() => window.__S.depth);
    check('tap on the map opens a lens', depth >= 1, `depth ${depth}`);
    await page.evaluate(() => window.__CTX.closeLens());
    // network toggle
    const a = await page.textContent('.head .big');
    await page.click('#net'); await page.waitForTimeout(150);
    const b = await page.textContent('.head');
    await page.click('#net'); await page.waitForTimeout(150);
    const c = await page.textContent('.head .big');
    check('network toggle changes the headline and back', a !== b && a === c, `${a} → ${b.slice(0, 50)} → ${c}`);
    // time slider moves the clock
    await page.$eval('#time', el => { el.value = '120'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    check('time slider sets the clock', (await page.textContent('#clock')) === '17:00');
    // languages
    await page.click('#lang'); await page.waitForTimeout(150);
    const km = await page.textContent('#app');
    await page.evaluate(() => window.__CTX.openLens('camera', 'c4', 2)); const kmLens = await page.textContent('#sheetBody');
    await page.click('#lang'); await page.waitForTimeout(150);
    const th = await page.textContent('#sheetBody');
    check('Khmer on screen and in a lens', /[ក-៿]/.test(km) && /[ក-៿]/.test(kmLens));
    check('Thai in a lens', /[฀-๿]/.test(th));
    await page.click('#lang');
    // camera lens: numbers measured from pixels, a small message
    await page.evaluate(() => { window.__CTX.setT(100, true); window.__CTX.openLens('camera', 'c7', 1); });
    await page.waitForTimeout(7000);
    const cam = await page.textContent('#sheetBody');
    const sent = +(cam.match(/Sent: (\d+) bytes/) || [])[1];
    check('camera lens: three numbers from pixels, message under 200 bytes', sent > 20 && sent < 200 && /mm\/h/.test(cam), cam.match(/Sent:[^.]+\.[^.]+\./)?.[0]);
    await page.screenshot({ path: 'test/results/check-camera.png' });
    // river: the slider changes the area
    await page.evaluate(() => window.__CTX.openLens('river', 'river', 3)); await page.waitForTimeout(400);
    const r1 = await page.textContent('#sheetBody');
    await page.$$eval('#sheetBody input[type=range]', els => { const el = els[els.length - 1]; el.value = '6'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const r2 = await page.textContent('#sheetBody');
    check('river slider changes the land reached', r1 !== r2 && /km²/.test(r2));
    // add a gauge, rerun
    await page.evaluate(() => { window.__CTX.setT(60, true); window.__CTX.openLens('place', { x: -5200, y: -500 }, 3); }); await page.waitForTimeout(200);
    await page.click('text=Add a gauge here'); await page.waitForTimeout(400);
    const added = await page.evaluate(() => window.__S.added.length);
    check('adding a gauge reruns the scenario', added === 1 && /Time to prepare: \d+ → \d+ min/.test(await page.textContent('#sheetBody')));
    // facility: another storm changes the scenario
    await page.evaluate(() => window.__CTX.openLens('facility', 'fac', 3)); await page.waitForTimeout(300);
    const s1 = await page.evaluate(() => window.__S.seed); await page.click('text=Another storm'); await page.waitForTimeout(300);
    check('another storm', (await page.evaluate(() => window.__S.seed)) === s1 + 1);
    const fps = await page.evaluate(() => window.__world.fps);
    check('frame rate on this Mac (GPU)', fps > 30, `${fps.toFixed(0)} fps, ready ${ready.ms} ms`);
  }
  await ctx.close();
}

// determinism
{
  const a = await open('nointro'), b = await open('nointro');
  const ha = await a.page.textContent('#sheetBody'), hb = await b.page.textContent('#sheetBody');
  check('same storm, same headline on two loads', ha === hb, ha.slice(0, 60));
  await a.ctx.close(); await b.ctx.close();
}
// reduced motion: no opening animation
{
  const { ctx, page, errs } = await open('', { width: 390, height: 844 }, { reducedMotion: 'reduce' });
  await page.waitForTimeout(400);
  const gone = await page.evaluate(() => document.querySelector('#opening').classList.contains('gone') && !window.__S.intro);
  check('reduced motion: straight to the city, no errors', gone && !errs.length, errs.join(' | '));
  await ctx.close();
}
// flat map when there is no WebGL2
{
  const { ctx, page, errs } = await open('nointro&flat');
  const ready = await page.evaluate(() => window.__ready);
  await page.evaluate(() => window.__CTX.openLens('river', 'river', 3)); await page.waitForTimeout(200);
  const txt = await page.textContent('#sheetBody');
  check('flat fallback: map, lenses, no errors', ready.flat && /km²/.test(txt) && !errs.length, errs.join(' | '));
  await page.screenshot({ path: 'test/results/check-flat.png' });
  await ctx.close();
}
// the opening plays, ends on the notice, and a tap skips it
{
  const { ctx, page, errs } = await open('');
  await page.waitForTimeout(600);
  const photo = await page.evaluate(() => !document.querySelector('#opening').classList.contains('gone'));
  await page.waitForTimeout(16500);
  const done = await page.evaluate(() => !window.__S.intro && /\d+\s*min/.test(document.querySelector('#sheetBody').textContent));
  check('opening: photo first, then the city and the notice within 17 s', photo && done, errs.join(' | '));
  await ctx.close();
  const b = await open('');
  await b.page.waitForTimeout(800); await b.page.touchscreen.tap(200, 400); await b.page.waitForTimeout(500);
  check('a tap skips the opening', await b.page.evaluate(() => !window.__S.intro));
  await b.ctx.close();
}

writeFileSync('test/results/browser.json', JSON.stringify({ ranAt: new Date().toISOString(), browser: 'Chrome for Testing (playwright chromium-1228), Apple M2, Metal', results }, null, 1));
console.log(`\n${results.length - fails} of ${results.length} checks pass`);
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
