// Worker entry. Runs one named job from the registry and reports progress, result or error.
import { JOBS } from './jobs-registry.js';

self.onmessage = (ev) => {
  const { id, name, payload } = ev.data || {};
  const fn = JOBS[name];
  if (!fn) {
    self.postMessage({ id, type: 'error', message: `No job named ${name}.` });
    return;
  }
  let last = 0;
  const progress = (p) => {
    const now = performance.now();
    if (now - last > 50 || p >= 1) {
      last = now;
      self.postMessage({ id, type: 'progress', p });
    }
  };
  // Streaming jobs send frames as they compute (every frame is sent; progress is throttled).
  const emit = (data) => self.postMessage({ id, type: 'frame', data });
  const t0 = performance.now();
  try {
    const result = fn(payload, { progress, emit, cancelled: () => false });
    self.postMessage({ id, type: 'done', result, elapsedMs: performance.now() - t0 });
  } catch (e) {
    self.postMessage({ id, type: 'error', message: String((e && e.message) || e) });
  }
};
