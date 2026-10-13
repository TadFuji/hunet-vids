import { expect, test } from '@playwright/test';
import { trackOrigins } from './helpers';

test('demo mode: storyboard → generated media → playback → MP4 export, without contacting Google', async ({ page, baseURL }) => {
  const foreign = trackOrigins(page, baseURL!);
  const google: string[] = [];
  page.on('request', (r) => r.url().includes('googleapis') && google.push(r.url()));

  await page.goto('/');
  await page.getByRole('button', { name: 'キーなしで体験する' }).click();
  await page.getByPlaceholder(/新入社員向けに/).fill('テスト用の短い動画');
  await page.getByRole('button', { name: 'AI で絵コンテを作成' }).click();

  // the editor opens and auto-generation (narration, backgrounds) finishes
  await expect(page).toHaveURL(/#\/edit\//);
  await expect(page.getByRole('button', { name: /ナレーションを一括生成（0）/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.job .busy')).toHaveCount(0, { timeout: 30_000 });

  // playback advances the clock
  await page.getByRole('button', { name: '▶ 再生' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '❚❚ 停止' }).click();
  await expect(page.locator('.player-bar')).not.toContainText('0:00 /');

  // export a small MP4 and check its length and size
  await page.getByRole('button', { name: '書き出し', exact: true }).click();
  await page.getByRole('combobox', { name: '画質' }).selectOption('720');
  await page.getByRole('button', { name: '書き出し開始' }).click();
  const video = page.locator('.modal video');
  await expect(video).toBeVisible({ timeout: 60_000 });
  const info = await video.evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 1) await new Promise((r) => (v.onloadedmetadata = r));
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  });
  expect(info.duration).toBeGreaterThan(5);
  expect(info.width).toBe(1280);
  expect(info.height).toBe(720);

  expect(google).toEqual([]);
  expect(foreign).toEqual([]);
});

test('a broken backup file is rejected with a message instead of breaking the app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'キーなしで体験する' }).click();
  await page.locator('input[type=file][accept*="hunetvids"]').setInputFiles({ name: 'broken.hunetvids', mimeType: 'application/octet-stream', buffer: Buffer.from('not a backup') });
  await expect(page.getByText('ファイルが壊れているか、hunet vids のプロジェクトファイルではありません')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'どんな動画を作りますか？' })).toBeVisible();
});

test('switching a presenter scene back to narration mutes the clip so voices are not doubled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'キーなしで体験する' }).click();
  await page.getByPlaceholder(/新入社員向けに/).fill('人物動画のテスト');
  await page.getByRole('button', { name: 'AI で絵コンテを作成' }).click();
  await expect(page.getByRole('button', { name: /ナレーションを一括生成（0）/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.job .busy')).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole('button', { name: /話す人物の動画を生成/ }).click();
  await expect(page.getByText('このシーンは動画の人物の声を使っています。')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('動画の音量 100%')).toBeVisible();

  await page.getByRole('button', { name: 'ナレーション音声に戻す' }).click();
  await expect(page.getByText('動画の音量 0%')).toBeVisible();
  await expect(page.getByRole('button', { name: /ナレーションを一括生成（1）/ })).toBeVisible();
});
