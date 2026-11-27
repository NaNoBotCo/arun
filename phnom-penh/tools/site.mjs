// Public copy for GitHub Pages: the external file plus share-card tags → ../docs/phnom-penh/index.html,
// with card.jpg (the city at 1200×630). Run after `node tools/build.mjs --edition external`.
// node tools/site.mjs [--docs ../docs/phnom-penh]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DOCS = resolve(arg('--docs', '../docs/phnom-penh'));
const URL_ = 'https://nanobotco.github.io/arun/phnom-penh/';
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const page = readFileSync('dist/arun-phnom-penh.html', 'utf8');
if (!/"edition":"external"/.test(page)) throw new Error('site: dist/arun-phnom-penh.html is not the external edition');
const desc = 'Phnom Penh, worlds in your hands: proposed cameras and gauges report an illustrative storm over the mapped city, a forecast forms, a facility gets time to prepare. Build, compare on unseen storms, inspect the evidence, save experiments. One offline page; English, Khmer, Thai.';
const tags = `<link rel="canonical" href="${URL_}">
<meta property="og:type" content="website"><meta property="og:site_name" content="NaNoBotCo">
<meta property="og:title" content="ARUN · Phnom Penh — worlds in your hands">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${URL_}">
<meta property="og:image" content="${URL_}card.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Phnom Penh from the south-east at dusk, with rain sensors over the city and the rivers.">
<meta property="og:locale" content="en_US"><meta property="og:locale:alternate" content="km_KH"><meta property="og:locale:alternate" content="th_TH">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${URL_}card.jpg">`;
const anchor = page.indexOf('<meta name="description"');
const end = page.indexOf('>', anchor) + 1;
const out = page.slice(0, end) + '\n' + tags + page.slice(end);
mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, 'index.html'), out);
// card: the city with its sensors, no sheet
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(out); }).listen(0);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(`http://localhost:${srv.address().port}/?nointro&fresh&t=58`);
await p.waitForFunction(() => window.__ready);
await p.addStyleTag({ content: `#sheet,#timebar,#scenario,#caption,#showbar,#top,#labels{display:none!important}
  #cardText{position:absolute;left:0;right:0;bottom:0;z-index:30;padding:120px 56px 44px;background:linear-gradient(rgba(11,18,32,0),rgba(11,18,32,.86) 55%);font-family:'Kantumruy Pro',sans-serif;color:#f4f1ea}
  #cardText b{display:block;color:#f5c451;letter-spacing:.3em;font-size:22px;margin-bottom:6px}
  #cardText h1{margin:0;font-size:58px;line-height:1.05;font-weight:700}
  #cardText p{margin:10px 0 0;font-size:24px;color:#c9d1dc}` });
await p.evaluate(() => {
  const d = document.createElement('div'); d.id = 'cardText';
  d.innerHTML = '<b>ARUN · ភ្នំពេញ</b><h1>Phnom Penh, worlds in your hands</h1><p>Build a rain network, test it on storms you have not seen, save what works.</p>';
  document.getElementById('app').appendChild(d);
  const st = window.__CTX.storm, az = Math.atan2(st.ux, -st.uy) - 0.45;
  window.__world.flyTo({ x: -5200, y: 300, dist: 21000, az, el: 0.5 }, 0);
});
await p.waitForTimeout(3000);
await p.screenshot({ path: join(DOCS, 'card.jpg'), type: 'jpeg', quality: 86 });
await browser.close(); srv.close();
console.log(`site: ${join(DOCS, 'index.html')} (${(out.length / 1048576).toFixed(2)} MB) + card.jpg`);
