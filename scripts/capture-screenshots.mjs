// Captures the README screenshots from the production build in demo mode.
// Usage: npm run build && node scripts/capture-screenshots.mjs
// Uses an isolated browser context and never contacts Google (demo mode makes placeholder media locally).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const port = 4181;
const base = `http://127.0.0.1:${port}`;
const out = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.route('https://**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await context.newPage();

  await page.goto(base);
  await page.screenshot({ path: `${out}setup.png` });

  await page.getByRole('button', { name: 'キーなしで体験する' }).click();
  await page.getByPlaceholder(/新入社員向けに/).fill('週末に行きたくなる鎌倉の日帰り旅の紹介');
  await page.screenshot({ path: `${out}home.png` });

  await page.getByRole('button', { name: 'AI で絵コンテを作成' }).click();
  await page.waitForURL(/#\/edit\//);
  await page.getByRole('button', { name: /ナレーションを一括生成（0）/ }).waitFor({ timeout: 30_000 });
  await page.locator('.job .busy').first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000); // let finished-job toasts fade
  await page.screenshot({ path: `${out}editor.png` });

  await page.getByRole('button', { name: '書き出し', exact: true }).click();
  await page.getByRole('combobox', { name: '画質' }).selectOption('720');
  await page.getByRole('button', { name: '書き出し開始' }).click();
  await page.locator('.modal video').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}export.png` });

  await browser.close();
  console.log(`Saved screenshots to ${out}`);
} finally {
  server.kill();
}
