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

  it('does not retry other errors or non-background 400 errors (invalid key, duration, safety)', async () => {
    const calls = fakeFetch(() => ({ status: 429, json: { error: { message: 'quota' } } }));
    await expect(new Gemini('KEY').interact({ model: 'm', input: 'x' }, { background: true })).rejects.toBeInstanceOf(GeminiError);
    expect(calls).toHaveLength(1);

    const keyCalls = fakeFetch(() => ({ status: 400, json: { error: { message: 'API key not valid' } } }));
    await expect(new Gemini('KEY').interact({ model: 'm', input: 'x' }, { background: true })).rejects.toBeInstanceOf(GeminiError);
    expect(keyCalls).toHaveLength(1);
  });

  it('cancels the server-side job even if the signal is aborted while the initial POST is in flight', async () => {
    const ac = new AbortController();
    const calls = fakeFetch((c) => {
      if (c.method === 'POST' && c.url.endsWith('/interactions')) {
        ac.abort();
        return { json: { id: 'job-race', status: 'in_progress' } };
      }
      return { json: {} };
    });
    await expect(new Gemini('KEY').interact({ model: 'm', input: 'x' }, { background: true, signal: ac.signal })).rejects.toThrow();
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/interactions/job-race/cancel'))).toBe(true);
  });

  it('video() retries once without duration only when the initial POST is rejected, not during polling', async () => {
    const calls = fakeFetch((c) => {
      const fmt = (c.body as { response_format?: { duration?: string } })?.response_format;
      if (fmt?.duration) return { status: 400, json: { error: { message: 'Invalid duration field' } } };
      if (c.url.includes(':download')) return { bytes: new Uint8Array([0, 0, 0, 24]) };
      if (c.url.includes('/files/')) return { json: { state: 'ACTIVE' } };
      return { json: { id: 'v1', status: 'completed', outputs: [{ type: 'video', uri: 'files/vid123', mime_type: 'video/mp4' }] } };
    });
    const blob = await new Gemini('KEY').video('ocean', { aspect: '16:9', resolution: '720p', seconds: 8 });
    expect(blob.size).toBe(4);
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/interactions'))).toHaveLength(2);

    // If a 400 mentioning duration happens during GET polling after job creation, do NOT re-POST
    const pollCalls = fakeFetch((c) => {
      if (c.method === 'POST') return { json: { id: 'v2', status: 'in_progress' } };
      return { status: 400, json: { error: { message: 'duration error after start' } } };
    });
    vi.useFakeTimers();
    const p = new Gemini('KEY').video('ocean', { aspect: '16:9', resolution: '720p', seconds: 8 });
    const rejected = expect(p).rejects.toThrow('duration error after start');
    await vi.advanceTimersByTimeAsync(5_000);
    await rejected;
    expect(pollCalls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
});

describe('Gemini.download', () => {
  it('downloads Files API uris through the files endpoint', async () => {
    const calls = fakeFetch((c) => (c.url.includes(':download') ? { bytes: new Uint8Array([1, 2, 3]) } : { json: { state: 'ACTIVE' } }));
    const bytes = await new Gemini('KEY').download('https://generativelanguage.googleapis.com/v1beta/files/abc123');
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(calls.at(-1)!.url).toBe('https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media');
  });

  it('propagates AbortSignal from media methods into download polling', async () => {
    vi.useFakeTimers();
    fakeFetch((c) => {
      if (c.method === 'POST') return { json: { id: 'v1', status: 'completed', outputs: [{ type: 'video', uri: 'files/vid123', mime_type: 'video/mp4' }] } };
      return { json: { state: 'PROCESSING' } };
    });
    const ac = new AbortController();
    const p = new Gemini('KEY').video('ocean', { aspect: '16:9', resolution: '720p', signal: ac.signal });
    const rejected = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1_000);
    ac.abort();
    await rejected;
  });

  it('refuses to send the key to any other host', async () => {
    const calls = fakeFetch(() => ({ json: {} }));
    await expect(new Gemini('KEY').download('https://evil.example.com/files/abc123')).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
