// Gemini API client (Interactions API), called directly from the browser with the user's own key.
// Request shapes follow https://ai.google.dev/api/interactions (checked 2026-10-13).
import { base64ToBytes, bytesToBase64, parsePcmMime, pcm16ToWav } from './audio';
import type { Aspect } from './model';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// All model IDs in one place: preview models get shut down, so this is the only thing to edit when they change.
export const MODELS = {
  text: 'gemini-3.8-flash',
  textLite: 'gemini-3.5-flash-lite',
  tts: 'gemini-3.8-flash-tts',
  image: 'gemini-nano-banana-2.1',
  imageLite: 'gemini-3.1-flash-lite-image',
  video: 'gemini-omni-1.1-flash',
  musicClip: 'lyria-3-clip-preview',
  musicSong: 'lyria-3.5',
  transcribe: 'gemini-3.5-transcribe',
};

// Rough public list prices (USD), for the cost hints shown in the UI.
export const PRICES = {
  videoPerSecond720: 0.1,
  image2K: 0.05, // we request 2K images from gemini-nano-banana-2.1
  musicClip: 0.04,
  musicSong: 0.08,
};

export const VOICES: { id: string; label: string }[] = [
  { id: 'Kore', label: 'Kore（落ち着いた女性）' },
  { id: 'Aoede', label: 'Aoede（軽やかな女性）' },
  { id: 'Leda', label: 'Leda（若々しい女性）' },
  { id: 'Zephyr', label: 'Zephyr（明るい女性）' },
  { id: 'Despina', label: 'Despina（なめらかな女性）' },
  { id: 'Sulafat', label: 'Sulafat（温かい女性）' },
  { id: 'Puck', label: 'Puck（元気な男性）' },
  { id: 'Charon', label: 'Charon（情報を伝える男性）' },
  { id: 'Fenrir', label: 'Fenrir（熱のある男性）' },
  { id: 'Orus', label: 'Orus（しっかりした男性）' },
  { id: 'Iapetus', label: 'Iapetus（明瞭な男性）' },
  { id: 'Algenib', label: 'Algenib（渋い男性）' },
  { id: 'Achird', label: 'Achird（親しみのある）' },
  { id: 'Enceladus', label: 'Enceladus（ささやき声）' },
  { id: 'Gacrux', label: 'Gacrux（大人の）' },
  { id: 'Sadaltager', label: 'Sadaltager（知的な）' },
  { id: 'Callirrhoe', label: 'Callirrhoe' },
  { id: 'Autonoe', label: 'Autonoe' },
  { id: 'Umbriel', label: 'Umbriel' },
  { id: 'Algieba', label: 'Algieba' },
  { id: 'Erinome', label: 'Erinome' },
  { id: 'Rasalgethi', label: 'Rasalgethi' },
  { id: 'Laomedeia', label: 'Laomedeia' },
  { id: 'Achernar', label: 'Achernar' },
  { id: 'Alnilam', label: 'Alnilam' },
  { id: 'Schedar', label: 'Schedar' },
  { id: 'Pulcherrima', label: 'Pulcherrima' },
  { id: 'Zubenelgenubi', label: 'Zubenelgenubi' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix' },
  { id: 'Sadachbia', label: 'Sadachbia' },
];

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Translate API failures into messages a non-developer can act on. */
export function explainError(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return '中止しました。';
  if (!(e instanceof GeminiError)) return e instanceof Error ? e.message : String(e);
  const m = e.message;
  if (e.status === 400 && /API key not valid|API_KEY_INVALID/i.test(m)) return 'API キーが正しくありません。設定から入れ直してください。';
  if (e.status === 401 || e.status === 403) return `API キーにこの機能の権限がありません（${e.status}）。\n${m}`;
  if (e.status === 429) return '利用上限に達しました（429）。無料枠の上限か、短時間に送りすぎです。少し待つか、AI Studio で課金を有効にしてください。\n' + m;
  if (/billing|paid tier|free tier|FAILED_PRECONDITION/i.test(m)) return 'この機能は Gemini API の有料枠（課金の有効化）が必要です。AI Studio で課金を設定してください。\n' + m;
  if (/safety|blocked|prohibited|policy/i.test(m)) return '安全上の理由で生成が拒否されました。プロンプトを変えて試してください。\n' + m;
  return `${m}（HTTP ${e.status}）`;
}

type Block = { type: string; text?: string; data?: string; uri?: string; mime_type?: string };
interface Interaction {
  id?: string;
  status?: string;
  steps?: { type: string; content?: Block[] }[];
  outputs?: Block[];
  errors?: { code?: string; message?: string }[];
}

export class Gemini {
  private key: string;
  constructor(key: string) {
    this.key = key.trim();
  }

  private async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: { 'x-goog-api-key': this.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = j?.error?.message ?? JSON.stringify(j);
      } catch {
        /* non-JSON error */
      }
      throw new GeminiError(msg, res.status);
    }
    return res.json() as Promise<T>;
  }

  /** Create an interaction; long jobs run in background mode and are polled until done. */
  async interact(body: Record<string, unknown>, opts: { signal?: AbortSignal; background?: boolean; onWait?: (sec: number) => void } = {}): Promise<Block[]> {
    let it: Interaction;
    if (opts.background) {
      try {
        it = await this.request<Interaction>('POST', '/interactions', { ...body, background: true }, opts.signal);
      } catch (e) {
        // Background mode is documented only for text models. A rejected POST (400) creates no job,
        // so retrying once synchronously cannot double-charge.
        if (e instanceof GeminiError && e.status === 400) it = await this.request<Interaction>('POST', '/interactions', body, opts.signal);
        else throw e;
      }
      const id = it.id;
      // Aborting must also cancel the job on Google's side, otherwise it keeps running (and billing).
      const cancel = () => {
        if (id) this.request('POST', `/interactions/${encodeURIComponent(id)}/cancel`).catch(() => {});
      };
      opts.signal?.addEventListener('abort', cancel);
      try {
        const started = Date.now();
        while (id && (it.status === 'in_progress' || it.status === 'queued')) {
          await sleep(4000, opts.signal);
          opts.onWait?.(Math.round((Date.now() - started) / 1000));
          it = await this.request<Interaction>('GET', `/interactions/${encodeURIComponent(id)}`, undefined, opts.signal);
        }
      } finally {
        opts.signal?.removeEventListener('abort', cancel);
      }
    } else {
      it = await this.request<Interaction>('POST', '/interactions', body, opts.signal);
    }
    const blocks = outputBlocks(it);
    if (!blocks.length) {
      const err = it.errors?.map((e) => e.message).join('\n') || `出力がありませんでした（status: ${it.status ?? '不明'}）`;
      throw new GeminiError(err, 500);
    }
    return blocks;
  }

  /** Cheap call used to validate the key. */
  async check(): Promise<void> {
    await this.request('GET', `/models/${MODELS.text}`);
  }

  async json<T>(prompt: string | Block[], schema: object, signal?: AbortSignal, model = MODELS.text): Promise<T> {
    const blocks = await this.interact(
      { model, input: prompt, response_format: { type: 'text', mime_type: 'application/json', schema } },
      { signal },
    );
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    try {
      return JSON.parse(text) as T;
    } catch {
      const m = /\{[\s\S]*\}/.exec(text);
      if (m) return JSON.parse(m[0]) as T;
      throw new GeminiError('AI の応答を読み取れませんでした。もう一度お試しください。', 500);
    }
  }

  async text(prompt: string, signal?: AbortSignal): Promise<string> {
    const blocks = await this.interact({ model: MODELS.text, input: prompt }, { signal });
    return blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  }

  async speech(text: string, voice: string, style: string, signal?: AbortSignal): Promise<Blob> {
    const content: Record<string, unknown> = { type: 'text', text };
    if (style.trim()) content.annotations = [{ type: 'speech_metadata', style: style.trim() }];
    const blocks = await this.interact(
      {
        model: MODELS.tts,
        input: [{ type: 'user_input', content: [content] }],
        response_format: { type: 'audio', mime_type: 'audio/wav' },
        generation_config: { speech_config: [{ voice }] },
      },
      { signal },
    );
    return toAudioBlob(await mediaBlock(this, blocks, 'audio'));
  }

  async image(prompt: string, aspect: Aspect, refs: { data: Blob }[] = [], signal?: AbortSignal, model = MODELS.image): Promise<Blob> {
    const input: unknown[] = [{ type: 'text', text: prompt }];
    for (const r of refs) input.push({ type: 'image', mime_type: r.data.type || 'image/png', data: await blobToBase64(r.data) });
    const blocks = await this.interact(
      { model, input, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: aspect, image_size: model === MODELS.imageLite ? '1K' : '2K' } },
      { signal, background: true },
    );
    const b = await mediaBlock(this, blocks, 'image');
    return new Blob([b.bytes as BlobPart], { type: b.mime || 'image/jpeg' });
  }

  /**
   * Video with audio. 9:16 and 16:9 only; square projects use 16:9 and get cropped by "cover" fit.
   * firstFrame → image-to-video; firstFrame+lastFrame → interpolation.
   */
  async video(
    prompt: string,
    o: { aspect: Aspect; resolution: '720p' | '1080p'; seconds?: number; firstFrame?: Blob; lastFrame?: Blob; signal?: AbortSignal; onWait?: (sec: number) => void },
  ): Promise<Blob> {
    const input: unknown[] = [];
    for (const f of [o.firstFrame, o.lastFrame]) if (f) input.push({ type: 'image', mime_type: f.type || 'image/jpeg', data: await blobToBase64(f) });
    input.push({ type: 'text', text: prompt });
    // videos over ~4MB are only returned by uri (omni guide); download() handles both forms
    const format: Record<string, unknown> = { type: 'video', aspect_ratio: o.aspect === '9:16' ? '9:16' : '16:9', resolution: o.resolution, delivery: 'uri' };
    if (o.seconds) format.duration = `${o.seconds}s`;
    const body = { model: MODELS.video, input: input.length === 1 ? prompt : input, response_format: format };
    let blocks: Block[];
    try {
      blocks = await this.interact(body, { signal: o.signal, background: true, onWait: o.onWait });
    } catch (e) {
      // if the duration field is rejected, retry once without it
      if (e instanceof GeminiError && e.status === 400 && /duration/i.test(e.message)) {
        delete format.duration;
        blocks = await this.interact(body, { signal: o.signal, background: true, onWait: o.onWait });
      } else throw e;
    }
    const b = await mediaBlock(this, blocks, 'video');
    return new Blob([b.bytes as BlobPart], { type: 'video/mp4' });
  }

  async music(prompt: string, kind: 'clip' | 'song', signal?: AbortSignal): Promise<Blob> {
    const blocks = await this.interact(
      { model: kind === 'clip' ? MODELS.musicClip : MODELS.musicSong, input: prompt },
      { signal, background: true },
    );
    return toAudioBlob(await mediaBlock(this, blocks, 'audio'));
  }

  /** Download a Files API file (used when the API answers with a uri instead of inline data). */
  async download(uri: string, signal?: AbortSignal): Promise<Uint8Array> {
    const name = /^https:\/\/generativelanguage\.googleapis\.com\/(?:v1beta\/)?(files\/[A-Za-z0-9_-]+)/.exec(uri)?.[1] ?? /^(files\/[A-Za-z0-9_-]+)$/.exec(uri)?.[1];
    if (name) {
      for (let i = 0; i < 60; i++) {
        const f = await this.request<{ state?: string }>('GET', `/${name}`, undefined, signal);
        if (!f.state || f.state === 'ACTIVE') break;
        if (f.state === 'FAILED') throw new GeminiError('ファイルの生成に失敗しました', 500);
        await sleep(3000, signal);
      }
    }
    // Only ever send the key to Google's Files API, whatever the response says.
    if (!name) throw new GeminiError('生成結果の取得先が想定外のため、ダウンロードを中止しました', 500);
    const res = await fetch(`${BASE}/${name}:download?alt=media`, { headers: { 'x-goog-api-key': this.key }, signal });
    if (!res.ok) throw new GeminiError(`ダウンロードに失敗しました（${res.statusText}）`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
}

export function outputBlocks(it: Interaction): Block[] {
  const fromSteps = (it.steps ?? []).filter((s) => s.type === 'model_output').flatMap((s) => s.content ?? []);
  return fromSteps.length ? fromSteps : (it.outputs ?? []);
}

async function mediaBlock(g: Gemini, blocks: Block[], type: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const b = [...blocks].reverse().find((x) => x.type === type);
  if (!b) {
    const said = blocks.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
    throw new GeminiError(said ? `生成されませんでした: ${said}` : '生成結果が空でした。プロンプトを変えて試してください。', 500);
  }
  if (b.data) return { bytes: base64ToBytes(b.data), mime: b.mime_type ?? '' };
  if (b.uri) return { bytes: await g.download(b.uri), mime: b.mime_type ?? '' };
  throw new GeminiError('生成結果にデータがありませんでした', 500);
}

function toAudioBlob({ bytes, mime }: { bytes: Uint8Array; mime: string }): Blob {
  const pcm = parsePcmMime(mime);
  if (pcm) return new Blob([pcm16ToWav(bytes, pcm.rate, pcm.channels) as BlobPart], { type: 'audio/wav' });
  const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const type = isRiff ? 'audio/wav' : mime === 'audio/mp3' ? 'audio/mpeg' : mime || 'audio/mpeg';
  return new Blob([bytes as BlobPart], { type });
}

export async function blobToBase64(b: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await b.arrayBuffer()));
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('中止しました', 'AbortError'));
    });
  });
}
