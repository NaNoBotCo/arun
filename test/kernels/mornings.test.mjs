// Possible mornings: the extracted graph model must equal the candidate page it came from, and stand on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  N, W, EDGES, OPTIONS, PLACES, ORIGINS, EXAMPLE_START, idx, world, network, shortest, solve, tripPath, pathMinutes,
  runMornings, savings, timeLayout, tripRecord, replay, heapShortest, gridCity, benchCity, METHOD_VERSION, FIXTURE_HASH,
} from '../../src/mornings/city.js';

// ---- Reference: the candidate page's own model, copied line for line from
// ARUN_Possible_Mornings_Claude_Handoff.zip / arun-possible-city.html (27 Nov 2026), lines 7–13. ----
const REF = (() => {
  const N = 80, W = 10, H = 8;
  function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
  const idx=(x,y)=>y*W+x;const edges=[];function add(a,b,t,type='road'){edges.push({a,b,t,type})}for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(x<W-1&&x!==4)add(idx(x,y),idx(x+1,y),2.4);if(y<H-1)add(idx(x,y),idx(x,y+1),2.1)}add(idx(4,1),idx(5,1),6,'bridge');add(idx(4,6),idx(5,6),6,'bridge');const extra=[{a:idx(4,4),b:idx(5,4),t:5.5,type:'ferry'},{a:idx(4,3),b:idx(5,3),t:3.5,type:'bridge'},{a:idx(1,6),b:idx(4,4),t:3.6,type:'express'}];const dest=[idx(7,4),idx(2,2),idx(8,1)];const origins=Array.from({length:24},(_,i)=>idx([0,1,3,6,7,9][i%6],[0,2,4,7][Math.floor(i/6)]));
  function world(seed){const r=rng(seed+1771),rain=r(),traffic=.7+r()*.95;let weights=edges.map(e=>e.t*(traffic*(.72+r()*.65)+rain*(e.type==='bridge'?.42:.25)));let ex=extra.map(e=>e.t*(e.type==='ferry'?1+rain*1.7+r()*.4:traffic+rain*.28+r()*.22));return {rain,traffic,weights,ex}}
  function graph(w,opt){const a=Array.from({length:N},()=>[]);function link(e,v){a[e.a].push([e.b,v]);a[e.b].push([e.a,v])}edges.forEach((e,i)=>link(e,w.weights[i]));if(opt>=0)link(extra[opt],w.ex[opt]);return a}
  function shortest(a,root){let d=new Float64Array(N).fill(Infinity),p=new Int16Array(N).fill(-1),used=new Uint8Array(N);d[root]=0;for(let k=0;k<N;k++){let u=-1,min=Infinity;for(let i=0;i<N;i++)if(!used[i]&&d[i]<min){u=i;min=d[i]}if(u<0)break;used[u]=1;for(const [v,c] of a[u])if(min+c<d[v]){d[v]=min+c;p[v]=u}}return {d,p}}
  function solve(w,opt){let a=graph(w,opt), paths=dest.map(d=>shortest(a,d));return {mean:paths.reduce((s,p)=>s+origins.reduce((v,i)=>v+p.d[i],0),0)/(origins.length*dest.length),paths}}
  return { world, solve, idx };
})();

// Independent check: Floyd–Warshall on the same network.
function floyd(adj) {
  const n = adj.length;
  const d = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(n).fill(Infinity);
    row[i] = 0;
    return row;
  });
  for (let u = 0; u < n; u++) for (const [v, c] of adj[u]) if (c < d[u][v]) d[u][v] = c;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
  return d;
}

const RUN = runMornings({ count: 512 });

test('equals the candidate page: all 512 mornings, today and each option (exact)', () => {
  for (let i = 0; i < 512; i++) {
    const w = REF.world(i);
    assert.equal(RUN.rain[i], w.rain);
    assert.equal(RUN.base[i], REF.solve(w, -1).mean, `morning ${i + 1} today`);
    for (let k = 0; k < 3; k++) assert.equal(RUN.alt[k][i], REF.solve(w, k).mean, `morning ${i + 1} option ${k}`);
  }
});

test('equals the candidate page: search trees too, so the drawn routes match (exact)', () => {
  for (const i of [0, 38, 255, 511]) {
    const w = REF.world(i);
    for (const k of [-1, 0, 1, 2]) {
      const a = REF.solve(w, k).paths;
      const b = solve(world(i), k);
      for (let p = 0; p < 3; p++) {
        assert.deepEqual(Array.from(b.dist[p]), Array.from(a[p].d));
        assert.deepEqual(Array.from(b.prev[p]), Array.from(a[p].p));
      }
    }
  }
});

test('the packet\'s numbers: morning 39 with the new bridge, market trip 26.0 → 17.7 min; bridge median 1.79 min/trip (to 0.01)', () => {
  const s = solve(world(38), -1);
  const b = solve(world(38), 1);
  const start = EXAMPLE_START[0];
  assert.equal(s.dist[0][start].toFixed(1), '26.0');
  assert.equal(b.dist[0][start].toFixed(1), '17.7');
  const g = Array.from(savings(RUN, 1)).sort((x, y) => x - y);
  assert.equal(g[Math.floor(0.5 * 511)].toFixed(2), '1.79');
});

test('shortest paths agree with Floyd–Warshall on 12 mornings × 4 networks (to 1e-9 min)', () => {
  for (const i of [0, 7, 38, 99, 150, 201, 256, 300, 333, 404, 470, 511]) {
    const w = world(i);
    for (const k of [-1, 0, 1, 2]) {
      const adj = network(w, k);
      const fw = floyd(adj);
      for (const pl of PLACES) {
        const { d } = shortest(adj, pl.node);
        for (let v = 0; v < N; v++) assert.ok(Math.abs(d[v] - fw[pl.node][v]) < 1e-9);
      }
    }
  }
});

test('known shortest path on a hand-made graph', () => {
  // 0 —1— 1 —1— 2, and a direct 0—2 street of 5: the way through 1 wins at 2 min.
  const adj = [[[1, 1], [2, 5]], [[0, 1], [2, 1]], [[1, 1], [0, 5]]];
  const { d, p } = shortest(adj, 0);
  assert.deepEqual(Array.from(d), [0, 1, 2]);
  assert.deepEqual(tripPath(p, d, 2), [2, 1, 0]);
});

test('a corner with no street is unreachable: Infinity, no path, and solve refuses', () => {
  const adj = [[[1, 2]], [[0, 2]], []];
  const { d, p } = shortest(adj, 0);
  assert.equal(d[2], Infinity);
  assert.equal(tripPath(p, d, 2), null);
  const w = world(0);
  const cut = EDGES.map((e, k) => k).filter((k) => EDGES[k].a === ORIGINS[0] || EDGES[k].b === ORIGINS[0]);
  assert.throws(() => solve(w, { remove: cut }), /cannot reach/);
});

test('the same morning twice is the same morning; the next one differs', () => {
  assert.deepEqual(world(38), world(38));
  assert.notEqual(world(38).rain, world(39).rain);
  const again = runMornings({ count: 512 });
  assert.deepEqual(Array.from(again.base), Array.from(RUN.base));
});

test('matched weights: today and every option share each street\'s minutes', () => {
  const w = world(77);
  const today = network(w, -1);
  for (let k = 0; k < 3; k++) {
    const changed = network(w, k);
    for (let v = 0; v < N; v++) {
      const extra = changed[v].length - today[v].length;
      assert.ok(extra === 0 || extra === 1);
      assert.deepEqual(changed[v].slice(0, today[v].length), today[v]);
    }
  }
});

test('adding a link leaves no trip longer: every corner, place, option and morning (unclipped, ≥ −1e-12)', () => {
  for (let i = 0; i < 512; i += 1) {
    const w = world(i);
    const s = solve(w, -1);
    for (let k = 0; k < 3; k++) {
      const c = solve(w, k);
      for (let p = 0; p < 3; p++) for (let v = 0; v < N; v++) assert.ok(c.dist[p][v] <= s.dist[p][v] + 1e-12);
    }
  }
  for (let k = 0; k < 3; k++) assert.ok(Math.min(...savings(RUN, k)) >= -1e-12);
});

test('a link that takes forever changes nothing; a link of zero minutes never hurts', () => {
  const w = world(3);
  const s = solve(w, -1);
  const never = solve(w, { add: [{ a: idx(0, 0), b: idx(9, 7), minutes: Infinity }] });
  assert.deepEqual(never.dist.map((d) => Array.from(d)), s.dist.map((d) => Array.from(d)));
  const free = solve(w, { add: [{ a: idx(0, 0), b: idx(9, 7), minutes: 0 }] });
  assert.ok(free.mean <= s.mean);
  assert.throws(() => solve(w, { add: [{ a: 0, b: 1, minutes: -1 }] }), /zero or more/);
});

test('a harmful change shows as a negative saving, not clipped to zero', () => {
  const w = world(38);
  const s = solve(w, -1);
  const oldBridges = EDGES.map((e, k) => (e.type === 'bridge' ? k : -1)).filter((k) => k >= 0);
  const closed = solve(w, { remove: [oldBridges[0]] });
  const slowed = solve(w, { scale: [{ edge: oldBridges[1], factor: 3 }] });
  assert.ok(s.mean - closed.mean < 0);
  assert.ok(s.mean - slowed.mean < 0);
});

test('least useful morning: the ferry saves nothing on some mornings; the lowest is found and stable', () => {
  const g = savings(RUN, 0);
  let j = 0;
  for (let i = 1; i < g.length; i++) if (g[i] < g[j]) j = i;
  assert.ok(Math.abs(g[j]) < 1e-12);
  const g2 = savings(runMornings({ count: 512 }), 0);
  let j2 = 0;
  for (let i = 1; i < g2.length; i++) if (g2[i] < g2[j2]) j2 = i;
  assert.equal(j2, j);
});

test('every output is finite', () => {
  for (const a of [RUN.rain, RUN.traffic, RUN.base, ...RUN.alt]) for (const v of a) assert.ok(Number.isFinite(v));
});

test('bad input throws a plain message', () => {
  assert.throws(() => runMornings({ count: 0 }), /whole number from 1/);
  assert.throws(() => runMornings({ count: 5000 }), /whole number from 1/);
  assert.throws(() => world(-1), /Morning index/);
  assert.throws(() => world(1.5), /Morning index/);
  assert.throws(() => network(world(0), 7), /No such option/);
});

test('run record replays to the same numbers (exact); a changed city is refused', () => {
  const rec = tripRecord({ morning: 39, option: 1, place: 0, start: EXAMPLE_START[0] });
  assert.equal(rec.methodVersion, METHOD_VERSION);
  assert.equal(rec.fixture, FIXTURE_HASH);
  assert.deepEqual(replay(JSON.parse(JSON.stringify(rec))), rec);
  assert.throws(() => replay({ ...rec, fixture: 'other' }), /different city/);
  assert.throws(() => replay({ ...rec, methodVersion: 'x' }), /this page computes/);
});

test('time layout: the place at the centre, distance from it in minutes, bearing as on the street map', () => {
  const geo = new Float64Array(2 * N);
  for (let i = 0; i < N; i++) {
    geo[2 * i] = (i % W) * 10 + Math.sin(i) * 2;
    geo[2 * i + 1] = Math.floor(i / W) * 10 + Math.cos(i) * 2;
  }
  const s = solve(world(38), -1);
  const anchor = PLACES[0].node;
  const L = timeLayout(geo, s.dist[0], anchor, 100, 120, 4);
  assert.equal(L[2 * anchor], 100);
  assert.equal(L[2 * anchor + 1], 120);
  for (const v of [0, 13, 55, 79]) {
    const r = Math.hypot(L[2 * v] - 100, L[2 * v + 1] - 120);
    assert.ok(Math.abs(r - s.dist[0][v] * 4) < 1e-9);
    const a1 = Math.atan2(L[2 * v + 1] - 120, L[2 * v] - 100);
    const a0 = Math.atan2(geo[2 * v + 1] - geo[2 * anchor + 1], geo[2 * v] - geo[2 * anchor]);
    assert.ok(Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))) < 1e-9);
  }
});

test('a trip\'s minutes along its path run from 0 to the trip total', () => {
  const s = solve(world(38), 1);
  const path = tripPath(s.prev[0], s.dist[0], EXAMPLE_START[0]);
  const m = pathMinutes(path, s.dist[0]);
  assert.equal(m[0], 0);
  assert.ok(Math.abs(m[m.length - 1] - s.dist[0][EXAMPLE_START[0]]) < 1e-12);
  for (let i = 1; i < m.length; i++) assert.ok(m[i] >= m[i - 1]);
  assert.equal(path[path.length - 1], PLACES[0].node);
});

test('city-sized search: heap Dijkstra equals the grid search on a small city (exact) and times itself', () => {
  const g = gridCity(9, 5);
  const adj = Array.from({ length: g.n }, (_, u) => {
    const out = [];
    for (let e = g.offs[u]; e < g.offs[u + 1]; e++) out.push([g.to[e], g.wt[e]]);
    return out;
  });
  for (const root of [0, 40, 80]) {
    const a = heapShortest(g.n, g.offs, g.to, g.wt, root);
    const b = shortest(adj, root).d;
    for (let v = 0; v < g.n; v++) assert.ok(Math.abs(a[v] - b[v]) < 1e-9);
  }
  const bench = benchCity({ side: 60, searches: 3 });
  assert.equal(bench.corners, 3600);
  assert.ok(bench.msMedian >= 0 && Number.isFinite(bench.check));
});

test('the fixture is the candidate page\'s: 80 corners, 134 streets + 2 bridges, 3 options, 3 places, 24 homes', () => {
  assert.equal(N, 80);
  assert.equal(EDGES.length, 8 * 8 + 10 * 7 + 2);
  assert.equal(OPTIONS.length, 3);
  assert.equal(PLACES.length, 3);
  assert.equal(ORIGINS.length, 24);
  assert.equal(new Set(ORIGINS).size, 24);
});

test('the page\'s opening morning is the new bridge\'s typical morning (so the first screen needs no run)', async () => {
  const { typicalMorning, leastUsefulMorning, DEFAULT_MORNING, DEFAULT_OPTION } = await import('../../src/mornings/city.js');
  assert.equal(typicalMorning(savings(RUN, DEFAULT_OPTION)), DEFAULT_MORNING);
  const g = savings(RUN, 0);
  assert.equal(g[leastUsefulMorning(g) - 1], Math.min(...g));
});
