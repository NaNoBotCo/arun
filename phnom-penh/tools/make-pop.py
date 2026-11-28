"""People per flood-grid cell, from Meta's High Resolution Population Density map for Cambodia (2020, CC BY 4.0).
python3 -I tools/make-pop.py <khm_general_2020_csv.zip>  →  data/pop.json
The CSV is streamed from the zip; rows inside the terrain grid are summed into its 540 × 432 cells
(row 0 = north), stored as Uint16 tenths of a person, gzip + base64."""
import base64, csv, gzip, io, json, struct, sys, zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
g = json.loads((root / 'data/terrain.json').read_text())['grid']
W, H = g['w'], g['h']
cells = [0.0] * (W * H)
n = inside = 0
total = 0.0
with zipfile.ZipFile(sys.argv[1]) as z:
    name = [f for f in z.namelist() if f.endswith('.csv')][0]
    with z.open(name) as fh:
        rd = csv.reader(io.TextIOWrapper(fh, 'utf-8'))
        head = next(rd)
        ilon, ilat, ival = head.index('longitude'), head.index('latitude'), 2 if len(head) > 2 else -1
        ival = [i for i, h in enumerate(head) if i not in (ilon, ilat)][0]
        for row in rd:
            n += 1
            lon, lat = float(row[ilon]), float(row[ilat])
            if not (g['west'] <= lon < g['east'] and g['south'] < lat <= g['north']):
                continue
            c = int((lon - g['west']) / (g['east'] - g['west']) * W)
            r = int((g['north'] - lat) / (g['north'] - g['south']) * H)
            if 0 <= c < W and 0 <= r < H:
                v = float(row[ival]); cells[r * W + c] += v; total += v; inside += 1
raw = struct.pack('<%dH' % len(cells), *[min(65535, round(v * 10)) for v in cells])
out = {'source': 'Meta (Facebook Connectivity Lab) and CIESIN, High Resolution Population Density Maps, Cambodia 2020', 'licence': 'CC BY 4.0',
       'url': 'https://data.humdata.org/dataset/cambodia-high-resolution-population-density-maps-demographic-estimates',
       'grid': {'w': W, 'h': H}, 'encoding': 'gzip+base64 Uint16 LE, tenths of a person per cell', 'total': round(total),
       'pop': base64.b64encode(gzip.compress(raw, 9)).decode()}
(root / 'data/pop.json').write_text(json.dumps(out))
print('rows', n, 'inside', inside, 'people in grid', round(total), 'kB', len(out['pop']) // 1024)
