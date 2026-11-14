/** UI hygiene, measured rather than argued. Writes proof/ui/report.md. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHROME = process.env.KIN_CHROME ?? 'C:/Users/张一/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';

const rules = [
  { selector: '#claim .line', min: 13, note: 'the headline' },
  { selector: '#claim b', min: 22, note: 'the number that matters' },
  { selector: '#card h2', min: 18, note: 'paper title' },
  { selector: '#card .verdict', min: 13.5, note: 'the verdict' },
  { selector: '.rank .text b', min: 13, note: 'ranked title' },
  { selector: '.seed b', min: 13, note: 'seed tab' },
];

const server = await startServer(resolve(root, 'dist'), 0);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const rows = [];
let failed = 0;

await page.goto(server.url, { waitUntil: 'networkidle' });
await page.waitForSelector('.cascade .work');

for (const rule of rules) {
  const size = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null;
  }, rule.selector);
  const ok = typeof size === 'number' && size + 0.01 >= rule.min;
  if (!ok) failed += 1;
  rows.push({ ...rule, size, ok });
}

const overflow = await page.evaluate(() => {
  const out = [];
  for (const selector of ['.panel', '.board', '.claim', '.card']) {
    const element = document.querySelector(selector);
    if (!element) continue;
    const dx = element.scrollWidth - element.clientWidth;
    if (dx > 1) out.push(`${selector}: +${dx}px`);
  }
  return out;
});
if (overflow.length > 0) failed += 1;

const contrast = await page.evaluate(() => {
  const parse = (value) => (value.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const luminance = ([r, g, b]) => {
    const channel = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (fg, bg) => {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const panel = parse(getComputedStyle(document.querySelector('.panel')).backgroundColor);
  const ink = parse(getComputedStyle(document.querySelector('#card h2')).color);
  const soft = parse(getComputedStyle(document.querySelector('.rank-note')).color);
  return { ink: ratio(ink, panel).toFixed(2), soft: ratio(soft, panel).toFixed(2) };
});
if (Number(contrast.ink) < 7) failed += 1;
if (Number(contrast.soft) < 4.5) failed += 1;

const tap = await page.evaluate(() => Math.round(document.querySelector('.rank button')?.getBoundingClientRect().height ?? 0));
if (tap < 24) failed += 1;

const lines = [
  '# UI measurement — Aftermath',
  '',
  `Generated ${new Date().toISOString()} on a 1440×900 viewport.`,
  '',
  '| rule | selector | measured | floor | verdict |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((row) => `| ${row.note} | \`${row.selector}\` | ${row.size ?? '—'} px | ${row.min} px | ${row.ok ? 'pass' : 'FAIL'} |`),
  '',
  `- horizontal overflow: ${overflow.length === 0 ? 'none' : overflow.join(', ')}`,
  `- contrast, ink on panel: ${contrast.ink}:1 (floor 7:1)`,
  `- contrast, secondary text: ${contrast.soft}:1 (floor 4.5:1)`,
  `- rank row tap target: ${tap}px (floor 24px)`,
  '',
  failed === 0 ? '**All hygiene rules pass.**' : `**${failed} rule(s) failing.**`,
];

await mkdir(resolve(root, 'proof/ui'), { recursive: true });
await writeFile(resolve(root, 'proof/ui/report.md'), `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(`${lines.join('\n')}\n`);
await browser.close();
await server.close();
if (failed > 0) process.exitCode = 1;
