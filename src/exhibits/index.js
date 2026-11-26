// The exhibit registry: every exhibit module, in catalogue order.
import * as e01 from './e01.js';
import * as e02 from './e02.js';
import * as e03 from './e03.js';
import * as e04 from './e04.js';
import * as e05 from './e05.js';
import * as e06 from './e06.js';
import * as e07 from './e07.js';
import * as e08 from './e08.js';
import * as e09 from './e09.js';
import * as e10 from './e10.js';
import * as e11 from './e11.js';
import * as e12 from './e12.js';
import * as e13 from './e13.js';
import * as e14 from './e14.js';
import * as e15 from './e15.js';
import * as e16 from './e16.js';
import * as e17 from './e17.js';
import * as e18 from './e18.js';
import * as e19 from './e19.js';
import * as e20 from './e20.js';
import * as e21 from './e21.js';

export const EXHIBITS = [e01, e02, e03, e04, e05, e06, e07, e08, e09, e10, e11, e12, e13, e14, e15, e16, e17, e18, e19, e20, e21];

export const BY_ID = Object.fromEntries(EXHIBITS.map((m) => [m.meta.id, m]));

const REQUIRED_META = ['id', 'title', 'priority', 'kind', 'dataStatus', 'methodVersion', 'blurb', 'inputs', 'outputs', 'dependencies', 'seedStrategy', 'method', 'limitations', 'provenance'];

// Registry check: run at boot and in tests; a missing field shows on the Status page.
export function auditRegistry() {
  const problems = [];
  for (const m of EXHIBITS) {
    for (const k of REQUIRED_META) if (!(k in m.meta)) problems.push(`${m.meta.id}: meta.${k} missing`);
    if (typeof m.mount !== 'function') problems.push(`${m.meta.id}: mount() missing`);
    for (const i of m.meta.inputs || []) {
      if (!i.name || !i.label) problems.push(`${m.meta.id}: an input lacks name or label`);
      if ((i.type || 'range') === 'range' && !(i.min < i.max)) problems.push(`${m.meta.id}: input ${i.name} needs min < max`);
    }
  }
  return problems;
}
