#!/usr/bin/env python3
"""Overture buildings (release 2026-11-18.0, ODbL; sources: Google Open Buildings, OpenStreetMap,
Microsoft ML Buildings) for lon 104.890-104.965, lat 11.525-11.600 -> data/buildings.bin + .json.

Binary layout (little endian), one record per building:
  uint8 n (corners, 3..12), uint8 height_m, uint8 flags (bit0 measured, bit1 floors, bit2 surface model, bit3..4 source 0 google 1 osm 2 microsoft)
  then n pairs of int16 x,y in units of 0.5 m east/north of the origin (104.93 E, 11.56 N).

Height, in order of preference: Overture height (measured, OSM); num_floors x 3.3 m; Copernicus GLO-30
surface minus local ground where that excess is over 15 m (a tall building there in 2011-2015);
otherwise an estimate from footprint area and distance from the riverfront, with a fixed per-building jitter.
"""
import duckdb, json, math, struct, sys, hashlib, re
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parent.parent
O_LON, O_LAT = 104.93, 11.56
KX = 111320 * math.cos(math.radians(O_LAT)); KY = 110574
dem = json.loads((ROOT / 'data/raw/dem.json').read_text())
Z = np.array(dem['z'], dtype=np.float32).reshape(dem['h'], dem['w'])
# local ground: 20th percentile in a 9x9 window (~270 m), done by blocks for speed
def local_ground(z, r=4):
    h, w = z.shape; g = np.empty_like(z)
    pad = np.pad(z, r, mode='edge')
    from numpy.lib.stride_tricks import sliding_window_view
    win = sliding_window_view(pad, (2*r+1, 2*r+1))
    return np.percentile(win.reshape(h, w, -1), 20, axis=2)
G = local_ground(Z)
def dsm_excess(lon, lat):
    c = int((lon - dem['west']) / (dem['east'] - dem['west']) * dem['w'])
    r = int((dem['north'] - lat) / (dem['north'] - dem['south']) * dem['h'])
    if 0 <= r < dem['h'] and 0 <= c < dem['w']: return float(Z[r, c] - G[r, c])
    return 0.0
def ring_of(wkt):
    m = re.search(r'\(\(([^()]*)\)', wkt)
    pts = [tuple(map(float, p.split())) for p in m.group(1).split(',')]
    if pts[0] == pts[-1]: pts = pts[:-1]
    return pts
def dp(pts, tol):
    if len(pts) < 3: return pts
    a, b = np.array(pts[0]), np.array(pts[-1]); best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        p = np.array(pts[i]); d = abs(np.cross(b - a, p - a)) / (np.linalg.norm(b - a) + 1e-9)
        if d > best: best, idx = d, i
    if best > tol: return dp(pts[:idx + 1], tol)[:-1] + dp(pts[idx:], tol)
    return [pts[0], pts[-1]]
def simplify_ring(pts, tol=0.8):
    if len(pts) <= 5: return pts
    # split at farthest point from first, DP both halves
    p0 = np.array(pts[0]); far = max(range(len(pts)), key=lambda i: np.linalg.norm(np.array(pts[i]) - p0))
    a = dp(pts[:far + 1], tol); b = dp(pts[far:] + [pts[0]], tol)
    return a[:-1] + b[:-1]
def area(pts):
    return 0.5 * sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
con = duckdb.connect()
rows = con.execute(f"select id, height, num_floors, src, wkt from '{ROOT}/data/raw/buildings.parquet'").fetchall()
SRC = {'Google Open Buildings': 0, 'OpenStreetMap': 1, 'Microsoft ML Buildings': 2}
# riverfront line for the distance heuristic: Sisowath Quay runs roughly north-south at x ~ 0..+300 m
out = bytearray(); kept = 0; stats = {'measured': 0, 'floors': 0, 'surface': 0, 'estimated': 0, 'dropped_small': 0}
for bid, h, fl, src, wkt in rows:
    ring = [((lo - O_LON) * KX, (la - O_LAT) * KY) for lo, la in ring_of(wkt)]
    a = area(ring)
    if abs(a) < 25: stats['dropped_small'] += 1; continue
    if a < 0: ring.reverse()
    ring = simplify_ring(ring)
    if len(ring) > 12: ring = simplify_ring(ring, 2.0)
    if len(ring) > 12 or len(ring) < 3: ring = ring[:12] if len(ring) > 12 else ring
    if len(ring) < 3: continue
    cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
    flags = SRC.get(src, 0) << 3
    if h: height = h; flags |= 1; stats['measured'] += 1
    elif fl: height = fl * 3.3; flags |= 2; stats['floors'] += 1
    else:
        ex = dsm_excess(O_LON + cx / KX, O_LAT + cy / KY)
        if ex > 15: height = min(ex, 60); flags |= 4; stats['surface'] += 1
        else:
            d = math.hypot(cx + 900, cy - 300)  # distance from the old-town centre (~Central Market to riverside)
            jit = int(hashlib.md5(bid.encode()).hexdigest()[:4], 16) / 65535
            floors = 1 + (3.2 if d < 2500 else 2.2 if d < 5000 else 1.0) * (0.6 + 0.8 * jit) * min(1.0, abs(a) / 120 + 0.3)
            height = floors * 3.3; stats['estimated'] += 1
    height = max(3, min(255, round(height)))
    out += struct.pack('<BBB', len(ring), height, flags)
    for x, y in ring: out += struct.pack('<hh', max(-32767, min(32767, round(x * 2))), max(-32767, min(32767, round(y * 2))))
    kept += 1
(ROOT / 'data/buildings.bin').write_bytes(bytes(out))
meta = {'count': kept, 'bytes': len(out), 'stats': stats, 'release': 'Overture 2026-11-18.0 buildings', 'licence': 'ODbL 1.0 (Overture buildings theme); sources Google Open Buildings, OpenStreetMap, Microsoft ML Buildings',
        'credit': '© OpenStreetMap contributors, Overture Maps Foundation; Google Open Buildings; Microsoft ML Buildings', 'heights': __doc__.split('Height,')[1].strip()}
(ROOT / 'data/buildings.json').write_text(json.dumps(meta, indent=1))
print(json.dumps(meta['stats']), kept, len(out))
