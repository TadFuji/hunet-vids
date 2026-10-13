// Live checks against the real Gemini API. Skipped unless a key is configured.
//   GEMINI_API_KEY=...            free-tier checks (script JSON, TTS)
//   LIVE_PAID=image,music,video   also run paid checks (≈ $0.03 / $0.04 / $0.40)
// The key is read from the environment or from .env.local (git-ignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Gemini } from './gemini';
import { STORYBOARD_SCHEMA, storyboardPrompt } from './storyboard';
import type { Storyboard } from './storyboard';

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  if (!existsSync('.env.local')) return '';
  const line = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : '';
}

const KEY = env('GEMINI_API_KEY');
const PAID = env('LIVE_PAID').split(',').map((s) => s.trim());
const OUT = 'live-output';
const save = async (name: string, b: Blob) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}`, new Uint8Array(await b.arrayBuffer()));
};

describe.skipIf(!KEY)('Gemini live', () => {
  const g = new Gemini(KEY);

  it('validates the key', async () => {
    await g.check();
  });

  it('writes a storyboard as structured JSON', { timeout: 120_000 }, async () => {
    const sb = await g.json<Storyboard>(
      storyboardPrompt({ prompt: '朝のコーヒーを楽しむコツ', reference: '', seconds: 20, tone: '', language: 'ja', aspect: '16:9', themeId: 'midnight', voice: 'Kore', visual: 'mixed' }),
      STORYBOARD_SCHEMA,
    );
    expect(sb.scenes.length).toBeGreaterThan(0);
    expect(typeof sb.scenes[0].narration).toBe('string');
    writeFileSync(`${(mkdirSync(OUT, { recursive: true }), OUT)}/storyboard.json`, JSON.stringify(sb, null, 2));
  });

  it('speaks Japanese narration as WAV', { timeout: 120_000 }, async () => {
    const wav = await g.speech('こんにちは。my-vids のナレーションのテストです。', 'Kore', '落ち着いて親しみやすく');
    const head = new Uint8Array(await wav.slice(0, 4).arrayBuffer());
    expect(String.fromCharCode(...head)).toBe('RIFF');
    expect(wav.size).toBeGreaterThan(20_000);
    await save('speech.wav', wav);
  });

  it.runIf(PAID.includes('image'))('generates an image', { timeout: 300_000 }, async () => {
    const img = await g.image('a cozy cup of coffee on a wooden table, morning light, no text', '16:9');
    expect(img.size).toBeGreaterThan(10_000);
    await save('image.jpg', img);
  });

  it.runIf(PAID.includes('music'))('generates a 30s music clip', { timeout: 300_000 }, async () => {
    const m = await g.music('calm lo-fi piano, 80 bpm. Instrumental only, no vocals.', 'clip');
    expect(m.size).toBeGreaterThan(50_000);
    await save(`music.${m.type.includes('wav') ? 'wav' : 'mp3'}`, m);
  });

  it.runIf(PAID.includes('video'))('generates a 4s video', { timeout: 600_000 }, async () => {
    const v = await g.video('steam rising from a cup of coffee, slow motion, soft morning light', { aspect: '16:9', resolution: '720p', seconds: 4, onWait: (s) => console.log(`video: waiting ${s}s`) });
    expect(v.size).toBeGreaterThan(50_000);
    await save('video.mp4', v);
  });
});
