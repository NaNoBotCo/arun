// E20 browser checks. Usage: ARUN_PAGE=<built index.html> node test/browser/e20.mjs [--shots dir]
import { launch, openPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { browser } = await launch();
const { page, context, errors, requests } = await openPage(browser, 'e20');
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};
const tile = async (n) => (await page.locator(`[data-ex="E20"] .metric[data-name="${n}"] .mv`).first().textContent()).trim();
await page.waitForTimeout(800);
const p0 = await tile('profit');
check(p0 !== '—', 'preset computes profit ' + p0);
// feasible region unchanged by weights: corner count same across presets
const corners = await tile('corners');
await page.getByRole('button', { name: 'Profit first' }).click();
await page.waitForTimeout(400);
const p1 = await tile('profit');
check(p1 !== p0, `profit weight moves the allocation ${p0} → ${p1}`);
check((await tile('corners')) === corners, 'feasible corners unchanged by weights: ' + corners);
await page.getByRole('button', { name: 'Nature first' }).click();
await page.waitForTimeout(400);
check(Number((await tile('burden')).replace('−', '-')) < 0, 'nature first lowers burden: ' + (await tile('burden')));
// drag on the chart
const box = await page.locator('canvas.stage-canvas').boundingBox();
await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.3, { steps: 6 });
await page.mouse.up();
const p2 = await tile('profit');
check(p2 !== '—' && p2 !== (await tile('burden')), 'drag selects a frontier point, profit ' + p2);
await page.locator('canvas.stage-canvas').focus();
await page.keyboard.press('ArrowLeft');
const p3 = await tile('profit');
check(p3 !== p2, `arrow key moves along the frontier ${p2} → ${p3}`);
if (shots) await page.screenshot({ path: join(shots, 'e20.png') });
// walk
await page.locator('button.run').click();
await page.waitForTimeout(2200);
if ((await page.locator('button.run').getAttribute('aria-pressed')) === 'true') await page.locator('button.run').click();
// shadow prices are shown or explained
const detail = await page.locator('section.ex').innerText();
check(/shadow prices/i.test(detail) && (/score per unit/i.test(detail) || /withheld/i.test(detail)), 'shadow prices shown or withheld with a reason');
// cap input moves a result
await page.getByRole('button', { name: 'Profit first' }).click();
await page.waitForTimeout(300);
const before = await tile('profit');
const inp = page.locator('[data-name="cap_invest"] input[type=number]');
await inp.fill('900');
await inp.dispatchEvent('change');
await page.waitForTimeout(400);
check((await tile('profit')) !== before, `investment cap 520 → 900 moves profit ${before} → ${await tile('profit')}`);
// failure
await page.getByRole('button', { name: 'Floor too high (fails)' }).click();
await page.waitForTimeout(500);
const b = page.locator('.fail-banner');
check(await b.isVisible(), 'infeasible case is explicit: ' + (await b.textContent()));
check((await tile('profit')) === '—', 'metrics cleared when infeasible');
if (shots) await page.screenshot({ path: join(shots, 'e20-fail.png') });
await page.getByRole('button', { name: 'Balanced' }).click();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: 'Export' }).click();
const rec = JSON.parse(await page.locator('.export-text').inputValue());
check(rec.experimentId === 'E20' && rec.metrics.length > 7, 'run record has metrics');
check((await page.locator('.tabpane.export').textContent()).includes('valid against schema'), 'run record validates');
check(errors.length === 0, 'no console errors ' + errors.join(' | '));
check(requests.length === 0, 'no outside requests');
await context.close();
await browser.close();
process.exit(fails ? 1 : 0);
