# Exhibit contract

Every exhibit is three files, and only these three:

```
src/kernels/eXX.js        pure maths. No DOM, no window, no Date.now inside results. Runs in node, a Worker, or the page.
src/exhibits/eXX.js       meta + mount(): the stage, controls and metrics
test/kernels/eXX.test.mjs node:test reference tests for the kernel
```

Do not edit shared files (`src/core/*`, `src/styles/*`, `src/pages/*`, `src/main.js`, registries, i18n). If you need a helper, write it inside your own files. Exhibit-specific CSS goes in `export const css` inside your exhibit module, every selector scoped under `[data-ex="EXX"]`.

## Kernel (`src/kernels/eXX.js`)

- ES module, pure functions. Import only from `../core/rng.js`, `../core/stats.js`, `../core/hash.js` (all pure).
- Seeded randomness only: `import { makeRng, deriveSeed } from '../core/rng.js'` → `const rng = makeRng(seed)`; `rng.uniform()`, `rng.normal()`, `rng.laplace(b)`, `rng.poisson(l)`, `rng.int(n)`, `rng.range(a,b)`. Never `Math.random()` in a kernel.
- Shape that fits the experiment: `createSim(config, seed)` returning `{ step(n), snapshot(), diagnostics() }`, or `run(config, seed, onProgress)` returning a result. Different experiments need not fake a step function.
- Validate config: clamp nothing silently. Out-of-range input throws `Error` with a plain message (`'N must be between 10 and 10000'`). Non-finite results throw or return `{ ok:false, reason }` that the UI shows. Bound every array size.
- Heavy work (more than ~30 ms) is a job: `export const jobs = { 'eXX.name': (payload, { progress }) => result }`. Payload and result are plain JSON-able data (typed arrays are fine). Call `progress(0..1)` as you go. The file must always export `jobs` (empty object if none).
- Units in names: `rain_mm_h`, `depth_m`, `cost_usd`.

## Tests (`test/kernels/eXX.test.mjs`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/kernels/e08.js';
test('constant equilibrium stays unchanged', () => { ... });
```

Run: `node --test test/kernels/eXX.test.mjs`. Implement every test listed for your exhibit in `spec/specs/02-experiments.md`, plus an independent reference calculation (an analytic answer, a brute-force small case, or a second method) and a seeded reproducibility test. State tolerances in the test name or a comment. Tests must really run and pass; do not skip.

## Exhibit (`src/exhibits/eXX.js`)

```js
export const meta = {
  id: 'E08',
  title: 'Pattern Garden',            // from the manifest; keep it
  subtitle: 'reaction–diffusion',
  priority: 'P1',
  kind: 'simulation',                 // 'simulation' | 'analysis' | 'decision'
  dataStatus: 'MATHEMATICAL',         // MATHEMATICAL | SYNTHETIC | PUBLIC_HISTORICAL | RESEARCH_MODEL | AUTHORIZED_AGGREGATE
  methodVersion: 'e08-gray-scott-1.0.0',
  blurb: 'Two chemicals react and spread until spots and stripes appear.',   // one plain sentence, ≤ 110 chars
  inputs: [ { name: 'F', label: 'Feed rate F', type: 'range', min: 0.01, max: 0.08, step: 0.001, default: 0.037, unit: '1/s' } ],
  outputs: [ { name: 'meanV', label: 'Mean v', unit: '' } ],
  dependencies: [],                   // exhibit ids whose computed outputs you read (normally none for P1)
  feeds: [],                          // exhibit ids that read yours (normally none for P1)
  seedStrategy: 'mulberry32 from the seed; perturbation positions drawn from it',
  method: `<p>Static HTML you write: the equations, the numerical method, the timestep rule, boundaries.</p>
           <p class="eq">∂u/∂t = Dᵤ∇²u − uv² + F(1−u)</p>`,
  limitations: ['A mathematical toy. It predicts nothing about ecosystems or people.'],
  provenance: [],                     // outside sources only; [] when the code makes all data
  whoPays: null,                      // or { buyer, why, benefit } when a commercial row in specs/05 fits
  researchOnly: true,
};

export const css = `[data-ex="E08"] .my-thing { ... }`;   // optional

export function mount(slots, ctx) {
  // slots.stage    the big visual area (position: relative; flex column). Fill it.
  // slots.controls the Play tab: transport + controls go here
  // slots.metrics  the Play tab under the controls: metric tiles, small charts
  // ctx.ui         helpers from src/core/ui.js: h, controlPanel, transport, metricGrid, button, note, sectionTitle, fmt, fmtMoney, fmtPct, token, fitCanvas, announce
  // ctx.chart      chartBox, drawLines, drawHistogram, dataTable (src/core/chart.js)
  // ctx.loop(fn)   rAF loop: fn(dtSeconds). Stops on hidden tab and on destroy. loop.start()/stop()/running/fps
  // ctx.runJob(name, payload, { onProgress, onState, timeoutMs }) -> { promise, cancel(), state }   (worker; cancelled on destroy)
  // ctx.rng(seed, label?)   seeded rng for UI-side draws
  // ctx.reducedMotion()     true when the visitor asked for calm motion: do not autoplay; Run starts it
  // ctx.initial            null, or { inputs, seed } when replaying a saved run: start from these
  // ctx.compact            true inside the guided tour (show fewer controls)
  // ctx.announce(msg, level)  status text for screen readers + a toast ('info' | 'error')
  return {
    getRecord() {   // REQUIRED. Current run, for export. Numbers must be the ones on screen.
      return { inputs: {...values}, seed, metrics: [{ name: 'Mean v', value: 0.12, unit: '', note: 'at t = 500' }], diagnostics: { steps: 500, fps: loop.fps }, elapsedMs };
    },
    getTable() { return { columns: ['t', 'mean_v'], rows: [[0, 0.1], ...] }; },   // optional: time series for CSV
    destroy() {},   // stop anything you started that ctx does not own (event listeners on window, ResizeObservers)
  };
}
```

The frame (`src/core/frame.js`) already provides: header with id/title/status tag/copy link, the Method tab (renders `meta.method`, method version, seed strategy, inputs table), the Limits tab (limitations, data status, who pays, sources), and the Export tab (run record JSON validated against `spec/schemas/run-record.schema.json`, metrics CSV, series CSV from `getTable`, Save to Compare, reproduction check against a saved run). Do not rebuild those.

### What every exhibit needs (from spec/specs/01-product.md "Common exhibit contract")

- A playable preset on open, and at least three meaningful independent inputs (use `ctx.ui.controlPanel`). Every control does something visible. No dead controls.
- Run/Pause, Step (where stepping makes sense), Reset, seed field + New seed + Replay: `ctx.ui.transport({ onToggle, onStep, onReset, onReplay, onSeed, seed, running })`.
- Direct manipulation on the stage where useful (click/tap to plant, drag), with a keyboard equivalent (a button or arrow keys) and `aria-label` on the canvas describing what it shows.
- Computed metrics and at least one time series or distribution, drawn with `ctx.chart` (it has a "Numbers as text" table: fill it with `dataTable`).
- Baseline vs alternative when meaningful.
- An explicit failure/negative case reachable from the controls (a preset or a setting that breaks the method, shown as it is: the exhibit stops and says why, it does not hide or repair it).
- Pause on hidden tab (ctx.loop does this) and nothing left running after destroy.
- At 390 px wide the stage sits above the panel; nothing overflows horizontally. Canvases: `ctx.ui.fitCanvas(canvas, redraw)` and the class `stage-canvas`.
- Every displayed value comes from computed state. No fixed sequences, no stock animation.

### Words

Plain words. Short sentences. Present tense. Describe what the code does; do not promise anything about the future or speak in absolutes about the project ("never", "always", "guaranteed", "nothing is …", "no tracking"). Run `python3 ~/.claude/bin/stylecheck.py src/exhibits/eXX.js` on your exhibit file: it lists the banned words (a fixed list of filler and value words) and absolute claims; fix every hit. Limitations say what the model is not ("A mathematical toy; it does not model people.").

## Build and check

```
node --test test/kernels/eXX.test.mjs
node tools/build.mjs --dev --only E08,E09,E10,E11 --out <your scratch dir>      # stubs everything else
ARUN_PAGE=<your scratch dir>/index.html node test/browser/smoke.mjs e08 e09 --wait 2500
ARUN_PAGE=<your scratch dir>/index.html node test/browser/smoke.mjs e08 --mobile --wait 2500
```

`smoke.mjs` prints console errors, outside network requests, horizontal overflow, and writes a screenshot path; look at the screenshots (Read the PNG). Write your own short Playwright checks if useful (see `test/browser/browser.mjs`: `launch()`, `openPage(browser, 'e08')`), e.g. click Run, change a slider, check a metric changes, Export → run record valid. Put any such script at `test/browser/eXX.mjs`.

Never build into `dist/` (another session uses it). Never touch other exhibits' files.
