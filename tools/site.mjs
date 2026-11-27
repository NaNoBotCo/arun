// Public copy for GitHub Pages: dist/index.html plus share-card tags → docs/index.html,
// with card.jpg (the home page at 1200×630), sitemap.xml, robots.txt and llms.txt.
// Run after `npm run build`:  node tools/site.mjs   (or npm run site)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const URL_ = 'https://nanobotco.github.io/arun/';
const REPO = 'https://github.com/NaNoBotCo/arun';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const page = readFileSync(join(ROOT, 'dist/index.html'), 'utf8');
const desc = 'A thousand tomorrows. One better today. Twenty-one live exhibits of computational foresight on a fictional Mekong valley, computed in your browser. English, Thai and Khmer.';
const tags = `<link rel="canonical" href="${URL_}">
<meta property="og:type" content="website"><meta property="og:site_name" content="NaNoBotCo">
<meta property="og:title" content="ARUN · อรุณ — A laboratory for possible worlds">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${URL_}">
<meta property="og:image" content="${URL_}card.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A night globe with the dawn line crossing it, and the words A thousand tomorrows. One better today.">
<meta property="og:locale" content="en_US"><meta property="og:locale:alternate" content="th_TH"><meta property="og:locale:alternate" content="km_KH">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${URL_}card.jpg">`;

const anchor = page.indexOf('<meta name="description"');
if (anchor < 0) throw new Error('site: no description meta in dist/index.html; run npm run build first');
const end = page.indexOf('>', anchor) + 1;
const out = page.slice(0, end) + '\n' + tags + page.slice(end);

mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, 'index.html'), out);
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(DOCS, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${URL_}</loc><lastmod>${today}</lastmod></url>
  <url><loc>${URL_}phnom-penh/</loc><lastmod>${today}</lastmod></url>
  <url><loc>${URL_}resilience/</loc><lastmod>${today}</lastmod></url>
</urlset>
`);
writeFileSync(join(DOCS, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${URL_}sitemap.xml\n`);
writeFileSync(join(DOCS, 'llms.txt'), `# ARUN · อรุณ

A thousand tomorrows. One better today. A laboratory for possible worlds.

One page, 21 exhibits of computational foresight. Every number is computed in the browser, seeded and reproducible, on a fictional Mekong-style valley; no real region, buyer or person is described. The page makes no network requests and opens offline. English, Thai and Khmer for the pitch, tour, menus and exhibit names.

Connected flagship (E01–E07): Planetary clock (sun and dawn line) · The Map of Tomorrow (a storm on the valley, today beside the same storm with a wetland; finite-volume water model) · Probability Loom (a thousand 20-year futures, paired Monte Carlo) · The Map That Learns (sensors correct the rain field; optimal interpolation) · Minimum Knowledge (noisy totals under a privacy budget; Laplace mechanism) · Opportunity Engine (solar, drip water and wetland options on a Pareto frontier) · The buyer's desk (a report and sample quote; each result marked current or out of date).

Research toys (E08–E21): Pattern Garden · Butterfly Chamber · Synchronization Garden · Temporal Symmetry Lab · Mathematical Blossoms · The Invisible Landscape · The River of Air · Earth Change Lens · The Signal Loom · The Resilience Network · The Scientific Instrument · Workload · Resource caps · The Laboratory of Alternatives.

Every exhibit exports a JSON run record checked against schemas/run-record.schema.json in the repo.

Page: ${URL_}
Repo: ${REPO}

Text CC BY 4.0, code MIT, fonts SIL OFL 1.1.
`);

// Share card: the home page itself, dark, at 1200×630.
if (!process.argv.includes('--no-card')) {
  const { launch } = await import('../test/browser/browser.mjs');
  const { browser } = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, colorScheme: 'dark', deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(join(DOCS, 'index.html')).href + '#home');
  await p.addStyleTag({ content: '.pitch, .pitch ~ * { visibility: hidden !important; }' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: join(DOCS, 'card.jpg'), type: 'jpeg', quality: 86 });
  await browser.close();
}
console.log(`site: ${join(DOCS, 'index.html')} (${(out.length / 1024).toFixed(0)} KB) + card.jpg, sitemap.xml, robots.txt, llms.txt`);
