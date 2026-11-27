// Water in a cross-section, drawn as a liquid. Pure; tested in test/kernels/wonder.test.mjs.
//
// The model gives ground height z and water depth h at each cell centre along the section.
// Each stretch of water has a pool around its deepest cell: the pool's surface is level at that
// cell's surface, z + h, and covers the ground below that level, as still water does. Away from
// the pool, on ground above it, water runs as a sheet: its surface at each cell is the model's
// z + h exactly, so the hotel shows the depth the numbers give. Against dry ground the surface
// stays level until it meets the ground, so water never stands higher than itself or climbs a bank.

export const WET_M = 0.02; // thinner than this is drawn as dry
export const STILL_M = 0.02; // surfaces closer than this across a cell count as level

export function groundAt(z, x) {
  const i = Math.max(0, Math.min(z.length - 2, Math.floor(x)));
  return z[i] + (z[i + 1] - z[i]) * (x - i);
}

// Returns { runs, flows, pools }.
//   runs:  one per stretch of water, each an array of { x, top } from west to east (x in cells, top in m).
//   flows: sloping sheet segments, { x0, x1, top0, top1, down } with down = +1 east, −1 west.
//   pools: { x0, x1, level } for each level pool.
export function sectionWater(z, h, wet = WET_M) {
  const n = z.length;
  if (h.length !== n) throw new Error('Ground and depth need the same number of cells.');
  const isWet = (c) => h[c] > wet;
  const surf = (c) => z[c] + h[c];
  // Where a level surface L, leaving cell `from` toward cell `to`, meets the ground.
  const meet = (from, to, L) => (z[to] > L ? from + ((to - from) * (L - z[from])) / (z[to] - z[from]) : (from + to) / 2);
  const runs = [];
  const flows = [];
  const pools = [];
  let c = 0;
  while (c < n) {
    if (!isWet(c)) {
      c++;
      continue;
    }
    let b = c;
    while (b + 1 < n && isWet(b + 1)) b++;
    const a = c;
    c = b + 1;
    // The pool: the deepest cell's surface, over every neighbouring wet cell whose ground lies below it.
    let d = a;
    for (let k = a + 1; k <= b; k++) if (h[k] > h[d]) d = k;
    const P = surf(d);
    let pa = d;
    let pb = d;
    while (pa - 1 >= a && z[pa - 1] < P) pa--;
    while (pb + 1 <= b && z[pb + 1] < P) pb++;
    // A pool needs ground at or above its level on both sides; on an open slope the water is a sheet.
    const heldWest = pa > a || (a > 0 && z[a - 1] > P);
    const heldEast = pb < b || (b < n - 1 && z[b + 1] > P);
    if (!heldWest || !heldEast) {
      const pts = [];
      if (a > 0) {
        const x = meet(a, a - 1, surf(a));
        pts.push({ x, top: z[a - 1] > surf(a) ? surf(a) : groundAt(z, x) });
      }
      for (let k = a; k <= b; k++) pts.push({ x: k, top: surf(k) });
      if (b < n - 1) {
        const x = meet(b, b + 1, surf(b));
        pts.push({ x, top: z[b + 1] > surf(b) ? surf(b) : groundAt(z, x) });
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        if (!Number.isInteger(p.x) || !Number.isInteger(q.x) || Math.abs(q.top - p.top) <= STILL_M) continue;
        flows.push({ x0: p.x, x1: q.x, top0: p.top, top1: q.top, down: q.top < p.top ? 1 : -1 });
      }
      runs.push(pts);
      continue;
    }
    const pts = [];
    // West edge of the stretch.
    if (a > 0) {
      const L = a === pa ? P : surf(a);
      const x = meet(a, a - 1, L);
      pts.push({ x, top: z[a - 1] > L ? L : groundAt(z, x) });
    }
    for (let k = a; k < pa; k++) pts.push({ x: k, top: surf(k) });
    // The pool, level, from where its surface meets the ground on each side.
    let x0 = pa;
    let x1 = pb;
    if (pa > a) {
      x0 = meet(pa, pa - 1, P);
      pts.push({ x: x0, top: P });
    }
    for (let k = pa; k <= pb; k++) pts.push({ x: k, top: P });
    if (pb < b) {
      x1 = meet(pb, pb + 1, P);
      pts.push({ x: x1, top: P });
    }
    for (let k = pb + 1; k <= b; k++) pts.push({ x: k, top: surf(k) });
    // East edge of the stretch.
    if (b < n - 1) {
      const L = b === pb ? P : surf(b);
      const x = meet(b, b + 1, L);
      pts.push({ x, top: z[b + 1] > L ? L : groundAt(z, x) });
    }
    if (pa === a && a > 0) x0 = pts[0].x;
    if (pb === b && b < n - 1) x1 = pts[pts.length - 1].x;
    pools.push({ x0, x1, level: P });
    // Sheet water outside the pool runs downhill.
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const inPool = p.x >= x0 - 1e-9 && q.x <= x1 + 1e-9;
      const edge = (p.x <= a - 1e-9 && i === 0 && a > 0) || (q.x >= b + 1e-9 && i + 2 === pts.length && b < n - 1);
      if (inPool || edge || Math.abs(q.top - p.top) <= STILL_M) continue;
      flows.push({ x0: p.x, x1: q.x, top0: p.top, top1: q.top, down: q.top < p.top ? 1 : -1 });
    }
    runs.push(pts);
  }
  return { runs, flows, pools };
}
