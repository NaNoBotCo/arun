// Stable hashing of plain data, used to tie results to the exact inputs that made them.

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
    return JSON.stringify(value);
  }
  if (ArrayBuffer.isView(value)) return stableStringify(Array.from(value));
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

// Two independent FNV-1a lanes give a 64-bit hex digest: plenty for change detection.
export function hashText(str) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a ^= c;
    a = Math.imul(a, 0x01000193);
    b ^= c + i;
    b = Math.imul(b, 0x5bd1e995);
    b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export function hashData(value) {
  return hashText(stableStringify(value));
}

// Hash a numeric array quickly with rounding, so results compare within a tolerance.
export function hashNumbers(arr, digits = 9) {
  const parts = [];
  for (let i = 0; i < arr.length; i++) parts.push(Number(arr[i]).toPrecision(digits));
  return hashText(parts.join(','));
}
