// Real data on the map, on touches people already make: bus lines and stops (OpenStreetMap), the area a car
// reaches in ten minutes now (Mapbox isochrone, asked on tap), places and people under a possible river level,
// and live readings (OpenAQ sensors, Open-Meteo) through the arun-live worker.
import * as THREE from 'three';

export const LIVE_URL = 'https://arun-live.nanobotco.workers.dev/now';
const PALETTE = ['#4fc3f7', '#ffb347', '#a98bff', '#5fd4e6', '#f06292', '#9ccc65', '#ffd54f', '#7986cb', '#4db6ac', '#e57373'];

// screen-width ribbons along polylines: lines = [{ pts: [[x, y], …], col: '#hex' }]
function ribbon(world, { px = 2, y = 12, order = 6, alpha = 1, dark = false }) {
  const U = { uW: { value: 5 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: `attribute vec2 side; attribute vec3 col; varying vec3 vC; uniform float uW; void main(){ vC = col; vec3 p = position; p.xz += side * uW; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(${dark ? 'vec3(0.03,0.05,0.09)' : 'vC'}, ${alpha.toFixed(2)}); }`,
  });
  const geom = new THREE.BufferGeometry(), mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false; world.scene.add(mesh);
  return {
    set(lines) {
      const P = [], S = [], C = [], I = [];
      for (const { pts, col } of lines) {
        const c = new THREE.Color(col);
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
          if (L < 0.5) continue;
          const nx = -dy / L, nz = -dx / L, ex = dx / L * 0.5, ey = dy / L * 0.5, v = P.length / 3;
          for (const [qx, qy, e] of [[ax, ay, -1], [bx, by, 1]]) for (const s of [1, -1]) { P.push(qx + e * ex, y, -(qy + e * ey)); S.push(nx * s, nz * s); C.push(c.r, c.g, c.b); }
          I.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        }
      }
      geom.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geom.setAttribute('side', new THREE.Float32BufferAttribute(S, 2));
      geom.setAttribute('col', new THREE.Float32BufferAttribute(C, 3));
      geom.setIndex(I); mesh.visible = I.length > 0;
    },
    clear() { mesh.visible = false; },
    get on() { return mesh.visible; },
    show(v) { if (geom.index) mesh.visible = v && geom.index.count > 0; },
    frame(dist, cam) { const H = cam.view && cam.view.enabled ? cam.view.fullHeight : innerHeight; U.uW.value = (px / 2) * 2 * dist * Math.tan(cam.fov * Math.PI / 360) / H; },
  };
}
const flatPairs = a => { const o = []; for (let i = 0; i + 1 < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };

// ---------- buses ----------
export function createBuses(world, B) {
  const colOf = (r, i) => r.colour || PALETTE[i % PALETTE.length];
  const all = ribbon(world, { px: 2.2, y: 10, order: 4, alpha: 0.75 });
  const selEdge = ribbon(world, { px: 7, y: 11, order: 5, dark: true, alpha: 0.85 }), sel = ribbon(world, { px: 4, y: 12, order: 6 });
  all.set(B.routes.flatMap((r, i) => r.lines.map(l => ({ pts: flatPairs(l), col: colOf(r, i) }))));
  const n = B.stops.length, pos = new Float32Array(n * 3);
  B.stops.forEach((s, i) => { pos[i * 3] = s.x; pos[i * 3 + 1] = 13; pos[i * 3 + 2] = -s.y; });
  const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const U = { uPx: { value: world.renderer.getPixelRatio() } };
  const pts = new THREE.Points(geom, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: `uniform float uPx; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = 7.0 * uPx; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = d < 0.28 ? vec4(1.0) : vec4(0.04,0.07,0.13,0.95); }`,
  }));
  pts.frustumCulled = false; pts.renderOrder = 7; pts.visible = false; world.scene.add(pts);
  let near = false, picked = -1;
  return {
    colOf: i => colOf(B.routes[i], i),
    get near() { return near; },
    frame(dist, cam, on) {
      near = on && dist < 9000;
      all.show(near); pts.visible = near; all.frame(dist, cam);
      sel.show(picked >= 0); selEdge.show(picked >= 0); sel.frame(dist, cam); selEdge.frame(dist, cam);
    },
    pick(project, cx, cy, radius = 22) {
      if (!near) return -1;
      let best = -1, bd = radius;
      B.stops.forEach((s, i) => { const p = project(s.x, s.y, 13); if (!p.on) return; const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = i; } });
      return best;
    },
    select(i) {
      picked = i;
      if (i < 0) { sel.clear(); selEdge.clear(); return; }
      const lines = B.stops[i].r.flatMap(ri => B.routes[ri].lines.map(l => ({ pts: flatPairs(l), col: colOf(B.routes[ri], ri) })));
      sel.set(lines); selEdge.set(lines);
    },
  };
}

// ---------- places (hospitals, schools, markets) shown as dots, e.g. the ones under a possible river level ----------
export const PLACE_COL = { h: '#ff5a6e', s: '#ffd54f', m: '#5fd4e6' };
export function createSpots(world) {
  const max = 2000, pos = new Float32Array(max * 3), col = new Float32Array(max * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geom.setAttribute('col', new THREE.BufferAttribute(col, 3));
  const U = { uPx: { value: world.renderer.getPixelRatio() } };
  const p = new THREE.Points(geom, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: `attribute vec3 col; varying vec3 vC; uniform float uPx; void main(){ vC = col; gl_PointSize = 9.0 * uPx; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = d < 0.3 ? vec4(vC, 1.0) : vec4(0.04,0.07,0.13,0.95); }`,
  }));
  p.frustumCulled = false; p.renderOrder = 8; p.visible = false; world.scene.add(p);
  return {
    set(list) {
      const n = Math.min(max, list.length);
      for (let i = 0; i < n; i++) { const [x, y, k] = list[i], c = new THREE.Color(PLACE_COL[k] || '#fff'); pos.set([x, 15, -y], i * 3); col.set([c.r, c.g, c.b], i * 3); }
      geom.setDrawRange(0, n); geom.attributes.position.needsUpdate = true; geom.attributes.col.needsUpdate = true; p.visible = n > 0;
    },
    clear() { p.visible = false; },
  };
}

// ---------- an area on the ground (the ten-minute drive): translucent fill + outline ----------
export function createArea(world) {
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), fillMat); fill.renderOrder = 5; fill.visible = false; fill.frustumCulled = false; world.scene.add(fill);
  const edge = ribbon(world, { px: 3, y: 13, order: 6 });
  return {
    set(rings) {
      const shapes = rings.map(r => new THREE.Shape(r.map(([x, y]) => new THREE.Vector2(x, y))));
      const g = new THREE.ShapeGeometry(shapes); g.rotateX(-Math.PI / 2); g.translate(0, 11, 0);
      fill.geometry.dispose(); fill.geometry = g; fill.visible = true;
      edge.set(rings.map(r => ({ pts: [...r, r[0]], col: '#4fc3f7' })));
    },
    clear() { fill.visible = false; edge.clear(); },
    frame(dist, cam) { edge.frame(dist, cam); },
  };
}

// ray-cast point in polygon (ring of [x, y])
export function inRing(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ---------- live readings through the worker ----------
export async function fetchLive(ms = 8000) {
  if (!navigator.onLine) throw { why: 'offline' };
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(LIVE_URL, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw { why: 'fail' };
    return await r.json();
  } catch (e) { throw e && e.why ? e : { why: navigator.onLine ? 'fail' : 'offline' }; }
  finally { clearTimeout(t); }
}

// ---------- the ten-minute drive area from Mapbox ----------
export async function fetchIsochrone(token, geo, x, y, minutes = 10, ms = 9000) {
  if (!token) throw { why: 'off' };
  if (!navigator.onLine) throw { why: 'offline' };
  const lon = geo.origin.lon + x / geo.kx, lat = geo.origin.lat + y / geo.ky;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const url = `https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/${lon.toFixed(5)},${lat.toFixed(5)}?contours_minutes=${minutes}&polygons=true&denoise=1&access_token=${encodeURIComponent(token)}`;
    let r; try { r = await fetch(url, { signal: ctl.signal, cache: 'no-store', referrerPolicy: 'origin' }); } catch { throw { why: navigator.onLine ? 'fail' : 'offline' }; }
    if (r.status === 429) throw { why: 'limit' };
    const js = await r.json().catch(() => null);
    const f = js && js.features && js.features[0];
    if (!r.ok || !f) throw { why: 'fail' };
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const L = ([lo, la]) => [(lo - geo.origin.lon) * geo.kx, (la - geo.origin.lat) * geo.ky];
    return polys.map(p => p[0].map(L));   // outer rings only
  } finally { clearTimeout(t); }
}
