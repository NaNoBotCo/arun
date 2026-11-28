// A code-drawn CCTV view of a signalised Phnom Penh junction, with a Face Shield divider.
// Left of the divider: the camera frame (faces, plates). Right: what the edge device keeps
// (hex covers, boxes, counting lines). The only things that leave are the numbers in packet().
// Everything is synthetic and seeded. No DOM access outside createStreetView.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(...n) { let h = 2166136261; for (const v of n) { h ^= v | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; } return h >>> 0; }
const hf = (...n) => (hash(...n) % 100000) / 100000;

export const WORDS = {
  en: { camera: 'Camera sees', leaves: 'What it sends', miss: 'Amber = a cover missed', n: 'N', e: 'E', s: 'S', w: 'W' },
  km: { camera: 'កាមេរ៉ាឃើញ', leaves: 'អ្វីដែលវាផ្ញើ', miss: 'លឿង = គ្របមិនជិត', n: 'ជើង', e: 'កើត', s: 'ត្បូង', w: 'លិច' },
  th: { camera: 'กล้องเห็น', leaves: 'สิ่งที่กล้องส่ง', miss: 'เหลือง = ปิดไม่ทัน', n: 'เหนือ', e: 'ออก', s: 'ใต้', w: 'ตก' },
};
const FONT = '"Kantumruy Pro","Noto Sans Thai","Khmer Sangam MN","Noto Sans Khmer",system-ui,sans-serif';
const MONO = 'ui-monospace,Menlo,Consolas,monospace';

// ---------- signal and queue kernels (pure) ----------
export const CYCLE = 92; // 40 NS green, 4 amber, 2 all red, 40 EW green, 4 amber, 2 all red
export function signalPhase(sec) {
  const t = (((sec % CYCLE) + CYCLE) % CYCLE);
  if (t < 40) return { ns: 'green', ew: 'red' };
  if (t < 44) return { ns: 'amber', ew: 'red' };
  if (t < 46) return { ns: 'red', ew: 'red' };
  if (t < 86) return { ns: 'red', ew: 'green' };
  if (t < 90) return { ns: 'red', ew: 'amber' };
  return { ns: 'red', ew: 'red' };
}
export function queueStep(Q, arrivals, capacity) {
  Q = Math.max(0, Q); arrivals = Math.max(0, arrivals);
  const departures = Math.min(Q + arrivals, Math.max(0, capacity));
  return { Q: Math.max(0, Q + arrivals - departures), departures };
}

// ---------- geometry ----------
const RW = 6.5;          // carriageway half width, m
const X0 = 11.5;         // building line
const STOPD = 10.2;      // stop line and counting line, m from the junction centre
const FAR = 62;          // spawn distance
const CAMX = -9.5, CAMY = 8, CAMZ = -9.5;
const DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]]; // heading of approach n, e, s, w
const AP = ['n', 'e', 's', 'w'];
const WEIGHT_AP = [0.30, 0.27, 0.23, 0.20];
const QSPACE = 6, QLANES = 2; // queue metres = passenger-car units x 6 m / 2 lanes
const MISS = 0.1;        // illustrative miss rate per face, not measured

// camera (module level, set per render)
let F = 400, SCX = 0, SCY = 0, FX = 0, FY = 0, FZ = 0, RX = 0, RZ = 0, UX = 0, UY = 0, UZ = 0, HORY = 0, PX = 0, PY = 0, CS = 1;
function setCam(W, H) {
  F = Math.min(0.63 * W, 1.25 * H); SCX = W / 2; SCY = H * 0.64; HORY = H * 0.3;
  const p = Math.atan((SCY - HORY) / F), s = Math.SQRT1_2;
  FX = s * Math.cos(p); FY = -Math.sin(p); FZ = s * Math.cos(p);
  RX = s; RZ = -s; UX = s * Math.sin(p); UY = Math.cos(p); UZ = s * Math.sin(p);
}
function pj(x, y, z) {
  const vx = x - CAMX, vy = y - CAMY, vz = z - CAMZ;
  const zc = vx * FX + vy * FY + vz * FZ; if (zc < 0.25) return 0;
  const k = F / zc; PX = SCX + (vx * RX + vz * RZ) * k; PY = SCY - (vx * UX + vy * UY + vz * UZ) * k; return zc;
}

// ---------- look: light, weather, haze (quantised so static and moving parts agree) ----------
function makeLook(minute, rain, water, pm25) {
  const qm = Math.round(minute / 4) * 4;
  const tod = ((((15 * 60 + qm) % 1440) + 1440) % 1440) / 60;
  const sun = sm((tod - 5.6) / 1.0) * (1 - sm((tod - 17.0) / 1.1));
  const tw = Math.min(1, Math.exp(-(((tod - 6.1) / 0.8) ** 2)) + Math.exp(-(((tod - 17.7) / 0.8) ** 2)));
  const rl = rain < 0.3 ? 0 : rain < 3 ? 1 : rain < 10 ? 2 : rain < 30 ? 3 : 4;
  const wet = [0, 0.45, 0.65, 0.85, 1][rl];
  const wl = Math.round(clamp(water / 25, 0, 1) * 10);
  const cover = wl / 10;
  const pm = Math.round(clamp(pm25, 0, 400) / 8) * 8;
  const pmF = clamp((pm - 20) / 160, 0, 1);
  const oc = clamp(rain / 20, 0, 1) * 0.4 + clamp(pm / 250, 0, 1) * 0.2;
  const night = 1 - sun;
  let amb = mix3([0.30, 0.34, 0.50], [0.98, 0.97, 0.95], sun);
  amb = mix3(amb, [0.95, 0.66, 0.52], tw * 0.55);
  amb = amb.map((v) => v * (1 - oc * 0.45));
  const g = (amb[0] + amb[1] + amb[2]) / 3; amb = amb.map((v) => lerp(v, g, oc * 0.5));
  // fog and sky
  let fog = mix3([200, 210, 222], [176, 156, 134], pmF);
  fog = mix3(fog, [150, 156, 164], clamp(rain / 30, 0, 1) * 0.5);
  fog = mix3([46, 40, 54], fog, sun);
  fog = mix3(fog, [236, 158, 110], tw * 0.6);
  fog = mix3(fog, [70, 48, 40], night * pmF * 0.5);
  let skyTop = mix3([88, 142, 208], [136, 142, 150], oc * 1.2);
  skyTop = mix3(skyTop, [156, 144, 132], pmF * 0.5);
  skyTop = mix3([8, 10, 26], skyTop, sun);
  skyTop = mix3(skyTop, [74, 92, 156], tw * 0.6);
  const skyMid = mix3(skyTop, fog, 0.55);
  const sigma = 0.0024 + pm * 0.000062 + 0.0013 * Math.sqrt(Math.max(0, rain));
  const az = Math.PI * (tod - 6) / 12; let sx = Math.cos(az), sz = -0.45 * Math.sin(az); const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
  return {
    key: [Math.round(sun * 12), Math.round(tw * 6), rl, wl, pm / 8].join('|'),
    tod, sun: sun * (1 - oc * 0.5), night, tw, wet, cover, rl, pmF, oc, amb, fog, skyTop, skyMid, sigma, sx, sz,
    lamps: sun < 0.55, // street lamps and headlights on
  };
}
let LK = null;
const T_OF = (d) => Math.exp(-LK.sigma * d);
function rgb(r, g, b) { return 'rgb(' + (r < 0 ? 0 : r > 255 ? 255 : r | 0) + ',' + (g < 0 ? 0 : g > 255 ? 255 : g | 0) + ',' + (b < 0 ? 0 : b > 255 ? 255 : b | 0) + ')'; }
// lit colour: base c, light k, transmittance t
function tn(c, k, t) { const a = LK.amb, f = LK.fog, s = 1 - t; return rgb(c[0] * a[0] * k * t + f[0] * s, c[1] * a[1] * k * t + f[1] * s, c[2] * a[2] * k * t + f[2] * s); }
// emissive colour: only haze applies
function te(c, t) { const f = LK.fog, s = 1 - t; return rgb(c[0] * t + f[0] * s, c[1] * t + f[1] * s, c[2] * t + f[2] * s); }
const faceK = (nx, nz) => { const d = Math.max(0, nx * LK.sx + nz * LK.sz); return lerp(0.82, 0.58 + 0.42 * d, LK.sun); };
const topK = () => lerp(0.95, 1.06, LK.sun);

// ---------- the seeded world ----------
const SIGNS = ['ហាងកាហ្វេ', 'ឱសថស្ថាន', 'ផ្សារ', 'ភោជនីយដ្ឋាន', 'ទូរស័ព្ទ', 'នំបញ្ចុក', 'កាត់សក់', 'ម៉ូតូ', 'ស្បែកជើង', 'បាយសាច់ជ្រូក', 'CAFE', 'PHARMACY', 'MOTO REPAIR', 'MINI MART', 'ហាងលក់ទំនិញ'];
const TONES = [[232, 220, 186], [222, 182, 120], [168, 200, 184], [230, 172, 146], [210, 206, 196], [238, 232, 218], [196, 160, 128], [176, 190, 206], [240, 210, 160]];
const AWN = [[206, 64, 54], [44, 100, 170], [236, 156, 44], [48, 148, 100], [158, 66, 126], [230, 230, 224]];
const SIGNBG = [[206, 34, 44], [24, 76, 168], [240, 190, 34], [26, 126, 86], [232, 96, 34], [248, 248, 240]];
const SKIN = [[210, 160, 120], [184, 134, 96], [158, 112, 80], [224, 180, 144], [136, 94, 66]];
const SHIRT = [[232, 230, 222], [66, 98, 160], [208, 74, 64], [244, 206, 84], [76, 148, 116], [236, 148, 176], [58, 58, 66], [156, 116, 206], [244, 120, 40]];
const PANTS = [[40, 44, 58], [76, 70, 62], [30, 30, 36], [100, 88, 74], [54, 74, 114]];
const HAIR = [[22, 18, 16], [36, 28, 22], [60, 52, 48]];
const HELM = [[220, 40, 40], [30, 30, 34], [240, 240, 235], [40, 90, 180], [230, 170, 30], [60, 150, 90]];
const MOTOC = [[196, 40, 44], [30, 30, 34], [236, 236, 230], [44, 84, 170], [214, 150, 30], [76, 78, 86], [120, 30, 40]];
const CARC = [[236, 236, 232], [188, 192, 198], [30, 32, 38], [34, 54, 100], [170, 40, 40], [110, 30, 44], [210, 206, 190], [90, 98, 108]];
const TUKC = [[214, 62, 42], [40, 112, 184], [236, 170, 40], [50, 150, 110]];

function makeWorld(seed) {
  const r = mulberry32(hash(seed, 11));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const walls = [];
  for (const def of [{ ax: 0, c: X0, nrm: -1 }, { ax: 1, c: X0, nrm: -1 }, { ax: 0, c: -X0, nrm: 1 }, { ax: 1, c: -X0, nrm: 1 }]) {
    const units = []; let u = X0; let first = true;
    while (u < 170) {
      const wd = first ? 6.6 : 3.8 + r() * 2.4; const floors = first ? 4 : 3 + (r() < 0.5 ? 1 : 0) + (r() < 0.15 ? 1 : 0);
      const h = 3.7 + (floors - 1) * 3.1 + 0.5;
      const sg = r() < 0.7 ? { bg: pick(SIGNBG), text: pick(SIGNS) } : null;
      units.push({
        u0: u, u1: u + wd, floors, h, tone: pick(TONES), awn: r() < 0.82 ? pick(AWN) : null, sign: first ? { bg: [206, 34, 44], text: 'ហាងកាហ្វេ' } : sg,
        open: r() < 0.78, lit: Array.from({ length: 12 }, () => r() < 0.42), goods: Array.from({ length: 6 }, () => pick(AWN)),
        bal: Array.from({ length: 5 }, () => r() < 0.4), shut: pick([[60, 120, 80], [120, 88, 60], [90, 100, 120]]), ac: r() < 0.5, first, v: r(),
        tv: Array.from({ length: 12 }, () => r() < 0.2),
      });
      u += wd; first = false;
    }
    walls.push({ ...def, units });
  }
  const trees = [[10.1, 21], [10.1, 41], [10.1, 62], [21, 10.1], [41, 10.1], [62, 10.1], [-10.1, 26], [-10.1, 50], [27, -10.1], [52, -10.1]].map(([x, z]) => ({ x, z, h: 5 + r() * 2.5, s: 0.9 + r() * 0.5, seed: Math.floor(r() * 1e6) }));
  const lamps = [[7.3, 17], [-7.3, 32], [7.3, 50], [17, 7.3], [32, -7.3], [50, 7.3], [-7.3, 68], [68, 7.3]];
  const poles = [];
  for (let z = 15; z < 130; z += 26) { poles.push([10.7, z], [-10.7, z]); }
  for (let x = 15; x < 130; x += 26) { poles.push([x, 10.7], [x, -10.7]); }
  const skyline = Array.from({ length: 16 }, () => ({ ang: -0.75 + r() * 1.5, dist: 280 + r() * 380, w: 18 + r() * 44, h: 40 + Math.pow(r(), 1.6) * 150, seed: r() }));
  const puddles = Array.from({ length: 70 }, (_, i) => {
    const q = r(); let x, z;
    if (q < 0.4) { x = -5.6 + r() * 11.2; z = -4 + r() * 56; } else if (q < 0.8) { z = -5.6 + r() * 11.2; x = -4 + r() * 56; } else { x = -6 + r() * 12; z = -6 + r() * 12; }
    return { x, z, a: 0.9 + r() * 2.6, b: 0.7 + r() * 1.7, rank: i / 70 + r() * 0.2 };
  });
  const parked = [[10.3, 15, -1, 0], [10.4, 19, -1, 0], [10.3, 25.5, -1, 0], [16, 10.3, 0, -1], [19.5, 10.4, 0, -1], [30, 10.3, 0, -1], [-10.3, 20, 1, 0], [-10.4, 38, 1, 0]].map(([x, z, hx, hz]) => ({ t: 'park', x, z, hx, hz, col: pick(MOTOC), v: 0 }));
  const clouds = Array.from({ length: 8 }, () => ({ x: r(), y: r(), s: 0.15 + r() * 0.2 }));
  return { walls, trees, lamps, poles, skyline, puddles, parked, clouds, dirt: Array.from({ length: 24 }, () => ({ x: -5 + r() * 10, z: -5 + r() * 40, a: 0.4 + r() * 1.5 })) };
}

// ---------- paths ----------
const pathCache = new Map();
function getPath(a, mv, o) {
  const key = a * 10000 + mv * 1000 + Math.round(o * 10);
  let p = pathCache.get(key); if (p) return p;
  const h = DIRS[a], rv = [h[1], -h[0]];
  const P = (d, off, hh, rr) => [-hh[0] * d + rr[0] * off, -hh[1] * d + rr[1] * off];
  const pts = [P(FAR, o, h, rv), P(RW, o, h, rv)];
  if (mv === 0) { pts.push(P(-FAR, o, h, rv)); } else {
    const h2 = mv === 1 ? rv : [-rv[0], -rv[1]]; const rv2 = [h2[1], -h2[0]];
    const o2 = mv === 1 ? 5.0 : 2.4;
    const p0 = pts[1]; const p2 = [h2[0] * RW + rv2[0] * o2, h2[1] * RW + rv2[1] * o2];
    const d2 = p0[0] * h2[0] + p0[1] * h2[1], d1 = p2[0] * h[0] + p2[1] * h[1];
    const X = [d2 * h2[0] + d1 * h[0], d2 * h2[1] + d1 * h[1]];
    for (let i = 1; i <= 14; i++) { const t = i / 14, u = 1 - t; pts.push([u * u * p0[0] + 2 * u * t * X[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * X[1] + t * t * p2[1]]); }
    pts.push([h2[0] * FAR + rv2[0] * o2, h2[1] * FAR + rv2[1] * o2]);
  }
  const n = pts.length, X = new Float64Array(n), Z = new Float64Array(n), S = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = pts[i][0]; Z[i] = pts[i][1]; if (i) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]); }
  p = { X, Z, S, n, total: S[n - 1], sStop: FAR - STOPD, sEntry: FAR - RW };
  pathCache.set(key, p); return p;
}
function place(v) {
  const p = v.path; let i = v.seg; while (i < p.n - 2 && p.S[i + 1] < v.s) i++; v.seg = i;
  const l = p.S[i + 1] - p.S[i] || 1, t = clamp((v.s - p.S[i]) / l, 0, 1);
  const dx = (p.X[i + 1] - p.X[i]) / l, dz = (p.Z[i + 1] - p.Z[i]) / l;
  v.x = p.X[i] + (p.X[i + 1] - p.X[i]) * t; v.z = p.Z[i] + (p.Z[i + 1] - p.Z[i]) * t;
  v.hx = dx; v.hz = dz;
}

// pedestrians: corners, zebras, arm ends
const CORN = [[8.3, 8.3], [-8.3, 8.3], [-8.3, -8.3], [8.3, -8.3]];
const ARMEND = [
  { c: 0, a: 0, w: [9.4, STOPD], f: [9.4, 54] }, { c: 1, a: 0, w: [-9.4, STOPD], f: [-9.4, 54] },
  { c: 0, a: 1, w: [STOPD, 9.4], f: [54, 9.4] }, { c: 3, a: 1, w: [STOPD, -9.4], f: [54, -9.4] },
  { c: 3, a: 2, w: [9.4, -STOPD], f: [9.4, -54] }, { c: 2, a: 2, w: [-9.4, -STOPD], f: [-9.4, -54] },
  { c: 1, a: 3, w: [-STOPD, 9.4], f: [-54, 9.4] }, { c: 2, a: 3, w: [-STOPD, -9.4], f: [-54, -9.4] },
];
const CORN_ARMS = [[0, 2], [1, 6], [5, 7], [3, 4]];
const CORN_ZEB = [[[0, 1], [1, 3]], [[0, 0], [3, 2]], [[2, 3], [3, 1]], [[1, 0], [2, 2]]]; // [zebra, otherCorner]
const ZEB_PAR = ['ew', 'ns', 'ew', 'ns'];
function walkOK(zi, ct) { return ZEB_PAR[zi] === 'ns' ? ct < 27 : ct >= 46 && ct < 73; }

// ---------- sim ----------
const KIND = { moto: 0, car: 1, suv: 2, tuk: 3, bus: 4, truck: 5 };
const CAT = [0, 1, 1, 2, 3, 3];
const DIM = [[1.8, 0.6], [4.3, 1.8], [4.7, 1.95], [3.3, 1.4], [9.2, 2.5], [6.4, 2.2]];
const PCU = [0.3, 1, 1.1, 0.7, 2, 1.8];

function makeSim(seed) {
  return { rng: mulberry32(hash(seed, 7)), t: 0, V: [], P: [], ev: [], q: [0, 0, 0, 0], idc: 1, ph: signalPhase(0), flash: [0, 0, 0, 0], app: [0, 0, 0, 0], carts: [] };
}
function occ(S, role, along, lat, y, helmetP, kidP) {
  const r = S.rng;
  return { role, along, lat, y, r: 0.13, skin: SKIN[(r() * SKIN.length) | 0], hair: HAIR[(r() * 3) | 0], helm: r() < helmetP ? HELM[(r() * HELM.length) | 0] : null, shirt: SHIRT[(r() * SHIRT.length) | 0], pants: PANTS[(r() * PANTS.length) | 0], missed: r() < MISS, kid: r() < kidP };
}
function spawnVeh(S, a) {
  const r = S.rng; const q = r();
  const kind = q < 0.68 ? 0 : q < 0.84 ? 1 : q < 0.89 ? 2 : q < 0.96 ? 3 : q < 0.985 ? 4 : 5;
  let o;
  if (kind === 0) o = [0.9, 1.9, 2.9, 3.9, 4.9, 5.9][(r() * 6) | 0];
  else if (kind === 3) o = r() < 0.5 ? 3.9 : 5.2;
  else o = r() < 0.5 ? 2.4 : 5.0;
  const mv = kind >= 4 ? (r() < 0.9 ? 0 : 1) : o >= 3.3 ? (r() < 0.2 ? 1 : 0) : (r() < 0.17 ? 2 : 0);
  const path = getPath(a, mv, o);
  const [L, Wd] = DIM[kind];
  for (const u of S.V) if (u.a === a && Math.abs(u.o - o) < (Wd + DIM[u.kind][1]) / 2 + 0.2 && u.s < L + DIM[u.kind][0] + 2) return;
  const vdes = [8.5, 9, 9.5, 6.5, 8, 7][kind] * (0.85 + r() * 0.3);
  const v = {
    t: 'veh', id: S.idc++, kind, cat: CAT[kind], a, mv, o, path, seg: 0, s: 0, v: vdes * 0.8, vdes, L, W: Wd, x: 0, z: 0, hx: 0, hz: 0, passed: false, counted: false, wait: 0,
    b: kind === 0 ? 4.5 : 3.8, acc: kind === 0 ? 3.4 : kind >= 4 ? 1.4 : 2.4, gap0: kind === 0 ? 0.7 : 1.4, braking: false, ph: r() * 6, key: 0,
    col: kind === 0 ? MOTOC[(r() * MOTOC.length) | 0] : kind === 3 ? TUKC[(r() * TUKC.length) | 0] : kind === 4 ? [236, 236, 230] : kind === 5 ? pickC(r, [[60, 100, 70], [70, 90, 140], [150, 120, 80]]) : CARC[(r() * CARC.length) | 0],
    col2: MOTOC[(r() * MOTOC.length) | 0],
    plate: `${1 + ((r() * 3) | 0)}${'ABCDEFGH'[(r() * 8) | 0]}-${1000 + ((r() * 8999) | 0)}`, occ: [],
  };
  if (kind === 0) {
    v.occ.push(occ(S, 'rider', -0.1, 0, 1.58, 0.62, 0));
    if (r() < 0.33) v.occ.push(occ(S, 'pax', -0.62, 0, 1.52, 0.4, 0.2));
    if (r() < 0.06) v.occ.push(occ(S, 'pax', -1.0, 0, 1.45, 0.3, 0.1));
  } else if (kind === 3) {
    v.occ.push(occ(S, 'rider', -0.2, 0, 1.58, 0.5, 0));
    const n = (r() * 3) | 0; for (let i = 0; i < n; i++) v.occ.push(occ(S, 'pax', -1.55, i ? 0.35 : -0.3, 1.25, 0.05, 0));
  } else if (kind === 1 || kind === 2) {
    v.occ.push(occ(S, 'drv', 0.1, -0.42, 1.25, 0.02, 0));
    if (r() < 0.45) v.occ.push(occ(S, 'pax', 0.1, 0.42, 1.25, 0.02, 0));
  }
  place(v); S.V.push(v);
}
function pickC(r, a) { return a[(r() * a.length) | 0]; }
function pedColors(r) { return { skin: SKIN[(r() * SKIN.length) | 0], shirt: SHIRT[(r() * SHIRT.length) | 0], pants: PANTS[(r() * PANTS.length) | 0], hair: HAIR[(r() * 3) | 0], umb: AWN[(r() * AWN.length) | 0] }; }
function spawnPed(S) {
  const r = S.rng; const w = [0.2, 0.14, 0.2, 0.12, 0.08, 0.08, 0.1, 0.08]; let q = r(), e1 = 0; for (let i = 0; i < 8; i++) { q -= w[i]; if (q <= 0) { e1 = i; break; } }
  const A = ARMEND[e1]; const nodes = [{ x: A.f[0], z: A.f[1], g: -1 }, { x: A.w[0], z: A.w[1], g: -1 }];
  let c = A.c; nodes.push({ x: CORN[c][0], z: CORN[c][1], g: -1 });
  let cross = r() < 0.5 ? (r() < 0.25 ? 2 : 1) : 0;
  for (let i = 0; i < cross; i++) { const [zi, c2] = CORN_ZEB[c][(r() * 2) | 0]; nodes[nodes.length - 1].g = zi; c = c2; nodes.push({ x: CORN[c][0], z: CORN[c][1], g: -1 }); }
  const opts = CORN_ARMS[c].filter((e) => e !== e1); const e2 = opts[(r() * opts.length) | 0]; const B = ARMEND[e2];
  nodes.push({ x: B.w[0], z: B.w[1], g: -1 }, { x: B.f[0], z: B.f[1], g: -1 });
  const col = pedColors(r);
  S.P.push({ t: 'ped', nodes, i: 1, x: nodes[0].x, z: nodes[0].z, hx: 0, hz: 1, v: 1.0 + r() * 0.5, a: A.a, counted: false, waiting: false, onRoad: false, ph: r() * 6, col, h: 1.52 + r() * 0.2, umb: r() < 0.5, bag: r() < 0.3, missed: r() < MISS, key: 0, hat: r() < 0.15 });
}

function stepSim(S, P, dt) {
  const r = S.rng; S.t += dt; const ph = signalPhase(S.t); S.ph = ph; const ct = ((S.t % CYCLE) + CYCLE) % CYCLE;
  for (let a = 0; a < 4; a++) { if (r() < 1 - Math.exp(-(P.volume / 60) * WEIGHT_AP[a] * dt)) spawnVeh(S, a); if (S.flash[a] > 0) S.flash[a] -= dt; }
  if (r() < 1 - Math.exp(-((3 + 0.35 * P.volume) / 60) * dt)) spawnPed(S);
  const V = S.V, Pd = S.P, q = S.q; q[0] = q[1] = q[2] = q[3] = 0;
  const road = []; for (const p of Pd) if (p.onRoad) road.push(p);
  for (let i = V.length - 1; i >= 0; i--) {
    const v = V[i]; let g = 1e9, vl = 0;
    for (const u of V) {
      if (u === v) continue; const dx = u.x - v.x, dz = u.z - v.z; if (dx > 30 || dx < -30 || dz > 30 || dz < -30) continue;
      const al = dx * v.hx + dz * v.hz; if (al <= 0 || al > 30) continue;
      if (Math.abs(dx * v.hz - dz * v.hx) >= (v.W + u.W) / 2 + 0.12) continue; if (u.hx * v.hx + u.hz * v.hz < 0.4) continue;
      const gap = al - (v.L + u.L) / 2; if (gap < g) { g = gap; vl = u.v; }
    }
    for (const p of road) { const dx = p.x - v.x, dz = p.z - v.z; const al = dx * v.hx + dz * v.hz; if (al <= 0 || al > 20) continue; if (Math.abs(dx * v.hz - dz * v.hx) < v.W / 2 + 0.55) { const gap = al - v.L / 2 - 0.4; if (gap < g) { g = gap; vl = 0; } } }
    const sf = v.s + v.L / 2;
    if (!v.passed) {
      const sig = v.a % 2 === 0 ? ph.ns : ph.ew; const dS = v.path.sStop - sf;
      if (sig !== 'green') { if (dS > -0.6) { const go = sig === 'amber' && dS < Math.max(2.5, v.v * 1.3); if (!go && dS < g) { g = dS; vl = 0; } } }
      else if (v.mv === 2 && dS > -0.6 && dS < 6) {
        const opp = (v.a + 2) % 4; let blocked = false;
        for (const u of V) if (u.a === opp && u.mv !== 2 && u.s > u.path.sStop - 16 && u.s < u.path.sEntry + 14) { blocked = true; break; }
        if (blocked && v.wait < 7) { if (dS < g) { g = dS; vl = 0; } }
      }
      if (dS < 2.5 && v.v < 0.3) v.wait += dt;
      if (sf > v.path.sStop) v.passed = true;
      if (v.v < 0.8 && dS > -1 && v.s > v.path.sStop - 70) q[v.a] += PCU[v.kind];
    }
    let allowed = v.vdes;
    if (g < 1e8) { const gg = Math.max(0, g - v.gap0), bt = v.b * 0.45; allowed = Math.min(allowed, -bt + Math.sqrt(bt * bt + vl * vl + 2 * v.b * gg)); }
    const pv = v.v;
    if (v.v < allowed) v.v = Math.min(allowed, v.v + v.acc * dt); else v.v = Math.max(allowed, v.v - v.b * 1.5 * dt);
    v.braking = v.v < pv - 0.02 || (v.v < 0.5 && !v.passed);
    v.s += v.v * dt; place(v);
    if (!v.counted && v.s > v.path.sStop + 0.8) { v.counted = true; S.ev.push([S.t, v.cat, v.a]); S.flash[v.a] = 0.35; }
    if (v.s >= v.path.total - 0.5) V.splice(i, 1);
  }
  for (let i = Pd.length - 1; i >= 0; i--) {
    const p = Pd[i]; const tgt = p.nodes[p.i];
    if (p.waiting) { const gi = p.nodes[p.i - 1].g; if (walkOK(gi, ct)) { p.waiting = false; p.onRoad = true; } else continue; }
    const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz), st = p.v * dt;
    if (d > 1e-6) { p.hx = dx / d; p.hz = dz / d; }
    if (d <= st) {
      p.x = tgt.x; p.z = tgt.z; if (p.onRoad) p.onRoad = false;
      if (p.i === 1 && !p.counted) { p.counted = true; S.ev.push([S.t, 4, p.a]); S.flash[p.a] = 0.35; }
      p.i++; if (p.i >= p.nodes.length) { Pd.splice(i, 1); continue; }
      if (tgt.g >= 0) { p.waiting = true; }
    } else { p.x += p.hx * st; p.z += p.hz * st; }
  }
  while (S.ev.length && S.ev[0][0] < S.t - 60) S.ev.shift();
}

// ---------- drawing state ----------
let C = null;                 // current 2D context
let GL = [];                  // glow sprites
const gbuf = new Float32Array(6 * 1400); let gn = 0;
function gl(si, x, y, r, a, sy) { if (gn >= gbuf.length || a <= 0.01 || r < 0.4) return; const i = gn; gbuf[i] = si; gbuf[i + 1] = x; gbuf[i + 2] = y; gbuf[i + 3] = r; gbuf[i + 4] = a; gbuf[i + 5] = sy || 1; gn += 6; }
function flushGlows() {
  if (!gn) return; C.save(); C.globalCompositeOperation = 'lighter';
  for (let i = 0; i < gn; i += 6) { const r = gbuf[i + 3], sy = gbuf[i + 5]; C.globalAlpha = Math.min(1, gbuf[i + 4]); C.drawImage(GL[gbuf[i]], gbuf[i + 1] - r, gbuf[i + 2] - r * sy, r * 2, r * 2 * sy); }
  C.restore(); gn = 0;
}
let BX0 = 0, BY0 = 0, BX1 = 0, BY1 = 0;
const bbReset = () => { BX0 = BY0 = 1e9; BX1 = BY1 = -1e9; };
const bbAdd = (x, y) => { if (x < BX0) BX0 = x; if (x > BX1) BX1 = x; if (y < BY0) BY0 = y; if (y > BY1) BY1 = y; };

function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); }
// world polygon on any height with near-plane clipping
function worldPoly(c, P3, fill, pathOnly) {
  let pts = P3.map((p) => { const vx = p[0] - CAMX, vy = p[1] - CAMY, vz = p[2] - CAMZ; return [vx * RX + vz * RZ, vx * UX + vy * UY + vz * UZ, vx * FX + vy * FY + vz * FZ]; });
  const out = []; const NEAR = 0.3;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (a[2] >= NEAR) out.push(a);
    if ((a[2] >= NEAR) !== (b[2] >= NEAR)) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
  }
  if (out.length < 3) return;
  if (!pathOnly) c.beginPath();
  for (let i = 0; i < out.length; i++) { const q = out[i], k = F / q[2], x = SCX + q[0] * k, y = SCY - q[1] * k; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
  c.closePath(); if (!pathOnly) { c.fillStyle = fill; c.fill(); }
}
const gq = (c, x0, z0, x1, z1, fill, y = 0) => worldPoly(c, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill);

// box oriented by heading (hx,hz); returns nothing, grows the bbox
const BXp = new Float64Array(8), BYp = new Float64Array(8);
function box(x, z, hx, hz, len, wid, y0, y1, col, t, topCol) {
  const rx = hz, rz = -hx, a = len / 2, b = wid / 2;
  const sa = [a, a, -a, -a], sb = [b, -b, -b, b];
  for (let i = 0; i < 8; i++) {
    const yy = i < 4 ? y0 : y1, ca = sa[i & 3], cb = sb[i & 3];
    if (!pj(x + hx * ca + rx * cb, yy, z + hz * ca + rz * cb)) return false; BXp[i] = PX; BYp[i] = PY; bbAdd(PX, PY);
  }
  const tx = CAMX - x, tz = CAMZ - z;
  const dh = hx * tx + hz * tz, dr = rx * tx + rz * tz;
  const face = (i0, i1, i2, i3, nx, nz) => { C.beginPath(); C.moveTo(BXp[i0], BYp[i0]); C.lineTo(BXp[i1], BYp[i1]); C.lineTo(BXp[i2], BYp[i2]); C.lineTo(BXp[i3], BYp[i3]); C.closePath(); C.fillStyle = tn(col, faceK(nx, nz), t); C.fill(); };
  if (dh > 0) face(0, 1, 5, 4, hx, hz); else face(3, 2, 6, 7, -hx, -hz);
  if (dr > 0) face(0, 3, 7, 4, rx, rz); else face(1, 2, 6, 5, -rx, -rz);
  C.beginPath(); C.moveTo(BXp[4], BYp[4]); C.lineTo(BXp[5], BYp[5]); C.lineTo(BXp[6], BYp[6]); C.lineTo(BXp[7], BYp[7]); C.closePath(); C.fillStyle = tn(topCol || col, topK(), t); C.fill();
  return true;
}
// a patch on a vertical face: along fixed, lateral l0..l1, height y0..y1; returns corners in PQ
const PQ = new Float64Array(8);
function facePatch(x, z, hx, hz, along, l0, l1, y0, y1) {
  const rx = hz, rz = -hx;
  if (!pj(x + hx * along + rx * l0, y1, z + hz * along + rz * l0)) return false; PQ[0] = PX; PQ[1] = PY;
  if (!pj(x + hx * along + rx * l1, y1, z + hz * along + rz * l1)) return false; PQ[2] = PX; PQ[3] = PY;
  if (!pj(x + hx * along + rx * l1, y0, z + hz * along + rz * l1)) return false; PQ[4] = PX; PQ[5] = PY;
  if (!pj(x + hx * along + rx * l0, y0, z + hz * along + rz * l0)) return false; PQ[6] = PX; PQ[7] = PY;
  return true;
}
function fillPQ(fill) { C.beginPath(); C.moveTo(PQ[0], PQ[1]); C.lineTo(PQ[2], PQ[3]); C.lineTo(PQ[4], PQ[5]); C.lineTo(PQ[6], PQ[7]); C.closePath(); C.fillStyle = fill; C.fill(); }
// side patch (along a0..a1 on the side at lat), visible face of the box
function sidePatch(x, z, hx, hz, lat, a0, a1, y0, y1) {
  const rx = hz, rz = -hx;
  if (!pj(x + hx * a0 + rx * lat, y1, z + hz * a0 + rz * lat)) return false; PQ[0] = PX; PQ[1] = PY;
  if (!pj(x + hx * a1 + rx * lat, y1, z + hz * a1 + rz * lat)) return false; PQ[2] = PX; PQ[3] = PY;
  if (!pj(x + hx * a1 + rx * lat, y0, z + hz * a1 + rz * lat)) return false; PQ[4] = PX; PQ[5] = PY;
  if (!pj(x + hx * a0 + rx * lat, y0, z + hz * a0 + rz * lat)) return false; PQ[6] = PX; PQ[7] = PY;
  return true;
}
// text on a quad held in PQ (corners TL,TR,BR,BL), left-to-right on screen
function quadText(text, col, font, wFrac, bold) {
  let ax = PQ[0], ay = PQ[1], bx = PQ[2], by = PQ[3], dx = PQ[6], dy = PQ[7];
  if (bx < ax) { ax = PQ[2]; ay = PQ[3]; bx = PQ[0]; by = PQ[1]; dx = PQ[4]; dy = PQ[5]; }
  const w = Math.hypot(bx - ax, by - ay), h = Math.hypot(dx - ax, dy - ay); if (w < 6 || h < 3.5) return;
  C.save(); C.transform((bx - ax) / w, (by - ay) / w, (dx - ax) / h, (dy - ay) / h, ax, ay);
  C.fillStyle = col; C.textAlign = 'center'; C.textBaseline = 'middle'; C.font = (bold ? '700 ' : '600 ') + Math.max(3, h * 0.66) + 'px ' + FONT;
  C.fillText(text, w / 2, h * 0.54, w * wFrac); C.restore();
}

// ---------- static scene ----------
function wpj(w, u, y, out, sg) { const x = w.ax === 0 ? w.c + w.nrm * out : u, z = w.ax === 0 ? u : w.c + w.nrm * out; return pj(x, y * sg, z); }
function wquad(w, p, fill, sg) { // p: [u,y,out]*4
  for (let i = 0; i < 4; i++) { if (!wpj(w, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], sg)) return false; PQ[i * 2] = PX; PQ[i * 2 + 1] = PY; }
  fillPQ(fill); return true;
}
const WQ = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
function wr(w, ua, ya, ub, yb, out, fill, sg) { WQ[0] = ua; WQ[1] = ya; WQ[2] = out; WQ[3] = ub; WQ[4] = ya; WQ[5] = out; WQ[6] = ub; WQ[7] = yb; WQ[8] = out; WQ[9] = ua; WQ[10] = yb; WQ[11] = out; return wquad(w, WQ, fill, sg); }

function drawUnit(w, un, sg, mir) {
  const um = (un.u0 + un.u1) / 2;
  const cx = w.ax === 0 ? w.c : um, cz = w.ax === 0 ? um : w.c; const d = Math.hypot(cx - CAMX, cz - CAMZ);
  const t = T_OF(d), wd = un.u1 - un.u0, night = LK.night > 0.55;
  const nx = w.ax === 0 ? w.nrm : 0, nz = w.ax === 0 ? 0 : w.nrm;
  const k = faceK(nx, nz); const fine = d < 70;
  const toneC = un.tone;
  wr(w, un.u0, 0, un.u1, un.h, 0, tn(toneC, k, t), sg);
  // slab lines and parapet
  const slab = tn([toneC[0] * 0.78, toneC[1] * 0.78, toneC[2] * 0.78], k, t);
  for (let f = 1; f <= un.floors; f++) { const y = f === 1 ? 3.6 : 3.6 + (f - 1) * 3.1 - 0.1; wr(w, un.u0, y, un.u1, y + 0.22, 0.04, slab, sg); }
  wr(w, un.u0 - 0.05, un.h - 0.5, un.u1 + 0.05, un.h, 0.15, tn([toneC[0] * 0.9, toneC[1] * 0.9, toneC[2] * 0.9], k, t), sg);
  if (d > 95) return;
  // shop front
  const m = 0.25;
  if (un.open) {
    const inside = night ? [255, 226, 160] : [58, 46, 40];
    wr(w, un.u0 + m, 0, un.u1 - m, 3.0, 0.02, night ? te(inside, t) : tn(inside, 1, t), sg);
    if (fine) for (let i = 0; i < 6; i++) { const ua = un.u0 + m + 0.1 + i * (wd - 2 * m - 0.2) / 6; wr(w, ua, 0.4 + (i % 3) * 0.35, ua + (wd - 2 * m - 0.2) / 6 - 0.1, 1.0 + (i % 3) * 0.35, 0.05, night ? te(un.goods[i], t) : tn(un.goods[i], 1, t), sg); }
  } else {
    wr(w, un.u0 + m, 0, un.u1 - m, 3.0, 0.02, tn([156, 160, 158], k, t), sg);
    if (fine) for (let i = 0; i < 6; i++) wr(w, un.u0 + m, 0.4 + i * 0.45, un.u1 - m, 0.46 + i * 0.45, 0.04, tn([120, 124, 122], k, t), sg);
  }
  // upper floors
  for (let f = 1; f < un.floors; f++) {
    const y0 = 3.6 + (f - 1) * 3.1 + 0.55;
    for (let j = 0; j < 2; j++) {
      const ua = un.u0 + wd * (j ? 0.56 : 0.14), ub = un.u0 + wd * (j ? 0.86 : 0.44);
      const li = (f * 2 + j) % 12; const lit = night && un.lit[li];
      let wc; if (lit) wc = un.tv[li] ? te([150, 190, 255], t) : te([255, 214, 140], t); else wc = tn(night ? [18, 24, 34] : [64, 82, 100], 1, t);
      wr(w, ua - 0.08, y0 - 0.08, ub + 0.08, y0 + 1.78, 0.03, tn([toneC[0] * 0.55, toneC[1] * 0.55, toneC[2] * 0.55], k, t), sg);
      wr(w, ua, y0, ub, y0 + 1.7, 0.05, wc, sg);
      if (!lit && fine && ((f + j + (un.v * 7 | 0)) % 3 === 0)) { wr(w, ua, y0, ua + (ub - ua) * 0.45, y0 + 1.7, 0.08, tn(un.shut, k, t), sg); wr(w, ub - (ub - ua) * 0.45, y0, ub, y0 + 1.7, 0.08, tn(un.shut, k, t), sg); }
    }
    if (fine && un.bal[f % 5]) { wr(w, un.u0 + 0.2, y0 - 0.5, un.u1 - 0.2, y0 - 0.3, 0.9, slab, sg); wr(w, un.u0 + 0.2, y0 - 0.3, un.u1 - 0.2, y0 + 0.6, 0.9, tn([40, 44, 48], 1, t) , sg); wr(w, un.u0 + 0.25, y0 - 0.25, un.u1 - 0.25, y0 + 0.55, 0.9, tn([toneC[0] * 0.8, toneC[1] * 0.8, toneC[2] * 0.8], k, t), sg); }
  }
  if (fine && un.ac) wr(w, un.u0 + wd * 0.3, 6.1, un.u0 + wd * 0.3 + 0.8, 6.7, 0.5, tn([196, 196, 190], k, t), sg);
  // sign board, above the awning
  if (un.sign) {
    const s = un.sign, lit = night; const col = lit ? te(s.bg.map((v) => v * 0.95), t) : tn(s.bg, k, t);
    wr(w, un.u0 + 0.2, 3.25, un.u1 - 0.2, 4.4, 0.18, col, sg);
    if (!mir && fine) {
      for (let i = 0; i < 4; i++) { WQ[0] = un.u0 + 0.2; WQ[1] = 4.4; WQ[2] = 0.18; WQ[3] = un.u1 - 0.2; WQ[4] = 4.4; WQ[5] = 0.18; WQ[6] = un.u1 - 0.2; WQ[7] = 3.25; WQ[8] = 0.18; WQ[9] = un.u0 + 0.2; WQ[10] = 3.25; WQ[11] = 0.18; }
      let ok = true; for (let i = 0; i < 4; i++) { if (!wpj(w, WQ[i * 3], WQ[i * 3 + 1], WQ[i * 3 + 2], 1)) ok = false; PQ[i * 2] = PX; PQ[i * 2 + 1] = PY; }
      const dark = (s.bg[0] + s.bg[1] + s.bg[2]) > 500; const tc = dark ? [20, 24, 40] : [255, 248, 232];
      if (ok) quadText(s.text, lit ? te(tc, t) : tn(tc, 1, t), '', 0.9, true);
    }
    if (lit && !mir) { const zc = wpj(w, um, 3.85, 0.4, 1); if (zc) gl(s.bg[0] > 200 && s.bg[1] < 120 ? 1 : s.bg[2] > 140 && s.bg[0] < 100 ? 6 : 0, PX, PY, (wd + 2) * F / zc * 0.9, 0.35 * t, 0.7); }
  }
  // awning
  if (un.awn) {
    const a = un.awn;
    for (let i = 0; i < 4; i++) {
      const ua = un.u0 + 0.1 + (wd - 0.2) * i / 4, ub = un.u0 + 0.1 + (wd - 0.2) * (i + 1) / 4;
      const c = i % 2 ? [Math.min(255, a[0] * 0.3 + 180), Math.min(255, a[1] * 0.3 + 180), Math.min(255, a[2] * 0.3 + 180)] : a;
      WQ[0] = ua; WQ[1] = 3.15; WQ[2] = 0.05; WQ[3] = ub; WQ[4] = 3.15; WQ[5] = 0.05; WQ[6] = ub; WQ[7] = 2.65; WQ[8] = 1.5; WQ[9] = ua; WQ[10] = 2.65; WQ[11] = 1.5;
      wquad(w, WQ, tn(c, topK() * 0.95, t), sg);
      WQ[0] = ua; WQ[1] = 2.65; WQ[2] = 1.5; WQ[3] = ub; WQ[4] = 2.65; WQ[5] = 1.5; WQ[6] = ub; WQ[7] = 2.35; WQ[8] = 1.5; WQ[9] = ua; WQ[10] = 2.35; WQ[11] = 1.5;
      wquad(w, WQ, tn(c, k * 0.85, t), sg);
    }
  }
  // night: warm spill on the pavement
  if (night && un.open && !mir) { const zc = wpj(w, um, 0, 2.2, 1); if (zc) gl(0, PX, PY, wd * 0.8 * F / zc, 0.30 * t, 0.32); }
}

function drawTree(tr, mir) {
  const d = Math.hypot(tr.x - CAMX, tr.z - CAMZ), t = T_OF(d); const sg = mir ? -1 : 1;
  const zc = pj(tr.x, 0, tr.z); if (!zc) return; const k = F / zc; const bx = PX, by = PY;
  pj(tr.x, tr.h * 0.62 * sg, tr.z); const ty = PY;
  C.strokeStyle = tn([62, 48, 38], 0.9, t); C.lineWidth = Math.max(1, 0.34 * k); C.lineCap = 'round'; C.beginPath(); C.moveTo(bx, by); C.lineTo(bx, ty); C.stroke();
  const rnd = mulberry32(tr.seed); const cy = by + (ty - by) * 1.12; const R = tr.s * 2.3 * k;
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, rr = rnd() * R * 0.7, ox = Math.cos(a) * rr, oy = Math.sin(a) * rr * 0.55 - R * 0.15;
    const hi = clamp(0.8 + (-oy / R) * 0.7 - ox / R * 0.15 * (LK.sx > 0 ? 1 : -1), 0.5, 1.3);
    const g = [52 * hi, 108 * hi, 54 * hi]; C.beginPath(); C.arc(bx + ox, cy + oy, R * (0.45 + rnd() * 0.25), 0, TAU); C.fillStyle = tn(g, 0.95, t); C.fill();
  }
}
function line3(x0, y0, z0, x1, y1, z1) { if (!pj(x0, y0, z0)) return false; const ax = PX, ay = PY; if (!pj(x1, y1, z1)) return false; C.moveTo(ax, ay); C.lineTo(PX, PY); return true; }
function cable(x0, y0, z0, x1, y1, z1, sag) {
  let first = true;
  for (let i = 0; i <= 8; i++) { const t = i / 8; if (!pj(lerp(x0, x1, t), lerp(y0, y1, t) - sag * 4 * t * (1 - t), lerp(z0, z1, t))) { first = true; continue; } if (first) { C.moveTo(PX, PY); first = false; } else C.lineTo(PX, PY); }
}
function drawPole(x, z, h, t, mir) {
  const sg = mir ? -1 : 1; const zc = pj(x, 0, z); if (!zc) return; const k = F / zc, bx = PX, by = PY; pj(x, h * sg, z);
  C.strokeStyle = tn([112, 112, 108], 0.9, t); C.lineWidth = Math.max(1, 0.22 * k); C.lineCap = 'butt'; C.beginPath(); C.moveTo(bx, by); C.lineTo(PX, PY); C.stroke();
}

function drawStatic(W, Wd, mk) {
  const c = C; const WW = c.canvas.width, HH = c.canvas.height;
  // sky
  const g = c.createLinearGradient(0, 0, 0, HORY + 2); g.addColorStop(0, rgb(...LK.skyTop)); g.addColorStop(0.62, rgb(...LK.skyMid)); g.addColorStop(1, rgb(...LK.fog));
  c.fillStyle = g; c.fillRect(0, 0, WW, HH);
  for (const cl of Wd.clouds) { const x = cl.x * WW, y = cl.y * HORY * 0.9, r = cl.s * WW; const gg = c.createRadialGradient(x, y, 0, x, y, r); const cc = LK.sun > 0.2 ? '255,255,255' : LK.tw > 0.3 ? '255,170,120' : '120,100,120'; gg.addColorStop(0, `rgba(${cc},${(0.10 + LK.oc * 0.3 + LK.tw * 0.08).toFixed(3)})`); gg.addColorStop(1, `rgba(${cc},0)`); c.fillStyle = gg; c.fillRect(x - r, y - r, r * 2, r * 2); }
  // skyline
  for (const s of Wd.skyline) {
    const bx = CAMX + FX * s.dist / Math.hypot(FX, FZ) * 1 + RX * Math.tan(s.ang) * s.dist, bz = CAMZ + FZ * s.dist / Math.hypot(FX, FZ) + RZ * Math.tan(s.ang) * s.dist;
    if (!pj(bx, 0, bz)) continue; const x0 = PX, y0 = PY, k = F / (Math.hypot(bx - CAMX, bz - CAMZ)); pj(bx, s.h, bz); const y1 = PY; const w = s.w * k;
    const tt = T_OF(s.dist); c.fillStyle = tn([96, 106, 124], 0.9, tt); c.fillRect(x0 - w / 2, y1, w, y0 - y1 + 2);
    if (LK.night > 0.5) { const n = 18; for (let i = 0; i < n; i++) { if (hf(Math.floor(s.seed * 1000), i) < 0.55) { c.fillStyle = te([255, 214, 150], tt * 0.8); c.fillRect(x0 - w / 2 + hf(i, 3) * w * 0.9, y1 + hf(i, 5) * (y0 - y1) * 0.9, Math.max(1, w * 0.06), Math.max(1, w * 0.05)); } } if (s.h > 120) { c.fillStyle = te([255, 60, 50], tt); c.fillRect(x0, y1 - 2 * CS, 2 * CS, 2 * CS); } }
  }
  // ground
  const BRK = [-40, -20, -10, -4, 0, 4, 8, 12, 16, 20, 25, 30, 36, 42, 50, 60, 72, 86, 104, 130, 170, 230, 320, 480, 760];
  const wet = LK.wet, cov = LK.cover;
  const asph = [84, 86, 92], pav = [158, 150, 138], kerb = [200, 194, 180], mark = [236, 233, 218];
  const gcol = (base, x, z, kind) => {
    const hd = Math.hypot(x - CAMX, z - CAMZ), d = Math.hypot(hd, CAMY), t = T_OF(d);
    const dark = kind === 0 ? 1 - 0.42 * wet : kind === 1 ? 1 - 0.2 * wet : 1 - 0.1 * wet;
    let refl = kind === 0 ? wet * (0.10 + 0.55 * sm(hd / 55)) + cov * 0.45 : kind === 1 ? wet * (0.06 + 0.3 * sm(hd / 60)) + cov * 0.25 : wet * 0.1 + cov * 0.3;
    refl = clamp(refl, 0, 0.9); const a = LK.amb, f = LK.fog, sm_ = LK.skyMid;
    const kk = kind === 2 ? 1 : 0.92;
    const r = (base[0] * dark * a[0] * kk * (1 - refl) + sm_[0] * refl) * t + f[0] * (1 - t), gg = (base[1] * dark * a[1] * kk * (1 - refl) + sm_[1] * refl) * t + f[1] * (1 - t), b = (base[2] * dark * a[2] * kk * (1 - refl) + sm_[2] * refl) * t + f[2] * (1 - t);
    return rgb(r, gg, b);
  };
  const strip = (ax, c0, c1, base, kind) => { // ax 0: along z, x in [c0,c1]; ax 1: along x, z in [c0,c1]
    for (let i = 0; i < BRK.length - 1; i++) { const a = BRK[i], b = BRK[i + 1], m = (a + b) / 2; const mx = ax === 0 ? (c0 + c1) / 2 : m, mz = ax === 0 ? m : (c0 + c1) / 2; const col = gcol(base, mx, mz, kind); if (ax === 0) gq(c, c0, a, c1, b + 0.05, col); else gq(c, a, c0, b + 0.05, c1, col); }
  };
  // base earth beyond the building line, then pavements, roads
  strip(0, -X0, X0, pav, 2); strip(1, -X0, X0, pav, 2);
  strip(0, -RW, RW, asph, 0); strip(1, -RW, RW, asph, 0);
  // kerbs
  for (const s of [-1, 1]) { strip(0, s > 0 ? RW : -RW - 0.28, s > 0 ? RW + 0.28 : -RW, kerb, 2); strip(1, s > 0 ? RW : -RW - 0.28, s > 0 ? RW + 0.28 : -RW, kerb, 2); }
  // junction box, slightly different asphalt
  gq(c, -RW, -RW, RW, RW, gcol([78, 80, 86], 0, 0, 0));
  // dirt patches
  for (const p of Wd.dirt) { const e = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; e.push([p.x + Math.cos(a) * p.a, 0, p.z + Math.sin(a) * p.a * 0.8]); } worldPoly(c, e, `rgba(18,18,22,${0.10 + 0.05 * wet})`); }
  // markings
  const mc = (x, z) => gcol(mark, x, z, 1);
  for (let z = 14; z < 120; z += 6) { gq(c, -0.08, z, 0.08, z + 2.5, mc(0, z)); gq(c, -0.08 + 0, z, 0.08, z + 2.5, mc(0, z)); gq(c, z, -0.08, z + 2.5, 0.08, mc(z, 0)); gq(c, -0.08, -z - 2.5, 0.08, -z, mc(0, -z)); gq(c, -z - 2.5, -0.08, -z, 0.08, mc(-z, 0)); }
  for (let z = 14; z < 100; z += 7) for (const s of [-1, 1]) { gq(c, s * 3.3 - 0.05, z, s * 3.3 + 0.05, z + 2, mc(s * 3.3, z)); gq(c, z, s * 3.3 - 0.05, z + 2, s * 3.3 + 0.05, mc(z, s * 3.3)); gq(c, s * 3.3 - 0.05, -z - 2, s * 3.3 + 0.05, -z, mc(s * 3.3, -z)); gq(c, -z - 2, s * 3.3 - 0.05, -z, s * 3.3 + 0.05, mc(-z, s * 3.3)); }
  // stop lines and zebras
  for (const s of [-1, 1]) {
    gq(c, 0.2 * s, STOPD - 0.55, RW * s, STOPD - 0.15, mc(3 * s, STOPD)); gq(c, STOPD - 0.55, 0.2 * s, STOPD - 0.15, RW * s, mc(STOPD, 3 * s));
    gq(c, 0.2 * s, -STOPD + 0.15, RW * s, -STOPD + 0.55, mc(3 * s, -STOPD)); gq(c, -STOPD + 0.15, 0.2 * s, -STOPD + 0.55, RW * s, mc(-STOPD, 3 * s));
  }
  for (let i = -6; i <= 6; i++) { const a = i * 1.0 - 0.25, b = i * 1.0 + 0.25; gq(c, a, 7.1, b, 9.5, mc(i, 8.3)); gq(c, 7.1, a, 9.5, b, mc(8.3, i)); gq(c, a, -9.5, b, -7.1, mc(i, -8.3)); gq(c, -9.5, a, -7.1, b, mc(-8.3, i)); }
  // puddles and standing water
  if (cov > 0 || wet > 0.4) {
    const fillK = Math.max(cov * 1.3, wet * 0.18);
    for (const q of Wd.puddles) {
      if (q.rank > fillK) continue; const sc = 0.5 + 1.2 * cov + 0.4 * wet; const e = [];
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; e.push([clamp(q.x + Math.cos(a) * q.a * sc, -RW + 0.1, RW - 0.1 + (Math.abs(q.z) > 6.5 ? 0 : 0)), 0, q.z + Math.sin(a) * q.b * sc]); }
      const hd = Math.hypot(q.x - CAMX, q.z - CAMZ), t = T_OF(hd);
      const col = mix3(LK.skyMid, [30, 32, 40], 0.15 + 0.2 * (1 - cov)); const hz_ = sm(hd / 50);
      worldPoly(c, e, rgb(col[0] * t + LK.fog[0] * (1 - t), col[1] * t + LK.fog[1] * (1 - t), col[2] * t + LK.fog[2] * (1 - t)));
      if (cov < 0.45) { c.save(); c.globalAlpha = 0.22; c.strokeStyle = 'rgba(10,14,22,0.8)'; c.lineWidth = CS * 0.7; c.stroke(); c.restore(); }
    }
  }
  // wall reflections in the wet road
  if (wet > 0.3 || cov > 0.05) {
    c.save(); c.beginPath(); worldPoly(c, [[-RW, 0, -40], [RW, 0, -40], [RW, 0, 760], [-RW, 0, 760]], '', true); worldPoly(c, [[-40, 0, -RW], [760, 0, -RW], [760, 0, RW], [-40, 0, RW]], '', true); c.clip();
    c.globalAlpha = clamp(wet * 0.34 + cov * 0.4, 0, 0.7);
    const units = []; for (const w of Wd.walls) for (const un of w.units) { const um = (un.u0 + un.u1) / 2; units.push({ w, un, d: Math.hypot((w.ax === 0 ? w.c : um) - CAMX, (w.ax === 0 ? um : w.c) - CAMZ) }); }
    units.sort((a, b) => b.d - a.d); for (const q of units) if (q.d < 90) drawUnit(q.w, q.un, -1, true);
    for (const tr of Wd.trees) drawTree(tr, true);
    c.restore();
    // darken a little so the mirror reads as water
    c.save(); c.beginPath(); worldPoly(c, [[-RW, 0, -40], [RW, 0, -40], [RW, 0, 760], [-RW, 0, 760]], '', true); worldPoly(c, [[-40, 0, -RW], [760, 0, -RW], [760, 0, RW], [-40, 0, RW]], '', true); c.clip();
    c.restore();
  }
  // night: lamp pools, then mirrored glows later
  const lampsOn = LK.lamps;
  if (lampsOn) for (const [x, z] of Wd.lamps) {
    const zc = pj(x, 0, z); if (!zc) continue; const k = F / zc, ratio = CAMY / Math.hypot(Math.hypot(x - CAMX, z - CAMZ), CAMY);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (0.55 * LK.night + 0.1) * T_OF(zc); c.translate(PX, PY); c.scale(1, ratio * 0.9); c.drawImage(GL[5], -7.5 * k, -7.5 * k, 15 * k, 15 * k); c.restore();
  }
  // walls, far to near
  const units = []; for (const w of Wd.walls) for (const un of w.units) { const um = (un.u0 + un.u1) / 2; units.push({ w, un, d: Math.hypot((w.ax === 0 ? w.c : um) - CAMX, (w.ax === 0 ? um : w.c) - CAMZ) }); }
  units.sort((a, b) => b.d - a.d);
  for (const q of units) { if (q.d > 400) continue; drawUnit(q.w, q.un, 1, false); }
  // wall glows, mirrored on wet ground
  flushGlows();
  // street furniture, far to near
  const items = [];
  for (const tr of Wd.trees) items.push({ d: Math.hypot(tr.x - CAMX, tr.z - CAMZ), f: () => drawTree(tr, false) });
  for (const [x, z] of Wd.poles) items.push({ d: Math.hypot(x - CAMX, z - CAMZ), f: () => { const t = T_OF(Math.hypot(x - CAMX, z - CAMZ)); drawPole(x, z, 8.6, t, false); const ax = x > 0 ? 1 : x < -9 ? 1 : 0; } });
  for (const [x, z] of Wd.lamps) items.push({ d: Math.hypot(x - CAMX, z - CAMZ), f: () => drawLamp(x, z) });
  items.sort((a, b) => b.d - a.d); for (const it of items) it.f();
  drawCables(Wd); flushGlows();
  // parked scooters sit with the static picture
  // haze veil
  const hv = c.createLinearGradient(0, HORY - HH * 0.12, 0, HORY + HH * 0.08); const fa = LK.pmF * 0.18 + LK.oc * 0.1;
  hv.addColorStop(0, rgbA(LK.fog, 0)); hv.addColorStop(0.5, rgbA(LK.fog, fa)); hv.addColorStop(1, rgbA(LK.fog, 0)); c.fillStyle = hv; c.fillRect(0, HORY - HH * 0.12, WW, HH * 0.2);
}
function rgbA(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function drawLamp(x, z) {
  const d = Math.hypot(x - CAMX, z - CAMZ), t = T_OF(d); const zc = pj(x, 0, z); if (!zc) return; const k = F / zc, bx = PX, by = PY;
  const dx = x > 0 ? -1 : 1, dz = z > 0 && Math.abs(x) < Math.abs(z) ? 0 : 0;
  const ex = Math.abs(x) > Math.abs(z) ? 0 : dx * 2.2, ez = Math.abs(x) > Math.abs(z) ? (z > 0 ? -2.2 : 2.2) : 0;
  pj(x, 7.6, z); const tx = PX, ty = PY; pj(x + ex, 7.8, z + ez); const hx = PX, hy = PY;
  C.strokeStyle = tn([88, 92, 98], 0.9, t); C.lineWidth = Math.max(1, 0.16 * k); C.lineCap = 'round'; C.beginPath(); C.moveTo(bx, by); C.lineTo(tx, ty); C.lineTo(hx, hy); C.stroke();
  C.fillStyle = LK.lamps ? te([255, 226, 170], t) : tn([200, 204, 206], 1, t); C.beginPath(); C.ellipse(hx, hy + 0.1 * k, Math.max(1.2, 0.34 * k), Math.max(0.8, 0.14 * k), 0, 0, TAU); C.fill();
  if (LK.lamps) { gl(5, hx, hy, 2.8 * k, 0.8 * t * (0.4 + LK.night * 0.6), 1); gl(0, hx, hy, 0.7 * k, 0.9 * t, 1); if (LK.wet > 0.05 && pj(x + ex, -7.8, z + ez)) gl(5, PX, PY, 1.4 * k, 0.5 * LK.wet * t, 3.5); }
}
function drawCables(Wd) {
  const C_ = C; C_.lineCap = 'round'; C_.lineJoin = 'round';
  const bundle = (x0, z0, x1, z1, h0, n, sag, seed) => {
    const d = Math.hypot((x0 + x1) / 2 - CAMX, (z0 + z1) / 2 - CAMZ), t = T_OF(d);
    C_.strokeStyle = tn([46, 46, 52], 0.9, t); C_.lineWidth = Math.max(0.55 * CS, 0.012 * F / Math.max(3, d * 0.9)); C_.beginPath();
    for (let i = 0; i < Math.ceil(n * 0.6); i++) cable(x0, h0 + i * 0.28, z0 + (hf(seed, i) - 0.5) * 0.5, x1, h0 + i * 0.28 + (hf(seed, i, 2) - 0.5) * 0.3, z1 + (hf(seed, i, 1) - 0.5) * 0.5, sag * (0.8 + hf(seed, i, 3) * 0.5));
    C_.stroke();
  };
  const P = Wd.poles;
  for (let i = 0; i < P.length; i += 2) {
    const a = P[i], b = P[i + 1];
    if (Math.abs(a[0]) > 10) { const z = a[1]; bundle(-10.7, z, 10.7, z, 7.4, 5, 0.7, z * 3); } else { const x = a[0]; }
  }
  for (let z = 15; z < 130; z += 26) { bundle(10.7, z, 10.7, z + 26, 8.2, 4, 0.5, z); bundle(-10.7, z, -10.7, z + 26, 8.2, 4, 0.5, z + 1); bundle(z, 10.7, z + 26, 10.7, 8.2, 4, 0.5, z + 2); bundle(z, -10.7, z + 26, -10.7, 8.2, 4, 0.5, z + 3); if (((z / 26) | 0) % 2 === 0) { bundle(10.7, z, -10.7, z, 7.2, 4, 0.7, z + 4); bundle(z, 10.7, z, -10.7, 7.5, 4, 0.7, z + 5); } }
  bundle(10.7, 10.7, -10.7, 10.7, 6.4, 5, 0.6, 99); bundle(10.7, 10.7, 10.7, -10.7, 6.4, 5, 0.6, 98);
}

// ---------- people and vehicles ----------
function hexPath(x, y, r) { C.moveTo(x + r, y); for (let i = 1; i < 6; i++) C.lineTo(x + r * Math.cos(i * TAU / 6), y + r * Math.sin(i * TAU / 6)); C.closePath(); }
function hexCover(x, y, r) {
  const R = Math.max(2.2 * CS, r * 1.45);
  C.beginPath(); hexPath(x, y, R); C.fillStyle = 'rgba(110,84,238,0.95)'; C.fill(); C.lineWidth = Math.max(1, R * 0.13); C.strokeStyle = 'rgba(228,218,255,0.95)'; C.stroke();
  if (R > 5) { C.lineWidth = Math.max(0.7, R * 0.07); C.strokeStyle = 'rgba(190,172,255,0.9)'; C.beginPath(); hexPath(x, y, R * 0.5); C.stroke(); const hr = R * 0.5; for (let i = 0; i < 6; i++) { C.beginPath(); C.moveTo(x + hr * Math.cos(i * TAU / 6), y + hr * Math.sin(i * TAU / 6)); C.lineTo(x + R * Math.cos(i * TAU / 6), y + R * Math.sin(i * TAU / 6)); C.stroke(); } }
}
function amberMark(x, y, r) {
  C.save(); C.strokeStyle = 'rgba(255,176,32,0.98)'; C.lineWidth = Math.max(1.2, CS * 1.3); C.beginPath(); C.arc(x, y, Math.max(3 * CS, r * 1.7), 0, TAU); C.stroke();
  const my = y - Math.max(3 * CS, r * 1.7) - 5 * CS; C.fillStyle = 'rgba(255,176,32,1)'; C.beginPath(); C.moveTo(x, my + 4.2 * CS); C.lineTo(x - 3.4 * CS, my - 1.8 * CS); C.lineTo(x + 3.4 * CS, my - 1.8 * CS); C.closePath(); C.fill();
  C.fillStyle = '#1a1200'; C.fillRect(x - 0.45 * CS, my - 0.9 * CS, 0.9 * CS, 2.0 * CS); C.restore();
}
// head with optional helmet; facing = shows the face
function drawHead(x, y, z, o, facing, mode, t, hx, hz) {
  const zc = pj(x, y, z); if (!zc) return; const k = F / zc, r = o.r * k * 1.15, hxp = PX, hyp = PY; bbAdd(hxp - r, hyp - r * 1.6); bbAdd(hxp + r, hyp + r);
  const skin = tn(o.skin, 1.0, t), hair = tn(o.hair, 0.9, t);
  if (o.helm) {
    C.beginPath(); C.arc(hxp, hyp - r * 0.08, r * 1.12, 0, TAU); C.fillStyle = tn(o.helm, 1, t); C.fill();
    if (facing) { C.beginPath(); C.ellipse(hxp, hyp + r * 0.3, r * 0.74, r * 0.66, 0, 0, TAU); C.fillStyle = skin; C.fill(); }
  } else {
    C.beginPath(); C.arc(hxp, hyp, r, 0, TAU); C.fillStyle = facing ? skin : hair; C.fill();
    if (facing) { C.beginPath(); C.arc(hxp, hyp - r * 0.12, r * 1.03, Math.PI * 1.03, Math.PI * 1.97); C.fillStyle = hair; C.fill(); }
  }
  if (facing) {
    const fy = hyp + (o.helm ? r * 0.3 : 0.06 * r);
    if (r > 3.2) { C.fillStyle = tn([26, 22, 20], 1, t); C.beginPath(); C.arc(hxp - r * 0.32, fy - r * 0.05, Math.max(0.6, r * 0.1), 0, TAU); C.arc(hxp + r * 0.32, fy - r * 0.05, Math.max(0.6, r * 0.1), 0, TAU); C.fill(); if (r > 5) { C.strokeStyle = tn([120, 50, 44], 1, t); C.lineWidth = Math.max(0.6, r * 0.07); C.beginPath(); C.arc(hxp, fy + r * 0.18, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); C.stroke(); } }
    if (mode === 1) { if (o.missed) amberMark(hxp, fy, r); else hexCover(hxp, fy, r); }
  }
}
function plateDraw(text, mode, t, w) {
  const lw = Math.hypot(PQ[2] - PQ[0], PQ[3] - PQ[1]);
  if (mode === 1) { fillPQ('rgba(110,84,238,0.95)'); C.strokeStyle = 'rgba(228,218,255,0.95)'; C.lineWidth = Math.max(0.8, CS * 0.8); C.stroke(); if (lw > 8) { const cx = (PQ[0] + PQ[4]) / 2, cy = (PQ[1] + PQ[5]) / 2; C.lineWidth = Math.max(0.6, CS * 0.6); C.beginPath(); hexPath(cx, cy, Math.min(lw, Math.abs(PQ[7] - PQ[1]) * 3) * 0.22); C.stroke(); } return; }
  fillPQ(tn([244, 244, 236], 1.05, t)); C.strokeStyle = tn([30, 40, 90], 1, t); C.lineWidth = Math.max(0.5, CS * 0.5); C.stroke();
  if (lw > 15) quadText(text, tn([22, 30, 96], 1.1, t), '', 0.94, true);
}
function drawShadow(x, z, hx, hz, len, wid) {
  const rx = hz, rz = -hx, a = len / 2 + 0.15, b = wid / 2 + 0.15, pts = [[x + hx * a + rx * b, 0, z + hz * a + rz * b], [x + hx * a - rx * b, 0, z + hz * a - rz * b], [x - hx * a - rx * b, 0, z - hz * a - rz * b], [x - hx * a + rx * b, 0, z - hz * a + rz * b]];
  worldPoly(C, pts, 'rgba(0,0,0,' + (0.18 + 0.2 * LK.sun) + ')');
}
function lightAt(x, y, z, si, rw, a, t, reflect, sy) {
  if (!pj(x, y, z)) return; const k = F / (_zc(x, y, z));
  gl(si, PX, PY, rw * k, a * t, sy || 1);
  if (reflect > 0.05 && pj(x, -y, z)) gl(si, PX, PY, rw * k * 0.9, a * t * reflect * 0.6, 2.8);
}
function _zc(x, y, z) { return (x - CAMX) * FX + (y - CAMY) * FY + (z - CAMZ) * FZ; }

function drawMotoBody(v, x, z, hx, hz, t, front) {
  if (front) {
    const fx = x + hx * 0.62, fz = z + hz * 0.62;
    box(fx, fz, hx, hz, 0.35, 0.22, 0.32, 0.98, [34, 34, 40], t);
    box(fx - hx * 0.05, fz - hz * 0.05, hx, hz, 0.12, 0.62, 0.95, 1.04, [40, 40, 46], t);
    box(x + hx * 0.38, z + hz * 0.38, hx, hz, 0.4, 0.34, 0.5, 0.95, v.col, t);
  } else {
    box(x - hx * 0.08, z - hz * 0.08, hx, hz, 0.8, 0.34, 0.38, 0.8, v.col, t);
    box(x - hx * 0.62, z - hz * 0.62, hx, hz, 0.5, 0.3, 0.55, 0.72, [30, 30, 34], t);
  }
}
function wheel(x, z, t, k) { if (!pj(x, 0.3, z)) return; C.beginPath(); C.arc(PX, PY, 0.3 * (F / _zc(x, 0.3, z)), 0, TAU); C.fillStyle = tn([22, 22, 26], 1, t); C.fill(); bbAdd(PX - 0.3 * k, PY - 0.3 * k); }
function rider(v, o, x, z, hx, hz, t, facing, mode, zk) {
  const px = x + hx * o.along, pz = z + hz * o.along;
  const small = o.kid ? 0.7 : 1;
  if (o.role === 'rider' || o.role === 'pax') {
    box(px, pz, hx, hz, 0.46, 0.4, 0.42, 0.9, o.pants, t);
    box(px - hx * 0.02, pz - hz * 0.02, hx, hz, 0.3, 0.46 * small, 0.9, 0.9 + 0.58 * small, o.shirt, t);
    if (o.role === 'rider') box(px + hx * 0.34, pz + hz * 0.34, hx, hz, 0.45, 0.58, 1.02, 1.14, o.shirt, t);
  }
  drawHead(px, o.y * (o.kid ? 0.9 : 1), pz, o, facing, mode, t, hx, hz);
}
function drawVeh(v, mode, cullX0, cullX1) {
  const x = v.x, z = v.z, hx = v.hx, hz = v.hz;
  const zc = pj(x, 0.8, z); if (!zc || zc > 130) return; const k = F / zc, sx = PX;
  const mg = (v.L + 3) * k * 0.7; if (sx + mg < cullX0 || sx - mg > cullX1) return;
  const t = T_OF(zc); const tx = CAMX - x, tz = CAMZ - z, dl = Math.hypot(tx, tz) || 1; const fd = (hx * tx + hz * tz) / dl; const facing = fd > 0.12;
  bbReset(); drawShadow(x, z, hx, hz, v.L, v.W);
  const night = LK.lamps, wet = LK.wet;
  const kind = v.kind;
  if (kind === 0) {
    const back = !facing;
    wheel(x + hx * 0.62, z + hz * 0.62, t, k); wheel(x - hx * 0.6, z - hz * 0.6, t, k);
    const riders = v.occ;
    if (!back) { for (let i = riders.length - 1; i >= 1; i--) rider(v, riders[i], x, z, hx, hz, t, true, mode); drawMotoBody(v, x, z, hx, hz, t, false); rider(v, riders[0], x, z, hx, hz, t, true, mode); drawMotoBody(v, x, z, hx, hz, t, true); }
    else { drawMotoBody(v, x, z, hx, hz, t, true); drawMotoBody(v, x, z, hx, hz, t, false); rider(v, riders[0], x, z, hx, hz, t, false, mode); for (let i = 1; i < riders.length; i++) rider(v, riders[i], x, z, hx, hz, t, false, mode); }
    // plates
    const pa = facing ? 0.8 : -0.92;
    if (facePatch(x, z, hx, hz, pa, -0.15, 0.15, 0.42, 0.62)) plateDraw(v.plate, mode, t);
    motoLights(v, x, z, hx, hz, t, facing, night, wet, k);
  } else if (kind === 3) {
    // trailer behind a scooter
    const bx = x - hx * 1.2, bz = z - hz * 1.2;
    wheel(x + hx * 0.8, z + hz * 0.8, t, k);
    if (facing) { box(bx, bz, hx, hz, 1.8, 1.35, 0.3, 0.95, v.col, t); }
    drawTukFront(v, x, z, hx, hz, t, facing, mode);
    if (!facing) box(bx, bz, hx, hz, 1.8, 1.35, 0.3, 0.95, v.col, t);
    for (const o of v.occ) if (o.role === 'pax') { drawHead(x + hx * o.along + hz * o.lat, o.y, z + hz * o.along - hx * o.lat, o, facing, mode, t, hx, hz); }
    box(bx, bz, hx, hz, 2.0, 1.5, 1.9, 2.0, [v.col[0] * 0.8, v.col[1] * 0.8, v.col[2] * 0.8], t);
    for (const sgn of [-1, 1]) for (const al of [-0.85, 0.85]) box(bx + hx * al + hz * sgn * 0.68, bz + hz * al - hx * sgn * 0.68, hx, hz, 0.08, 0.08, 0.95, 1.95, [60, 60, 66], t);
    if (facePatch(x, z, hx, hz, facing ? 0.95 : -2.1, -0.16, 0.16, 0.45, 0.64)) plateDraw(v.plate, mode, t);
    tukLights(v, x, z, hx, hz, t, facing, night, wet, k);
  } else if (kind === 4 || kind === 5) {
    drawBig(v, x, z, hx, hz, t, facing, mode, k, night, wet);
  } else {
    drawCar(v, x, z, hx, hz, t, facing, mode, k, night, wet);
  }
  // wake in standing water
  if (mode === 0 || true) wake(v, x, z, hx, hz);
}
function wake(v, x, z, hx, hz) {
  if (LK.cover < 0.15 || v.v < 1.5) return; const rx = hz, rz = -hx, a = -v.L / 2, w = v.W / 2 + 0.2, len = 2.5 + v.v * 0.5, spread = 0.7 + LK.cover;
  worldPoly(C, [[x + hx * a + rx * w, 0, z + hz * a + rz * w], [x + hx * (a - len) + rx * (w + spread), 0, z + hz * (a - len) + rz * (w + spread)], [x + hx * (a - len) - rx * (w + spread), 0, z + hz * (a - len) - rz * (w + spread)], [x + hx * a - rx * w, 0, z + hz * a - rz * w]], `rgba(235,242,250,${0.10 + 0.16 * LK.cover})`);
}
function motoLights(v, x, z, hx, hz, t, facing, night, wet, k) {
  if (!(night || LK.wet > 0.6) && !v.braking) return;
  if (facing) { lightAt(x + hx * 0.7, 0.85, z + hz * 0.7, 0, 0.75, night ? 0.95 : 0.3, t, wet); if (night && v.id % 3 === 0) beam(x + hx * 0.8, z + hz * 0.8, hx, hz, 0.35, 1.6, 6, t); }
  else lightAt(x - hx * 0.95, 0.72, z - hz * 0.95, 1, v.braking ? 0.7 : 0.4, v.braking ? 0.95 : night ? 0.7 : 0.3, t, wet);
}
function tukLights(v, x, z, hx, hz, t, facing, night, wet, k) {
  if (!(night || LK.wet > 0.6) && !v.braking) return;
  if (facing) { lightAt(x + hx * 0.95, 0.85, z + hz * 0.95, 0, 0.8, night ? 0.95 : 0.3, t, wet); if (night) beam(x + hx * 1.0, z + hz * 1.0, hx, hz, 0.5, 2.0, 7, t); }
  else lightAt(x - hx * 2.1, 0.7, z - hz * 2.1, 1, v.braking ? 0.8 : 0.45, v.braking ? 0.95 : 0.7, t, wet);
}
function beam(x, z, hx, hz, w0, w1, len, t) {
  const rx = hz, rz = -hx; C.save(); C.globalCompositeOperation = 'lighter';
  worldPoly(C, [[x + rx * w0, 0, z + rz * w0], [x + hx * len + rx * w1, 0, z + hz * len + rz * w1], [x + hx * len - rx * w1, 0, z + hz * len - rz * w1], [x - rx * w0, 0, z - rz * w0]], `rgba(255,232,180,${(0.045 * LK.night * t).toFixed(3)})`); C.restore();
}
function drawTukFront(v, x, z, hx, hz, t, facing, mode) {
  const o = v.occ[0];
  if (facing) { drawMotoBody(v, x + hx * 0.2, z + hz * 0.2, hx, hz, t, false); rider(v, o, x + hx * 0.2, z + hz * 0.2, hx, hz, t, true, mode); drawMotoBody(v, x + hx * 0.2, z + hz * 0.2, hx, hz, t, true); }
  else { drawMotoBody(v, x + hx * 0.2, z + hz * 0.2, hx, hz, t, true); drawMotoBody(v, x + hx * 0.2, z + hz * 0.2, hx, hz, t, false); rider(v, o, x + hx * 0.2, z + hz * 0.2, hx, hz, t, false, mode); }
}
function drawCar(v, x, z, hx, hz, t, facing, mode, k, night, wet) {
  const suv = v.kind === 2; const body = v.col, glass = [38, 50, 66];
  const L = v.L, W = v.W, y1 = suv ? 1.15 : 0.95, ch = suv ? 1.75 : 1.5;
  // wheels
  for (const al of [1.35, -1.3]) for (const sd of [-1, 1]) { const wx = x + hx * al + hz * sd * (W / 2), wz = z + hz * al - hx * sd * (W / 2); if (pj(wx, 0.32, wz)) { C.beginPath(); C.arc(PX, PY, 0.32 * F / _zc(wx, 0.32, wz), 0, TAU); C.fillStyle = tn([20, 20, 24], 1, t); C.fill(); } }
  box(x, z, hx, hz, L, W, 0.28, y1, body, t);
  // cabin: set back; glass sides and windscreen
  const cx = x - hx * L * 0.06, cz = z - hz * L * 0.06;
  box(cx, cz, hx, hz, L * 0.5, W * 0.88, y1, ch, glass, t, body);
  // occupants seen through glass, sit in front of cabin front face
  if (facing) for (const o of v.occ) drawHead(x + hx * (L * 0.19 - 0.05) + hz * o.lat, o.y + (suv ? 0.15 : 0), z + hz * (L * 0.19 - 0.05) - hx * o.lat, o, true, mode, t, hx, hz);
  // lights, plate
  const fa = L / 2 + 0.02;
  const front = facing, along = front ? fa : -fa;
  if (facePatch(x, z, hx, hz, along, -0.27, 0.27, 0.4, 0.62)) plateDraw(v.plate, mode, t);
  const hl = front ? [0, 0.62] : [1, 0.7];
  for (const sd of [-1, 1]) {
    if (facePatch(x, z, hx, hz, along, sd * 0.55, sd * 0.78, 0.6, 0.76)) fillPQ(front ? (LK.lamps ? te([255, 244, 214], t) : tn([226, 228, 224], 1.1, t)) : (v.braking ? te([255, 40, 30], t) : tn([150, 24, 24], 1, t)));
    if (LK.lamps || wet > 0.6 || (!front && v.braking)) {
      const lx = x + hx * along * 1.01 + hz * sd * 0.66, lz = z + hz * along * 1.01 - hx * sd * 0.66;
      if (front) { lightAt(lx, 0.68, lz, 0, 0.95, LK.lamps ? 0.9 : 0.25, t, wet); } else lightAt(lx, 0.68, lz, 1, v.braking ? 0.9 : 0.5, v.braking ? 0.95 : LK.lamps ? 0.75 : 0.25, t, wet);
    }
  }
  if (front && LK.lamps) beam(x + hx * (L / 2 + 0.2), z + hz * (L / 2 + 0.2), hx, hz, 0.7, 2.2, 9, t);
}
function drawBig(v, x, z, hx, hz, t, facing, mode, k, night, wet) {
  const bus = v.kind === 4, L = v.L, W = v.W;
  for (const al of [L * 0.33, -L * 0.3]) for (const sd of [-1, 1]) { const wx = x + hx * al + hz * sd * (W / 2), wz = z + hz * al - hx * sd * (W / 2); if (pj(wx, 0.5, wz)) { C.beginPath(); C.arc(PX, PY, 0.5 * F / _zc(wx, 0.5, wz), 0, TAU); C.fillStyle = tn([18, 18, 22], 1, t); C.fill(); } }
  if (bus) {
    box(x, z, hx, hz, L, W, 0.45, 3.1, v.col, t);
    for (const sd of [-1, 1]) if (sidePatch(x, z, hx, hz, sd * (W / 2 + 0.01), -L / 2 + 0.6, L / 2 - 0.6, 1.5, 2.55)) fillPQ(tn([42, 58, 78], 1, t));
    for (const sd of [-1, 1]) if (sidePatch(x, z, hx, hz, sd * (W / 2 + 0.015), -L / 2, L / 2, 0.8, 1.15)) fillPQ(tn([40, 90, 170], 1, t));
    const al = facing ? L / 2 + 0.01 : -L / 2 - 0.01;
    if (facePatch(x, z, hx, hz, al, -W / 2 + 0.2, W / 2 - 0.2, 1.7, 2.7)) fillPQ(tn([42, 58, 78], 1, t));
  } else {
    const cabx = x + hx * L * 0.36, cabz = z + hz * L * 0.36;
    box(x - hx * L * 0.12, z - hz * L * 0.12, hx, hz, L * 0.72, W, 0.5, 2.4, v.col, t);
    box(cabx, cabz, hx, hz, L * 0.26, W * 0.94, 0.45, 2.2, [210, 210, 204], t);
    if (facing && facePatch(x, z, hx, hz, L / 2 + 0.01, -W / 2 + 0.25, W / 2 - 0.25, 1.3, 2.0)) fillPQ(tn([42, 58, 78], 1, t));
  }
  const al = facing ? L / 2 + 0.02 : -L / 2 - 0.02;
  if (facePatch(x, z, hx, hz, al, -0.3, 0.3, 0.55, 0.8)) plateDraw(v.plate, mode, t);
  for (const sd of [-1, 1]) {
    const lx = x + hx * al + hz * sd * (W / 2 - 0.35), lz = z + hz * al - hx * sd * (W / 2 - 0.35);
    if (facing) { if (LK.lamps || wet > 0.6) lightAt(lx, 0.8, lz, 0, 1.1, LK.lamps ? 0.9 : 0.3, t, wet); } else if (LK.lamps || v.braking || wet > 0.6) lightAt(lx, 0.9, lz, 1, v.braking ? 1.0 : 0.6, v.braking ? 0.95 : 0.7, t, wet);
  }
  if (facing && LK.lamps) beam(x + hx * (L / 2 + 0.2), z + hz * (L / 2 + 0.2), hx, hz, 1.0, 2.6, 10, t);
}
function drawPed(p, mode, cullX0, cullX1, rain) {
  const zc = pj(p.x, 0, p.z); if (!zc || zc > 100) return; const fx = PX, fy = PY, k = F / zc; const Hh = p.h * k;
  if (fx + Hh < cullX0 || fx - Hh > cullX1) return;
  const t = T_OF(zc), c = p.col; bbReset();
  const tx = CAMX - p.x, tz = CAMZ - p.z, dl = Math.hypot(tx, tz) || 1; const facing = (p.hx * tx + p.hz * tz) / dl > 0.1;
  const walk = p.waiting ? 0 : Math.sin(p.ph * 1.0) * 0.1 * Hh;
  C.fillStyle = 'rgba(0,0,0,0.22)'; C.beginPath(); C.ellipse(fx, fy, 0.3 * k, 0.1 * k, 0, 0, TAU); C.fill();
  const lw = 0.1 * Hh;
  C.fillStyle = tn(c.pants, 0.95, t); C.fillRect(fx - 0.11 * Hh + walk * 0.5 - lw / 2, fy - 0.5 * Hh, lw, 0.5 * Hh); C.fillRect(fx + 0.11 * Hh - walk * 0.5 - lw / 2, fy - 0.5 * Hh, lw, 0.5 * Hh);
  C.fillStyle = tn(c.shirt, 1, t); const tw = 0.3 * Hh; C.beginPath(); C.roundRect ? C.roundRect(fx - tw / 2, fy - 0.86 * Hh, tw, 0.4 * Hh, tw * 0.3) : C.rect(fx - tw / 2, fy - 0.86 * Hh, tw, 0.4 * Hh); C.fill();
  C.strokeStyle = tn(c.shirt, 0.85, t); C.lineWidth = Math.max(1, 0.07 * Hh); C.beginPath(); C.moveTo(fx - tw / 2, fy - 0.82 * Hh); C.lineTo(fx - tw / 2 - walk * 0.4, fy - 0.55 * Hh); C.moveTo(fx + tw / 2, fy - 0.82 * Hh); C.lineTo(fx + tw / 2 + walk * 0.4, fy - 0.55 * Hh); C.stroke();
  if (p.bag) { C.fillStyle = tn([60, 50, 44], 1, t); C.fillRect(fx + (facing ? -1 : 1) * tw * 0.55, fy - 0.62 * Hh, 0.14 * Hh, 0.18 * Hh); }
  bbAdd(fx - 0.2 * Hh, fy - 1.0 * Hh); bbAdd(fx + 0.2 * Hh, fy);
  const o = { r: 0.12, skin: c.skin, hair: c.hair, helm: null, missed: p.missed };
  if (p.hat) { o.helm = [210, 190, 120]; }
  const hy = fy - 0.94 * Hh; const r = 0.12 / p.h * Hh * 1.15;
  // head drawn in screen space using the same routine via world coords
  drawHead(p.x, p.h * 0.94, p.z, o, facing, mode, t, p.hx, p.hz);
  if (p.umb && rain > 0.5) {
    const uy = fy - 1.1 * Hh, ur = 0.5 * Hh * 0.9; C.strokeStyle = tn([60, 60, 66], 1, t); C.lineWidth = Math.max(0.8, 0.02 * Hh); C.beginPath(); C.moveTo(fx, fy - 0.8 * Hh); C.lineTo(fx, uy); C.stroke();
    C.beginPath(); C.ellipse(fx, uy, ur, ur * 0.42, 0, Math.PI, TAU); C.closePath(); C.fillStyle = tn(c.umb, 1.05, t); C.fill(); bbAdd(fx - ur, uy - ur * 0.42);
  }
}
function drawParked(m, mode, cullX0, cullX1) {
  const zc = pj(m.x, 0.5, m.z); if (!zc || zc > 90) return; if (PX < cullX0 - 60 || PX > cullX1 + 60) return; const t = T_OF(zc), k = F / zc;
  bbReset(); const v = { col: m.col, occ: [] }; drawShadow(m.x, m.z, m.hx, m.hz, 1.8, 0.6);
  wheel(m.x + m.hx * 0.62, m.z + m.hz * 0.62, t, k); wheel(m.x - m.hx * 0.6, m.z - m.hz * 0.6, t, k);
  const tx = CAMX - m.x, tz = CAMZ - m.z, facing = (m.hx * tx + m.hz * tz) > 0;
  if (facing) { drawMotoBody(v, m.x, m.z, m.hx, m.hz, t, false); drawMotoBody(v, m.x, m.z, m.hx, m.hz, t, true); } else { drawMotoBody(v, m.x, m.z, m.hx, m.hz, t, true); drawMotoBody(v, m.x, m.z, m.hx, m.hz, t, false); }
  const pa = facing ? 0.8 : -0.92; if (facePatch(m.x, m.z, m.hx, m.hz, pa, -0.15, 0.15, 0.42, 0.62)) plateDraw(m.plate || '1A-0000', mode, t);
}
function drawCart(m, mode, cullX0, cullX1, tsec) {
  const zc = pj(m.x, 0.5, m.z); if (!zc || zc > 90) return; if (PX < cullX0 - 80 || PX > cullX1 + 80) return; const t = T_OF(zc), k = F / zc; bbReset();
  drawShadow(m.x, m.z, 1, 0, 1.7, 0.9);
  box(m.x, m.z, 1, 0, 1.6, 0.8, 0.35, 0.95, [150, 150, 146], t, [200, 200, 196]);
  box(m.x, m.z, 1, 0, 1.5, 0.7, 0.95, 1.4, [190, 220, 230], t, [230, 240, 246]);
  for (const sx of [-0.6, 0.6]) wheel(m.x + sx, m.z, t, k);
  // umbrella
  pj(m.x, 2.7, m.z); const ux = PX, uy = PY; pj(m.x, 1.1, m.z); C.strokeStyle = tn([70, 70, 74], 1, t); C.lineWidth = Math.max(1, 0.05 * k); C.beginPath(); C.moveTo(PX, PY); C.lineTo(ux, uy); C.stroke();
  C.beginPath(); C.ellipse(ux, uy + 0.05 * k, 1.5 * k, 0.55 * k, 0, Math.PI, TAU); C.closePath(); C.fillStyle = tn([232, 70, 54], 1.05, t); C.fill();
  for (let i = -2; i <= 2; i += 2) { C.beginPath(); C.moveTo(ux + i * 0.3 * k, uy - 0.5 * k); C.lineTo(ux + (i + 1) * 0.3 * k, uy - 0.5 * k); C.lineTo(ux + (i + 0.5) * 0.4 * k, uy + 0.05 * k); C.fillStyle = tn([250, 240, 220], 1.05, t); C.fill(); }
  if (LK.lamps) { lightAt(m.x, 2.3, m.z, 0, 2.2, 0.8, t, LK.wet); lightAt(m.x, 1.0, m.z - 0.3, 2, 1.2, 0.6, t, 0); }
  // steam
  C.save(); C.globalAlpha = 0.3 * t; C.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const ph = ((tsec * 0.6 + i / 3) % 1); pj(m.x - 0.3 + i * 0.3, 1.5 + ph * 1.1, m.z); C.globalAlpha = 0.3 * (1 - ph) * t; C.beginPath(); C.arc(PX, PY, (0.12 + ph * 0.2) * k, 0, TAU); C.fill(); } C.restore();
  // vendor
  const vd = { x: m.x, z: m.z + 0.9, hx: 0, hz: -1, h: 1.55, col: m.vc, ph: 0, waiting: true, bag: false, umb: false, missed: false, hat: true };
  drawPed(vd, mode, cullX0, cullX1);
}

function drawSignals(S, mode, cullX0, cullX1) {
  const ph = S.ph;
  const heads = [[7.6, 7.6, 0, -1, 'ns'], [7.6, 7.6, -1, 0, 'ew'], [-7.6, 7.6, 0, -1, 'ns'], [7.6, -7.6, -1, 0, 'ew']];
  const poles = [[7.6, 7.6], [-7.6, 7.6], [7.6, -7.6]];
  for (const [x, z] of poles) { const t = T_OF(Math.hypot(x - CAMX, z - CAMZ)); drawPole(x, z, 6.1, t, false); }
  for (const [x, z, nx, nz, g] of heads) {
    const t = T_OF(Math.hypot(x - CAMX, z - CAMZ)); const hx = -nz, hz = nx; // box heading along the face's tangent
    box(x + nx * 0.15, z + nz * 0.15, nx || 1, nz || 0, nx ? 0.35 : 0.35, 0.42, 4.5, 5.8, [26, 28, 32], t);
    const st = ph[g]; const cols = [[st === 'red', [255, 50, 40], 1], [st === 'amber', [255, 176, 40], 2], [st === 'green', [60, 255, 120], 3]];
    for (let i = 0; i < 3; i++) {
      const [on, cc, si] = cols[i]; const lx = x + nx * 0.34, lz = z + nz * 0.34, ly = 5.5 - i * 0.38;
      if (!pj(lx, ly, lz)) continue; const kk = F / _zc(lx, ly, lz);
      C.beginPath(); C.arc(PX, PY, 0.14 * kk, 0, TAU); C.fillStyle = on ? te(cc, t) : tn(cc.map((v) => v * 0.16), 1, t); C.fill();
      if (on) { gl(si === 1 ? 1 : si === 2 ? 2 : 3, PX, PY, 0.9 * kk + 5 * CS, 0.95 * t, 1); if (LK.wet > 0.05 && pj(lx, -ly, lz)) gl(si === 1 ? 1 : si === 2 ? 2 : 3, PX, PY, 0.8 * kk, 0.5 * LK.wet * t, 4); }
    }
  }
}

// ---------- the instance ----------
export function createStreetView(canvas, { seed = 1, node = 'J-01', lang = 'en', makeCanvas } = {}) {
  const mk = makeCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const world = makeWorld(seed);
  const S = makeSim(seed);
  const P = { minute: 0, volume: 40, rain: 0, water: 0, pm25: 20, divider: 0.5, still: false, lang };
  let ctx = null, sc = null, sctx = null, lens = null, W = 0, H = 0, look = null, bakeKey = '', running = false, raf = 0, last = 0, warmed = false, destroyed = false;
  let tally = { faces: 0, missed: 0 }, ffAt = 0, ffVol = null, ffDue = false;
  const rainRnd = new Float32Array(3 * 320); { const r = mulberry32(hash(seed, 99)); for (let i = 0; i < rainRnd.length; i++) rainRnd[i] = r(); }
  const carts = [{ t: 'cart', x: 21.5, z: 9.9, vc: { skin: SKIN[1], shirt: [236, 236, 228], pants: PANTS[0], hair: HAIR[0] } }];
  const idle = [{ x: 20.2, z: 9.5 }, { x: 22.9, z: 9.6 }].map((q, i) => ({ t: 'ped', x: q.x, z: q.z, hx: i ? -0.4 : 0.5, hz: -0.8, h: 1.6, col: pedColors(mulberry32(seed + i * 17)), ph: i * 2, waiting: true, bag: false, umb: false, missed: i === 1, key: 0, hat: false, a: 0, nodes: [], onRoad: false }));
  const parked = world.parked.map((m, i) => ({ ...m, plate: `${1 + (i % 3)}${'ABCDEFGH'[i % 8]}-${2100 + i * 377}` }));

  function getCtx() { if (!ctx) { ctx = canvas.getContext('2d'); } return ctx; }
  function ensureSprites() {
    if (GL.length) return; const defs = ['255,244,214', '255,50,36', '255,176,40', '70,255,130', '200,226,255', '255,196,110', '90,220,255'];
    GL = defs.map((cc) => { const s = mk(64, 64), g = s.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${cc},1)`); gr.addColorStop(0.16, `rgba(${cc},0.6)`); gr.addColorStop(0.5, `rgba(${cc},0.14)`); gr.addColorStop(1, `rgba(${cc},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return s; });
  }
  function csScale() { return canvas.clientWidth ? canvas.width / canvas.clientWidth : 1; }
  function resize() {
    W = canvas.width; H = canvas.height; if (!W || !H) return;
    sc = mk(W, H); sctx = sc.getContext('2d'); bakeKey = '';
    lens = mk(W, H); const g = lens.getContext('2d'); const gr = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.hypot(W, H) * 0.62); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.42)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.05)'; const cs = csScale(); for (let y = 0; y < H; y += Math.max(2, Math.round(2 * cs))) g.fillRect(0, y, W, Math.max(1, Math.round(cs * 0.6)));
    ctx = null;
  }
  function refreshLook() {
    const l = makeLook(P.minute, P.rain, P.water, P.pm25); look = l;
    const k = l.key + '|' + W + 'x' + H; if (k !== bakeKey) { bakeKey = k; return true; } return false;
  }
  function bake() {
    ensureSprites(); C = sctx; LK = look; CS = csScale(); setCam(W, H); gn = 0;
    sctx.clearRect(0, 0, W, H); drawStatic(W, world, mk);
  }
  function fastForward(sec) { const dt = 0.12; for (let t = 0; t < sec; t += dt) stepSim(S, P, dt); }
  function warm() { if (warmed) return; warmed = true; fastForward(80); ffVol = P.volume; }
  function step(dt) { warm(); const n = Math.max(1, Math.ceil(dt / 0.1)); for (let i = 0; i < n; i++) stepSim(S, P, dt / n); }

  function render() {
    if (destroyed) return; const c = getCtx(); if (!c) return; if (!sc) resize(); if (!W) return;
    warm();
    if (ffDue && performance_now() - ffAt > 300) { ffDue = false; fastForward(60); ffVol = P.volume; }
    const changed = refreshLook(); ensureSprites(); CS = csScale(); setCam(W, H);
    if (changed) { bake(); }
    LK = look; C = c; setCam(W, H); CS = csScale(); gn = 0;
    const cs = CS, tsec = S.t;
    c.drawImage(sc, 0, 0);
    // build the list
    const draws = []; const dx = Math.round(clamp(P.divider, 0, 1) * W);
    const keyOf = (x, z) => x * FX + z * FZ;
    for (const v of S.V) { v.key = keyOf(v.x, v.z); draws.push(v); }
    for (const p of S.P) { if (p.waiting === undefined) continue; p.key = keyOf(p.x, p.z); p.ph += 0.2; draws.push(p); }
    for (const m of parked) { m.key = keyOf(m.x, m.z); draws.push(m); }
    for (const m of carts) { m.key = keyOf(m.x, m.z); draws.push(m); }
    for (const p of idle) { p.key = keyOf(p.x, p.z); draws.push(p); }
    draws.sort((a, b) => b.key - a.key);
    // face tally for this frame (faces that point at the camera, in view)
    tally.faces = 0; tally.missed = 0;
    const tallyFace = (x, z, hx, hz, y, missed) => { const zc = pj(x, y, z); if (!zc || zc > 70 || PX < 0 || PX > W || PY < 0 || PY > H) return; const tx = CAMX - x, tz = CAMZ - z, dl = Math.hypot(tx, tz) || 1; if ((hx * tx + hz * tz) / dl <= (0.12)) return; tally.faces++; if (missed) tally.missed++; };
    for (const v of S.V) if (v.occ.length && v.kind !== 4 && v.kind !== 5) for (const o of v.occ) { if (v.kind === 1 || v.kind === 2) tallyFace(v.x + v.hx * (v.L * 0.19 - 0.05) + v.hz * o.lat, v.z + v.hz * (v.L * 0.19 - 0.05) - v.hx * o.lat, v.hx, v.hz, o.y, o.missed); else tallyFace(v.x + v.hx * o.along + v.hz * o.lat, v.z + v.hz * o.along - v.hx * o.lat, v.hx, v.hz, o.y, o.missed); }
    for (const p of S.P) tallyFace(p.x, p.z, p.hx, p.hz, p.h * 0.94, p.missed);
    for (const p of idle) tallyFace(p.x, p.z, p.hx, p.hz, 1.5, p.missed);
    // pass: camera view on the left, edge view on the right
    const pass = (x0, x1, mode) => {
      c.save(); c.beginPath(); c.rect(x0, 0, x1 - x0, H); c.clip();
      if (mode === 1) {
        c.save(); c.globalCompositeOperation = 'saturation'; c.globalAlpha = 0.7; c.fillStyle = 'rgb(128,128,128)'; c.fillRect(x0, 0, x1 - x0, H); c.restore();
        c.fillStyle = 'rgba(6,14,32,0.34)'; c.fillRect(x0, 0, x1 - x0, H);
      }
      drawSignals(S, mode, x0, x1);
      for (const o of draws) {
        bbReset();
        if (o.t === 'veh') drawVeh(o, mode, x0, x1); else if (o.t === 'ped') drawPed(o, mode, x0, x1, P.rain); else if (o.t === 'park') drawParked(o, mode, x0, x1); else if (o.t === 'cart') drawCart(o, mode, x0, x1, tsec);
        if (mode === 1 && BX1 > BX0 && o.t !== 'park') edgeBox(c, o, cs);
      }
      flushGlows();
      if (mode === 1) countLines(c, cs, x0, x1);
      c.restore();
    };
    if (dx > 0) pass(0, dx, 0);
    if (dx < W) pass(dx, W, 1);
    // weather on top
    rainLayer(c, cs, tsec);
    if (LK.pmF > 0.05 || LK.oc > 0.05) { c.fillStyle = rgbA(LK.fog, 0.05 + LK.pmF * 0.1 + LK.oc * 0.06); c.fillRect(0, 0, W, H); }
    c.drawImage(lens, 0, 0);
    chrome(c, cs, dx);
  }
  function performance_now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  function edgeBox(c, o, cs) {
    const pad = 2 * cs; const x = BX0 - pad, y = BY0 - pad, w = BX1 - BX0 + pad * 2, h = BY1 - BY0 + pad * 2; if (w < 3) return;
    const col = o.t === 'ped' ? '186,160,255' : o.cat === 0 ? '90,210,255' : o.cat === 1 ? '120,236,168' : o.cat === 2 ? '255,204,90' : '255,150,210';
    c.fillStyle = `rgba(${col},0.08)`; c.fillRect(x, y, w, h); c.strokeStyle = `rgba(${col},0.95)`; c.lineWidth = Math.max(1, 1.1 * cs); c.strokeRect(x, y, w, h);
    const q = Math.min(w, h) * 0.28; c.lineWidth = Math.max(1.6, 1.9 * cs); c.beginPath(); c.moveTo(x, y + q); c.lineTo(x, y); c.lineTo(x + q, y); c.moveTo(x + w - q, y + h); c.lineTo(x + w, y + h); c.lineTo(x + w, y + h - q); c.stroke();
  }
  function countLines(c, cs, x0, x1) {
    const wd = WORDS[P.lang] || WORDS.en; const per = [0, 0, 0, 0]; for (const e of S.ev) per[e[2]]++;
    for (let a = 0; a < 4; a++) {
      const h = DIRS[a], rv = [h[1], -h[0]]; const P3 = (d, off) => [-h[0] * d + rv[0] * off, 0.02, -h[1] * d + rv[1] * off].map((v, i) => v); // [x, y, z]
      const pt = (d, off) => [-h[0] * d + rv[0] * off, 0.05, -h[1] * d + rv[1] * off];
      const A = pt(STOPD, 0.2), B = pt(STOPD, X0 + 0.0), Cn = pt(STOPD, -1.2);
      // x,z: second coordinate of DIRS uses z; fix mapping
      const ax = -h[0] * STOPD + rv[0] * 0.2, az = -h[1] * STOPD + rv[1] * 0.2, bx = -h[0] * STOPD + rv[0] * X0, bz = -h[1] * STOPD + rv[1] * X0;
      if (!pj(ax, 0.05, az)) continue; const a0 = PX, a1 = PY; if (!pj(bx, 0.05, bz)) continue; const b0 = PX, b1 = PY;
      const fl = clamp(S.flash[a] / 0.35, 0, 1);
      c.save(); c.setLineDash([6 * cs, 4 * cs]); c.lineWidth = Math.max(1.4, (1.6 + 2.4 * fl) * cs); c.strokeStyle = fl > 0 ? 'rgba(255,255,255,0.98)' : 'rgba(80,220,255,0.95)'; c.beginPath(); c.moveTo(a0, a1); c.lineTo(b0, b1); c.stroke(); c.restore();
      if (fl > 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(80,220,255,0.5)'; c.lineWidth = 7 * cs * fl; c.beginPath(); c.moveTo(a0, a1); c.lineTo(b0, b1); c.stroke(); c.restore(); }
      // label near the kerb end
      const lx = (a0 * 0.35 + b0 * 0.65), ly = (a1 * 0.35 + b1 * 0.65);
      if (lx > x0 - 20 && lx < x1 + 20 && lx > 6 && lx < W - 6) {
        const txt = (wd[AP[a]] || AP[a].toUpperCase()) + ' ' + per[a]; c.font = `700 ${9 * cs}px ${FONT}`; const tw = c.measureText(txt).width + 6 * cs;
        c.fillStyle = 'rgba(4,16,30,0.78)'; c.fillRect(lx - tw / 2, ly - 16 * cs, tw, 11 * cs); c.fillStyle = 'rgb(130,232,255)'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, lx, ly - 10.4 * cs);
      }
    }
  }
  function rainLayer(c, cs, tsec) {
    const rain = P.rain; if (rain <= 0.3) return;
    const n = Math.min(320, Math.floor(30 + rain * 4.4)); const len = (9 + Math.min(rain, 60) * 0.12) * cs;
    c.save(); c.lineCap = 'round'; c.strokeStyle = `rgba(214,226,242,${Math.min(0.5, 0.2 + rain * 0.004)})`; c.lineWidth = Math.max(0.7, cs * 0.75); c.beginPath();
    for (let i = 0; i < n; i++) { const x0 = rainRnd[i * 3] * (W + 80 * cs) - 20 * cs, sp = 0.9 + rainRnd[i * 3 + 1] * 0.8, off = rainRnd[i * 3 + 2]; const ph = (tsec * sp * 1.15 + off) % 1; const y = ph * (H + len * 2) - len; c.moveTo(x0 + len * 0.16, y); c.lineTo(x0, y + len); }
    c.stroke(); c.restore();
    // ripples on wet road
    const nr = Math.min(34, Math.floor(rain * 0.5 + LK.cover * 14)); if (nr < 1) return;
    c.save(); c.lineWidth = Math.max(0.7, cs * 0.7);
    for (let i = 0; i < nr; i++) {
      const slot = Math.floor(tsec * 2.2 + i * 0.37), age = (tsec * 2.2 + i * 0.37) % 1; const hh = hash(i, slot, 5);
      const u = (hh % 1000) / 1000, v = ((hh >>> 10) % 1000) / 1000; let x, z; if (hh & 1) { x = -6 + u * 12; z = -5 + v * 40; } else { z = -6 + u * 12; x = -5 + v * 40; }
      const zc = pj(x, 0, z); if (!zc) continue; const k = F / zc, r = (0.15 + 0.5 * age) * k, ratio = CAMY / Math.hypot(Math.hypot(x - CAMX, z - CAMZ), CAMY);
      c.strokeStyle = `rgba(220,232,246,${(0.5 * (1 - age) * clamp(rain / 10 + LK.cover, 0.3, 1)).toFixed(3)})`; c.beginPath(); c.ellipse(PX, PY, r, r * ratio, 0, 0, TAU); c.stroke();
    }
    c.restore();
  }
  function chrome(c, cs, dx) {
    const wd = WORDS[P.lang] || WORDS.en;
    // CCTV stamp on the camera side
    const mn = P.minute, d0 = Date.UTC(2026, 10, 27, 15, 0, 0) + Math.round(mn * 60000);
    const dt = new Date(d0), pad = (n) => String(n).padStart(2, '0');
    const stamp = `${node}  ${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
    c.save(); c.beginPath(); c.rect(0, 0, dx, H); c.clip(); c.font = `600 ${8.5 * cs}px ${MONO}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillText(stamp, 8 * cs + 1, H - 8 * cs + 1); c.fillStyle = 'rgba(244,246,240,0.92)'; c.fillText(stamp, 8 * cs, H - 8 * cs);
    if ((Math.floor(S.t * 1.5) & 1) === 0 || P.still) { c.fillStyle = 'rgba(255,60,50,0.95)'; c.beginPath(); c.arc(8 * cs + 3 * cs, 10 * cs + 22 * cs, 2.6 * cs, 0, TAU); c.fill(); }
    c.restore();
    // captions
    const cap = (txt, x, align, col) => { c.font = `700 ${9.5 * cs}px ${FONT}`; const tw = c.measureText(txt).width + 10 * cs; const px = align === 'right' ? x - tw : x; if (px < 2 || px + tw > W - 2) return; c.fillStyle = 'rgba(4,10,22,0.62)'; c.beginPath(); c.roundRect ? c.roundRect(px, 7 * cs, tw, 15 * cs, 7.5 * cs) : c.rect(px, 7 * cs, tw, 15 * cs); c.fill(); c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, px + 5 * cs, 14.8 * cs); };
    cap(wd.camera, dx - 26 * cs, 'right', 'rgb(246,248,250)'); cap(wd.leaves, dx + 26 * cs, 'left', 'rgb(150,236,255)');
    if (dx < W - 120 * cs) { c.font = `600 ${8 * cs}px ${FONT}`; const tw = c.measureText(wd.miss).width + 10 * cs; if (W - dx > tw + 30 * cs) { c.fillStyle = 'rgba(4,10,22,0.62)'; c.fillRect(W - tw - 6 * cs, H - 19 * cs, tw, 13 * cs); c.fillStyle = 'rgb(255,190,70)'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(wd.miss, W - tw - 1 * cs, H - 12.5 * cs); } }
    // divider
    if (dx > 0 && dx < W) {
      c.save(); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(dx - 3 * cs, 0, 6 * cs, H); c.fillStyle = 'rgba(255,255,255,0.98)'; c.fillRect(dx - 1 * cs, 0, 2 * cs, H);
      const hy = H * 0.7, hr = 22 * cs; c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 8 * cs; c.beginPath(); c.arc(dx, hy, hr, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.97)'; c.fill(); c.shadowBlur = 0;
      c.strokeStyle = 'rgba(100,70,230,0.95)'; c.lineWidth = 2 * cs; c.beginPath(); c.arc(dx, hy, hr - 5 * cs, 0, TAU); c.stroke();
      c.fillStyle = 'rgb(60,40,150)'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(dx + s * 11 * cs, hy); c.lineTo(dx + s * 5 * cs, hy - 5.5 * cs); c.lineTo(dx + s * 5 * cs, hy + 5.5 * cs); c.closePath(); c.fill(); }
      c.restore();
    }
  }

  function loop(ts) {
    if (!running) return; raf = requestAnimationFrame(loop);
    if (ts - last < 28) return; const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0.033); last = ts;
    step(dt); render();
  }
  const api = {
    set(o = {}) {
      const volBefore = P.volume;
      for (const k of ['minute', 'volume', 'rain', 'water', 'pm25', 'divider', 'lang']) if (o[k] != null && !Number.isNaN(+o[k]) || (k === 'lang' && o[k])) P[k] = k === 'lang' ? o[k] : +o[k];
      if (o.still != null) P.still = !!o.still;
      if (warmed && ffVol != null && Math.abs(P.volume - ffVol) > Math.max(8, 0.3 * ffVol)) { if (P.still) { fastForward(60); ffVol = P.volume; } else if (!ffDue) { ffDue = true; ffAt = performance_now(); } }
      if (!running) render();
    },
    start() { if (running) return; if (P.still) { render(); return; } running = true; last = 0; raf = requestAnimationFrame(loop); },
    stop() { running = false; if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf); raf = 0; },
    resize() { resize(); render(); },
    render, step,
    destroy() { api.stop(); destroyed = true; ctx = null; sc = null; sctx = null; lens = null; },
    counts() {
      const per = { total: 0, motos: 0, cars: 0, tuktuks: 0, buses: 0, people: 0 }; const win = 60;
      for (const e of S.ev) { if (e[1] === 0) per.motos++; else if (e[1] === 1) per.cars++; else if (e[1] === 2) per.tuktuks++; else if (e[1] === 3) per.buses++; else per.people++; }
      per.total = per.motos + per.cars + per.tuktuks + per.buses;
      const q = S.q.map((v) => Math.round(v * QSPACE / QLANES));
      return { minute: P.minute, perMin: per, queueM: { n: q[0], e: q[1], s: q[2], w: q[3] }, coversMissed: tally.missed, faces: tally.faces };
    },
    packet() {
      const c = api.counts(); const mm = ((((15 * 60 + Math.round(P.minute)) % 1440) + 1440) % 1440);
      // quality 'low': two or more of night, rain >= 30 mm/h, haze >= 150 ug/m3, or rain >= 60 alone
      const lk = look || makeLook(P.minute, P.rain, P.water, P.pm25);
      let bad = 0; if (lk.sun < 0.25) bad++; if (P.rain >= 30) bad++; if (P.pm25 >= 150) bad++; if (P.rain >= 60) bad++;
      return { t: `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`, node, vehiclesPerMin: c.perMin.total, peoplePerMin: c.perMin.people, queueM: c.queueM, rainMmH: P.rain, waterCm: P.water, pm25: P.pm25, quality: bad >= 2 ? 'low' : 'ok' };
    },
    packetBytes() { const s = JSON.stringify(api.packet()); return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length; },
  };
  resize();
  return api;
}
