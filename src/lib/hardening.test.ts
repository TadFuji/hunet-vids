import { describe, expect, it } from 'vitest';
import { importBackup } from './backup';
import { ExportMedia } from './media';
import { makeProject, makeScene, makeText, normalizeProject, THEMES } from './model';
import { mediaNeeds, plan, textBox, videoMediaTime } from './render';
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

describe('importBackup boundary checks', () => {
  it('rejects truncated 8-11 byte files with the Japanese error instead of RangeError', async () => {
    const truncated = new Blob(['MYVIDS1\n12']);
    await expect(importBackup(truncated)).rejects.toThrow('ファイルが壊れているか');
  });
});

describe('mediaNeeds during transition', () => {
  it('requests the outgoing scene frame before the incoming scene frame', () => {
    const theme = THEMES[0];
    const p = makeProject({
      scenes: [
        makeScene(theme, { id: 's1', duration: 4, background: { kind: 'video', assetId: 'v1', fit: 'cover', trimStart: 0, volume: 0, loop: false } }),
        makeScene(theme, { id: 's2', duration: 4, transition: 'fade', background: { kind: 'video', assetId: 'v1', fit: 'cover', trimStart: 0, volume: 0, loop: false } }),
      ],
    });
    const rp = plan(p, 1);
    const needs = mediaNeeds(rp, 4.25, () => 5);
    expect(needs).toEqual([
      { assetId: 'v1', time: 4 },
      { assetId: 'v1', time: 0.25 },
    ]);
  });

  it('ExportMedia keeps separate outgoing and incoming frames and caches the static outgoing frame across transition', async () => {
    const em = new ExportMedia();
    const calls: number[] = [];
    (em as unknown as { cursors: Map<string, { frameAt: (t: number) => Promise<{ canvas: { t: number } }> }> }).cursors.set('v1', {
      frameAt: async (t: number) => {
        calls.push(t);
        return { canvas: { t } };
      },
    });
    await em.prepare([
      { assetId: 'v1', time: 4 },
      { assetId: 'v1', time: 0.1 },
    ]);
    expect(em.get('v1', 4)).toEqual({ t: 4 });
    expect(em.get('v1', 0.1)).toEqual({ t: 0.1 });
    await em.prepare([
      { assetId: 'v1', time: 4 },
      { assetId: 'v1', time: 0.2 },
    ]);
    expect(em.get('v1', 4)).toEqual({ t: 4 });
    expect(em.get('v1', 0.2)).toEqual({ t: 0.2 });
    // Outgoing frame at t=4 was decoded only once; incoming frames at 0.1 and 0.2 advanced sequentially.
    expect(calls).toEqual([4, 0.1, 0.2]);
  });

  it('textBox respects start/end visibility window, line wrapping and horizontal alignment', () => {
    const theme = THEMES[0];
    const mockCtx = {
      font: '',
      save: () => {},
      restore: () => {},
      measureText: (s: string) => ({ width: [...s].length * 20 }),
    } as unknown as CanvasRenderingContext2D;
    const item = makeText(theme, { text: '短い文字', x: 0.5, y: 0.5, width: 0.8, size: 0.05, align: 'left', start: 1, end: 3 });
    expect(textBox(mockCtx, item, 1000, 500, 0.5, 5)).toBeNull();
    expect(textBox(mockCtx, item, 1000, 500, 3.5, 5)).toBeNull();
    const leftBox = textBox(mockCtx, item, 1000, 500, 2, 5)!;
    const rightBox = textBox(mockCtx, { ...item, align: 'right' }, 1000, 500, 2, 5)!;
    expect(leftBox).not.toBeNull();
    expect(rightBox.x).toBeGreaterThan(leftBox.x);
  });
});
