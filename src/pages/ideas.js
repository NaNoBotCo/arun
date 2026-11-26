// Ideas: a 100-word pitch editor, a retelling test, optional scores and comments, and two exports.
// Everything typed here stays in this page's memory. The exports are text the visitor copies or downloads.
import { h, button, announce, segmented } from '../core/ui.js';
import { exportPanel } from '../core/exportbox.js';
import { t } from '../core/i18n.js';
import { pitchStatus, buildFeedback, feedbackToMarkdown, makeTasks, tasksToJSON, tasksToMarkdown, EXPERIMENT_IDS, PRIORITIES } from '../kernels/e21.js';

const RECALL = [1, 2, 3, 4, 5].map((n) => 'recall.' + n);
const SCORE_ROWS = [
  ['clarity', 'How clear is the pitch?'],
  ['memorable', 'How memorable is it?'],
  ['retell', 'How easy was it to retell?'],
];
const SCORE_LABELS = { clarity: 'Clear', memorable: 'Memorable', retell: 'Easy to retell' };
const COMMENT_ROWS = [
  ['The pitch', 'pitch'],
  ['The retelling test', 'test'],
  ['The experiments', 'experiments'],
];

const css = `
.ideas-page { max-width: 880px; }
.ideas-page h2 { margin-top: 1.6em; }
.ideas-page .lede { color: var(--muted); max-width: 62ch; }
.ideas-page section { border-top: 1px solid var(--line); padding-top: 6px; margin-top: 22px; }
.ideas-page textarea, .ideas-page input[type='text'], .ideas-page input[type='date'], .ideas-page select { width: 100%; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-s); padding: 8px 10px; }
.ideas-page textarea { min-height: 7em; resize: vertical; line-height: 1.5; }
.ideas-page label { font-weight: 700; font-size: 0.92rem; display: block; margin: 10px 0 3px; }
.ideas-page .count { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin: 6px 0; font-family: var(--font-data); }
.ideas-page .count b { font-size: 1.4rem; }
.ideas-page .count[data-state='over'] b { color: var(--danger); }
.ideas-page .count[data-state='exact'] b { color: var(--jade); }
.ideas-page .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ideas-page .quote { white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--line); border-radius: var(--r-m); padding: 10px 12px; background: color-mix(in srgb, var(--bg-2) 70%, transparent); margin: 4px 0; min-height: 4em; }
.ideas-page .recall { list-style: none; padding: 0; margin: 10px 0; display: grid; gap: 6px; }
.ideas-page .recall label { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; margin: 0; }
.ideas-page .recall input { margin-top: 4px; width: auto; }
.ideas-page .score-row { margin: 8px 0; }
.ideas-page .task { border: 1px solid var(--line); border-radius: var(--r-m); padding: 10px 14px 12px; margin: 10px 0; background: color-mix(in srgb, var(--bg-2) 60%, transparent); }
.ideas-page .task .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ideas-page .deps { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.ideas-page .deps label { font-weight: 400; display: inline-flex; gap: 6px; align-items: center; margin: 0; }
.ideas-page .deps input { width: auto; }
.ideas-page .err { color: var(--danger); font-weight: 700; margin: 8px 0; }
.ideas-page .check { display: flex; gap: 8px; align-items: center; font-weight: 400; }
.ideas-page .check input { width: auto; }
@media (max-width: 640px) { .ideas-page .cols, .ideas-page .task .grid2 { grid-template-columns: 1fr; } }
`;

// Kept for the session so going to an exhibit and back does not lose typed work.
let saved = null;

function freshState() {
  return {
    pitch: t('pitch'),
    stage: 'idle',
    snapshot: '',
    retelling: '',
    recall: RECALL.map(() => false),
    scores: { clarity: 0, memorable: 0, retell: 0 },
    comments: { pitch: '', test: '', experiments: '' },
    includeName: false,
    name: '',
    nextKey: 3,
    tasks: [
      { key: 'k1', experimentId: 'E21', title: 'Run the retelling test with three people', deliverable: 'Three completed retelling tests, saved as text.', acceptance: '3 people finish the test\nEach retelling is checked against the 5 recall points', dependsOn: [], priority: 'high', volunteer: '', due: '' },
      { key: 'k2', experimentId: 'E21', title: 'Rate the candidate projects together', deliverable: 'One ordering from E21 with each rater\'s weights written down.', acceptance: 'At least 3 raters give ratings\nEvery open safety concern is listed with its note', dependsOn: ['k1'], priority: 'medium', volunteer: '', due: '' },
    ],
  };
}

export function ideas(main) {
  const state = saved || (saved = freshState());

  /* ------------------------------------------------------------ pitch */
  const pitchIn = h('textarea', { id: 'ideas-pitch', rows: 8, 'aria-describedby': 'ideas-count', spellcheck: 'true' });
  pitchIn.value = state.pitch;
  const countBox = h('div', { class: 'count', id: 'ideas-count', role: 'status', 'aria-live': 'polite' });
  function updateCount() {
    const s = pitchStatus(pitchIn.value);
    countBox.dataset.state = s.state;
    const msg = s.state === 'empty' ? 'Write or paste a pitch.' : s.state === 'under' ? `${s.remaining} to go` : s.state === 'exact' ? 'on the limit' : `${s.over} over`;
    countBox.replaceChildren(h('b', { 'data-words': s.words }, String(s.words)), h('span', {}, `/ ${s.limit} words`), h('span', { class: 'muted' }, msg));
  }
  pitchIn.addEventListener('input', () => {
    state.pitch = pitchIn.value;
    updateCount();
  });
  updateCount();
  const pitchSec = h('section', {},
    h('h2', {}, 'Pitch in 100 words'),
    h('p', { class: 'muted' }, 'The box starts with the working pitch for ARUN. Replace it with your own pitch for any concept. The count updates as you type. Over 100 words is allowed and marked.'),
    h('label', { for: 'ideas-pitch' }, 'Your pitch'), pitchIn, countBox,
    h('div', { class: 'btnrow' },
      button('Use the working pitch', () => {
        pitchIn.value = t('pitch');
        state.pitch = pitchIn.value;
        updateCount();
      }, { kind: 'small' }),
      button('Clear', () => {
        pitchIn.value = '';
        state.pitch = '';
        updateCount();
        pitchIn.focus();
      }, { kind: 'small ghost' })));

  /* ------------------------------------------------------ retelling test */
  const testHost = h('div', { 'aria-live': 'polite' });
  function renderTest() {
    if (state.stage === 'idle') {
      testHost.replaceChildren(
        h('p', {}, 'Step 1: read the pitch. Step 2: it disappears and you retell it in your own words. Step 3: both appear side by side with five points to check.'),
        button('Start the test', () => {
          if (!pitchIn.value.trim()) return announce('Write a pitch first.', 'error');
          state.snapshot = pitchIn.value;
          state.retelling = '';
          state.recall = RECALL.map(() => false);
          state.stage = 'show';
          renderTest();
        }, { kind: 'primary' }));
    } else if (state.stage === 'show') {
      testHost.replaceChildren(
        h('p', { class: 'muted' }, 'Read it once. Then hide it.'),
        h('div', { class: 'quote', id: 'ideas-shown' }, state.snapshot),
        h('div', { class: 'btnrow' }, button('Hide it and retell', () => {
          state.stage = 'retell';
          renderTest();
          const ta = testHost.querySelector('textarea');
          ta && ta.focus();
        }, { kind: 'primary' }), button('Cancel', () => {
          state.stage = 'idle';
          renderTest();
        }, { kind: 'ghost' })));
    } else if (state.stage === 'retell') {
      const ta = h('textarea', { id: 'ideas-retell', rows: 6 });
      ta.value = state.retelling;
      ta.addEventListener('input', () => (state.retelling = ta.value));
      testHost.replaceChildren(
        h('p', { class: 'muted' }, 'The pitch is hidden. Write what you remember, in your own words.'),
        h('label', { for: 'ideas-retell' }, 'Your retelling'), ta,
        h('div', { class: 'btnrow' }, button('Show both side by side', () => {
          if (!ta.value.trim()) return announce('Write your retelling first.', 'error');
          state.retelling = ta.value;
          state.stage = 'compare';
          renderTest();
        }, { kind: 'primary' }), button('Cancel', () => {
          state.stage = 'idle';
          renderTest();
        }, { kind: 'ghost' })));
    } else {
      const tally = h('p', { class: 'count', role: 'status' });
      const upd = () => tally.replaceChildren(h('b', {}, String(state.recall.filter(Boolean).length)), h('span', {}, 'of 5 points covered by your retelling'));
      upd();
      testHost.replaceChildren(
        h('div', { class: 'cols' },
          h('div', {}, h('h3', {}, 'The pitch'), h('div', { class: 'quote', id: 'ideas-orig' }, state.snapshot)),
          h('div', {}, h('h3', {}, 'Your retelling'), h('div', { class: 'quote', id: 'ideas-own' }, state.retelling))),
        h('h3', {}, 'Five points to look for'),
        h('p', { class: 'muted small' }, 'Tick the ones your retelling covers. You decide; the page does not match words.'),
        h('ul', { class: 'recall' }, RECALL.map((k, i) => {
          const box = h('input', { type: 'checkbox', checked: state.recall[i] });
          box.addEventListener('change', () => {
            state.recall[i] = box.checked;
            upd();
          });
          return h('li', {}, h('label', {}, box, h('span', {}, t(k))));
        })),
        tally,
        h('div', { class: 'btnrow' }, button('Start over', () => {
          state.stage = 'idle';
          renderTest();
        }, { kind: 'small' })));
    }
  }
  renderTest();
  const testSec = h('section', {}, h('h2', {}, 'Retelling test'), testHost);

  /* ---------------------------------------------------- scores, comments */
  const scoreHost = h('div', {});
  for (const [k, q] of SCORE_ROWS) {
    const seg = segmented({ name: 'score-' + k, label: q + ' (optional, 1 to 5)', options: [{ value: 0, label: 'Skip' }, ...[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))] }, state.scores[k], (v) => (state.scores[k] = v));
    scoreHost.append(h('div', { class: 'score-row' }, seg.el));
  }
  const commentHost = h('div', {});
  for (const [label, k] of COMMENT_ROWS) {
    const id = 'ideas-c-' + k;
    const ta = h('textarea', { id, rows: 3 });
    ta.value = state.comments[k];
    ta.addEventListener('input', () => (state.comments[k] = ta.value));
    commentHost.append(h('label', { for: id }, `Comment on ${label.toLowerCase()} (optional)`), ta);
  }
  const feedbackSec = h('section', {}, h('h2', {}, 'Scores and comments'), scoreHost, commentHost);

  /* --------------------------------------------------------- feedback export */
  const nameBox = h('input', { type: 'checkbox', id: 'ideas-incl' });
  nameBox.checked = state.includeName;
  const nameIn = h('input', { type: 'text', id: 'ideas-name', maxlength: 80, 'aria-label': 'Your name for the export', placeholder: 'Name' });
  nameIn.value = state.name;
  nameIn.disabled = !state.includeName;
  const fbMd = h('div', {});
  const fbJson = h('div', {});
  const fbStatus = h('p', { class: 'small muted', role: 'status' }, '');
  let fbBuilt = false;
  function buildFb() {
    const fb = buildFeedback(
      {
        pitch: pitchIn.value,
        retelling: state.stage === 'compare' ? state.retelling : '',
        recall: RECALL.map((k, i) => ({ text: t(k), covered: state.stage === 'compare' && state.recall[i] })),
        scores: Object.fromEntries(Object.entries(state.scores).map(([k, v]) => [k, v || null])),
        comments: COMMENT_ROWS.map(([label, k]) => ({ about: label, text: state.comments[k] })),
      },
      { includeName: state.includeName, name: state.name });
    exportPanel(fbMd, { filename: 'arun-feedback.md', mime: 'text/markdown', text: feedbackToMarkdown(fb, SCORE_LABELS), note: 'Markdown, for reading.' });
    exportPanel(fbJson, { filename: 'arun-feedback.json', mime: 'application/json', text: JSON.stringify(fb, null, 2) + '\n', note: 'The same content as JSON.' });
    fbStatus.textContent = fb.name
      ? 'Your name is in this export because the box is ticked. Logs, seeds and device details are not in it.'
      : 'No name in this export. Logs, seeds and device details are not in it either.';
    fbBuilt = true;
  }
  nameBox.addEventListener('change', () => {
    state.includeName = nameBox.checked;
    nameIn.disabled = !nameBox.checked;
    if (fbBuilt) buildFb();
  });
  nameIn.addEventListener('input', () => {
    state.name = nameIn.value;
    if (fbBuilt) buildFb();
  });
  const zia = h('section', {},
    h('h2', {}, 'Feedback export'),
    h('p', { class: 'muted' }, 'Builds a text file with your pitch, retelling, scores and comments. Copy it or download it, then send it yourself if you choose to.'),
    h('label', { class: 'check', for: 'ideas-incl' }, nameBox, 'Include my name'),
    nameIn,
    h('div', { class: 'btnrow' }, button('Build the feedback export', () => {
      buildFb();
      announce('Feedback export built.');
    }, { kind: 'primary' })),
    fbStatus, fbMd, fbJson);

  /* --------------------------------------------------- Team Wheel handoff */
  const taskHost = h('div', {});
  const twErr = h('p', { class: 'err', role: 'alert', hidden: true });
  const twMd = h('div', {});
  const twJson = h('div', {});
  function renderTasks() {
    taskHost.replaceChildren(...state.tasks.map((tk, idx) => {
      const id = (n) => `ideas-t${tk.key}-${n}`;
      const field = (n, label, ctl) => h('div', {}, h('label', { for: id(n) }, label), ctl);
      const exp = h('select', { id: id('exp') }, EXPERIMENT_IDS.map((e) => h('option', { value: e, selected: tk.experimentId === e }, e)));
      exp.addEventListener('change', () => (tk.experimentId = exp.value));
      const title = h('input', { type: 'text', id: id('title'), maxlength: 120 });
      title.value = tk.title;
      title.addEventListener('input', () => {
        tk.title = title.value;
        for (const s of taskHost.querySelectorAll(`[data-dep-key="${tk.key}"]`)) s.textContent = tk.title || 'Untitled task';
      });
      const del = h('textarea', { id: id('del'), rows: 2 });
      del.value = tk.deliverable;
      del.addEventListener('input', () => (tk.deliverable = del.value));
      const acc = h('textarea', { id: id('acc'), rows: 3 });
      acc.value = tk.acceptance;
      acc.addEventListener('input', () => (tk.acceptance = acc.value));
      const pri = h('select', { id: id('pri') }, PRIORITIES.map((p) => h('option', { value: p, selected: tk.priority === p }, p)));
      pri.addEventListener('change', () => (tk.priority = pri.value));
      const vol = h('input', { type: 'text', id: id('vol'), maxlength: 80, placeholder: 'Leave empty if unassigned' });
      vol.value = tk.volunteer;
      vol.addEventListener('input', () => (tk.volunteer = vol.value));
      const due = h('input', { type: 'date', id: id('due') });
      due.value = tk.due;
      due.addEventListener('change', () => (tk.due = due.value));
      const others = state.tasks.filter((o) => o !== tk);
      const deps = h('div', { class: 'deps' }, others.length ? others.map((o) => {
        const cb = h('input', { type: 'checkbox', checked: tk.dependsOn.includes(o.key) });
        cb.addEventListener('change', () => {
          tk.dependsOn = cb.checked ? [...new Set([...tk.dependsOn, o.key])] : tk.dependsOn.filter((x) => x !== o.key);
        });
        return h('label', {}, cb, h('span', { 'data-dep-key': o.key }, o.title || 'Untitled task'));
      }) : h('span', { class: 'muted' }, 'No other tasks.'));
      return h('div', { class: 'task' },
        h('h3', {}, `Task ${idx + 1}`),
        h('div', { class: 'grid2' }, field('exp', 'Experiment', exp), field('pri', 'Priority', pri)),
        field('title', 'Task title', title),
        field('del', 'Deliverable', del),
        field('acc', 'Acceptance criteria, one per line, each measurable', acc),
        h('div', {}, h('label', {}, 'Depends on'), deps),
        h('div', { class: 'grid2' }, field('vol', 'Volunteer (optional)', vol), field('due', 'Due date (optional)', due)),
        h('div', { class: 'btnrow' }, button('Remove this task', () => {
          state.tasks = state.tasks.filter((o) => o !== tk);
          for (const o of state.tasks) o.dependsOn = o.dependsOn.filter((x) => x !== tk.key);
          renderTasks();
        }, { kind: 'small ghost' })));
    }));
  }
  renderTasks();
  const base = () => location.href.split('#')[0];
  const wheel = h('section', {},
    h('h2', {}, 'Team Wheel handoff'),
    h('p', { class: 'muted' }, 'Task drafts as Markdown and JSON. Each has a stable id, the experiment, a deliverable, acceptance criteria, dependencies, priority, an optional volunteer and due date, a source link, and the status draft. Nothing is assigned or posted. Copy or download the text and hand it over yourself.'),
    taskHost,
    h('div', { class: 'btnrow' },
      button('Add a task', () => {
        state.tasks.push({ key: 'k' + state.nextKey++, experimentId: 'E21', title: '', deliverable: '', acceptance: '', dependsOn: [], priority: 'medium', volunteer: '', due: '' });
        renderTasks();
      }, { kind: 'small' }),
      button('Build the handoff', () => {
        twErr.hidden = true;
        try {
          const tasks = makeTasks(state.tasks.map((tk) => ({ ...tk, acceptance: tk.acceptance.split(/\r?\n/) })), { base: base() });
          exportPanel(twMd, { filename: 'team-wheel-handoff.md', mime: 'text/markdown', text: tasksToMarkdown(tasks), note: `${tasks.length} draft task(s), Markdown.` });
          exportPanel(twJson, { filename: 'team-wheel-handoff.json', mime: 'application/json', text: tasksToJSON(tasks), note: 'The same drafts as JSON. Ids come from the experiment and title, so the same task gets the same id.' });
          announce('Handoff built.');
        } catch (e) {
          twMd.replaceChildren();
          twJson.replaceChildren();
          twErr.textContent = e.message + '.';
          twErr.hidden = false;
          announce(e.message, 'error');
        }
      }, { kind: 'primary' })),
    twErr, twMd, twJson);

  main.replaceChildren(h('div', { class: 'wrap page ideas-page' },
    h('style', {}, css),
    h('h1', {}, t('nav.ideas')),
    h('p', { class: 'lede' }, 'Write a pitch in 100 words, test whether someone can retell it, and pass feedback and task drafts to the team as text.'),
    h('p', {}, h('a', { class: 'btn primary', href: '#e21' }, 'Compare candidate projects in E21 →')),
    pitchSec, testSec, feedbackSec, zia, wheel));
  return { destroy() {} };
}
