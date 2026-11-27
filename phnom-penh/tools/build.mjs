// One offline HTML file: bundle src/main.js, inline the data, photos and fonts.
// node tools/build.mjs [--edition external|private] [--out dist/arun-phnom-penh.html]
// external: the demo to show; carries no team research results (src/edition/evidence.external.js), and the
//           build stops if any listed private string appears in the file.
// private:  for the team; swaps in private/evidence.js (outside the public repository).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { PROPOSED, snapToRoads } from '../src/kernels/sensors.js';
const R = p => new URL('../' + p, import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const edition = arg('--edition', 'external');
if (!['external', 'private'].includes(edition)) throw new Error('edition: external or private');
const out = arg('--out', edition === 'private' ? 'dist/arun-phnom-penh-private.html' : 'dist/arun-phnom-penh.html');
const VERSION = JSON.parse(readFileSync(R('package.json'))).version;
const t0 = Date.now();
const privFile = fileURLToPath(R('private/evidence.js'));
if (edition === 'private' && !existsSync(privFile)) throw new Error('private build needs private/evidence.js');
const editionPlugin = { name: 'edition', setup(b) { b.onResolve({ filter: /^#edition$/ }, () => ({ path: edition === 'private' ? privFile : fileURLToPath(R('src/edition/evidence.external.js')) })); } };

const js = (await build({ entryPoints: [fileURLToPath(R('src/main.js'))], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none', plugins: [editionPlugin] })).outputFiles[0].text;
const css = [readFileSync(R('src/style.css'), 'utf8'), ...readdirSync(R('src/css/')).filter(f => f.endsWith('.css')).sort().map(f => readFileSync(R('src/css/' + f), 'utf8'))].join('\n');
const geo = JSON.parse(readFileSync(R('data/geo.json')));
const photos = JSON.parse(readFileSync(R('data/photos.json')));
for (const [k, m] of Object.entries(photos)) m.src = 'data:image/webp;base64,' + readFileSync(R(`data/photos/${k}.webp`)).toString('base64');
const font = f => readFileSync(R(`data/fonts/${f}.woff2`)).toString('base64');
const KM = 'U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC', TH = 'U+0E01-0E5B, U+200C-200D, U+25CC';
const fonts = `
@font-face{font-family:'Kantumruy Pro';font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${font('KantumruyPro-400-latin')}) format('woff2')}
@font-face{font-family:'Kantumruy Pro';font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${font('KantumruyPro-400-khmer')}) format('woff2');unicode-range:${KM}}
@font-face{font-family:'Noto Sans Thai';font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${font('NotoSansThai-400-thai')}) format('woff2');unicode-range:${TH}}
@font-face{font-family:'Moul';font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${font('Moul-400-khmer')}) format('woff2');unicode-range:${KM}}
@font-face{font-family:'Cormorant Garamond';font-weight:600;font-display:swap;src:url(data:font/woff2;base64,${font('CormorantGaramond-600-latin')}) format('woff2')}`;
const data = {
  built: new Date().toISOString(), version: VERSION, edition,
  geo, terrain: JSON.parse(readFileSync(R('data/terrain.json'))),
  buildings: gzipSync(readFileSync(R('data/buildings.bin')), { level: 9 }).toString('base64'),
  buildingsMeta: JSON.parse(readFileSync(R('data/buildings.json'))),
  landmarks: JSON.parse(readFileSync(R('data/landmarks.json'))),
  sensors: snapToRoads(PROPOSED, geo).map(({ id, kind, ring, x, y }) => ({ id, kind, ring, x: Math.round(x), y: Math.round(y) })),
  bench: existsSync(R('data/bench.json')) ? JSON.parse(readFileSync(R('data/bench.json'))) : null,
  photos: Object.fromEntries(Object.entries(photos).filter(([k]) => k !== 'koh-pich')),
  hero: { ...photos['koh-pich'], src: undefined },
};
const html = readFileSync(R('src/index.html'), 'utf8')
  .replace('/*FONTS*/', fonts).replace('/*CSS*/', css)
  .replace('%HERO%', photos['koh-pich'].src)
  .replace('/*DATA*/', JSON.stringify(data).replace(/</g, '\\u003c'))
  .replace('/*JS*/', () => js.replace(/<\/script/g, '<\\/script'));
// The external file carries none of the strings in private/strings.json (team names, preliminary results,
// private links), which is outside the public repository; without it, the build checks for local paths and links.
const STR = existsSync(R('private/strings.json')) ? JSON.parse(readFileSync(R('private/strings.json'))) : { forbidden: ['/Users/', 'claude.ai'] };
const PRIVATE_STRINGS = STR.forbidden;
if (edition === 'external') {
  // code, styles, the page template and every text field of the data; not coordinates, terrain or image bytes
  const textData = JSON.stringify({ ...data, geo: null, terrain: null, buildings: null, photos: Object.fromEntries(Object.entries(data.photos).map(([k, v]) => [k, { ...v, src: null }])) });
  const scan = [js, css, readFileSync(R('src/index.html'), 'utf8'), textData].join('\n');
  const hits = PRIVATE_STRINGS.filter(w => scan.includes(w));
  if (hits.length) { console.error('external build carries private strings:', hits.join(', ')); process.exit(2); }
}
mkdirSync(R(out.split('/').slice(0, -1).join('/') + '/'), { recursive: true });
writeFileSync(R(out), html);
console.log(edition, out, (statSync(R(out)).size / 1048576).toFixed(2), 'MB', 'js', (js.length / 1024).toFixed(0), 'kB', Date.now() - t0, 'ms');

// The same page for an Artifact page host: the host supplies the document skeleton and viewport meta.
const art = html.replace(/^<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>/i, '')
  .replace(/<\/head>\s*<body>/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
writeFileSync(R(out.replace(/\.html$/, '.artifact.html')), art);
console.log('artifact variant', (art.length / 1048576).toFixed(2), 'MB', art.slice(0, 40).replace(/\n/g, ' '));
