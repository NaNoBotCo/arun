// JRC Global Surface Water v1.4 (1984–2021) occurrence, same window as the DEM, by HTTP range requests.
// Writes data/raw/gsw.json: {west,south,east,north,w,h,occ:[0..100, 255 = no data]}
import { fromUrl } from 'geotiff';
import { writeFileSync, readFileSync } from 'node:fs';
const SRC = 'https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/occurrence_100E_20Nv1_4_2021.tif';
const dem = JSON.parse(readFileSync(new URL('../data/raw/dem.json', import.meta.url)));
const tif = await fromUrl(SRC);
const img = await tif.getImage();
const [ox, oy] = img.getOrigin();
const [rx, ry] = img.getResolution();
console.log('tile', img.getWidth(), img.getHeight(), 'res', rx, ry, 'tiled', img.isTiled);
const x0 = Math.round((dem.west - ox) / rx), x1 = Math.round((dem.east - ox) / rx);
const y0 = Math.round((dem.north - oy) / ry), y1 = Math.round((dem.south - oy) / ry);
const r = await img.readRasters({ window: [x0, y0, x1, y1] });
const occ = Array.from(r[0]);
const out = { source: SRC, credit: 'Source: EC JRC/Google (Global Surface Water v1.4, 1984–2021)', west: ox + x0 * rx, north: oy + y0 * ry, east: ox + x1 * rx, south: oy + y1 * ry, w: x1 - x0, h: y1 - y0, occ };
writeFileSync(new URL('../data/raw/gsw.json', import.meta.url), JSON.stringify(out));
const seen = occ.filter(v => v > 0 && v <= 100).length;
console.log('gsw', out.w, 'x', out.h, 'seen once', (seen / occ.length * 100).toFixed(1) + '%');
