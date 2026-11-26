// E21 browser checks. Usage: ARUN_PAGE=<built index.html> node test/browser/e21.mjs [--shots dir]
import { launch, openPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { browser } = await launch();
const { page, context, errors, requests } = await openPage(browser, 'e21');
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};
const tile = async (n) => (await page.locator(`.metric[data-name="${n}"] .mv`).first().textContent()).trim();
await page.waitForTimeout(600);
check(/Order under your weights/.test(await page.locator('.order').innerText()), 'ordering shows: ' + (await page.locator('.order').innerText()).slice(0, 90));
check(!/winner/i.test(await page.locator('section.ex').innerText()), 'the word winner does not appear');
check(/Safety: 1 open item/.test(await page.locator('.safety').innerText()), 'sample concern shows: ' + (await page.locator('.safety').innerText()).slice(0, 80));
check((await page.locator('.cards .card').count()) === 4, 'four concepts, Sky Reach and Face Shield among them');
check((await page.locator('.cards .card').allInnerTexts()).filter((t) => /Sky Reach|Face Shield/.test(t)).length === 2, 'developer-owned concepts present with equal standing');
// a rating change moves the score
const orderBefore = await page.locator('.order').innerText();
const sel = page.locator('select[aria-label="ARUN: Wonder rating"]');
const v = await sel.inputValue();
await sel.selectOption(v === '5' ? '1' : '5');
await page.waitForTimeout(200);
check((await page.locator('.order').innerText()) !== orderBefore, 'changing one rating changes the ordering');
// safety stays when the weight on trust is zero and when ratings are 5
const trust = page.locator('[data-name="w_trust"] input[type=number]');
await trust.fill('0');
await trust.dispatchEvent('change');
await page.waitForTimeout(300);
check(/Safety: 1 open item/.test(await page.locator('.safety').innerText()), 'safety item still shows with trust weight 0');
// add a concept; no identity asked
await page.locator('input[aria-label="New concept name"]').fill('My <b>idea</b>');
await page.getByRole('button', { name: 'Add concept' }).click();
await page.waitForTimeout(200);
check((await page.locator('.cards .card').count()) === 5, 'team concept added');
check((await page.locator('.cards .card b').count()) === 0, 'typed markup is inserted as text');
// flag a concern on the new concept
await page.locator('.cards .card').nth(4).locator('input[type=checkbox]').check();
check(/Safety: 2 open items/.test(await page.locator('.safety').innerText()), 'a ticked concern joins the safety line');
if (shots) await page.screenshot({ path: join(shots, 'e21.png') });
// failure: all weights 0
await page.getByRole('button', { name: 'All weights 0 (fails)' }).click();
await page.waitForTimeout(300);
check(/Not ordered/.test(await page.locator('.order').innerText()), 'zero weights: ' + (await page.locator('.order').innerText()));
check(/Safety: 2 open items/.test(await page.locator('.safety').innerText()), 'safety line shows while ordering fails');
await page.getByRole('button', { name: 'Equal weights' }).click();
// run the test progressively
await page.locator('button.run').click();
await page.waitForTimeout(1500);
check(/Order under/.test(await page.locator('.order').innerText()), 'resampling run ends with an ordering');
await page.getByRole('button', { name: 'Clear ratings' }).click();
await page.waitForTimeout(200);
check(/no ratings yet/.test(await page.locator('.order').innerText()), 'cleared ratings: no ordering invented');
await page.getByRole('tab', { name: 'Export' }).click();
const rec = JSON.parse(await page.locator('.export-text').inputValue());
check(rec.experimentId === 'E21' && !JSON.stringify(rec).includes('My '), 'run record has no typed names');
check((await page.locator('.tabpane.export').textContent()).includes('valid against schema'), 'run record validates');
check(errors.length === 0, 'no console errors ' + errors.join(' | '));
check(requests.length === 0, 'no outside requests');
await context.close();
await browser.close();
process.exit(fails ? 1 : 0);
