// Loads stored assets into drawable/playable form for preview and export.
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { WrappedCanvas } from 'mediabunny';
import { getAsset } from './store';
import type { StoredAsset } from './store';
import type { Drawable, FrameSource } from './render';

const urlCache = new Map<string, string>();

export async function assetUrl(id: string): Promise<string | null> {
  if (urlCache.has(id)) return urlCache.get(id)!;
  const a = await getAsset(id);
  if (!a) return null;
  const url = URL.createObjectURL(a.blob);
  urlCache.set(id, url);
  return url;
}

export function forgetAssetUrl(id: string) {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = url;
  });
}

/**
 * Preview source: images as <img>, videos as <video> elements which the player keeps in sync.
 */
export class PreviewMedia implements FrameSource {
  images = new Map<string, HTMLImageElement>();
  videos = new Map<string, HTMLVideoElement>();
  private metaDurations = new Map<string, number>();
  private loading = new Map<string, Promise<void>>();
  onReady: () => void = () => {};

  /** Resolves once the asset is drawable (shared by every caller asking for the same asset). */
  ensure(asset: { id: string; kind: 'image' | 'video' }): Promise<void> {
    let p = this.loading.get(asset.id);
    if (!p) {
      p = this.load(asset);
      this.loading.set(asset.id, p);
    }
    return p;
  }

  private async load(asset: { id: string; kind: 'image' | 'video' }) {
    const url = await assetUrl(asset.id);
    if (!url) return;
    if (asset.kind === 'image') {
      this.images.set(asset.id, await loadImage(url));
    } else {
      const stored = await getAsset(asset.id);
      if (stored?.meta.duration && Number.isFinite(stored.meta.duration) && stored.meta.duration > 0) {
        this.metaDurations.set(asset.id, stored.meta.duration);
      }
      const v = document.createElement('video');
      v.muted = true; // audio is played through the WebAudio mixer
      v.playsInline = true;
      v.preload = 'auto';
      v.src = url;
      await new Promise((r) => {
        v.onloadeddata = r;
        v.onerror = r;
      });
      this.videos.set(asset.id, v);
    }
    this.onReady();
  }

  duration(assetId: string): number | undefined {
    const d = this.videos.get(assetId)?.duration;
    return d && Number.isFinite(d) && d > 0 ? d : this.metaDurations.get(assetId);
  }

  get(assetId: string): Drawable | null {
    const img = this.images.get(assetId);
    if (img) return img;
    const v = this.videos.get(assetId);
    return v && v.readyState >= 2 ? v : null;
  }
}

/** Sequential frame reader for one video asset, restarting the decoder when seeking backwards or far ahead. */
class VideoCursor {
  private sink: CanvasSink;
  private iter: AsyncGenerator<WrappedCanvas> | null = null;
  private current: WrappedCanvas | null = null;
  private next: WrappedCanvas | null = null;
  private duration: number;
  constructor(sink: CanvasSink, duration: number) {
    this.sink = sink;
    this.duration = duration;
  }

  async frameAt(t: number): Promise<WrappedCanvas | null> {
    t = Math.max(0, Math.min(t, Math.max(0, this.duration - 0.001)));
    const behind = this.current && t < this.current.timestamp - 1e-6;
    const farAhead = this.current && t > this.current.timestamp + 2;
    if (!this.iter || behind || farAhead) {
      await this.iter?.return(undefined);
      this.iter = this.sink.canvases(t);
      this.current = (await this.iter.next()).value ?? null;
      this.next = (await this.iter.next()).value ?? null;
    }
    while (this.next && this.next.timestamp <= t + 1e-6) {
      this.current = this.next;
      this.next = (await this.iter.next()).value ?? null;
    }
    return this.current;
  }

  async close() {
    await this.iter?.return(undefined);
  }
}

const frameKey = (assetId: string, time: number) => `${assetId}@${Math.round(time * 1000)}`;

function cloneCanvas(src: CanvasImageSource): CanvasImageSource {
  const w = (src as { width?: number }).width ?? 0;
  const h = (src as { height?: number }).height ?? 0;
  if (typeof OffscreenCanvas !== 'undefined' && w > 0 && h > 0) {
    try {
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(src, 0, 0);
        return c;
      }
    } catch {
      /* fallback to original canvas in test mocks */
    }
  }
  return src;
}

/** Export source: decodes video frames exactly with WebCodecs (via mediabunny). */
export class ExportMedia implements FrameSource {
  private images = new Map<string, ImageBitmap>();
  private cursors = new Map<string, VideoCursor>();
  private frames = new Map<string, CanvasImageSource>();
  private pinned = new Map<string, CanvasImageSource>();
  private durations = new Map<string, number>();

  duration(assetId: string): number | undefined {
    return this.durations.get(assetId);
  }

  static async create(assets: StoredAsset[], W: number, H: number): Promise<ExportMedia> {
    const m = new ExportMedia();
    try {
      for (const a of assets) {
        if (a.meta.kind === 'image') m.images.set(a.meta.id, await createImageBitmap(a.blob));
        if (a.meta.kind === 'video') {
          const input = new Input({ source: new BlobSource(a.blob), formats: ALL_FORMATS });
          const track = await input.getPrimaryVideoTrack();
          if (!track) continue;
          const duration = await track.computeDuration();
          // decode at a size close to the output to keep memory bounded
          const scale = Math.min(1, Math.max(W / track.displayWidth, H / track.displayHeight) * 1.15);
          const sink = new CanvasSink(track, { width: Math.round(track.displayWidth * scale), poolSize: 3 });
          m.cursors.set(a.meta.id, new VideoCursor(sink, duration));
          m.durations.set(a.meta.id, duration);
        }
      }
      return m;
    } catch (e) {
      await m.close();
      throw e;
    }
  }

  /** Decode the frames needed for the next drawFrame call. */
  async prepare(needs: { assetId: string; time: number }[]) {
    this.frames.clear();
    if (needs.length <= 1) this.pinned.clear();
    for (let i = 0; i < needs.length; i++) {
      const n = needs[i];
      const key = frameKey(n.assetId, n.time);
      const cached = this.pinned.get(key);
      if (cached) {
        this.frames.set(key, cached);
        this.frames.set(n.assetId, cached);
        continue;
      }
      const c = this.cursors.get(n.assetId);
      if (!c) continue;
      const f = await c.frameAt(n.time);
      if (f) {
        const surface = needs.length > 1 && i === 0 ? cloneCanvas(f.canvas) : f.canvas;
        if (needs.length > 1 && i === 0) this.pinned.set(key, surface);
        this.frames.set(key, surface);
        this.frames.set(n.assetId, surface);
      }
    }
  }

  get(assetId: string, mediaTime = 0): Drawable | null {
    return (this.images.get(assetId) ?? this.frames.get(frameKey(assetId, mediaTime)) ?? this.frames.get(assetId) ?? null) as Drawable | null;
  }

  async close() {
    this.pinned.clear();
    for (const c of this.cursors.values()) await c.close();
    this.images.forEach((b) => b.close());
  }
}
