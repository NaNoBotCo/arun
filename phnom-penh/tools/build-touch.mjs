// The draft as one offline HTML file: node tools/build-touch.mjs [--out dist/arun-touch.html]
// Same map data as the Phnom Penh demo (streets, buildings, terrain, landmarks), plus the cached world
// (junction sites and their rain warnings from the nowcast kernel, src/touch/fixture.js). No photos.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { makeFixture } from '../src/touch/fixture.js';
const R = p => new URL('../' + p, import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('--out', 'dist/arun-touch.html');
const t0 = Date.now();
// until src/touch/street.js exists, --stub-street points the build at a stand-in
const stub = arg('--stub-street', null);
const streetPlugin = { name: 'street', setup(b) { b.onResolve({ filter: /^\.\/street\.js$/ }, a => (!existsSync(fileURLToPath(R('src/touch/street.js'))) && stub ? { path: stub } : undefined)); } };
const js = (await build({ entryPoints: [fileURLToPath(R('src/touch/main.js'))], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none', plugins: [streetPlugin] })).outputFiles[0].text;
const css = readFileSync(R('src/touch/touch.css'), 'utf8');
const font = f => readFileSync(R(`data/fonts/${f}.woff2`)).toString('base64');
const KM = 'U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC', TH = 'U+0E01-0E5B, U+200C-200D, U+25CC';
const fonts = `
@font-face{font-family:'Kantumruy Pro';font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${font('KantumruyPro-400-latin')}) format('woff2')}
@font-face{font-family:'Kantumruy Pro';font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${font('KantumruyPro-400-khmer')}) format('woff2');unicode-range:${KM}}
@font-face{font-family:'Noto Sans Thai';font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${font('NotoSansThai-400-thai')}) format('woff2');unicode-range:${TH}}`;
const MBF = `${process.env.HOME}/.tokens/MAPBOX_TOKEN`;
const MBT = process.env.ARUN_NO_MAPBOX ? '' : (process.env.ARUN_MAPBOX_TOKEN || (existsSync(MBF) ? readFileSync(MBF, 'utf8').trim() : ''));
if (MBT && !MBT.startsWith('pk.')) { console.error('MAPBOX token must be a public pk. token'); process.exit(2); }
const landmarks = JSON.parse(readFileSync(R('data/landmarks.json'))).map(({ id, lat, lng, en, km, th }) => ({ id, lat, lng, en, km, th }));
const geoJ = JSON.parse(readFileSync(R('data/geo.json')));
const tf = Date.now();
const fixture = makeFixture(geoJ);
console.log('cached world', fixture.junctions.length, 'junctions', Date.now() - tf, 'ms');
const data = {
  built: new Date().toISOString(), draft: 'touch', fixture,
  geo: geoJ,
  terrain: JSON.parse(readFileSync(R('data/terrain.json'))),
  buildings: gzipSync(readFileSync(R('data/buildings.bin')), { level: 9 }).toString('base64'),
  landmarks,
  // real: 360° street photos at the junctions (Mapillary, CC BY-SA 4.0; files served beside the page as pano/J-xx.jpg) and OpenStreetMap traffic lights
  panos: existsSync(R('data/panos.json')) ? JSON.parse(readFileSync(R('data/panos.json'))) : null,
  signals: existsSync(R('data/signals.json')) ? JSON.parse(readFileSync(R('data/signals.json'))) : null,
  // real: drive times asked of Mapbox when a person taps (public pk. token; ARUN_NO_MAPBOX=1 leaves it out)
  mapbox: MBT ? { token: MBT, logo: readFileSync(R('data/mapbox-logo.svg'), 'utf8') } : null,
};
const html = readFileSync(R('src/touch/index.html'), 'utf8')
  .replace('/*FONTS*/', fonts).replace('/*CSS*/', css)
  .replace('/*DATA*/', JSON.stringify(data).replace(/</g, '\\u003c'))
  .replace('/*JS*/', () => js.replace(/<\/script/g, '<\\/script'));
// no local paths or private links in the file
const STR = existsSync(R('private/strings.json')) ? JSON.parse(readFileSync(R('private/strings.json'))).forbidden : ['/Users/', 'claude.ai'];
const scan = [js, css, readFileSync(R('src/touch/index.html'), 'utf8'), JSON.stringify(landmarks)].join('\n');
const hits = STR.filter(s => scan.includes(s));
if (hits.length) { console.error('touch build carries private strings:', hits.join(', ')); process.exit(2); }
mkdirSync(R(out.split('/').slice(0, -1).join('/') + '/'), { recursive: true });
writeFileSync(R(out), html);
console.log(out, (statSync(R(out)).size / 1048576).toFixed(2), 'MB', 'js', (js.length / 1024).toFixed(0), 'kB', Date.now() - t0, 'ms');
const art = html.replace(/^<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>/i, '')
  .replace(/<\/head>\s*<body>/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
writeFileSync(R(out.replace(/\.html$/, '.artifact.html')), art);
