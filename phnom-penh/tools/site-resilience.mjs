// Public copy for GitHub Pages: dist/arun-resilience-lab.html plus share-card tags → ../docs/resilience/index.html,
// with card.jpg (the lab at 1200×630). Run after `node tools/build-resilience.mjs`.
// node tools/site-resilience.mjs [--docs ../docs/resilience]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DOCS = resolve(arg('--docs', '../docs/resilience'));
const URL_ = 'https://nanobotco.github.io/arun/resilience/';
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const page = readFileSync('dist/arun-resilience-lab.html', 'utf8');
const desc = 'A synthetic lab for measuring telemetry and alert behaviour when civilian services are disrupted: water, cold rooms, power, air and missing links. Fictional facilities, synthetic data, seeded and replayable. English, Khmer, Thai.';
const tags = `<link rel="canonical" href="${URL_}">
<meta property="og:type" content="website"><meta property="og:site_name" content="NaNoBotCo">
<meta property="og:title" content="ARUN · Resilience lab">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${URL_}">
<meta property="og:image" content="${URL_}card.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The resilience lab: a tank level chart with alerts, and the five experiments water, cold, power, air and link.">
<meta property="og:locale" content="en_US"><meta property="og:locale:alternate" content="km_KH"><meta property="og:locale:alternate" content="th_TH">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${URL_}card.jpg">`;
const anchor = page.indexOf('<meta name="description"');
if (anchor < 0) throw new Error('site-resilience: no description meta');
const end = page.indexOf('>', anchor) + 1;
const out = page.slice(0, end) + '\n' + tags + page.slice(end);
mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, 'index.html'), out);
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(out); }).listen(0);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(`http://localhost:${srv.address().port}/`);
await p.waitForTimeout(800);
await p.click('#reveal').catch(() => {});
await p.addStyleTag({ content: `.scope,#expcard,#controls,#reveal,#replay,#obs,#truth,#assume,nav.tabs{display:none!important}
  #chartsCard figure:not(:first-of-type){display:none!important}
  #cardText{position:fixed;left:0;right:0;bottom:0;z-index:30;padding:90px 56px 40px;background:linear-gradient(rgba(11,18,32,0),rgba(11,18,32,.92) 45%);font-family:'Kantumruy Pro',sans-serif;color:#f4f1ea}
  #cardText b{display:block;color:#f5c451;letter-spacing:.3em;font-size:22px;margin-bottom:6px}
  #cardText h1{margin:0;font-size:48px;line-height:1.05;font-weight:700;white-space:nowrap}
  #cardText p{margin:10px 0 0;font-size:24px;color:#c9d1dc}` });
await p.evaluate(() => {
  const d = document.createElement('div'); d.id = 'cardText';
  d.innerHTML = '<b>ARUN · RESILIENCE LAB</b><h1>When the water, power or link drops out</h1><p>Fictional facilities, synthetic data: what an alert sees, and when.</p>';
  document.body.appendChild(d);
});
await p.waitForTimeout(1200);
await p.screenshot({ path: join(DOCS, 'card.jpg'), type: 'jpeg', quality: 86 });
await browser.close(); srv.close();
console.log(`site: ${join(DOCS, 'index.html')} (${(out.length / 1024).toFixed(0)} kB) + card.jpg`);
