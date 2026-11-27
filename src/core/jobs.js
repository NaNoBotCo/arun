// Background jobs. One Web Worker per job (made from the bundled worker source); cancel terminates it.
// Identical deterministic input returns the cached result instead of computing twice.
// Where a Worker cannot start, the job runs on the main thread and says so.

import { JOBS } from '../jobs-registry.js';
import { hashData } from './hash.js';

const cache = new Map(); // key -> { promise, result }
const log = []; // measured work, for the compute-economics views
let workerUrl = null;
let workerBroken = false;
let seq = 0;
let liveWorkerCount = 0; // workers started and not yet terminated, for cleanup checks

function getWorkerUrl() {
  if (workerUrl || workerBroken) return workerUrl;
  try {
    // eslint-disable-next-line no-undef
    const src = typeof __WORKER_SRC__ === 'string' ? __WORKER_SRC__ : null;
    if (!src || typeof Worker === 'undefined' || typeof Blob === 'undefined') {
      workerBroken = true;
      return null;
    }
    workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  } catch {
    workerBroken = true;
  }
  return workerUrl;
}

function deviceLabel() {
  if (typeof navigator === 'undefined') return 'node';
  const cores = navigator.hardwareConcurrency || '?';
  const ua = navigator.userAgent || '';
  const fam = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chromium' : /Safari\//.test(ua) ? 'WebKit' : 'browser';
  const mobile = /Mobi|Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop';
  return `${fam} · ${mobile} · ${cores} logical cores`;
}

// Approximate bytes moved between page and worker, without serialising large arrays.
function sizeOf(v, depth = 0) {
  if (v === null || v === undefined) return 0;
  if (ArrayBuffer.isView(v)) return v.byteLength;
  if (v instanceof ArrayBuffer) return v.byteLength;
  if (typeof v === 'number') return 8;
  if (typeof v === 'boolean') return 4;
  if (typeof v === 'string') return v.length * 2;
  if (depth > 6) return 0;
  if (Array.isArray(v)) {
    let s = 0;
    for (const x of v) s += sizeOf(x, depth + 1);
    return s;
  }
  if (typeof v === 'object') {
    let s = 0;
    for (const k in v) s += k.length * 2 + sizeOf(v[k], depth + 1);
    return s;
  }
  return 0;
}

export const JOB_STATES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];

export function jobLog() {
  return log.slice();
}

export function clearJobCache() {
  cache.clear();
}

function runOnMain(fn, payload, onProgress, onFrame) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const t0 = performance.now();
      try {
        const result = fn(payload, { progress: (p) => onProgress && onProgress(p), emit: (d) => onFrame && onFrame(d), cancelled: () => false });
        resolve({ result, elapsedMs: performance.now() - t0, where: 'main thread' });
      } catch (e) {
        reject(e);
      }
    }, 0);
  });
}

// Returns a handle: { id, promise, cancel(), state }.
// onFrame receives data a streaming job sends with emit(); a cached result sends no frames.
export function runJob(name, payload, { onProgress, onState, onFrame, timeoutMs = 60000, useCache = true } = {}) {
  const fn = JOBS[name];
  const id = `job-${++seq}`;
  const handle = { id, name, state: 'queued', cancel: () => {} };
  const setState = (s) => {
    handle.state = s;
    onState && onState(s);
  };
  if (!fn) {
    handle.promise = Promise.reject(new Error(`No job named ${name}.`));
    setState('failed');
    return handle;
  }
  const key = name + ':' + hashData(payload);
  if (useCache && cache.has(key)) {
    const c = cache.get(key);
    handle.promise = c.promise.then((r) => ({ ...r, cached: true }));
    handle.cached = true;
    handle.promise.then(() => setState('succeeded'), () => setState('failed'));
    return handle;
  }
  let lastP = 0;
  const progress = (p) => {
    // Progress only moves forward.
    if (p > lastP) {
      lastP = Math.min(1, p);
      onProgress && onProgress(lastP);
    }
  };
  const url = getWorkerUrl();
  let promise;
  if (!url) {
    setState('running');
    promise = runOnMain(fn, payload, progress, onFrame);
  } else {
    promise = new Promise((resolve, reject) => {
      let w;
      try {
        w = new Worker(url);
      } catch (e) {
        workerBroken = true;
        runOnMain(fn, payload, progress, onFrame).then(resolve, reject);
        return;
      }
      let done = false;
      liveWorkerCount++;
      const finish = () => {
        if (!done) liveWorkerCount--;
        done = true;
        clearTimeout(timer);
        w.terminate();
      };
      const timer = setTimeout(() => {
        if (done) return;
        finish();
        const err = new Error(`${name} stopped after ${Math.round(timeoutMs / 1000)} s (time cap).`);
        err.cancelled = false;
        reject(err);
      }, timeoutMs);
      handle.cancel = () => {
        if (done) return;
        finish();
        setState('cancelled');
        const err = new Error('Cancelled.');
        err.cancelled = true;
        reject(err);
      };
      w.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.type === 'progress') progress(m.p);
        else if (m.type === 'frame') {
          if (!done && onFrame) onFrame(m.data);
        } else if (m.type === 'done') {
          finish();
          resolve({ result: m.result, elapsedMs: m.elapsedMs, where: 'Web Worker' });
        } else if (m.type === 'error') {
          finish();
          reject(new Error(m.message || 'Job failed.'));
        }
      };
      w.onerror = (ev) => {
        if (done) return;
        finish();
        ev.preventDefault && ev.preventDefault();
        reject(new Error(ev.message || 'Worker error.'));
      };
      setState('running');
      w.postMessage({ id, name, payload });
    });
  }
  const wrapped = promise.then(
    (r) => {
      const bytes = sizeOf(r.result) + sizeOf(payload);
      const entry = { name, elapsedMs: r.elapsedMs, where: r.where, device: deviceLabel(), bytes, at: Date.now() };
      log.push(entry);
      if (log.length > 500) log.shift();
      setState('succeeded');
      return { ...r, bytes, device: entry.device };
    },
    (e) => {
      cache.delete(key);
      if (handle.state !== 'cancelled') setState('failed');
      throw e;
    }
  );
  if (useCache) cache.set(key, { promise: wrapped });
  handle.promise = wrapped;
  return handle;
}

export function liveWorkers() {
  return liveWorkerCount;
}

export function workerAvailable() {
  return !!getWorkerUrl();
}

export { deviceLabel };
