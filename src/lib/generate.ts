// Generation steps that produce an asset and describe how to apply it to the project.
import type { Gemini } from './gemini';
import type { Aspect, Project, Scene } from './model';
import { addAsset } from './assets';
import { minDurationFor } from './timeline';
import { getAsset } from './store';

export type SceneUpdate = (s: Scene) => Scene;

export async function genNarration(g: Gemini, scene: Scene, signal?: AbortSignal): Promise<SceneUpdate> {
  const text = scene.narration.text.trim();
  if (!text) throw new Error('ナレーションの文章が空です');
  const blob = await g.speech(text, scene.narration.voice, scene.narration.style, signal);
  const meta = await addAsset(blob, { name: `ナレーション: ${scene.title}`, source: 'tts', prompt: text });
  const duration = meta.duration ?? 0;
  return (s) => {
    const next = { ...s, narration: { ...s.narration, assetId: meta.id, duration } };
    return { ...next, duration: Math.max(s.duration, minDurationFor(next)) };
  };
}

export async function genImage(g: Gemini, aspect: Aspect, scene: Scene, signal?: AbortSignal): Promise<SceneUpdate> {
  const prompt = scene.visualPrompt.trim() || scene.title;
  const blob = await g.image(prompt, aspect, [], signal);
  const meta = await addAsset(blob, { name: `画像: ${scene.title}`, source: 'image-ai', prompt });
  return (s) => ({ ...s, background: { kind: 'image', assetId: meta.id, fit: 'cover' } });
}

/** Edit the scene's current image with an instruction (e.g. "remove the background", "make it night"). */
export async function editImage(g: Gemini, aspect: Aspect, scene: Scene, instruction: string, signal?: AbortSignal): Promise<SceneUpdate> {
  const bg = scene.background;
  if (bg.kind !== 'image') throw new Error('このシーンの背景が画像ではありません');
  const src = await getAsset(bg.assetId);
  if (!src) throw new Error('元の画像が見つかりません');
  const blob = await g.image(instruction, aspect, [{ data: src.blob }], signal);
  const meta = await addAsset(blob, { name: `編集: ${scene.title}`, source: 'image-ai', prompt: instruction });
  return (s) => ({ ...s, background: { kind: 'image', assetId: meta.id, fit: 'cover' } });
}

export interface VideoOptions {
  seconds: number;
  resolution: '720p' | '1080p';
  fromImage: boolean; // animate the current background image
  onWait?: (sec: number) => void;
}

export async function genVideo(g: Gemini, aspect: Aspect, scene: Scene, o: VideoOptions, signal?: AbortSignal): Promise<SceneUpdate> {
  const prompt = scene.visualPrompt.trim() || scene.title;
  let firstFrame: Blob | undefined;
  if (o.fromImage && scene.background.kind === 'image') firstFrame = (await getAsset(scene.background.assetId))?.blob;
  const blob = await g.video(prompt, { aspect, resolution: o.resolution, seconds: o.seconds, firstFrame, signal, onWait: o.onWait });
  const meta = await addAsset(blob, { name: `動画: ${scene.title}`, source: 'veo', prompt });
  return (s) => ({
    ...s,
    // narration usually carries the scene, so keep the AI clip's own audio quiet by default
    background: { kind: 'video', assetId: meta.id, fit: 'cover', trimStart: 0, volume: s.narration.text.trim() ? 0 : 0.8, loop: true },
    motion: 'none',
  });
}

export async function genMusic(g: Gemini, prompt: string, kind: 'clip' | 'song', signal?: AbortSignal): Promise<(p: Project) => Project> {
  const full = /instrumental|no vocals/i.test(prompt) ? prompt : `${prompt}. Instrumental only, no vocals.`;
  const blob = await g.music(full, kind, signal);
  const meta = await addAsset(blob, { name: `BGM: ${prompt.slice(0, 30)}`, source: 'music-ai', prompt });
  return (p) => ({ ...p, music: { assetId: meta.id, volume: 0.35, fadeIn: 1, fadeOut: 2, duck: true, prompt } });
}
