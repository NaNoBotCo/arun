// Runs every kernel test file with node:test, one file at a time, and writes test/results/kernels.json.
// The build embeds that file so the Status page can show what the tests said.
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(ROOT, 'test/kernels');
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
const out = { ranAt: new Date().toISOString(), node: process.version, files: {} };
let pass = 0, fail = 0;
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--test', join(dir, f)], { encoding: 'utf8', cwd: ROOT });
  const txt = (r.stdout || '') + (r.stderr || '');
  const p = Number((txt.match(/ℹ pass (\d+)/) || [])[1] || 0);
  const x = Number((txt.match(/ℹ fail (\d+)/) || [])[1] || 0);
  const failed = [...txt.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]).filter((n) => !/failing tests/.test(n));
  out.files[f] = { pass: p, fail: x, ms: Date.now() - t0, failed: [...new Set(failed)] };
  pass += p;
  fail += x;
  console.log(`${x ? 'FAIL' : 'ok  '} ${f.padEnd(18)} ${String(p).padStart(3)} pass ${x ? x + ' fail' : ''}`);
}
mkdirSync(join(ROOT, 'test/results'), { recursive: true });
writeFileSync(join(ROOT, 'test/results/kernels.json'), JSON.stringify(out, null, 2));
console.log(`total: ${pass} pass, ${fail} fail, ${files.length} files`);
process.exit(fail ? 1 : 0);
