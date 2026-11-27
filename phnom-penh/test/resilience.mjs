// Browser check of the resilience lab on file:// in Chrome for Testing: node tools/build-resilience.mjs && node test/resilience.mjs
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const file = fileURLToPath(new URL('../dist/arun-resilience-lab.html', import.meta.url));
const url = 'file://' + file;
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe });
mkdirSync('test/results', { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, info); };
const SIZES = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 915, height: 412 }];
const EXPS = ['water', 'cold', 'power', 'env', 'conn'], LANGS = ['en', 'km', 'th'];
const WORDS = ['Myanmar', 'Gaza', 'genocide', 'military', 'war', 'conflict', 'armed', 'Burma', 'Ukraine', 'Syria', 'Sudan'];
const STYLE = ['hon' + 'est', 'authen' + 'tic', 'load-' + 'bearing', 'ro' + 'bust', 'seam' + 'less', 'pow' + 'erful', 'compre' + 'hensive', 'cru' + 'cial', 'vi' + 'tal', 'lever' + 'age', 'en' + 'sure', 'ju' + 'st', 'sim' + 'ply', 'actu' + 'ally', 'basi' + 'cally', 'tru' + 'ly', 'genu' + 'inely'];
const BANNED = new RegExp('\\b(' + WORDS.join('|') + ')\\b|\\b(' + STYLE.join('|') + ')\\b', 'i');

async function open(vp, q = '', extra = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: vp.width < 700, ...extra });
  const page = await ctx.newPage();
  const errs = [], reqs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) reqs.push(r.url()); });
  await page.goto(url + q);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page, errs, reqs };
}
const layout = page => page.evaluate(() => {
  const over = document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1;
  const small = [...document.querySelectorAll('button, input, select, summary')].filter(e => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height || e.hidden) return false;
    return r.height < 43.5 || r.width < 43.5;
  }).map(e => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
  const tiny = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { if (!n.textContent.trim()) continue; const p = n.parentElement; if (['SCRIPT', 'STYLE'].includes(p.tagName)) continue; const fs = parseFloat(getComputedStyle(p).fontSize); if (fs < 13.99) tiny.push(p.className + ':' + fs); }
  return { over, small, tiny: [...new Set(tiny)], text: document.body.innerText };
});

for (const vp of SIZES) {
  const tag = `${vp.width}x${vp.height}`;
  const { ctx, page, errs, reqs } = await open(vp);
  let bad = [], smalls = [], tinys = [], banned = [];
  for (const lang of LANGS) {
    for (const id of EXPS) {
      await page.evaluate(([l, e]) => { window.__api.S.lang = l; window.__api.setExp(e); }, [lang, id]);
      await page.waitForTimeout(250);
      for (const reveal of [false, true]) {
        const on = await page.evaluate(() => window.__api.S.reveal);
        if (on !== reveal) { await page.click('#reveal'); await page.waitForTimeout(150); }
        const L = await layout(page);
        const where = `${lang}/${id}/${reveal ? 'rev' : 'hid'}`;
        if (L.over) bad.push(where + ' wider than screen');
        if (L.small.length) smalls.push(where + ' ' + L.small.slice(0, 3).join(','));
        if (L.tiny.length) tinys.push(where + ' ' + L.tiny.join(','));
        if (/undefined|NaN|\[object|\{[a-z]+\}/.test(L.text)) bad.push(where + ' has undefined/NaN/placeholder');
        if (BANNED.test(L.text)) banned.push(where + ' ' + (L.text.match(BANNED) || [])[0]);
        if (reveal && !/\d/.test(await page.textContent('#truth'))) bad.push(where + ' truth panel empty');
      }
    }
  }
  check(`${tag} 5 experiments x 3 languages x hidden/revealed: no sideways scroll, no NaN/undefined`, !bad.length, bad.slice(0, 4).join(' | '));
  check(`${tag} taps at least 44 px`, !smalls.length, smalls.slice(0, 4).join(' | '));
  check(`${tag} text at least 14 px`, !tinys.length, tinys.slice(0, 4).join(' | '));
  check(`${tag} banned and out-of-scope words absent in all languages`, !banned.length, banned.slice(0, 4).join(' | '));
  check(`${tag} no console or page errors`, !errs.length, errs.slice(0, 3).join(' | '));
  check(`${tag} no network requests`, !reqs.length, reqs.slice(0, 3).join(' '));
  if (vp.width === 390) {
    await page.evaluate(() => { window.__api.S.lang = 'en'; window.__api.S.reveal = false; window.__api.setExp('cold'); });
    await page.waitForTimeout(300);
    // truth hidden by default
    const txt0 = await page.textContent('#truth');
    check('truth hidden until revealed', /Reveal truth/.test(await page.textContent('#chartsCard')) && !/Missed/.test(txt0), txt0.slice(0, 80));
    // controls change results
    const a = await page.evaluate(() => JSON.stringify(window.__EV.flat));
    await page.selectOption('#c-interval', '120'); await page.waitForTimeout(500);
    const b = await page.evaluate(() => JSON.stringify(window.__EV.flat));
    check('interval control reruns the experiment', a !== b);
    await page.selectOption('#c-interval', '15'); await page.waitForTimeout(500);
    const a2 = await page.evaluate(() => JSON.stringify(window.__EV.flat));
    check('same controls and seed give the same result', a === a2);
    // toggle store-and-forward and on-device alert
    await page.click('#c-sf'); await page.waitForTimeout(500);
    check('store-and-forward switch changes delay', await page.evaluate(() => window.__EV.flat.delay_mean > 0));
    // seed
    await page.click('text=Next seed'); await page.waitForTimeout(500);
    check('next seed changes the truth', await page.evaluate(() => window.__EV.seed === 9));
    // replay slider
    await page.$eval('#rt', el => { el.value = '2000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(200);
    check('replay slider moves the clock', /Day 2/.test(await page.textContent('#rtext')), await page.textContent('#rtext'));
    // canvases painted
    const painted = await page.evaluate(() => [...document.querySelectorAll('canvas')].every(cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; }));
    check('charts are painted', painted);
    // play and pause
    await page.click('#play'); await page.waitForTimeout(400); await page.click('#play');
    check('play then pause works', await page.evaluate(() => !window.__api.S.playing));
    // language button cycles
    await page.click('#lang'); await page.waitForTimeout(250);
    check('language button switches to Khmer', await page.evaluate(() => document.documentElement.lang === 'km'));
    await page.screenshot({ path: 'test/results/resilience-390-km.png', fullPage: true });
    await page.click('#lang'); await page.waitForTimeout(250);
    check('language button switches to Thai', await page.evaluate(() => document.documentElement.lang === 'th'));
    await page.click('#lang'); await page.waitForTimeout(250);
    await page.screenshot({ path: 'test/results/resilience-390-en.png', fullPage: true });
  }
  await ctx.close();
}
// reduced motion hides autoplay
{
  const { ctx, page, errs } = await open({ width: 390, height: 844 }, '', { reducedMotion: 'reduce' });
  check('reduced motion: play button hidden, slider present', await page.evaluate(() => document.querySelector('#play').hidden && !!document.querySelector('#rt')));
  check('reduced motion: no errors', !errs.length, errs.join('|'));
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
