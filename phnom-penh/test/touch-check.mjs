// Browser checks for the draft (Chrome for Testing on a Mac, GPU on; not an Android phone).
// node test/touch-check.mjs  → test/results/touch/check.json
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('test/results/touch', { recursive: true });
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync('dist/arun-touch.html')); }).listen(0);
const base = `http://localhost:${srv.address().port}/`;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [], errs = [], outside = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(ok ? 'ok  ' : 'FAIL', name, detail); };
const T = (d, h, mi = 0) => d * 1440 + h * 60 + mi - 900;
async function open(vp, q = '', extra = {}, cpu = 1) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: vp.width < 700, ...extra });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
  const cdp = await ctx.newCDPSession(page);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto(base + q); await page.waitForFunction(() => (window.__ready && window.__ready.full) || window.__error, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  return { ctx, page, cdp };
}
const tap = async (cdp, page, x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(400); };
const drag = async (cdp, page, pts) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
  for (const q of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] }); await page.waitForTimeout(40); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300);
};

{ // the first minute at 390 × 844
  const { ctx, page, cdp } = await open({ width: 390, height: 844 }, '?lang=en');
  const r = await page.evaluate(() => window.__ready);
  check('opens on the simulated city with the cached world', r && r.junctions === 28 && r.alerts.length >= 4, `ready ${r.ms} ms, full ${r.full} ms, alerts ${r.alerts.map(a => a.kind).join(' ')}`);
  const pill = await page.locator('#alerts .al').first().innerText().catch(() => '');
  check('07:40 Friday: an air alert is on screen, with its warning time', /Unhealthy air/.test(pill) && /ahead/.test(pill), pill.replace(/\n/g, ' · '));
  // Day 3 rule: words on the first screen, not counting map labels, the simulation status, numbers and units
  const words = await page.evaluate(() => {
    const parts = ['#alerts', '#coach', '#chips', '#timebar', '#layers', '#lang'].map(s => document.querySelector(s)).filter(e => e && e.offsetParent !== null).map(e => e.innerText).join(' ');
    return parts.split(/[\s·]+/).filter(t => t && !/^[\d.,:%+−-]+$/.test(t) && !/^(mm\/h|m|cm|h|min|AQI|EN)$/.test(t));
  });
  check('18 words or fewer on the first screen (Day 3 rule)', words.length <= 18, `${words.length}: ${words.join(' ')}`);
  const mapShare = await page.evaluate(() => { const tb = document.querySelector('#timebar').getBoundingClientRect(), ch = document.querySelector('#chips').getBoundingClientRect(); return (Math.min(tb.top, ch.top)) / innerHeight; });
  check('map above the chips and time bar at rest', mapShare >= 0.75, `${(mapShare * 100).toFixed(0)}% of the screen height`);
  // touch a junction camera on the map
  const p = await page.evaluate(() => { const J = __touch.sim().J; for (let i = 0; i < J.length; i++) { const q = __touch.project(J[i].x, J[i].y, 120); if (q.on && q.y > 200 && q.y < 560 && q.x > 40 && q.x < 330) return { i, x: q.x, y: q.y }; } return null; });
  await tap(cdp, page, p.x, p.y);
  let sel = await page.evaluate(() => __S.sel);
  check('touching a camera on the map opens its street view', sel && sel.kind === 'j', `junction ${sel && sel.i}`);
  await page.waitForTimeout(800);
  const box = await page.locator('#street').boundingBox();
  await drag(cdp, page, [[box.x + box.width * 0.5, box.y + box.height * 0.5], [box.x + box.width * 0.3, box.y + box.height * 0.5], [box.x + box.width * 0.15, box.y + box.height * 0.5]]);
  const div = await page.evaluate(() => __S.divider);
  check('dragging the Face Shield line moves it', div < 0.25, div.toFixed(2));
  const pkt = JSON.parse(await page.locator('#pkt').innerText());
  const keys = Object.keys(pkt).sort().join(',');
  check('what leaves the camera: numbers only', keys === 'node,peoplePerMin,pm25,quality,queueM,rainMmH,t,vehiclesPerMin,waterCm' && !/plate|face|track|"id"/.test(JSON.stringify(pkt)), keys);
  // time: drag the bar to the storm
  const tb = await page.locator('#tb-cv').boundingBox();
  const x = m => tb.x + 10 + (m + 900) / 2880 * (tb.width - 20);
  await drag(cdp, page, [[x(T(0, 12)), tb.y + 14], [x(T(0, 15)), tb.y + 14], [x(T(0, 16, 15)), tb.y + 14]]);
  const m = await page.evaluate(() => __S.m);
  check('dragging the time bar moves time', Math.abs(m - T(0, 16, 15)) <= 10, `minute ${m} (${await page.locator('#t-clock').innerText()})`);
  const act = await page.evaluate(() => __touch.active().map(a => a.kind + ':' + a.phase));
  check('16:15: heavy rain and water alerts, issued before the rain', act.includes('rain:a') && act.some(a => a.startsWith('water')), act.join(' '));
  await page.evaluate(m => __touch.setTime(m), T(0, 16, 2)); await page.waitForTimeout(200);
  const pre = await page.evaluate(() => __touch.active().map(a => a.kind + ':' + a.phase));
  check('16:02: the rain warning is out, the heavy rain has not come', pre.includes('rain:w'), pre.join(' '));
  await page.evaluate(m => __touch.setTime(m), T(0, 21, 0)); await page.waitForTimeout(200);
  const night = await page.evaluate(() => __world.U.uDusk.value);
  check('21:00: night falls (lamps on)', night > 0.5, night.toFixed(2));
  // play
  await page.evaluate(m => __touch.setTime(m), T(0, 9, 0)); await page.click('#play'); await page.waitForTimeout(1500); await page.click('#play');
  const m2 = await page.evaluate(() => __S.m);
  check('play moves time forward', m2 > T(0, 9, 10), `${T(0, 9, 0)} → ${Math.round(m2)}`);
  // cards
  for (const k of ['air', 'rain', 'water', 'dc']) {
    await page.evaluate(k => __touch.open({ kind: k }), k); await page.waitForTimeout(300);
    const t = await page.locator('#card-body h2').first().innerText();
    check(`${k} card opens`, t.length > 2, t);
  }
  await page.evaluate(() => __touch.open({ kind: 'water' })); await page.evaluate(() => { const r = document.querySelector('#rise'); r.value = 11.5; r.dispatchEvent(new Event('input')); }); await page.waitForTimeout(200);
  const under = await page.locator('#rise-s').innerText();
  check('possible water level: streets under water from the river model', /km/.test(under), under);
  await page.evaluate(() => __touch.close());
  await tap(cdp, page, 120, 520); await page.waitForTimeout(300);
  sel = await page.evaluate(() => __S.sel);
  if (sel && sel.kind === 'place') { await page.click('#reach-b'); await page.waitForTimeout(1600); }
  const ro = sel && sel.kind === 'place' ? await page.locator('#reach-o').innerText() : '';
  check('touching the ground: facts here and how far from here', sel && sel.kind === 'place' && /buildings/.test(ro), `${sel && sel.kind} ${ro}`);
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input:not(.sr-range)')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 40 && !b.closest('.menu')).map(b => b.textContent.trim().slice(0, 20) || b.id));
  check('controls at least 40 px tall', small.length === 0, small.join(', '));
  await page.screenshot({ path: 'test/results/touch/check-390.png' });
  await ctx.close();
}
for (const L of ['km', 'th']) {
  const { ctx, page } = await open({ width: 390, height: 844 }, `?lang=${L}`);
  for (const k of ['air', 'rain', 'water', 'dc']) { await page.evaluate(k => __touch.open({ kind: k }), k); await page.waitForTimeout(150); }
  await page.evaluate(() => __touch.open({ kind: 'j', i: 3 })); await page.waitForTimeout(300);
  const txt = await page.evaluate(() => document.body.innerText);
  const raw = ['coachJ', 'wAir', 'aRain', 'leadMed', 'dcTitle', 'camSim', 'nJ'].filter(k => txt.includes(k));
  check(`${L}: no raw keys or placeholders`, raw.length === 0 && !/\{\w+\}/.test(txt), raw.join(','));
  await ctx.close();
}
for (const vp of [{ width: 360, height: 780 }, { width: 412, height: 915 }, { width: 844, height: 390 }]) {
  const { ctx, page } = await open(vp, '?lang=en');
  await page.evaluate(() => __touch.open({ kind: 'j', i: 0 })); await page.waitForTimeout(400);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const tbOk = await page.evaluate(() => { const r = document.querySelector('#timebar').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.height >= 60; });
  check(`${vp.width}×${vp.height}: no sideways scroll, time bar on screen with a card open`, !over && tbOk);
  await page.screenshot({ path: `test/results/touch/check-${vp.width}x${vp.height}.png` });
  await ctx.close();
}
{ const { ctx, page } = await open({ width: 390, height: 844 }, '?lang=en', { reducedMotion: 'reduce' });
  await page.click('#play'); await page.waitForTimeout(500);
  check('reduced motion: play stays off, time moves only by hand', await page.evaluate(() => !__S.playing)); await ctx.close(); }
{ // a slower phone, roughly: the Mac's CPU slowed 4× (GPU not slowed)
  const { ctx, page } = await open({ width: 390, height: 844 }, '?lang=en&nocoach', {}, 4);
  const r = await page.evaluate(() => window.__ready);
  const t0 = Date.now(); await page.evaluate(m => __touch.setTime(m), T(0, 16, 30)); const scrub = Date.now() - t0;
  await page.evaluate(() => __touch.open({ kind: 'j', i: 5 })); await page.waitForTimeout(1500);
  const fps = await page.evaluate(() => __world.fps);
  check('CPU slowed 4×: ready, one time step, frame rate with a street view open', true, `first frame ${r.ms} ms (${JSON.stringify(r.steps)}), all ready ${r.full} ms; one time step ${scrub} ms; ${fps.toFixed(0)} fps`);
  await ctx.close();
}
check('no outside requests', outside.length === 0, outside.slice(0, 3).join(' '));
check('no errors', errs.length === 0, errs.slice(0, 3).join(' | '));
writeFileSync('test/results/touch/check.json', JSON.stringify({ when: new Date().toISOString(), browser: 'Chrome for Testing 1228 (playwright-core), macOS, Apple M2, GPU on', note: 'not an Android phone', results }, null, 1));
console.log(results.filter(r => r.ok).length + '/' + results.length);
await browser.close(); srv.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
