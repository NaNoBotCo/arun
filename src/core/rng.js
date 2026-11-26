// Seeded random numbers. Pure; safe in kernels, workers and node tests.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a 32-bit over a string: turns labels into seeds.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A child seed for a named stream: each part of a run draws from its own sequence.
export function deriveSeed(seed, label) {
  return hashString(String(seed >>> 0) + ':' + label);
}

export function makeRng(seed) {
  const u = mulberry32(seed);
  let spare = null;
  const open01 = () => {
    let v = u();
    while (v === 0) v = u();
    return v;
  };
  const rng = {
    seed: seed >>> 0,
    uniform: u,
    open01,
    range: (a, b) => a + (b - a) * u(),
    int: (n) => Math.floor(u() * n),
    normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let x, y, r;
      do {
        x = 2 * u() - 1;
        y = 2 * u() - 1;
        r = x * x + y * y;
      } while (r >= 1 || r === 0);
      const f = Math.sqrt((-2 * Math.log(r)) / r);
      spare = y * f;
      return x * f;
    },
    // Laplace(0, b) by inverse CDF.
    laplace(b) {
      const v = open01() - 0.5;
      return -b * Math.sign(v) * Math.log(1 - 2 * Math.abs(v));
    },
    // Poisson by Knuth for small means, normal approximation above 60.
    poisson(lambda) {
      if (lambda <= 0) return 0;
      if (lambda > 60) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * rng.normal()));
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= u();
      } while (p > L);
      return k - 1;
    },
    lognormal(mu, sigma) {
      return Math.exp(mu + sigma * rng.normal());
    },
    pick(arr) {
      return arr[Math.floor(u() * arr.length)];
    },
  };
  return rng;
}
