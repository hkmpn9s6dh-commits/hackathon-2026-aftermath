/**
 * End to end against the built bundle. Exit code is the verdict.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHROME =
  process.env.KIN_CHROME ?? 'C:/Users/张一/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const LIVE = process.env.AFTERMATH_URL ?? '';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) process.exitCode = 1;
};

const server = LIVE ? null : await startServer(resolve(root, 'dist'), 4328);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
const foreign = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));
page.on('request', (request) => {
  const url = request.url();
  if (!url.startsWith(LIVE ? new URL(LIVE).origin : 'http://127.0.0.1')) foreign.push(url);
});

try {
  await page.goto(LIVE || server.url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cascade .work', { timeout: 40000 });

  const dots = await page.locator('.cascade .work').count();
  check('the graph draws every sampled paper', dots >= 590, `${dots} papers`);

  const red = await page.locator('.cascade .work.is-silent').count();
  check('silent papers are marked', red > 100, `${red} silent`);

  const claim = await page.locator('#claim').innerText();
  check('the headline is a real number', /3,073/.test(claim) && /312/.test(claim), claim.split('\n')[1] ?? '');

  const card = await page.locator('#card').innerText();
  check('a paper is already selected on load', /hops? from the retraction/i.test(card), card.split('\n')[0] ?? '');

  const chain = await page.locator('#card .chain').innerText();
  check('the chain back to the retraction is spelled out', /the retracted paper/.test(chain), chain.slice(0, 60));

  await page.click('.rank li:nth-child(2) button');
  await page.waitForTimeout(200);
  const second = await page.locator('#card h2').innerText();
  check('picking another paper from the list works', second.length > 10, second.slice(0, 44));

  await page.click('.seed[data-seed="lesne"]');
  await page.waitForTimeout(1200);
  const lesne = await page.locator('#claim').innerText();
  check('switching retraction reloads the graph', /2,821/.test(lesne), lesne.split('\n')[0]?.slice(0, 70) ?? '');

  const notice = await page.locator('.retracted-label').textContent();
  check('the retraction year is drawn on the plate', /2024/.test(notice), notice);

  await page.click('.seed[data-seed="mehra"]');
  await page.waitForTimeout(1200);
  const mehra = await page.locator('#claim').innerText();
  check('the third case loads too', /1,255/.test(mehra), mehra.split('\n')[1]?.slice(0, 60) ?? '');

  const overflow = await page.evaluate(() => {
    const panel = document.querySelector('.panel');
    return { panel: panel ? panel.scrollWidth - panel.clientWidth : 0, body: document.body.scrollWidth - document.body.clientWidth };
  });
  check('nothing spills sideways', overflow.panel <= 1 && overflow.body <= 1, JSON.stringify(overflow));

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  check('no foreign requests', foreign.length === 0, foreign.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  if (server) await server.close();
}

const failed = checks.filter((entry) => !entry.ok).length;
process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed\n`);
