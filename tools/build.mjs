// Build: bundle the worker and the app with esbuild, inline CSS, fonts and scripts into one HTML file.
// Outputs:
//   dist/index.html     full document; opens offline from disk or any static server
//   dist/artifact.html  the same page without <html>/<head>/<body>, for hosts that add their own skeleton
// Usage: node tools/build.mjs [--dev]

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const argVal = (k) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : null;
};
// --only E08,E09 builds with every other exhibit, kernel and page swapped for a stub, so one person's
// half-finished file elsewhere does not break this build. --out DIR writes there instead of dist/.
const only = argVal('--only') ? argVal('--only').toUpperCase().split(',').map((s) => s.trim()) : null;
const OUT = argVal('--out') || join(ROOT, 'dist');
const t0 = Date.now();

const onlyPlugin = {
  name: 'only',
  setup(b) {
    if (!only) return;
    b.onResolve({ filter: /e\d\d\.js$|index\.js$/ }, (args) => {
      // Match on the resolved absolute path: exhibits/index.js imports './e08.js' with no folder name.
      const abs = resolvePath(args.resolveDir, args.path).replace(/\\/g, '/');
      if (!/\/src\/(exhibits|kernels)\/e\d\d\.js$|\/src\/pages\/index\.js$/.test(abs)) return null;
      const m = abs.match(/(exhibits|kernels)\/e(\d\d)\.js$/);
      if (m && only.includes('E' + m[2])) return null;
      return { path: args.path, namespace: 'stub', pluginData: m ? { kind: m[1], id: 'E' + m[2] } : { kind: 'pages' } };
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
      const d = args.pluginData;
      if (d.kind === 'kernels') return { contents: 'export const jobs = {};', loader: 'js' };
      if (d.kind === 'pages') return { contents: `import { lab } from './lab.js'; export const PAGES = { home: lab, lab };`, loader: 'js', resolveDir: join(ROOT, 'src/pages') };
      return {
        contents: `export const meta = { id: '${d.id}', title: '${d.id} (stub in --only build)', subtitle: '', priority: 'P1', kind: 'simulation', dataStatus: 'MATHEMATICAL', methodVersion: 'stub', blurb: 'Stub.', inputs: [], outputs: [], dependencies: [], feeds: [], seedStrategy: '', method: '<p>Stub.</p>', limitations: ['Stub.'], provenance: [], whoPays: null, placeholder: true };
export function mount(s) { s.stage.textContent = 'Stub.'; return { getRecord: () => ({ inputs: {}, seed: 0, metrics: [] }), destroy() {} }; }`,
        loader: 'js',
      };
    });
  },
};

const workerBuild = await esbuild.build({
  entryPoints: [join(ROOT, 'src/worker.js')],
  bundle: true,
  format: 'iife',
  minify: !dev,
  write: false,
  target: ['es2020'],
  legalComments: 'none',
  plugins: [onlyPlugin],
});
const workerSrc = workerBuild.outputFiles[0].text;

const appBuild = await esbuild.build({
  entryPoints: [join(ROOT, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: !dev,
  write: false,
  target: ['es2020'],
  define: {
    __WORKER_SRC__: JSON.stringify(workerSrc),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __TEST_RESULTS__: existsSync(join(ROOT, 'test/results/kernels.json')) ? readFileSync(join(ROOT, 'test/results/kernels.json'), 'utf8') : 'null',
  },
  legalComments: 'none',
  metafile: true,
  plugins: [onlyPlugin],
});
const appSrc = appBuild.outputFiles[0].text;

// CSS: every file in src/styles in name order.
const styleDir = join(ROOT, 'src/styles');
const css = readdirSync(styleDir)
  .filter((f) => f.endsWith('.css'))
  .sort()
  .map((f) => `/* ${f} */\n` + readFileSync(join(styleDir, f), 'utf8'))
  .join('\n');

// Fonts as data URIs. unicode-range keeps the browser from loading a script it does not need.
const FONTS = [
  ['ARUN Display', 'chakra-petch-400-latin.woff2', 400, 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215'],
  ['ARUN Display', 'chakra-petch-700-latin.woff2', 700, 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215'],
  ['ARUN Display', 'chakra-petch-400-thai.woff2', 400, 'U+0E01-0E5B,U+200C-200D,U+25CC'],
  ['ARUN Display', 'chakra-petch-700-thai.woff2', 700, 'U+0E01-0E5B,U+200C-200D,U+25CC'],
  ['ARUN Text', 'atkinson-hyperlegible-400-latin.woff2', 400, 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215'],
  ['ARUN Text', 'atkinson-hyperlegible-700-latin.woff2', 700, 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215'],
  ['ARUN Text', 'noto-sans-thai-looped-thai.woff2', '100 900', 'U+0E01-0E5B,U+200C-200D,U+25CC'],
  ['ARUN Text', 'kantumruy-pro-khmer.woff2', '100 700', 'U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC'],
  ['ARUN Display', 'kantumruy-pro-khmer.woff2', '100 700', 'U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC'],
  ['ARUN Data', 'jetbrains-mono-400-latin.woff2', 400, 'U+0000-00FF,U+2000-206F,U+2190-21FF,U+2212'],
];
const fontCss = FONTS.map(([fam, file, weight, range]) => {
  const b64 = readFileSync(join(ROOT, 'assets/fonts', file)).toString('base64');
  return `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${weight};font-style:normal;font-display:swap;unicode-range:${range};}`;
}).join('\n');

const safeScript = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const head = `<title>ARUN Lab</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="ARUN: a laboratory for possible worlds. Interactive, offline exhibits of computational foresight on a fictional Mekong watershed.">
<style>${fontCss}\n${css}</style>`;
const body = `<div id="app"><noscript>ARUN needs JavaScript: every exhibit is computed in the browser.</noscript></div>
<script>${safeScript(appSrc)}</script>`;

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'">
${head}
</head>
<body>
${body}
</body>
</html>
`;
const fragment = `${head}\n${body}\n`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), full);
writeFileSync(join(OUT, 'artifact.html'), fragment);
const sha = createHash('sha256').update(full).digest('hex');
const meta = {
  builtAt: new Date().toISOString(),
  bytes: { full: full.length, js: appSrc.length, worker: workerSrc.length, css: css.length, fonts: fontCss.length },
  sha256: sha,
  inputs: Object.keys(appBuild.metafile.inputs).length,
  esbuild: esbuild.version,
};
writeFileSync(join(OUT, 'build.json'), JSON.stringify(meta, null, 2));
console.log(`built ${join(OUT, 'index.html')}${only ? ' (only ' + only.join(',') + ')' : ''} ${(full.length / 1024).toFixed(0)} KB (js ${(appSrc.length / 1024).toFixed(0)} KB, worker ${(workerSrc.length / 1024).toFixed(0)} KB) in ${Date.now() - t0} ms · sha256 ${sha.slice(0, 12)}`);
