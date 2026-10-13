// Turning blobs into stored assets with measured metadata.
import { uid } from './model';
import type { AssetKind, AssetMeta, AssetSource } from './model';
import { mediaDuration } from './audio';
import { loadImage } from './media';
import { putAsset } from './store';

export function kindOf(mime: string): AssetKind | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

export async function addAsset(blob: Blob, opts: { name: string; source: AssetSource; prompt?: string; duration?: number }): Promise<AssetMeta> {
  const kind = kindOf(blob.type);
  if (!kind) throw new Error(`対応していない形式です: ${blob.type || '不明'}`);
  const meta: AssetMeta = { id: uid(), kind, mime: blob.type, name: opts.name, source: opts.source, prompt: opts.prompt, createdAt: Date.now() };
  if (kind === 'image') {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      meta.width = img.naturalWidth;
      meta.height = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    const d = await mediaDuration(blob, kind);
    meta.duration = d > 0 ? d : opts.duration;
  }
  await putAsset({ meta, blob });
  return meta;
}
