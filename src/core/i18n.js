// UI strings by key. A missing key in a locale falls back to English.
import en from '../i18n/en.js';
import th from '../i18n/th.js';
import km from '../i18n/km.js';
import my from '../i18n/my.js';
import lo from '../i18n/lo.js';
import vi from '../i18n/vi.js';
import shn from '../i18n/shn.js';

export const LOCALES = { en, th, km, my, lo, vi, shn };
export const SWITCHABLE = ['en', 'th', 'km'];
let current = 'en';
const subs = new Set();

export function t(key) {
  const loc = LOCALES[current] || en;
  return loc[key] ?? en[key] ?? key;
}

export function lang() {
  return current;
}

export function setLang(code) {
  if (!LOCALES[code]) return;
  current = code;
  document.documentElement.lang = code;
  try {
    localStorage.setItem('arun.lang', code);
  } catch {}
  for (const fn of subs) fn(code);
}

export function onLang(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function initLang() {
  let c = null;
  try {
    c = localStorage.getItem('arun.lang');
  } catch {}
  if (!c && typeof navigator !== 'undefined') {
    const n = (navigator.language || 'en').slice(0, 2);
    if (SWITCHABLE.includes(n)) c = n;
  }
  setLang(SWITCHABLE.includes(c) ? c : 'en');
}

export function coverage() {
  const keys = Object.keys(en).filter((k) => k !== 'meta');
  return Object.entries(LOCALES).map(([code, loc]) => {
    const have = keys.filter((k) => typeof loc[k] === 'string' && loc[k].length > 0).length;
    return { code, name: loc.meta.name, native: loc.meta.native, status: loc.meta.status, have, total: keys.length };
  });
}
