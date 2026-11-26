// Draws the fictional watershed: shaded terrain coloured by land cover, water depth, the wetland, assets and rain.

const cache = new WeakMap();

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function terrainCanvas(region) {
  if (cache.has(region)) return cache.get(region);
  const { N, z, urban, farm, forest, channel } = region;
  // Draw at 4× the grid with bilinear heights, hillshade and 10 m contours.
  const K = 4;
  const M = N * K;
  const c = document.createElement('canvas');
  c.width = M;
  c.height = M;
  const g = c.getContext('2d');
  const img = g.createImageData(M, M);
  const zs = new Float32Array(M * M);
  const bil = (arr, fx, fy) => {
    const x0 = Math.min(N - 2, Math.max(0, Math.floor(fx))), y0 = Math.min(N - 2, Math.max(0, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const a = arr[y0 * N + x0], b = arr[y0 * N + x0 + 1], cc = arr[(y0 + 1) * N + x0], d = arr[(y0 + 1) * N + x0 + 1];
    return a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty;
  };
  let zmin = Infinity, zmax = -Infinity;
  for (const v of z) {
    if (v < zmin) zmin = v;
    if (v > zmax) zmax = v;
  }
  for (let y = 0; y < M; y++)
    for (let x = 0; x < M; x++) zs[y * M + x] = bil(z, (x + 0.5) / K - 0.5, (y + 0.5) / K - 0.5);
  const dx = region.cellSize_m / K;
  for (let y = 0; y < M; y++)
    for (let x = 0; x < M; x++) {
      const i = y * M + x;
      const fx = (x + 0.5) / K - 0.5, fy = (y + 0.5) / K - 0.5;
      const zl = zs[y * M + Math.max(0, x - 1)], zr = zs[y * M + Math.min(M - 1, x + 1)];
      const zu = zs[Math.max(0, y - 1) * M + x], zd = zs[Math.min(M - 1, y + 1) * M + x];
      const nx = (-(zr - zl) / (2 * dx)) * 3.5, ny = (-(zd - zu) / (2 * dx)) * 3.5;
      const len = Math.hypot(nx, ny, 1);
      const shade = Math.max(0, (nx * -0.55 + ny * -0.55 + 0.63) / len);
      const e = (zs[i] - zmin) / (zmax - zmin || 1);
      const fo = bil(forest, fx, fy), fa = bil(farm, fx, fy), ur = bil(urban, fx, fy);
      let r = 34 * fo + 176 * fa + 148 * ur;
      let gg = 98 * fo + 200 * fa + 142 * ur;
      let b = 70 * fo + 96 * fa + 182 * ur;
      const ch = bil(channel, fx, fy);
      r = lerp(r, 205, ch * 0.8);
      gg = lerp(gg, 182, ch * 0.8);
      b = lerp(b, 128, ch * 0.8);
      r = lerp(r, 150, e * 0.4);
      gg = lerp(gg, 152, e * 0.4);
      b = lerp(b, 196, e * 0.4);
      let k = 0.42 + 0.9 * shade;
      // Contour every 10 m, a heavier line every 50 m.
      const zc = zs[i];
      const step = Math.floor(zc / 10) !== Math.floor(zr / 10) || Math.floor(zc / 10) !== Math.floor(zd / 10);
      if (step) k *= Math.floor(Math.max(zc, zr, zd) / 10) % 5 === 0 ? 0.62 : 0.8;
      const o = i * 4;
      img.data[o] = Math.min(255, r * k);
      img.data[o + 1] = Math.min(255, gg * k);
      img.data[o + 2] = Math.min(255, b * k);
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  cache.set(region, c);
  return c;
}

export function createWaterLayer(N) {
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  return {
    canvas: c,
    paint(h, minDepth = 0.02) {
      const d = img.data;
      for (let i = 0; i < N * N; i++) {
        const w = h[i];
        const o = i * 4;
        if (w < minDepth) {
          d[o + 3] = 0;
          continue;
        }
        const t = Math.min(1, w / 1.2);
        d[o] = lerp(120, 12, t);
        d[o + 1] = lerp(226, 86, t);
        d[o + 2] = lerp(255, 196, t);
        d[o + 3] = Math.min(235, 70 + 230 * Math.min(1, w / 0.6));
      }
      g.putImageData(img, 0, 0);
    },
  };
}

const ICON = { hotel: 'H', farm: 'F', factory: 'P', substation: 'S' };

// Draw one map panel into a 2D context at (x0, y0) with side `size` (device pixels).
export function drawPanel(g, region, layer, o) {
  const { N } = region;
  const { x0, y0, size, dpr = 1 } = o;
  const cell = size / N;
  g.save();
  g.beginPath();
  g.roundRect ? g.roundRect(x0, y0, size, size, 14 * dpr) : g.rect(x0, y0, size, size);
  g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(terrainCanvas(region), x0, y0, size, size);
  g.drawImage(layer.canvas, x0, y0, size, size);
  if (o.wet) {
    const { cx, cy, r, fill } = o.wet;
    const px = x0 + (cx + 0.5) * cell, py = y0 + (cy + 0.5) * cell;
    g.strokeStyle = 'rgba(62,224,154,0.95)';
    g.lineWidth = 2.5 * dpr;
    g.setLineDash([6 * dpr, 4 * dpr]);
    g.beginPath();
    g.arc(px, py, (r + 0.5) * cell, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    if (fill > 0) {
      g.fillStyle = `rgba(62,224,154,${0.12 + 0.3 * fill})`;
      g.beginPath();
      g.moveTo(px, py);
      g.arc(px, py, (r + 0.5) * cell, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, fill));
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(62,224,154,1)';
    g.font = `700 ${11 * dpr}px ${o.font || 'sans-serif'}`;
    g.textAlign = 'center';
    g.fillText('wetland', px, py - (r + 1.4) * cell);
  }
  if (o.rain > 0 && o.drops) {
    g.strokeStyle = 'rgba(200,230,255,0.35)';
    g.lineWidth = 1 * dpr;
    g.beginPath();
    for (const d of o.drops) {
      const px = x0 + d.x * size, py = y0 + d.y * size;
      g.moveTo(px, py);
      g.lineTo(px - 2 * dpr, py + 9 * dpr);
    }
    g.stroke();
  }
  for (let k = 0; k < region.assets.length; k++) {
    const a = region.assets[k];
    const st = o.assets ? o.assets[k] : null;
    const ax = a.cell % N, ay = Math.floor(a.cell / N);
    const px = x0 + (ax + 0.5) * cell, py = y0 + (ay + 0.5) * cell;
    const wetNow = st && st.depth > a.threshold_m;
    const rr = 9 * dpr;
    if (wetNow) {
      const pulse = 1 + 0.25 * Math.sin((o.time || 0) * 6);
      g.fillStyle = 'rgba(255,107,107,0.28)';
      g.beginPath();
      g.arc(px, py, rr * 1.9 * pulse, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = wetNow ? '#ff6b6b' : 'rgba(16,18,48,0.88)';
    g.strokeStyle = wetNow ? '#fff' : '#ffb84d';
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.arc(px, py, rr, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = `700 ${10 * dpr}px ${o.font || 'sans-serif'}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ICON[a.id] || '?', px, py + 0.5 * dpr);
    g.textBaseline = 'alphabetic';
  }
  g.restore();
  g.strokeStyle = 'rgba(166,176,255,0.35)';
  g.lineWidth = 1 * dpr;
  g.beginPath();
  g.roundRect ? g.roundRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1, 14 * dpr) : g.rect(x0, y0, size, size);
  g.stroke();
}

export function cellFromPoint(region, o, px, py) {
  const { N } = region;
  const cell = o.size / N;
  const x = Math.floor((px - o.x0) / cell), y = Math.floor((py - o.y0) / cell);
  if (x < 0 || y < 0 || x >= N || y >= N) return null;
  return { x, y };
}
