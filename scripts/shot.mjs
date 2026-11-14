/** Screenshots of the built app.  node scripts/shot.mjs [name] */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHROME =
  process.env.KIN_CHROME ?? 'C:/Users/张一/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const only = process.argv[2] ?? '';

const server = await startServer(resolve(root, 'dist'), 0);
const browser = await chromium.launch({ executablePath: CHROME });
await mkdir(resolve(root, 'shots'), { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(server.url, { waitUntil: 'networkidle' });
await page.waitForSelector('.cascade .work', { timeout: 40000 });
await page.waitForTimeout(500);

const shot = async (name, action) => {
  if (only && only !== name) return;
  if (action) await action(page);
  await page.waitForTimeout(320);
  await page.screenshot({ path: resolve(root, 'shots', `${name}.png`) });
  process.stdout.write(`shots/${name}.png\n`);
};

await shot('01-hero', null);
await shot('02-selected', async (p) => {
  await p.click('.rank button');
});
await shot('03-lesne', async (p) => {
  await p.click('.seed[data-seed="lesne"]');
  await p.waitForTimeout(900);
});
await shot('04-mehra', async (p) => {
  await p.click('.seed[data-seed="mehra"]');
  await p.waitForTimeout(900);
  await p.click('.rank button');
});
await shot('05-phone', async (p) => {
  await p.setViewportSize({ width: 430, height: 900 });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.cascade .work');
});
await browser.close();
await server.close();
