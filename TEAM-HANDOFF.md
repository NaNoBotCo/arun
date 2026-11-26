# Team handoff

What is left, as draft tasks. Status of every task: `draft`. Nobody is assigned; volunteers and dates are blank on purpose. The same tasks are in `team/team-wheel-tasks.json` for import.

| id | Exhibit | Task | Deliverable | Done when | Depends on | Priority |
|---|---|---|---|---|---|---|
| ARUN-T01 | all | Retell test with three people who have not seen ARUN | Three written retellings from the Ideas page export | At least two of three name four of the five recall points after one tour | — | P0 |
| ARUN-T02 | all | Test in Safari (WebKit) and Firefox, desktop and phone | Run `test/browser/run.mjs` against both, or a written manual pass | All 14 checks pass, or each failure is a ticket | — | P0 |
| ARUN-T03 | all | Native-reader pass on the Thai and Khmer strings | Corrected `src/i18n/th.js` and `km.js` | Reader signs off every string | — | P1 |
| ARUN-T04 | all | Burmese, Lao, Vietnamese and Shan interface strings | Filled `src/i18n/my.js`, `lo.js`, `vi.js`, `shn.js` | Status page shows full coverage for each | ARUN-T03 | P2 |
| ARUN-T05 | E02 | Compare the water model against a reference solver on a benchmark | Short note with depths and timings side by side | Peak depth and timing within a stated tolerance on two benchmarks, or the gap documented | — | P1 |
| ARUN-T06 | E02 | Real elevation for one approved, non-sensitive public area | Adapter with licence record, datum, checksum and a fetch script | Sources page shows it enabled behind consent; E02 runs on it, labelled PUBLIC_HISTORICAL | ARUN-T05 | P2 |
| ARUN-T07 | E03 | Replace the fictional damage curve with a published one and cite it | Updated kernel and Method text | Tests updated; source on the Limits tab | — | P1 |
| ARUN-T08 | E04 | Hindcast protocol on public observations (time-separated, no leakage) | Notebook or script and a results table | MAE, RMSE and CRPS against climatology and persistence | ARUN-T06 | P2 |
| ARUN-T09 | E05 | Durable privacy ledger for a real service: atomic, restart-safe, cross-account | Design and a server prototype with tests | Concurrency and restart tests pass; review against NIST SP 800-226 | — | P2 |
| ARUN-T10 | E15 | AlphaEarth embeddings for one approved public area | Adapter, licence and attribution record | E15 runs on it, labelled PUBLIC_HISTORICAL, with the CC BY 4.0 credit | — | P2 |
| ARUN-T11 | E16 | Differential-privacy option with bounded contributions | Kernel option and tests | Budget and noise tests pass | ARUN-T09 | P2 |
| ARUN-T12 | E18 | Feed an imported, schema-checked sensor file into a run | Exhibit change and test | A clean file runs; a file with coordinates is refused | — | P2 |
| ARUN-T13 | E19 | Benchmark one job type on partner hardware, if a partner offers it | Timings with hardware, power and cost per hour | Entered as measured figures, not assumptions | — | P2 |
| ARUN-T14 | all | Screen-reader pass (VoiceOver, TalkBack) | List of fixes | Every control has a name; every chart has its text table | — | P1 |
| ARUN-T15 | E21 | Add team concepts to the comparison | Concepts entered with their owners' consent | Each concept appears with equal standing; no automatic winner | — | P1 |

Notes for whoever picks these up:

- Read `CONTRACT.md` first. Each exhibit is three files: kernel, exhibit, test.
- Every change: `npm test`, `npm run build`, `node test/browser/run.mjs`.
- Face Shield and Sky Reach are developer-owned concepts. ARUN does not replace them.
- Public site: https://nanobotco.github.io/arun/ (owner's word, 26 Nov 2026), rebuilt with `npm run site` and published through a pull request. Any account, payment or outside request waits for the owner's word.
