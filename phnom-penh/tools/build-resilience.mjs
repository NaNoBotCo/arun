// One offline HTML file for the resilience lab: node tools/build-resilience.mjs [--out dist/arun-resilience-lab.html]
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const R = p => new URL('../' + p, import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('--out', 'dist/arun-resilience-lab.html');
const t0 = Date.now();
const js = (await build({ entryPoints: [fileURLToPath(R('src/resilience/main.js'))], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none' })).outputFiles[0].text;
const css = readFileSync(R('src/resilience/resilience.css'), 'utf8');
const font = f => readFileSync(R(`data/fonts/${f}.woff2`)).toString('base64');
const KM = 'U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC', TH = 'U+0E01-0E5B, U+200C-200D, U+25CC';
const fonts = `
@font-face{font-family:'Kantumruy Pro';font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${font('KantumruyPro-400-latin')}) format('woff2')}
@font-face{font-family:'Kantumruy Pro';font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${font('KantumruyPro-400-khmer')}) format('woff2');unicode-range:${KM}}
@font-face{font-family:'Noto Sans Thai';font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${font('NotoSansThai-400-thai')}) format('woff2');unicode-range:${TH}}`;
const html = readFileSync(R('src/resilience/index.html'), 'utf8')
  .replace('/*FONTS*/', () => fonts).replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => js.replace(/<\/script/g, '<\\/script'));
mkdirSync(R('dist/'), { recursive: true });
writeFileSync(R(out), html);
console.log(out, (statSync(R(out)).size / 1024).toFixed(0), 'kB', 'js', (js.length / 1024).toFixed(0), 'kB', Date.now() - t0, 'ms');
