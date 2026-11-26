// E19 browser checks: playable preset, inputs change metrics, failure case, benchmark, export record.
// Usage: ARUN_PAGE=<built index.html> node test/browser/e19.mjs [--shots dir]
import { launch, openPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { browser } = await launch();
const { page, context, errors, requests } = await openPage(browser, 'e19');
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};
const tile = async (name) => (await page.locator(`[data-ex="E19"] .metric[data-name="${name}"] .mv`).first().textContent()).trim();
await page.waitForTimeout(1200);
check((await tile('throughput')) !== '—', 'preset runs and shows throughput: ' + (await tile('throughput')));
check(/waiting \d+ · running \d+ · done \d+/.test(await page.locator('.stage-label').textContent()), 'stage label shows computed state');
// Run / pause
const run = page.locator('button.run');
if ((await run.getAttribute('aria-pressed')) === 'true') await run.click();
check((await run.textContent()).trim() === 'Run', 'pause works');
const t1 = await page.locator('#e19-scrub').inputValue();
await page.getByRole('button', { name: 'Step 1 h' }).click();
const t2 = await page.locator('#e19-scrub').inputValue();
check(Number(t2) > Number(t1), `step advances time ${t1} → ${t2}`);
await page.getByRole('button', { name: 'Reset' }).click();
check(Number(await page.locator('#e19-scrub').inputValue()) === 0, 'reset returns to hour 0');
// Input change changes metrics
const before = await tile('p95');
await page.locator('[data-name="arrivals_per_h"] input[type=number]').fill('46');
await page.locator('[data-name="arrivals_per_h"] input[type=number]').dispatchEvent('change');
await page.waitForTimeout(400);
const after = await tile('p95');
check(before !== after, `demand 30 → 46 moves p95 latency ${before} → ${after}`);
check((await tile('counts')).split('/')[2].trim() !== '0', 'overload leaves jobs waiting: ' + (await tile('counts')));
if (shots) await page.screenshot({ path: join(shots, 'e19-overload.png') });
// Policy change
await page.locator('summary', { hasText: 'Queue policy' }).click();
await page.locator('[data-name="policy"] select').selectOption('fair');
await page.waitForTimeout(400);
check(await page.locator('[data-ex="E19"] table.dtable').first().isVisible(), 'policy comparison table is shown');
// GPU
await page.getByRole('button', { name: 'Assume a GPU' }).click();
await page.waitForTimeout(500);
check(/GPU: \d node/.test(await page.locator('.gpu-chip').textContent()), 'GPU shows only after entering nodes: ' + (await page.locator('.gpu-chip').textContent()));
await page.getByRole('button', { name: 'Balanced day' }).click();
await page.waitForTimeout(500);
check((await page.locator('.gpu-chip').textContent()).includes('unavailable'), 'GPU unavailable by default');
// Failure
await page.getByRole('button', { name: 'Job too big (fails)' }).click();
await page.waitForTimeout(500);
const banner = page.locator('.fail-banner');
check(await banner.isVisible(), 'failure preset shows a banner: ' + (await banner.textContent()));
check((await tile('throughput')) === '—', 'metrics cleared on failure');
if (shots) await page.screenshot({ path: join(shots, 'e19-fail.png') });
await page.getByRole('button', { name: 'Balanced day' }).click();
await page.waitForTimeout(500);
// Invalid typed value refused
await page.locator('summary', { hasText: 'Capacity and power' }).click();
await page.locator('[data-name="cpuNodes"] input[type=number]').fill('999');
await page.locator('[data-name="cpuNodes"] input[type=number]').dispatchEvent('change');
check(await page.locator('[data-name="cpuNodes"] .ctl-err').isVisible(), 'out-of-range node count is refused with a message');
// Benchmark
await page.getByRole('button', { name: 'Measure this device' }).click();
await page.waitForFunction(() => /ms for/.test(document.querySelector('.bench').textContent), null, { timeout: 20000 });
check(true, 'benchmark ran: ' + (await page.locator('.bench .small[aria-live]').innerText()).split('\n')[0]);
// Export
await page.getByRole('tab', { name: 'Export' }).click();
const txt = await page.locator('.export-text').inputValue();
const rec = JSON.parse(txt);
check(rec.experimentId === 'E19' && rec.metrics.length > 10, 'run record has metrics');
check(rec.diagnostics && rec.diagnostics.measured_is_separate === 'true', 'benchmark is recorded as separate');
check((await page.locator('.tabpane.export').textContent()).includes('valid against schema'), 'run record validates');
check(errors.length === 0, 'no console errors ' + errors.join(' | '));
check(requests.length === 0, 'no outside requests');
await context.close();
await browser.close();
process.exit(fails ? 1 : 0);
