// The test build as a published page: node tools/site-touch.mjs <docs dir> [path]   e.g. ../../arun-publish/docs city
// Copies dist/arun-touch.html with share tags, and makes card.jpg (1200 × 630) from the page itself.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [docs, path = 'city'] = process.argv.slice(2);
const url = `https://nanobotco.github.io/arun/${path}/`;
const title = 'ARUN · Phnom Penh, ready for tomorrow';
const desc = 'A simulated Phnom Penh on the real map: street cameras that send numbers, not pictures; warnings before bad air, heavy rain, flooded streets and traffic jams; drag time; try a higher river. One offline page, English, Khmer, Thai.';
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const tags = `<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="NaNoBotCo">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${url}card.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Phnom Penh in 3D at morning, street cameras glowing at junctions, with the words A city ready for tomorrow">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${url}card.jpg">`;
const html = readFileSync(new URL('../dist/arun-touch.html', import.meta.url), 'utf8').replace(/(<title>[^<]*<\/title>)/, `$1\n${tags}`);
mkdirSync(`${docs}/${path}`, { recursive: true });
writeFileSync(`${docs}/${path}/index.html`, html);
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(0);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
await page.goto(`http://localhost:${srv.address().port}/?shot&nocoach&lang=en`);
await page.waitForFunction(() => window.__ready && window.__ready.full, null, { timeout: 30000 });
await page.addStyleTag({ content: '#chips,#timebar,#layers,#lang,#alerts{display:none!important} #title{top:40%!important} #title span{font-size:64px!important;max-width:900px!important}' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${docs}/${path}/card.jpg`, type: 'jpeg', quality: 86 });
await browser.close(); srv.close();
console.log(`${docs}/${path}/index.html`, (html.length / 1048576).toFixed(2), 'MB + card.jpg');
