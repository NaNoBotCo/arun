// Small numeric helpers shared by kernels. Pure.

// Quantile, type 7 (linear interpolation between order statistics; R's default).
export function quantileSorted(sorted, p) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[n - 1];
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function sortedCopy(arr) {
  const a = Float64Array.from(arr);
  a.sort();
  return a;
}

export function mean(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return arr.length ? s / arr.length : NaN;
}

export function variance(arr) {
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
  return arr.length > 1 ? s / (arr.length - 1) : 0;
}

export function rmse(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / a.length);
}

export function mae(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

export function histogram(values, bins, lo, hi) {
  const counts = new Array(bins).fill(0);
  if (!(hi > lo)) {
    hi = lo + 1;
  }
  const w = (hi - lo) / bins;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    let k = Math.floor((v - lo) / w);
    if (k < 0) k = 0;
    if (k >= bins) k = bins - 1;
    counts[k]++;
  }
  return { counts, lo, hi, width: w };
}

// Solve A x = b for symmetric positive definite A (n×n, row-major Float64Array) by Cholesky.
// Returns null when A is not positive definite, so callers fail visibly instead of guessing.
export function choleskyFactor(A, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (!(s > 0)) return null;
        L[i * n + i] = Math.sqrt(s);
      } else {
        L[i * n + j] = s / L[j * n + j];
      }
    }
  }
  return L;
}

export function choleskySolve(L, n, b) {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function linspace(a, b, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = n === 1 ? a : a + ((b - a) * i) / (n - 1);
  return out;
}

export function allFinite(arr) {
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
}
