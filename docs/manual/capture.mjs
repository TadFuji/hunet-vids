// Captures every screen used by the illustrated manual, plus the on-screen position of each
// annotated element (docs/manual/images/bounds.json).
// Usage: npm run build && node docs/manual/capture.mjs
// Isolated browser context. Never uses a real API key: demo mode makes placeholder media locally,
// and the few screens that need "a key" use a dummy key with every Google request answered locally.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const port = 4182;
const base = `http://127.0.0.1:${port}`;
const out = new URL('./images/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const DUMMY_KEY = 'AIzaMANUAL_DEMO_NOT_A_REAL_KEY_2026';
const bounds = {};

const server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  /** Screenshot (viewport or element) and record target boxes relative to it. */
  async function shot(page, name, targets = {}, opts = {}) {
    const clip = opts.element ? await opts.element.boundingBox() : null;
    const origin = clip ? { x: clip.x, y: clip.y } : { x: 0, y: 0 };
    const vp = page.viewportSize();
    const size = clip ? { w: clip.width, h: clip.height } : opts.fullPage ? await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })) : { w: vp.width, h: vp.height };
    const boxes = {};
    for (const [key, loc] of Object.entries(targets)) {
      const b = await loc.first().boundingBox();
      if (!b) throw new Error(`${name}: target ${key} not visible`);
      boxes[key] = { x: b.x - origin.x, y: b.y - origin.y, w: b.width, h: b.height };
    }
    const path = `${out}${name}.png`;
    if (opts.element) await opts.element.screenshot({ path });
    else await page.screenshot({ path, fullPage: !!opts.fullPage });
    bounds[name] = { ...size, boxes };
  }

  const settle = (page, ms = 600) => page.waitForTimeout(ms);
  const waitJobs = async (page) => {
    await page.locator('.job .busy').first().waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {});
    await settle(page, 3000); // finished-job cards fade out
  };
  const tab = (page, name) => page.locator('.tabs').first().getByRole('button', { name, exact: true }).click();

  // ---------- 1. setup screen and demo-mode flow (no Google at all) ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.route('https://**/*', (r) => r.abort()); // nothing may leave the machine
  const page = await ctx.newPage();
  await page.goto(base);
  await settle(page);
  await shot(page, 'setup', {
    link: page.getByRole('link', { name: /Google AI Studio/ }),
    input: page.getByLabel('API キー'),
    save: page.getByRole('button', { name: '確認して保存' }),
    demo: page.getByRole('button', { name: 'キーなしで体験する' }),
  }, { element: page.locator('.card.setup') });

  await page.getByRole('button', { name: 'キーなしで体験する' }).click();
  await page.getByPlaceholder(/新入社員向けに/).fill('週末に行きたくなる鎌倉の日帰り旅の紹介');
  await page.getByRole('checkbox', { name: /BGM/ }).check();
  await settle(page);
  await shot(page, 'home', {
    prompt: page.getByPlaceholder(/新入社員向けに/),
    samples: page.locator('.chip-row').first(),
    reference: page.locator('summary'),
    length: page.getByText('長さ', { exact: true }),
    aspect: page.getByText('画面の形', { exact: true }),
    visual: page.getByText('背景の素材', { exact: true }),
    theme: page.getByText('テーマ', { exact: true }),
    voice: page.getByText('ナレーションの声', { exact: true }),
    language: page.getByText('言語', { exact: true }),
    tone: page.getByText('雰囲気・トーン（任意）'),
    auto: page.getByText('絵コンテの作成後に自動で生成:'),
    create: page.getByRole('button', { name: 'AI で絵コンテを作成' }),
    blank: page.getByRole('button', { name: '白紙から作る' }),
    open: page.getByText('ファイルから開く'),
    settings: page.getByRole('button', { name: 'API キー設定' }),
    guide: page.getByRole('link', { name: '使い方（PDF）' }),
  }, { element: page.locator('.home') });

  await page.locator('summary').click();
  await settle(page, 300);
  await shot(page, 'home-reference', { area: page.locator('details textarea'), file: page.locator('details input[type=file]') }, { element: page.locator('details') });
  await page.locator('summary').click();

  // create → editor; capture the job cards while generation runs
  await page.getByRole('button', { name: 'AI で絵コンテを作成' }).click();
  await page.waitForURL(/#\/edit\//);
  await page.locator('.job').first().waitFor();
  await settle(page, 400);
  // give the floating job list a solid backdrop so the editor behind it does not show through gaps
  await page.locator('.jobs').evaluate((el) => Object.assign(el.style, { background: '#eef0f4', padding: '8px', borderRadius: '10px' }));
  await shot(page, 'jobs', {}, { element: page.locator('.jobs') });
  await waitJobs(page);

  await shot(page, 'editor', {
    back: page.getByRole('button', { name: '← 一覧' }),
    title: page.locator('.title-input'),
    undo: page.getByRole('button', { name: '↶ 戻す' }),
    bulk: page.getByRole('button', { name: /ナレーションを一括生成/ }),
    export: page.getByRole('button', { name: '書き出し', exact: true }),
    scenes: page.locator('.scenes'),
    preview: page.locator('.canvas-wrap canvas'),
    player: page.locator('.player-bar'),
    inspector: page.locator('.inspector'),
    timeline: page.locator('.timeline'),
  });

  // scene list close-up
  await shot(page, 'scene-list', {
    active: page.locator('.scene-item.active'),
    dup: page.getByRole('button', { name: '複製', exact: true }),
    add: page.getByRole('button', { name: '＋ シーン' }),
    ai: page.getByRole('button', { name: '＋ AI で追加' }),
  }, { element: page.locator('.scenes') });

  await shot(page, 'player', {
    play: page.getByRole('button', { name: '▶ 再生' }),
    time: page.locator('.player-bar span').first(),
    seek: page.locator('.player-bar input[type=range]'),
  }, { element: page.locator('.player-bar') });

  // zoom the timeline in so the clips spread across the full width
  for (let i = 0; i < 2; i++) await page.locator('.timeline button[title="拡大"]').click();
  await settle(page, 300);
  await shot(page, 'timeline', {
    scene: page.locator('.tl-clip.scene').first(),
    handle: page.locator('.tl-handle').first(),
    voice: page.locator('.tl-clip.voice').first(),
    music: page.locator('.tl-clip.music').first(),
    caption: page.locator('.tl-clip.caption').first(),
    ruler: page.locator('.tl-ruler'),
    zoom: page.locator('.timeline button[title="拡大"]'),
  }, { element: page.locator('.timeline') });

  // inspector panels: use a tall window so each panel is visible without scrolling
  await page.setViewportSize({ width: 1440, height: 2300 });
  await settle(page);
  const insp = page.locator('.inspector');
  await tab(page, 'シーン');
  await shot(page, 'panel-scene', {
    duration: page.getByText('長さ（秒）', { exact: true }),
    fit: page.getByRole('button', { name: 'ナレーションに合わせる' }),
    transition: page.getByText('前のシーンからの切り替え'),
    motion: page.getByText('背景の動き', { exact: true }),
    bg: page.getByRole('heading', { name: '背景', exact: true }),
    prompt: page.getByText('映像の説明（英語がおすすめ。文字は入れない指示に）'),
    image: page.getByRole('button', { name: /画像を生成/ }),
    video: page.getByRole('button', { name: /音声つき動画を生成/ }),
    animate: page.getByText('画像を動かす'),
    edit: page.getByText(/いまの画像を指示で編集/),
    presenter: page.getByRole('heading', { name: '人物が話す動画（アバター風）' }),
  }, { element: insp });

  await tab(page, 'テキスト');
  await page.locator('.text-item').first().click();
  await settle(page, 300);
  await shot(page, 'panel-text', {
    add: page.getByRole('button', { name: '＋ 見出し' }),
    text: page.locator('.text-item textarea').first(),
    size: page.locator('.text-item').first().getByText('大きさ'),
    anim: page.locator('.text-item').first().getByText('登場'),
    timing: page.locator('.text-item').first().getByText('表示開始（秒）'),
    del: page.locator('.text-item').first().getByRole('button', { name: '削除' }),
  }, { element: insp });

  await tab(page, '音声');
  await settle(page, 400);
  await shot(page, 'panel-voice', {
    text: page.getByText('読み上げる文章'),
    rewrite: page.getByText('AI で書き換え:'),
    voice: page.getByText('声', { exact: true }),
    style: page.getByText('話し方', { exact: true }),
    make: page.getByRole('button', { name: /作り直す|ナレーションを生成/ }),
    audio: page.locator('.inspector audio'),
    bulk: page.getByRole('heading', { name: 'まとめて操作' }),
  }, { element: insp });

  await tab(page, '素材');
  await settle(page, 600);
  await shot(page, 'panel-media', {
    upload: page.locator('.inspector input[type=file]'),
    record: page.getByRole('button', { name: /カメラ・画面を録画/ }),
    filter: page.locator('.inspector .tabs').nth(1),
    grid: page.locator('.asset-grid'),
  }, { element: insp });

  await tab(page, 'BGM');
  await settle(page, 400);
  await shot(page, 'panel-music', {
    prompt: page.getByText('曲の雰囲気（英語がおすすめ）'),
    kind: page.getByText('長さ', { exact: true }),
    make: page.getByRole('button', { name: 'BGM を生成' }),
    volume: page.getByText(/^音量/),
    fade: page.getByText('フェードイン（秒）'),
    duck: page.getByText('ナレーション中は BGM を小さくする'),
  }, { element: insp });

  await tab(page, '設定');
  await settle(page, 300);
  await shot(page, 'panel-settings', {
    aspect: page.getByText('画面の形', { exact: true }),
    theme: page.getByText('テーマ', { exact: true }),
    captions: page.getByText('字幕を表示する'),
    srt: page.getByRole('button', { name: '字幕ファイル（.srt）を保存' }),
    add: page.getByRole('button', { name: '＋ 空のシーンを最後に追加' }),
  }, { element: insp });

  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);

  // text selected on the preview (dashed outline, drag to move)
  await tab(page, 'テキスト');
  await page.locator('.text-item').first().click();
  await settle(page, 400);
  await shot(page, 'text-drag', {}, { element: page.locator('.canvas-wrap canvas') });

  // portrait (9:16) view
  await tab(page, '設定');
  await page.getByRole('combobox').first().selectOption('9:16');
  await settle(page, 800);
  await shot(page, 'editor-portrait', {}, { element: page.locator('.workspace') });
  await page.getByRole('combobox').first().selectOption('16:9');
  await settle(page, 500);

  // recorder (fake camera)
  await tab(page, '素材');
  await page.getByRole('button', { name: /カメラ・画面を録画/ }).click();
  await page.getByRole('button', { name: '準備する' }).click();
  await page.getByRole('button', { name: '● 録画開始' }).waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector('.modal video');
    return v && v.videoWidth > 0;
  });
  await settle(page, 800);
  await shot(page, 'recorder', {
    modes: page.locator('.modal .row').first(),
    preview: page.locator('.modal video'),
    prompter: page.locator('.modal textarea'),
    start: page.getByRole('button', { name: '● 録画開始' }),
  }, { element: page.locator('.modal') });
  await page.getByRole('button', { name: '閉じる' }).click();

  // export dialog: before and after
  await page.getByRole('button', { name: '書き出し', exact: true }).click();
  await settle(page, 300);
  await shot(page, 'export', {
    quality: page.getByRole('combobox', { name: '画質' }),
    fps: page.getByRole('combobox', { name: 'フレームレート' }),
    start: page.getByRole('button', { name: '書き出し開始' }),
    srt: page.getByRole('button', { name: '字幕 .srt を保存' }),
  }, { element: page.locator('.modal') });
  await page.getByRole('combobox', { name: '画質' }).selectOption('720');
  await page.getByRole('button', { name: '書き出し開始' }).click();
  await page.locator('.modal .progress').waitFor();
  await page.waitForTimeout(700);
  await shot(page, 'export-progress', {}, { element: page.locator('.modal') });
  await page.locator('.modal video').waitFor({ timeout: 60_000 });
  await page.locator('.modal video').evaluate(async (v) => {
    if (v.readyState < 2) await new Promise((r) => (v.onloadeddata = r));
    v.currentTime = 1; // show a frame instead of the loading spinner
    await new Promise((r) => (v.onseeked = r));
  });
  await settle(page, 500);
  await shot(page, 'export-done', {
    video: page.locator('.modal video'),
    save: page.getByRole('button', { name: 'MP4 を保存' }),
  }, { element: page.locator('.modal') });
  await page.getByRole('button', { name: '閉じる' }).click();

  // back to the list: project card with save/delete
  await page.getByRole('button', { name: '← 一覧' }).click();
  await settle(page, 1200);
  await shot(page, 'project-card', {
    save: page.getByRole('button', { name: 'ファイルに保存' }),
    del: page.locator('.project-card').getByRole('button', { name: '削除' }),
  }, { element: page.locator('.project-card').first() });
  await ctx.close();

  // ---------- 2. screens that need "a key": dummy key, Google answered locally ----------
  const kctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  let mode = 'invalid';
  await kctx.route('https://**/*', async (route) => {
    const url = route.request().url();
    if (!url.startsWith('https://generativelanguage.googleapis.com/')) return route.abort();
    if (mode === 'invalid') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }) });
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Resource has been exhausted (e.g. check quota).' } }) });
  });
  const kp = await kctx.newPage();
  await kp.goto(base);
  await kp.getByLabel('API キー').fill(DUMMY_KEY);
  await kp.getByRole('button', { name: '確認して保存' }).click();
  await kp.locator('.error').waitFor();
  await settle(kp, 300);
  await shot(kp, 'error-key', { error: kp.locator('.error') }, { element: kp.locator('.card.setup') });
  mode = 'quota';
  await kp.getByRole('button', { name: '確認して保存' }).click();
  await kp.getByPlaceholder(/新入社員向けに/).fill('テスト');
  await kp.getByRole('button', { name: 'AI で絵コンテを作成' }).click();
  await kp.locator('.create-box .error').waitFor();
  await settle(kp, 300);
  await shot(kp, 'error-quota', { error: kp.locator('.create-box .error') }, { element: kp.locator('.create-box') });
  await kctx.close();

  writeFileSync(`${out}bounds.json`, JSON.stringify(bounds, null, 1));
  console.log(`Captured ${Object.keys(bounds).length} screens into ${out}`);
} finally {
  await browser.close();
  server.kill();
}
