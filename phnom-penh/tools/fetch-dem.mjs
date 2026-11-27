// Copernicus GLO-30 DSM window for central Phnom Penh, read by HTTP range requests.
// Writes data/raw/dem.json: {west,south,east,north,w,h,z:[...metres]}
import { fromUrl } from 'geotiff';
import { writeFileSync } from 'node:fs';
const SRC = 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N11_00_E104_00_DEM/Copernicus_DSM_COG_10_N11_00_E104_00_DEM.tif';
const [W, S, E, N] = [104.85, 11.50, 105.00, 11.62];
const tif = await fromUrl(SRC);
const img = await tif.getImage();
const [ox, oy] = img.getOrigin();
const [rx, ry] = img.getResolution();
const x0 = Math.round((W - ox) / rx), x1 = Math.round((E - ox) / rx);
const y0 = Math.round((N - oy) / ry), y1 = Math.round((S - oy) / ry);
const r = await img.readRasters({ window: [x0, y0, x1, y1] });
const z = Array.from(r[0], v => Math.round(v * 100) / 100);
const out = { source: SRC, credit: 'Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA', kind: 'DSM (surface: rooftops and trees read as ground)', west: ox + x0 * rx, north: oy + y0 * ry, east: ox + x1 * rx, south: oy + y1 * ry, w: x1 - x0, h: y1 - y0, z };
writeFileSync(new URL('../data/raw/dem.json', import.meta.url), JSON.stringify(out));
const s = [...z].sort((a, b) => a - b);
console.log('dem', out.w, 'x', out.h, 'min', s[0], 'p50', s[s.length >> 1], 'p95', s[Math.floor(s.length * .95)], 'max', s[s.length - 1]);
