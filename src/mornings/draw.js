// Painting for #mornings and #minutes. The city layer is an illustration cached once per size;
// everything drawn over it (streets in minutes, routes, the race, rings) comes from computed state.

import { N, EDGES, OPTIONS, PLACES } from './city.js';
import { makeCity, makeView, riverCentre, RIVER_HALF, BOUNDS } from './geometry.js';

export const INK = {
  today: '#ffcf6e',
  change: '#4df0a8',
  todayDim: 'rgba(255, 207, 110, 0.55)',
  label: '#fbfff4',
  halo: 'rgba(6, 22, 20, 0.92)',
  ring: 'rgba(200, 236, 222, 0.34)',
  ringText: '#d9efe4',
  pin: '#ff7a9a',
};
const ROOFS = ['#c7643f', '#d98b4a', '#e9d3a8', '#7f9db4', '#b9503c'];
const STALLS = ['#e85d4a', '#f2b33d', '#3fb6a8', '#f1efe6'];
const TREES = ['#2f8f4e', '#4aa95a', '#1f7445'];
const FIELDS = ['#8fcf5a', '#a9d965', '#6fbf4f', '#c8d96a'];

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1);
  const b = p(c2);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
};

export function createRenderer(canvas) {
  const g = canvas.getContext('2d');
  const city = makeCity();
  let view = null;
  let layer = null;
  let geoPx = null; // screen position of every corner on the street map
  let box = null; // { w, h, top, bottom, dpr }

  function poly(c, pts, fill, stroke, lw = 1) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw;
      c.stroke();
    }
  }
  function line(c, pts, col, width, dash) {
    if (pts.length < 2) return;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.strokeStyle = col;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.setLineDash(dash || []);
    c.stroke();
    c.setLineDash([]);
  }

  // ---------- the illustration ----------
  function paintCity() {
    const { w, h } = box;
    layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const c = layer.getContext('2d');
    const S = view.s;
    const P = (x, y, z) => view.pt(x, y, z);
    // Ground in morning light: warm at the far edge, greener toward the viewer.
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#b9d98c');
    gr.addColorStop(0.35, '#7fbf63');
    gr.addColorStop(1, '#4f9a4c');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    // Fields with bunds.
    for (const f of city.fields) poly(c, f.pts.map(([x, y]) => P(x, y)), FIELDS[f.tone], 'rgba(244, 238, 196, 0.85)', Math.max(1, 1.1 * S));
    // Town ground under the blocks.
    const corner = (i) => [city.plane[2 * i], city.plane[2 * i + 1]];
    const hullW = [corner(0), corner(4), corner(74), corner(70)];
    const hullE = [corner(5), corner(9), corner(79), corner(75)];
    for (const hq of [hullW, hullE]) poly(c, hq.map(([x, y]) => P(x, y)), '#d9cfb4');
    // River with banks and light on the water.
    const left = [];
    const right = [];
    for (let y = BOUNDS.y0 - 0.3; y <= BOUNDS.y1 + 0.3; y += 0.1) {
      left.push(P(riverCentre(y) - RIVER_HALF - 0.08, y));
      right.push(P(riverCentre(y) + RIVER_HALF + 0.08, y));
    }
    poly(c, [...left, ...right.slice().reverse()], '#e8dcae');
    const lw = [];
    const rw = [];
    for (let y = BOUNDS.y0 - 0.3; y <= BOUNDS.y1 + 0.3; y += 0.1) {
      lw.push(P(riverCentre(y) - RIVER_HALF, y));
      rw.push(P(riverCentre(y) + RIVER_HALF, y));
    }
    const water = c.createLinearGradient(lw[0][0], 0, rw[0][0], 0);
    water.addColorStop(0, '#1f8fb0');
    water.addColorStop(0.5, '#2bb3cf');
    water.addColorStop(1, '#1a7fa6');
    poly(c, [...lw, ...rw.slice().reverse()], water);
    for (let k = 1; k < 6; k++) {
      const pts = [];
      for (let y = BOUNDS.y0; y <= BOUNDS.y1; y += 0.1) pts.push(P(riverCentre(y) - RIVER_HALF + (k * 2 * RIVER_HALF) / 6 + 0.04 * Math.sin(y * 3 + k), y));
      line(c, pts, k % 2 ? 'rgba(220, 250, 255, 0.28)' : 'rgba(220, 250, 255, 0.14)', Math.max(1, 1.2 * S), [6 * S, 9 * S]);
    }
    // Blocks.
    for (const b of city.blocks) {
      const fill = b.kind === 'park' ? '#5cb85c' : b.kind === 'market' ? '#efe1bd' : '#cfc3a4';
      poly(c, b.inner.map(([x, y]) => P(x, y)), fill, 'rgba(120, 104, 70, 0.35)', Math.max(1, 0.8 * S));
    }
    // Streets from the graph.
    for (const e of EDGES) {
      const a = P(city.plane[2 * e.a], city.plane[2 * e.a + 1]);
      const b = P(city.plane[2 * e.b], city.plane[2 * e.b + 1]);
      const bridge = e.type === 'bridge';
      line(c, [a, b], bridge ? '#6b5a46' : '#8e8576', (bridge ? 11 : 8.5) * S);
      line(c, [a, b], bridge ? '#d8c8a2' : '#f4efe2', (bridge ? 8 : 6) * S);
      if (!bridge) line(c, [a, b], 'rgba(150, 140, 120, 0.55)', Math.max(1, 0.8 * S), [4 * S, 6 * S]);
    }
    // Stalls.
    for (const st of city.stalls) {
      const base = st.pts.map(([x, y]) => P(x, y));
      const top = st.pts.map(([x, y]) => P(x, y, 3));
      poly(c, base.map(([x, y]) => [x - 2 * S, y - 1 * S]), 'rgba(40, 50, 30, 0.25)');
      poly(c, top, STALLS[st.c], 'rgba(60, 40, 20, 0.5)', Math.max(1, 0.6 * S));
    }
    // Trees and buildings, back to front, with low sun from the east casting west.
    const items = city.buildings.map((b) => ({ y: b.y, b })).concat(city.trees.map((t) => ({ y: t.y + t.r, t })));
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.t) {
        const t = it.t;
        const [x, y] = P(t.x, t.y);
        const rr = t.r * 52 * S;
        c.fillStyle = 'rgba(30, 60, 30, 0.28)';
        c.beginPath();
        c.ellipse(x - rr * 0.7, y + rr * 0.25, rr * 1.1, rr * 0.55, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = TREES[t.shade];
        c.beginPath();
        c.arc(x, y - rr * 0.8, rr, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255, 255, 210, 0.22)';
        c.beginPath();
        c.arc(x + rr * 0.3, y - rr * 1.1, rr * 0.5, 0, Math.PI * 2);
        c.fill();
        continue;
      }
      const b = it.b;
      const A = b.pts.map(([x, y]) => P(x, y));
      const T = b.pts.map(([x, y]) => P(x, y, b.h));
      const sh = b.h * 0.55 * S;
      poly(c, [A[0], A[1], A[2], A[3], [A[3][0] - sh, A[3][1] - sh * 0.18], [A[0][0] - sh, A[0][1] - sh * 0.18]], 'rgba(35, 45, 30, 0.22)');
      const clinic = b.roof === 'clinic';
      poly(c, [A[1], A[2], T[2], T[1]], clinic ? '#dfe9ea' : '#e9dcc0'); // east face, in the sun
      poly(c, [A[2], A[3], T[3], T[2]], clinic ? '#b9c9cc' : '#c4b393'); // south face
      poly(c, T, clinic ? '#f6fbfb' : ROOFS[b.roof], 'rgba(70, 45, 25, 0.4)', Math.max(1, 0.6 * S));
      if (clinic) {
        const [cx, cy] = [(T[0][0] + T[2][0]) / 2, (T[0][1] + T[2][1]) / 2];
        c.fillStyle = '#2bb3a0';
        c.fillRect(cx - 5 * S, cy - 1.6 * S, 10 * S, 3.2 * S);
        c.fillRect(cx - 1.6 * S, cy - 5 * S, 3.2 * S, 10 * S);
      } else if (b.h > 14) {
        for (let k = 1; k < Math.floor(b.h / 5); k++) {
          const f = k / Math.floor(b.h / 5);
          line(c, [lerpPt(A[2], T[2], f), lerpPt(A[3], T[3], f)], 'rgba(255, 248, 220, 0.45)', Math.max(1, 0.7 * S));
        }
      }
    }
    // A haze over the far edge.
    const hz = c.createLinearGradient(0, 0, 0, h * 0.25);
    hz.addColorStop(0, 'rgba(255, 236, 200, 0.45)');
    hz.addColorStop(1, 'rgba(255, 236, 200, 0)');
    c.fillStyle = hz;
    c.fillRect(0, 0, w, h * 0.25);
  }
  const lerpPt = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

  function resize(w, h, dpr, top, bottom) {
    box = { w, h, dpr, top, bottom };
    // Fit the town between the top tags and the bottom panel; fields run under both.
    const room = Math.max(60, h - top - bottom);
    const v = makeView(w, room, 4 * dpr);
    view = { s: v.s, pt: (x, y, z) => { const [a, b] = v.pt(x, y, z); return [a, b + top]; } };
    geoPx = new Float64Array(2 * N);
    for (let i = 0; i < N; i++) {
      const [x, y] = view.pt(city.plane[2 * i], city.plane[2 * i + 1]);
      geoPx[2 * i] = x;
      geoPx[2 * i + 1] = y;
    }
    paintCity();
  }

  // The free area between the top tags and the bottom panel, for the map in minutes.
  function frame() {
    const { w, h, top, bottom, dpr } = box;
    return { x: 10 * dpr, y: top + 14 * dpr, w: w - 20 * dpr, h: Math.max(40, h - top - bottom - 18 * dpr) };
  }

  // ---------- labels that do not collide ----------
  function placeLabels(items) {
    const { w, h, dpr } = box;
    const placed = [];
    const out = [];
    items.sort((a, b) => a.pri - b.pri);
    for (const it of items) {
      g.font = it.font;
      const tw = g.measureText(it.text).width + 8 * dpr;
      const th = (it.size || 13) * dpr + 6 * dpr;
      const d = (it.gap || 12) * dpr;
      const tries = it.cands ? it.cands.map((c) => [c[0], c[1], true]) : [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];
      let ok = null;
      for (const [ux, uy, abs] of tries) {
        const x = abs ? ux : it.x + ux * (d + (ux ? tw / 2 : 0));
        const y = abs ? uy : it.y + uy * (d + (uy ? th / 2 : 0));
        const r = { x0: x - tw / 2, x1: x + tw / 2, y0: y - th / 2, y1: y + th / 2 };
        if (r.x0 < 2 || r.x1 > w - 2 || r.y0 < 2 || r.y1 > h - 2) continue;
        if (placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
        ok = { x, y, r };
        break;
      }
      if (!ok) continue;
      placed.push(ok.r);
      out.push({ ...it, x: ok.x, y: ok.y });
    }
    for (const it of out) {
      g.font = it.font;
      if (it.ring) {
        const tw = g.measureText(it.text).width + 8 * box.dpr;
        const th = (it.size + 6) * box.dpr;
        g.fillStyle = 'rgba(7, 25, 23, 0.85)';
        g.fillRect(it.x - tw / 2, it.y - th / 2, tw, th);
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 4 * box.dpr;
      g.strokeStyle = INK.halo;
      g.strokeText(it.text, it.x, it.y);
      g.fillStyle = it.color;
      g.fillText(it.text, it.x, it.y);
    }
  }

  function diamond(x, y, r, fill) {
    poly(g, [[x, y - r], [x + r, y], [x, y + r], [x - r, y]], fill, INK.halo, 2 * box.dpr);
  }

  function pin(x, y) {
    const d = box.dpr;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(x, y + 1 * d, 6 * d, 2.5 * d, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x - 9 * d, y - 12 * d, x - 7 * d, y - 22 * d, x, y - 22 * d);
    g.bezierCurveTo(x + 7 * d, y - 22 * d, x + 9 * d, y - 12 * d, x, y);
    g.fillStyle = INK.pin;
    g.fill();
    g.lineWidth = 2 * d;
    g.strokeStyle = '#fff';
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x, y - 15 * d, 3 * d, 0, Math.PI * 2);
    g.fill();
  }

  function along(pts, mins, tau) {
    if (!pts || pts.length < 2) return pts ? pts[0] : null;
    if (tau >= mins[mins.length - 1]) return pts[pts.length - 1];
    let i = 0;
    while (i < mins.length - 2 && mins[i + 1] <= tau) i++;
    const span = mins[i + 1] - mins[i] || 1;
    return lerpPt(pts[i], pts[i + 1], Math.max(0, Math.min(1, (tau - mins[i]) / span)));
  }

  // ---------- one frame ----------
  // st: { m, s, posA, posB, option, place, start, routeA, routeB, minsA, minsB, tau, rings, labels, startTrip }
  function paint(st) {
    if (!box) return;
    const { w, h, dpr } = box;
    const d = dpr;
    g.clearRect(0, 0, w, h);
    // Illustration fades as the map turns to minutes.
    if (st.m < 1) {
      g.globalAlpha = 1;
      g.drawImage(layer, 0, 0);
    }
    const ringMarks = [];
    if (st.m > 0) {
      const cx = st.rings.cx;
      const cy = st.rings.cy;
      g.globalAlpha = st.m;
      const bg = g.createRadialGradient(cx, cy, 10 * d, cx, cy, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#16453f');
      bg.addColorStop(0.5, '#0d2c2a');
      bg.addColorStop(1, '#071917');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // Rings: minutes from the place, one scale for today and with the change.
      for (let mm = 10; mm <= st.rings.max + 20; mm += 10) {
        const rr = mm * st.rings.pxPerMin;
        g.beginPath();
        g.arc(cx, cy, rr, 0, Math.PI * 2);
        g.strokeStyle = INK.ring;
        g.lineWidth = 1.2 * d;
        g.stroke();
        ringMarks.push({ mm, rr, cx, cy });
      }
      g.globalAlpha = 1;
    }
    const P = (arr, i) => [arr[2 * i], arr[2 * i + 1]];
    // Streets at the corners' current positions. Today's network ghosts once the change pulls away.
    if (st.m > 0) {
      g.globalAlpha = Math.min(1, st.m * 1.4);
      if (st.s > 0) {
        g.globalAlpha = Math.min(1, st.m * 1.4) * 0.8;
        for (const e of EDGES) line(g, [P(st.posA, e.a), P(st.posA, e.b)], INK.todayDim, 1.3 * d, [3 * d, 4 * d]);
      }
      g.globalAlpha = Math.min(1, st.m * 1.4);
      const col = mix(INK.today, INK.change, st.s);
      for (const e of EDGES) line(g, [P(st.posB, e.a), P(st.posB, e.b)], col, (e.type === 'bridge' ? 3 : 2.1) * d);
      const o = OPTIONS[st.option];
      if (st.s > 0) {
        line(g, [P(st.posB, o.a), P(st.posB, o.b)], 'rgba(77, 240, 168, 0.35)', 9 * d);
        line(g, [P(st.posB, o.a), P(st.posB, o.b)], INK.change, 3 * d, o.type === 'ferry' ? [6 * d, 5 * d] : []);
      }
      for (let i = 0; i < N; i++) {
        const [x, y] = P(st.posB, i);
        g.fillStyle = col;
        g.beginPath();
        g.arc(x, y, 2.8 * d, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // The new link on the street map.
    if (st.m < 1) {
      g.globalAlpha = 1 - st.m;
      const o = OPTIONS[st.option];
      const a = P(geoPx, o.a);
      const b = P(geoPx, o.b);
      line(g, [a, b], 'rgba(77, 240, 168, 0.45)', 16 * view.s);
      line(g, [a, b], '#1d6b52', 8 * view.s);
      line(g, [a, b], INK.change, 5 * view.s, o.type === 'ferry' ? [7 * view.s, 6 * view.s] : []);
      // Routes: today dashed gold under the change in jade.
      const ra = st.routeA ? st.routeA.map((n) => P(geoPx, n)) : null;
      const rb = st.routeB ? st.routeB.map((n) => P(geoPx, n)) : null;
      if (ra) {
        line(g, ra, 'rgba(40, 24, 6, 0.55)', 7 * d);
        line(g, ra, INK.today, 3.4 * d, [7 * d, 6 * d]);
      }
      if (rb) {
        line(g, rb, 'rgba(6, 40, 28, 0.6)', 8 * d);
        line(g, rb, INK.change, 4 * d);
      }
      // The race: two travellers leave the pin together; each moves by its own computed minutes.
      if (st.tau !== null && ra && rb) {
        for (const [pts, mins, col] of [[ra, st.minsA, INK.today], [rb, st.minsB, INK.change]]) {
          const p = along(pts, mins, st.tau);
          if (!p) continue;
          g.shadowBlur = 12 * d;
          g.shadowColor = col;
          g.fillStyle = col;
          g.beginPath();
          g.arc(p[0], p[1], 5.5 * d, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
          g.lineWidth = 2 * d;
          g.strokeStyle = '#08201b';
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    // The start pin's trip in minutes: from today's ring to the change's.
    if (st.m > 0.6 && st.s > 0) {
      const a = P(st.posA, st.start);
      const b = P(st.posB, st.start);
      g.globalAlpha = Math.min(1, (st.m - 0.6) / 0.4);
      line(g, [a, b], 'rgba(255, 245, 210, 0.9)', 2.2 * d);
      g.fillStyle = INK.today;
      g.beginPath();
      g.arc(a[0], a[1], 4.2 * d, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    // Places, pin and labels: positions follow whichever map is showing.
    const shown = st.m < 0.5 ? geoPx : st.posB;
    const labels = [];
    const font = (sz, wt = 700) => `${wt} ${sz * d}px 'ARUN Text', ui-sans-serif, system-ui, sans-serif`;
    PLACES.forEach((pl, k) => {
      const [x, y] = P(shown, pl.node);
      const r = (k === st.place ? 9 : 6.5) * d;
      if (k === st.place && st.m >= 0.5) {
        g.shadowBlur = 18 * d;
        g.shadowColor = INK.today;
      }
      diamond(x, y, r, k === st.place ? '#fff3c4' : '#efe2b8');
      g.shadowBlur = 0;
      labels.push({ text: st.labels.places[k], x, y, color: k === st.place ? '#fff3c4' : INK.label, font: font(k === st.place ? 13 : 11.5), size: k === st.place ? 13 : 11.5, pri: k === st.place ? 0 : 2, gap: 13 });
    });
    const [px, py] = P(shown, st.start);
    pin(px, py);
    labels.push({ text: st.labels.start, x: px, y: py - 22 * d, color: '#ffd0dc', font: font(11.5), size: 11.5, pri: 1, gap: 9 });
    if (st.m < 0.5) {
      const o = OPTIONS[st.option];
      const a = P(geoPx, o.a);
      const b = P(geoPx, o.b);
      labels.push({ text: st.labels.option, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, color: '#c9ffe6', font: font(11), size: 11, pri: 3, gap: 10 });
    } else if (st.s > 0 && st.startTrip) {
      const a = P(st.posA, st.start);
      const b = P(st.posB, st.start);
      labels.push({ text: st.startTrip.a, x: a[0], y: a[1], color: INK.today, font: font(12), size: 12, pri: 1.5, gap: 10 });
      labels.push({ text: st.startTrip.b, x: b[0], y: b[1], color: INK.change, font: font(12), size: 12, pri: 1.6, gap: 10 });
    }
    if (st.m > 0.5) {
      const fr = frame();
      for (const r of ringMarks) {
        const cands = [];
        for (const deg of [-90, -60, -120, -30, -150, 90, 60, 120, 30, 150, 0, 180]) {
          const a = (deg * Math.PI) / 180;
          const x = r.cx + Math.cos(a) * r.rr;
          const y = r.cy + Math.sin(a) * r.rr;
          if (x > fr.x && x < fr.x + fr.w && y > fr.y && y < fr.y + fr.h) cands.push([x, y]);
        }
        if (cands.length) labels.push({ text: st.labels.ring(r.mm), cands, x: 0, y: 0, color: INK.ringText, font: `600 ${10.5 * d}px 'ARUN Data', ui-monospace, monospace`, size: 10.5, pri: 5 + r.mm / 100, ring: true });
      }
    }
    placeLabels(labels);
  }

  // The corner nearest a point on screen, among the positions showing.
  function pick(x, y, st) {
    const arr = st.m < 0.5 ? geoPx : st.posB;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < N; i++) {
      const dd = Math.hypot(arr[2 * i] - x, arr[2 * i + 1] - y);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    return { node: best, dist: bd };
  }

  return {
    resize,
    paint,
    pick,
    frame,
    get geo() {
      return geoPx;
    },
    get ready() {
      return !!box;
    },
    city,
  };
}
