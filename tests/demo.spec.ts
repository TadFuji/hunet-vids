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

test('image edit button shows price estimate, backup strips unbundled assetIds, and deleting a project prunes unused assets', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'キーなしで体験する' }).click();
  await page.getByPlaceholder(/新入社員向けに/).fill('素材整理テスト');
  await page.getByRole('button', { name: 'AI で絵コンテを作成' }).click();
  await expect(page.getByRole('button', { name: /ナレーションを一括生成（0）/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /背景を一括生成（0）/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.job .busy')).toHaveCount(0, { timeout: 30_000 });

  // Scene 1 is an image scene in demo mode; check that the edit button shows the $0.05 estimate
  await expect(page.getByRole('button', { name: '編集（約$0.05）' })).toBeVisible();

  // Go back to home screen and verify assets exist in IndexedDB
  await page.getByRole('button', { name: '← 一覧' }).click();
  await expect(page.getByRole('heading', { name: '最近の動画' })).toBeVisible();

  const beforeDeleteCount = await page.evaluate(async () => {
    const req = indexedDB.open('my-vids', 1);
    const db = await new Promise<IDBDatabase>((res) => (req.onsuccess = () => res(req.result)));
    const tx = db.transaction('assets', 'readonly');
    const all = await new Promise<unknown[]>((res) => {
      const r = tx.objectStore('assets').getAll();
      r.onsuccess = () => res(r.result);
    });
    return all.length;
  });
  expect(beforeDeleteCount).toBeGreaterThan(0);

  // Craft a backup that references an unbundled assetId ("stolen_id") and verify importBackup strips it
  const backupBuf = await page.evaluate(() => {
    const header = JSON.stringify({
      project: {
        title: '外部バックアップ',
        aspect: '16:9',
        themeId: 'hunet',
        scenes: [
          {
            id: 's1',
            title: 'シーン1',
            duration: 5,
            background: { kind: 'image', assetId: 'stolen_id', fit: 'cover' },
            narration: { text: 'テスト', voice: 'Kore', style: '', assetId: 'stolen_audio', duration: 3 },
            texts: [],
          },
        ],
      },
      assets: [],
    });
    const json = new TextEncoder().encode(header);
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, json.length, true);
    const magic = new TextEncoder().encode('MYVIDS1\n');
    const out = new Uint8Array(magic.length + 4 + json.length);
    out.set(magic, 0);
    out.set(len, magic.length);
    out.set(json, magic.length + 4);
    return Array.from(out);
  });
  await page.locator('input[type=file][accept*="hunetvids"]').setInputFiles({
    name: 'unbundled.hunetvids',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(backupBuf),
  });
  await expect(page).toHaveURL(/#\/edit\//);
  // The unbundled narration assetId was stripped, so narration needs generation (count = 1)
  await expect(page.getByRole('button', { name: 'ナレーションを一括生成（1）' })).toBeVisible();

  // Return to home and delete both projects; all unreferenced assets should be pruned
  await page.getByRole('button', { name: '← 一覧' }).click();
  page.on('dialog', (d) => d.accept());
  await expect(page.getByRole('button', { name: '削除' })).toHaveCount(2);
  await page.getByRole('button', { name: '削除' }).first().click();
  await expect(page.getByRole('button', { name: '削除' })).toHaveCount(1);
  await page.getByRole('button', { name: '削除' }).first().click();
  await expect(page.getByText('まだありません。')).toBeVisible();
  const afterDeleteCount = await page.evaluate(async () => {
    const req = indexedDB.open('my-vids', 1);
    const db = await new Promise<IDBDatabase>((res) => (req.onsuccess = () => res(req.result)));
    const tx = db.transaction('assets', 'readonly');
    const all = await new Promise<unknown[]>((res) => {
      const r = tx.objectStore('assets').getAll();
      r.onsuccess = () => res(r.result);
    });
    return all.length;
  });
  expect(afterDeleteCount).toBe(0);
});
