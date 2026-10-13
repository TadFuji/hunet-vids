// Demo mode: same interface as Gemini but produces placeholder media locally (no key, no cost).
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_MEDIUM } from 'mediabunny';
import { Gemini } from './gemini';
import { ASPECT_SIZES } from './model';
import type { Aspect } from './model';
import { pcm16ToWav } from './audio';
import type { Storyboard } from './storyboard';

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      rej(new DOMException('中止しました', 'AbortError'));
    });
  });

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

function paint(ctx: OffscreenCanvasRenderingContext2D, W: number, H: number, prompt: string, phase = 0) {
  const h = hue(prompt);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, `hsl(${h} 60% 35%)`);
  g.addColorStop(1, `hsl(${(h + 70) % 360} 65% 18%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `hsla(${(h + i * 40) % 360} 80% 70% / 0.25)`;
    ctx.beginPath();
    const x = W * (((i * 0.37 + phase * 0.1 * (i % 2 ? 1 : -1)) % 1) + 1) % W;
    ctx.arc(x % W, H * ((i * 0.53) % 1), Math.min(W, H) * (0.08 + (i % 3) * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `${Math.round(H * 0.035)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('DEMO: ' + prompt.slice(0, 48), W / 2, H * 0.94);
}

export class MockGemini extends Gemini {
  constructor() {
    super('demo');
  }

  async check() {}

  async json<T>(prompt: unknown): Promise<T> {
    await wait(800);
    const text = typeof prompt === 'string' ? prompt : '';
    const topic = /Brief: (.*)/.exec(text)?.[1]?.slice(0, 30) ?? 'デモ';
    const sb: Storyboard = {
      title: `${topic}`,
      musicPrompt: 'calm lo-fi piano, 80 bpm, instrumental',
      voiceStyle: '落ち着いて親しみやすく',
      scenes: [
        { title: 'オープニング', headline: topic, subtext: '体験モードで作成', narration: `${topic}について、短く紹介します。`, visualPrompt: 'sunrise over a city skyline', visualType: 'image', seconds: 4, motion: 'zoom-in' },
        { title: 'ポイント', headline: '大事なポイント', subtext: '', narration: 'まず、いちばん大事な点を押さえましょう。順番に見ていきます。', visualPrompt: 'a person thinking at a desk, soft light', visualType: 'video', seconds: 5, motion: 'none' },
        { title: 'まとめ', headline: 'まとめ', subtext: 'ご覧いただきありがとうございました', narration: '以上です。最後までご覧いただきありがとうございました。', visualPrompt: 'calm ocean at sunset', visualType: 'image', seconds: 5, motion: 'pan-right' },
      ],
    };
    return sb as T;
  }

  async text(prompt: string): Promise<string> {
    await wait(400);
    return (prompt.split('\n\n').pop() ?? '') + '（体験モードで書き換え）';
  }

  async speech(text: string, _voice: string, _style: string, signal?: AbortSignal): Promise<Blob> {
    await wait(500, signal);
    const rate = 24000;
    const sec = Math.max(1, [...text].length / 7);
    const n = Math.round(sec * rate);
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const syllable = Math.sin(Math.PI * ((t * 6) % 1)); // ~6 "syllables" per second
      pcm[i] = Math.round(Math.sin(2 * Math.PI * (180 + 40 * Math.sin(t * 3)) * t) * syllable * 6000);
    }
    return new Blob([pcm16ToWav(new Uint8Array(pcm.buffer), rate, 1) as BlobPart], { type: 'audio/wav' });
  }

  async image(prompt: string, aspect: Aspect, _refs: unknown[] = [], signal?: AbortSignal): Promise<Blob> {
    await wait(700, signal);
    const { w, h } = ASPECT_SIZES[aspect];
    const c = new OffscreenCanvas(w / 2, h / 2);
    paint(c.getContext('2d')!, c.width, c.height, prompt);
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  }

  async video(prompt: string, o: { aspect: Aspect; seconds?: number; signal?: AbortSignal; onWait?: (s: number) => void }): Promise<Blob> {
    for (let i = 1; i <= 2; i++) {
      await wait(700, o.signal);
      o.onWait?.(i);
    }
    const { w, h } = ASPECT_SIZES[o.aspect === '9:16' ? '9:16' : '16:9'];
    const c = new OffscreenCanvas(Math.round(w / 3 / 2) * 2, Math.round(h / 3 / 2) * 2);
    const ctx = c.getContext('2d')!;
    const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const src = new CanvasSource(c, { codec: 'avc', bitrate: QUALITY_MEDIUM });
    out.addVideoTrack(src, { frameRate: 24 });
    await out.start();
    const secs = o.seconds ?? 4;
    for (let i = 0; i < secs * 24; i++) {
      paint(ctx, c.width, c.height, prompt, i / 24);
      await src.add(i / 24, 1 / 24);
    }
    await out.finalize();
    return new Blob([(out.target as BufferTarget).buffer!], { type: 'video/mp4' });
  }

  async music(prompt: string, _kind: 'clip' | 'song', signal?: AbortSignal): Promise<Blob> {
    await wait(600, signal);
    const rate = 44100;
    const sec = 16;
    const ctx = new OfflineAudioContext(2, rate * sec, rate);
    const root = 196 + (hue(prompt) % 60);
    const chords = [[1, 1.25, 1.5], [0.89, 1.12, 1.33], [0.75, 1, 1.25], [0.84, 1.06, 1.26]];
    chords.forEach((ch, i) =>
      ch.forEach((m) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = root * m;
        g.gain.setValueAtTime(0, i * 4);
        g.gain.linearRampToValueAtTime(0.08, i * 4 + 0.3);
        g.gain.linearRampToValueAtTime(0, i * 4 + 4);
        o.connect(g).connect(ctx.destination);
        o.start(i * 4);
        o.stop(i * 4 + 4);
      }),
    );
    const buf = await ctx.startRendering();
    const pcm = new Int16Array(buf.length * 2);
    const l = buf.getChannelData(0);
    const r = buf.getChannelData(1);
    for (let i = 0; i < buf.length; i++) {
      pcm[i * 2] = l[i] * 32767;
      pcm[i * 2 + 1] = r[i] * 32767;
    }
    return new Blob([pcm16ToWav(new Uint8Array(pcm.buffer), rate, 2) as BlobPart], { type: 'audio/wav' });
  }
}
