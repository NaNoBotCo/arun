// Canvas-made textures: the ground map (land colour, parks, pagoda grounds, roads; water cut out as
// alpha), map icons, a cloud puff and a rain-curtain streak pattern.

export const LAND = '#c4bd8a';

export function extentOf(geo, which, terrain) {
  if (which === 'inner') {
    const g = terrain.grid;
    return { x0: (g.west - geo.origin.lon) * geo.kx, x1: (g.east - geo.origin.lon) * geo.kx, y0: (g.south - geo.origin.lat) * geo.ky, y1: (g.north - geo.origin.lat) * geo.ky };
  }
  const e = geo.extent;
  return { x0: (e.west - geo.origin.lon) * geo.kx, x1: (e.east - geo.origin.lon) * geo.kx, y0: (e.south - geo.origin.lat) * geo.ky, y1: (e.north - geo.origin.lat) * geo.ky };
}

// Land tint from the satellite water record and the surface model: fields that flood in the wet
// season read greener; a soft shade from the surface slope gives the land some relief.
function terrainTint(terrain) {
  const { w, h, z, occ, water } = terrain;
  const img = new ImageData(w, h);
  const base = [214, 202, 168], wet = [128, 168, 98], urb = [226, 218, 200];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c;
    let o = occ[i] > 100 ? 0 : occ[i] / 100;
    if (water[i]) o = 0;
    const zz = z[i], zl = z[Math.max(0, i - 1)], zu = z[Math.max(0, i - w)];
    const shade = Math.max(-0.12, Math.min(0.12, ((zz - zl) + (zz - zu)) * 0.02));
    const rough = Math.min(1, Math.abs(zz - zl) / 6);           // surface roughness: built-up
    const k = Math.min(1, o * 1.6);
    for (let ch = 0; ch < 3; ch++) {
      let v = base[ch] * (1 - k) + wet[ch] * k;
      v = v * (1 - rough * 0.5) + urb[ch] * rough * 0.5;
      img.data[i * 4 + ch] = Math.max(0, Math.min(255, v * (1 + shade)));
    }
    img.data[i * 4 + 3] = 255;
  }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}

export function paintGround(W, H, ext, geo, terrain, detail) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const sx = W / (ext.x1 - ext.x0), sy = H / (ext.y1 - ext.y0);
  const path = (flat, close) => {
    ctx.moveTo((flat[0] - ext.x0) * sx, (ext.y1 - flat[1]) * sy);
    for (let i = 2; i < flat.length; i += 2) ctx.lineTo((flat[i] - ext.x0) * sx, (ext.y1 - flat[i + 1]) * sy);
    if (close) ctx.closePath();
  };
  ctx.fillStyle = LAND; ctx.fillRect(0, 0, W, H);
  if (terrain) {
    const tint = terrainTint(terrain), te = extentOf(geo, 'inner', terrain);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tint, (te.x0 - ext.x0) * sx, (ext.y1 - te.y1) * sy, (te.x1 - te.x0) * sx, (te.y1 - te.y0) * sy);
  }
  ctx.fillStyle = '#6f9e5a'; ctx.beginPath(); for (const p of geo.parks) path(p, true); ctx.fill('nonzero');
  ctx.fillStyle = '#c9a86a'; ctx.beginPath(); for (const p of geo.wats) path(p, true); ctx.fill('nonzero');
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const roads = [['minor', '#e6dbc4', 9], ['major', '#f1e4c4', 15]];
  if (detail) roads.unshift(['streets', '#ddd1b8', 6]);
  for (const [k, col, wm] of roads) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(detail ? 0.9 : 0.7, wm * sx);
    ctx.beginPath(); for (const p of geo[k]) path(p, false); ctx.stroke();
  }
  // water: cut out, so the shader can draw it
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000'; ctx.beginPath(); for (const p of geo.water) path(p, true); ctx.fill('nonzero');
  ctx.globalCompositeOperation = 'source-over';
  return cv;
}

export function iconCanvas(kind, color, size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'), m = size / 2;
  c.shadowColor = color; c.shadowBlur = size * 0.12;
  c.fillStyle = 'rgba(11,18,32,0.86)'; c.strokeStyle = color; c.lineWidth = size * 0.07;
  const ring = r => { c.beginPath(); c.arc(m, m, r, 0, Math.PI * 2); c.fill(); c.stroke(); };
  if (kind === 'facility') {
    c.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.lineTo(m + Math.cos(a) * m * 0.78, m + Math.sin(a) * m * 0.78); }
    c.closePath(); c.fill(); c.stroke(); c.shadowBlur = 0;
    c.fillStyle = color; c.fillRect(m - size * 0.16, m - size * 0.2, size * 0.32, size * 0.4);
    c.fillStyle = 'rgba(11,18,32,0.9)';
    for (let r = 0; r < 3; r++) for (let q = 0; q < 2; q++) c.fillRect(m - size * 0.11 + q * size * 0.13, m - size * 0.15 + r * size * 0.12, size * 0.08, size * 0.07);
    return cv;
  }
  if (kind === 'compute') {
    ring(m * 0.7); c.shadowBlur = 0; c.fillStyle = color;
    for (let r = 0; r < 3; r++) c.fillRect(m - size * 0.2, m - size * 0.17 + r * size * 0.13, size * 0.4, size * 0.08);
    return cv;
  }
  if (kind === 'river') {
    c.beginPath(); c.moveTo(m, m * 0.25); c.lineTo(m * 1.72, m); c.lineTo(m, m * 1.75); c.lineTo(m * 0.28, m); c.closePath(); c.fill(); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = color; c.lineWidth = size * 0.05;
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(m - size * 0.18, m - size * 0.08 + k * size * 0.09); c.lineTo(m + size * 0.18, m - size * 0.08 + k * size * 0.09); c.stroke(); }
    return cv;
  }
  ring(m * 0.66); c.shadowBlur = 0;
  if (kind === 'camera') {
    c.fillStyle = color; c.beginPath(); c.arc(m, m, size * 0.15, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(11,18,32,0.9)'; c.beginPath(); c.arc(m, m, size * 0.07, 0, Math.PI * 2); c.fill();
  } else {
    c.fillStyle = color; c.beginPath();
    c.moveTo(m, m - size * 0.2); c.bezierCurveTo(m + size * 0.18, m, m + size * 0.14, m + size * 0.17, m, m + size * 0.17);
    c.bezierCurveTo(m - size * 0.14, m + size * 0.17, m - size * 0.18, m, m, m - size * 0.2); c.fill();
  }
  return cv;
}

export function cloudCanvas(size = 256, seed = 3) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 60; k++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * size * 0.28, rad = size * (0.09 + r() * 0.16);
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d * 0.75;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  }
  return cv;
}

export function streakCanvas(w = 64, h = 256, seed = 5) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, w, h);
  for (let k = 0; k < 140; k++) {
    const x = r() * w, y = r() * h, len = 18 + r() * 60, a = 0.25 + r() * 0.5;
    c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 0.6 + r() * 0.9;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - len * 0.08, y + len); c.stroke();
    c.beginPath(); c.moveTo(x, y - h); c.lineTo(x - len * 0.08, y - h + len); c.stroke();
  }
  return cv;
}
