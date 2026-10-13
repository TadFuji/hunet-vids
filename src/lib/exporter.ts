// Renders a project to an MP4 file entirely in the browser (WebCodecs via mediabunny).
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import type { Project } from './model';
import { drawFrame, mediaNeeds, plan } from './render';
import { ExportMedia } from './media';
import { loadBuffers, renderMix } from './mix';
import { getAsset, referencedAssets } from './store';
import type { StoredAsset } from './store';

export interface ExportOptions {
  scale: number; // 1 = 1080p class, 2/3 = 720p class
  fps: number;
  onProgress: (fraction: number, label: string) => void;
  signal?: AbortSignal;
}

export async function exportMp4(project: Project, opts: ExportOptions): Promise<Blob> {
  const rp = plan(project, opts.scale);
  if (rp.total <= 0) throw new Error('シーンがありません');
  // H.264 needs even dimensions
  rp.W -= rp.W % 2;
  rp.H -= rp.H % 2;

  const videoCodec = (await canEncodeVideo('avc', { width: rp.W, height: rp.H })) ? 'avc' : 'vp9';
  const audioCodec = (await canEncodeAudio('aac')) ? 'aac' : 'opus';
  if (videoCodec !== 'avc') throw new Error('このブラウザは H.264 の書き出しに対応していません。Chrome か Edge をお使いください。');

  opts.onProgress(0, '素材を読み込み中');
  const assets: StoredAsset[] = [];
  for (const id of referencedAssets(project)) {
    const a = await getAsset(id);
    if (a) assets.push(a);
  }
  const media = await ExportMedia.create(assets, rp.W, rp.H);
  const mix = await renderMix(project, await loadBuffers(project));

  const canvas = new OffscreenCanvas(rp.W, rp.H);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: videoCodec, bitrate: QUALITY_HIGH });
  const audio = new AudioBufferSource({ codec: audioCodec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: opts.fps });
  output.addAudioTrack(audio);
  await output.start();

  try {
    const frames = Math.ceil(rp.total * opts.fps);
    for (let i = 0; i < frames; i++) {
      if (opts.signal?.aborted) throw new DOMException('中止しました', 'AbortError');
      const t = i / opts.fps;
      await media.prepare(mediaNeeds(rp, t));
      drawFrame(ctx, project, rp, t, media);
      await video.add(t, 1 / opts.fps);
      if (i % 5 === 0) opts.onProgress(i / frames, '映像を書き出し中');
    }
    opts.onProgress(1, '音声を書き出し中');
    await audio.add(mix);
    await output.finalize();
  } catch (e) {
    await output.cancel();
    throw e;
  } finally {
    await media.close();
  }
  const buf = (output.target as BufferTarget).buffer!;
  return new Blob([buf], { type: 'video/mp4' });
}
