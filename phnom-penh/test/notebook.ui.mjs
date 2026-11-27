// Browser check for the notebook: node test/notebook.ui.mjs
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'notebook-ui-'));
const entry = join(dir, 'entry.js');
writeFileSync(entry, `
import { setLang } from '${root}src/i18n.js';
import { mount } from '${root}src/ui/notebook.js';
import { BASELINE } from '${root}src/kernels/experiment.js';
const q = new URLSearchParams(location.search);
setLang(q.get('lang') || 'en');
let n = 0; window.__calls = [];
const rec = (name) => (...a) => { window.__calls.push({ name, args: JSON.parse(JSON.stringify(a)) }); };
const C = {
  BUILD: { version: '11.0', edition: 'demo' },
  renderSheet: rec('renderSheet'),
  exp: {
    state: () => ({ ...JSON.parse(JSON.stringify(BASELINE)), seed: 1 + (n % 5) }),
    log: () => [{ type: 'ring', ring: 'sub' }],
    metrics: () => { n++; return { outcome: { seed: 1 + ((n - 1) % 5), tWater: 40, net: { tWarn: 10, prep: 10 + n * 3, outcome: 'fits' }, alone: { prep: 2 }, gain: 5 }, uncertainty: { cover: 0.8, spread: 2, heldout: null } }; },
    load: rec('load'), replay: rec('replay'), show: rec('show'), compare: rec('compare'),
  },
};
window.__C = C;
window.__cleanup = mount(document.getElementById('root'), C);
window.__ready = true;
`);
const out = join(dir, 'out.js');
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: out, logLevel: 'error' });
const css = ['src/style.css', 'src/css/notebook.css'].map(f => readFileSync(join(root, f), 'utf8')).join('\n');
writeFileSync(join(dir, 'index.html'), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html,body{height:auto!important;overflow:visible!important;position:static!important}</style></head><body style="position:static;height:auto;overflow:visible;background:#0b1220;color:#f4f1ea;padding:0 16px"><div id="root"></div><script>${readFileSync(out, 'utf8')}</script></body></html>`);

const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe });
let fails = 0, total = 0;
const check = (name, ok, info = '') => { total++; if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, info); };
const DENY = `for (const k of ['indexedDB','localStorage']) Object.defineProperty(window, k, { get() { throw new DOMException('denied', 'SecurityError'); }, configurable: true });`;
const EVIL = '<b id="pwn">hi</b><img src=x onerror="window.__pwn=1">';

for (const denied of [false, true]) {
  for (const vp of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
    for (const lang of ['en', 'km', 'th']) {
      const tag = `${vp.width} ${lang} ${denied ? 'storage denied' : 'storage ok'}`;
      const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, acceptDownloads: true });
      if (denied) await ctx.addInitScript(DENY);
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      const url = `file://${join(dir, 'index.html')}?lang=${lang}`;
      await page.goto(url);
      await page.waitForFunction(() => window.__ready);
      await page.waitForFunction(() => document.querySelector('.nb-status').textContent.length > 0);
      const status = await page.textContent('.nb-status');
      check(`${tag} status line`, denied ? /IndexedDB|;|ទំព័រនេះមិនអាច|เก็บข้อมูลที่นี่ไม่ได้|cannot store/.test(status) && !/IndexedDB|browser storage/.test(status) || lang !== 'en' : /IndexedDB|IndexedDB/.test(status), status);
      if (lang === 'en') check(`${tag} status text`, denied ? /cannot store here; use Export/.test(status) : /on this phone, in IndexedDB/.test(status), status);

      // save two (second with an HTML-looking title), list
      await page.fill('.nb-save input', 'First run'); await page.fill('.nb-save textarea', 'Hotel Example, north side');
      await page.click('.nb-save .btn.go'); await page.waitForSelector('.nb-row');
      await page.fill('.nb-save input', EVIL); await page.click('.nb-save .btn.go');
      await page.click('.nb-save .btn.go'); // empty title: default
      await page.waitForFunction(() => document.querySelectorAll('.nb-row').length === 3);
      const titles = await page.$$eval('.nb-t', els => els.map(e => e.textContent));
      check(`${tag} save → list (3 rows, default title, text plain)`, titles.includes('First run') && titles.includes(EVIL) && titles.some(x => /3/.test(x) && x !== EVIL), titles.join(' | '));
      check(`${tag} user text is not rendered as HTML`, !(await page.$('#pwn')) && !(await page.evaluate(() => window.__pwn)) && !(await page.$('.nb img')));
      const meta = await page.$$eval('.nb-row .note', els => els.map(e => e.textContent));
      check(`${tag} row shows time, seed, lead`, meta.every(m => /\d{4}-\d\d-\d\d \d\d:\d\d · .*\d.* · .*\d/.test(m)) && !meta.some(m => /NaN|undefined/.test(m)), meta[0]);

      // sort by lead: highest lead first
      await page.click('[data-sort="lead"]');
      const leads = await page.$$eval('.nb-row .note', els => els.map(e => +(e.textContent.match(/(\d+(?:\.\d)?)[^\d]*$/) || [])[1]));
      check(`${tag} sort by lead`, leads.length === 3 && leads[0] >= leads[1] && leads[1] >= leads[2], leads.join(','));
      await page.click('[data-sort="title"]'); await page.click('[data-sort="newest"]');

      // open, replay
      const row = '.nb-row >> nth=0';
      await page.click(`${row} >> [data-act="open"]`); await page.click(`${row} >> [data-act="replay"]`);
      const calls = await page.evaluate(() => window.__calls.map(c => c.name));
      const loaded = await page.evaluate(() => window.__calls.find(c => c.name === 'load').args[0]);
      check(`${tag} open and replay call C.exp with the record`, calls.includes('load') && calls.includes('replay') && loaded.schemaVersion === 1 && loaded.scenario && Array.isArray(loaded.actions));

      // compare two, show
      await page.click('.nb-row >> nth=0 >> [data-act="cmp"]'); await page.click('.nb-row >> nth=1 >> [data-act="cmp"]');
      await page.click('[data-act="compare-go"]');
      await page.click('.nb-row >> nth=2 >> [data-act="show"]'); await page.click('[data-act="show-go"]');
      const cc = await page.evaluate(() => ({ c: window.__calls.find(c => c.name === 'compare'), s: window.__calls.find(c => c.name === 'show') }));
      check(`${tag} compare gets two records, show gets the chosen`, cc.c && cc.c.args.length === 2 && cc.c.args[0].experimentId !== cc.c.args[1].experimentId && cc.s && cc.s.args[0].length === 1);

      // rename, duplicate
      await page.click('.nb-row >> nth=0 >> [data-act="rename"]');
      await page.fill('.nb-row >> nth=0 >> input', 'Renamed'); await page.click('.nb-row >> nth=0 >> .btn.go');
      await page.waitForFunction(() => [...document.querySelectorAll('.nb-t')].some(e => e.textContent === 'Renamed'));
      await page.click('.nb-row >> nth=0 >> [data-act="dup"]'); await page.waitForFunction(() => document.querySelectorAll('.nb-row').length === 4);
      check(`${tag} rename and duplicate`, true);

      // controls and layout (delete confirm open too)
      await page.click('.nb-row >> nth=0 >> [data-act="delete"]');
      const small = await page.evaluate(() => [...document.querySelectorAll('.nb button, .nb input:not([type=checkbox]), .nb textarea, .nb label.nb-inc')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5); }).map(e => e.tagName + ':' + (e.textContent || e.className).slice(0, 12) + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
      check(`${tag} controls at least 44 px`, !small.length, small.slice(0, 5).join(', '));
      const tiny = await page.evaluate(() => [...document.querySelectorAll('.nb *')].filter(e => e.children.length === 0 && e.textContent.trim() && getComputedStyle(e).display !== 'none' && parseFloat(getComputedStyle(e).fontSize) < (e.classList.contains('note') || e.tagName === 'LI' || e.tagName === 'TEXTAREA' ? 13 : 14)).map(e => e.className + parseFloat(getComputedStyle(e).fontSize)));
      check(`${tag} text at least 14 px (notes 13)`, !tiny.length, tiny.join(','));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('.nb').scrollWidth > innerWidth);
      check(`${tag} no sideways scroll`, !wide);

      // delete: cancel leaves, yes removes
      await page.click('.nb-row >> nth=0 >> .btn >> nth=1');
      check(`${tag} delete cancel leaves the row`, (await page.$$('.nb-row')).length === 4);
      await page.click('.nb-row >> nth=0 >> [data-act="delete"]'); await page.click('[data-act="delete-yes"]');
      await page.waitForFunction(() => document.querySelectorAll('.nb-row').length === 3);
      check(`${tag} delete with confirm removes the row`, true);

      // export: default drops text; toggle includes it
      const dl1 = page.waitForEvent('download'); await page.click('.nb-io .row .btn >> nth=0'); const d1 = await dl1;
      const p1 = await d1.path(); const t1 = readFileSync(p1, 'utf8');
      check(`${tag} default export carries no free text`, !t1.includes('Hotel Example') && !t1.includes('First run') && !t1.includes('Renamed') && JSON.parse(t1).records.every(r => /^Experiment \d+$/.test(r.title) && r.notes === ''));
      await page.check('.nb-inc input');
      const dl2 = page.waitForEvent('download'); await page.click('.nb-io .row .btn >> nth=0'); const d2 = await dl2;
      const t2 = readFileSync(await d2.path(), 'utf8');
      check(`${tag} export with the toggle carries titles and notes`, t2.includes('Hotel Example') && t2.includes('First run'));
      await page.uncheck('.nb-inc input');

      // import: the same file again (renamed ids), a bad file, an old-format file
      const importFile = async (name, content) => {
        const fc = page.waitForEvent('filechooser'); await page.click('.nb-io .row .btn >> nth=1');
        (await fc).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) });
        await page.waitForFunction(() => document.querySelector('.nb-report').textContent.length > 0);
      };
      await importFile('same.json', t2);
      const rep1 = await page.textContent('.nb-report');
      const nRows = (await page.$$('.nb-row')).length;
      check(`${tag} import shows what came in (same records are skipped)`, /Imported 0|0/.test(rep1) && /3/.test(rep1) && nRows === 3, rep1.slice(0, 80) + ' rows ' + nRows);
      const bad = JSON.stringify({ format: 'arun-notebook', schemaVersion: 1, records: [{ ...JSON.parse(t2).records[0], experimentId: 'zzzzzzzz1', surprise: 1 }, { ...JSON.parse(t2).records[0], experimentId: 'zzzzzzzz2', schemaVersion: 9 }] });
      await page.evaluate(() => { document.querySelector('.nb-report').textContent = ''; });
      await importFile('bad.json', bad);
      const rep2 = await page.textContent('.nb-report');
      check(`${tag} import shows what was rejected and why`, /unknown key "surprise"/.test(rep2) && /Unsupported schemaVersion 9/.test(rep2) && (await page.$$('.nb-row')).length === 3, rep2.slice(0, 160));
      await page.evaluate(() => { document.querySelector('.nb-report').textContent = ''; });
      const evilFile = JSON.stringify({ format: 'arun-notebook', schemaVersion: 1, records: [{ ...JSON.parse(t2).records[0], experimentId: 'zzzzzzzz3', title: EVIL, notes: '<script>window.__pwn=2</script>' }] });
      await importFile('evil.json', evilFile);
      await page.waitForFunction(() => document.querySelectorAll('.nb-row').length === 4);
      check(`${tag} imported script-looking text stays text`, !(await page.$('#pwn')) && !(await page.evaluate(() => window.__pwn)));

      const body = await page.evaluate(() => document.getElementById('root').innerText);
      check(`${tag} no NaN/undefined`, !/NaN|undefined|\[object/.test(body));
      if (lang === 'km') check('km text', /[ក-៿]/.test(body));
      if (lang === 'th') check('th text', /[฀-๿]/.test(body));
      if (vp.width === 360 && lang === 'en' && !denied) await page.screenshot({ path: join(dir, 'nb-360.png'), fullPage: true });

      // persistence
      await page.reload(); await page.waitForFunction(() => window.__ready);
      await page.waitForFunction(() => document.querySelector('.nb-status').textContent.length > 0);
      await page.waitForTimeout(150);
      const after = (await page.$$('.nb-row')).length;
      check(`${tag} after reload: ${denied ? 'empty (nothing stored)' : 'rows stay'}`, denied ? after === 0 : after === 4, 'rows ' + after);
      check(`${tag} no errors`, !errs.length, errs.slice(0, 3).join(' | '));
      await ctx.close();
    }
  }
}
// localStorage fallback when IndexedDB alone is denied
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await ctx.addInitScript(`Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('denied', 'SecurityError'); }, configurable: true });`);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`file://${join(dir, 'index.html')}`); await page.waitForFunction(() => window.__ready);
  await page.waitForFunction(() => document.querySelector('.nb-status').textContent.length > 0);
  await page.click('.nb-save .btn.go'); await page.waitForSelector('.nb-row'); await page.reload(); await page.waitForSelector('.nb-row');
  check('localStorage fallback leaves the row', /browser storage/.test(await page.textContent('.nb-status')) && !errs.length);
  await ctx.close();
}
await browser.close();
console.log(`${total - fails}/${total} passed`);
console.log('screenshot', join(dir, 'nb-360.png'));
process.exit(fails ? 1 : 0);
