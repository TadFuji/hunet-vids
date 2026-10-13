// Audio mixing for both live preview (AudioContext) and export (OfflineAudioContext).
import type { Project } from './model';
import { layout, NARRATION_LEAD } from './timeline';
import { decodeBlob } from './audio';
import { getAsset } from './store';

export type BufferMap = Map<string, AudioBuffer>;

const bufferCache = new Map<string, AudioBuffer | null>();

/** Decode every audio-bearing asset the project uses. */
export async function loadBuffers(project: Project): Promise<BufferMap> {
  const ids = new Set<string>();
  for (const s of project.scenes) {
    if (s.narration.assetId) ids.add(s.narration.assetId);
    if (s.background.kind === 'video' && s.background.volume > 0) ids.add(s.background.assetId);
  }
  if (project.music) ids.add(project.music.assetId);
  const map: BufferMap = new Map();
  for (const id of ids) {
    if (!bufferCache.has(id)) {
      const a = await getAsset(id);
      bufferCache.set(id, a ? await decodeBlob(a.blob) : null);
    }
    const b = bufferCache.get(id);
    if (b) map.set(id, b);
  }
  return map;
}

export const forgetBuffer = (id: string) => bufferCache.delete(id);

const DUCK = 0.35;

/**
 * Schedule every sound of the project on `ctx`, as if playback started at project time `offset`.
 * Returns the started source nodes so a live preview can stop them.
 */
export function schedule(ctx: BaseAudioContext, project: Project, buffers: BufferMap, offset: number, startAt = ctx.currentTime): AudioScheduledSourceNode[] {
  const nodes: AudioScheduledSourceNode[] = [];
  const { spans, total } = layout(project);
  const at = (projectTime: number) => startAt + Math.max(0, projectTime - offset);

  const play = (buf: AudioBuffer, start: number, bufOffset: number, dur: number, gain: number, loop = false) => {
    // clip to what is still ahead of the playhead
    const skip = Math.max(0, offset - start);
    if (skip >= dur) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    if (loop) {
      // loop the trimmed part, matching videoMediaTime()
      src.loopStart = Math.min(bufOffset, Math.max(0, buf.duration - 0.05));
      src.loopEnd = buf.duration;
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(ctx.destination);
    const off = bufOffset + skip;
    const loopLen = buf.duration - src.loopStart;
    const startOff = loop && off >= buf.duration ? src.loopStart + ((off - src.loopStart) % loopLen) : off;
    src.start(at(start), startOff, loop ? undefined : dur - skip);
    if (loop) src.stop(at(start + dur));
    nodes.push(src);
  };

  const narrationWindows: [number, number][] = [];
  for (const sp of spans) {
    const n = sp.scene.narration;
    const nb = n.assetId ? buffers.get(n.assetId) : undefined;
    if (nb) {
      const s = sp.start + NARRATION_LEAD;
      const d = Math.min(nb.duration, sp.end - s);
      play(nb, s, 0, d, 1);
      narrationWindows.push([s, s + d]);
    }
    const bg = sp.scene.background;
    if (bg.kind === 'video' && bg.volume > 0) {
      const vb = buffers.get(bg.assetId);
      if (vb) {
        const d = sp.scene.duration;
        if (bg.loop) play(vb, sp.start, bg.trimStart, d, bg.volume, true);
        else play(vb, sp.start, bg.trimStart, Math.min(d, vb.duration - bg.trimStart), bg.volume);
      }
    }
  }

  const m = project.music;
  const mb = m ? buffers.get(m.assetId) : undefined;
  if (m && mb && total > offset) {
    const src = ctx.createBufferSource();
    src.buffer = mb;
    src.loop = true;
    const g = ctx.createGain();
    src.connect(g).connect(ctx.destination);
    // gain automation in project time, mapped to context time
    const level = (t: number) => {
      let v = m.volume;
      if (m.fadeIn > 0 && t < m.fadeIn) v *= t / m.fadeIn;
      if (m.fadeOut > 0 && t > total - m.fadeOut) v *= Math.max(0, (total - t) / m.fadeOut);
      if (m.duck && narrationWindows.some(([a, b]) => t >= a - 0.2 && t <= b + 0.2)) v *= DUCK;
      return v;
    };
    const step = 0.1;
    g.gain.setValueAtTime(level(offset), at(offset));
    for (let t = Math.ceil(offset / step) * step; t <= total; t += step) g.gain.linearRampToValueAtTime(level(t), at(t));
    src.start(at(offset), offset % mb.duration);
    src.stop(at(total));
    nodes.push(src);
  }
  return nodes;
}

export async function renderMix(project: Project, buffers: BufferMap, sampleRate = 48000): Promise<AudioBuffer> {
  const { total } = layout(project);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * sampleRate)), sampleRate);
  schedule(ctx, project, buffers, 0, 0);
  return ctx.startRendering();
}
