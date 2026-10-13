import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const expected: Record<string, string> = Object.fromEntries(config.headers[0].headers.map((h: { key: string; value: string }) => [h.key.toLowerCase(), h.value]));

for (const path of ['/', '/index.html', '/hunet-logo.png']) {
  test(`${path} is served with every security header from vercel.json`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const got = res.headers();
    for (const [k, v] of Object.entries(expected)) expect(got[k], k).toBe(v);
  });
}

test('the page cannot reach other sites, but can reach the Gemini API', async ({ page, context }) => {
  // Both hosts are answered locally, so a 'blocked' result can only come from the page's CSP.
  await context.route('https://example.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  await context.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ status: 200, body: '{}', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const attempt = (url: string) =>
      fetch(url, { headers: { 'x-goog-api-key': 'not-a-key' } }).then(
        () => 'reachable',
        () => 'blocked',
      );
    return { other: await attempt('https://example.com/'), google: await attempt('https://generativelanguage.googleapis.com/v1beta/models/x') };
  });
  expect(result.other).toBe('blocked');
  expect(result.google).toBe('reachable');
});

test('write methods are refused', async ({ request, baseURL }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'Vercel answers write methods on static files itself');
  const res = await request.post(`${baseURL}/`, { data: 'x' });
  expect(res.status()).toBe(405);
});

test('the illustrated manual is served from the same origin as a PDF', async ({ request }) => {
  const res = await request.get('/guide.pdf');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
});
