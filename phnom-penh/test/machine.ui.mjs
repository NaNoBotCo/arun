// Browser check for the machine lens: node test/machine.ui.mjs
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'machine-ui-'));
const entry = join(dir, 'entry.js');
writeFileSync(entry, `
import { addWords, setLang } from '${root}src/i18n.js';
import { mount } from '${root}src/ui/machine.js';
import bench from '${root}data/bench.json';
addWords({ tag_measured:{en:'measured',km:'បានវាស់',th:'วัดแล้ว'}, tag_benchmark:{en:'benchmark',km:'ការវាស់ស្ដង់ដារ',th:'เกณฑ์วัด'}, tag_assumed:{en:'assumed',km:'សន្មត',th:'สมมติ'} });
const q = new URLSearchParams(location.search);
setLang(q.get('lang') || 'en');
const C = { phoneBench: q.get('nophone') ? null : { perSec: 4.1e6 }, DATA: { bench }, counter: { runs: 12, cells: 3072 }, S: {} };
window.__C = C;
mount(document.getElementById('root'), C);
window.__ready = true;
`);
const out = join(dir, 'out.js');
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: out, loader: { '.json': 'json' }, logLevel: 'error' });
const css = ['src/style.css', 'src/css/machine.css'].map(f => readFileSync(join(root, f), 'utf8')).join('\n');
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html,body{height:auto!important;overflow:visible!important;position:static!important}</style></head><body style="position:static;height:auto;overflow:visible;background:#0b1220;color:#f4f1ea;padding:0 16px" data-x="background:#0b1220;color:#f4f1ea;padding:0 16px"><div id="root"></div><script>${readFileSync(out, 'utf8')}</script></body></html>`;
writeFileSync(join(dir, 'index.html'), html);

const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe });
let fails = 0;
const check = (name, ok, info = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, info); };
for (const vp of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
  for (const lang of ['en', 'km', 'th']) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`file://${join(dir, 'index.html')}?lang=${lang}`);
    await page.waitForFunction(() => window.__ready);
    const tag = `${vp.width} ${lang}`;
    const body = await page.evaluate(() => document.getElementById('root').innerText);
    check(`${tag} text present, no NaN/undefined`, body.length > 800 && !/NaN|undefined|\[object/.test(body), body.length + '');
    await page.click('summary'); // open prices
    await page.click('.presets .btn:nth-child(3)'); // Cambodia
    await page.fill('.mc .pg input >> nth=4', '30000000'); // server core mid
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check(`${tag} no sideways scroll`, !wide);
    const small = await page.evaluate(() => [...document.querySelectorAll('.mc button, .mc input, .mc summary')].filter(e => e.getBoundingClientRect().height < 43.5).map(e => e.tagName + (e.type || '')));
    check(`${tag} controls at least 44 px`, !small.length, small.join(','));
    const badText = await page.evaluate(() => /NaN|undefined/.test(document.getElementById('root').innerText));
    check(`${tag} after changes`, !badText);
    if (lang === 'km') check('km text', /[ក-៿]/.test(body));
    if (lang === 'th') check('th text', /[฀-๿]/.test(body));
    check(`${tag} no console errors`, !errs.length, errs.join(' | '));
    if (vp.width === 390 && lang === 'en') await page.screenshot({ path: join(dir, 'en.png'), fullPage: true });
    await ctx.close();
  }
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`file://${join(dir, 'index.html')}?nophone=1`); await page.waitForFunction(() => window.__ready);
  const body = await page.evaluate(() => document.getElementById('root').innerText);
  check('no phone measurement handled', /Not measured on this device yet/.test(body) && /Not computed/.test(body) && !errs.length);
  await ctx.close();
}
console.log('screenshot dir', dir);
await browser.close();
process.exit(fails ? 1 : 0);
