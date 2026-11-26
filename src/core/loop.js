// Animation loops that stop when the tab is hidden or the exhibit closes, and measure their own frame rate.

const live = new Set();

document.addEventListener('visibilitychange', () => {
  for (const l of live) {
    if (document.hidden) l._hiddenPause();
    else l._hiddenResume();
  }
});

export function createLoop(frame) {
  let raf = 0;
  let running = false;
  let pausedByHide = false;
  let lastT = 0;
  let frames = 0;
  let fpsT0 = 0;
  let fps = 0;
  const tick = (t) => {
    if (!running) return;
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    frames++;
    if (!fpsT0) fpsT0 = t;
    if (t - fpsT0 > 1000) {
      fps = (frames * 1000) / (t - fpsT0);
      frames = 0;
      fpsT0 = t;
    }
    try {
      frame(dt, t);
    } catch (e) {
      running = false;
      console.error(e);
      loop.onError && loop.onError(e);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const loop = {
    start() {
      if (running) return;
      running = true;
      lastT = 0;
      fpsT0 = 0;
      frames = 0;
      if (!document.hidden) raf = requestAnimationFrame(tick);
      else pausedByHide = true;
    },
    stop() {
      running = false;
      pausedByHide = false;
      cancelAnimationFrame(raf);
    },
    get running() {
      return running;
    },
    get fps() {
      return fps;
    },
    dispose() {
      loop.stop();
      live.delete(loop);
    },
    _hiddenPause() {
      if (running) {
        cancelAnimationFrame(raf);
        pausedByHide = true;
      }
    },
    _hiddenResume() {
      if (running && pausedByHide) {
        pausedByHide = false;
        lastT = 0;
        raf = requestAnimationFrame(tick);
      }
    },
    onError: null,
  };
  live.add(loop);
  return loop;
}

export function liveLoopCount() {
  let n = 0;
  for (const l of live) if (l.running) n++;
  return n;
}
