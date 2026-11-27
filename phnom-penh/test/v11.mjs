// ARUN 11 acceptance checks on the built files: node test/v11.mjs
// Chrome for Testing on this Mac (GPU via Metal). Not an Android phone: timings here are this machine's.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const EXT = 'dist/arun-phnom-penh.html', PRIV = 'dist/arun-phnom-penh-private.html';
const files = { '/': EXT, '/private': PRIV };
const srv = createServer((q, r) => { const f = files[q.url.split('?')[0]]; if (!f) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(f)); }).listen(0);
const base = `http://localhost:${srv.address().port}/`;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
mkdirSync('test/results/v11', { recursive: true });
const results = []; let fails = 0;
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info: String(info).slice(0, 300) }); if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, String(info).slice(0, 160)); };

async function open(q = 'nointro', vp = { width: 390, height: 844 }, extra = {}, path = '') {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: vp.width < 700, ...extra });
  if (extra.denyStorage) await ctx.addInitScript(() => {
    for (const k of ['localStorage', 'sessionStorage', 'indexedDB']) Object.defineProperty(window, k, { get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  const page = await ctx.newPage();
  const errs = [], reqs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) reqs.push(r.url()); });
  const t0 = Date.now();
  await page.goto(base + path + '?' + q);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
  return { ctx, page, errs, reqs, t0 };
}
const C = (page, fn, arg) => page.evaluate(fn, arg);
const state = page => C(page, () => window.__CTX.state);
const overflow = page => C(page, () => document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1);
const smallTaps = page => C(page, () => [...document.querySelectorAll('#sheet button, #sheet input[type=range], #timebar button, #top button, #showbar button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && (r.height < 44 || r.width < 44); }).map(e => (e.textContent || e.className || e.tagName).trim().slice(0, 20) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
const sheetText = page => C(page, () => document.querySelector('#sheetBody').textContent);
const bad = s => /undefined|NaN|\[object|\b(v|ch|or|wr|so|iv|nb|mc|ts|tag)_[a-z]/.test(s);

// 1 · first action after the opening: skip, then tap a sensor
{
  const { ctx, page, errs, t0 } = await open('');
  await page.waitForTimeout(900);
  await page.touchscreen.tap(200, 420);
  const skipAt = Date.now() - t0;
  await page.waitForFunction(() => !window.__S.intro);
  await page.waitForTimeout(1000);   // the camera settles after the skip
  // a sensor on screen, clear of labels and the sheet, as a person would pick
  const p = await C(page, () => {
    const top = 110, bottom = document.querySelector('#sheet').getBoundingClientRect().top - 20;
    for (const [id, g] of window.__world.glyphs) {
      if (!/^[cg]\d$/.test(id)) continue;
      const q = window.__world.project(g.userData.x, g.userData.y, g.userData.h);
      if (!q.on || q.y < top || q.y > bottom || q.x < 50 || q.x > innerWidth - 50) continue;
      const el = document.elementFromPoint(q.x, q.y);
      if (el && el.id === 'world') return { ...q, id };
    }
    return null;
  });
  if (p) await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(250);
  const lens = await C(page, () => window.__S.lens && window.__S.lens.type);
  const firstAction = Date.now() - t0;
  check('first action: skip the opening, tap a sensor, its sheet opens (machine time)', p && (lens === 'camera' || lens === 'gauge') && !errs.length, `skip at ${skipAt} ms, sheet at ${firstAction} ms, lens ${lens} ${p && p.id} ${errs.join(' | ')}`);
  results.push({ name: 'timing.firstAction', ok: true, info: JSON.stringify({ skipMs: skipAt, firstActionMs: firstAction }) });
  await ctx.close();
}

// 2 · every view at every size: content, no overflow, taps ≥ 44 px, no NaN or raw keys, no errors
for (const vp of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 915, height: 412 }]) {
  const tag = `${vp.width}x${vp.height}`;
  const { ctx, page, errs } = await open('nointro', vp);
  const problems = [];
  const visit = async (label, fn, arg) => {
    await C(page, fn, arg); await page.waitForTimeout(350);
    const txt = await sheetText(page);
    if (txt.trim().length < 20) problems.push(`${label}: empty`);
    if (bad(txt)) problems.push(`${label}: ${txt.match(/undefined|NaN|\[object|\b(v|ch|or|wr|so|iv|nb|mc|ts|tag)_[a-z]\w*/)[0]}`);
    if (await overflow(page)) problems.push(`${label}: sideways scroll`);
    const sm = await smallTaps(page); if (sm.length) problems.push(`${label}: small ${sm.slice(0, 3).join(', ')}`);
  };
  await visit('observe', () => window.__CTX.setView('observe'));
  await visit('discover', () => window.__CTX.openLens('discover', 'discover'));
  await visit('build', () => { window.__CTX.closeLens(); window.__CTX.setView('build'); });
  await visit('compare', () => window.__CTX.setView('compare'));
  await visit('notebook', () => window.__CTX.setView('notebook'));
  for (const l of ['evidence:c4', 'evidence:fac', 'wrong:wrong', 'machine:machine', 'shores:shores', 'invisible:invisible', 'ordinary:ordinary']) { const [ty, id] = l.split(':'); await visit(l, ([ty, id]) => window.__CTX.openLens(ty, id), [ty, id]); }
  check(`${tag} views and challenge sheets: content, no sideways scroll, taps ≥ 44 px, no NaN or raw keys`, !problems.length, problems.join(' | '));
  check(`${tag} no errors`, !errs.length, errs.slice(0, 3).join(' | '));
  if (vp.width === 390) for (const L of ['km', 'th']) {
    await C(page, L => { const b = document.querySelector('#lang'); while (document.documentElement.lang !== L) b.click(); }, L);
    const probs = [];
    for (const f of [() => window.__CTX.setView('build'), () => window.__CTX.setView('compare'), () => window.__CTX.setView('notebook'), () => window.__CTX.openLens('discover', 'discover'), () => window.__CTX.openLens('evidence', 'g4')]) {
      await C(page, f); await page.waitForTimeout(250); const txt = await sheetText(page);
      if (bad(txt)) probs.push(txt.match(/undefined|NaN|\[object|\b(v|ch|or|wr|so|iv|nb|mc|ts|tag)_[a-z]\w*/)[0]);
      if (await overflow(page)) probs.push('overflow');
      if (!(L === 'km' ? /[ក-៿]/ : /[฀-๿]/).test(txt)) probs.push('script missing');
    }
    check(`390 ${L}: views in ${L === 'km' ? 'Khmer' : 'Thai'}, no raw keys or overflow`, !probs.length, probs.join(' | '));
  }
  await ctx.close();
}

// 3 · build: preview and cost before commit, undo, redo, reset, drag
{
  const { ctx, page, errs } = await open('nointro');
  await C(page, () => { window.__CTX.setView('build'); window.__CTX.setTool('gauge'); });
  await page.touchscreen.tap(150, 300); await page.waitForTimeout(300);
  const pend = await sheetText(page), before = (await state(page)).added.length;
  const hasPreview = /US\$600/.test(pend) && /notice/i.test(pend) && before === 0;
  await page.click('.pending .btn.go'); await page.waitForTimeout(300);
  const s1 = await state(page);
  check('build: tap shows a preview with cost, Do it adds the gauge', hasPreview && s1.added.length === 1, pend.slice(0, 120));
  await page.click('text=Undo'); await page.waitForTimeout(200); const u = (await state(page)).added.length;
  await page.click('text=Redo'); await page.waitForTimeout(200); const r = (await state(page)).added.length;
  check('build: undo and redo', u === 0 && r === 1);
  // drag the added gauge
  const g = await C(page, () => { const a = window.__CTX.state.added[0], gl = window.__world.glyph(a.id); return { id: a.id, x: a.x, y: a.y, p: window.__world.project(gl.userData.x, gl.userData.y, gl.userData.h) }; });
  await C(page, () => window.__CTX.setTool(null));
  await page.mouse.move(g.p.x, g.p.y); await page.mouse.down(); await page.mouse.move(g.p.x + 40, g.p.y + 30, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(400);
  const s2 = await state(page);
  check('build: drag moves an added sensor (one move action)', s2.added[0].x !== g.x || s2.added[0].y !== g.y, `${g.x},${g.y} → ${s2.added[0].x},${s2.added[0].y}`);
  await C(page, () => window.__CTX.setTool('remove'));
  const c7 = await C(page, () => { const gl = window.__world.glyph('c7'); return window.__world.project(gl.userData.x, gl.userData.y, gl.userData.h); });
  await page.touchscreen.tap(c7.x, c7.y); await page.waitForTimeout(300);
  const remPend = await sheetText(page);
  await C(page, () => document.querySelector('.pending .btn.go') && document.querySelector('.pending .btn.go').click()); await page.waitForTimeout(300);
  const s3 = await state(page);
  check('build: remove shows a preview, then switches the camera off', /Remove C7/.test(remPend) && s3.off.includes('c7'), remPend.slice(0, 80));
  await page.click('text=Reset'); await page.waitForTimeout(300);
  const s4 = await state(page);
  check('build: reset returns to the city as it opens', !s4.added.length && !s4.off.length && s4.seed === 1);
  check('build: no errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

// 4 · compare: storm hidden until asked, then scored on unseen storms; experiment state survives a language switch
{
  const { ctx, page, errs } = await open('nointro');
  await C(page, () => window.__CTX.act({ type: 'remove', id: 'g4' }));
  await C(page, () => window.__CTX.setView('compare')); await page.waitForTimeout(300);
  const hidden = await C(page, () => !window.__world.truth && !window.__S.truth && !/minutes to prepare/.test(document.querySelector('#sheetBody').textContent));
  const t0 = Date.now();
  await page.click('.cmp .btn.go');
  await page.waitForFunction(() => document.querySelector('.cmpT'), null, { timeout: 180000 });
  const ms = Date.now() - t0, txt = await sheetText(page);
  check('compare: forecast only until revealed, then 48 unseen storms scored for both', hidden && /notice before water/.test(txt) && /Unseen storms, median/.test(txt), `${ms} ms`);
  results.push({ name: 'timing.compare96storms', ok: true, info: `${ms} ms for 2 × 48 storms` });
  await C(page, () => { const b = document.querySelector('#lang'); b.click(); });
  const after = await C(page, () => ({ off: window.__CTX.state.off, view: window.__S.view }));
  check('language switch: the experiment and the view stay', after.off.includes('g4') && after.view === 'compare');
  check('compare: no errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

// 5 · notebook: save, export, import, replay; reload restores the session
{
  const { ctx, page, errs } = await open('nointro', { width: 390, height: 844 }, { acceptDownloads: true });
  await C(page, () => window.__CTX.act({ type: 'add', kind: 'gauge', x: -5200, y: -500 }));
  await C(page, () => window.__CTX.act({ type: 'threshold', value: 0.4 }));
  await C(page, () => window.__CTX.setView('notebook')); await page.waitForTimeout(500);
  await page.fill('.nb input', 'Gauge west of the hotel');
  await page.click('.nb .btn.go'); await page.waitForTimeout(600);
  const listed = await sheetText(page);
  const dl = page.waitForEvent('download');
  await C(page, () => { const b = [...document.querySelectorAll('.nb button')].find(x => /Export/.test(x.textContent)); b.click(); });
  const d = await dl, path = 'test/results/v11/notebook-export.json'; await d.saveAs(path);
  const exp = JSON.parse(readFileSync(path, 'utf8'));
  const rec = exp.records && exp.records[0];
  const keys = rec ? Object.keys(rec).sort().join(',') : '';
  check('notebook: save lists the record; export is the notebook format with no free text by default', /Gauge west of the hotel/.test(listed) && exp.format === 'arun-notebook' && rec && rec.scenario.added.length === 1 && rec.notes === '' && /^Experiment/.test(rec.title), keys);
  // replay the record from the baseline
  await C(page, () => window.__CTX.act({ type: 'reset' }));
  await C(page, r => window.__CTX.exp.replay(r), rec);
  await page.waitForFunction(() => !window.__S.replay && window.__CTX.state.added.length === 1, null, { timeout: 20000 });
  const rs = await state(page);
  check('notebook: replay steps the saved actions back onto the map', rs.added.length === 1 && rs.warnP === 0.4);
  // reload: the session comes back
  await page.reload(); await page.waitForFunction(() => window.__ready);
  const back = await C(page, () => ({ r: window.__ready.restored, a: window.__CTX.state.added.length }));
  check('reload restores the experiment', back.r && back.a === 1, JSON.stringify(back));
  check('notebook: no errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

// 6 · storage denied: the page runs, the notebook says it cannot store here
{
  const { ctx, page, errs } = await open('nointro', { width: 390, height: 844 }, { denyStorage: true });
  await C(page, () => window.__CTX.setView('notebook')); await page.waitForTimeout(700);
  const txt = await sheetText(page);
  check('storage denied: loads, notebook falls back to this session only, no errors', !errs.length && /Export/.test(txt), txt.slice(0, 120) + ' ' + errs.join(' | '));
  await ctx.close();
}

// 7 · challenges: outrun within budget, scored; prove wrong finds failures when made harder
{
  const { ctx, page, errs } = await open('nointro');
  await C(page, () => window.__CTX.openLens('discover', 'discover'));
  await page.click('.disc .card .btn.go'); await page.waitForTimeout(400);
  const st0 = await state(page);
  for (const [x, y] of [[120, 260], [200, 300], [260, 230]]) {
    await C(page, () => { if (window.__S.tool !== 'gauge') window.__CTX.setTool('gauge'); });
    await page.touchscreen.tap(x, y); await page.waitForTimeout(250);
    await C(page, () => document.querySelector('.pending .btn.go') && document.querySelector('.pending .btn.go').click()); await page.waitForTimeout(250);
  }
  const st1 = await state(page);
  await C(page, () => { window.__CTX.clearPending(); if (window.__S.tool) window.__CTX.setTool(window.__S.tool); window.__CTX.renderSheet(); });
  const pre = await sheetText(page);
  if (!(await page.$('.chal .btn.go'))) console.log('no score button:', pre.slice(0, 300), JSON.stringify({ tool: await C(page, () => window.__S.tool), ch: await C(page, () => window.__S.challenge) }));
  await page.click('.chal .btn.go', { timeout: 5000 });
  await page.waitForFunction(() => /Median \d+ min/.test(document.querySelector('#sheetBody').textContent), null, { timeout: 120000 }).catch(() => {});
  const txt = await sheetText(page);
  check('outrun: starts with every network sensor off, adds within budget, scores 48 unseen storms', st0.off.length === 22 && st1.added.length === 3 && /Median \d+ min/.test(txt) && /US\$1,800/.test(txt), txt.match(/Median[^·]+·[^·]+·[^·]+·[^·]+· US\$[\d,]+/)?.[0]);
  // at the hotel the roof gauge alone gives about 9 minutes, so losing reports there does not fail; a facility out west does
  await C(page, () => { window.__CTX.act({ type: 'reset' }); window.__CTX.act({ type: 'move', id: 'fac', x: -6500, y: -3000 }); window.__CTX.act({ type: 'obs', key: 'drop', value: 0.3 }); window.__CTX.openLens('wrong', 'wrong'); });
  await page.click('text=Find failures on 24 practice storms');
  await page.waitForFunction(() => /storms with a failure|no late, missed/.test(document.querySelector('#sheetBody').textContent), null, { timeout: 120000 });
  const w = await sheetText(page);
  check('prove wrong: a facility out west with 30% of reports lost: failures are found and listed', /storms with a failure/.test(w), w.match(/\d+ storms with a failure/)?.[0]);
  await C(page, () => window.__CTX.openLens('invisible', 'invisible'));
  await page.click('text=Measure this frame'); await page.waitForTimeout(1500);
  const iv = await sheetText(page);
  check('invisible city: the frame is measured from pixels and set beside the table', /Pixels: [\d.]+ mm\/h · table: [\d.]+ mm\/h/.test(iv), iv.match(/Pixels:[^·]+·[^·]+·[^\n]+?mm\/h/)?.[0]);
  check('challenges: no errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

// 8 · no network requests, low tier, 2D fallback, page zoom 130%
{
  const { ctx, page, errs, reqs } = await open('nointro&tier=low');
  await C(page, () => { window.__CTX.setView('compare'); window.__CTX.openLens('machine', 'machine'); });
  await page.waitForTimeout(500);
  check('no requests leave the page (low tier)', !reqs.length && !errs.length, reqs.slice(0, 3).join(' ') + errs.join(' | '));
  await C(page, () => { document.documentElement.style.zoom = '1.3'; window.__CTX.closeLens(); window.__CTX.setView('build'); });
  await page.waitForTimeout(300);
  check('page zoom 130% (stand-in for Android text size): no sideways scroll', !(await overflow(page)));
  await ctx.close();
  const f = await open('nointro&flat');
  await C(f.page, () => window.__CTX.setView('build')); await C(f.page, () => window.__CTX.setTool('gauge'));
  await f.page.touchscreen.tap(180, 300); await f.page.waitForTimeout(300);
  const fp = await sheetText(f.page);
  check('2D fallback: build preview works without WebGL', /US\$600/.test(fp) && !f.errs.length, f.errs.join(' | '));
  await f.ctx.close();
}

// 9 · editions: the external file carries no team results; the private file does, labelled
{
  const ext = readFileSync(EXT, 'utf8'), priv = existsSync(PRIV) ? readFileSync(PRIV, 'utf8') : '';
  // the lists live in private/strings.json, outside the public repository
  const STR = existsSync('private/strings.json') ? JSON.parse(readFileSync('private/strings.json', 'utf8')) : { forbidden: ['/Users/'], privateMarkers: [] };
  const inExt = STR.forbidden.filter(w => w.length > 3 && !/^\d/.test(w) && ext.replace(/[A-Za-z0-9+/=]{200,}/g, '').includes(w));
  check('external file: no team names, preliminary results, private links or local paths', !inExt.length, inExt.join(', '));
  if (!priv) console.log('skip private-edition checks: no private build (private/evidence.js is not in the public repository)');
  else {
  check('private file: team results present and labelled preliminary', STR.privateMarkers.every(w => priv.includes(w)));
  const { ctx, page, errs } = await open('nointro', { width: 390, height: 844 }, {}, 'private');
  await C(page, () => window.__CTX.openLens('camera', 'c4', 2)); await page.waitForTimeout(300);
  const pt = await sheetText(page);
  check('private build: camera sheet shows the team test, labelled', STR.privateMarkers.slice(1).every(w => pt.includes(w)) && !errs.length, errs.join(' | '));
  await ctx.close();
  }
}

writeFileSync('test/results/v11/browser-v11.json', JSON.stringify({ ranAt: new Date().toISOString(), browser: 'Chrome for Testing (playwright chromium-1228), Apple M2, Metal. Not an Android phone.', results }, null, 1));
console.log(`\n${results.filter(r => !r.name.startsWith('timing.')).length - fails} of ${results.filter(r => !r.name.startsWith('timing.')).length} checks pass`);
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
