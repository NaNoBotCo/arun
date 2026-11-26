# ARUN

**A thousand tomorrows. One better today.**
**A laboratory for possible worlds.**

ARUN (working name; อรุณ and អរុណ both mean dawn) is a static, offline website of 21 computed exhibits about computational foresight: running many possible futures before spending money in the present. Seven connected exhibits tell one story on a fictional Mekong-style watershed; fourteen more are mathematics and research to play with. Every number on screen comes from code running in the visitor's browser. The region, buyers and money are fictional.

## Open it

- On the web: https://nanobotco.github.io/arun/ (the same single file, from `docs/index.html`).
- Double-click `ARUN.command`, or open `dist/index.html` in any modern browser. It needs no server, account or internet connection once the file is on the machine.
- Single file: `dist/index.html` (about 1.1 MB, fonts and map outlines inside).

## Build and test

```
npm install                  # esbuild 0.25.12 and playwright-core 1.63.0, pinned in package-lock.json
npm test                     # 293 kernel tests in 21 files (node:test); writes test/results/kernels.json
npm run build                # dist/index.html and dist/artifact.html (same page without its own <html> wrapper)
npm run site                 # build, then docs/: the published copy with share-card tags, card.jpg, sitemap, robots, llms.txt
node test/browser/run.mjs    # 14 acceptance checks in Chromium; writes test/results/browser.json
node test/browser/smoke.mjs e02 e03 --mobile   # quick look at any routes, with screenshots
npm run serve                # optional: http://127.0.0.1:8788/
```

Run `npm test` before `npm run build` so the Status page shows the current test results.

## The 60-second meeting run

1. Open the page. The globe shows where dawn is crossing the Earth right now. Read the two lines.
2. Press **Take the 60-second tour**. Six steps, a clock in the corner:
   - the pitch over a live globe;
   - rain on the valley, today beside the same storm with a wetland upstream;
   - a thousand twenty-year futures for that wetland, as threads;
   - the privacy box: records stay inside, noisy totals leave, the budget runs out;
   - a report and sample quote for a riverside hotel, built from those runs;
   - five lines anyone can repeat.
3. For a clean start before a meeting: **Compare → Reset scenario for a meeting**.

The longer run (about 3 minutes): Lab → E02 (press Run, then move the wetland by tapping the right map) → E03 (now linked to E02) → E04 (tap to add sensors; try "Over-trusted noisy sensors") → E05 (ask until the budget runs out) → E06 (pick an option, send it to the desk) → E07 (the report updates; change the storm in E02 and watch sections turn STALE).

## Cambodia opportunity workbench

The `#opportunity` route compares four hypothetical data routes, year-one pilot economics, local delivery spend, and contributor-led product concepts. Public data, commercial licensing, authorized aggregate partnerships and IoT are candidates only; no new access or deployment is asserted. Entry points: Home, Desk and Sources. The workbench is English pending native Khmer and Thai review. Run `node --test test/kernels/opportunity.test.mjs`, then the normal build and browser checks before publishing with `npm run site`.

## What connects to what

| From | To | What moves |
|---|---|---|
| E01 | E06 | Annual top-of-atmosphere sunlight at the latitude sets solar yield |
| E02 | E03 | Storm-size sweep: hotel peak depth and hours under water at five storm sizes become E03's hazard curve |
| E02 | E06 | Terrain and flow accumulation for wetland catchments |
| E04 | E02 | Rain factor (mean analysis ÷ mean background), an explicitly labelled synthetic mapping, applied only when switched on |
| E02–E06 | E07 | Stored results with input hashes; E07 marks each CURRENT, STALE or MISSING |
| E08–E21 | — | Stand alone. They change no forecast or report. |

## Structure

```
src/main.js            shell, router (hash routes: #home #tour #lab #e01…#e21 #desk #trust #sources #compare #ideas #status)
src/core/              ui helpers, charts, loops, jobs (Web Workers), scenario store, run records, adapters, i18n
src/kernels/eXX.js     pure maths for each exhibit (runs in node, a worker or the page)
src/exhibits/eXX.js    each exhibit's page: meta (method, limits, sources) + mount()
src/pages/             tour, lab, desk, trust, sources, compare, ideas, status
src/viz/               globe and watershed renderers, card drawings
src/i18n/              English source strings; Thai and Khmer written here; Burmese, Lao, Vietnamese, Shan files ready for a writer
test/kernels/          node:test reference tests, one file per exhibit
test/browser/          Playwright acceptance and smoke scripts
tools/                 build, serve, land-outline generator, test runner
spec/                  the functional spec this was built from (kept out of the public repo)
team/                  draft tasks for the team (JSON)
docs/                  the published site: index.html, card.jpg, sitemap, robots, llms.txt
schemas/               the run-record JSON schema every export is checked against
CONTRACT.md            the exhibit module contract
```

Stack: plain JavaScript modules, no framework, bundled by esbuild into one HTML file with inline CSS, fonts and a Web Worker made from a Blob. Charts and maps draw on 2D canvas on the CPU, so no GPU is needed.

## Reports

- `CAPABILITY-REPORT.md` — all 21 exhibits: state, tests, browser evidence, limits, benchmark hardware.
- `TEST-REPORT.md` — commands and results, dependencies and licences, data manifest, privacy threat assessment, architecture.
- `TEAM-HANDOFF.md` and `team/team-wheel-tasks.json` — remaining work as draft tasks.

## Licence

Code MIT. Text and generated pages CC BY 4.0. Fonts SIL OFL 1.1 (`assets/fonts/`). Land outlines from Natural Earth (public domain).
