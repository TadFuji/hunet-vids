// Audio helpers: wrap raw PCM into WAV, decode blobs, measure durations.

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

/** Build a WAV file around little-endian 16-bit PCM data. */
export function pcm16ToWav(pcm: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const writeStr = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  const blockAlign = channels * 2;
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

/** Parse "audio/L16;codec=pcm;rate=24000" style mime types. */
export function parsePcmMime(mime: string): { rate: number; channels: number } | null {
  if (!/audio\/(L16|pcm)/i.test(mime)) return null;
  const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] ?? 24000);
  const channels = Number(/channels=(\d+)/i.exec(mime)?.[1] ?? 1);
  return { rate, channels };
}

export function wavDuration(wav: Uint8Array): number {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const byteRate = v.getUint32(28, true);
  const dataLen = v.getUint32(40, true);
  return byteRate ? dataLen / byteRate : 0;
}

let sharedCtx: AudioContext | null = null;
export const audioCtx = () => (sharedCtx ??= new AudioContext());

export async function decodeBlob(blob: Blob): Promise<AudioBuffer | null> {
  try {
    return await audioCtx().decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null; // e.g. a video without an audio track
  }
}

export function mediaDuration(blob: Blob, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    el.preload = 'metadata';
    const url = URL.createObjectURL(blob);
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    el.src = url;
  });
}
