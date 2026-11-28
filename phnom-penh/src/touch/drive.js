// Real drive times on tap: Mapbox Directions (driving-traffic) between two camera corners.
// Asked when a person taps; the answer lives only in memory until the card closes (Mapbox Product Terms 1.9, 2.10.1);
// shown with the Mapbox logo and credit (1.4). The route is drawn on the map, coloured by
// Mapbox's congestion level for each stretch.
import * as THREE from 'three';

export const CONG = { low: '#3ccf6e', moderate: '#f5c451', heavy: '#ff7a3d', severe: '#d6283b', unknown: '#8a93a3' };

export function createDrive(world, geo, token) {
  const toLocal = (lon, lat) => ({ x: (lon - geo.origin.lon) * geo.kx, y: (lat - geo.origin.lat) * geo.ky });
  const toLL = (x, y) => [geo.origin.lon + x / geo.kx, geo.origin.lat + y / geo.ky];
  const U = { uW: { value: 10 } };
  const vs = `attribute vec2 side; attribute vec3 col; varying vec3 vC; uniform float uW, uK;
    void main(){ vC = col; vec3 p = position; p.xz += side * uW * uK; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
  const mk = (k, dark) => new THREE.ShaderMaterial({
    uniforms: { uW: U.uW, uK: { value: k } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: vs, fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(${dark ? 'vec3(0.03,0.05,0.09)' : 'vC'}, ${dark ? '0.85' : '1.0'}); }`,
  });
  const geom = new THREE.BufferGeometry();
  const edge = new THREE.Mesh(geom, mk(1.8, true)), line = new THREE.Mesh(geom, mk(1, false));
  for (const m of [edge, line]) { m.frustumCulled = false; m.visible = false; world.scene.add(m); }
  edge.renderOrder = 7; line.renderOrder = 8;
  let busy = false, ctl = null;

  function draw(pts, cong) {
    const P = [], S = [], C = [], I = [];
    const c3 = s => { const c = new THREE.Color(CONG[s] || CONG.unknown); return [c.r, c.g, c.b]; };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
      if (L < 0.5) continue;
      const nx = -dy / L, nz = -dx / L;            // perpendicular in the x / −y plane the scene uses
      const ex = dx / L * 0.6, ey = dy / L * 0.6;   // a little overlap so the joins don't gap
      const c = c3(cong[i]), v = P.length / 3;
      for (const [p, e] of [[a, -1], [b, 1]]) for (const s of [1, -1]) { P.push(p.x + e * ex, 14, -(p.y + e * ey)); S.push(nx * s, nz * s); C.push(...c); }
      I.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geom.setAttribute('side', new THREE.Float32BufferAttribute(S, 2));
    geom.setAttribute('col', new THREE.Float32BufferAttribute(C, 3));
    geom.setIndex(I); geom.computeBoundingSphere();
    edge.visible = line.visible = true;
  }

  return {
    get on() { return !!token; },
    get busy() { return busy; },
    get shown() { return line.visible; },
    // a = {x, y}, b = {x, y} in local metres. Resolves { km, min, usualMin, cong: {level: share}, pts } or rejects with { why }.
    async ask(a, b) {
      if (!token) throw { why: 'off' };
      if (busy) throw { why: 'busy' };
      if (!navigator.onLine) throw { why: 'offline' };
      busy = true; ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 9000);
      try {
        const [x0, y0] = toLL(a.x, a.y), [x1, y1] = toLL(b.x, b.y);
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${x0.toFixed(5)},${y0.toFixed(5)};${x1.toFixed(5)},${y1.toFixed(5)}`
          + `?annotations=congestion&overview=full&geometries=geojson&access_token=${encodeURIComponent(token)}`;
        let r;
        try { r = await fetch(url, { signal: ctl.signal, cache: 'no-store', referrerPolicy: 'origin' }); }
        catch { throw { why: navigator.onLine ? 'fail' : 'offline' }; }
        if (r.status === 429) throw { why: 'limit' };
        const js = await r.json().catch(() => null);
        if (!r.ok || !js || js.code !== 'Ok' || !js.routes || !js.routes[0]) throw { why: 'fail' };
        const rt = js.routes[0], cong = rt.legs.flatMap(l => (l.annotation && l.annotation.congestion) || []);
        const pts = rt.geometry.coordinates.map(([lon, lat]) => toLocal(lon, lat));
        const share = {}; for (const c of cong) share[c] = (share[c] || 0) + 1;
        for (const k in share) share[k] /= cong.length || 1;
        draw(pts, cong);
        return { km: rt.distance / 1000, min: rt.duration / 60, usualMin: rt.duration_typical != null ? rt.duration_typical / 60 : null, share, pts };
      } finally { clearTimeout(t); busy = false; ctl = null; }
    },
    clear() { if (ctl) ctl.abort(); edge.visible = line.visible = false; },
    // a line about 6 px wide on screen at any zoom
    frame(dist, cam) { const H = cam.view && cam.view.enabled ? cam.view.fullHeight : innerHeight; U.uW.value = 3 * 2 * dist * Math.tan(cam.fov * Math.PI / 360) / H; },
    feedback(x, y, zoom = 14) { const [lon, lat] = toLL(x, y); return `https://apps.mapbox.com/feedback/#/${lon.toFixed(5)}/${lat.toFixed(5)}/${zoom}`; },
  };
}
