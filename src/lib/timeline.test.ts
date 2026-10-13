import { describe, expect, it } from 'vitest';
import { captionCues, layout, minDurationFor, sceneAt, splitCaption, toSrt } from './timeline';
import { makeProject, makeScene, THEMES } from './model';
import { parsePcmMime, pcm16ToWav, wavDuration } from './audio';

const theme = THEMES[0];

describe('layout', () => {
  it('places scenes back to back', () => {
    const p = makeProject({ scenes: [makeScene(theme, { duration: 3 }), makeScene(theme, { duration: 5 })] });
    const { spans, total } = layout(p);
    expect(total).toBe(8);
    expect(spans[1].start).toBe(3);
    expect(sceneAt(spans, 2.9)?.index).toBe(0);
    expect(sceneAt(spans, 3)?.index).toBe(1);
    expect(sceneAt(spans, 99)?.index).toBe(1);
  });

  it('fits narration into scene length', () => {
    const s = makeScene(theme, { narration: { text: 'x', voice: 'Kore', style: '', assetId: 'a', duration: 4.02 } });
    expect(minDurationFor(s)).toBeCloseTo(4.9, 5);
  });
});

describe('captions', () => {
  it('splits Japanese sentences and long clauses', () => {
    expect(splitCaption('こんにちは。今日は良い天気ですね！')).toEqual(['こんにちは。', '今日は良い天気ですね！']);
    const long = splitCaption('これはとても長い文章で、字幕が一行に収まらない場合には、読点の位置で分割されるべきです。', 20);
    expect(long.every((l) => l.length <= 21)).toBe(true);
    expect(long.join('')).toBe('これはとても長い文章で、字幕が一行に収まらない場合には、読点の位置で分割されるべきです。');
  });

  it('times cues across the narration and exports SRT', () => {
    const p = makeProject({
      scenes: [makeScene(theme, { duration: 6, narration: { text: 'あいう。かきくけこ。', voice: 'Kore', style: '', assetId: 'a', duration: 4 } })],
    });
    const cues = captionCues(p);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBeCloseTo(0.3);
    expect(cues[1].end).toBeCloseTo(4.3);
    expect(toSrt(cues)).toContain('00:00:00,300 --> ');
  });
});

describe('audio', () => {
  it('wraps PCM into a WAV with the right duration', () => {
    const pcm = new Uint8Array(24000 * 2); // 1 second mono 16-bit
    const wav = pcm16ToWav(pcm, 24000, 1);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(wavDuration(wav)).toBeCloseTo(1);
    expect(parsePcmMime('audio/L16;codec=pcm;rate=24000')).toEqual({ rate: 24000, channels: 1 });
    expect(parsePcmMime('audio/mpeg')).toBeNull();
  });
});
