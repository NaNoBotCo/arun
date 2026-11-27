// Face Shield: a synthetic Phnom Penh shophouse street in the rain, drawn by code.
// No photographs of people. The camera measures rain, water on the road and visibility
// from its own pixels; covers go on faces and number plates.

const TAU = Math.PI * 2;
const CAM = 4;            // camera height, m
const STREET_END = 400;   // m down the street
const FAR_Z = 420;        // far target building, m
const NEAR_T = { x: -7.5, y0: 4.6, y1: 6.6, z0: 18, z1: 21 }; // near target panel on the left facade
const D_NEAR = Math.hypot(7.5, 5.6 - CAM, 19.5);
const D_FAR = Math.hypot(0, 7.5 - CAM, FAR_Z);

import { PRIVATE } from '#edition';
// Miss rates by kind of face. The private edition carries the team's preliminary test; the external
// edition uses one illustrative rate for every kind (not measured). "Strict" scales the rates so the
// scene's overall recall matches the strict setting's.
export const MISS_DEFAULT = PRIVATE ? PRIVATE.faceShield.misses : { clear: 0.1, 'partly-hidden': 0.1, edge: 0.1, screen: 0.1, small: 0.1 };
const STRICT_RECALL = PRIVATE ? PRIVATE.faceShield.strictRecall : 0.8;

const WORDS = {
  en: { rain: 'Rain', water: 'Water on road', vis: 'Visibility', sent: (n) => `3 numbers · ${n} bytes`, caption: 'Synthetic scene · drawn by code' },
  km: { rain: 'ភ្លៀង', water: 'ទឹកលើផ្លូវ', vis: 'ចម្ងាយមើលឃើញ', sent: (n) => `3 លេខ · ${n} បៃ`, caption: 'ទិដ្ឋភាពសិប្បនិម្មិត · គូរដោយកូដ' },
  th: { rain: 'ฝน', water: 'น้ำบนถนน', vis: 'ระยะมองเห็น', sent: (n) => `3 ตัวเลข · ${n} ไบต์`, caption: 'ภาพสังเคราะห์ · วาดด้วยโค้ด' },
};
const FONT = '"Kantumruy Pro", "Noto Sans Thai", "Khmer Sangam MN", "Noto Sans Khmer", system-ui, sans-serif';

// ---------- small helpers ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(...n) { let h = 2166136261; for (const v of n) { h ^= v | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; } return h >>> 0; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => a >= 1 ? `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})` : `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const dist = (X, Y, Z) => Math.hypot(X, Y - CAM, Z);
// Extinction in rain, per metre: background haze plus a power law in rain rate (σ ∝ R^0.65).
export const sigmaOf = (R) => (0.1 + 0.25 * Math.pow(Math.max(0, R), 0.65)) / 1000;

function layoutOf(W, H) {
  const portrait = H >= W;
  const u = Math.min(W, H) / 400;
  const f = portrait ? 1.05 * W : Math.min(0.78 * W, 1.3 * H);
  const y0 = H * (portrait ? 0.33 : 0.4);
  const cx = W / 2;
  const P = (X, Y, Z) => [cx + f * X / Z, y0 + f * (CAM - Y) / Z];
  return { W, H, u, f, y0, cx, P, portrait };
}

// ---------- the world (seeded, independent of canvas size) ----------
function makeWorld(seed) {
  const r = mulberry32(hash(seed, 11));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const TONES = [[226, 214, 180], [214, 172, 104], [152, 190, 178], [222, 164, 140], [204, 200, 190], [232, 228, 214], [188, 150, 120], [170, 184, 200]];
  const DARK = [[86, 92, 86], [74, 80, 78], [98, 90, 82], [80, 86, 96], [92, 84, 74]];
  const AWN = [[196, 62, 52], [40, 92, 160], [230, 150, 40], [44, 140, 96], [150, 60, 120]];
  const SIGNBG = [[200, 30, 40], [20, 70, 160], [236, 186, 30], [20, 120, 80], [230, 90, 30]];
  const SIGNS = ['ហាងកាហ្វេ', 'នំបញ្ចុក', 'ផ្សារ', 'ឱសថស្ថាន', 'ហាងទូរស័ព្ទ', 'បាយសាច់ជ្រូក'];
  const sides = {};
  for (const s of [-1, 1]) {
    const units = []; let z = 2.5;
    while (z < STREET_END) {
      const w = 3.8 + r() * 1.8; const z1 = Math.min(STREET_END, z + w);
      const floors = 3 + (r() < 0.45 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
      const roi = z1 > 12 && z < 46;
      const nearTarget = s < 0 && z1 > 9 && z < 23;
      units.push({
        z0: z, z1, floors, h: floors * 3.3 + 0.6,
        tone: roi ? pick(DARK) : pick(TONES), awn: r() < 0.75 ? pick(AWN) : null,
        board: r() < 0.5 ? pick(SIGNBG) : null,
        blade: (!nearTarget && r() < 0.4) ? { text: pick(SIGNS), bg: pick(SIGNBG) } : null,
        lit: Array.from({ length: 12 }, () => r() < 0.45), goods: Array.from({ length: 5 }, () => pick(AWN)),
        shutter: r() < 0.35,
      });
      z = z1;
    }
    sides[s] = units;
  }
  const SKIN = [[198, 150, 112], [172, 124, 90], [150, 104, 74], [214, 170, 134], [128, 88, 62]];
  const SHIRT = [[226, 224, 216], [60, 90, 150], [200, 70, 60], [240, 200, 80], [70, 140, 110], [230, 140, 170], [52, 52, 60], [150, 110, 200]];
  const PANTS = [[40, 44, 58], [70, 66, 60], [30, 30, 36], [96, 84, 70], [50, 70, 110]];
  const HAIR = [[22, 18, 16], [36, 28, 22], [60, 52, 48]];
  const UMB = [[220, 60, 80], [40, 120, 200], [250, 200, 60], [60, 160, 120], [120, 70, 180]];
  const person = (o) => ({ h: 1.56 + r() * 0.16, skin: pick(SKIN), shirt: pick(SHIRT), pants: pick(PANTS), hair: pick(HAIR), umbC: pick(UMB), u: r(), ...o });
  const persons = [
    person({ id: 'p1', X: -1.4, Z: 6.5, cond: 'clear', bag: true }),
    person({ id: 'p2', X: 1.6, Z: 12, cond: 'clear' }),
    person({ id: 'p3', X: -4.7, Z: 12.4, cond: 'clear' }),
    person({ id: 'p4', X: 5.5, Z: 16, cond: 'clear' }),
    person({ id: 'p5', X: -0.3, Z: 8.5, cond: 'partly-hidden', umbrella: true }),
    person({ id: 'p7', X: -6.0, Z: 17, cond: 'partly-hidden', krama: true }),
    person({ id: 'p8', edge: 'left', Z: 5.4, cond: 'edge' }),
    person({ id: 'p9', edge: 'right', Z: 10.5, cond: 'edge' }),
    person({ id: 'p12', X: -2.0, Z: 34, cond: 'small' }),
    person({ id: 'p14', X: 5.8, Z: 30, cond: 'small', umbrella: true }),
  ];
  const riders = [
    person({ id: 'p6', X: 1.0, Z: 21, cond: 'partly-hidden', helmet: true, motoC: pick(SIGNBG) }),
    person({ id: 'p13', X: 2.2, Z: 44, cond: 'small', helmet: false, motoC: pick(SIGNBG) }),
  ];
  const screens = [
    { id: 'p10', kind: 'aframe', X: 5.6, Z: 13.5, cond: 'screen', u: r(), skin: [250, 206, 150] },
    { id: 'p11', kind: 'billboard', X: 5.25, Z: 62, cond: 'screen', u: r(), skin: [236, 186, 140] },
  ];
  const puddles = Array.from({ length: 60 }, () => ({ X: -4.6 + 9.2 * r(), Z: 4 + 70 * Math.pow(r(), 1.5), a: 0.4 + 1.1 * r(), b: 0.3 + 1.0 * r(), rank: r() }));
  const parked = [[4.4, 9], [4.35, 10.2], [4.45, 11.4], [4.4, 12.7], [4.4, 14.1], [-4.4, 14.2], [-4.35, 15.6], [-4.45, 18.8]].map(([X, Z]) => ({ X, Z, c: pick(SIGNBG), plate: `${1 + Math.floor(r() * 3)}${'ABCDEFGH'[Math.floor(r() * 8)]}-${1000 + Math.floor(r() * 8999)}` }));
  const skyline = [];
  for (const s of [-1, 1]) { let x = 14 + r() * 3; while (x < 140) { const w = 6 + r() * 14; skyline.push({ x0: s * x, x1: s * (x + w), h: 8 + Math.pow(r(), 2.2) * 70, z: 440 + r() * 60 }); x += w + r() * 3; } }
  const plateText = () => `${1 + Math.floor(r() * 3)}${'ABCDEFGH'[Math.floor(r() * 8)]}${'ABCDEFGH'[Math.floor(r() * 8)]}-${1000 + Math.floor(r() * 8999)}`;
  return { seed, sides, persons, riders, screens, puddles, parked, skyline, dogU: r(), plates: [plateText(), plateText(), plateText(), plateText()], cartC: pick(AWN) };
}

// ---------- render state ----------
function renderState(p) {
  const night = !!p.night;
  const hz = night ? [46, 46, 60] : [180, 188, 198];
  const sigma = sigmaOf(p.rain);
  const shade = (c, d, emissive = false) => {
    let b = c;
    if (night && !emissive) b = [c[0] * 0.30 + 6, c[1] * 0.29 + 5, c[2] * 0.30 + 8];
    const t = Math.exp(-sigma * d);
    return [b[0] * t + hz[0] * (1 - t), b[1] * t + hz[1] * (1 - t), b[2] * t + hz[2] * (1 - t)];
  };
  return { night, hz, sigma, shade, rain: p.rain, ponding: clamp(p.ponding, 0, 1), skyTop: night ? [10, 14, 26] : [112, 124, 140] };
}

// ---------- drawing primitives ----------
function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
function fillPoly(ctx, pts, c) { poly(ctx, pts); ctx.fillStyle = c; ctx.fill(); }
function circle(ctx, x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.3, r), 0, TAU); ctx.fillStyle = c; ctx.fill(); }
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

// ---------- the static picture (everything except rain streaks, ripples and covers) ----------
function renderStatic(ctx, L, W, S, rec) {
  const { P, u, f, y0 } = L;
  rec.faces = []; rec.plates = []; rec.boxes = []; rec.dog = null;
  // sky: gradient, flat at the horizon band so fog colour = sky colour there
  const g = ctx.createLinearGradient(0, 0, 0, y0);
  g.addColorStop(0, css(S.skyTop)); g.addColorStop(0.72, css(S.hz)); g.addColorStop(1, css(S.hz));
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, y0 + 2);
  if (!S.night) { // soft cloud banks
    for (let i = 0; i < 7; i++) { const cx = (hash(W.seed, i, 3) % 1000) / 1000 * L.W, cy = y0 * (0.12 + 0.45 * ((hash(W.seed, i, 5) % 1000) / 1000)); const rr = L.W * (0.18 + 0.12 * ((hash(W.seed, i, 7) % 1000) / 1000)); const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr); gg.addColorStop(0, 'rgba(150,160,176,0.35)'); gg.addColorStop(1, 'rgba(150,160,176,0)'); ctx.fillStyle = gg; ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); }
  }
  ctx.fillStyle = css(S.hz); ctx.fillRect(0, y0 - L.H * 0.06, L.W, L.H * 0.06 + 2);
  // skyline beyond the street end (|X| > 14 m keeps the centre column clear for the sky sample)
  for (const b of W.skyline) {
    const [xa, ya] = P(b.x0, b.h, b.z), [xb, yb] = P(b.x1, 0, b.z);
    rect(ctx, Math.min(xa, xb), ya, Math.abs(xb - xa), yb - ya, css(S.shade([70, 76, 86], b.z)));
    if (S.night) for (let k = 0; k < 4; k++) { const wx = Math.min(xa, xb) + (k + 0.5) * Math.abs(xb - xa) / 4, wy = ya + (yb - ya) * ((hash(b.x0 | 0, k) % 100) / 120); rect(ctx, wx, wy, Math.max(0.6, u * 0.6), Math.max(0.6, u * 0.6), css(S.shade([255, 210, 150], b.z, true))); }
  }
  // ground: slices from far to near
  const zNear = Math.max(1.2, 0.98 * f * CAM / (L.H - y0 + 2));
  const N = 80; const zs = []; for (let i = 0; i <= N; i++) zs.push(FAR_Z * Math.pow(zNear / FAR_Z, i / N));
  const asphalt = [46, 49, 56], walk = [118, 112, 104], kerb = [160, 156, 148];
  for (let i = 0; i < N; i++) {
    const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2, dm = dist(0, 0, zm);
    const sheen = 0.22 * Math.min(1, zm / 70);
    const road = mix(S.shade(asphalt, dm), S.hz, sheen);
    const wide = za > STREET_END ? 80 : 7.5;
    fillPoly(ctx, [P(-wide, 0, za), P(wide, 0, za), P(wide, 0, zb), P(-wide, 0, zb)], css(S.shade(walk, dm)));
    fillPoly(ctx, [P(-5, 0, za), P(5, 0, za), P(5, 0, zb), P(-5, 0, zb)], css(road));
    for (const s of [-1, 1]) fillPoly(ctx, [P(s * 5, 0, za), P(s * 5.18, 0, za), P(s * 5.18, 0, zb), P(s * 5, 0, zb)], css(S.shade(kerb, dm)));
  }
  for (let z = 4; z < 160; z += 6) fillPoly(ctx, [P(-0.07, 0, z), P(0.07, 0, z), P(0.07, 0, z + 3), P(-0.07, 0, z + 3)], css(S.shade([200, 196, 170], dist(0, 0, z + 1.5))));
  // puddles
  drawPuddles(ctx, L, W, S);
  // night: light pools on the wet road under lamps and signs
  if (S.night) for (let z = 22; z < 200; z += 25) for (const s of [-1, 1]) {
    const [x, y] = P(s * 4.4, 0, z + 2); const rr = 2.6 * f / z;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rr); gg.addColorStop(0, 'rgba(255,196,120,0.30)'); gg.addColorStop(1, 'rgba(255,196,120,0)');
    ctx.fillStyle = gg; ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.35); ctx.translate(-x, -y); ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); ctx.restore();
  }
  // far target building at the street end (centre stays flat for the visibility sample)
  const targetC = S.night ? [232, 214, 172] : [46, 44, 42];
  {
    const [xa, ya] = P(-12, 16, FAR_Z), [xb, yb] = P(12, 0, FAR_Z);
    rect(ctx, xa, ya, xb - xa, yb - ya, css(S.shade(targetC, D_FAR, S.night)));
  }
  // pass 1: walls, awnings, wall boards, far to near
  const walls = [];
  for (const s of [-1, 1]) for (const un of W.sides[s]) walls.push({ s, un });
  walls.sort((a, b) => b.un.z1 - a.un.z1);
  for (const { s, un } of walls) drawUnit(ctx, L, S, s, un);
  // near target panel, flat colour
  {
    const q = [P(NEAR_T.x, NEAR_T.y0, NEAR_T.z0), P(NEAR_T.x, NEAR_T.y0, NEAR_T.z1), P(NEAR_T.x, NEAR_T.y1, NEAR_T.z1), P(NEAR_T.x, NEAR_T.y1, NEAR_T.z0)];
    fillPoly(ctx, q, css(S.shade(targetC, D_NEAR, S.night)));
  }
  // pass 2: everything standing in the street, far to near
  const items = [];
  for (const s of [-1, 1]) for (const un of W.sides[s]) if (un.blade) items.push({ z: (un.z0 + un.z1) / 2, draw: () => drawBlade(ctx, L, S, s, un) });
  for (let z = 22; z < 200; z += 25) for (const s of [-1, 1]) items.push({ z, draw: () => drawLamp(ctx, L, S, s, z) });
  for (const p of W.persons) items.push({ z: p.Z, draw: () => drawPerson(ctx, L, S, p, rec) });
  for (const p of W.riders) items.push({ z: p.Z, draw: () => drawRiderIncoming(ctx, L, S, p, rec) });
  for (const sc of W.screens) items.push({ z: sc.Z, draw: () => (sc.kind === 'aframe' ? drawAFrame : drawBillboard)(ctx, L, S, sc, rec) });
  items.push({ z: 19, draw: () => drawTukTuk(ctx, L, S, W, rec) });
  items.push({ z: 27, draw: () => drawMotoAway(ctx, L, S, 2.4, 27, [40, 70, 150], W.plates[1], rec, 'moto1') });
  items.push({ z: 50, draw: () => drawMotoAway(ctx, L, S, -1.2, 50, [190, 40, 50], W.plates[2], rec, 'moto2') });
  items.push({ z: 33, draw: () => drawSUV(ctx, L, S, W, rec) });
  items.push({ z: 11.5, draw: () => drawCart(ctx, L, S, W, rec) });
  items.push({ z: 8.8, draw: () => drawDog(ctx, L, S, W, rec) });
  W.parked.forEach((m, i) => items.push({ z: m.Z, draw: () => drawMotoAway(ctx, L, S, m.X, m.Z, m.c, m.plate, rec, `parked${i}`, true) }));
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.draw();
  drawCables(ctx, L, S);
}

function drawPuddles(ctx, L, W, S) {
  const p = S.ponding; if (p <= 0.001) return;
  const { P } = L;
  const sc = 0.45 + 0.95 * p;
  const base = S.night ? [70, 60, 58] : [120, 128, 140];
  const shapes = [];
  for (const q of W.puddles) if (q.rank < p * 1.2) shapes.push(q);
  const rim = css(S.shade(S.night ? [14, 14, 18] : [36, 38, 44], 10));
  const drawEllipse = (X, Z, a, b) => {
    const pts = []; for (let i = 0; i < 20; i++) { const t = i / 20 * TAU; const x = clamp(X + Math.cos(t) * a, -5, 5), z = Math.max(1.2, Z + Math.sin(t) * b); pts.push(P(x, 0, z)); }
    const d = dist(X, 0, Z); const [, yF] = P(X, 0, Z + b), [, yN] = P(X, 0, Math.max(1.2, Z - b));
    const g = ctx.createLinearGradient(0, yF, 0, yN); // far edge mirrors the bright horizon, near edge the higher sky
    g.addColorStop(0, css(S.shade(mix(base, S.hz, 0.55), d, S.night))); g.addColorStop(1, css(S.shade(mix(base, S.night ? [40, 34, 36] : [96, 106, 122], 0.35), d, S.night)));
    poly(ctx, pts); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = Math.max(0.6, 0.05 * L.f / Z); ctx.stroke();
  };
  for (const q of shapes) drawEllipse(q.X, q.Z, q.a * sc, q.b * sc);
  if (p > 0.3) { // water along both kerbs
    const w = 0.4 + 2.6 * (p - 0.3) / 0.7;
    for (const s of [-1, 1]) for (let z = 1.2; z < 90; z *= 1.08) { const zb = z * 1.08; fillPoly(ctx, [P(s * 5, 0, z), P(s * (5 - w), 0, z), P(s * (5 - w), 0, zb), P(s * 5, 0, zb)], css(S.shade(mix(base, S.hz, 0.25), dist(0, 0, z), S.night))); }
  }
  if (p > 0.75) { // sheet across the road
    const zEnd = 4 + 120 * (p - 0.75) / 0.25;
    for (let z = 1.2; z < zEnd; z *= 1.08) { const zb = Math.min(zEnd, z * 1.08); fillPoly(ctx, [P(-5, 0, z), P(5, 0, z), P(5, 0, zb), P(-5, 0, zb)], css(S.shade(mix(base, S.hz, 0.25), dist(0, 0, z), S.night))); }
  }
}

function drawUnit(ctx, L, S, s, un) {
  const { P, u } = L; const X = s * 7.5;
  const dm = dist(X, un.h / 2, (un.z0 + un.z1) / 2);
  const side = s < 0 ? 1 : 0.9;
  const tone = un.tone.map((v) => v * side);
  const q = (y0, y1, za, zb, x = X) => [P(x, y0, za), P(x, y0, zb), P(x, y1, zb), P(x, y1, za)];
  fillPoly(ctx, q(0, un.h, un.z0, un.z1), css(S.shade(tone, dm)));
  const [xa] = P(X, 0, un.z0), [xb] = P(X, 0, un.z1);
  const wpx = Math.abs(xa - xb);
  // parapet
  fillPoly(ctx, q(un.h - 0.4, un.h, un.z0, un.z1), css(S.shade(tone.map((v) => Math.min(255, v * 1.12)), dm)));
  if (wpx > 5) {
    const len = un.z1 - un.z0;
    // shop front
    const shopLit = S.night ? [255, 196, 128] : [44, 38, 34];
    fillPoly(ctx, q(0, 2.6, un.z0 + 0.25, un.z1 - 0.25, X - s * 0.02), css(S.shade(shopLit, dm, S.night).map((v) => S.night ? v * 0.75 : v)));
    if (wpx > 14) un.goods.forEach((c, i) => { const za = un.z0 + 0.4 + i * (len - 0.8) / 5; fillPoly(ctx, q(0.2, 0.6 + (i % 3) * 0.25, za, za + (len - 0.8) / 6, X - s * 0.05), css(S.shade(c, dm))); });
    if (un.shutter) fillPoly(ctx, q(1.5, 2.6, un.z0 + 0.25, un.z1 - 0.25, X - s * 0.03), css(S.shade([150, 154, 150], dm)));
    // upper floors
    for (let fl = 1; fl < un.floors; fl++) {
      const yb = fl * 3.3;
      fillPoly(ctx, q(yb + 0.85, yb + 0.95, un.z0, un.z1, X - s * 0.03), css(S.shade([60, 60, 62], dm)));
      for (let k = 0; k < 2; k++) {
        const za = un.z0 + len * (k ? 0.58 : 0.15), zb = un.z0 + len * (k ? 0.85 : 0.42);
        const lit = S.night && un.lit[(fl * 2 + k) % 12];
        const wc = lit ? [250, 200, 130] : S.night ? [20, 24, 30] : [44, 52, 62];
        fillPoly(ctx, q(yb + 1.0, yb + 2.4, za, zb, X - s * 0.02), css(S.shade(wc, dm, lit)));
      }
    }
    // wall board above the awning
    if (un.board) fillPoly(ctx, q(3.25, 4.15, un.z0 + 0.3, un.z1 - 0.3, X - s * 0.04), css(S.shade(un.board, dm, S.night)));
    // awning, sloping toward the road
    if (un.awn) {
      const za = un.z0 + 0.1, zb = un.z1 - 0.1;
      const pts = [P(X, 3.1, za), P(X, 3.1, zb), P(s * 5.9, 2.65, zb), P(s * 5.9, 2.65, za)];
      fillPoly(ctx, pts, css(S.shade(un.awn, dm)));
      const stripes = 3; for (let i = 0; i < stripes; i++) { const a = za + (zb - za) * (i + 0.25) / stripes, b = za + (zb - za) * (i + 0.6) / stripes; fillPoly(ctx, [P(X, 3.1, a), P(X, 3.1, b), P(s * 5.9, 2.65, b), P(s * 5.9, 2.65, a)], css(S.shade(un.awn.map((v) => Math.min(255, v * 0.25 + 190)), dm))); }
    }
  }
}

function drawBlade(ctx, L, S, s, un) {
  const { P, f } = L; const z = (un.z0 + un.z1) / 2; const X = s * 6.4;
  const [x0, y0] = P(X - 0.5, 4.6, z), [x1, y1] = P(X + 0.5, 3.5, z);
  const d = dist(X, 4, z);
  rect(ctx, x0, y0, x1 - x0, y1 - y0, css(S.shade(un.blade.bg, d, S.night)));
  const k = f / z; if (k * 0.3 < 3) return;
  ctx.fillStyle = css(S.shade([255, 248, 230], d, S.night)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.max(4, k * 0.24)}px ${FONT}`;
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  ctx.fillText(un.blade.text, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.92); ctx.restore();
}

function drawLamp(ctx, L, S, s, z) {
  const { P, u, f } = L; const X = s * 5.6; const d = dist(X, 4, z); const k = f / z;
  const c = css(S.shade([70, 74, 80], d));
  const [xb, yb] = P(X, 0, z), [xt, yt] = P(X, 7.6, z), [xa, ya] = P(s * 4.5, 7.5, z);
  ctx.strokeStyle = c; ctx.lineWidth = Math.max(0.6 * u, 0.12 * k); ctx.beginPath(); ctx.moveTo(xb, yb); ctx.lineTo(xt, yt); ctx.lineTo(xa, ya); ctx.stroke();
  const lampC = S.night ? [255, 214, 150] : [190, 196, 200];
  circle(ctx, xa, ya + 0.1 * k, Math.max(0.6 * u, 0.16 * k), css(S.shade(lampC, d, S.night)));
  if (S.night) { const rr = 1.6 * k; const gg = ctx.createRadialGradient(xa, ya, 0, xa, ya, rr); gg.addColorStop(0, 'rgba(255,214,150,0.45)'); gg.addColorStop(1, 'rgba(255,214,150,0)'); ctx.fillStyle = gg; ctx.fillRect(xa - rr, ya - rr, rr * 2, rr * 2); }
}

function drawCables(ctx, L, S) {
  const { P, u, f } = L;
  const along = (s, xoff, yTop, sag, col) => {
    ctx.beginPath(); let first = true;
    for (let z = 22; z < 140; z += 25) for (let i = 0; i <= 10; i++) {
      const zz = z + 25 * i / 10; const t = i / 10; const y = yTop - sag * 4 * t * (1 - t);
      const [x, yy] = P(s * xoff, y, zz); if (first) { ctx.moveTo(x, yy); first = false; } else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = col; ctx.stroke();
  };
  const col = css(S.shade([28, 28, 32], 40));
  ctx.lineWidth = Math.max(0.5 * u, 0.7 * u);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) along(s, 5.9 + i * 0.04, 7.1 - i * 0.12, 0.35 + i * 0.12, col);
  for (const zc of [12.5, 30]) for (let i = 0; i < 3; i++) {
    ctx.beginPath(); for (let k = 0; k <= 16; k++) { const t = k / 16; const X = -6 + 12 * t; const Y = 7.0 - i * 0.15 - 0.6 * 4 * t * (1 - t); const [x, y] = P(X, Y, zc + i * 0.3); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.lineWidth = Math.max(0.5 * u, 0.02 * f / zc); ctx.strokeStyle = col; ctx.stroke();
  }
}

function headAndFace(ctx, L, S, x, hy, hr, p, d, facing = true) {
  circle(ctx, x, hy, hr, css(S.shade(p.skin, d)));
  ctx.beginPath(); ctx.arc(x, hy - hr * 0.1, hr * 1.04, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(x + hr, hy - hr * 0.2); ctx.lineTo(x - hr, hy - hr * 0.2); ctx.closePath(); ctx.fillStyle = css(S.shade(p.hair, d)); ctx.fill();
  if (facing && hr > 1.6) {
    const ec = css(S.shade([30, 24, 22], d));
    circle(ctx, x - hr * 0.36, hy + hr * 0.05, hr * 0.11, ec); circle(ctx, x + hr * 0.36, hy + hr * 0.05, hr * 0.11, ec);
    ctx.strokeStyle = css(S.shade([120, 60, 50], d)); ctx.lineWidth = Math.max(0.4, hr * 0.08); ctx.beginPath(); ctx.arc(x, hy + hr * 0.32, hr * 0.28, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  }
}

function drawPerson(ctx, L, S, p, rec) {
  const { f } = L;
  let X = p.X;
  if (p.edge) X = ((p.edge === 'left' ? 0 : L.W) - L.cx) * p.Z / f;
  const [xb, yb] = L.P(X, 0, p.Z); const k = f / p.Z; const d = dist(X, 1, p.Z);
  const h = p.h;
  const C = (c) => css(S.shade(c, d));
  rect(ctx, xb - 0.14 * k, yb - 0.86 * k, 0.11 * k, 0.86 * k, C(p.pants));
  rect(ctx, xb + 0.03 * k, yb - 0.86 * k, 0.11 * k, 0.86 * k, C(p.pants));
  rect(ctx, xb - 0.16 * k, yb - 0.05 * k, 0.14 * k, 0.05 * k, C([24, 22, 22])); rect(ctx, xb + 0.02 * k, yb - 0.05 * k, 0.14 * k, 0.05 * k, C([24, 22, 22]));
  ctx.fillStyle = C(p.shirt); ctx.beginPath(); ctx.roundRect(xb - 0.22 * k, yb - (h - 0.24) * k, 0.44 * k, (h - 0.24 - 0.82) * k, 0.07 * k); ctx.fill();
  ctx.strokeStyle = C(p.shirt); ctx.lineWidth = 0.09 * k; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(xb - 0.2 * k, yb - (h - 0.3) * k); ctx.lineTo(xb - 0.27 * k, yb - 0.95 * k); ctx.moveTo(xb + 0.2 * k, yb - (h - 0.3) * k); ctx.lineTo(xb + (p.umbrella ? 0.05 : 0.27) * k, yb - (p.umbrella ? 1.25 : 0.95) * k); ctx.stroke();
  if (p.bag) rect(ctx, xb + 0.22 * k, yb - 1.0 * k, 0.2 * k, 0.24 * k, C([226, 90, 120]));
  const hy = yb - (h - 0.12) * k, hr = 0.105 * k;
  headAndFace(ctx, L, S, xb, hy, hr, p, d, true);
  if (p.krama) { // checkered scarf over nose and mouth
    ctx.save(); ctx.beginPath(); ctx.arc(xb, hy, hr * 1.02, 0, TAU); ctx.clip();
    const top = hy + hr * 0.18; rect(ctx, xb - hr, top, hr * 2, hr, C([200, 40, 50]));
    const cell = Math.max(0.6, hr / 3.2); ctx.fillStyle = C([240, 236, 226]);
    for (let yy = top; yy < hy + hr; yy += cell * 2) for (let xx = xb - hr; xx < xb + hr; xx += cell * 2) { ctx.fillRect(xx, yy, cell, cell); ctx.fillRect(xx + cell, yy + cell, cell, cell); }
    ctx.restore();
  }
  if (p.umbrella) { // canopy rim at eye level: the upper face is hidden
    const R = 0.58 * k, rim = hy + hr * 0.12, top = rim - 0.42 * k;
    ctx.beginPath(); ctx.moveTo(xb - R, rim); ctx.quadraticCurveTo(xb - R * 0.9, top, xb, top); ctx.quadraticCurveTo(xb + R * 0.9, top, xb + R, rim);
    for (let i = 5; i >= 0; i--) { const xa = xb - R + (2 * R) * i / 6; ctx.quadraticCurveTo(xa + R / 6, rim + 0.07 * k, xa, rim); }
    ctx.closePath(); ctx.fillStyle = C(p.umbC); ctx.fill();
    ctx.strokeStyle = C([40, 40, 40]); ctx.lineWidth = Math.max(0.5, 0.02 * k); ctx.beginPath(); ctx.moveTo(xb, top); ctx.lineTo(xb, top - 0.06 * k); ctx.stroke();
  }
  rec.faces.push({ id: p.id, condition: p.cond, x: xb, y: hy, r: hr * 1.3, u: p.u });
  rec.boxes.push([xb - 0.62 * k, yb - (h + 0.5) * k, 1.24 * k, (h + 0.5) * k]);
}

function drawRiderIncoming(ctx, L, S, p, rec) {
  const { f, P } = L; const k = f / p.Z; const [xb, yb] = P(p.X, 0, p.Z); const d = dist(p.X, 1, p.Z);
  const C = (c, e) => css(S.shade(c, d, e));
  ctx.fillStyle = C([24, 24, 26]); ctx.beginPath(); ctx.ellipse(xb, yb - 0.3 * k, 0.07 * k, 0.3 * k, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = C(p.motoC); ctx.beginPath(); ctx.roundRect(xb - 0.2 * k, yb - 0.95 * k, 0.4 * k, 0.5 * k, 0.08 * k); ctx.fill();
  circle(ctx, xb, yb - 0.82 * k, 0.07 * k, C([255, 246, 210], true));
  if (S.night) { const rr = 0.9 * k; const gg = ctx.createRadialGradient(xb, yb - 0.82 * k, 0, xb, yb - 0.82 * k, rr); gg.addColorStop(0, 'rgba(255,246,210,0.55)'); gg.addColorStop(1, 'rgba(255,246,210,0)'); ctx.fillStyle = gg; ctx.fillRect(xb - rr, yb - 0.82 * k - rr, rr * 2, rr * 2); }
  ctx.strokeStyle = C([30, 30, 32]); ctx.lineWidth = 0.04 * k; ctx.beginPath(); ctx.moveTo(xb - 0.38 * k, yb - 1.05 * k); ctx.lineTo(xb + 0.38 * k, yb - 1.05 * k); ctx.stroke();
  ctx.fillStyle = C(p.shirt); ctx.beginPath(); ctx.roundRect(xb - 0.24 * k, yb - 1.42 * k, 0.48 * k, 0.5 * k, 0.08 * k); ctx.fill();
  ctx.strokeStyle = C(p.shirt); ctx.lineWidth = 0.09 * k; ctx.beginPath(); ctx.moveTo(xb - 0.22 * k, yb - 1.35 * k); ctx.lineTo(xb - 0.36 * k, yb - 1.06 * k); ctx.moveTo(xb + 0.22 * k, yb - 1.35 * k); ctx.lineTo(xb + 0.36 * k, yb - 1.06 * k); ctx.stroke();
  const hy = yb - 1.56 * k, hr = 0.105 * k;
  headAndFace(ctx, L, S, xb, hy, hr, p, d, true);
  if (p.helmet) { // shell over the top and sides, dark visor over the eyes
    ctx.beginPath(); ctx.arc(xb, hy, hr * 1.38, Math.PI * 0.92, Math.PI * 2.08); ctx.closePath(); ctx.fillStyle = C([236, 236, 240]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(xb, hy - hr * 0.02, hr * 1.02, hr * 0.36, 0, 0, TAU); ctx.fillStyle = C([30, 36, 48]); ctx.fill();
  }
  rec.faces.push({ id: p.id, condition: p.cond, x: xb, y: hy, r: hr * 1.35, u: p.u });
  rec.boxes.push([xb - 0.5 * k, yb - 1.8 * k, 1.0 * k, 1.8 * k]);
}

function drawMotoAway(ctx, L, S, X, Z, col, plate, rec, id, parked = false) {
  const { f, P } = L; const k = f / Z; const [xb, yb] = P(X, 0, Z); const d = dist(X, 1, Z); const C = (c, e) => css(S.shade(c, d, e));
  ctx.fillStyle = C([24, 24, 26]); ctx.beginPath(); ctx.ellipse(xb, yb - 0.3 * k, 0.07 * k, 0.3 * k, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = C(col); ctx.beginPath(); ctx.roundRect(xb - 0.2 * k, yb - 0.85 * k, 0.4 * k, 0.32 * k, 0.06 * k); ctx.fill();
  rect(ctx, xb - 0.08 * k, yb - 0.82 * k, 0.16 * k, 0.06 * k, C([255, 40, 40], true));
  const pw = 0.24 * k, ph = 0.13 * k, px = xb - pw / 2, py = yb - 0.66 * k;
  rect(ctx, px, py, pw, ph, C([236, 236, 230])); drawPlateText(ctx, S, d, plate, px, py, pw, ph);
  rec.plates.push({ id, x: px, y: py, w: pw, h: ph });
  if (parked) { rect(ctx, xb - 0.15 * k, yb - 0.98 * k, 0.3 * k, 0.12 * k, C([30, 30, 34])); ctx.strokeStyle = C([40, 40, 44]); ctx.lineWidth = 0.035 * k; ctx.beginPath(); ctx.moveTo(xb - 0.36 * k, yb - 1.1 * k); ctx.lineTo(xb + 0.36 * k, yb - 1.1 * k); ctx.stroke(); rec.boxes.push([xb - 0.4 * k, yb - 1.15 * k, 0.8 * k, 1.15 * k]); return; }
  ctx.fillStyle = C([60, 60, 70]); ctx.beginPath(); ctx.roundRect(xb - 0.23 * k, yb - 1.4 * k, 0.46 * k, 0.56 * k, 0.08 * k); ctx.fill();
  circle(ctx, xb, yb - 1.56 * k, 0.14 * k, C([200, 200, 205]));
  rec.boxes.push([xb - 0.45 * k, yb - 1.75 * k, 0.9 * k, 1.75 * k]);
}

function drawPlateText(ctx, S, d, text, x, y, w, h) {
  if (h < 3) return;
  ctx.fillStyle = css(S.shade([30, 40, 110], d)); ctx.font = `600 ${h * 0.62}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h * 0.55, w * 0.92);
}

function drawTukTuk(ctx, L, S, W, rec) {
  const { f, P } = L; const X = -1.6, Z = 19; const k = f / Z; const [xb, yb] = P(X, 0, Z); const d = dist(X, 1, Z); const C = (c, e) => css(S.shade(c, d, e));
  circle(ctx, xb - 0.62 * k, yb - 0.25 * k, 0.25 * k, C([22, 22, 24])); circle(ctx, xb + 0.62 * k, yb - 0.25 * k, 0.25 * k, C([22, 22, 24]));
  rect(ctx, xb - 0.78 * k, yb - 1.95 * k, 1.56 * k, 1.6 * k, C([40, 80, 70]));
  rect(ctx, xb - 0.62 * k, yb - 1.7 * k, 1.24 * k, 0.9 * k, C([24, 22, 22]));
  for (const ox of [-0.3, 0.3]) { circle(ctx, xb + ox * k, yb - 1.32 * k, 0.11 * k, C([28, 22, 20])); rect(ctx, xb + (ox - 0.2) * k, yb - 1.2 * k, 0.4 * k, 0.4 * k, C(ox < 0 ? [200, 120, 60] : [90, 120, 190])); }
  rect(ctx, xb - 0.92 * k, yb - 2.12 * k, 1.84 * k, 0.2 * k, C([20, 60, 52]));
  rect(ctx, xb - 0.72 * k, yb - 0.6 * k, 0.1 * k, 0.07 * k, C([255, 50, 40], true)); rect(ctx, xb + 0.62 * k, yb - 0.6 * k, 0.1 * k, 0.07 * k, C([255, 50, 40], true));
  const pw = 0.36 * k, ph = 0.16 * k, px = xb - pw / 2, py = yb - 0.66 * k;
  rect(ctx, px, py, pw, ph, C([236, 236, 230])); drawPlateText(ctx, S, d, W.plates[0], px, py, pw, ph);
  rec.plates.push({ id: 'tuktuk', x: px, y: py, w: pw, h: ph });
  rec.boxes.push([xb - 0.95 * k, yb - 2.2 * k, 1.9 * k, 2.2 * k]);
}

function drawSUV(ctx, L, S, W, rec) {
  const { f, P } = L; const X = 3.7, Z = 33; const k = f / Z; const [xb, yb] = P(X, 0, Z); const d = dist(X, 1, Z); const C = (c, e) => css(S.shade(c, d, e));
  ctx.fillStyle = C([220, 222, 226]); ctx.beginPath(); ctx.roundRect(xb - 0.92 * k, yb - 1.78 * k, 1.84 * k, 1.45 * k, 0.12 * k); ctx.fill();
  rect(ctx, xb - 0.75 * k, yb - 1.62 * k, 1.5 * k, 0.5 * k, C([40, 48, 60]));
  rect(ctx, xb - 0.9 * k, yb - 1.0 * k, 0.22 * k, 0.12 * k, C([255, 40, 40], true)); rect(ctx, xb + 0.68 * k, yb - 1.0 * k, 0.22 * k, 0.12 * k, C([255, 40, 40], true));
  rect(ctx, xb - 0.92 * k, yb - 0.45 * k, 0.3 * k, 0.45 * k, C([22, 22, 24])); rect(ctx, xb + 0.62 * k, yb - 0.45 * k, 0.3 * k, 0.45 * k, C([22, 22, 24]));
  const pw = 0.42 * k, ph = 0.16 * k, px = xb - pw / 2, py = yb - 0.75 * k;
  rect(ctx, px, py, pw, ph, C([236, 236, 230])); drawPlateText(ctx, S, d, W.plates[3], px, py, pw, ph);
  rec.plates.push({ id: 'suv', x: px, y: py, w: pw, h: ph });
  rec.boxes.push([xb - 0.95 * k, yb - 1.85 * k, 1.9 * k, 1.85 * k]);
}

function drawCart(ctx, L, S, W, rec) {
  const { f, P } = L; const X = -4.3, Z = 11.5; const k = f / Z; const [xb, yb] = P(X, 0, Z); const d = dist(X, 1, Z); const C = (c, e) => css(S.shade(c, d, e));
  circle(ctx, xb - 0.5 * k, yb - 0.14 * k, 0.14 * k, C([30, 30, 30])); circle(ctx, xb + 0.5 * k, yb - 0.14 * k, 0.14 * k, C([30, 30, 30]));
  rect(ctx, xb - 0.7 * k, yb - 1.05 * k, 1.4 * k, 0.8 * k, C([180, 190, 196]));
  rect(ctx, xb - 0.62 * k, yb - 0.98 * k, 1.24 * k, 0.4 * k, C(S.night ? [255, 220, 160] : [210, 226, 230], S.night));
  for (let i = 0; i < 6; i++) circle(ctx, xb + (-0.5 + i * 0.2) * k, yb - 0.72 * k, 0.07 * k, C([220, 150 + i * 12, 60]));
  ctx.strokeStyle = C([60, 60, 60]); ctx.lineWidth = 0.03 * k; ctx.beginPath(); ctx.moveTo(xb + 0.55 * k, yb - 1.05 * k); ctx.lineTo(xb + 0.55 * k, yb - 2.35 * k); ctx.stroke();
  const R = 1.0 * k, rim = yb - 2.05 * k, top = yb - 2.45 * k, cx0 = xb + 0.55 * k;
  for (let i = 0; i < 6; i++) { const a = cx0 - R + 2 * R * i / 6, b = cx0 - R + 2 * R * (i + 1) / 6; fillPoly(ctx, [[cx0, top], [a, rim], [b, rim]], C(i % 2 ? [240, 236, 226] : W.cartC)); }
  rec.boxes.push([xb - 0.75 * k, yb - 2.5 * k, 2.4 * k, 2.5 * k]);
}

function drawDog(ctx, L, S, W, rec) {
  const { f, P } = L; const X = -3.2, Z = 8.8; const k = f / Z; const [xb, yb] = P(X, 0, Z); const d = dist(X, 0.4, Z);
  const fur = [168, 120, 74]; const C = (c) => css(S.shade(c, d));
  for (const ox of [-0.16, -0.06, 0.06, 0.16]) rect(ctx, xb + ox * k - 0.025 * k, yb - 0.26 * k, 0.05 * k, 0.26 * k, C(fur.map((v) => v * 0.85)));
  ctx.fillStyle = C(fur); ctx.beginPath(); ctx.ellipse(xb, yb - 0.32 * k, 0.24 * k, 0.12 * k, 0, 0, TAU); ctx.fill();
  const hx = xb - 0.12 * k, hy = yb - 0.46 * k, hr = 0.1 * k;
  fillPoly(ctx, [[hx - hr * 0.95, hy - hr * 0.3], [hx - hr * 0.75, hy - hr * 1.5], [hx - hr * 0.2, hy - hr * 0.8]], C(fur.map((v) => v * 0.7)));
  fillPoly(ctx, [[hx + hr * 0.95, hy - hr * 0.3], [hx + hr * 0.75, hy - hr * 1.5], [hx + hr * 0.2, hy - hr * 0.8]], C(fur.map((v) => v * 0.7)));
  circle(ctx, hx, hy, hr, C(fur));
  ctx.fillStyle = C([226, 200, 170]); ctx.beginPath(); ctx.ellipse(hx, hy + hr * 0.45, hr * 0.45, hr * 0.35, 0, 0, TAU); ctx.fill();
  circle(ctx, hx, hy + hr * 0.3, hr * 0.14, C([20, 16, 14]));
  circle(ctx, hx - hr * 0.38, hy - hr * 0.15, hr * 0.1, C([20, 16, 14])); circle(ctx, hx + hr * 0.38, hy - hr * 0.15, hr * 0.1, C([20, 16, 14]));
  ctx.strokeStyle = C(fur); ctx.lineWidth = 0.04 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(xb + 0.22 * k, yb - 0.36 * k); ctx.quadraticCurveTo(xb + 0.36 * k, yb - 0.5 * k, xb + 0.32 * k, yb - 0.6 * k); ctx.stroke();
  rec.dog = { id: 'dog', x: hx, y: hy, r: hr * 1.35 };
  rec.boxes.push([xb - 0.35 * k, yb - 0.7 * k, 0.7 * k, 0.7 * k]);
}

function drawnFace(ctx, x, y, r, skin, hair, C) { // a drawn (cartoon) face on a poster or screen
  circle(ctx, x, y, r, C(skin));
  ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 1.06, Math.PI, TAU); ctx.closePath(); ctx.fillStyle = C(hair); ctx.fill();
  circle(ctx, x - r * 0.35, y + r * 0.08, r * 0.12, C([30, 24, 22])); circle(ctx, x + r * 0.35, y + r * 0.08, r * 0.12, C([30, 24, 22]));
  ctx.strokeStyle = C([170, 60, 60]); ctx.lineWidth = Math.max(0.5, r * 0.1); ctx.beginPath(); ctx.arc(x, y + r * 0.3, r * 0.38, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
}

function drawAFrame(ctx, L, S, sc, rec) {
  const { f, P } = L; const k = f / sc.Z; const [xb, yb] = P(sc.X, 0, sc.Z); const d = dist(sc.X, 0.6, sc.Z); const C = (c, e) => css(S.shade(c, d, e));
  ctx.strokeStyle = C([80, 60, 40]); ctx.lineWidth = 0.04 * k; ctx.beginPath(); ctx.moveTo(xb - 0.38 * k, yb); ctx.lineTo(xb - 0.3 * k, yb - 1.15 * k); ctx.moveTo(xb + 0.38 * k, yb); ctx.lineTo(xb + 0.3 * k, yb - 1.15 * k); ctx.stroke();
  rect(ctx, xb - 0.35 * k, yb - 1.12 * k, 0.7 * k, 1.0 * k, C([246, 236, 214]));
  const fx = xb, fy = yb - 0.78 * k, fr = 0.19 * k;
  drawnFace(ctx, fx, fy, fr, sc.skin, [60, 36, 24], C);
  if (k * 0.09 > 2.5) { ctx.fillStyle = C([120, 60, 30]); ctx.font = `600 ${k * 0.09}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('កាហ្វេទឹកដោះគោ', xb, yb - 0.3 * k, 0.62 * k); }
  rec.faces.push({ id: sc.id, condition: sc.cond, x: fx, y: fy, r: fr * 1.25, u: sc.u });
  rec.boxes.push([xb - 0.42 * k, yb - 1.2 * k, 0.84 * k, 1.2 * k]);
}

function drawBillboard(ctx, L, S, sc, rec) {
  const { f, P, u } = L; const k = f / sc.Z; const d = dist(sc.X, 9.5, sc.Z); const C = (c, e) => css(S.shade(c, d, e));
  const [xp, yp] = P(sc.X, 0, sc.Z), [, ypt] = P(sc.X, 7.5, sc.Z);
  ctx.strokeStyle = C([70, 74, 80]); ctx.lineWidth = Math.max(0.6 * u, 0.25 * k); ctx.beginPath(); ctx.moveTo(xp, yp); ctx.lineTo(xp, ypt); ctx.stroke();
  const [x0, y0] = P(sc.X - 1.75, 11.5, sc.Z), [x1, y1] = P(sc.X + 1.75, 7.5, sc.Z);
  rect(ctx, x0 - 0.12 * k, y0 - 0.12 * k, x1 - x0 + 0.24 * k, y1 - y0 + 0.24 * k, C([30, 30, 34]));
  const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, css(S.shade([40, 150, 220], d, true))); g.addColorStop(1, css(S.shade([140, 80, 200], d, true)));
  ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const fx = x0 + (x1 - x0) * 0.3, fy = (y0 + y1) / 2, fr = 1.05 * k;
  drawnFace(ctx, fx, fy, fr, sc.skin, [30, 20, 20], (c) => css(S.shade(c, d, true)));
  if (k * 0.55 > 3) { ctx.fillStyle = css(S.shade([255, 255, 255], d, true)); ctx.font = `700 ${k * 0.55}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ទូរស័ព្ទថ្មី', x0 + (x1 - x0) * 0.72, fy, (x1 - x0) * 0.5); }
  rec.faces.push({ id: sc.id, condition: sc.cond, x: fx, y: fy, r: fr * 1.2, u: sc.u });
}

// ---------- rain streaks and ripples (change every frame) ----------
function streakSegments(L, R, frame, seed, cap) {
  if (R <= 0) return null;
  const area = (L.W * L.H) / (400 * 800);
  let n = Math.round(R * 35 * area); if (cap && n > cap) n = cap;
  const r = mulberry32(hash(seed, frame, 99));
  const v = 4 + 1.1 * Math.log1p(R); // fall speed, m/s
  const buckets = [[], [], []];
  for (let i = 0; i < n; i++) {
    const x = r() * L.W, y = r() * L.H * 1.08 - L.H * 0.08;
    const Z = 1.5 + 23.5 * Math.pow(r(), 1.5);
    const len = Math.max(1.5 * L.u, (v / 50) * L.f / Z);
    buckets[Z < 4 ? 0 : Z < 12 ? 1 : 2].push(x, y, x - len * 0.14, y + len);
  }
  return buckets;
}
function drawStreaks(ctx, L, S, frame, seed, cap, color) {
  const b = streakSegments(L, S.rain, frame, seed, cap); if (!b) return;
  const base = color || (S.night ? [214, 208, 196] : [218, 228, 244]);
  const alphas = S.night ? [0.3, 0.5, 0.4] : [0.24, 0.44, 0.34];
  const widths = [1.6 * L.u, 1.0 * L.u, 0.7 * L.u];
  ctx.lineCap = 'butt';
  for (let k = 0; k < 3; k++) {
    const a = b[k]; if (!a.length) continue;
    ctx.beginPath(); for (let i = 0; i < a.length; i += 4) { ctx.moveTo(a[i], a[i + 1]); ctx.lineTo(a[i + 2], a[i + 3]); }
    ctx.strokeStyle = css(base, color ? 0.8 : alphas[k]); ctx.lineWidth = Math.max(0.6, widths[k]); ctx.stroke();
  }
}
function drawRipples(ctx, L, S, W, frame) {
  if (S.rain <= 0 || S.ponding <= 0.02) return;
  const r = mulberry32(hash(W.seed, frame, 77)); const n = Math.min(500, Math.round(S.rain * 0.8 * S.ponding * (L.W * L.H) / (400 * 800)));
  const vis = W.puddles.filter((q) => q.rank < S.ponding * 1.2); if (!vis.length) return;
  const sc = 0.45 + 0.95 * S.ponding;
  ctx.strokeStyle = S.night ? 'rgba(255,220,170,0.35)' : 'rgba(225,232,240,0.38)'; ctx.lineWidth = Math.max(0.5, 0.6 * L.u);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const q = vis[Math.floor(r() * vis.length)]; const t = r() * TAU, rr = Math.sqrt(r());
    const X = clamp(q.X + Math.cos(t) * q.a * sc * rr, -5, 5), Z = Math.max(1.3, q.Z + Math.sin(t) * q.b * sc * rr);
    const [x, y] = L.P(X, 0, Z); const rad = (0.06 + 0.16 * r()) * L.f / Z;
    if (y > L.H + 4 || y < L.y0) continue;
    ctx.moveTo(x + rad, y); ctx.ellipse(x, y, rad, rad * 0.3, 0, 0, TAU);
  }
  ctx.stroke();
}

// ---------- covers ----------
function hexPath(ctx, x, y, r) { ctx.moveTo(x + r, y); for (let i = 1; i < 6; i++) ctx.lineTo(x + r * Math.cos(i * TAU / 6), y + r * Math.sin(i * TAU / 6)); ctx.closePath(); }
function hexCover(ctx, x, y, R, u, clipRect) {
  const hr = Math.max(1.4 * u, R / 2.3), dx = hr * Math.sqrt(3), dy = hr * 1.5;
  ctx.save(); ctx.beginPath(); if (clipRect) ctx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h); else ctx.arc(x, y, R, 0, TAU); ctx.clip();
  const x0 = clipRect ? clipRect.x : x - R, x1 = clipRect ? clipRect.x + clipRect.w : x + R, y0 = clipRect ? clipRect.y : y - R, y1 = clipRect ? clipRect.y + clipRect.h : y + R;
  let row = 0;
  for (let yy = y0 - hr; yy <= y1 + hr; yy += dy, row++) for (let xx = x0 - dx + (row % 2 ? dx / 2 : 0); xx <= x1 + dx; xx += dx) {
    const v = (hash(row, Math.round(xx * 7)) % 100) / 100;
    ctx.beginPath(); hexPath(ctx, xx, yy, hr * 0.98); ctx.fillStyle = `rgba(${150 + v * 50 | 0},${120 + v * 50 | 0},${235 + v * 20 | 0},0.94)`; ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(222,210,255,0.95)'; ctx.lineWidth = Math.max(0.6, 0.9 * u);
  ctx.beginPath(); if (clipRect) ctx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h); else ctx.arc(x, y, R, 0, TAU); ctx.stroke();
}
function missRate(cond, setting, scale) { const m = MISS_DEFAULT[cond] ?? 0.1; return setting === 'strict' ? Math.min(0.95, m * scale) : m; }
function outcomes(rec, setting) {
  const sum = rec.faces.reduce((a, fc) => a + (MISS_DEFAULT[fc.condition] ?? 0.1), 0);
  const scale = rec.faces.length ? (1 - STRICT_RECALL) * rec.faces.length / sum : 1;
  return rec.faces.map((fc) => ({ ...fc, missed: fc.u < missRate(fc.condition, setting, scale) }));
}
function sweepX(shield, W) { return (shield * 1.1 - 0.05) * W; }
function drawCovers(ctx, L, rec, st) {
  const sh = st.shield; if (sh <= 0) return;
  const sx = sweepX(sh, L.W); const done = sh >= 0.999;
  for (const fc of outcomes(rec, st.setting)) {
    if (!done && fc.x > sx) continue;
    if (fc.missed) {
      if (done) { ctx.save(); ctx.setLineDash([2.5 * L.u, 2.5 * L.u]); ctx.strokeStyle = 'rgba(190,170,255,0.95)'; ctx.lineWidth = Math.max(0.6, 1.1 * L.u); ctx.beginPath(); ctx.arc(fc.x, fc.y, Math.max(fc.r * 1.15, 3 * L.u), 0, TAU); ctx.stroke(); ctx.restore(); }
      continue;
    }
    hexCover(ctx, fc.x, fc.y, Math.max(fc.r, 1.2 * L.u), L.u);
  }
  for (const pl of rec.plates) if (done || pl.x < sx) hexCover(ctx, 0, 0, 0, L.u, { x: pl.x - pl.h * 0.15, y: pl.y - pl.h * 0.15, w: pl.w + pl.h * 0.3, h: pl.h * 1.3 });
  if (st.setting !== 'strict' && rec.dog && (done || rec.dog.x < sx)) hexCover(ctx, rec.dog.x, rec.dog.y, rec.dog.r, L.u);
  if (!done) { // the sweep line
    const g = ctx.createLinearGradient(sx - 18 * L.u, 0, sx + 2 * L.u, 0); g.addColorStop(0, 'rgba(169,139,255,0)'); g.addColorStop(1, 'rgba(169,139,255,0.35)');
    ctx.fillStyle = g; ctx.fillRect(sx - 18 * L.u, 0, 20 * L.u, L.H);
    ctx.fillStyle = 'rgba(214,200,255,0.95)'; ctx.fillRect(sx, 0, Math.max(1, 1.2 * L.u), L.H);
  }
}

// ---------- regions the camera measures (sensor coordinates) ----------
function rasterMask(Wd, Hd, polys, holes) {
  const c = mkCanvas(Wd, Hd); const x = c.getContext('2d');
  x.fillStyle = '#fff'; for (const p of polys) { poly(x, p); x.fill(); }
  x.fillStyle = '#000'; for (const h of holes) x.fillRect(h[0], h[1], h[2], h[3]);
  const d = x.getImageData(0, 0, Wd, Hd).data; const idx = [];
  for (let i = 0; i < Wd * Hd; i++) if (d[i * 4] > 200) idx.push(i);
  return Int32Array.from(idx);
}
function regions(L, rec) {
  const { P, f, W } = L;
  const za = Math.max(13.5, 7.5 * f / (0.47 * W) + 0.5), zb = za + 22;
  const nt = [P(NEAR_T.x, NEAR_T.y0, NEAR_T.z0), P(NEAR_T.x, NEAR_T.y1, NEAR_T.z1)];
  const ntBox = [Math.min(nt[0][0], nt[1][0]) - 2, Math.min(nt[0][1], nt[1][1]) - 2, Math.abs(nt[1][0] - nt[0][0]) + 4, Math.abs(nt[1][1] - nt[0][1]) + 4];
  const rainPolys = [-1, 1].map((s) => [P(s * 7.5, 4.6, za), P(s * 7.5, 4.6, zb), P(s * 7.5, 9.5, zb), P(s * 7.5, 9.5, za)]);
  const zmin = Math.max(4.5, f * CAM / (0.97 * L.H - L.y0)), zmax = zmin * 1.9;
  const waterPoly = [P(0.6, 0, zmin), P(3.6, 0, zmin), P(3.6, 0, zmax), P(0.6, 0, zmax)];
  const roadPoly = [P(-5, 0, Math.max(1.3, f * CAM / (L.H - L.y0 + 2))), P(5, 0, Math.max(1.3, f * CAM / (L.H - L.y0 + 2))), P(5, 0, 160), P(-5, 0, 160)];
  const nearIn = [P(NEAR_T.x, 5.1, 18.75), P(NEAR_T.x, 5.1, 20.25), P(NEAR_T.x, 6.1, 20.25), P(NEAR_T.x, 6.1, 18.75)];
  const farA = P(-5, 13, FAR_Z), farB = P(5, 2, FAR_Z);
  const skyA = P(-3, 26, FAR_Z), skyB = P(3, 18, FAR_Z);
  const boxes = rec.boxes.map((b) => [b[0] - 1, b[1] - 1, b[2] + 2, b[3] + 2]);
  return {
    rain: rasterMask(L.W, L.H, rainPolys, [ntBox]),
    water: rasterMask(L.W, L.H, [waterPoly], boxes),
    road: rasterMask(L.W, L.H, [roadPoly], []),
    near: rasterMask(L.W, L.H, [nearIn], []),
    far: rasterMask(L.W, L.H, [[[farA[0] + 1, farA[1] + 1], [farB[0] - 1, farA[1] + 1], [farB[0] - 1, farB[1] - 1], [farA[0] + 1, farB[1] - 1]]], []),
    sky: rasterMask(L.W, L.H, [[[skyA[0], skyA[1]], [skyB[0], skyA[1]], [skyB[0], skyB[1]], [skyA[0], skyB[1]]]], []),
  };
}
function mkCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
const lum = (d, i) => (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
function median(a) { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; }

// ---------- the scene ----------
export function createFaceShieldScene(canvas, opts = {}) {
  const seed = opts.seed ?? 1;
  const world = makeWorld(seed);
  const st = { rain: 18, ponding: 0.3, night: false, shield: 0, dissolve: 0, setting: 'default', lang: opts.lang || 'en', cell: opts.cell || 'pp-cell', time: opts.time || '16:30' };
  const ctx = canvas.getContext('2d');
  let L = null, staticC = null, staticKey = '', rec = { faces: [], plates: [], boxes: [], dog: null };
  let frame = 0, raf = 0, running = false, last = 0;
  let lastMeasure = null, measureKey = '', measureBusy = false, lastSent = null;
  const sensor = { L: null, c: null, x: null, staticC: null, staticKey: '', rec: { faces: [], plates: [], boxes: [], dog: null }, reg: null, cal: new Map() };

  const keyOf = (s) => `${s.night ? 1 : 0}|${Math.round(s.rain * 10)}|${Math.round(s.ponding * 1000)}`;
  function ensureStatic() {
    if (!canvas.width || !canvas.height) return false;
    if (!L || L.W !== canvas.width || L.H !== canvas.height) { L = layoutOf(canvas.width, canvas.height); staticKey = ''; }
    const k = keyOf(st);
    if (k !== staticKey) {
      if (!staticC || staticC.width !== L.W || staticC.height !== L.H) staticC = mkCanvas(L.W, L.H);
      renderStatic(staticC.getContext('2d'), L, world, renderState(st), rec); staticKey = k;
    }
    return true;
  }

  // sensor: the camera's own frame buffer, 360 px wide, same framing as the display
  function ensureSensor() {
    const Ws = 360, Hs = Math.max(200, Math.round(360 * (canvas.height || 1688) / (canvas.width || 780)));
    if (!sensor.L || sensor.L.W !== Ws || sensor.L.H !== Hs) {
      sensor.L = layoutOf(Ws, Hs); sensor.c = mkCanvas(Ws, Hs); sensor.x = sensor.c.getContext('2d', { willReadFrequently: true });
      sensor.staticC = mkCanvas(Ws, Hs); sensor.staticKey = ''; sensor.reg = null;
    }
  }
  function sensorStatic(params) {
    const k = keyOf(params);
    if (k !== sensor.staticKey) { renderStatic(sensor.staticC.getContext('2d'), sensor.L, world, renderState(params), sensor.rec); sensor.staticKey = k; }
    if (!sensor.reg) sensor.reg = regions(sensor.L, sensor.rec);
  }
  function sensorFrame(params, fr) {
    const x = sensor.x, Ls = sensor.L, S = renderState(params);
    x.drawImage(sensor.staticC, 0, 0);
    drawRipples(x, Ls, S, world, fr);
    drawCovers(x, Ls, sensor.rec, params);
    drawStreaks(x, Ls, S, fr, seed, 0);
    return x.getImageData(0, 0, Ls.W, Ls.H).data;
  }
  // one measurement pass: 4 frame pairs; streak fraction from frame differences; water and
  // visibility from the per-pixel minimum of each pair (rain streaks are brighter, the minimum drops them)
  function pixelPass(params, frameBase) {
    sensorStatic(params);
    const reg = sensor.reg; let diff = 0, wet = 0, wetN = 0; let nearL = [], farL = [], skyL = [];
    const roadWet = new Uint8Array(sensor.L.W * sensor.L.H);
    const thr = params._waterThr;
    for (let p = 0; p < 4; p++) {
      const A = new Uint8ClampedArray(sensorFrame(params, frameBase + 2 * p));
      const B = sensorFrame(params, frameBase + 2 * p + 1);
      for (const i of reg.rain) { const j = i * 4; if (Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]) > 30) diff++; }
      const mn = (i) => (Math.min(A[i * 4], B[i * 4]) + Math.min(A[i * 4 + 1], B[i * 4 + 1]) + Math.min(A[i * 4 + 2], B[i * 4 + 2])) / 3;
      if (thr != null) {
        for (const i of reg.water) { wetN++; if (mn(i) > thr) wet++; }
        if (p === 0) for (const i of reg.road) if (mn(i) > thr) roadWet[i] = 1;
      }
      if (p === 0) { for (const i of reg.near) nearL.push(mn(i)); for (const i of reg.far) farL.push(mn(i)); for (const i of reg.sky) skyL.push(mn(i)); }
    }
    return { frac: diff / (reg.rain.length * 4), water: wetN ? wet / wetN : 0, near: median(nearL), far: median(farL), sky: median(skyL), roadWet };
  }
  function calibration(night) {
    ensureSensor();
    const key = `${sensor.L.W}x${sensor.L.H}|${night ? 1 : 0}`;
    if (sensor.cal.has(key)) return sensor.cal.get(key);
    // water: median road-ROI brightness with no water and with full water, threshold halfway
    const wDry = [], wWet = [];
    for (const [pond, out] of [[0, wDry], [1, wWet]]) {
      const prm = { ...st, night, rain: 0, ponding: pond, shield: 0 };
      sensorStatic(prm); const d = sensorFrame(prm, 1);
      for (const i of sensor.reg.water) out.push(lum(d, i));
    }
    const waterThr = (median(wDry) + median(wWet)) / 2;
    // rain: streak fraction at known rates, rendered offscreen with this scene
    const rates = [0, 3, 6, 10, 15, 22, 30, 40, 52, 66, 82, 100, 120];
    const pts = rates.map((R, i) => [pixelPass({ ...st, night, rain: R, ponding: 0, shield: 0, _waterThr: null }, 100000 + i * 16).frac, R]);
    for (let i = 1; i < pts.length; i++) pts[i][0] = Math.max(pts[i][0], pts[i - 1][0] + 1e-7);
    const cal = { waterThr, rain: pts };
    sensor.cal.set(key, cal); sensor.staticKey = '';
    return cal;
  }
  function rainFromFrac(cal, f) {
    const p = cal.rain; if (f <= p[0][0]) return 0;
    for (let i = 1; i < p.length; i++) if (f <= p[i][0]) { const t = (f - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + t * (p[i][1] - p[i - 1][1]); }
    const a = p[p.length - 2], b = p[p.length - 1]; return b[1] + (f - b[0]) * (b[1] - a[1]) / (b[0] - a[0]);
  }
  let measureCount = 0, measuredAt = 0, maskC = null;
  function measurePixels() {
    ensureSensor();
    const cal = calibration(st.night);
    const params = { ...st, _waterThr: cal.waterThr };
    const r = pixelPass(params, 1000 + (measureCount++ % 50) * 8);
    const rain = rainFromFrac(cal, r.frac);
    const cn = (r.near - r.sky) / r.sky, cf = (r.far - r.sky) / r.sky;
    let vis = 20000;
    const ratio = cf / cn;
    if (ratio > 0 && ratio < 1) vis = clamp(3 / (-Math.log(ratio) / (D_FAR - D_NEAR)), 50, 20000);
    const out = {
      rain: { value: rain < 10 ? Math.round(rain * 10) / 10 : Math.round(rain), unit: 'mm/h' },
      water: { value: Math.round(r.water * 100), unit: '%' },
      visibility: { value: vis >= 20000 ? 20000 : vis >= 1000 ? Math.round(vis / 100) * 100 : Math.round(vis / 10) * 10, unit: 'm' },
      raw: { streakFraction: +r.frac.toFixed(5), near: +r.near.toFixed(1), far: +r.far.toFixed(1), sky: +r.sky.toFixed(1), waterThreshold: +cal.waterThr.toFixed(1) },
      _roadWet: r.roadWet,
    };
    lastMeasure = out; measureKey = keyOf(st) + '|' + st.shield + '|' + st.setting; measuredAt = Date.now(); maskC = null;
    return out;
  }

  function drawMeasurementView(a1, a2) {
    const u = L.u;
    if (a1 > 0.001) {
      ctx.save(); ctx.globalAlpha = a1;
      ctx.fillStyle = 'rgba(11,18,32,0.94)'; ctx.fillRect(0, 0, L.W, L.H);
      if (lastMeasure && sensor.L) { // wet road mask from the camera's own classification
        if (!maskC) {
          maskC = mkCanvas(sensor.L.W, sensor.L.H); const mx = maskC.getContext('2d'); const img = mx.createImageData(sensor.L.W, sensor.L.H);
          const rw = lastMeasure._roadWet; for (let i = 0; i < rw.length; i++) if (rw[i]) { img.data[i * 4] = 95; img.data[i * 4 + 1] = 212; img.data[i * 4 + 2] = 230; img.data[i * 4 + 3] = 150; }
          mx.putImageData(img, 0, 0);
        }
        ctx.imageSmoothingEnabled = true; ctx.drawImage(maskC, 0, 0, L.W, L.H);
      }
      ctx.strokeStyle = 'rgba(201,209,220,0.55)'; ctx.lineWidth = Math.max(0.6, 0.8 * u);
      const zn = Math.max(1.3, L.f * CAM / (L.H - L.y0 + 2));
      ctx.beginPath(); for (const s of [-1, 1]) { const a = L.P(s * 5, 0, zn), b = L.P(s * 5, 0, 300); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke();
      drawStreaks(ctx, L, renderState(st), frame, seed, 4000, [95, 212, 230]);
      // contrast strip: near and far targets
      const nt = [L.P(NEAR_T.x, NEAR_T.y1, NEAR_T.z0), L.P(NEAR_T.x, NEAR_T.y0, NEAR_T.z1)];
      const ft = [L.P(-5, 13, FAR_Z), L.P(5, 2, FAR_Z)];
      ctx.strokeStyle = 'rgba(201,209,220,0.9)'; ctx.setLineDash([3 * u, 3 * u]);
      ctx.strokeRect(Math.min(nt[0][0], nt[1][0]), nt[0][1], Math.abs(nt[1][0] - nt[0][0]), nt[1][1] - nt[0][1]);
      ctx.strokeRect(ft[0][0] - 2 * u, ft[0][1] - 2 * u, ft[1][0] - ft[0][0] + 4 * u, ft[1][1] - ft[0][1] + 4 * u);
      ctx.beginPath(); ctx.moveTo((nt[0][0] + nt[1][0]) / 2, (nt[0][1] + nt[1][1]) / 2); ctx.lineTo(L.cx, L.y0 - 4 * u); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
    if (a2 > 0.001 && lastMeasure) {
      const w = WORDS[st.lang] || WORDS.en; const m = lastMeasure;
      ctx.save(); ctx.globalAlpha = a2;
      ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, L.W, L.H);
      const vis = m.visibility.value >= 20000 ? '20+ km' : m.visibility.value >= 1000 ? `${(m.visibility.value / 1000).toFixed(1)} km` : `${m.visibility.value} m`;
      const rows = [[w.rain, `${m.rain.value}`, 'mm/h', '#5fd4e6'], [w.water, `${m.water.value}`, '%', '#5fd4e6'], [w.vis, vis, '', '#c9d1dc']];
      const big = 40 * u, lab = 14 * u;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const stepY = L.portrait ? L.H * 0.16 : L.H * 0.0; const stepX = L.portrait ? 0 : L.W * 0.28;
      rows.forEach(([label, val, unit, col], i) => {
        const x = L.cx + (i - 1) * stepX, y = L.H * 0.36 + (i - 1) * stepY;
        ctx.fillStyle = '#a9b4c4'; ctx.font = `500 ${lab}px ${FONT}`; ctx.fillText(label, x, y - big * 0.95);
        ctx.fillStyle = col; ctx.font = `700 ${big}px ${FONT}`; ctx.fillText(unit ? `${val} ${unit}` : val, x, y);
      });
      if (lastSent) { ctx.fillStyle = '#f5c451'; ctx.font = `600 ${lab}px ${FONT}`; ctx.fillText(w.sent(lastSent), L.cx, L.portrait ? L.H * 0.36 + 2.1 * stepY : L.H * 0.36 + big * 1.3); }
      ctx.restore();
    }
  }

  function render() {
    if (!ensureStatic()) return;
    const S = renderState(st); const d = st.dissolve;
    const pa = 1 - smooth(d / 0.5);
    ctx.globalAlpha = 1; ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, L.W, L.H);
    if (pa > 0.001) {
      ctx.globalAlpha = pa;
      ctx.drawImage(staticC, 0, 0);
      drawRipples(ctx, L, S, world, frame);
      drawCovers(ctx, L, rec, st);
      drawStreaks(ctx, L, S, frame, seed, 9000);
      const w = WORDS[st.lang] || WORDS.en;
      ctx.font = `500 ${11 * L.u}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(11,18,32,0.55)'; const tw = ctx.measureText(w.caption).width;
      ctx.fillRect(6 * L.u, L.H - 24 * L.u, tw + 12 * L.u, 18 * L.u);
      ctx.fillStyle = 'rgba(244,241,234,0.92)'; ctx.fillText(w.caption, 12 * L.u, L.H - 9 * L.u);
      ctx.globalAlpha = 1;
    }
    if (d > 0.001) {
      const want = keyOf(st) + '|' + st.shield + '|' + st.setting;
      if ((!lastMeasure || (measureKey !== want && Date.now() - measuredAt > 250)) && !measureBusy) { measureBusy = true; try { measurePixels(); } finally { measureBusy = false; } }
      const a1 = smooth((d - 0.12) / 0.35) * (1 - smooth((d - 0.62) / 0.25));
      const a2 = smooth((d - 0.6) / 0.3);
      drawMeasurementView(a1, a2);
    }
  }

  function loop(t) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (t - last < 32) return; last = t; frame++; render();
  }

  const api = {
    set(p = {}) { Object.assign(st, p); if (!running) render(); return api; },
    get state() { return { ...st }; },
    resize() { L = null; staticKey = ''; if (!running) render(); return api; },
    render() { render(); return api; },
    start() { if (!running) { running = true; last = 0; raf = requestAnimationFrame(loop); } return api; },
    stop() { running = false; cancelAnimationFrame(raf); return api; },
    destroy() { api.stop(); staticC = null; sensor.c = sensor.staticC = null; sensor.cal.clear(); },
    faces() {
      ensureStatic(); const done = st.shield >= 0.999; const sx = L ? sweepX(st.shield, L.W) : 0;
      return outcomes(rec, st.setting).map((fc) => ({ id: fc.id, condition: fc.condition, covered: !fc.missed && st.shield > 0 && (done || fc.x <= sx), missed: fc.missed, x: Math.round(fc.x * 10) / 10, y: Math.round(fc.y * 10) / 10, r: Math.round(fc.r * 10) / 10 }));
    },
    measureSync() { const m = measurePixels(); const { _roadWet, ...rest } = m; return rest; },
    async measure() {
      const m = measurePixels(); const { _roadWet, ...rest } = m;
      const msg = JSON.stringify({ t: st.time, cell: st.cell, rain: rest.rain.value, water: rest.water.value, vis: rest.visibility.value });
      rest.sentBytes = new TextEncoder().encode(msg).length; rest.sent = msg; lastSent = rest.sentBytes;
      // the picture itself, as a JPEG at the display size, with no covers: what stays on the camera
      ensureStatic();
      const pic = mkCanvas(L.W, L.H), px = pic.getContext('2d');
      px.drawImage(staticC, 0, 0); drawRipples(px, L, renderState(st), world, frame); drawStreaks(px, L, renderState(st), frame, seed, 9000);
      rest.pictureBytes = await new Promise((res) => {
        if (pic.toBlob) pic.toBlob((b) => res(b ? b.size : 0), 'image/jpeg', 0.8);
        else pic.convertToBlob({ type: 'image/jpeg', quality: 0.8 }).then((b) => res(b.size), () => res(0));
      });
      return rest;
    },
    calibration() { const c = calibration(st.night); return { waterThreshold: c.waterThr, rain: c.rain.map(([f, R]) => [+f.toFixed(5), R]) }; },
  };
  render();
  return api;
}
