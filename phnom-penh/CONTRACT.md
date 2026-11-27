# ARUN 11 — Phnom Penh: module contract

One offline HTML file for an Android phone: one person drives, another watches over the shoulder.
Built with esbuild from `src/`; data from `data/`; tests in `test/`. No network at run time.

## Shared world (src/state.js, owned by the integrator)
- Clock: scenario minutes 0..180 = 15:00..18:00 local, one illustrative storm (seeded).
- Local metres: x east, y north of origin 104.93 E, 11.56 N. kx = 111320·cos(11.56°), ky = 110574.
- Colours (CSS vars + JS `PAL` in src/palette.js):
  gold #f5c451 knowledge · cyan #5fd4e6 water and rain · violet #a98bff privacy ·
  jade #3ed6a0 preparedness · silver #c9d1dc uncertainty · ink #0b1220 · paper #f4f1ea · muted #a9b4c4
- Fonts: "Kantumruy Pro" (Latin + Khmer), "Noto Sans Thai" (Thai). Text sizes ≥ 14 px; taps ≥ 44 px.
- Languages: `en`, `km`, `th`. Every visible string comes from a dictionary keyed by language.

## Kernels: pure ES modules, no DOM, deterministic, tested in node (`node --test test/kernels/`)
- src/kernels/rng.js — `mulberry32(seed)`
- src/kernels/storm.js — truth rain field `rainAt(storm, x, y, tMin)` mm/h
- src/kernels/nowcast.js — sensors → velocity fit → ensemble forecast → warning time, verification
- src/kernels/hydro.js — facility street catchment → depth over time
- src/kernels/skyreach.js — height above nearest river + connected flood fill + match score vs satellite water
- src/kernels/route.js — street graph from OSM paths + Dijkstra with a rain cost
- src/kernels/compute.js — measured throughput → compute demand arithmetic

## Lens modules: DOM allowed, mounted into a container the integrator gives
- src/lenses/faceshield/scene.js — the synthetic street scene and its pixel measurements (see below)

## Face Shield scene (src/lenses/faceshield/)
```js
import { createFaceShieldScene } from './faceshield/scene.js';
const scene = createFaceShieldScene(canvas, { seed, lang });
scene.set({ rain, ponding, night, shield, dissolve, setting }); // rain mm/h; ponding 0..1; night bool;
                       // shield 0..1 covering progress; dissolve 0..1 picture → measurement view;
                       // setting 'default' | 'strict' (two detector settings; their rates come from #edition)
scene.start(); scene.stop(); scene.destroy();
scene.measure() → { rain:{value,unit:'mm/h'}, water:{value,unit:'%'}, visibility:{value,unit:'m'},
                    pictureBytes, sentBytes }       // computed from the canvas pixels, not from inputs
scene.faces() → [{ id, condition, covered, x, y, r }] // synthetic faces, per-condition outcome
```
Synthetic scene, drawn by code: no photographs of people anywhere in the build.

## Editions (ARUN 11)
`#edition` resolves to `src/edition/evidence.external.js` (`PRIVATE = null`) for the external build and in node,
and to `private/evidence.js` for the private build (that folder is outside the public repository). Code that
shows team research results reads them from `PRIVATE` and shows nothing of them when it is null.
`tools/build.mjs --edition external` stops if any listed private string appears in the file's code or text.

## ARUN 11 kernels
- src/kernels/observe.js — observation adapter: storm → readings with time, quality flag, error. Cameras read
  through `data/camera-calibration.json` (rain the drawn street's pixels measure, by rain rate, day and night;
  made by `tools/calibrate-camera.mjs`) plus an assumed field error; gauges as v10. Options: fieldError, drop,
  delay, noiseScale.
- src/kernels/nowcast.js — every read clamped to the latest received minute (`knownIndex`, `valueAt(rep, t, kmax)`);
  a lead with no upstream reading is NaN, not zero; `heavyChance` → `{ p, cover }`; `warning` → chance, cover, state.
- src/kernels/scenario.js — `runScenario` validates its input and returns truth, obs, inference, evaluation apart.
- src/kernels/experiment.js — state schema v1, `reduce(state, action)`, history with undo/redo, action log,
  `replayLog`, `hashState`, assumed sensor prices, `configOf(state, proposed)`.
- src/kernels/evaluation.js — practice storms 1–24, unseen storms 101–148; outcome classes hit · late · miss ·
  false · quiet; distributions, not single storms.
- src/kernels/notebook.js — notebook records, strict validation, export and import.
- src/kernels/business.js — compute and unit-cost arithmetic for the machine lens.
- src/kernels/twoshores.js — two simulated city labs and their sharing arms.

## ARUN 11 sheets
src/ui/build.js (Build), src/ui/compare.js (Compare), src/ui/notebook.js + src/ui/store.js (Notebook),
src/ui/discover.js (challenge list, evidence chain, Prove ARUN wrong, Invisible city, Beautiful ordinary),
src/ui/machine.js, src/ui/twoshores.js. Each exports a function that fills the sheet and returns a cleanup.
Words: src/words/*.js, registered with `addWords`.

## Words
Present tense, plain, short. Describe what the demo does; label modelled, proposed and illustrative
things as such. No promises about the future, no "never/always/every" about the project itself, no
warnings or advice to the reader.
