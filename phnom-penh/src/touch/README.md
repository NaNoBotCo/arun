# A city that senses — a draft for the devs to riff on

**The problem:** viewers read the Phnom Penh demo as a weather app and found it hard to use.

**What the owner asked for:**
- more visual, and a lot cooler to look at
- a street view with traffic, using Face Shield
- moving back and forward in time
- weather and water level
- alerts, shown working
- a PM2.5 tracker and AQI
- an early warning system

This draft does all of that on the same map and kernels, with the Day 3 rules: no prices, few words, cameras at junctions, and Face Shield and Sky Reach in the first minute. It is a sketch to take apart, not a replacement for the Day 2–3 plan.

`dist/arun-touch.html` is one offline file (4 MB). `test/results/touch/video/demo.mp4` is a 59 s walk-through.

## What a visitor sees

- **Opening, Friday 27 Nov at 07:40, simulated.** The 3D city sits under a morning haze. Twenty-eight junction cameras glow, and a few glow violet where the air is unhealthy. An alert at the top reads *Unhealthy air · 9 junctions · 4 h 10 min ahead*: the air sensors' forecast warned of it at 03:10. Under the map, four chips show AQI, rain, river and traffic. At the bottom is the time bar.
- **The time bar** covers 48 hours, Friday 00:00 to Sunday 00:00. Day and night are drawn from the real sun. Each alert appears as a thin line from its warning to its event, then a bar while it lasts. You can drag it, press play, or use the keys (it is a native range input underneath). Everything follows the time: sun and sky, the storm's clouds and rain, traffic as moving lights (head and tail lights at night), the PM2.5 haze, the beacons, the alerts and the cards.
- **Touch a camera** to open the junction street view. It is a code-drawn CCTV scene with traffic at the simulated flow, signals, queues, rain, standing water and haze. Drag the Face Shield line across it: on the left is what the camera sees, on the right what leaves the camera, with faces and plates covered and counting lines. Covers sometimes miss, at an illustrative 10% rate, and the miss shows. Below are the counts and the exact packet that leaves, about 150 bytes every 5 minutes. The picture stays on the camera.
- **16:00:** the cameras (rain read from their own pixels) and the gauges see the storm moving. The existing nowcast kernel warns all 28 junctions, with a median of 16 minutes before heavy rain. Five junctions on the west edge are warned too late, because the rain reached them first, and the card says so. Water at the kerb follows, warned a median of 28 minutes ahead. Queues over 250 m raise traffic alerts. Afterwards, rain clears the air.
- **The chips and alerts open cards:**
  - Air: AQI with the forecast made at that moment, dashed.
  - Rain and early warning: every warning and its lead.
  - Water: the simulated river at Chaktomuk, water at the kerb, and *Possible water level*, a Sky Reach ruler that floods low ground and counts the km of street under water.
- **The computing node** floating over the city opens *One city. Many public uses.*: cameras and gauges → Face Shield on the camera → small packets → shared computing → public uses (municipal services, disaster preparedness, public health, humanitarian coordination, research). It states that this is a possible partnership, not an existing one. It shows the time this phone took to simulate the 48 hours (65 ms).
- **Touch the ground** for local facts: AQI, rain, height above the river, and the satellite water record. *How far from here* lights the streets reachable in 10 minutes by tuk-tuk; this is the earlier reach draft, now one question among several.
- **Coach:** one short line, which moves on only when the visitor acts: *Touch a camera at a junction* → *Drag the line across the street* → *Slide time to the afternoon storm*. It can be skipped.

## What is real and what is simulated

- **Real:** streets (OpenStreetMap), 81,153 buildings (Overture), ground heights (Copernicus), the satellite water record (JRC), the sun, and the landmarks.
- **Simulated, and labelled on screen:** traffic, PM2.5, the storm, water at the kerb, the river level, the queues, and every camera and gauge.
- **From the existing kernels:**
  - rain warnings: `nowcast.js` on readings from `observe.js`
  - water at the kerb: `hydro.js`
  - possible water level: `skyreach.js`
  - reach: `route.js`
- **New and tested:**
  - `src/touch/sim.js`: traffic profile, junction queues (Q′ = max(0, Q + arrivals − departures)), PM2.5 field, EPA NowCast and AQI (2024 breakpoints), air forecast and alerts
  - `src/touch/street.js`: the street view (built by a helper session to a written contract)

## Day 3 handoff, item by item

| Day 3 | Here |
|---|---|
| No pricing anywhere | No prices, costs, ROI or tiers in any reachable text. |
| Fewer words | 16 words on the first screen, not counting map labels, the simulation status and numbers. The check enforces 18 or fewer. |
| Cameras at junctions, shown | 28 junctions picked by a fixed rule: three or more major or minor roads meet, busiest first, at least 700 m apart. They are labelled *Simulated camera*, not an inventory. |
| W01 living junction / Face Shield | The street view with the divider, the aggregate packet with a key allowlist test, the queue model, and visible cover misses. |
| W02 river memory / Sky Reach | *Possible water level* in the Water card, the satellite water record in the ground card, and the river series. |
| W03 connected city | *How far from here* (reach), plus the computing node card. |
| Partnership by role, no logos | The computing node card. |
| Cached worlds | `src/touch/fixture.js` builds the junction sites and their nowcast warnings at build time. The test rebuilds it and checks that it matches `nowcast.warning()`. |
| Map at least 75% | 85% of the screen height at rest at 390 × 844. |
| Coach | Three lines, each moved on only by the visitor's own action. |

## Files

- `src/touch/sim.js` — the 48 hours: traffic, queues, air, AQI, alerts and the river. Pure functions.
- `src/touch/fixture.js` — the cached world, with `warnings()` (`nowcast.warning()` for many points at once, same rule).
- `src/touch/street.js` — the junction street view (canvas 2D, about 1–2 ms a frame).
- `src/touch/layers.js` — traffic lights, PM2.5 haze, junction beacons, water, alert rings, and packets flying to the computing node (three.js on `world.js`'s scene).
- `src/touch/timebar.js`, `main.js`, `words.js` (EN, KM, TH), `touch.css`, `index.html`
- `src/touch/reach.js`, `streets.js` — reach from a touched spot.
- `tools/build-touch.mjs` → `dist/arun-touch.html` (+ `.artifact.html`).
- Tests:
  - `test/kernels/touch-sim.test.mjs` (6), `touch-reach.test.mjs` (6), `street.test.mjs` (8)
  - `test/touch-check.mjs` (28 browser checks), `touch-look.mjs` (frames), `touch-demo.mjs` (video), `street-look.mjs`

No shared file was changed. The draft uses `world.js` as it is.

```
node tools/build-touch.mjs
node --test test/kernels/*.test.mjs        # 111
node test/touch-check.mjs                   # 28 → test/results/touch/check.json
node test/touch-demo.mjs                    # test/results/touch/video/demo.mp4
```

## Measured (Chrome for Testing on an M2 Mac, GPU on; not a phone)

- **First frame:** 0.37 s, with everything ready in 0.77 s. With the CPU slowed 4×: 1.06 s, and 2.3 s for everything.
- **The 48-hour simulation on the page:** 65 ms. With the CPU slowed 4×: 0.25 s.
- **One time step with the CPU slowed 4×:** 83 ms. **Frame rate** with a street view open: 58 fps.

## Riff on

- **Lead with the street view.** It is the most "wow" thing, and the map could open into it.
- **Alerts as notifications.** A lock-screen-style card when an alert crosses into "now", and a sound off by default.
- **Better air.** A wind field, burning season and a regional layer. The air forecast is persistence times the daily rhythm; a learned model can replace it and be scored against the same sensors.
- **Better rain.** The west edge is warned too late. More cameras or gauges upwind shift it, and the existing Build tools could move here.
- **The street view counts:** `perMin` comes from counting-line crossings in the scene. A test could compare them with the simulated flow (a detector check on synthetic frames).
- **Native Khmer and Thai reading.** The Khmer and Thai are a first pass.

## Not done

- Not tried on a real Android phone, with TalkBack, or with unbriefed viewers.
- There is no 2D fallback without WebGL2.
- The river series is simulated, not gauge data. The possible water level has no dikes or drains.
- The street view's west and south queues are out of frame.
- Map labels are display only. The beacons and chips are the touch targets.
