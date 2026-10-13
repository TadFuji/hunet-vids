import { expect, test } from '@playwright/test';
import { DUMMY_KEY, GOOGLE, mockGoogle, trackOrigins } from './helpers';

test('the key is sent only to Google, only in the x-goog-api-key header', async ({ page, context, baseURL }) => {
  const calls = await mockGoogle(context);
  const foreign = trackOrigins(page, baseURL!);
  const consoleText: string[] = [];
  page.on('console', (m) => consoleText.push(m.text()));

  await page.goto('/');
  await page.getByLabel('API キー').fill(DUMMY_KEY);
  await page.getByRole('button', { name: '確認して保存' }).click();
  await page.getByPlaceholder(/新入社員向けに/).fill('テスト');
  await page.getByRole('button', { name: 'AI で絵コンテを作成' }).click();
  await expect(page).toHaveURL(/#\/edit\//);
  // narration for both scenes is generated through the (mocked) TTS model
  await expect(page.getByRole('button', { name: /ナレーションを一括生成（0）/ })).toBeVisible({ timeout: 30_000 });

  expect(calls.length).toBeGreaterThanOrEqual(4); // key check, storyboard, 2× narration
  for (const c of calls) {
    expect(c.url.startsWith(`${GOOGLE}/v1beta/`)).toBe(true);
    expect(c.url).not.toContain(DUMMY_KEY);
    expect(c.headers['x-goog-api-key']).toBe(DUMMY_KEY);
    expect(JSON.stringify(c.body ?? {})).not.toContain(DUMMY_KEY);
  }
  expect(calls.some((c) => String(c.body?.model).includes('tts'))).toBe(true);
  expect(foreign).toEqual([]);

  // the key is not rendered into the page or written to the console
  expect(await page.content()).not.toContain(DUMMY_KEY);
  expect(consoleText.join('\n')).not.toContain(DUMMY_KEY);
  // by design it is kept only under this localStorage entry (documented in README / docs/security.md)
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => localStorage.getItem(k)?.includes('DUMMY_HUNET')));
  expect(stored).toEqual(['my-vids.gemini-key']);
});

test('an invalid key is rejected at setup with an actionable message', async ({ page, context }) => {
  await mockGoogle(context, (c) => (c.method === 'GET' ? { status: 400, json: { error: { message: 'API key not valid. Please pass a valid API key.' } } } : undefined));
  await page.goto('/');
  await page.getByLabel('API キー').fill(DUMMY_KEY);
  await page.getByRole('button', { name: '確認して保存' }).click();
  await expect(page.getByText('API キーが正しくありません')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gemini API キーを設定' })).toBeVisible();
});

test('rate limits are explained in Japanese and nothing is retried', async ({ page, context }) => {
  const calls = await mockGoogle(context, (c) => (c.method === 'POST' ? { status: 429, json: { error: { message: 'Resource has been exhausted' } } } : undefined));
  await page.goto('/');
  await page.getByLabel('API キー').fill(DUMMY_KEY);
  await page.getByRole('button', { name: '確認して保存' }).click();
  await page.getByPlaceholder(/新入社員向けに/).fill('テスト');
  await page.getByRole('button', { name: 'AI で絵コンテを作成' }).click();
  await expect(page.getByText(/利用上限に達しました（429）/)).toBeVisible();
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  expect(await page.content()).not.toContain(DUMMY_KEY);
});

test('removing the key clears it from the browser', async ({ page, context }) => {
  await mockGoogle(context);
  await page.goto('/');
  await page.getByLabel('API キー').fill(DUMMY_KEY);
  await page.getByRole('button', { name: '確認して保存' }).click();
  await page.getByRole('button', { name: 'API キー設定' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'キーを削除' }).click();
  await expect(page.getByRole('heading', { name: 'Gemini API キーを設定' })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('DUMMY_HUNET');
});
