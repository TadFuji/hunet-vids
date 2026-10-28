import { StudioError, videoSettings } from './core.js';
import { validateVideo } from './media.js';
const localError = () => new StudioError('このMacでの動画処理を完了できませんでした。元ファイルは変更していません。対応形式・空き容量・ローカルサーバーの起動状態を確認してください。', { uncertain: true });
async function response(path, options) {
  let result;
  try { result = await fetch(path, { ...options, headers: { ...options.headers, 'x-omni-local': '1' }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(240000) }); }
  catch { throw localError(); }
  if (!result.ok) {
    const messages = { 405: '現在のサーバーは動画処理に対応していません。作業中の動画を保存してからアプリを起動し直してください。', 413: '動画が大きすぎます。初回の元動画は200MiB以下、継続する現在版は400MiB以下、接続する2本の合計は600MiB以下にしてください。', 422: '動画を処理できませんでした。MP4・MOV・WebM、横16:9または縦9:16の動画を選んでください。', 429: 'このMacで別の動画を処理しています。完了後にもう一度選んでください。' };
    throw new StudioError(messages[result.status] || localError().message, { uncertain: true });
  }
  return result;
}
export async function prepareSource(file) { return prepare(file, false); }
export async function prepareContinuation(file) { return prepare(file, true); }
async function prepare(file, continuation) {
  const maxMiB = continuation ? 400 : 200;
  if (!file || file.size <= 0 || file.size > maxMiB * 1024 * 1024) throw new StudioError(`${maxMiB}MiB以下の動画ファイルを選んでください。`);
  const result = await response(continuation ? '/local-media/prepare-continuation' : '/local-media/prepare', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  let info;
  try { info = await result.json(); } catch { throw localError(); }
  if (!Number.isFinite(info.sourceSeconds) || info.sourceSeconds <= 0 || info.sourceSeconds > (continuation ? 1240 : 1200) || Math.abs(info.sourceSeconds - info.prefixSeconds - info.tailSeconds) > 0.1 || !Number.isFinite(info.tailSeconds) || info.tailSeconds <= 0 || info.tailSeconds > 10 || !Number.isFinite(info.prefixSeconds) || info.prefixSeconds < 0 || typeof info.tailBase64 !== 'string' || info.tailBase64.length > 100 * 1024 * 1024) throw localError();
  const settings = videoSettings(info.settings);
  let tailBlob;
  try { tailBlob = new Blob([Uint8Array.from(atob(info.tailBase64), c => c.charCodeAt(0))], { type: 'video/mp4' }); } catch { throw localError(); }
  const measured = await validateVideo(tailBlob, info.tailSeconds, { aspectRatio: settings.aspectRatio });
  if (!measured.valid || measured.actualSeconds > 10) throw new StudioError('切り出した末尾動画が10秒以内で、元動画と同じ縦横比か確認できませんでした。Googleへは送信していません。');
  const { tailBase64, ...metadata } = info;
  return { ...metadata, continuation, settings, originalBlob: file, tailBlob, name: file.name || '選択した動画' };
}
export async function composeSource(source, ending, expectedSeconds) {
  if (!(source?.originalBlob instanceof Blob) || !(ending instanceof Blob) || source.originalBlob.size > 400 * 1024 * 1024 || ending.size > 200 * 1024 * 1024 || source.originalBlob.size + ending.size > 600 * 1024 * 1024 || !Number.isFinite(expectedSeconds) || expectedSeconds <= 0 || expectedSeconds > 1240) throw localError();
  const aspectRatio = source.settings?.aspectRatio;
  if (!['16:9', '9:16'].includes(aspectRatio)) throw localError();
  if (source.prefixSeconds === 0) {
    const measured = await validateVideo(ending, expectedSeconds, { aspectRatio });
    if (!measured.valid) throw localError();
    return { blob: ending, actualSeconds: measured.actualSeconds };
  }
  const form = new FormData();
  form.append('source', source.originalBlob, 'source-video'); form.append('ending', ending, 'ending.mp4'); form.append('prefixSeconds', String(source.prefixSeconds));
  const res = await response('/local-media/compose', { method: 'POST', body: form });
  const blob = await res.blob();
  if (blob.size <= 0 || blob.size > 400 * 1024 * 1024 || blob.type !== 'video/mp4') throw localError();
  const measured = await validateVideo(blob, expectedSeconds, { maxSeconds: 1240, tolerance: 0.1, aspectRatio });
  if (!measured.valid) throw localError();
  return { blob, actualSeconds: measured.actualSeconds };
}

export async function trimVideo(blob, expectedSeconds, { aspectRatio } = {}) {
  if (!['16:9', '9:16'].includes(aspectRatio)) throw localError();
  if (!(blob instanceof Blob) || blob.size <= 0 || blob.size > 200 * 1024 * 1024 || !Number.isFinite(expectedSeconds) || expectedSeconds < 1 / 24 || expectedSeconds > 40) throw localError();
  const original = await validateVideo(blob, expectedSeconds, { maxSeconds: 1200, tolerance: Infinity, aspectRatio });
  if (!original.valid || expectedSeconds > original.actualSeconds) throw localError();
  const form = new FormData();
  form.append('media', blob.type === 'video/mp4' ? blob : new Blob([blob], { type: 'video/mp4' }), 'generated.mp4');
  form.append('seconds', String(expectedSeconds));
  const res = await response('/local-media/trim', { method: 'POST', body: form });
  const trimmed = await res.blob();
  if (trimmed.type !== 'video/mp4' || trimmed.size <= 0 || trimmed.size > 200 * 1024 * 1024) throw localError();
  const measured = await validateVideo(trimmed, expectedSeconds, { maxSeconds: Math.min(40, original.actualSeconds), tolerance: 0.1, aspectRatio });
  if (!measured.valid) throw localError();
  return { blob: trimmed, actualSeconds: measured.actualSeconds };
}

export async function mixAudio(videoBlob, audioBlob, { startSeconds = 0, videoVolume = 1, narrationVolume = 1, aspectRatio, expectedSeconds } = {}) {
  if (!['16:9', '9:16'].includes(aspectRatio)) throw localError();
  if (!(videoBlob instanceof Blob) || !(audioBlob instanceof Blob) || videoBlob.size <= 0 || videoBlob.size > 400 * 1024 * 1024 || audioBlob.size <= 0 || audioBlob.size > 50 * 1024 * 1024) throw localError();
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || !Number.isFinite(videoVolume) || videoVolume < 0 || videoVolume > 2 || !Number.isFinite(narrationVolume) || narrationVolume <= 0 || narrationVolume > 2) throw localError();
  const original = await validateVideo(videoBlob, expectedSeconds ?? 10, { maxSeconds: 1240, tolerance: Number.isFinite(expectedSeconds) ? 0.1 : Infinity, aspectRatio });
  if (!original.valid || startSeconds >= original.actualSeconds) throw localError();
  const form = new FormData();
  form.append('video', videoBlob.type === 'video/mp4' ? videoBlob : new Blob([videoBlob], { type: 'video/mp4' }), 'video.mp4');
  form.append('audio', audioBlob.type === 'audio/wav' ? audioBlob : new Blob([audioBlob], { type: 'audio/wav' }), 'narration.wav');
  form.append('startSeconds', String(Number(startSeconds.toFixed(6))));
  form.append('videoVolume', String(Number(videoVolume.toFixed(4))));
  form.append('narrationVolume', String(Number(narrationVolume.toFixed(4))));
  const res = await response('/local-media/mix-audio', { method: 'POST', body: form });
  const mixed = await res.blob();
  if (mixed.type !== 'video/mp4' || mixed.size <= 0 || mixed.size > 400 * 1024 * 1024) throw localError();
  const measured = await validateVideo(mixed, original.actualSeconds, { maxSeconds: 1240, tolerance: 0.1, aspectRatio });
  if (!measured.valid) throw localError();
  return { blob: mixed, actualSeconds: measured.actualSeconds };
}
