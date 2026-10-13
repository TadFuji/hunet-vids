import type { BrowserContext, Page, Route } from '@playwright/test';

/** Obviously fake key. Tests never use a real key or contact Google. */
export const DUMMY_KEY = 'AIzaDUMMY_HUNET_VIDS_TEST_KEY_NOT_REAL_2026';
export const GOOGLE = 'https://generativelanguage.googleapis.com';

export function silentWavBase64(seconds = 1, rate = 24000): string {
  const data = Buffer.alloc(seconds * rate * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]).toString('base64');
}

export const STORYBOARD = {
  title: 'テスト動画',
  musicPrompt: 'calm piano',
  voiceStyle: '落ち着いて',
  scenes: [
    { title: '導入', headline: 'はじめに', subtext: '', narration: 'これはテストです。', visualPrompt: 'a calm sea', visualType: 'image', seconds: 3, motion: 'zoom-in' },
    { title: 'まとめ', headline: 'まとめ', subtext: '', narration: '以上です。', visualPrompt: 'a sunset', visualType: 'image', seconds: 3, motion: 'none' },
  ],
};

const completed = (content: unknown[]) => ({ id: 'test-interaction', status: 'completed', steps: [{ type: 'model_output', content }] });

export interface GoogleCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

/**
 * Replace every request to the Gemini API with canned answers and record it.
 * context.route also catches requests made from workers.
 */
export async function mockGoogle(context: BrowserContext, override?: (call: GoogleCall) => { status: number; json: unknown } | undefined): Promise<GoogleCall[]> {
  const calls: GoogleCall[] = [];
  await context.route(`${GOOGLE}/**`, async (route: Route) => {
    const req = route.request();
    const call: GoogleCall = { method: req.method(), url: req.url(), headers: await req.allHeaders(), body: req.postData() ? JSON.parse(req.postData()!) : null };
    calls.push(call);
    const custom = override?.(call);
    if (custom) return route.fulfill({ status: custom.status, contentType: 'application/json', body: JSON.stringify(custom.json) });
    if (call.method === 'GET' && /\/v1beta\/models\//.test(call.url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"name":"models/gemini-3.8-flash"}' });
    const model = String(call.body?.model ?? '');
    if (model.includes('tts')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(completed([{ type: 'audio', mime_type: 'audio/wav', data: silentWavBase64(1) }])) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(completed([{ type: 'text', text: JSON.stringify(STORYBOARD) }])) });
  });
  return calls;
}

/** Fail the test if the page talks to any origin other than itself and (mocked) Google. */
export function trackOrigins(page: Page, baseURL: string): string[] {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith(baseURL) || u.startsWith(GOOGLE)) return;
    foreign.push(u);
  });
  return foreign;
}
