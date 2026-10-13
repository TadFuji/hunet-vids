import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gemini, GeminiError } from './gemini';

type Call = { method: string; url: string; body?: unknown; headers: Record<string, string> };

/** Fake fetch that answers from a list of handlers and records every call. */
function fakeFetch(answer: (c: Call) => { status?: number; json?: unknown; bytes?: Uint8Array }) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const c: Call = { method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: (init.headers ?? {}) as Record<string, string> };
    calls.push(c);
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const a = answer(c);
    const status = a.status ?? 200;
    return new Response(a.bytes ? (a.bytes as BlobPart) : JSON.stringify(a.json ?? {}), { status });
  });
  return calls;
}

const done = { id: 'i1', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'ok' }] }] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Gemini.interact', () => {
  it('polls a background job until it completes, sending the key only as a header', async () => {
    vi.useFakeTimers();
    let polls = 0;
    const calls = fakeFetch((c) => (c.method === 'POST' ? { json: { id: 'i1', status: 'in_progress' } } : ++polls < 2 ? { json: { id: 'i1', status: 'in_progress' } } : { json: done }));
    const p = new Gemini('KEY').interact({ model: 'm', input: 'x' }, { background: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await p)[0].text).toBe('ok');
    expect(calls[0].body).toMatchObject({ background: true });
    expect(calls.every((c) => c.headers['x-goog-api-key'] === 'KEY' && !c.url.includes('KEY'))).toBe(true);
    expect(calls.every((c) => c.url.startsWith('https://generativelanguage.googleapis.com/'))).toBe(true);
  });

  it('stops polling on terminal statuses other than completed', async () => {
    const calls = fakeFetch(() => ({ json: { id: 'i1', status: 'incomplete', errors: [{ message: 'max tokens' }] } }));
    await expect(new Gemini('KEY').interact({ model: 'm', input: 'x' }, { background: true })).rejects.toThrow('max tokens');
    expect(calls).toHaveLength(1);
  });

  it('cancels the server-side job when the user aborts', async () => {
    vi.useFakeTimers();
    const calls = fakeFetch((c) => (c.url.endsWith('/cancel') ? { json: {} } : { json: { id: 'job 1', status: 'in_progress' } }));
    const ac = new AbortController();
    const p = new Gemini('KEY').interact({ model: 'm', input: 'x' }, { background: true, signal: ac.signal });
    const settled = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5_000);
    ac.abort();
    await settled;
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/interactions/job%201/cancel'))).toBe(true);
  });

  it('retries once without background mode when the POST is rejected with 400', async () => {
    const calls = fakeFetch((c) => ((c.body as { background?: boolean }).background ? { status: 400, json: { error: { message: 'Invalid argument' } } } : { json: done }));
    expect((await new Gemini('KEY').interact({ model: 'm', input: 'x' }, { background: true }))[0].text).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  it('does not retry other errors', async () => {
    const calls = fakeFetch(() => ({ status: 429, json: { error: { message: 'quota' } } }));
    await expect(new Gemini('KEY').interact({ model: 'm', input: 'x' }, { background: true })).rejects.toBeInstanceOf(GeminiError);
    expect(calls).toHaveLength(1);
  });
});

describe('Gemini.download', () => {
  it('downloads Files API uris through the files endpoint', async () => {
    const calls = fakeFetch((c) => (c.url.includes(':download') ? { bytes: new Uint8Array([1, 2, 3]) } : { json: { state: 'ACTIVE' } }));
    const bytes = await new Gemini('KEY').download('https://generativelanguage.googleapis.com/v1beta/files/abc123');
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(calls.at(-1)!.url).toBe('https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media');
  });

  it('refuses to send the key to any other host', async () => {
    const calls = fakeFetch(() => ({ json: {} }));
    await expect(new Gemini('KEY').download('https://evil.example.com/files/abc123')).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
