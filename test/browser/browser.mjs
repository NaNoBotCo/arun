// Finds a local Chromium for playwright-core and opens the built page.
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PAGE_URL = pathToFileURL(process.env.ARUN_PAGE || join(ROOT, 'dist/index.html')).href;

export function findChromium() {
  if (process.env.ARUN_CHROMIUM && existsSync(process.env.ARUN_CHROMIUM)) return process.env.ARUN_CHROMIUM;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return null;
  const dirs = readdirSync(cache).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    const candidates = [
      join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'),
      join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      join(cache, d, 'chrome-linux/chrome'),
    ];
    for (const c of candidates) if (existsSync(c)) return c;
  }
  return null;
}

export async function launch() {
  const executablePath = findChromium();
  if (!executablePath) throw new Error('No Chromium found. Set ARUN_CHROMIUM to a Chromium binary.');
  const browser = await chromium.launch({ executablePath, headless: true });
  return { browser, executablePath, version: browser.version() };
}

// Opens the page, records console errors, page errors and every request that is not the page itself.
export async function openPage(browser, hash = 'home', { width = 1366, height = 820, reducedMotion = 'no-preference', colorScheme = 'dark', isMobile = false, hasTouch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, colorScheme, isMobile, hasTouch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file://') && !u.startsWith('blob:') && !u.startsWith('data:')) requests.push(u);
  });
  await page.goto(PAGE_URL + '#' + hash);
  await page.waitForSelector('#main > *', { timeout: 15000 });
  return { page, context, errors, requests };
}
