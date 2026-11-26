// E19 kernel: a discrete-event job queue for compute economics. Pure functions, no DOM.
// Jobs arrive, wait in a queue, and run on slots of CPU nodes (and GPU nodes only when the user enters them).
// Every number about hardware, power and money is an input. Nothing here describes real hardware.

import { makeRng, deriveSeed } from '../core/rng.js';
import { quantileSorted } from '../core/stats.js';
import { hashNumbers } from '../core/hash.js';

export const TYPE_NAMES = ['Ensemble member', 'Climate inference', 'Geospatial batch'];
export const MAX_JOBS = 20000;

export const DEFAULTS = Object.freeze({
  horizon_h: 24,
  arrivals_per_h: 18,
  mix: [0.4, 0.3, 0.3],
  service_h: [0.5, 1.5, 0.75],
  memory_gb: [8, 32, 16],
  priority: [1, 2, 0],
  gpuCapable: [false, true, false],
  cv: 0.6,
  serviceDist: 'lognormal',
  cpuNodes: 8,
  slotsPerNode: 4,
  nodeMemory_gb: 128,
  idle_w: 120,
  busy_w: 380,
  nodeCost_usd_h: 0.9,
  gpuNodes: 0,
  gpuSlots: 1,
  gpuMemory_gb: 80,
  gpu_speedup: 8,
  gpu_idle_w: 60,
  gpu_busy_w: 700,
  gpuCost_usd_h: 2.5,
  policy: 'fifo',
  aging_h: 6,
  reserve_fraction: 0,
  pue: 1.4,
  electricity_usd_kwh: 0.12,
  price_cpu_usd_slot_h: 0.4,
  price_gpu_usd_slot_h: 2.0,
  value_per_job_usd: 25,
  drain: false,
});

function num(cfg, key, lo, hi) {
  const v = cfg[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${key} must be a number`);
  if (v < lo || v > hi) throw new Error(`${key} must be between ${lo} and ${hi}`);
  return v;
}

function arr3(cfg, key, lo, hi) {
  const a = cfg[key];
  if (!Array.isArray(a) || a.length !== 3) throw new Error(`${key} needs three numbers`);
  a.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${key}[${i}] must be between ${lo} and ${hi}`);
  });
  return a;
}

export function normalizeConfig(input = {}) {
  const c = { ...DEFAULTS, ...input };
  num(c, 'horizon_h', 0.5, 100000);
  num(c, 'arrivals_per_h', 0, 5000);
  arr3(c, 'mix', 0, 1);
  if (!(c.mix[0] + c.mix[1] + c.mix[2] > 0)) throw new Error('mix needs at least one share above 0');
  arr3(c, 'service_h', 0.001, 1000);
  arr3(c, 'memory_gb', 0.01, 4096);
  arr3(c, 'priority', 0, 2);
  num(c, 'cv', 0, 3);
  if (!['lognormal', 'exponential'].includes(c.serviceDist)) throw new Error('serviceDist must be lognormal or exponential');
  num(c, 'cpuNodes', 0, 64);
  num(c, 'slotsPerNode', 1, 64);
  num(c, 'nodeMemory_gb', 0.1, 8192);
  num(c, 'idle_w', 0, 20000);
  num(c, 'busy_w', 0, 20000);
  if (c.busy_w < c.idle_w) throw new Error('busy_w must be at least idle_w');
  num(c, 'nodeCost_usd_h', 0, 10000);
  num(c, 'gpuNodes', 0, 16);
  num(c, 'gpuSlots', 1, 16);
  num(c, 'gpuMemory_gb', 0.1, 8192);
  num(c, 'gpu_speedup', 1, 500);
  num(c, 'gpu_idle_w', 0, 20000);
  num(c, 'gpu_busy_w', 0, 20000);
  if (c.gpu_busy_w < c.gpu_idle_w) throw new Error('gpu_busy_w must be at least gpu_idle_w');
  num(c, 'gpuCost_usd_h', 0, 10000);
  if (!['fifo', 'priority', 'fair'].includes(c.policy)) throw new Error('policy must be fifo, priority or fair');
  num(c, 'aging_h', 0.01, 10000);
  num(c, 'reserve_fraction', 0, 0.9);
  num(c, 'pue', 1, 3);
  num(c, 'electricity_usd_kwh', 0, 5);
  num(c, 'price_cpu_usd_slot_h', 0, 10000);
  num(c, 'price_gpu_usd_slot_h', 0, 10000);
  num(c, 'value_per_job_usd', 0, 1e7);
  if (Number.isInteger(c.cpuNodes) === false || Number.isInteger(c.gpuNodes) === false || Number.isInteger(c.slotsPerNode) === false || Number.isInteger(c.gpuSlots) === false)
    throw new Error('node and slot counts must be whole numbers');
  if (c.jobs !== undefined) {
    if (!Array.isArray(c.jobs) || c.jobs.length > MAX_JOBS) throw new Error(`jobs must be a list of at most ${MAX_JOBS}`);
    for (const j of c.jobs) {
      if (!(Number.isFinite(j.t) && j.t >= 0)) throw new Error('each job needs t ≥ 0');
      if (![0, 1, 2].includes(j.type)) throw new Error('each job needs type 0, 1 or 2');
    }
  }
  return c;
}

export function gpuStatus(cfg) {
  const c = { ...DEFAULTS, ...cfg };
  if (!c.gpuNodes) return { status: 'unavailable', reason: 'No GPU entered. GPU-capable jobs run on CPU slots.' };
  return { status: 'assumed', reason: `${c.gpuNodes} GPU node(s) entered by the user as an assumption; not a claim about any real machine.` };
}

// Minimal binary min-heap on (key, id).
function makeHeap() {
  const k = [];
  const v = [];
  return {
    get size() {
      return k.length;
    },
    peek: () => k[0],
    push(key, id) {
      let i = k.length;
      k.push(key);
      v.push(id);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (k[p] < k[i] || (k[p] === k[i] && v[p] <= v[i])) break;
        [k[p], k[i]] = [k[i], k[p]];
        [v[p], v[i]] = [v[i], v[p]];
        i = p;
      }
    },
    pop() {
      const id = v[0];
      const lk = k.pop();
      const lv = v.pop();
      if (k.length) {
        k[0] = lk;
        v[0] = lv;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          const less = (a, b) => k[a] < k[b] || (k[a] === k[b] && v[a] < v[b]);
          if (l < k.length && less(l, m)) m = l;
          if (r < k.length && less(r, m)) m = r;
          if (m === i) break;
          [k[m], k[i]] = [k[i], k[m]];
          [v[m], v[i]] = [v[i], v[m]];
          i = m;
        }
      }
      return id;
    },
  };
}

// The workload is drawn from its own seeded streams, so two queue policies see the same jobs.
export function makeWorkload(cfg, seed) {
  const c = cfg;
  const rngA = makeRng(deriveSeed(seed, 'arrivals'));
  const rngT = makeRng(deriveSeed(seed, 'types'));
  const rngS = makeRng(deriveSeed(seed, 'service'));
  const t = [];
  const type = [];
  const svc = [];
  const draw = (ty) => {
    const m = c.service_h[ty];
    if (c.cv === 0) return m;
    if (c.serviceDist === 'exponential') return -m * Math.log(rngS.open01());
    const s2 = Math.log(1 + c.cv * c.cv);
    return Math.exp(Math.log(m) - s2 / 2 + Math.sqrt(s2) * rngS.normal());
  };
  if (c.jobs) {
    const list = c.jobs.filter((j) => j.t < c.horizon_h).sort((a, b) => a.t - b.t);
    for (const j of list) {
      t.push(j.t);
      type.push(j.type);
      svc.push(j.service_h !== undefined ? j.service_h : draw(j.type));
    }
  } else if (c.arrivals_per_h > 0) {
    const total = c.mix[0] + c.mix[1] + c.mix[2];
    let now = 0;
    for (;;) {
      now += -Math.log(rngA.open01()) / c.arrivals_per_h;
      if (now >= c.horizon_h) break;
      if (t.length >= MAX_JOBS) throw new Error(`Demand × horizon makes more than ${MAX_JOBS} jobs. Shorten the horizon or lower the demand.`);
      const u = rngT.uniform() * total;
      const ty = u < c.mix[0] ? 0 : u < c.mix[0] + c.mix[1] ? 1 : 2;
      t.push(now);
      type.push(ty);
      svc.push(draw(ty));
    }
  }
  return { t, type, svc };
}

export function simulate(input, seed = 1) {
  const c = normalizeConfig(input);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('seed must be a whole number from 0 to 4294967295');
  const wl = makeWorkload(c, seed);
  const n = wl.t.length;

  // Nodes.
  const nodes = [];
  for (let i = 0; i < c.cpuNodes; i++)
    nodes.push({ pool: 0, slots: c.slotsPerNode, mem: c.nodeMemory_gb, idle_w: c.idle_w, busy_w: c.busy_w, cost_h: c.nodeCost_usd_h });
  for (let i = 0; i < c.gpuNodes; i++)
    nodes.push({ pool: 1, slots: c.gpuSlots, mem: c.gpuMemory_gb, idle_w: c.gpu_idle_w, busy_w: c.gpu_busy_w, cost_h: c.gpuCost_usd_h });
  const totalSlots = nodes.reduce((s, x) => s + x.slots, 0);
  const cpuSlots = c.cpuNodes * c.slotsPerNode;
  const gpuSlots = c.gpuNodes * c.gpuSlots;

  // Plain failure: some job type with demand can run nowhere.
  const maxMemCpu = c.cpuNodes ? c.nodeMemory_gb : 0;
  const maxMemGpu = c.gpuNodes ? c.gpuMemory_gb : 0;
  const present = new Set(wl.type);
  if (totalSlots === 0) return { ok: false, reason: 'No capacity: enter at least one CPU node.', config: c, seed };
  for (const ty of [0, 1, 2]) {
    const wanted = c.jobs ? present.has(ty) : c.mix[ty] > 0 && c.arrivals_per_h > 0;
    if (!wanted) continue;
    const mem = c.memory_gb[ty];
    const canGpu = c.gpuCapable[ty] && maxMemGpu >= mem;
    if (!(maxMemCpu >= mem) && !canGpu)
      return { ok: false, reason: `${TYPE_NAMES[ty]} needs ${mem} GB per job; the largest node it can use has ${Math.max(maxMemCpu, c.gpuCapable[ty] ? maxMemGpu : 0)} GB. The job can never start.`, config: c, seed };
  }

  const start = new Float64Array(n).fill(-1);
  const end = new Float64Array(n).fill(-1);
  const node = new Int16Array(n).fill(-1);
  const slotIx = new Int16Array(n).fill(-1);
  const svcUsed = new Float64Array(n);
  const onGpu = new Uint8Array(n);
  const free = nodes.map((x) => x.slots);
  const freeMem = nodes.map((x) => x.mem);
  const occupied = nodes.map((x) => new Int32Array(x.slots).fill(-1));
  const busyHoursNode = new Float64Array(nodes.length);
  const reserved = Math.floor(c.reserve_fraction * totalSlots + 1e-9);
  const heap = makeHeap();
  let busy = 0;
  let maxQueue = 0;
  let queued = 0;

  // One queue per class. FIFO policy puts every job in class 0 and ignores priority.
  const queues = [[], [], []];
  const heads = [0, 0, 0];
  const classOf = (j) => (c.policy === 'fifo' ? 0 : c.priority[wl.type[j]] | 0);
  const agingH = c.policy === 'fair' ? c.aging_h : Infinity;

  const findNode = (j) => {
    const ty = wl.type[j];
    const mem = c.memory_gb[ty];
    if (c.gpuNodes && c.gpuCapable[ty])
      for (let i = c.cpuNodes; i < nodes.length; i++) if (free[i] > 0 && freeMem[i] >= mem) return i;
    for (let i = 0; i < c.cpuNodes; i++) if (free[i] > 0 && freeMem[i] >= mem) return i;
    return -1;
  };

  const startJob = (j, i, now) => {
    const ty = wl.type[j];
    const gpu = nodes[i].pool === 1;
    const s = gpu ? wl.svc[j] / c.gpu_speedup : wl.svc[j];
    start[j] = now;
    end[j] = now + s;
    node[j] = i;
    svcUsed[j] = s;
    onGpu[j] = gpu ? 1 : 0;
    free[i]--;
    freeMem[i] -= c.memory_gb[ty];
    const oc = occupied[i];
    for (let k = 0; k < oc.length; k++)
      if (oc[k] < 0) {
        oc[k] = j;
        slotIx[j] = k;
        break;
      }
    busy++;
    queued--;
    heap.push(end[j], j);
  };

  const dispatch = (now) => {
    for (;;) {
      // Candidate class heads, best first.
      const cands = [];
      for (let q = 0; q < 3; q++) {
        if (heads[q] < queues[q].length) {
          const j = queues[q][heads[q]];
          const score = c.policy === 'fifo' ? -wl.t[j] : q + (now - wl.t[j]) / agingH;
          cands.push({ q, j, score });
        }
      }
      if (!cands.length) return;
      cands.sort((a, b) => b.score - a.score || wl.t[a.j] - wl.t[b.j]);
      let started = false;
      for (const cd of cands) {
        const ty = wl.type[cd.j];
        const lowClass = c.policy === 'fifo' ? c.priority[ty] < 2 : cd.q < 2;
        if (reserved > 0 && lowClass && busy >= totalSlots - reserved) {
          if (c.policy === 'fifo') return;
          continue;
        }
        const i = findNode(cd.j);
        if (i < 0) {
          if (c.policy === 'fifo') return; // head of line waits
          continue;
        }
        heads[cd.q]++;
        startJob(cd.j, i, now);
        started = true;
        break;
      }
      if (!started) return;
    }
  };

  const tStop = c.horizon_h;
  let ai = 0;
  const release = () => {
    const j = heap.pop();
    const i = node[j];
    free[i]++;
    freeMem[i] += c.memory_gb[wl.type[j]];
    occupied[i][slotIx[j]] = -1;
    busy--;
  };
  for (;;) {
    const na = ai < n ? wl.t[ai] : Infinity;
    const nc = heap.size ? heap.peek() : Infinity;
    const now = Math.min(na, nc);
    if (!Number.isFinite(now)) break;
    if (!c.drain && now > tStop) break;
    if (nc <= na) {
      release();
      dispatch(now);
    } else {
      queues[classOf(ai)].push(ai);
      queued++;
      if (queued > maxQueue) maxQueue = queued;
      ai++;
      dispatch(now);
    }
  }

  let lastEnd = 0;
  for (let j = 0; j < n; j++) if (end[j] > lastEnd) lastEnd = end[j];
  const T = c.drain ? Math.max(c.horizon_h, lastEnd) : c.horizon_h;

  // Metrics over the window [0, T].
  let completed = 0;
  let running = 0;
  let queuedEnd = 0;
  let busyCpuH = 0;
  let busyGpuH = 0;
  const lat = [];
  const wait = [];
  let svcSum = 0;
  for (let j = 0; j < n; j++) {
    if (start[j] >= 0 && start[j] < T) {
      const e = Math.min(end[j], T);
      const dur = e - start[j];
      busyHoursNode[node[j]] += dur;
      if (onGpu[j]) busyGpuH += dur;
      else busyCpuH += dur;
    }
    if (start[j] >= 0 && start[j] <= T) wait.push(start[j] - wl.t[j]);
    if (start[j] >= 0 && end[j] <= T) {
      completed++;
      lat.push(end[j] - wl.t[j]);
      svcSum += end[j] - start[j];
    } else if (start[j] >= 0 && start[j] <= T) running++;
    else queuedEnd++;
  }
  lat.sort((a, b) => a - b);
  wait.sort((a, b) => a - b);
  const busySlotH = busyCpuH + busyGpuH;
  const installedSlotH = totalSlots * T;
  let energyIdleKwh = 0;
  let energyVarKwh = 0;
  let capacityCost = 0;
  nodes.forEach((x, i) => {
    energyIdleKwh += (x.idle_w * T) / 1000;
    energyVarKwh += (((x.busy_w - x.idle_w) / x.slots) * busyHoursNode[i]) / 1000;
    capacityCost += x.cost_h * T;
  });
  const energyKwh = (energyIdleKwh + energyVarKwh) * c.pue;
  const energyCost = energyKwh * c.electricity_usd_kwh;
  const varEnergyCost = energyVarKwh * c.pue * c.electricity_usd_kwh;
  const revenue = busyCpuH * c.price_cpu_usd_slot_h + busyGpuH * c.price_gpu_usd_slot_h;
  const meanSvc = completed ? svcSum / completed : 0;
  const marginalPerSlotH = busySlotH > 0 ? varEnergyCost / busySlotH : 0;
  const q = (arr, p) => (arr.length ? quantileSorted(arr, p) : NaN);

  const metrics = {
    arrivals: n,
    completed,
    running,
    queued: queuedEnd,
    window_h: T,
    throughput_jobs_h: completed / T,
    latency_p50_h: q(lat, 0.5),
    latency_p95_h: q(lat, 0.95),
    latency_p99_h: q(lat, 0.99),
    wait_mean_h: wait.length ? wait.reduce((s, x) => s + x, 0) / wait.length : NaN,
    wait_p95_h: q(wait, 0.95),
    utilization: installedSlotH > 0 ? busySlotH / installedSlotH : 0,
    utilization_cpu: cpuSlots > 0 ? busyCpuH / (cpuSlots * T) : 0,
    utilization_gpu: gpuSlots > 0 ? busyGpuH / (gpuSlots * T) : NaN,
    max_queue: maxQueue,
    allocated_slot_h: busySlotH,
    installed_slot_h: installedSlotH,
    energy_kwh: energyKwh,
    energy_cost_usd: energyCost,
    capacity_cost_usd: capacityCost,
    revenue_usd: revenue,
    revenue_per_allocated_slot_h_usd: busySlotH > 0 ? revenue / busySlotH : NaN,
    revenue_per_installed_slot_h_usd: installedSlotH > 0 ? revenue / installedSlotH : 0,
    marginal_cost_per_slot_h_usd: marginalPerSlotH,
    marginal_cost_per_job_usd: marginalPerSlotH * meanSvc,
    break_even_price_usd_slot_h: busySlotH > 0 ? (capacityCost + energyCost) / busySlotH : NaN,
    operating_result_usd: revenue - capacityCost - energyCost,
    transaction_value_usd: completed * c.value_per_job_usd,
  };

  return {
    ok: true,
    config: c,
    seed,
    n,
    nodes,
    totalSlots,
    jobs: { type: Uint8Array.from(wl.type), arrival: Float64Array.from(wl.t), service: svcUsed, start, end, node, slot: slotIx, gpu: onGpu },
    metrics,
    gpu: gpuStatus(c),
    digest: hashNumbers(Array.from(start).concat(Array.from(end))),
    window_h: T,
  };
}

// Who is queued or running at time t. Pure view of a finished simulation.
export function stateAt(res, t) {
  const { arrival, start, end } = res.jobs;
  const queued = [];
  const running = [];
  let completed = 0;
  for (let j = 0; j < res.n; j++) {
    if (arrival[j] > t) break;
    if (start[j] >= 0 && start[j] <= t) {
      if (end[j] <= t) completed++;
      else running.push(j);
    } else queued.push(j);
  }
  return { queued, running, completed, arrived: queued.length + running.length + completed };
}

// Queue length and busy slots on an even time grid.
export function timeSeries(res, points = 96) {
  const T = res.window_h;
  const out = [];
  const { arrival, start, end } = res.jobs;
  for (let k = 0; k <= points; k++) {
    const t = (T * k) / points;
    let q = 0;
    let r = 0;
    for (let j = 0; j < res.n; j++) {
      if (arrival[j] > t) break;
      if (start[j] >= 0 && start[j] <= t) {
        if (end[j] > t) r++;
      } else q++;
    }
    out.push({ t, queued: q, running: r, utilization: res.totalSlots ? r / res.totalSlots : 0 });
  }
  return out;
}

// Mean latency by job type, completed jobs only.
export function byType(res) {
  const { type, arrival, end, start } = res.jobs;
  const T = res.window_h;
  return [0, 1, 2].map((ty) => {
    let n = 0;
    let s = 0;
    let w = 0;
    let all = 0;
    for (let j = 0; j < res.n; j++) {
      if (type[j] !== ty) continue;
      all++;
      if (start[j] >= 0 && end[j] <= T) {
        n++;
        s += end[j] - arrival[j];
        w += start[j] - arrival[j];
      }
    }
    return { type: ty, name: TYPE_NAMES[ty], arrivals: all, completed: n, mean_latency_h: n ? s / n : NaN, mean_wait_h: n ? w / n : NaN };
  });
}

// A fixed numeric workload for measuring this device, kept apart from the model above.
export function benchmarkStencil(size = 160, steps = 120, progress = () => {}) {
  if (!(size >= 8 && size <= 512) || !(steps >= 1 && steps <= 2000)) throw new Error('size must be 8 to 512 and steps 1 to 2000');
  let a = new Float64Array(size * size);
  let b = new Float64Array(size * size);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) a[i * size + j] = ((i * 31 + j * 17) % 97) / 97;
  for (let s = 0; s < steps; s++) {
    for (let i = 1; i < size - 1; i++) {
      for (let j = 1; j < size - 1; j++) {
        const k = i * size + j;
        b[k] = a[k] + 0.2 * (a[k - 1] + a[k + 1] + a[k - size] + a[k + size] - 4 * a[k]);
      }
    }
    [a, b] = [b, a];
    if (s % 10 === 0) progress(s / steps);
  }
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += a[k];
  return { size, steps, cell_updates: (size - 2) * (size - 2) * steps, checksum: sum };
}

export const jobs = {
  'e19.simulate': (payload, { progress } = {}) => {
    const r = simulate(payload.config, payload.seed);
    if (progress) progress(1);
    return r.ok ? { ok: true, metrics: r.metrics, digest: r.digest } : { ok: false, reason: r.reason };
  },
  'e19.benchmark': (payload = {}, { progress } = {}) => benchmarkStencil(payload.size ?? 160, payload.steps ?? 120, progress),
};
