# ARUN 11 — change log from v10

Baseline: local commit 0550d2e ("ARUN / 10: Phnom Penh, one moment ahead"), branch phnom-penh, never pushed. Its handback zip in the ARUN 11 packet is byte-identical to the one made from that commit. v10 reproduced before any change: 24 kernel tests and 35 browser checks pass; storm 1 gives 35 minutes of notice with the network against 9 with the roof gauge alone.

## Forecast integrity

- Cutoff. `valueAt` searched up to two minutes past the latest received report when the reports at the cutoff were missing. Every read now goes through `knownIndex` and `valueAt(rep, t, kmax)`; onset and peak fits use the same cutoff, including at fractional times. In `tools/leak-demo.mjs` (5 storms, 6 cutoffs, two missing reports at the cutoff, everything after it replaced by 200 mm/h), future reports changed 255 of 5,307 forecast values under v10 and 0 under v11. A regression test makes two report sets equal through the cutoff and different after, and checks fit, forecast, chance, analysis and notice through the cutoff.
- Missing is not zero. A lead with no upstream report is NaN, not 0 mm/h. `heavyChance` returns the chance over leads with evidence (a lower bound) and the share of the 90-minute window with evidence; under half, a low chance reads as "unavailable". The persistence map, percentiles, charts and scores treat missing values as missing (a heavy cell with no forecast counts as a miss).
- Camera path. Camera readings now come from the drawn street's own pixel measurement: 368 renders of `src/lenses/faceshield/scene.js` at 13 rain rates, day and night (`tools/calibrate-camera.mjs`), give a table of measured rain by true rain; renders never used for the table differ from it by 2.2 mm/h on average (9.7% for rain of 5 mm/h or more; one frame up to 43%). An assumed ±25% field error stands for the gap between a drawn street and a street. The predictor reads readings only; the storm reaches it through this adapter.
- Scenario parts. `runScenario` validates its input and returns truth, observations, inference and evaluation separately.

## Numbers, before and after (default network, hotel at -1500, -600)

| | v10 | cutoff fixed | ARUN 11 (camera path) |
|---|---|---|---|
| Storm 1: notice with the network / alone | 35 / 9 min | 35 / 9 | 34 / 9 |
| Practice storms 1–24, network: median (range) | 28 (12–42) | 28 (12–42) | 28 (13–42) |
| Unseen storms 101–148, network: median (middle half, range) | 27 (23–33, 13–44) | 27 (23–33, 13–44) | 26 (23–31, 13–44) |
| Unseen storms, alone: median (range) | 9 (6–14) | 9 (6–14) | 9 (6–14) |

At this spot every storm brings water and every notice comes before it, so the table shows no failures. Across twelve facility spots and the 48 unseen storms (576 cases, `tools/spots.mjs`): 437 notices before water, 80 notices with no water at the door, 59 storms with no water and no notice, no late or missed notices; median 30 minutes of notice against 9 alone; the middle forecast's error at the door 30 minutes ahead has a median of 24 mm/h, the 10–90% spread 8.8 mm/h, and 55% of the next hour has evidence. These are synthetic storms; none of this is field validation.

## Play

Modes Observe · Build · Compare · Notebook; one sheet at a time; the map stays in view. Build: + Gauge, + Camera, Remove, Move (tap or drag), each with a preview of its effect and its assumed cost before it commits; undo, redo, reset. Compare: forecast only (the storm is hidden) until the driver chooses to see what happened; then both experiments on the practice storm and on 48 unseen storms (outcome classes, minutes of notice, forecast error, spread, evidence). Evidence chain: reading (value, minute, arrival, quality, age) → motion fit and each sensor's residual → 48 forecasts at the door → threshold and notice (grey where evidence is thin) → the street water bucket; change one thing there and see the effect. Notebook: local records with schema, export, import, replay of the action log, show mode. Challenges: Outrun the rain (US$6,000 at assumed prices, scored on unseen storms, attempts listed), Prove ARUN wrong (lose, delay or add noise to reports; failures on practice storms; save a failure), The machine behind the miracle (work per run and per day, core-hours by tier, monthly cost range and sensitivity, phone or data center), Invisible city (measure the drawn street at any rain, beside the table and a gauge), Two shores (two simulated labs; per-side gains and losses from sharing observations, methods or coefficients), Beautiful ordinary (the sun and a building's shadow on 27 November). The session returns after a reload. A one-line hint at a time; a hint can be hidden.

## Editions

External: team names and preliminary results left out (an illustrative face-miss rate stands in, labelled); the build checks for listed private strings. Private: the team's preliminary results, labelled preliminary.

## Tests

Kernel tests (node): v10's 24, plus cutoff, missing data, adapter, scenario, experiment and evaluation (7), notebook (12), machine (14), two shores (13). Browser (Chrome for Testing on an M2, not a phone): v10's 35 checks on the ARUN 11 file, ARUN 11's 35 checks (sizes 360×800, 390×844, 412×915, 915×412; Khmer and Thai; build, undo, drag, compare, notebook round trip, replay, reload, storage denied, no requests leaving the page, 2D fallback, 130% page zoom, editions), and the notebook, machine and two-shores sheet checks.
