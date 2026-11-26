// Quick look at one or more routes: errors, outside requests, overflow, and a screenshot each.
// Usage: node test/browser/smoke.mjs e08 e09 [--wait 1500] [--mobile] [--out dir]
import { launch, openPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const routes = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--mobile'));
const wait = Number(opt('--wait', 1500));
const mobile = args.includes('--mobile');
const out = opt('--out', join(process.env.TMPDIR || '/tmp', 'arun-shots'));
mkdirSync(out, { recursive: true });
const { browser, version } = await launch();
let bad = 0;
for (const r of routes.length ? routes : ['home']) {
  const size = mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1366, height: 820 };
  const { page, context, errors, requests } = await openPage(browser, r, size);
  await page.waitForTimeout(wait);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const shot = join(out, `${r}${mobile ? '-mobile' : ''}.png`);
  await page.screenshot({ path: shot });
  const ok = errors.length === 0 && requests.length === 0 && !overflow;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} #${r} ${mobile ? '(390px)' : ''} errors=${errors.length} outside-requests=${requests.length} h-overflow=${overflow} shot=${shot}`);
  for (const e of errors) console.log('     ' + e);
  for (const q of requests) console.log('     request ' + q);
  await context.close();
}
console.log(`chromium ${version}`);
await browser.close();
process.exit(bad ? 1 : 0);
