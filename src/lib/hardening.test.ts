import { describe, expect, it } from 'vitest';
import { normalizeProject } from './model';
import { videoMediaTime } from './render';
import { cleanStoryboard } from './storyboard';
import { layout } from './timeline';

describe('normalizeProject (untrusted backup files)', () => {
  it('fills defaults for a project with missing or wrong fields', () => {
    const p = normalizeProject({ title: 42, aspect: '4:3', scenes: [{ duration: 'x', texts: [{ text: 'hi', size: 99 }], background: { kind: 'image' } }, 'junk'] });
    expect(p.aspect).toBe('16:9');
    expect(p.title).toBe('無題の動画');
    expect(p.scenes).toHaveLength(1);
    expect(p.scenes[0].duration).toBe(5);
    expect(p.scenes[0].texts[0].size).toBe(0.5);
    expect(p.scenes[0].background.kind).not.toBe('image'); // image without an assetId is dropped
    expect(p.scenes[0].narration).toMatchObject({ text: '', assetId: null });
    expect(layout(p).total).toBe(5);
  });

  it('keeps valid content intact', () => {
    const p = normalizeProject({ aspect: '9:16', scenes: [{ id: 's1', title: 'A', duration: 3, background: { kind: 'video', assetId: 'v1', fit: 'contain', trimStart: 1, volume: 0.5, loop: true }, narration: { text: 'こんにちは', voice: 'Puck', style: '', assetId: 'n1', duration: 2 } }], music: { assetId: 'm1', volume: 0.2 } });
    expect(p.aspect).toBe('9:16');
    expect(p.scenes[0].background).toEqual({ kind: 'video', assetId: 'v1', fit: 'contain', trimStart: 1, volume: 0.5, loop: true });
    expect(p.scenes[0].narration.assetId).toBe('n1');
    expect(p.music?.volume).toBe(0.2);
  });

  it('rejects non-objects', () => {
    expect(() => normalizeProject(null)).toThrow();
  });
});

describe('cleanStoryboard (model output)', () => {
  it('coerces missing fields and bad numbers', () => {
    const sb = cleanStoryboard({ scenes: [{ narration: 'x', seconds: 'abc', motion: 'spin' }, null] });
    expect(sb.scenes).toHaveLength(1);
    expect(sb.scenes[0]).toMatchObject({ title: 'シーン 1', headline: '', seconds: 5, motion: 'none', visualType: 'image' });
    expect(cleanStoryboard('nonsense').scenes).toEqual([]);
  });
});

describe('videoMediaTime', () => {
  it('loops within the trimmed part and clamps when not looping', () => {
    expect(videoMediaTime({ trimStart: 1, loop: true }, 10, 5)).toBeCloseTo(1 + (10 % 4));
    expect(videoMediaTime({ trimStart: 0, loop: false }, 10, 5)).toBeCloseTo(4.95);
    expect(videoMediaTime({ trimStart: 0, loop: true }, 2, undefined)).toBe(2);
  });
});
