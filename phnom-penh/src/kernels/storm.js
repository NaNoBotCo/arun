// The illustrative storm: the "truth" the sensors sample. Not a weather model and not Phnom Penh data.
// A line of convective cells moving as a body, each cell growing and decaying on its own clock and
// drifting a little against the line, with lighter rain trailing behind. Rain rate in mm/h.
// Time t is scenario minutes after 15:00. Positions are metres east (x) and north (y) of 104.93 E, 11.56 N.
import { mulberry32 } from './rng.js';

const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export function makeStorm(seed = 7, opts = {}) {
  const r = mulberry32(seed * 7919 + 13);
  const headingDeg = opts.headingDeg ?? (12 + (r() - 0.5) * 60);    // direction of travel, degrees CCW from east
  const speedKmh = opts.speedKmh ?? (9 + r() * 7);
  const h = headingDeg * Math.PI / 180;
  const ux = Math.cos(h), uy = Math.sin(h);                          // along-track unit
  const nx = -uy, ny = ux;                                           // cross-track unit
  const v = speedKmh * 1000 / 60;                                    // metres per minute
  const tArrive = opts.tArrive ?? (96 + (r() - 0.5) * 20);           // minute the line centre crosses the origin's cross-line
  const offset = opts.offset ?? (r() - 0.5) * 2400;                  // cross-track offset of the line centre
  const n = 4 + Math.floor(r() * 3);
  const spacing = 2100 + r() * 900;
  const cells = [];
  for (let k = 0; k < n; k++) {
    const across = offset + (k - (n - 1) / 2) * spacing + (r() - 0.5) * 700;
    cells.push({
      along: (r() - 0.5) * 1200,            // metres ahead (+) or behind (-) the line centre
      across,
      sa: 1500 + r() * 1100,                // spread along track, m
      sc: 1300 + r() * 900,                 // spread across the line, m
      amp: 45 + r() * 50,                   // peak rain rate, mm/h
      tPeak: 0,                             // set below, relative to the line's arrival
      grow: 50 + r() * 35, decay: 50 + r() * 35,
      drift: (r() - 0.5) * 3.2,             // metres per minute across the line
      surge: (r() - 0.5) * 2.4,             // metres per minute along the line
    });
  }
  for (const c of cells) c.tPeak = tArrive + (r() - 0.5) * 50;
  const strat = { behind: 4200 + r() * 1200, sa: 3200 + r() * 900, sc: 6500 + r() * 1500, amp: 5 + r() * 5, tPeak: tArrive + 30 + r() * 20, grow: 60, decay: 70 };
  return { seed, headingDeg, speedKmh, ux, uy, nx, ny, v, tArrive, offset, cells, strat };
}

function envelope(c, t) {
  if (t < c.tPeak) return smooth(1 - (c.tPeak - t) / c.grow);
  return smooth(1 - (t - c.tPeak) / c.decay);
}

// Rain rate (mm/h) at a point and minute.
export function rainAt(s, x, y, t) {
  const along0 = s.v * (t - s.tArrive);                // line centre position along track at time t
  const pa = x * s.ux + y * s.uy, pc = x * s.nx + y * s.ny;
  let rr = 0;
  for (const c of s.cells) {
    const e = envelope(c, t);
    if (e <= 0) continue;
    const da = pa - (along0 + c.along + c.surge * t), dc = pc - (c.across + c.drift * t);
    const q = (da * da) / (2 * c.sa * c.sa) + (dc * dc) / (2 * c.sc * c.sc);
    if (q < 12) rr += c.amp * e * Math.exp(-q);
  }
  const st = s.strat, e = envelope(st, t);
  if (e > 0) {
    const da = pa - (along0 - st.behind), dc = pc - s.offset;
    rr += st.amp * e * Math.exp(-(da * da) / (2 * st.sa * st.sa) - (dc * dc) / (2 * st.sc * st.sc));
  }
  return rr;
}

// Sample the field on a regular grid (row 0 = north). Returns Float32Array of mm/h.
export function sampleGrid(s, t, grid, out) {
  const { x0, y0, x1, y1, nx, ny } = grid;
  const a = out || new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = y1 - (j + 0.5) * (y1 - y0) / ny;
    for (let i = 0; i < nx; i++) a[j * nx + i] = rainAt(s, x0 + (i + 0.5) * (x1 - x0) / nx, y, t);
  }
  return a;
}

// Rain rate at a point over the scenario, one value per minute 0..180.
export function series(s, x, y, t0 = 0, t1 = 180) {
  const out = new Float32Array(t1 - t0 + 1);
  for (let t = t0; t <= t1; t++) out[t - t0] = rainAt(s, x, y, t);
  return out;
}
