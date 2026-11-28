// A real 360° street photo (Mapillary, CC BY-SA 4.0) on the inside of a sphere: drag to look around,
// pinch or wheel to zoom. Renders only when something changed. lookAt(bearing) turns to a compass bearing.
import * as THREE from 'three';
// follow: another pano to mirror (same compass bearing, tilt and zoom), for a 'then' photo under a divider.
export function createPano(box, { url, heading = 0, bearing = 0, onFail, onLoad, follow = null, cls = '' }) {
  const cv = document.createElement('canvas'); cv.className = 'pano-cv' + (cls ? ' ' + cls : ''); box.append(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'low-power' });
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(72, 1, 1, 1100);
  const geo = new THREE.SphereGeometry(500, 60, 40); geo.scale(-1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x0b1220 }); scene.add(new THREE.Mesh(geo, mat));
  // image column u faces compass bearing heading + (u − 0.5)·360; three's lon θ shows column θ/360
  const lonFor = b => 180 + (b - heading);
  let lon = lonFor(bearing), lat = 0, fov = 72, dirty = true, raf = 0, alive = true, spin = null;
  const tex = new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true; dirty = true; onLoad && onLoad(); }, undefined, () => onFail && onFail());
  const size = () => { const w = box.clientWidth, h = box.clientHeight; r.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); dirty = true; };
  size();
  const ptr = new Map(); let g = null;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); spin = null;
    g = ptr.size === 1 ? { x: e.clientX, y: e.clientY, lon, lat } : (() => { const [a, b] = [...ptr.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), fov }; })(); });
  cv.addEventListener('pointermove', e => {
    if (!ptr.has(e.pointerId) || !g) return; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.size === 1 && g.x != null) { const k = fov / box.clientHeight; lon = g.lon - (e.clientX - g.x) * k; lat = Math.max(-80, Math.min(80, g.lat + (e.clientY - g.y) * k)); }
    else if (ptr.size >= 2 && g.d) { const [a, b] = [...ptr.values()]; fov = Math.max(30, Math.min(95, g.fov * g.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)))); cam.fov = fov; cam.updateProjectionMatrix(); }
    dirty = true;
  });
  const up = e => { ptr.delete(e.pointerId); g = ptr.size === 1 ? (() => { const [q] = [...ptr.values()]; return { x: q.x, y: q.y, lon, lat }; })() : null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); fov = Math.max(30, Math.min(95, fov * Math.exp(e.deltaY * 0.001))); cam.fov = fov; cam.updateProjectionMatrix(); dirty = true; }, { passive: false });
  const ro = new ResizeObserver(size); ro.observe(box);
  const v = new THREE.Vector3();
  const loop = now => {
    if (!alive) return;
    if (follow) { const v = follow.view(), nl = lonFor(follow.bearing()); if (Math.abs(nl - lon) > 1e-3 || v.lat !== lat || v.fov !== fov) { lon = nl; lat = v.lat; if (v.fov !== fov) { fov = v.fov; cam.fov = fov; cam.updateProjectionMatrix(); } dirty = true; } }
    if (spin) { const u = Math.min(1, (now - spin.t0) / spin.ms), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; lon = spin.from + spin.by * e; dirty = true; if (u >= 1) spin = null; }
    if (dirty) { const phi = THREE.MathUtils.degToRad(90 - lat), th = THREE.MathUtils.degToRad(lon); v.set(500 * Math.sin(phi) * Math.cos(th), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(th)); cam.lookAt(v); r.render(scene, cam); dirty = false; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    lookAt(b) { lon = lonFor(b); dirty = true; },
    sweep(by = 360, ms = 6000) { spin = { t0: performance.now(), from: lon, by, ms }; },
    view() { return { lat, fov }; },
    bearing() { return ((lon - 180 + heading) % 360 + 360) % 360; },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); tex.dispose(); geo.dispose(); mat.dispose(); r.dispose(); r.forceContextLoss?.(); cv.remove(); },
  };
}
