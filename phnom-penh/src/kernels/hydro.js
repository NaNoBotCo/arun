// Water in the street outside the facility: one bucket. Rain on the street catchment runs off,
// the drains take what they can, pumps and a tank take more if the facility has them, and the rest
// stands in the low part of the street. Every number here is an assumption, shown on screen.
export const HYDRO = {
  catchHa: 20,      // street catchment draining past the door, hectares
  runoff: 0.85,     // share of rain that runs off paved ground
  drainMmH: 20,     // drains keep up with rain up to this rate over the catchment, mm/h
  pondHa: 0.9,      // low street area where the excess stands, hectares
  kerbCm: 15,       // depth at the door that counts as "water at the door", cm
};

const perMin = (mmH, ha, c) => c * mmH / 1000 / 60 * ha * 1e4;   // m³ per minute

// Depth (cm) at the door, minute by minute, from a rain series (mm/h per minute).
export function streetDepth(rain, p = HYDRO, extra = {}) {
  const pump = extra.pumpM3min || 0, tank = extra.tankM3 || 0;
  const cap = perMin(p.drainMmH, p.catchHa, p.runoff) + pump;
  const out = new Float32Array(rain.length);
  let v = 0;
  for (let t = 0; t < rain.length; t++) {
    v = Math.max(0, v + perMin(rain[t], p.catchHa, p.runoff) - cap);
    out[t] = Math.max(0, v - tank) / (p.pondHa * 1e4) * 100;
  }
  return out;
}

export function firstAtOrAbove(series, thr, from = 0) {
  for (let t = from; t < series.length; t++) if (series[t] >= thr) return t;
  return -1;
}

// Things a facility might do with notice. Minutes are assumptions for the demo; the viewer changes them.
export const ACTIONS = {
  hotel: [
    { id: 'cars', min: 25 }, { id: 'sandbags', min: 20 }, { id: 'lobby', min: 15 }, { id: 'pumps', min: 10 }, { id: 'guests', min: 5 },
  ],
  hospital: [
    { id: 'ward', min: 40 }, { id: 'genset', min: 20 }, { id: 'basement', min: 25 }, { id: 'ambulance', min: 10 }, { id: 'staff', min: 15 },
  ],
  datahall: [
    { id: 'transfer', min: 15 }, { id: 'fuel', min: 30 }, { id: 'vaults', min: 25 }, { id: 'loadshift', min: 40 }, { id: 'crew', min: 20 },
  ],
};
