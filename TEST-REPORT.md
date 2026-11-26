# Test report

Build of 25 November 2026 on an Apple M2 (8 cores, 16 GB), macOS 15.8.1, Node 24.7.0, Chromium 149.0.7827.55 headless. Raw results: `test/results/kernels.json`, `test/results/browser.json`.

## Commands

```
npm install
npm test                    # node tools/test-kernels.mjs: node:test, one process per file
npm run build               # esbuild bundle → dist/index.html (CSP: default-src 'none'; connect-src 'none')
node test/browser/run.mjs   # acceptance suite A–M
node test/browser/smoke.mjs <routes> [--mobile]
node test/browser/e12.mjs   # per-exhibit checks written for E12–E15, E19–E21 and the Ideas page
```

## Kernel tests: 293 pass, 0 fail

| File | Pass | | File | Pass | | File | Pass |
|---|---|---|---|---|---|---|---|
| e01 | 13 | | e08 | 13 | | e15 | 19 |
| e02 | 14 | | e09 | 11 | | e16 | 20 |
| e03 | 10 | | e10 | 16 | | e17 | 18 |
| e04 | 10 | | e11 | 20 | | e18 | 19 |
| e05 | 10 | | e12 | 11 | | e19 | 19 |
| e06 | 8 | | e13 | 13 | | e20 | 13 |
| e07 | 7 | | e14 | 13 | | e21 | 16 |

Each file has the tests the spec lists for its exhibit, an independent reference (analytic answer, brute force, hand-worked case or a second method) and a seeded reproducibility check. Tolerances are written in the test names. Examples of the references: E01 closed-form daily insolation vs numerical integration (0.2%); E02 flat-ground depth (rain − infiltration)·t (0.1%) and the water budget (0.1% of input); E03 Monte Carlo mean vs analytic mean (4 standard errors); E04 single-observation OI vs the scalar Kalman gain (1e-6); E05 Laplace variance vs 2/ε² (3%); E06 sorted-scan frontier vs brute force (exact); E17 max-flow vs hand-solved case; E20 LP optimum and shadow prices vs a textbook problem.

## Browser acceptance: 14 pass, 0 fail (Chromium only)

| | Check | Result |
|---|---|---|
| A | 30 routes at 1366×820: no errors, no outside requests, no sideways scroll | pass |
| A | 30 routes at 390×844 with touch: same | pass |
| B | Each of 21 exhibits exports a run record valid against schema 1.0 | pass |
| C | Deep links, back, forward | pass |
| D | E02 run → sweep → E03 linked → E06 → E07 CURRENT; storm change → E02, E03 STALE in E07; E03 drops the stale link | pass |
| E | Privacy budget exhausts at ε 3; village grouping refused | pass |
| F | Built page: no key patterns, `connect-src 'none'`, no fetch/XHR/WebSocket/beacon in code | pass |
| G | Keyboard: arrow keys move tabs and sliders; metrics follow | pass |
| H | Out-of-range typed value refused with a message | pass |
| I | Reduced motion: exhibits wait for Run | pass |
| J | Thai and Khmer switch in; English straplines return verbatim | pass |
| K | Leaving a page mid-search cancels its worker with no errors | pass |
| L | Save → Compare → Replay reproduces every metric (E03) | pass |
| M | Runs from `file://` with no server | pass |

Untested: Firefox, WebKit (not installed on this machine), real phones, screen readers other than the accessibility tree, memory and CPU profiles beyond the timings below.

## Measured timings (this machine)

| Work | Time |
|---|---|
| Page DOMContentLoaded from disk | 39–121 ms depending on route |
| E02 paired storm, 96×96 cells, 16 h simulated, both versions (node) | 2.8–2.9 s |
| E02 storm-size sweep (5 pairs, Web Worker) | about 14 s |
| E03 10,000 paths × 30 years | 208 ms |
| E06 50,000 options with frontier | 150 ms |
| Frame rate, headless Chromium | home 39 fps, E01 47, E02 60 while running, E03 54, E05 60, E06 61, E08 41, E10 at N = 10,000 53 |

## Reproducible snapshots

Default scenario, seed 20261125, scenario hash shown on the E07 report.

| Exhibit | Inputs | Result |
|---|---|---|
| E02 | 45 mm/h for 5 h, 4 m³/s inflow, 1,000,000 m³ basin at (0.59, 0.44), radius 7, dt 10 s, 16 h | Hotel peak 0.482 → 0.244 m; hours above 0.2 m 3.26 → 1.41; peak outflow 693.8 → 623.3 m³/s; budget residual 2.41e-3 and 2.21e-3 m³ |
| E03 | 10,000 paths, 30 years, standalone efficacy 0.5, defaults otherwise | Mean net benefit US$923,949; chance positive 0.975 |
| E06 | 50,000 options, defaults | 4,023 on the frontier |

## Dependencies and licences

Runtime dependencies: none. The page is plain JavaScript bundled into one file.

| Package | Version | Licence | Use |
|---|---|---|---|
| esbuild | 0.25.12 | MIT | build |
| playwright-core | 1.63.0 | Apache-2.0 | browser tests (drives a cached Chromium) |

`npm audit`: 0 vulnerabilities. Versions are pinned exactly in `package.json` and `package-lock.json`.

## Data manifest

| Item | Source | Licence | Checksum |
|---|---|---|---|
| Land outlines | Natural Earth 1:50m land via world-atlas `land-50m.json`, simplified to 0.2° | Public domain (Natural Earth); ISC packaging | source sha256 619477ff…204e0f; output `src/data/land.js` sha256 fe7f7893… |
| Fonts | Chakra Petch, Atkinson Hyperlegible, Noto Sans Thai Looped, Kantumruy Pro, JetBrains Mono | SIL OFL 1.1 (`assets/fonts/OFL-*.txt`) | embedded as data URIs |
| Everything else | generated from seeds by the kernels | MIT (code) | reproduced by seed |

## Privacy threat assessment (this build)

| Threat | Exposure in this build | Control | Checked by |
|---|---|---|---|
| Page files read by anyone | Code, fonts, outlines, seeds; no keys or personal data | Nothing private is bundled | Test F |
| Outside requests | None after load | CSP `connect-src 'none'`; no network APIs in code; adapters blocked | Tests A, F; Trust page live count |
| Differencing by repeated queries (E05) | Fictional people only | Fixed public refusals; atomic reserve/commit; duplicates reuse | E05 kernel tests; test E |
| Malicious import | Files chosen by the visitor | JSON only, under 200 KB, field-by-field validation, actionable refusal | Compare page; scenario validation tests |
| Formula injection in CSV | Exports | Text cells starting with = + − @ tab or CR get a leading apostrophe | `csvCell` in `src/core/record.js` |
| Unsafe HTML | Typed text in Ideas and E21 | Inserted as text nodes; only static strings from source use HTML | Code review of `h()`; E21 tests |
| Storage | `localStorage` only on request (language, motion, saved runs) | Every access in try/catch; Forget button | Trust page live count |

Production controls in `spec/specs/04-security.md` (tenant isolation, durable cross-account privacy ledger, attested compute, retention and deletion) are not built; this demo is not a production privacy mechanism.

## Architecture

- `src/kernels/` pure functions per exhibit: seeded (mulberry32 streams per named purpose), bounded inputs that throw with a message, no DOM. Heavy work is exported as named jobs.
- `src/core/jobs.js` runs a job in a fresh Web Worker made from the bundled worker source; cancel terminates it; identical deterministic payloads reuse the cached result; time cap 60–120 s; measured wall time and bytes moved are logged for E07 and E19. Falls back to the main thread, and says so, where workers are unavailable.
- `src/core/scenario.js` immutable, versioned shared scenario with a range table; results carry the hash of the inputs that made them, so downstream views can show CURRENT, STALE or MISSING.
- `src/core/frame.js` gives every exhibit the same header, Method, Limits and Export tabs; exports go through `buildRunRecord` and `validateRunRecord`.
- `src/core/adapters.js` the adapter interface (describe, capabilities, validateRequest, fetchOrRun, cancel, validateResult, provenance) with one synthetic adapter enabled and real ones blocked with reasons.
- One HTML file, CSP set, fonts inline, no external scripts.
