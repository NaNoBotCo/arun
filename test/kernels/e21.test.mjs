import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CRITERION_IDS, SEED_CANDIDATES, newCandidate, equalWeights, rank, sensitivity, sampleRatings, validateWeights, validateCandidate,
  countWords, pitchStatus, buildFeedback, feedbackToMarkdown, makeTasks, tasksToJSON, tasksToMarkdown, taskId, scoreCandidate,
} from '../../src/kernels/e21.js';

const cands = (seed = 5) => sampleRatings(SEED_CANDIDATES.map(newCandidate), seed);
const W = equalWeights();

test('no automatic decision: the result carries decision null and no winner field', () => {
  const r = rank(cands(), W);
  assert.equal(r.decision, null);
  assert.ok(!('winner' in r) && !('recommended' in r));
  assert.match(r.note, /not a recommendation or a decision/);
});

test('a safety concern shows whatever the score or the weights', () => {
  const list = cands(9).map((c) => ({ ...c, ratings: Object.fromEntries(CRITERION_IDS.map((k) => [k, 5])) }));
  list[0].safety = { concern: true, note: 'open question about consent' };
  // top score (all fives) and trust/safety weight zero: the flag still comes through
  const w = { ...W, trust: 0 };
  const r = rank(list, w);
  const row = r.rows.find((x) => x.id === list[0].id);
  assert.equal(row.score, 5);
  assert.equal(row.safety.concern, true);
  assert.equal(row.safety.visible, true);
  assert.ok(r.unresolvedSafety.some((s) => s.id === list[0].id && s.note === 'open question about consent'));
  // a low trust rating with no flag still shows a notice
  const low = cands(9).map((c) => ({ ...c, safety: { concern: false, note: '' } }));
  low[1].ratings.trust = 1;
  const r2 = rank(low, { ...W, trust: 0 });
  assert.ok(r2.unresolvedSafety.some((s) => s.id === low[1].id && s.lowRating));
});

test('no founder boost: equal ratings give equal scores; order and origin do not change a score', () => {
  const same = SEED_CANDIDATES.map(newCandidate).map((c) => ({ ...c, ratings: Object.fromEntries(CRITERION_IDS.map((k) => [k, 4])), safety: { concern: false, note: '' } }));
  const r = rank(same, W);
  assert.ok(r.rows.every((x) => x.score === 4 && x.rank === 1), 'all tie at rank 1');
  const a = rank(cands(3), W);
  const b = rank(cands(3).reverse(), W);
  for (const row of a.rows) assert.equal(b.rows.find((x) => x.id === row.id).score, row.score);
  const flipped = cands(3).map((c) => ({ ...c, origin: c.origin === 'project' ? 'developer' : 'project' }));
  const c = rank(flipped, W);
  for (const row of a.rows) assert.equal(c.rows.find((x) => x.id === row.id).score, row.score);
});

test('sample ratings: each candidate retains its ratings when another is added (independent streams)', () => {
  const base = sampleRatings(SEED_CANDIDATES.map(newCandidate), 21);
  const more = sampleRatings([...SEED_CANDIDATES.map(newCandidate), newCandidate({ id: 'extra', name: 'Extra', origin: 'team' })], 21);
  for (const c of base) assert.deepEqual(more.find((x) => x.id === c.id).ratings, c.ratings);
});

test('weighted mean reference: hand calculation, unrated criteria left out', () => {
  const c = newCandidate({ id: 'x', name: 'X', ratings: { memorability: 4, wonder: 2, commercial: null, evidence: 5, externality: null, trust: null } });
  const w = { memorability: 1, wonder: 3, commercial: 9, evidence: 2, externality: 9, trust: 9 };
  const { score, rated } = scoreCandidate(c, w);
  assert.equal(rated, 3);
  assert.ok(Math.abs(score - (4 * 1 + 2 * 3 + 5 * 2) / 6) < 1e-12);
  assert.equal(scoreCandidate(newCandidate({ id: 'y', name: 'Y' }), w).score, null);
});

test('checks: bad ratings, weights and confidence are refused with a plain message', () => {
  assert.throws(() => validateCandidate({ ...newCandidate({ id: 'a', name: 'A' }), ratings: { ...newCandidate({ id: 'a', name: 'A' }).ratings, wonder: 6 } }), /wonder rating must be a whole number from 1 to 5/);
  assert.throws(() => validateWeights({ ...W, trust: -1 }), /weight for trust/);
  assert.throws(() => validateWeights(Object.fromEntries(CRITERION_IDS.map((k) => [k, 0]))), /at least one weight/);
  assert.throws(() => validateCandidate({ ...newCandidate({ id: 'a', name: 'A' }), confidence: 9 }), /confidence/);
  assert.throws(() => rank(cands(), Object.fromEntries(CRITERION_IDS.map((k) => [k, 0]))), /at least one weight/);
});

test('sensitivity: seeded, frequencies sum to 1, spread 0 never moves the order, spread 1 can', () => {
  const list = cands(11);
  const a = sensitivity(list, W, { draws: 800, spread: 0.6 }, 7);
  const b = sensitivity(list, W, { draws: 800, spread: 0.6 }, 7);
  assert.deepEqual(a.freq, b.freq);
  for (const id of a.ids) assert.ok(Math.abs(a.freq[id].reduce((s, v) => s + v, 0) - 1) < 1e-12);
  for (let i = 0; i < a.ids.length; i++) assert.ok(Math.abs(a.ids.reduce((s, id) => s + a.freq[id][i], 0) - 1) < 1e-12, 'each rank is taken once per draw');
  const still = sensitivity(list, W, { draws: 200, spread: 0 }, 1);
  const top = rank(list, W).rows[0].id;
  assert.equal(still.firstShare[top], 1);
  const wild = sensitivity(list, W, { draws: 2000, spread: 1 }, 1);
  assert.ok(Object.values(wild.firstShare).filter((v) => v > 0).length >= 2, 'at full spread more than one candidate comes first sometimes');
  assert.ok(a.oneAtATime.length === 12);
  assert.throws(() => sensitivity(list, W, { draws: 0 }, 1), /draws/);
  assert.throws(() => sensitivity(list, W, { spread: 2 }, 1), /spread/);
});

test('no identity needed: ratings, ranking and export work with no name field anywhere', () => {
  const r = rank(cands(), W);
  assert.ok(!JSON.stringify(r).includes('"name":"undefined"'));
  const fb = buildFeedback({ pitch: 'hello there', retelling: 'x', scores: { clarity: 4 }, recall: [{ text: 'p', covered: true }], comments: [] });
  assert.ok(!('name' in fb));
});

test('no posting or sending: the three source files contain no network or messaging calls', () => {
  for (const f of ['src/kernels/e21.js', 'src/exhibits/e21.js', 'src/pages/ideas.js']) {
    const src = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    for (const word of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'mailto:', 'postMessage(', 'importScripts']) assert.ok(!src.includes(word), `${f} mentions ${word}`);
  }
});

// ---- word count
const words = (n) => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');

test('word count: 0, 100 and 101 words', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \n\t '), 0);
  assert.equal(countWords(words(100)), 100);
  assert.equal(countWords(words(101)), 101);
  assert.deepEqual(pitchStatus(words(100)), { words: 100, limit: 100, state: 'exact', over: 0, remaining: 0 });
  assert.equal(pitchStatus(words(101)).state, 'over');
  assert.equal(pitchStatus(words(101)).over, 1);
  assert.equal(pitchStatus(words(99)).remaining, 1);
  assert.equal(pitchStatus('').state, 'empty');
});

test('word count: punctuation, dashes, hyphens, digits and extra spaces', () => {
  assert.equal(countWords('Hello, world!'), 2);
  assert.equal(countWords('— … ?! ... "" ()'), 0);
  assert.equal(countWords('thing — another thing'), 3);
  assert.equal(countWords('a—b'), 2);
  assert.equal(countWords('state-of-the-art'), 1);
  assert.equal(countWords("don't stop 1,000 times."), 4);
  assert.equal(countWords('one\n\ntwo\tthree   four'), 4);
  assert.equal(countWords(words(100) + ' — ' + '…'), 100);
  assert.equal(countWords(null), 0);
});

test('word count: Thai text agrees with an independent segmenter count and is more than one word', () => {
  const thai = 'ฉันรักประเทศไทยมาก';
  const seg = new Intl.Segmenter('th', { granularity: 'word' });
  const expected = [...seg.segment(thai)].filter((s) => s.isWordLike).length;
  assert.equal(countWords(thai), expected);
  assert.ok(countWords(thai) >= 2);
  assert.equal(countWords(thai + ' hello'), expected + 1);
  assert.equal(countWords('ขอบคุณ มาก'), countWords('ขอบคุณ') + countWords('มาก'));
  assert.equal(countWords('。。。 ！？'), 0);
});

// ---- feedback
const fbState = {
  pitch: 'A short pitch. <b>bold</b>',
  retelling: 'My own words',
  recall: [{ text: 'one', covered: true }, { text: 'two', covered: false }],
  scores: { clarity: 5, memorable: 9, believable: null },
  comments: [{ about: 'pitch', text: 'nice' }, { about: 'empty', text: '  ' }],
  deviceLabel: 'Chromium · desktop · 8 cores',
  jobLog: [{ name: 'x' }],
};

test('feedback export leaves out the name and technical logs unless the name box is ticked', () => {
  const anon = buildFeedback(fbState, { includeName: false, name: 'Zed Person' });
  const js = JSON.stringify(anon);
  assert.ok(!js.includes('Zed'));
  assert.ok(!('name' in anon));
  assert.ok(!/jobLog|device|Chromium|seed|userAgent/i.test(js));
  assert.equal(anon.scores.memorable, null, 'out-of-range score becomes empty');
  assert.equal(anon.comments.length, 1);
  assert.equal(anon.retelling.covered, 1);
  const named = buildFeedback(fbState, { includeName: true, name: 'Zed Person' });
  assert.equal(named.name, 'Zed Person');
  assert.ok(!('name' in buildFeedback(fbState, { includeName: true, name: '  ' })));
  const md = feedbackToMarkdown(anon, { clarity: 'Clarity' });
  assert.ok(!md.includes('Zed') && !md.includes('<b>'), 'text is escaped');
  assert.match(md, /Recall points covered: 1 of 2/);
  assert.match(feedbackToMarkdown(named), /From: Zed Person/);
});

// ---- Team Wheel
const raw = () => [
  { key: 'a', experimentId: 'E21', title: 'Run the retelling test with three people', deliverable: 'A page of notes', acceptance: ['3 people complete the test', 'Each marks 5 recall points'], dependsOn: [], priority: 'high' },
  { key: 'b', experimentId: 'E19', title: 'Check the benchmark on one more device', deliverable: 'A table of timings', acceptance: ['One extra device row'], dependsOn: ['a'], priority: 'low', volunteer: 'A volunteer', due: '2026-12-10' },
];

test('Team Wheel drafts: every field present, status draft, ids stable, optional fields only when given', () => {
  const t = makeTasks(raw(), { base: 'https://example.test/arun/' });
  assert.equal(t.length, 2);
  for (const x of t) {
    assert.deepEqual(Object.keys(x).filter((k) => !['volunteer', 'due'].includes(k)).sort(), ['acceptance', 'deliverable', 'dependsOn', 'experimentId', 'id', 'priority', 'sourceLink', 'status', 'title']);
    assert.equal(x.status, 'draft');
  }
  assert.ok(!('volunteer' in t[0]) && !('due' in t[0]));
  assert.equal(t[1].volunteer, 'A volunteer');
  assert.equal(t[1].due, '2026-12-10');
  assert.deepEqual(t[1].dependsOn, [t[0].id]);
  assert.equal(t[0].sourceLink, 'https://example.test/arun/#e21');
  assert.equal(t[0].id, taskId('E21', 'Run the retelling test with three people'));
  assert.deepEqual(makeTasks(raw()).map((x) => x.id), makeTasks(raw().reverse()).map((x) => x.id).reverse());
  const json = JSON.parse(tasksToJSON(t));
  assert.equal(json.tasks.length, 2);
  assert.ok(json.tasks.every((x) => x.status === 'draft'));
  const md = tasksToMarkdown(t);
  assert.ok(md.includes(t[0].id) && md.includes('status: draft'));
  assert.ok(!/assignee|assigned to/i.test(md + tasksToJSON(t).replace('Nothing here is assigned', '')));
});

test('Team Wheel drafts: missing criteria, loops, self-dependency, bad date and duplicates are refused', () => {
  const r = raw();
  r[0].acceptance = [' '];
  assert.throws(() => makeTasks(r), /acceptance criterion is required/);
  const loop = raw();
  loop[0].dependsOn = ['b'];
  assert.throws(() => makeTasks(loop), /loop/);
  const self = raw();
  self[0].dependsOn = ['a'];
  assert.throws(() => makeTasks(self), /cannot depend on itself/);
  const bad = raw();
  bad[1].due = '2026-13-40';
  assert.throws(() => makeTasks(bad), /YYYY-MM-DD/);
  const dup = raw();
  dup[1].title = dup[0].title;
  dup[1].experimentId = 'E21';
  assert.throws(() => makeTasks(dup), /share one experiment and title/);
  const ex = raw();
  ex[0].experimentId = 'E99';
  assert.throws(() => makeTasks(ex), /E01 to E21/);
  const dang = raw();
  dang[1].dependsOn = ['zzz'];
  assert.throws(() => makeTasks(dang), /not in the list/);
});

test('seeded reproducibility: sample ratings and sensitivity repeat exactly', () => {
  assert.deepEqual(cands(4).map((c) => c.ratings), cands(4).map((c) => c.ratings));
  assert.notDeepEqual(cands(4).map((c) => c.ratings), cands(5).map((c) => c.ratings));
  const a = sensitivity(cands(4), W, { draws: 500 }, 3);
  const b = sensitivity(cands(4), W, { draws: 500 }, 3);
  assert.deepEqual(a, b);
});
