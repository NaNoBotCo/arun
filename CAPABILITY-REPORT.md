# Capability report

Build of 25 November 2026. Every figure below comes from a test or measurement run on this build; nothing here is estimated.

**Test machine:** Apple M2, 8 cores, 16 GB, macOS 15.8.1, Node 24.7.0. **Browser tested:** Chromium 149.0.7827.55 (headless shell from the Playwright cache, driven by playwright-core 1.63.0). Firefox and WebKit are not installed on this machine, so they are untested. No physical phone was tested; phone width is Chromium emulation at 390 × 844 with touch.

## Summary

| | |
|---|---|
| Exhibits implemented | 21 of 21 (P0: 7, P1: 14) |
| Kernel tests | 293 pass, 0 fail, 21 files (`npm test`) |
| Browser acceptance | 14 of 14 pass (`node test/browser/run.mjs`) |
| Routes checked | 30 routes × 2 widths: 0 console errors, 0 outside requests, 0 sideways scroll |
| Run records | All 21 exhibits export a record that passes the schema-1.0 check |
| P2 science adapters | 1 enabled (synthetic fixture), 7 blocked with reasons (see Sources page) |

## Exhibits

| ID | Exhibit | Pri | Data | State | Kernel tests | What the tests and browser checks show | Main limits |
|---|---|---|---|---|---|---|---|
| E01 | Planetary clock | P0 | Mathematical | Implemented | 13 | Equator 12 h at equinox; 40°N on 21 June 14.87 h (textbook 14 h 52 min); polar day 24 h and night 0 h finite; TOA ≥ 0 and peaks at S₀; closed-form daily mean matches numerical integration within 0.2%; analytic flow divergence < 1e-5; view rotation does not enter the physics. 47 fps headless. | Solar time, not clock time; top of atmosphere, not ground; declination approximation ±1° |
| E02 | Map of Tomorrow | P0 | Synthetic | Implemented | 14 | No rain → no water; depths non-negative; water budget residual ≤ max(1e-6 m³, 0.1% of input) both arms (0.0024 m³ on 25 million m³); flat-ground analytic depth; full absorption below infiltration capacity; upstream retention lowers the downstream peak; ridge basin changes nothing (negative case); seek reproduces state exactly; dt 60 s halts with a Courant message; dt 5 vs 10 s peaks within 5%. Default storm: hotel 3.26 h above 0.2 m today, 1.41 h with the wetland. 60 fps while running. | A diffusive finite-volume sketch with a Froude cap, not a validated hydraulic solver; uniform rain; soils never saturate |
| E03 | Probability Loom | P0 | Synthetic | Implemented | 10 | Zero cost and loss → 0; zero efficacy → exactly −(capex + PV opex); same seed same paths; any path recomputes exactly; quantiles ordered and finite at r = 0; Monte Carlo mean within 4 SE of the analytic mean; a sweep where the wetland changes nothing loses exactly its cost. 10,000 paths × 30 years in 208 ms. Linked to E02 in the browser chain. | Spread of an assumed model, not calibrated loss; fictional damage curve |
| E04 | Map That Learns | P0 | Synthetic | Implemented | 10 | No sensors → background; one exact sensor corrects its cell; single-observation OI equals the scalar Kalman gain; large R → no influence; truth away from sensors does not change the analysis; noisy sensors trusted as precise make the map worse (counterexample); posterior spread within [0, σ_b]. | Posterior spread calibrated only when assumed covariances are right |
| E05 | Minimum Knowledge | P0 | Synthetic | Implemented | 10 | Three ε = 1 answers spend ε = 3; the fourth is refused; duplicates spend nothing; simultaneous requests cannot overspend; Laplace variance within 3% of 2/ε²; refusals by fixed rules before any spending; output fields allowlisted. Browser check: budget runs out, village grouping refused. | Teaching model; in-page ledger; simple composition |
| E06 | Opportunity Engine | P0 | Synthetic | Implemented | 8 | Known 2D frontier; dominated point excluded; sorted-scan frontier equals brute force on 600 random points; zero budget → empty result; every frontier option feasible; reproducible; solar yield from E01 1,300–1,600 kWh/kWp. 50,000 options in 150 ms. | Single money figure for resilience; options judged one at a time |
| E07 | Buyer's desk | P0 | Synthetic | Implemented | 7 | Hand-worked revenue, cost, contribution, margin, break-even; zero jobs → zero usage charge; zero revenue → margin null; price below cost → never breaks even; sensitivity signs; ms → CPU-h conversion. Browser: sections CURRENT after the chain, STALE after a storm change. | Fictional prices; measured compute is this device × a scale you set |
| E08 | Pattern Garden | P1 | Mathematical | Implemented | 13 | Equilibrium unchanged, no NaN, wrap symmetry, smaller-dt convergence, stability limit; "Step too large" halts. 41 fps headless. | Mathematical toy |
| E09 | Butterfly Chamber | P1 | Mathematical | Implemented | 11 | Identical copies stay identical; standard preset diverges; RK4 step convergence; Lyapunov estimate 0.917 (job). 60 fps. | Uncertainty lesson, not a forecast of anything |
| E10 | Synchronization Garden | P1 | Mathematical | Implemented | 16 | Aligned identical oscillators stay aligned; uncoupled phases match the analytic solution; R ∈ [0,1]; strong coupling > weak. N = 10,000 at 53 fps. | Not a model of people |
| E11 | Temporal Symmetry Lab | P1 | Mathematical | Implemented | 20 | Drive/response ratio within one FFT bin; logistic r = 2.8 → 1 − 1/r; r = 3.2 → period 2; Duffing presets of period 1, 2, 4, 3 and none; labelled "frequency division only, not a time crystal", with the 2026 PRL reference. | No forecasting claim |
| E12 | Mathematical Blossoms | P1 | Mathematical | Implemented | 11 | Golden angle 137.50776°; exact point count; finite coordinates; rational angle failure case. 61 fps at N = 6,000. | Math art |
| E13 | Invisible Landscape | P1 | Synthetic | Implemented | 13 | Constant truth reconstructed; no data → stated prior; uncertainty ≥ 0 and only for the Gaussian process; no test leakage; random vs adaptive sampling over 12 seeds. 62 fps. | Fictional field |
| E14 | River of Air | P1 | Mathematical | Implemented | 13 | Stationary field no drift; mass conserved with declared boundary; stable substeps; divergence small; "Break the scheme" halts. 60 fps. | Educational field, not wind or dispersion advice |
| E15 | Earth Change Lens | P1 | Synthetic | Implemented | 19 | Self-similarity 1, orthogonal 0, zero norm handled; PCA fit on reference only. 60 fps. | Synthetic embeddings; AlphaEarth path documented, not used |
| E16 | Signal Loom | P1 | Synthetic | Implemented | 20 | Chronological split; lagged correlation; seasonal baselines vs regression with band; missing bins stay gaps; "Thin data" fails with a reason. | Optional DP module not built |
| E17 | Resilience Network | P1 | Synthetic | Implemented | 18 | Max-flow against a hand-solved case and brute-force min-cuts; conservation; capacity limits; more capacity never lowers max flow. | Fictional network |
| E18 | Scientific Instrument | P1 | Synthetic | Implemented | 19 | Noiseless calibration recovers a and b to 1e-9; gaps stay gaps; energy ≥ 0; schema rejects identifiers and coordinates. | Imported files are checked but not fed into a run |
| E19 | Infinite Laboratory | P1 | Synthetic | Implemented | 19 | One job = service time; D/D/1, M/M/1 and Erlang C references; utilisation bounded; no negative waits; arrivals = done + queued + running; GPU unavailable unless entered. | Assumed hardware figures |
| E20 | Pareto Parliament | P1 | Synthetic | Implemented | 13 | Textbook LP optimum 36 at (2, 6) with shadow prices (0, 1.5, 1); grid cross-check; infeasibility diagnosed; weights change the choice, not the feasible set. | Values are human choices |
| E21 | Laboratory of Alternatives | P1 | Synthetic | Implemented | 16 | No decision field; safety concern stays visible at any score or weight; no founder boost; no identity in exports; no network or messaging calls in source; word count at 0, 100, 101 words and Thai. | Decision support only |

## Pages

| Route | State | Evidence |
|---|---|---|
| Home | Implemented | Live globe centred on today's dawn line; tap computes daylight at that spot; 39 fps headless with 1,100 tracers |
| Tour | Implemented | Six steps with live compact exhibits; starts the E02 sweep on open so E03 links when it lands |
| Lab | Implemented | 21 cards, each with a drawing from its own maths |
| Desk | Implemented | Six buyer rows; editable revenue sandbox with zero-price handling and CSV export |
| Trust | Implemented | Six boundaries, threats table, live request/cookie/storage counts |
| Sources | Implemented | Adapter gates run from code; research registry |
| Compare | Implemented | Save, side by side, replay with reproduction check (browser test L), scenario import/export with refusals |
| Ideas | Implemented | 100-word pitch, retelling test, scores, feedback export, Team Wheel draft export (Markdown and JSON); exports appear as text to copy or download, with no send button |
| Status | Implemented | Exhibit table with build-time test counts, device detection, in-browser reference checks, adapter and language tables |

## Not done or partly done

- **Firefox and WebKit:** not installed here; untested.
- **The 60-second retelling with another person:** not done. The tour has a clock and the Ideas page has the retelling test, but nobody other than the builder has tried it.
- **Translations:** interface, pitch, tour and exhibit titles are in Thai and Khmer. Long page text (Trust, Sources, Desk, method notes) is English only. Burmese, Lao, Vietnamese and Shan files exist with no strings yet.
- **P2 adapters:** all real-data adapters are blocked; reasons on the Sources page.
- **E16** optional differential-privacy module; **E18** feeding imported files into a run.
- **Production privacy:** the E05 ledger lives in one tab. A durable, concurrent, cross-account ledger is specified in `TEST-REPORT.md` but not built.
