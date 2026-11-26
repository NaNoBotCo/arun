// Orthographic globe lit by the E01 solar geometry. Per-pixel shading on the CPU (works everywhere),
// a land mask from Natural Earth outlines, tracer trails from the analytic velocity field.

import { LAND } from '../data/land.js';
import { declinationDeg, advectTracer, wrapLon } from '../kernels/e01.js';
import { makeRng } from '../core/rng.js';

const RAD = Math.PI / 180;
let MASK = null;
const MW = 1440, MH = 720;

function landMask() {
  if (MASK) return MASK;
  const c = document.createElement('canvas');
  c.width = MW;
  c.height = MH;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.beginPath();
  for (const ring of LAND) {
    for (let i = 0; i < ring.length; i += 2) {
      const x = ((ring[i] / 10 + 180) / 360) * MW;
      const y = ((90 - ring[i + 1] / 10) / 180) * MH;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  }
  g.fill('evenodd');
  const d = g.getImageData(0, 0, MW, MH).data;
  MASK = new Uint8Array(MW * MH);
  for (let i = 0; i < MASK.length; i++) MASK[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return MASK;
}

export function isLand(lat, lon) {
  const m = landMask();
  const x = Math.min(MW - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MW)));
  const y = Math.min(MH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MH)));
  return m[y * MW + x] === 1;
}

function rotation(lon0, lat0) {
  // world = Ry(lon0) · Rx(−lat0) · view
  const cl = Math.cos(lon0 * RAD), sl = Math.sin(lon0 * RAD);
  const ca = Math.cos(-lat0 * RAD), sa = Math.sin(-lat0 * RAD);
  // Rx(a): [1,0,0; 0,ca,-sa; 0,sa,ca]; Ry(l): [cl,0,sl; 0,1,0; -sl,0,cl]
  return [cl, sl * sa, sl * ca, 0, ca, -sa, -sl, cl * sa, cl * ca];
}

function toWorld(lat, lon) {
  const c = Math.cos(lat * RAD);
  return [c * Math.sin(lon * RAD), Math.sin(lat * RAD), c * Math.cos(lon * RAD)];
}

// Palette: night indigo, ocean teal-blue, land jade and sand, dawn gold and rose.
const C = {
  oceanDay: [28, 112, 178], oceanDeep: [12, 52, 120], landDay: [74, 170, 112], landDry: [196, 170, 108],
  night: [10, 12, 40], nightLand: [32, 30, 78], dawn: [255, 184, 77], rose: [255, 107, 139], rim: [120, 190, 255], grat: [190, 200, 255],
};

export function createGlobe(container, options = {}) {
  const opt = {
    spinDegPerSec: 4, streamlines: true, particles: 800, graticule: true, quality: 0.7, maxRes: 560,
    lon0: 104, lat0: 12, flowParams: { U: 1, A: 0.6, k: 4, c: 0.3 }, ...options,
  };
  const base = document.createElement('canvas');
  const trails = document.createElement('canvas');
  const ui = document.createElement('canvas');
  for (const c of [base, trails, ui]) {
    c.style.position = 'absolute';
    c.style.inset = '0';
    c.style.width = '100%';
    c.style.height = '100%';
    c.setAttribute('aria-hidden', 'true');
  }
  ui.style.pointerEvents = 'none';
  trails.style.pointerEvents = 'none';
  trails.style.mixBlendMode = 'screen';
  container.append(base, trails, ui);
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');
  let img = null, view = null, s = 0;
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, radius = 0;
  let lon0 = opt.lon0, lat0 = opt.lat0;
  let target = null; // {lon, lat} to ease toward
  let day = 1, utc = 0;
  let marker = null;
  let ripple = null;
  let t = 0;
  const rng = makeRng(opt.seed || 7);
  let parts = [];
  const mask = landMask();

  function seedParticles(n) {
    parts = [];
    for (let i = 0; i < n; i++) parts.push({ lat: Math.asin(2 * rng.uniform() - 1) / RAD, lon: rng.range(-180, 180), age: rng.int(200) });
  }
  seedParticles(opt.streamlines ? opt.particles : 0);

  function resize() {
    const r = container.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    for (const c of [base, trails, ui]) {
      c.width = W;
      c.height = H;
    }
    radius = Math.min(W, H) * 0.46 * (opt.scale || 1);
    cx = W * (opt.cxFrac ?? 0.5);
    cy = H * (opt.cyFrac ?? 0.5);
    s = Math.max(120, Math.min(opt.maxRes, Math.round(2 * radius * opt.quality)));
    off.width = s;
    off.height = s;
    img = offCtx.createImageData(s, s);
    view = new Float32Array(s * s * 3);
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const x = (2 * (i + 0.5)) / s - 1;
        const y = 1 - (2 * (j + 0.5)) / s;
        const r2 = x * x + y * y;
        const k = (j * s + i) * 3;
        if (r2 <= 1) {
          view[k] = x;
          view[k + 1] = y;
          view[k + 2] = Math.sqrt(1 - r2);
        } else view[k + 2] = -1;
      }
    draw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  function shade() {
    const R = rotation(lon0, lat0);
    const dec = declinationDeg(day);
    const sun = toWorld(dec, wrapLon(15 * (12 - utc)));
    const d = img.data;
    const grat = opt.graticule;
    const SV = sun[0] * R[2] + sun[1] * R[5] + sun[2] * R[8];
    for (let p = 0, k = 0; p < s * s; p++, k += 3) {
      const o = p * 4;
      const vz = view[k + 2];
      if (vz < 0) {
        d[o + 3] = 0;
        continue;
      }
      const vx = view[k], vy = view[k + 1];
      const wx = R[0] * vx + R[1] * vy + R[2] * vz;
      const wy = R[3] * vx + R[4] * vy + R[5] * vz;
      const wz = R[6] * vx + R[7] * vy + R[8] * vz;
      const lat = Math.asin(wy > 1 ? 1 : wy < -1 ? -1 : wy) / RAD;
      const lon = Math.atan2(wx, wz) / RAD;
      const mx = Math.min(MW - 1, ((lon + 180) * 4) | 0);
      const my = Math.min(MH - 1, ((90 - lat) * 4) | 0);
      const land = mask[my * MW + mx];
      const cz = wx * sun[0] + wy * sun[1] + wz * sun[2];
      let dayF = (cz + 0.06) / 0.22;
      dayF = dayF < 0 ? 0 : dayF > 1 ? 1 : dayF;
      dayF = dayF * dayF * (3 - 2 * dayF);
      let r, g, b;
      if (land) {
        const dry = Math.max(0, 1 - Math.abs(Math.abs(lat) - 24) / 14) * 0.7;
        const lr = C.landDay[0] + (C.landDry[0] - C.landDay[0]) * dry;
        const lg = C.landDay[1] + (C.landDry[1] - C.landDay[1]) * dry;
        const lb = C.landDay[2] + (C.landDry[2] - C.landDay[2]) * dry;
        const lit = 0.55 + 0.45 * Math.max(0, cz);
        r = C.nightLand[0] + (lr * lit - C.nightLand[0]) * dayF;
        g = C.nightLand[1] + (lg * lit - C.nightLand[1]) * dayF;
        b = C.nightLand[2] + (lb * lit - C.nightLand[2]) * dayF;
      } else {
        const lit = Math.max(0, cz);
        const or = C.oceanDeep[0] + (C.oceanDay[0] - C.oceanDeep[0]) * lit;
        const og = C.oceanDeep[1] + (C.oceanDay[1] - C.oceanDeep[1]) * lit;
        const ob = C.oceanDeep[2] + (C.oceanDay[2] - C.oceanDeep[2]) * lit;
        r = C.night[0] + (or - C.night[0]) * dayF;
        g = C.night[1] + (og - C.night[1]) * dayF;
        b = C.night[2] + (ob - C.night[2]) * dayF;
        // Glint: the sun's mirror reflection off the ocean toward the viewer, (2(N·S)N − S)·V.
        const gl = cz > 0 ? 2 * cz * vz - SV : 0;
        const glint = gl > 0.93 ? (gl - 0.93) * 14 : 0;
        r += 170 * glint * glint;
        g += 150 * glint * glint;
        b += 110 * glint * glint;
      }
      // Dawn and dusk band: a glow centred just below the terminator.
      const tw = (cz + 0.012) / 0.045;
      const glow = Math.exp(-tw * tw);
      const roseMix = Math.max(0, Math.min(1, -cz * 18 + 0.25));
      r += glow * (C.dawn[0] * (1 - roseMix) + C.rose[0] * roseMix) * 0.42;
      g += glow * (C.dawn[1] * (1 - roseMix) + C.rose[1] * roseMix) * 0.42;
      b += glow * (C.dawn[2] * (1 - roseMix) + C.rose[2] * roseMix) * 0.42;
      if (grat) {
        const la = Math.abs(lat % 15), lo = Math.abs(lon % 15);
        const near = Math.min(la, 15 - la) < 0.28 || (Math.min(lo, 15 - lo) < 0.28 / Math.max(0.2, Math.cos(lat * RAD)) && Math.abs(lat) < 80);
        if (near) {
          r += 22;
          g += 24;
          b += 40;
        }
      }
      const rim = Math.pow(1 - vz, 3);
      r += C.rim[0] * rim * 0.55;
      g += C.rim[1] * rim * 0.55;
      b += C.rim[2] * rim * 0.65;
      const edge = vz < 0.03 ? vz / 0.03 : 1;
      d[o] = r > 255 ? 255 : r;
      d[o + 1] = g > 255 ? 255 : g;
      d[o + 2] = b > 255 ? 255 : b;
      d[o + 3] = 255 * edge;
    }
    offCtx.putImageData(img, 0, 0);
    return { R, sun, dec };
  }

  function project(lat, lon, R) {
    const [x, y, z] = toWorld(lat, lon);
    // view = Rᵀ · world
    const vx = R[0] * x + R[3] * y + R[6] * z;
    const vy = R[1] * x + R[4] * y + R[7] * z;
    const vz = R[2] * x + R[5] * y + R[8] * z;
    return { x: cx + vx * radius, y: cy - vy * radius, front: vz > 0, vz };
  }

  function drawUi(R, sun, dec) {
    const g = ui.getContext('2d');
    g.clearRect(0, 0, W, H);
    // Atmosphere halo
    const halo = g.createRadialGradient(cx, cy, radius * 0.98, cx, cy, radius * 1.16);
    halo.addColorStop(0, 'rgba(120,190,255,0.35)');
    halo.addColorStop(1, 'rgba(120,190,255,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(cx, cy, radius * 1.16, 0, Math.PI * 2);
    g.arc(cx, cy, radius * 0.98, 0, Math.PI * 2, true);
    g.fill();
    const sp = project(dec, wrapLon(15 * (12 - utc)), R);
    if (sp.front) {
      const sg = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, radius * 0.16);
      sg.addColorStop(0, 'rgba(255,240,200,0.95)');
      sg.addColorStop(0.25, 'rgba(255,190,90,0.55)');
      sg.addColorStop(1, 'rgba(255,184,77,0)');
      g.fillStyle = sg;
      g.beginPath();
      g.arc(sp.x, sp.y, radius * 0.16, 0, Math.PI * 2);
      g.fill();
    }
    if (marker) {
      const mp = project(marker.lat, marker.lon, R);
      if (mp.front) {
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.arc(mp.x, mp.y, 7 * dpr, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#ffb84d';
        g.beginPath();
        g.arc(mp.x, mp.y, 3 * dpr, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (ripple) {
      const rp = project(ripple.lat, ripple.lon, R);
      const k = ripple.t;
      if (rp.front && k < 1) {
        g.strokeStyle = `rgba(255,184,77,${1 - k})`;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.arc(rp.x, rp.y, (8 + 60 * k) * dpr, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }

  function stepParticles(R, sun, dt) {
    const g = trails.getContext('2d');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.075)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = 1.3 * dpr;
    const h = dt * 0.9;
    for (const q of parts) {
      const a = project(q.lat, q.lon, R);
      const [nl, no] = advectTracer(q.lat, q.lon, t, h, opt.flowParams);
      q.lat = nl;
      q.lon = no;
      q.age++;
      const b = project(nl, no, R);
      if (q.age > 260) {
        q.lat = Math.asin(2 * rng.uniform() - 1) / RAD;
        q.lon = rng.range(-180, 180);
        q.age = 0;
        continue;
      }
      if (!(a.front && b.front) || Math.abs(a.x - b.x) > radius * 0.2) continue;
      const w = toWorld(nl, no);
      const lit = w[0] * sun[0] + w[1] * sun[1] + w[2] * sun[2];
      const alpha = 0.55 * Math.min(1, b.vz * 3);
      g.strokeStyle = lit > 0 ? `rgba(255,214,150,${alpha})` : `rgba(110,210,255,${alpha})`;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }

  function draw(dt = 0) {
    if (!img) return;
    const { R, sun, dec } = shade();
    const g = base.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.save();
    g.beginPath();
    g.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
    g.clip();
    g.drawImage(off, cx - radius, cy - radius, radius * 2, radius * 2);
    g.restore();
    if (opt.streamlines && dt > 0) stepParticles(R, sun, dt);
    drawUi(R, sun, dec);
  }

  return {
    canvas: base,
    setTime(d, u) {
      day = d;
      utc = u;
    },
    get view() {
      return { lon0, lat0 };
    },
    setView(lon, lat) {
      lon0 = wrapLon(lon);
      lat0 = Math.max(-80, Math.min(80, lat));
    },
    flyTo(lat, lon) {
      target = { lat: Math.max(-70, Math.min(70, lat)), lon };
    },
    setMarker(m) {
      marker = m;
    },
    pulse(lat, lon) {
      ripple = { lat, lon, t: 0 };
    },
    setStreamlines(on, n = opt.particles) {
      opt.streamlines = on;
      seedParticles(on ? n : 0);
      trails.getContext('2d').clearRect(0, 0, W, H);
    },
    setFlow(p) {
      opt.flowParams = { ...opt.flowParams, ...p };
    },
    setSpin(v) {
      opt.spinDegPerSec = v;
    },
    particleCount: () => parts.length,
    pick(clientX, clientY) {
      const r = base.getBoundingClientRect();
      const x = ((clientX - r.left) * dpr - cx) / radius;
      const y = -((clientY - r.top) * dpr - cy) / radius;
      const r2 = x * x + y * y;
      if (r2 > 1) return null;
      const z = Math.sqrt(1 - r2);
      const R = rotation(lon0, lat0);
      const wx = R[0] * x + R[1] * y + R[2] * z;
      const wy = R[3] * x + R[4] * y + R[5] * z;
      const wz = R[6] * x + R[7] * y + R[8] * z;
      return { lat: Math.asin(wy) / RAD, lon: Math.atan2(wx, wz) / RAD };
    },
    frame(dt) {
      t += dt;
      if (target) {
        const dl = wrapLon(target.lon - lon0);
        const da = target.lat - lat0;
        lon0 = wrapLon(lon0 + dl * Math.min(1, dt * 3));
        lat0 += da * Math.min(1, dt * 3);
        if (Math.abs(dl) < 0.05 && Math.abs(da) < 0.05) target = null;
      } else if (opt.spinDegPerSec) lon0 = wrapLon(lon0 + opt.spinDegPerSec * dt);
      if (ripple) {
        ripple.t += dt * 1.1;
        if (ripple.t > 1) ripple = null;
      }
      draw(dt);
    },
    draw: () => draw(0),
    destroy() {
      ro.disconnect();
      base.remove();
      trails.remove();
      ui.remove();
    },
  };
}
