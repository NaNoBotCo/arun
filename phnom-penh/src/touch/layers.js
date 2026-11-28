// Layers drawn on the 3D city (src/render/world.js's scene): traffic as moving lights on the mapped
// roads, PM2.5 as a coloured haze over the ground, junction beacons, water at the kerb, alert rings,
// and aggregate packets travelling from the junctions to the shared computing node.
import * as THREE from 'three';
import { aqi, CATS } from './sim.js';

const W2 = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
const hex = s => new THREE.Color(s);

// ---------- traffic ----------
export function createTraffic(world, geo, { count = 4200, extent } = {}) {
  const polys = [];
  for (const [k, cls] of [['major', 0], ['minor', 1]]) for (const p of geo[k] || []) {
    if (p.length < 4) continue;
    let inside = false;
    for (let i = 0; i < p.length; i += 2) if (p[i] > extent.x0 && p[i] < extent.x1 && p[i + 1] > extent.y0 && p[i + 1] < extent.y1) { inside = true; break; }
    if (!inside) continue;
    const cum = [0];
    for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
    const L = cum[cum.length - 1];
    if (L < 60) continue;
    polys.push({ p, cum, L, w: L * (cls === 0 ? 2.4 : 1), cls });
  }
  const tot = polys.reduce((s, q) => s + q.w, 0);
  let k = 1;
  const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const P = [];
  for (let i = 0; i < count; i++) {
    let r = rnd() * tot, j = 0; while (j < polys.length - 1 && r > polys[j].w) { r -= polys[j].w; j++; }
    P.push({ j, u0: rnd() * polys[j].L, dir: rnd() < 0.5 ? 1 : -1, v: (polys[j].cls === 0 ? 9 : 6.5) * (0.7 + 0.6 * rnd()), rank: rnd(), lane: (rnd() - 0.5) });
  }
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 4);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('pcol', new THREE.BufferAttribute(col, 4));
  const U = { uPx: { value: world.renderer.getPixelRatio() }, uSize: { value: 4 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 pcol; varying vec4 vC; uniform float uPx, uSize; void main(){ vC = pcol; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize * uPx * clamp(9000.0 / -mv.z, 0.6, 2.2); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC.rgb * (0.7 + 1.6*a*a), a * vC.a); }`,
  });
  const pts = new THREE.Points(geom, mat); pts.frustumCulled = false; pts.renderOrder = 4;
  world.scene.add(pts);
  const at = (q, s, out) => {
    const { p, cum } = q; let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const f = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    const ax = p[lo * 2], ay = p[lo * 2 + 1], bx = p[hi * 2], by = p[hi * 2 + 1];
    const L = Math.hypot(bx - ax, by - ay) || 1;
    out.x = ax + (bx - ax) * f + (-(by - ay) / L) * out.side; out.y = ay + (by - ay) * f + ((bx - ax) / L) * out.side;
  };
  const tmp = { x: 0, y: 0, side: 0 };
  let clock = 0;
  return {
    // density 0..1 (share of particles shown), night 0..1, slow 0..1 (speed factor)
    frame(dt, density, night, slow, on) {
      pts.visible = on;
      if (!on) return;
      clock += dt * slow;
      const day = 1 - night;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], q = polys[a.j];
        const show = a.rank < density;
        let s = (a.u0 + a.dir * a.v * clock * 12) % q.L; if (s < 0) s += q.L;
        tmp.side = a.dir * (q.cls === 0 ? 7 : 4) + a.lane * 3;
        at(q, s, tmp);
        pos[i * 3] = tmp.x; pos[i * 3 + 1] = 3; pos[i * 3 + 2] = -tmp.y;
        // headlights coming toward the camera side are white, tail lights red; by day, soft warm dots
        const head = a.dir > 0;
        const r = head ? 1 : 1, gg = head ? 0.93 : 0.18, b = head ? 0.8 : 0.12;
        const dayc = [1, 0.85, 0.6];
        col[i * 4] = r * night + dayc[0] * day; col[i * 4 + 1] = gg * night + dayc[1] * day; col[i * 4 + 2] = b * night + dayc[2] * day;
        col[i * 4 + 3] = show ? (0.35 + 0.65 * night) : 0;
      }
      U.uSize.value = 3 + 4.5 * night;
      geom.attributes.position.needsUpdate = true; geom.attributes.pcol.needsUpdate = true;
    },
  };
}

// ---------- air ----------
export function createAir(world, grid) {
  const { nx, ny, x0, y0, x1, y1 } = grid;
  const data = new Uint8Array(nx * ny * 4);
  const tex = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.flipY = true; tex.needsUpdate = true;
  const U = { uTex: { value: tex }, uTime: { value: 0 }, uOn: { value: 1 } };
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 6, -(y0 + y1) / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uTime, uOn; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
      void main(){ vec4 c = texture2D(uTex, vUv);
        vec2 q = vec2(vW.x, -vW.z) / 900.0 + vec2(uTime*0.05, uTime*0.04);
        float wisp = 0.65 + 0.55 * (n(q) * 0.6 + n(q*2.3 + 7.0) * 0.4);
        float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) * smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        gl_FragColor = vec4(c.rgb, c.a * wisp * edge * uOn); }`,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 2; world.scene.add(mesh);
  const cols = CATS.map(c => hex(c.col)), haze = new THREE.Color(0.72, 0.66, 0.58);
  const stops = [0, 50, 100, 150, 200, 300, 500];
  const colorOf = a => {
    let i = 0; while (i < stops.length - 2 && a > stops[i + 1]) i++;
    const f = Math.min(1, (a - stops[i]) / (stops[i + 1] - stops[i]));
    return cols[i].clone().lerp(cols[Math.min(cols.length - 1, i + 1)], Math.max(0, f - 0.5) * 2 * 0.5);
  };
  return {
    set(field) {
      for (let i = 0; i < nx * ny; i++) {
        const a = aqi(field[i]), c = colorOf(a).lerp(haze, 0.35);
        data[i * 4] = c.r * 255; data[i * 4 + 1] = c.g * 255; data[i * 4 + 2] = c.b * 255;
        data[i * 4 + 3] = Math.min(120, Math.max(0, a - 40) * 0.8);   // clean air leaves the city clear
      }
      tex.needsUpdate = true;
    },
    frame(dt, on) { U.uTime.value += dt; U.uOn.value = on ? 1 : 0; mesh.visible = on; },
  };
}

// ---------- junction beacons, water, rings, packets ----------
function beaconCanvas(col) {
  const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
  const gr = x.createRadialGradient(48, 48, 6, 48, 48, 48); gr.addColorStop(0, col); gr.addColorStop(0.35, col + 'cc'); gr.addColorStop(1, col + '00');
  x.fillStyle = gr; x.fillRect(0, 0, 96, 96);
  x.fillStyle = '#0b1220'; x.beginPath(); x.arc(48, 48, 15, 0, Math.PI * 2); x.fill();
  x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.arc(48, 48, 15, 0, Math.PI * 2); x.stroke();
  // a small camera
  x.fillStyle = col; x.fillRect(38, 43, 15, 10); x.beginPath(); x.moveTo(53, 46); x.lineTo(59, 42); x.lineTo(59, 56); x.lineTo(53, 52); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const STATE_COL = { ok: '#5fd4e6', warn: '#ffb347', rain: '#7aa7ff', alert: '#ff5a4d', air: '#c77dff' };

export function createJunctions(world, junctions, dc) {
  const tex = Object.fromEntries(Object.entries(STATE_COL).map(([k, c]) => [k, beaconCanvas(c)]));
  const H = 120;
  const items = junctions.map(j => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.ok, sizeAttenuation: false, depthTest: false, transparent: true }));
    sp.position.copy(W2(j.x, j.y, H)); sp.scale.set(0.05, 0.05, 1); sp.renderOrder = 22; world.scene.add(sp);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.55, depthWrite: false }));
    water.position.copy(W2(j.x, j.y, 4)); water.renderOrder = 3; water.visible = false; world.scene.add(water);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.copy(W2(j.x, j.y, 5)); ring.renderOrder = 3; world.scene.add(ring);
    return { j, sp, water, ring, state: 'ok' };
  });
  const stalk = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(junctions.flatMap(j => [j.x, 0, -j.y, j.x, H, -j.y]), 3)),
    new THREE.LineBasicMaterial({ color: 0x9fe8f2, transparent: true, opacity: 0.35 }));
  world.scene.add(stalk);
  // the shared computing node, high above the river
  const dcTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, '#fff6d8'); gr.addColorStop(0.25, '#f5c451'); gr.addColorStop(1, 'rgba(245,196,81,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#0b1220'; x.lineWidth = 3;
    for (let i = 0; i < 3; i++) { x.strokeRect(48, 44 + i * 13, 32, 9); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const dcSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dcTex, sizeAttenuation: false, depthTest: false, transparent: true }));
  dcSp.position.copy(W2(dc.x, dc.y, dc.h)); dcSp.scale.set(0.085, 0.085, 1); dcSp.renderOrder = 23; world.scene.add(dcSp);
  // packets: bright points on arcs from a junction up to the node
  const NP = 160, pp = new Float32Array(NP * 3), pc = new Float32Array(NP * 4);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('pcol', new THREE.BufferAttribute(pc, 4));
  const pm = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: world.renderer.getPixelRatio() } },
    vertexShader: `attribute vec4 pcol; varying vec4 vC; uniform float uPx; void main(){ vC = pcol; gl_PointSize = 9.0 * uPx; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC.rgb*(0.6+1.4*a*a), a*vC.a); }` });
  const pPts = new THREE.Points(pg, pm); pPts.frustumCulled = false; pPts.renderOrder = 30; world.scene.add(pPts);
  const packets = [];
  const A = new THREE.Vector3(), B = W2(dc.x, dc.y, dc.h), T = new THREE.Vector3();
  // alert rings (city-scale), one per active alert
  const big = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); m.renderOrder = 3; m.visible = false; world.scene.add(m); return m; });
  let clock = 0;
  return {
    items, dcPos: dc,
    // per junction: state key, water cm, queue m (ring size), warn pulse
    set(states) {
      states.forEach((s, i) => {
        const it = items[i];
        if (s.state !== it.state) { it.sp.material.map = tex[s.state]; it.sp.material.needsUpdate = true; it.state = s.state; }
        const wcm = s.water || 0;
        it.water.visible = s.showWater && wcm > 0.5; const r = 60 + 14 * wcm; it.water.scale.set(r, 1, r);
        it.qm = s.queue || 0; it.pulse = s.state !== 'ok'; it.sel = s.sel;
      });
    },
    alerts(list) {
      big.forEach((m, i) => { const a = list[i]; m.visible = !!a; if (a) { m.position.copy(W2(a.x, a.y, 6)); m.material.color.set(a.col); m.userData = a; } });
    },
    packet(i, col = '#f5c451') { if (packets.length >= NP) packets.shift(); packets.push({ i, t: 0, c: new THREE.Color(col) }); },
    frame(dt, opts = {}) {
      clock += dt;
      items.forEach((it, i) => {
        const base = it.sel ? 0.07 : 0.05;
        const s = base * (it.pulse ? 1 + 0.15 * Math.sin(clock * 6 + i) : 1);
        it.sp.scale.set(s, s, 1); it.sp.visible = opts.cams !== false;
        const q = Math.min(900, it.qm || 0);
        it.ring.visible = opts.cams !== false && q > 20;
        const rr = 80 + q * 0.9; it.ring.scale.set(rr, 1, rr);
        it.ring.material.color.set(q >= 250 ? '#ff5a4d' : '#ffb347'); it.ring.material.opacity = Math.min(0.8, 0.25 + q / 600);
      });
      stalk.visible = opts.cams !== false;
      big.forEach((m, i) => { if (!m.visible) return; const u = (clock * 0.45 + i * 0.25) % 1; const r = 300 + 900 * u; m.scale.set(r, 1, r); m.material.opacity = 0.75 * (1 - u); });
      let n = 0;
      for (let k = packets.length - 1; k >= 0; k--) { packets[k].t += dt / 1.6; if (packets[k].t >= 1) packets.splice(k, 1); }
      for (const p of packets) {
        const j = items[p.i].j; A.copy(W2(j.x, j.y, 120));
        const u = p.t, iu = 1 - u, mid = new THREE.Vector3((A.x + B.x) / 2, Math.max(A.y, B.y) + 700, (A.z + B.z) / 2);
        T.set(iu * iu * A.x + 2 * iu * u * mid.x + u * u * B.x, iu * iu * A.y + 2 * iu * u * mid.y + u * u * B.y, iu * iu * A.z + 2 * iu * u * mid.z + u * u * B.z);
        pp.set([T.x, T.y, T.z], n * 3); pc.set([p.c.r, p.c.g, p.c.b, Math.sin(Math.PI * u) * 0.9 + 0.1], n * 4); n++;
      }
      pg.setDrawRange(0, n); pg.attributes.position.needsUpdate = true; pg.attributes.pcol.needsUpdate = true;
      dcSp.visible = opts.cams !== false;
    },
    pick(project, cx, cy, radius = 30) {
      let best = -1, bd = radius;
      items.forEach((it, i) => { if (!it.sp.visible) return; const p = project(it.j.x, it.j.y, 120); if (!p.on) return; const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = i; } });
      const q = project(dc.x, dc.y, dc.h);
      if (q.on && Math.hypot(q.x - cx, q.y - cy) < Math.max(36, bd)) return 'dc';
      return best;
    },
  };
}

// ---------- traffic lights at their OpenStreetMap positions; the red–amber–green timing is illustrative ----------
export function createSignals(world, pts) {
  const n = pts.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 4);
  pts.forEach(([x, y], i) => { pos[i * 3] = x; pos[i * 3 + 1] = 8; pos[i * 3 + 2] = -y; });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geom.setAttribute('pcol', new THREE.BufferAttribute(col, 4));
  const U = { uPx: { value: world.renderer.getPixelRatio() }, uSize: { value: 5 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 pcol; varying vec4 vC; uniform float uPx, uSize; void main(){ vC = pcol; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize * uPx * clamp(7000.0 / -mv.z, 0.7, 2.6); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.32, d); gl_FragColor = vec4(mix(vec3(0.04), vC.rgb, smoothstep(0.42, 0.2, d)), a * vC.a); }`,
  });
  const p = new THREE.Points(geom, mat); p.frustumCulled = false; p.renderOrder = 5; world.scene.add(p);
  const G = [0.24, 0.85, 0.43], A = [1, 0.7, 0.28], Rd = [1, 0.3, 0.28];
  return {
    n,
    frame(now, on) {
      p.visible = on; if (!on) return;
      const t = now / 1000;
      for (let i = 0; i < n; i++) {
        const ph = (t + pts[i][2] * 0.61) % 56, c = ph < 25 ? G : ph < 28 ? A : Rd;
        col[i * 4] = c[0]; col[i * 4 + 1] = c[1]; col[i * 4 + 2] = c[2]; col[i * 4 + 3] = 1;
      }
      geom.attributes.pcol.needsUpdate = true;
    },
  };
}
