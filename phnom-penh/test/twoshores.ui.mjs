// Two shores in a browser: node test/twoshores.ui.mjs  (esbuild bundle of a small harness, Chrome for Testing)
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const R = p => fileURLToPath(new URL('../' + p, import.meta.url));
mkdirSync(R('test/results'), { recursive: true });
const entry = R('test/results/twoshores.harness.js');
writeFileSync(entry, `
import { mount } from '${R('src/ui/twoshores.js')}';
import { setLang } from '${R('src/i18n.js')}';
window.__setLang = l => { setLang(l); document.documentElement.lang = l; };
window.__mount = () => { const c = document.getElementById('root'); c.replaceChildren(); window.__cleanup && window.__cleanup(); window.__C = { S: {}, renderSheet() {} }; window.__cleanup = mount(c, window.__C); };
`);
const js = (await build({ entryPoints: [entry], bundle: true, format: 'iife', write: false })).outputFiles[0].text;
const css = (await import('node:fs')).readFileSync(R('src/style.css'), 'utf8') + (await import('node:fs')).readFileSync(R('src/css/twoshores.css'), 'utf8');
const html = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>${css}
html,body{overflow:auto!important;height:auto!important;font-family:'Kantumruy Pro','Noto Sans Thai',system-ui,sans-serif}#root{padding:12px 16px}</style><div id=root></div><script>${js}</script>`;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe });
let fails = 0; const check = (n, ok, i = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', n, i); };
for (const vp of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.setContent(html);
  for (const lang of ['en', 'km', 'th']) {
    const tag = `${vp.width} ${lang}`;
    await page.evaluate(l => { window.__setLang(l); window.__mount(); }, lang);
    const m = await page.evaluate(() => {
      const bad = [...document.querySelectorAll('#root button, #root input[type=range]')].filter(e => e.getBoundingClientRect().height < 43.5).length;
      return { wide: document.documentElement.scrollWidth > innerWidth + 1, bad, text: document.getElementById('root').innerText, arms: document.querySelectorAll('.ts-arm').length };
    });
    check(`${tag} no sideways scroll`, !m.wide);
    check(`${tag} controls at least 44 px`, m.bad === 0, String(m.bad));
    check(`${tag} 8 arm rows, no NaN or undefined`, m.arms === 8 && !/NaN|undefined|\[object/.test(m.text));
    if (lang !== 'en') check(`${tag} words translated`, !/Chiang Mai lab|Training cases/.test(m.text));
    if (lang === 'en') {
      // opt out: Chiang Mai stops sharing its method; the Phnom Penh method arm is shown as unavailable
      await page.click('.ts-card.cm .ts-tog:nth-of-type(2)');
      const t2 = await page.evaluate(() => document.getElementById('root').innerText);
      check(`${tag} opt-out shows arm unavailable`, /Not available: Chiang Mai lab \(simulated\) does not share its method/.test(t2));
      check(`${tag} negative transfer marked`, /Worse than local-only/.test(t2));
      await page.locator('.ts-res').first().screenshot({ path: R(`test/results/twoshores-${vp.width}-cm.png`) }); await page.locator('.ts-res').nth(1).screenshot({ path: R(`test/results/twoshores-${vp.width}-pp.png`) });
      await page.click('.ts-card.cm .ts-tog:nth-of-type(2)');
    }
  }
  check(`${vp.width} no console errors`, errs.length === 0, errs.join('; '));
  await ctx.close();
}
await browser.close(); process.exit(fails ? 1 : 0);
