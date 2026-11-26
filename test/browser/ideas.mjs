// Ideas page checks. Usage: ARUN_PAGE=<full build index.html> node test/browser/ideas.mjs [--shots dir]
import { launch, openPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { browser } = await launch();
const { page, context, errors, requests } = await openPage(browser, 'ideas');
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};
const words = (n) => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
const count = async () => Number(await page.locator('#ideas-count b').getAttribute('data-words'));
const pitch = page.locator('#ideas-pitch');
check((await count()) === 60, 'working pitch counts 60 words');
await pitch.fill('');
check((await count()) === 0, '0 words');
await pitch.fill(words(100));
check((await count()) === 100 && /on the limit/.test(await page.locator('#ideas-count').innerText()), '100 words, on the limit');
await pitch.fill(words(101));
check((await count()) === 101 && /1 over/.test(await page.locator('#ideas-count').innerText()), '101 words, 1 over');
await pitch.fill('Hello, world! — … ?!');
check((await count()) === 2, 'punctuation does not count: ' + (await count()));
await pitch.fill('ฉันรักประเทศไทยมาก hello');
check((await count()) >= 4, 'Thai text is segmented: ' + (await count()));
// retelling test
await pitch.fill('A thousand tomorrows. One better today.');
await page.getByRole('button', { name: 'Start the test' }).click();
check(await page.locator('#ideas-shown').isVisible(), 'pitch is shown');
await page.getByRole('button', { name: 'Hide it and retell' }).click();
check((await page.locator('#ideas-shown').count()) === 0 && !(await page.locator('.ideas-page').innerText()).includes('A thousand tomorrows'), 'pitch is gone from the page while retelling');
await page.locator('#ideas-retell').fill('Many possible futures, <i>tested</i> first.');
await page.getByRole('button', { name: 'Show both side by side' }).click();
check((await page.locator('#ideas-orig').innerText()).includes('thousand tomorrows') && (await page.locator('#ideas-own').innerText()).includes('<i>tested</i>'), 'both shown, retelling as text');
check((await page.locator('.recall li').count()) === 5, 'five recall points');
await page.locator('.recall li input').nth(0).check();
await page.locator('.recall li input').nth(2).check();
check(/2\s*of 5/.test(await page.locator('.count[role=status]').last().innerText()), 'tally 2 of 5');
// scores and comments
await page.getByRole('button', { name: '4' }).first().click();
await page.locator('#ideas-c-pitch').fill('Nice rhythm.');
// export with no name
await page.locator('#ideas-incl').check();
await page.locator('#ideas-name').fill('Zed Person');
await page.locator('#ideas-incl').uncheck();
await page.getByRole('button', { name: 'Build the feedback export' }).click();
let md = await page.locator('.export-text').nth(0).inputValue();
let js = await page.locator('.export-text').nth(1).inputValue();
check(!md.includes('Zed') && !js.includes('Zed'), 'name is not in the export while the box is unticked');
check(!/jobLog|device|seed|Chromium/i.test(js), 'no technical logs in the export');
check(md.includes('[x]') && /Recall points covered: 2 of 5/.test(md) && JSON.parse(js).scores.clarity === 4, 'recall ticks and score appear');
check(!md.includes('<i>'), 'markup is escaped in Markdown');
await page.locator('#ideas-incl').check();
md = await page.locator('.export-text').nth(0).inputValue();
check(md.includes('From: Zed Person'), 'name appears once the box is ticked');
await page.locator('#ideas-incl').uncheck();
check(!(await page.locator('.export-text').nth(0).inputValue()).includes('Zed'), 'name disappears when unticked');
// Team Wheel
await page.getByRole('button', { name: 'Build the handoff' }).click();
const tmd = await page.locator('.export-text').nth(2).inputValue();
const tjs = JSON.parse(await page.locator('.export-text').nth(3).inputValue());
check(tjs.tasks.length === 2 && tjs.tasks.every((t) => t.status === 'draft' && t.id.startsWith('tw-e21-')), 'two draft tasks with stable ids');
check(tjs.tasks[1].dependsOn[0] === tjs.tasks[0].id, 'dependency uses the other task id');
check(tjs.tasks[0].sourceLink.endsWith('#e21'), 'source link goes to #e21: ' + tjs.tasks[0].sourceLink);
check(tmd.includes('status: draft'), 'Markdown version has status draft');
await page.getByRole('button', { name: 'Add a task' }).click();
await page.getByRole('button', { name: 'Build the handoff' }).click();
check(await page.locator('.err').isVisible(), 'an empty task is refused: ' + (await page.locator('.err').textContent()));
await page.locator('.task').nth(2).getByRole('button', { name: 'Remove this task' }).click();
if (shots) await page.screenshot({ path: join(shots, 'ideas.png'), fullPage: true });
// link into E21
check((await page.locator('a[href="#e21"]').count()) >= 1, 'link into #e21');
check(errors.length === 0, 'no console errors ' + errors.join(' | '));
check(requests.length === 0, 'no outside requests');
await context.close();
await browser.close();
process.exit(fails ? 1 : 0);
