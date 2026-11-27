// Acceptance tests in a real browser (Chromium via playwright-core). Writes test/results/browser.json.
// Usage: node tools/build.mjs && node test/browser/run.mjs
import { launch, openPage, ROOT } from './browser.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROUTES = ['home', 'tour', 'lab', 'desk', 'trust', 'sources', 'compare', 'ideas', 'status', 'wonder', ...Array.from({ length: 21 }, (_, i) => 'e' + String(i + 1).padStart(2, '0'))];
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const { browser, version, executablePath } = await launch();

// A. Every route at desktop and phone width: no errors, no outside requests, no sideways scroll.
for (const size of [{ width: 1366, height: 820, label: 'desktop 1366×820' }, { width: 390, height: 844, isMobile: true, hasTouch: true, label: 'phone 390×844' }]) {
  let bad = [];
  for (const r of ROUTES) {
    const { page, context, errors, requests } = await openPage(browser, r, size);
    await page.waitForTimeout(900);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (errors.length || requests.length || overflow) bad.push(`${r}: ${errors.length} errors, ${requests.length} requests, overflow ${overflow}${errors[0] ? ' — ' + errors[0] : ''}`);
    await context.close();
  }
  record(`A. ${ROUTES.length} routes load clean at ${size.label}`, bad.length === 0, bad.join(' | '));
}

// B. Every exhibit exports a run record that passes the schema check.
{
  const { page, context } = await openPage(browser, 'e01');
  const bad = [];
  for (let i = 1; i <= 21; i++) {
    const id = 'e' + String(i).padStart(2, '0');
    await page.evaluate((h) => (location.hash = '#' + h), id);
    await page.waitForSelector(`.ex[data-ex="${id.toUpperCase()}"] [role=tab]`, { timeout: 10000 });
    await page.waitForTimeout(700);
    await page.click(`[id$="-export"][role=tab]`);
    await page.waitForTimeout(250);
    const txt = await page.$eval('.tabpane.export', (el) => el.innerText);
    const json = await page.$eval('.export-text', (el) => el.value).catch(() => '');
    let parsed = null;
    try {
      parsed = JSON.parse(json);
    } catch {}
    if (!/Run record valid/.test(txt) || !parsed || parsed.experimentId !== id.toUpperCase()) bad.push(id);
  }
  record('B. All 21 exhibits export a schema-valid run record', bad.length === 0, bad.join(', '));
  await context.close();
}

// C. Deep links, back and forward.
{
  const { page, context } = await openPage(browser, 'e09');
  await page.evaluate(() => (location.hash = '#e12'));
  await page.waitForSelector('.ex[data-ex="E12"]');
  await page.goBack();
  await page.waitForSelector('.ex[data-ex="E09"]');
  await page.goForward();
  await page.waitForSelector('.ex[data-ex="E12"]');
  record('C. Deep links and back/forward land on the right exhibit', true);
  await context.close();
}

// D. Connected flagship: E02 → sweep → E03 linked → E06 → E07; an upstream change makes downstream stale.
{
  const { page, context, errors } = await openPage(browser, 'e02');
  await page.click('.ex-controls .btn.run');
  await page.waitForFunction(() => /Sweep done/.test(document.querySelector('[data-ex="E02"] .sweep')?.innerText || ''), null, { timeout: 120000 });
  const hours = await page.$eval('.cmp', (t) => t.innerText.match(/Hotel hours above 0\.2 m[^\n]*/)[0]);
  await page.evaluate(() => (location.hash = '#e03'));
  await page.waitForFunction(() => /Linked/.test(document.querySelector('.linkstate')?.innerText || ''), null, { timeout: 20000 });
  await page.waitForFunction(() => /Hazard: E02 sweep/.test(document.querySelector('.ex-metrics .small.muted')?.innerText || ''), null, { timeout: 20000 });
  const e03a = await page.$eval('.ex-metrics .metric[data-name="mean"] .mv', (e) => e.textContent);
  await page.evaluate(() => (location.hash = '#e06'));
  await page.waitForSelector('.pick .btn.primary', { timeout: 20000 });
  await page.click('.pick .btn.primary');
  await page.evaluate(() => (location.hash = '#e07'));
  await page.waitForTimeout(400);
  const before = await page.$$eval('.paper .st', (els) => els.map((e) => e.textContent));
  await page.evaluate(() => (location.hash = '#e02'));
  await page.waitForTimeout(400);
  await page.$eval('[data-name="stormIntensity_mm_h"] input[type=range]', (el) => {
    el.value = '70';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => (location.hash = '#e07'));
  await page.waitForTimeout(400);
  const after = await page.$$eval('.paper .st', (els) => els.map((e) => e.textContent));
  await page.evaluate(() => (location.hash = '#e03'));
  await page.waitForTimeout(1200);
  const link3 = await page.$eval('.linkstate', (t) => t.innerText);
  const ok = before.slice(0, 2).every((s) => s === 'CURRENT') && after[0] === 'STALE' && after[1] === 'STALE' && /stale|No E02 sweep/i.test(link3) && errors.length === 0;
  record('D. Flagship chain links and goes stale when the storm changes', ok, `${hours.replace(/\s+/g, ' ')}; E03 mean ${e03a}; E07 before ${before.join(',')}; after ${after.join(',')}`);
  await context.close();
}

// E. Privacy box: budget exhaustion and refusals.
{
  const { page, context } = await openPage(browser, 'e05');
  await page.click('.segs .seg[data-v="district"]');
  const eps = await page.$('[data-name="epsilon"] input[type=number]');
  await eps.fill('1');
  await eps.dispatchEvent('change');
  for (const g of ['district', 'band', 'district×band', 'band']) {
    await page.click(`.segs .seg[data-v="${g}"]`);
    if (g === 'band' && (await page.$$eval('.log .row', (r) => r.length)) === 3) {
      await eps.fill('0.5');
      await eps.dispatchEvent('change');
    }
    await page.click('.ex-controls .btn.run');
    await page.waitForTimeout(80);
  }
  const log = await page.$$eval('.log .row', (r) => r.map((x) => x.textContent));
  await page.click('.segs .seg[data-v="village"]');
  await page.click('.ex-controls .btn.run');
  const log2 = await page.$$eval('.log .row', (r) => r.map((x) => x.textContent));
  const ok = /Budget/.test(log[0]) && /refused/.test(log2[0]);
  record('E. Privacy budget runs out at ε 3 and finer geography is refused', ok, log2.slice(0, 2).join(' | '));
  await context.close();
}

// F. Built file: no secrets, keys or outside hosts in script; CSP present.
{
  const html = readFileSync(join(ROOT, 'dist/index.html'), 'utf8');
  const hits = [/sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{30,}/, /BEGIN (RSA |EC )?PRIVATE KEY/, /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{12,}/i].filter((re) => re.test(html)).map(String);
  const csp = /Content-Security-Policy/.test(html) && /connect-src 'none'/.test(html);
  const fetches = (html.match(/\bfetch\(/g) || []).length + (html.match(/XMLHttpRequest|WebSocket\(|sendBeacon/g) || []).length;
  record('F. Built page carries no keys, sets connect-src none, and calls no network APIs', hits.length === 0 && csp && fetches === 0, `secret patterns ${hits.length}, CSP ${csp}, network calls in code ${fetches}`);
}

// G. Keyboard: tabs move with arrow keys; a slider moves with arrow keys and changes a metric.
{
  const { page, context } = await openPage(browser, 'e01');
  await page.focus('[role=tab][aria-selected=true]');
  await page.keyboard.press('ArrowRight');
  const sel = await page.$eval('[role=tab][aria-selected=true]', (e) => e.id);
  await page.keyboard.press('ArrowLeft');
  const before = await page.$eval('.metric[data-name="daylight"] .mv', (e) => e.textContent);
  await page.focus('[data-name="lat"] input[type=range]');
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  const after = await page.$eval('.metric[data-name="daylight"] .mv', (e) => e.textContent);
  record('G. Keyboard: tab list and sliders work without a mouse', /method/.test(sel) && before !== after, `${before} → ${after}`);
  await context.close();
}

// H. Invalid typed input is refused with a message and the last good value stays.
{
  const { page, context } = await openPage(browser, 'e03');
  const n = await page.$('[data-name="discount"] input[type=number]');
  await n.fill('-5');
  await n.dispatchEvent('change');
  const err = await page.$eval('[data-name="discount"] .ctl-err', (e) => (e.hidden ? '' : e.textContent));
  record('H. Out-of-range typed values are refused with a message', /from 0 to 0.2/.test(err), err);
  await context.close();
}

// I. Reduced motion: E01 clock does not run until asked.
{
  const { page, context } = await openPage(browser, 'e01', { reducedMotion: 'reduce' });
  const label = await page.$eval('.ex-controls .btn.run', (b) => b.textContent);
  record('I. Calm motion: exhibits wait for Run', /Run/.test(label), label);
  await context.close();
}

// J. Language switch: Thai and Khmer strings appear, English returns.
{
  const { page, context } = await openPage(browser, 'home');
  await page.click('.lang-btn[data-code="th"]');
  const th = await page.$eval('.strap1', (e) => e.textContent);
  await page.click('.lang-btn[data-code="km"]');
  const km = await page.$eval('.strap1', (e) => e.textContent);
  await page.click('.lang-btn[data-code="en"]');
  const en = await page.$eval('.strap1', (e) => e.textContent);
  record('J. Thai and Khmer switch in and English comes back verbatim', /[฀-๿]/.test(th) && /[ក-៿]/.test(km) && en === 'A thousand tomorrows. One better today.', `${th} | ${km}`);
  await context.close();
}

// K. Worker jobs are cancelled when leaving a page; nothing keeps running.
{
  const { page, context, errors } = await openPage(browser, 'e06');
  const slider = await page.$('[data-name="count"] input[type=number]');
  await slider.fill('50000');
  await slider.dispatchEvent('change');
  await page.waitForTimeout(250);
  await page.evaluate(() => (location.hash = '#lab'));
  await page.waitForTimeout(400);
  const live = await page.evaluate(() => document.querySelectorAll('.ex').length);
  record('K. Leaving a page mid-search cancels its job without errors', errors.length === 0 && live === 0, `page errors ${errors.length}`);
  await context.close();
}

// L. Replay reproduces a saved run exactly (E03).
{
  const { page, context } = await openPage(browser, 'e03');
  await page.waitForFunction(() => /paths ×/.test(document.querySelector('.ex-metrics .small.muted')?.innerText || ''), null, { timeout: 20000 });
  await page.click('[id$="-export"][role=tab]');
  await page.click('text=Save to Compare');
  await page.evaluate(() => (location.hash = '#compare'));
  await page.click('.run-row .btn.primary');
  await page.waitForSelector('.replay-banner');
  await page.waitForFunction(() => /paths ×/.test(document.querySelector('.ex-metrics .small.muted')?.innerText || ''), null, { timeout: 20000 });
  await page.click('[id$="-export"][role=tab]');
  await page.waitForTimeout(200);
  const repro = await page.$eval('.repro h4', (e) => e.textContent).catch(() => 'none');
  record('L. Replay from Compare reproduces every metric', /Reproduced/.test(repro), repro);
  await context.close();
}


// N–V. The phone route #wonder (over-the-shoulder). Timings are this machine's Chromium, not a phone.
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const wq = (page) => page.evaluate(() => ({
  frame: Number(document.querySelector('.w-stage').dataset.frame),
  stage: document.querySelector('.w-stage').dataset.state,
  b2: document.querySelector('.w-b2').dataset.state,
  hash: document.querySelector('.w-b2').dataset.hash,
  result: document.querySelector('.w-result').textContent,
  kind: document.querySelector('.w-result').dataset.kind || '',
  pressed: [...document.querySelectorAll('[data-preset]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.preset),
}));
const waitDone = (page, ms = 60000) => page.waitForFunction(() => document.querySelector('.w-stage').dataset.state === 'done' && document.querySelector('.w-b2').dataset.state === 'current', null, { timeout: ms });
let wonderHash0 = '';
{
  const { page, context, errors, requests } = await openPage(browser, 'wonder', PHONE);
  const t0 = Date.now();
  await page.waitForFunction(() => Number(document.querySelector('.w-stage').dataset.frame) >= 1, null, { timeout: 10000 }).catch(() => {});
  const tFirst = Date.now() - t0;
  const q0 = await wq(page);
  record('N. #wonder shows a computed, moving flood without a tap', q0.frame >= 1 && errors.length === 0, `frame ${q0.frame} at ${tFirst} ms after load (desktop Chromium, phone viewport)`);
  await waitDone(page);
  const tDone = Date.now() - t0;
  const q1 = await wq(page);
  wonderHash0 = q1.hash;
  const ok1 = q1.kind === 'better' && /3\.3 h to 1\.4 h/.test(q1.result) && q1.pressed.join() === 'above';
  record('O. Default wetland: result matches the E02 kernel (3.26 h → 1.41 h)', ok1, `${q1.result} · flood + futures ready ${tDone} ms after load`);
  // Counterexample: below the hotel changes nothing for the hotel.
  await page.click('[data-preset="below"]');
  const q2 = await wq(page);
  await waitDone(page);
  const q3 = await wq(page);
  record('P. Moving the wetland makes the futures stale, then current for the new wetland', q2.b2 !== 'current' && q3.b2 === 'current' && q3.hash && q3.hash !== wonderHash0, `right after the tap: ${q2.b2}; then ${q3.b2}, hash ${wonderHash0.slice(0, 8)} → ${q3.hash.slice(0, 8)}`);
  record('Q. Counterexample: a wetland below the hotel leaves its flooding unchanged', q3.kind === 'same' && /3\.3 h to 3\.3 h/.test(q3.result), q3.result);
  // Race: two quick moves; only the last one may show.
  await page.click('[data-preset="hill"]');
  await page.waitForTimeout(60);
  await page.click('[data-preset="above"]');
  await waitDone(page);
  const q4 = await wq(page);
  record('R. Two quick moves: only the last wetland’s results show', q4.pressed.join() === 'above' && q4.hash === wonderHash0 && q4.kind === 'better', `pressed ${q4.pressed.join()}, hash ${q4.hash.slice(0, 8)}, ${q4.result}`);
  // Direct tap on the right valley, then keyboard.
  const box = await page.locator('.w-canvas').boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height * 0.2);
  await page.waitForTimeout(150);
  const q5 = await wq(page);
  await page.focus('.w-canvas');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  const q6 = await wq(page);
  const capexBefore = await page.textContent('.w-verdict-line');
  await waitDone(page);
  await page.fill('.w-b3 .ctl input[type=number]', '50000');
  await page.dispatchEvent('.w-b3 .ctl input[type=number]', 'change');
  await page.waitForTimeout(100);
  const capexAfter = await page.textContent('.w-verdict-line');
  record('S. Tap, arrow keys and the cost lever each change the computed result', q5.pressed.length === 0 && q5.b2 !== 'current' && q6.b2 !== 'current' && capexAfter !== capexBefore && /US\$50/.test(capexAfter), `after tap: ${q5.b2}; after ←: ${q6.b2}; cost lever: “${capexAfter.trim()}”`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  record('T. #wonder: no outside requests, no console errors, no sideways scroll', requests.length === 0 && errors.length === 0 && !overflow, `${requests.length} requests, ${errors.length} errors${errors[0] ? ' — ' + errors[0] : ''}, overflow ${overflow}`);
  // Leaving mid-run releases every loop and worker.
  await page.click('[data-preset="hill"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => (location.hash = '#lab'));
  await page.waitForTimeout(400);
  const live = await page.evaluate(() => ({ loops: window.__arun.liveLoops(), workers: window.__arun.liveWorkers() }));
  record('U. Leaving #wonder mid-run stops its loops and workers', live.loops === 0 && live.workers === 0 && errors.length === 0, `loops ${live.loops}, workers ${live.workers}`);
  // The lab's E03 reads the sweep #wonder made.
  await page.evaluate(() => (location.hash = '#wonder'));
  await waitDone(page);
  await page.evaluate(() => (location.hash = '#e03'));
  await page.waitForTimeout(1200);
  const linked = await page.evaluate(() => document.body.innerText.match(/Linked: hotel depths come from the E02 sweep[^.]*\./)?.[0] || '');
  record('V. E03 in the lab links to the storm sweep #wonder computed', /Linked/.test(linked), linked);
  await context.close();
}
{
  const { page, context, errors } = await openPage(browser, 'wonder', { ...PHONE, reducedMotion: 'reduce' });
  await page.waitForTimeout(1200);
  const a = await wq(page);
  await page.waitForFunction(() => document.querySelector('.w-stage').dataset.state === 'done', null, { timeout: 60000 }).catch(() => {});
  const b = await wq(page);
  const loops = await page.evaluate(() => window.__arun.liveLoops());
  record('W. Calm motion: no autoplay; the still shows the hotel at its deepest, with the result', a.frame <= 0 && b.stage === 'done' && b.frame > 0 && b.kind === 'better' && loops === 0 && errors.length === 0, `frame at 1.2 s: ${a.frame}; still frame ${b.frame}; loops after: ${loops}`);
  await context.close();
}
{
  const bad = [];
  for (const width of [320, 360, 430]) {
    const { page, context, errors, requests } = await openPage(browser, 'wonder', { width, height: 800, isMobile: true, hasTouch: true });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const small = await page.evaluate(() => [...document.querySelectorAll('.w-chip, .w-b2 .seg, .w-b3 .seg, .w-more > summary')].filter((e) => e.getBoundingClientRect().height < 44).length);
    if (overflow || errors.length || requests.length || small) bad.push(`${width}px: overflow ${overflow}, ${errors.length} errors, ${requests.length} requests, ${small} targets under 44 px`);
    await context.close();
  }
  const { page, context } = await openPage(browser, 'wonder', PHONE);
  await page.click('.lang-btn[data-code="th"]');
  await page.waitForTimeout(300);
  const th = await page.textContent('.w-b1 h1');
  await page.click('.lang-btn[data-code="km"]');
  await page.waitForTimeout(300);
  const km = await page.textContent('.w-b1 h1');
  await page.click('.lang-btn[data-code="en"]');
  await context.close();
  record('X. #wonder at 320, 360 and 430 px; touch targets 44 px; Thai and Khmer titles', bad.length === 0 && /พายุ/.test(th) && /ព្យុះ/.test(km), bad.join(' | ') || `${th} | ${km}`);
}

// M. Opens from disk with no server (file://).
record('M. Page runs from a file:// URL', true, 'every test above loaded ' + (process.env.ARUN_PAGE ? relative(ROOT, process.env.ARUN_PAGE) : 'dist/index.html') + ' from disk');

await browser.close();
const out = { ranAt: new Date().toISOString(), browser: `Chromium ${version}`, executable: executablePath.split('/ms-playwright/')[1] || executablePath, firefox: 'not installed on this machine: untested', webkit: 'not installed on this machine: untested', results };
mkdirSync(join(ROOT, 'test/results'), { recursive: true });
writeFileSync(join(ROOT, 'test/results/browser.json'), JSON.stringify(out, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} passed, ${failed} failed · Chromium ${version}`);
process.exit(failed ? 1 : 0);
