# ARUN 11 — Phnom Penh, worlds in your hands

One offline HTML file for an Android phone. The mapped city (OpenStreetMap streets and rivers, 81,153 Overture building footprints, Copernicus terrain, 38 years of satellite water) under an illustrative storm. Proposed gauges and street cameras report rain; the phone fits the storm's motion, runs a 48-member forecast, and a facility gets notice before water reaches its door.

ARUN 11 turns the v10 demo into a sandbox: Observe, Build (add, remove, move sensors with a preview and an assumed cost; undo, redo, reset), Compare (forecast only until the driver asks to see what happened; then scores on 48 storms shown nowhere else), Notebook (local records, export, import, replay, show mode), the evidence chain behind a notice, and six challenges: Outrun the rain, Prove ARUN wrong, The machine behind the miracle, Invisible city, Two shores, Beautiful ordinary.

```
npm install
node tools/build.mjs --edition external     # dist/arun-phnom-penh.html (+ .artifact.html)
node --test test/kernels/*.test.mjs
node test/run.mjs                            # v10 browser checks on the external file
node test/v11.mjs                            # ARUN 11 checks (needs a private build too, see below)
node test/demo11.mjs                         # timings with a slowed CPU, a captioned play recording
node tools/metrics.mjs                       # headline numbers over practice and unseen storms
node tools/spots.mjs                         # unseen storms at twelve facility spots
node tools/leak-demo.mjs [kernelDir]         # does a forecast read reports from after its cutoff?
node tools/calibrate-camera.mjs              # remake data/camera-calibration.json from scene renders
```

Editions: `--edition external` is the file to show; it leaves out team research results, and the build stops if a listed private string appears in its code or text. `--edition private` needs `private/evidence.js`, which is not in this repository.

What is what, on screen and here: the storm is synthetic; sensor positions are proposed, not an inventory; camera readings come from a drawn street's pixel measurements (a table of renders) plus an assumed field error; building heights are mostly estimated (49 measured); prices, drains and the street water bucket are assumptions the driver can change; the phone's throughput is measured on the phone in hand; the laptop number is a benchmark on one 2022 M2 core; the two city labs in Two shores are simulated. The results come from synthetic storms, not field measurements.

Layout: `src/kernels/` (pure, tested), `src/render/` (three.js city, 2D fallback), `src/lenses/faceshield/` (the drawn street and its pixel measurements), `src/ui/` (sheets), `src/words/` and `src/i18n.js` (English, Khmer, Thai), `src/edition/`. `CONTRACT.md` has the module contract; `CHANGELOG.md` has what changed from v10 and the before/after numbers.

Data tools: `tools/make-geo.mjs`, `tools/fetch-dem.mjs`, `tools/fetch-gsw.mjs`, `tools/make-terrain.mjs`, `tools/make-buildings.py` (Overture 2026-11-18.0, read with DuckDB), `tools/make-photos.py`, `tools/bench.mjs`. Raw downloads go to `data/raw/` and stay out of git.

Credits: map © OpenStreetMap contributors (ODbL 1.0); buildings Overture Maps Foundation (ODbL; Google Open Buildings, Microsoft ML Buildings, OSM); Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; Global Surface Water, Source: EC JRC/Google; photographs from Wikimedia Commons, author and licence on each.
