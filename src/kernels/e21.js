// E21 kernel: a decision-support toy for comparing candidate projects, plus the text helpers the Ideas page uses
// (word count, feedback export, Team Wheel task drafts). Pure functions, no DOM, no network.
// It orders ratings that people typed. It does not pick a winner and it does not send anything.

import { makeRng, deriveSeed } from '../core/rng.js';
import { hashText } from '../core/hash.js';

export const CRITERIA = [
  { id: 'memorability', label: 'Memorability', help: 'Can a listener retell it a day later?' },
  { id: 'wonder', label: 'Wonder', help: 'Does it make people want to explore?' },
  { id: 'commercial', label: 'Commercial clarity', help: 'Is it clear who pays and for what?' },
  { id: 'evidence', label: 'Technical evidence', help: 'How much of it has been shown to work?' },
  { id: 'externality', label: 'Positive externality', help: 'Does it help people who are not the buyer?' },
  { id: 'trust', label: 'Trust and safety', help: 'How safe and trustworthy is it as described?' },
];
export const CRITERION_IDS = CRITERIA.map((c) => c.id);
export const MAX_CANDIDATES = 8;
export const PITCH_LIMIT = 100;
export const LOW_TRUST_RATING = 2;

export function blankRatings() {
  return Object.fromEntries(CRITERION_IDS.map((k) => [k, null]));
}

export const SEED_CANDIDATES = Object.freeze([
  { id: 'sky-reach', name: 'Sky Reach', origin: 'developer', ownerNote: 'A concept owned by its developer.', retelling: '', notes: '' },
  { id: 'face-shield', name: 'Face Shield', origin: 'developer', ownerNote: 'A concept owned by its developer.', retelling: '', notes: '' },
  { id: 'arun', name: 'ARUN', origin: 'project', ownerNote: 'A laboratory for possible worlds: this site.', retelling: '', notes: '' },
  {
    id: 'sample', name: 'Sample concept', origin: 'team', ownerNote: 'A placeholder. Rename it, replace it or delete it.', retelling: '', notes: '',
    safety: { concern: true, note: 'Sample note: this placeholder shows how an open concern stays visible. It is about no real project.' },
  },
]);

export function newCandidate(base) {
  return {
    id: base.id, name: base.name, origin: base.origin || 'team', ownerNote: base.ownerNote || '',
    retelling: base.retelling || '', notes: base.notes || '', confidence: base.confidence ?? 3,
    ratings: { ...blankRatings(), ...(base.ratings || {}) },
    safety: { concern: !!(base.safety && base.safety.concern), note: (base.safety && base.safety.note) || '' },
  };
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);

export function validateCandidate(c) {
  if (!c || typeof c !== 'object') throw new Error('candidate must be an object');
  if (typeof c.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(c.id)) throw new Error('candidate id must be 1 to 40 lowercase letters, digits or dashes');
  if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 60) throw new Error('candidate name must be 1 to 60 characters');
  for (const k of CRITERION_IDS) {
    const v = c.ratings && c.ratings[k];
    if (!(v === null || v === undefined || (Number.isInteger(v) && v >= 1 && v <= 5))) throw new Error(`${c.name}: ${k} rating must be a whole number from 1 to 5, or empty`);
  }
  if (!(Number.isInteger(c.confidence) && c.confidence >= 1 && c.confidence <= 5)) throw new Error(`${c.name}: confidence must be a whole number from 1 to 5`);
  return true;
}

export function validateWeights(w) {
  for (const k of CRITERION_IDS) {
    const v = w && w[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10) throw new Error(`weight for ${k} must be a number from 0 to 10`);
  }
  if (!CRITERION_IDS.some((k) => w[k] > 0)) throw new Error('at least one weight must be above 0');
  return true;
}

export function equalWeights() {
  return Object.fromEntries(CRITERION_IDS.map((k) => [k, 1]));
}

// Weighted mean of the criteria that have a rating. Unrated criteria are left out, not counted as zero.
export function scoreCandidate(c, weights) {
  let num = 0;
  let den = 0;
  let rated = 0;
  for (const k of CRITERION_IDS) {
    const r = c.ratings[k];
    if (r === null || r === undefined) continue;
    rated++;
    num += weights[k] * r;
    den += weights[k];
  }
  if (rated === 0 || den === 0) return { score: null, rated };
  return { score: num / den, rated };
}

// A plausible band, an assumption: low confidence widens it by up to one rating point each way.
export function bandFor(score, confidence) {
  if (score === null) return null;
  const s = (5 - confidence) / 4;
  return [Math.max(1, score - s), Math.min(5, score + s)];
}

export function safetyFlag(c) {
  const concern = !!(c.safety && c.safety.concern);
  const trust = c.ratings.trust;
  const lowRating = trust !== null && trust !== undefined && trust <= LOW_TRUST_RATING;
  return { concern, note: (c.safety && c.safety.note) || '', lowRating, visible: concern || lowRating };
}

const TIE = 0.05;

// An ordering of the ratings under the given weights. `decision` is always null: a person decides.
export function rank(candidates, weights) {
  validateWeights(weights);
  candidates.forEach(validateCandidate);
  const rows = candidates.map((c) => {
    const { score, rated } = scoreCandidate(c, weights);
    return { id: c.id, name: c.name, origin: c.origin, score, rated, confidence: c.confidence, band: bandFor(score, c.confidence), safety: safetyFlag(c) };
  });
  const scored = rows.filter((r) => r.score !== null).sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1));
  const unrated = rows.filter((r) => r.score === null);
  scored.forEach((r, i) => {
    if (i > 0 && scored[i - 1].score - r.score < TIE) r.rank = scored[i - 1].rank;
    else r.rank = i + 1;
  });
  scored.forEach((r, i) => {
    r.tiedWithPrevious = i > 0 && scored[i - 1].rank === r.rank;
    r.tiedWithNext = i < scored.length - 1 && scored[i + 1].rank === r.rank;
  });
  const all = scored.concat(unrated.map((r) => ({ ...r, rank: null, tiedWithPrevious: false, tiedWithNext: false })));
  return {
    decision: null,
    rows: all,
    unresolvedSafety: all.filter((r) => r.safety.visible).map((r) => ({ id: r.id, name: r.name, concern: r.safety.concern, lowRating: r.safety.lowRating, note: r.safety.note })),
    note: 'This is an ordering of typed ratings under the weights chosen. It is not a recommendation or a decision.',
  };
}

function dirichlet1(rng, k) {
  const g = Array.from({ length: k }, () => -Math.log(rng.open01()));
  const s = g.reduce((a, b) => a + b, 0);
  return g.map((v) => v / s);
}

// How stable is the order when the weights drift? Each draw blends the chosen weights with random ones.
export function sensitivity(candidates, weights, { draws = 2000, spread = 0.5 } = {}, seed = 1) {
  validateWeights(weights);
  if (!Number.isInteger(draws) || draws < 1 || draws > 20000) throw new Error('draws must be a whole number from 1 to 20000');
  if (typeof spread !== 'number' || !(spread >= 0 && spread <= 1)) throw new Error('spread must be between 0 and 1');
  const rng = makeRng(deriveSeed(seed, 'weights'));
  const total = CRITERION_IDS.reduce((s, k) => s + weights[k], 0);
  const base = CRITERION_IDS.map((k) => weights[k] / total);
  const ids = candidates.filter((c) => scoreCandidate(c, weights).rated > 0).map((c) => c.id);
  const n = ids.length;
  const counts = Object.fromEntries(ids.map((id) => [id, new Array(n).fill(0)]));
  const byId = Object.fromEntries(candidates.map((c) => [c.id, c]));
  const names = Object.fromEntries(candidates.map((c) => [c.id, c.name]));
  for (let d = 0; d < draws; d++) {
    const r = dirichlet1(rng, CRITERION_IDS.length);
    const w = {};
    CRITERION_IDS.forEach((k, i) => (w[k] = (1 - spread) * base[i] + spread * r[i]));
    const sc = ids.map((id) => ({ id, s: scoreCandidate(byId[id], w).score })).filter((q) => q.s !== null);
    sc.sort((a, b) => b.s - a.s || (names[a.id] < names[b.id] ? -1 : 1));
    sc.forEach((q, i) => counts[q.id][i]++);
  }
  const freq = Object.fromEntries(ids.map((id) => [id, counts[id].map((c) => c / draws)]));
  const firstShare = Object.fromEntries(ids.map((id) => [id, freq[id][0]]));
  const meanRank = Object.fromEntries(ids.map((id) => [id, freq[id].reduce((s, p, i) => s + p * (i + 1), 0)]));
  // One criterion at a time: drop it, or double it.
  const one = [];
  const orderOf = (w) => rank(candidates, w).rows.filter((r) => r.score !== null).map((r) => r.id);
  const baseOrder = orderOf(weights);
  for (const k of CRITERION_IDS) {
    for (const mode of ['drop', 'double']) {
      const w = { ...weights };
      w[k] = mode === 'drop' ? 0 : Math.min(10, weights[k] * 2 || 1);
      if (!CRITERION_IDS.some((q) => w[q] > 0)) {
        one.push({ criterion: k, mode, order: null, firstChanges: null });
        continue;
      }
      const order = orderOf(w);
      one.push({ criterion: k, mode, order, firstChanges: order[0] !== baseOrder[0], orderChanges: order.join() !== baseOrder.join() });
    }
  }
  return { draws, spread, ids, freq, firstShare, meanRank, oneAtATime: one, baseOrder };
}

// Seeded example ratings. Each cell has its own stream, so adding a candidate never changes another candidate's ratings.
export function sampleRatings(candidates, seed) {
  return candidates.map((c) => {
    const ratings = {};
    // Trust and safety example ratings run 3 to 5, so an example never raises a low-rating notice about any concept.
    for (const k of CRITERION_IDS) ratings[k] = (k === 'trust' ? 3 : 1) + makeRng(deriveSeed(seed, `${c.id}:${k}`)).int(k === 'trust' ? 3 : 5);
    return { ...c, ratings, confidence: 1 + makeRng(deriveSeed(seed, `${c.id}:confidence`)).int(5) };
  });
}

/* ------------------------------------------------------------------ words */

const NOSPACE = /[\p{Script=Thai}\p{Script=Khmer}\p{Script=Lao}\p{Script=Myanmar}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAS_WORD = /[\p{L}\p{N}]/u;
let segmenter;

// Words are runs between spaces and dashes that contain a letter or digit. Scripts written without spaces
// (Thai, Khmer, Lao, Myanmar, Chinese, Japanese) are split by the browser's word segmenter.
export function countWords(text) {
  if (typeof text !== 'string' || !text) return 0;
  if (segmenter === undefined) segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'word' }) : null;
  let n = 0;
  for (const chunk of text.split(/[\s‒–—―]+/)) {
    if (!chunk || !HAS_WORD.test(chunk)) continue;
    if (segmenter && NOSPACE.test(chunk)) {
      let k = 0;
      for (const s of segmenter.segment(chunk)) if (s.isWordLike) k++;
      n += Math.max(1, k);
    } else n += 1;
  }
  return n;
}

export function pitchStatus(text, limit = PITCH_LIMIT) {
  const words = countWords(text);
  const state = words === 0 ? 'empty' : words < limit ? 'under' : words === limit ? 'exact' : 'over';
  return { words, limit, state, over: Math.max(0, words - limit), remaining: Math.max(0, limit - words) };
}

/* -------------------------------------------------------- feedback export */

const mdEsc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const oneLine = (s) => mdEsc(s).replace(/\s+/g, ' ').trim();
const quote = (s) => (String(s ?? '').trim() ? mdEsc(s).trim().split(/\r?\n/).map((l) => '> ' + l).join('\n') : '> (empty)');

// What goes to a person: their pitch, retelling, recall self-check, scores and comments. No logs, no seeds,
// no device details. A name appears only when `includeName` is true and a name was typed.
export function buildFeedback(state, { includeName = false, name = '' } = {}) {
  const sc = state.scores || {};
  const scores = {};
  for (const k of Object.keys(sc)) scores[k] = Number.isInteger(sc[k]) && sc[k] >= 1 && sc[k] <= 5 ? sc[k] : null;
  const recall = (state.recall || []).map((r) => ({ point: clean(r.text, 400), covered: !!r.covered }));
  const out = {
    kind: 'arun-feedback',
    version: 1,
    pitch: { text: clean(state.pitch, 4000), words: countWords(state.pitch || '') },
    retelling: { text: clean(state.retelling, 4000), recall, covered: recall.filter((r) => r.covered).length, of: recall.length },
    scores,
    comments: (state.comments || []).filter((c) => c && String(c.text || '').trim()).map((c) => ({ about: clean(c.about, 80), text: clean(c.text, 2000) })),
  };
  if (includeName && String(name).trim()) out.name = clean(String(name).trim(), 80);
  return out;
}

export function feedbackToMarkdown(fb, labels = {}) {
  const L = [];
  L.push('# Feedback on the pitch');
  L.push('');
  if (fb.name) L.push(`From: ${oneLine(fb.name)}`, '');
  L.push(`## Pitch (${fb.pitch.words} words)`, '', quote(fb.pitch.text), '');
  L.push('## Retelling', '', quote(fb.retelling.text), '');
  L.push(`Recall points covered: ${fb.retelling.covered} of ${fb.retelling.of}`, '');
  for (const r of fb.retelling.recall) L.push(`- [${r.covered ? 'x' : ' '}] ${oneLine(r.point)}`);
  L.push('', '## Scores (1 to 5, optional)', '');
  for (const [k, v] of Object.entries(fb.scores)) L.push(`- ${oneLine(labels[k] || k)}: ${v === null ? 'not given' : v}`);
  if (fb.comments.length) {
    L.push('', '## Comments', '');
    for (const c of fb.comments) L.push(`**${oneLine(c.about)}**`, '', quote(c.text), '');
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/* ------------------------------------------------------- Team Wheel drafts */

export const EXPERIMENT_IDS = Array.from({ length: 21 }, (_, i) => 'E' + String(i + 1).padStart(2, '0'));
export const PRIORITIES = ['low', 'medium', 'high'];

export function taskId(experimentId, title) {
  return `tw-${String(experimentId).toLowerCase()}-${hashText(`${experimentId}|${String(title).trim().toLowerCase()}`).slice(0, 10)}`;
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// raw: [{ key, experimentId, title, deliverable, acceptance: string[], dependsOn: key[], priority, volunteer?, due? }]
// Returns drafts with stable ids. Throws a plain message when a draft is not usable.
export function makeTasks(raw, { base = '' } = {}) {
  if (!Array.isArray(raw) || raw.length > 60) throw new Error('tasks must be a list of at most 60');
  const keyToId = new Map();
  const ids = new Set();
  for (const r of raw) {
    if (!EXPERIMENT_IDS.includes(r.experimentId)) throw new Error(`"${clean(r.title, 40)}": experiment must be E01 to E21`);
    const title = clean(r.title, 120).trim();
    if (title.length < 3) throw new Error('each task needs a title of at least 3 characters');
    const id = taskId(r.experimentId, title);
    if (ids.has(id)) throw new Error(`"${title}": two tasks share one experiment and title`);
    ids.add(id);
    keyToId.set(r.key, id);
  }
  const tasks = raw.map((r) => {
    const title = clean(r.title, 120).trim();
    const deliverable = clean(r.deliverable, 600).trim();
    if (!deliverable) throw new Error(`"${title}": a deliverable is required`);
    const acceptance = (r.acceptance || []).map((a) => clean(a, 300).trim()).filter(Boolean);
    if (!acceptance.length) throw new Error(`"${title}": at least one measurable acceptance criterion is required`);
    if (!PRIORITIES.includes(r.priority)) throw new Error(`"${title}": priority must be low, medium or high`);
    const due = r.due ? String(r.due) : '';
    if (due && !validDate(due)) throw new Error(`"${title}": due date must be YYYY-MM-DD`);
    const dependsOn = (r.dependsOn || []).map((k) => {
      if (!keyToId.has(k)) throw new Error(`"${title}": a dependency points to a task that is not in the list`);
      return keyToId.get(k);
    });
    const id = keyToId.get(r.key);
    if (dependsOn.includes(id)) throw new Error(`"${title}": a task cannot depend on itself`);
    const t = {
      id, experimentId: r.experimentId, title, deliverable, acceptance, dependsOn: [...new Set(dependsOn)], priority: r.priority,
      sourceLink: `${base}#${r.experimentId.toLowerCase()}`, status: 'draft',
    };
    const vol = clean(r.volunteer, 80).trim();
    if (vol) t.volunteer = vol;
    if (due) t.due = due;
    return t;
  });
  // No dependency loops.
  const dep = new Map(tasks.map((t) => [t.id, t.dependsOn]));
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) throw new Error('tasks depend on each other in a loop: ' + [...trail, id].join(' → '));
    state.set(id, 1);
    for (const d of dep.get(id) || []) visit(d, [...trail, id]);
    state.set(id, 2);
  };
  for (const t of tasks) visit(t.id, []);
  return tasks;
}

export function tasksToJSON(tasks) {
  return JSON.stringify({ kind: 'team-wheel-handoff', version: 1, note: 'Drafts. Nothing here is assigned, posted or sent.', tasks }, null, 2) + '\n';
}

export function tasksToMarkdown(tasks) {
  const L = ['# Team Wheel handoff: task drafts', '', 'Status of every item: draft. Nothing is assigned, posted or sent.', ''];
  for (const t of tasks) {
    L.push(`## ${oneLine(t.title)}`, '');
    L.push(`- id: \`${t.id}\``);
    L.push(`- experiment: ${t.experimentId}`);
    L.push(`- deliverable: ${oneLine(t.deliverable)}`);
    L.push('- acceptance criteria:');
    for (const a of t.acceptance) L.push(`  - ${oneLine(a)}`);
    L.push(`- depends on: ${t.dependsOn.length ? t.dependsOn.map((d) => `\`${d}\``).join(', ') : 'none'}`);
    L.push(`- priority: ${t.priority}`);
    if (t.volunteer) L.push(`- volunteer: ${oneLine(t.volunteer)}`);
    if (t.due) L.push(`- due: ${t.due}`);
    L.push(`- source: ${oneLine(t.sourceLink)}`);
    L.push(`- status: ${t.status}`, '');
  }
  return L.join('\n');
}

export const jobs = {};
