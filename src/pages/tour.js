// The guided tour: about a minute, six steps, live exhibits in compact form.
import { h, button, announce } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { BY_ID } from '../exhibits/index.js';
import { renderExhibit } from '../core/frame.js';
import { scenario } from '../core/scenario.js';
import { runJob } from '../core/jobs.js';
import { createGlobe } from '../viz/globe.js';
import { createLoop } from '../core/loop.js';
import { copyText } from '../core/exportbox.js';
import * as K from '../kernels/e01.js';

const STEPS = [
  { key: 's1', kind: 'globe' },
  { key: 's2', ex: 'E02' },
  { key: 's3', ex: 'E03' },
  { key: 's4', ex: 'E05' },
  { key: 's5', ex: 'E07' },
  { key: 's6', kind: 'recall' },
];

export function tour(main) {
  let i = 0;
  let current = null;
  let globe = null;
  let gloop = null;
  const started = performance.now();
  const stageEl = h('div', { class: 'tour-stage' });
  const title = h('h1', { class: 'tour-title' });
  const desc = h('p', { class: 'tour-desc' });
  const counter = h('span', { class: 'tour-count', 'aria-live': 'polite' });
  const clock = h('span', { class: 'tour-clock', title: 'Time since the tour began' });
  const bar = h('div', { class: 'tour-bar', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': STEPS.length }, h('i'));
  const prev = button(t('tour.prev'), () => go(i - 1), { kind: 'ghost' });
  const next = button(t('tour.next'), () => go(i + 1), { kind: 'primary' });
  const skip = h('a', { href: '#lab', class: 'btn ghost small' }, t('tour.skip'));
  const dots = h('div', { class: 'tour-dots' }, STEPS.map((s, k) => {
    const d = h('button', { type: 'button', class: 'tour-dot', 'aria-label': `Step ${k + 1}` });
    d.addEventListener('click', () => go(k));
    return d;
  }));
  const page = h('section', { class: 'tour', 'aria-roledescription': 'guided tour' },
    h('div', { class: 'tour-head wrap' }, h('div', { class: 'tour-text' }, h('div', { class: 'tour-meta' }, counter, clock), title, desc), h('div', { class: 'tour-nav' }, prev, next, skip)),
    bar,
    h('div', { class: 'tour-body wrap' }, stageEl),
    h('div', { class: 'wrap' }, dots));
  main.replaceChildren(page);
  document.documentElement.dataset.route = 'tour';

  // Start the storm-size sweep now so the thousand-futures step can read it.
  const s = scenario.get();
  const hash = scenario.inputHash('hydro');
  const have = scenario.getResult('E02');
  let sweep = null;
  if (!(have && have.inputHash === hash && have.data.curve)) {
    sweep = runJob('e02.curve', { seed: s.seed, params: s.hydro, N: s.hydro.grid }, { timeoutMs: 120000 });
    sweep.promise.then((r) => {
      const now = scenario.getResult('E02');
      scenario.putResult('E02', { inputHash: hash, data: { curve: r.result.rows, single: now && now.inputHash === hash ? now.data.single : null }, elapsedMs: r.elapsedMs, where: r.where });
    }).catch(() => {});
  }

  const tick = setInterval(() => {
    const sec = Math.round((performance.now() - started) / 1000);
    clock.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }, 500);

  function clear() {
    if (current) current.destroy();
    current = null;
    if (gloop) gloop.dispose();
    gloop = null;
    if (globe) globe.destroy();
    globe = null;
  }

  function go(k) {
    if (k < 0 || k >= STEPS.length) return;
    clear();
    i = k;
    const st = STEPS[i];
    title.textContent = t(`tour.${st.key}.t`);
    desc.textContent = t(`tour.${st.key}.d`);
    counter.textContent = `${i + 1} / ${STEPS.length}`;
    bar.firstChild.style.width = ((i + 1) / STEPS.length) * 100 + '%';
    bar.setAttribute('aria-valuenow', String(i + 1));
    dots.querySelectorAll('.tour-dot').forEach((d, n) => d.setAttribute('aria-current', String(n === i)));
    prev.disabled = i === 0;
    next.hidden = i === STEPS.length - 1;
    stageEl.replaceChildren();
    if (st.ex) {
      current = renderExhibit(stageEl, BY_ID[st.ex], { compact: true });
    } else if (st.kind === 'globe') {
      const box = h('div', { class: 'tour-globe', role: 'img', 'aria-label': 'Earth lit as it is now.' });
      stageEl.append(h('div', { class: 'tour-split' }, box, h('div', { class: 'tour-strap' }, h('p', { class: 'strap1' }, t('strap1')), h('p', { class: 'strap2' }, t('strap2')), h('p', {}, t('pitch')))));
      const n = new Date();
      const reduced = document.documentElement.dataset.motion === 'reduced';
      globe = createGlobe(box, { lon0: 104.9, lat0: 12, spinDegPerSec: reduced ? 0 : 6, streamlines: !reduced, particles: 700 });
      globe.setTime(Math.min(365, K.dayOfYearUTC(n)), n.getUTCHours() + n.getUTCMinutes() / 60);
      globe.draw();
      if (!reduced) {
        gloop = createLoop((dt) => globe.frame(dt));
        gloop.start();
      }
    } else {
      const url = location.href.split('#')[0] + '#home';
      stageEl.append(h('div', { class: 'recall' },
        h('ol', {}, [1, 2, 3, 4, 5].map((n) => h('li', {}, t('recall.' + n)))),
        h('p', { class: 'strap1 small-strap' }, t('strap1')),
        h('div', { class: 'btnrow' },
          button('Copy the link to share', () => copyText(url).then((ok) => ok && announce('Link copied.')), { kind: 'primary' }),
          h('a', { class: 'btn', href: '#ideas' }, 'Try the retelling test'),
          h('a', { class: 'btn', href: '#lab' }, t('home.ctaLab')))));
    }
    next.focus({ preventScroll: true });
  }

  const onKey = (e) => {
    if (e.target.closest('input, select, textarea, [role=application], canvas')) return;
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
  };
  document.addEventListener('keydown', onKey);
  go(0);
  return {
    destroy() {
      clear();
      clearInterval(tick);
      document.removeEventListener('keydown', onKey);
    },
  };
}
