import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LIMITS = Object.freeze({ prepareBytes: 200 * 1024 * 1024, composeBytes: 400 * 1024 * 1024, continuationBytes: 400 * 1024 * 1024, composeInputBytes: 600 * 1024 * 1024, sourceSeconds: 1200, continuationSeconds: 1240, endingSeconds: 40, processMs: 180000, requestMs: 240000, maxDimension: 8192, maxPixels: 35000000 });
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
export class LocalMediaError extends Error {
  constructor(status = 422, code = 'invalid_media') { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new LocalMediaError(status, code); };
function checkAbort(signal) { if (signal?.aborted) fail(408, 'processing_cancelled'); }
export function runMediaTool(binary, args, { signal, timeout = LIMITS.processMs } = {}) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'ignore'], env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
    const chunks = []; let size = 0; let stopped = false;
    const stop = () => { stopped = true; child.kill('SIGKILL'); };
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 1024 * 1024) stop(); else chunks.push(chunk); });
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    child.once('error', () => { finish(); reject(new LocalMediaError(503, 'local_tools_unavailable')); });
    child.once('close', code => { finish(); if (stopped) reject(new LocalMediaError(408, 'processing_timeout')); else if (code !== 0) reject(new LocalMediaError()); else resolve(Buffer.concat(chunks).toString('utf8')); });
  });
}
function inputFormat(bytes) {
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString() === 'ftyp') return 'mov';
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3) return 'matroska';
  fail(415, 'unsupported_container');
}
function isWavBytes(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length >= 44 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE';
}
function inputArgs(path, format) {
  return ['-protocol_whitelist', 'file', '-format_whitelist', format, '-threads', '2', '-f', format, ...(format === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-i', path];
}
async function probe(path, format, signal, maxSeconds = LIMITS.sourceSeconds) {
  const text = await runMediaTool(FFPROBE, ['-v', 'error', ...inputArgs(path, format), '-show_format', '-show_streams', '-of', 'json'], { signal });
  let info; try { info = JSON.parse(text); } catch { fail(422, 'invalid_media'); }
  const stream = info.streams?.find(s => s.codec_type === 'video');
  const seconds = Number(info.format?.duration);
  if (!stream || !Number.isFinite(seconds) || seconds <= 0 || seconds > maxSeconds) fail(422, 'invalid_duration');
  const videoSeconds = Number(stream.duration);
  if (Number.isFinite(videoSeconds) && videoSeconds > 0 && seconds - videoSeconds > 0.1) fail(422, 'inconsistent_media_duration');
  let width = Number(stream.width); let height = Number(stream.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 16 || height < 16 || Math.max(width, height) > LIMITS.maxDimension || width * height > LIMITS.maxPixels) fail(422, 'invalid_dimensions');
  const sar = stream.sample_aspect_ratio;
  if (sar && !['1:1', '0:1', 'N/A'].includes(sar)) fail(422, 'unsupported_pixel_aspect');
  const rotation = Number(stream.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? stream.tags?.rotate ?? 0);
  if (!Number.isFinite(rotation) || Math.abs(rotation / 90 - Math.round(rotation / 90)) > 0.01) fail(422, 'unsupported_rotation');
  if (Math.abs(Math.round(rotation / 90)) % 2) [width, height] = [height, width];
  return { seconds, videoSeconds: Number.isFinite(videoSeconds) && videoSeconds > 0 ? videoSeconds : seconds, width, height, hasAudio: info.streams.some(s => s.codec_type === 'audio') };
}
export function resolveSettings(width, height) {
  const portrait = height > width; const ratio = portrait ? height / width : width / height;
  if (Math.abs(ratio / (16 / 9) - 1) > 0.025) fail(422, 'unsupported_aspect_ratio');
  const short = Math.min(width, height);
  const preset = [360, 720, 1080, 2160].reduce((best, value) => Math.abs(Math.log(short / value)) < Math.abs(Math.log(short / best)) ? value : best, 360);
  const long = preset * 16 / 9;
  return { width: portrait ? preset : long, height: portrait ? long : preset, normalized: short !== preset || Math.max(width, height) !== long, settings: { aspectRatio: portrait ? '9:16' : '16:9', resolution: ({ 360: '360p', 720: '720p', 1080: '1080p', 2160: '4k' })[preset] } };
}
async function temporary(work, signal) {
  checkAbort(signal); const dir = await mkdtemp(join(tmpdir(), 'omni-local-media-'));
  try { return await work(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
function checkBytes(bytes, max) { if (!Buffer.isBuffer(bytes) || !bytes.length) fail(400, 'empty_media'); if (bytes.length > max) fail(413, 'media_too_large'); }
const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-threads', '2'];
const scale = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p`;
function verifyOutputDimensions(meta, width, height) {
  if (meta.width !== width || meta.height !== height) fail(422, 'invalid_output_dimensions');
}
export function preparationLimits(continuation = false) {
  return continuation === true ? { bytes: LIMITS.continuationBytes, seconds: LIMITS.continuationSeconds } : { bytes: LIMITS.prepareBytes, seconds: LIMITS.sourceSeconds };
}
export async function prepareMedia(bytes, { signal, continuation = false } = {}) {
  const limits = preparationLimits(continuation);
  checkBytes(bytes, limits.bytes); const format = inputFormat(bytes);
  return temporary(async dir => {
    const source = join(dir, 'source'); const tail = join(dir, 'tail.mp4'); await writeFile(source, bytes);
    const meta = await probe(source, format, signal, limits.seconds); const config = resolveSettings(meta.width, meta.height);
    const tailSeconds = Math.floor(Math.min(10, meta.seconds) * 24) / 24;
    if (tailSeconds < 1 / 24) fail(422, 'invalid_duration');
    const prefixSeconds = meta.seconds - tailSeconds;
    await runMediaTool(FFMPEG, ['-v', 'error', '-nostdin', '-y', '-ss', String(prefixSeconds), ...inputArgs(source, format), '-map', '0:v:0', '-map', '0:a:0?', '-vf', scale(config.width, config.height), '-af', `atrim=duration=${tailSeconds},asetpts=PTS-STARTPTS`, '-t', String(tailSeconds), ...encode, '-fs', String(LIMITS.prepareBytes), tail], { signal });
    const out = await probe(tail, 'mov', signal);
    verifyOutputDimensions(out, config.width, config.height);
    if (out.seconds > 10 || Math.abs(out.seconds - tailSeconds) > 0.05) fail(422, 'invalid_tail_duration');
    const tailBytes = await readFile(tail);
    return { continuation: continuation === true, sourceSeconds: meta.seconds, tailSeconds: out.seconds, prefixSeconds, sourceWidth: meta.width, sourceHeight: meta.height, hasAudio: out.hasAudio, ...config, tailBase64: tailBytes.toString('base64') };
  }, signal);
}
export async function composeMedia(sourceBytes, endingBytes, prefixSeconds, { signal } = {}) {
  checkBytes(sourceBytes, LIMITS.continuationBytes); checkBytes(endingBytes, LIMITS.prepareBytes);
  if (sourceBytes.length + endingBytes.length > LIMITS.composeInputBytes) fail(413, 'media_too_large');
  const sourceFormat = inputFormat(sourceBytes); const endingFormat = inputFormat(endingBytes);
  if (typeof prefixSeconds !== 'number' || !Number.isFinite(prefixSeconds) || prefixSeconds < 0) fail(400, 'invalid_prefix');
  return temporary(async dir => {
    const source = join(dir, 'source'); const ending = join(dir, 'ending'); const output = join(dir, 'composed.mp4');
    await writeFile(source, sourceBytes); await writeFile(ending, endingBytes);
    const sourceMeta = await probe(source, sourceFormat, signal, LIMITS.continuationSeconds); const endingMeta = await probe(ending, endingFormat, signal);
    const config = resolveSettings(sourceMeta.width, sourceMeta.height); const endingConfig = resolveSettings(endingMeta.width, endingMeta.height);
    if (endingMeta.seconds > LIMITS.endingSeconds || endingConfig.settings.aspectRatio !== config.settings.aspectRatio) fail(422, 'invalid_ending');
    const expectedPrefix = sourceMeta.seconds - Math.floor(Math.min(10, sourceMeta.seconds) * 24) / 24;
    if (Math.abs(expectedPrefix - prefixSeconds) > 0.001) fail(422, 'invalid_prefix');
    if (prefixSeconds + endingMeta.seconds > LIMITS.continuationSeconds) fail(422, 'invalid_composed_duration');
    const filters = [];
    const segment = (index, duration, audio) => {
      filters.push(`[${index}:v:0]trim=duration=${duration},setpts=PTS-STARTPTS,${scale(config.width, config.height)}[v${index}]`);
      filters.push(audio ? `[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[a${index}]` : `anullsrc=r=48000:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[a${index}]`);
    };
    if (prefixSeconds > 0) { segment(0, prefixSeconds, sourceMeta.hasAudio); segment(1, endingMeta.seconds, endingMeta.hasAudio); filters.push('[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]'); }
    else { segment(1, endingMeta.seconds, endingMeta.hasAudio); filters.push('[v1]null[v]', '[a1]anull[a]'); }
    await runMediaTool(FFMPEG, ['-v', 'error', '-nostdin', '-y', ...inputArgs(source, sourceFormat), ...inputArgs(ending, endingFormat), '-filter_complex_threads', '2', '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-t', String(prefixSeconds + endingMeta.seconds), ...encode, '-fs', String(LIMITS.composeBytes), output], { signal });
    const out = await probe(output, 'mov', signal, LIMITS.continuationSeconds);
    verifyOutputDimensions(out, config.width, config.height);
    if (Math.abs(out.seconds - (prefixSeconds + endingMeta.seconds)) > 0.1) fail(422, 'invalid_composed_duration');
    if ((await stat(output)).size > LIMITS.composeBytes) fail(413, 'media_too_large');
    return readFile(output);
  }, signal);
}
// Retain the beginning only. Frame rounding goes downward; neither track is padded.
export async function trimMedia(bytes, seconds, { signal } = {}) {
  checkBytes(bytes, LIMITS.prepareBytes);
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 1 / 24 || seconds > LIMITS.endingSeconds) fail(400, 'invalid_trim_duration');
  const format = inputFormat(bytes);
  if (format !== 'mov') fail(415, 'unsupported_container');
  return temporary(async dir => {
    const source = join(dir, 'source'); const output = join(dir, 'trimmed.mp4');
    await writeFile(source, bytes);
    const meta = await probe(source, format, signal);
    if (seconds > meta.seconds) fail(422, 'source_too_short');
    resolveSettings(meta.width, meta.height);
    if (meta.width % 2 || meta.height % 2) fail(422, 'invalid_dimensions');
    const frames = Math.floor(Math.min(seconds, meta.videoSeconds) * 24 + 1e-5);
    await runMediaTool(FFMPEG, ['-v', 'error', '-nostdin', '-y', ...inputArgs(source, format), '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `fps=24,trim=end_frame=${frames},setpts=PTS-STARTPTS,setsar=1,format=yuv420p`,
      '-af', `atrim=duration=${seconds},asetpts=PTS-STARTPTS`, '-t', String(seconds), ...encode, '-fs', String(LIMITS.prepareBytes), output], { signal });
    const out = await probe(output, 'mov', signal, LIMITS.endingSeconds);
    verifyOutputDimensions(out, meta.width, meta.height);
    if (Math.abs(out.seconds - seconds) > 0.1 || out.seconds > meta.seconds || out.videoSeconds > meta.videoSeconds || out.hasAudio !== meta.hasAudio) fail(422, 'invalid_trimmed_duration');
    if ((await stat(output)).size > LIMITS.prepareBytes) fail(413, 'media_too_large');
    return readFile(output);
  }, signal);
}
export async function mixAudioMedia(videoBytes, audioBytes, { startSeconds = 0, videoVolume = 1, narrationVolume = 1, signal } = {}) {
  checkBytes(videoBytes, LIMITS.continuationBytes);
  checkBytes(audioBytes, 50 * 1024 * 1024);
  if (!isWavBytes(audioBytes)) fail(415, 'unsupported_audio');
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || !Number.isFinite(videoVolume) || videoVolume < 0 || videoVolume > 2 || !Number.isFinite(narrationVolume) || narrationVolume <= 0 || narrationVolume > 2) fail(400, 'invalid_mix_options');
  const format = inputFormat(videoBytes);
  return temporary(async dir => {
    const source = join(dir, 'source'); const narration = join(dir, 'narration.wav'); const output = join(dir, 'mixed.mp4');
    await writeFile(source, videoBytes); await writeFile(narration, audioBytes);
    const meta = await probe(source, format, signal, LIMITS.continuationSeconds);
    const config = resolveSettings(meta.width, meta.height);
    if (startSeconds >= meta.seconds) fail(422, 'invalid_start_seconds');
    const wavText = await runMediaTool(FFPROBE, ['-v', 'error', ...inputArgs(narration, 'wav'), '-show_format', '-show_streams', '-of', 'json'], { signal });
    let wavInfo; try { wavInfo = JSON.parse(wavText); } catch { fail(422, 'invalid_audio'); }
    const wavSeconds = Number(wavInfo.format?.duration);
    if (!wavInfo.streams?.some(s => s.codec_type === 'audio') || !Number.isFinite(wavSeconds) || wavSeconds <= 0 || wavSeconds > LIMITS.continuationSeconds) fail(422, 'invalid_audio');
    const dur = meta.seconds;
    const delayMs = Math.max(0, Math.round(startSeconds * 1000));
    const orig = meta.hasAudio && videoVolume > 0
      ? `[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${dur},asetpts=PTS-STARTPTS[orig]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${dur},asetpts=PTS-STARTPTS[orig]`;
    const narr = `[1:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,${delayMs > 0 ? `adelay=${delayMs}|${delayMs},` : ''}apad,atrim=duration=${dur},asetpts=PTS-STARTPTS[narr]`;
    const w0 = (meta.hasAudio && videoVolume > 0 ? videoVolume : 0).toFixed(4);
    const w1 = narrationVolume.toFixed(4);
    const filter = `${orig};${narr};[orig][narr]amix=inputs=2:duration=first:dropout_transition=0:weights=${w0} ${w1}:normalize=0,alimiter=limit=0.98:level=false,atrim=duration=${dur},asetpts=PTS-STARTPTS[a]`;
    const canCopyVideo = format === 'mov' && !config.normalized && meta.width % 2 === 0 && meta.height % 2 === 0;
    const videoArgs = canCopyVideo
      ? ['-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart']
      : ['-map', '0:v:0', '-map', '[a]', '-vf', scale(config.width, config.height), ...encode];
    await runMediaTool(FFMPEG, ['-v', 'error', '-nostdin', '-y', ...inputArgs(source, format), ...inputArgs(narration, 'wav'), '-filter_complex_threads', '2', '-filter_complex', filter, ...videoArgs, '-t', String(dur), '-fs', String(LIMITS.composeBytes), output], { signal });
    const out = await probe(output, 'mov', signal, LIMITS.continuationSeconds);
    verifyOutputDimensions(out, canCopyVideo ? meta.width : config.width, canCopyVideo ? meta.height : config.height);
    if (Math.abs(out.seconds - dur) > 0.1 || !out.hasAudio) fail(422, 'invalid_mixed_duration');
    if ((await stat(output)).size > LIMITS.composeBytes) fail(413, 'media_too_large');
    return readFile(output);
  }, signal);
}
export async function localCapabilities() {
  try {
    await runMediaTool(FFMPEG, ['-version'], { timeout: 3000 }); await runMediaTool(FFPROBE, ['-version'], { timeout: 3000 });
    return { version: 1, supported: true, aspectRatios: ['16:9', '9:16'], maxSourceBytes: LIMITS.prepareBytes, maxSourceSeconds: LIMITS.sourceSeconds, maxContinuationBytes: LIMITS.continuationBytes, maxContinuationSeconds: LIMITS.continuationSeconds, maxComposeInputBytes: LIMITS.composeInputBytes, maxOutputBytes: LIMITS.composeBytes, maxTailSeconds: 10, maxEndingSeconds: 40 };
  } catch { return { version: 1, supported: false }; }
}
function isSameOrigin(req, mutation) {
  const host = req.headers.host;
  if (typeof host !== 'string' || !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  const originURL = new URL(`http://${host}`);
  if (Number(originURL.port || 80) !== req.socket.localPort) return false;
  if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin' && req.headers['sec-fetch-site'] !== 'none') return false;
  const origin = req.headers.origin;
  if ((mutation || origin !== undefined) && origin !== `http://${host}`) return false;
  return !mutation || req.headers['x-omni-local'] === '1';
}
async function readBody(req, max, signal) {
  const declared = req.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) fail(413, 'media_too_large');
  const chunks = []; let length = 0;
  for await (const chunk of req) { checkAbort(signal); length += chunk.length; if (length > max) fail(413, 'media_too_large'); chunks.push(chunk); }
  checkAbort(signal); return Buffer.concat(chunks);
}
export function createLocalMediaHandler() {
  let busy = false;
  return async (req, res, path, headers) => {
    if (!path.startsWith('/local-media/')) return false;
    const json = (status, data) => { if (!res.destroyed) res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data)); };
    if (req.url.includes('?')) { json(400, { error: 'unsupported_query' }); return true; }
    const mutation = path !== '/local-media/capabilities';
    if (!isSameOrigin(req, mutation)) { json(403, { error: 'forbidden_origin' }); return true; }
    if ((!mutation && req.method !== 'GET') || (mutation && req.method !== 'POST')) { json(405, { error: 'method_not_allowed' }); return true; }
    if (!mutation) { json(200, await localCapabilities()); return true; }
    if (!['/local-media/prepare', '/local-media/prepare-continuation', '/local-media/compose', '/local-media/trim', '/local-media/mix-audio'].includes(path)) { json(404, { error: 'not_found' }); return true; }
    if (req.headers.authorization || req.headers['x-goog-api-key'] || req.headers['x-api-key'] || req.headers['api-key']) { json(400, { error: 'unsupported_headers' }); return true; }
    if (busy) { json(429, { error: 'local_media_busy' }); return true; }
    busy = true; const controller = new AbortController();
    const abort = () => controller.abort(); const close = () => { if (!res.writableFinished) abort(); };
    req.once('aborted', abort); res.once('close', close);
    const timer = setTimeout(() => { abort(); req.destroy(); }, LIMITS.requestMs);
    try {
      const type = req.headers['content-type'] || '';
      if (path === '/local-media/prepare' || path === '/local-media/prepare-continuation') {
        if (!/^(video\/[a-z0-9.+-]+|application\/octet-stream)(?:\s*;.*)?$/i.test(type)) fail(415, 'unsupported_content_type');
        const continuation = path === '/local-media/prepare-continuation';
        const bytes = await readBody(req, preparationLimits(continuation).bytes, controller.signal);
        json(200, await prepareMedia(bytes, { signal: controller.signal, continuation }));
      } else {
        if (!/^multipart\/form-data;\s*boundary=(?:[a-z0-9'()+_,.\/:=?-]{1,70}|"[a-z0-9'()+_,.\/:=?-]{1,70}")$/i.test(type)) fail(415, 'unsupported_content_type');
        const trimming = path.endsWith('/trim');
        const mixing = path.endsWith('/mix-audio');
        const bytes = await readBody(req, (trimming ? LIMITS.prepareBytes : LIMITS.composeInputBytes) + 16384, controller.signal);
        let form; try { form = await new Response(bytes, { headers: { 'Content-Type': type } }).formData(); } catch { fail(400, 'invalid_form'); }
        let output;
        if (trimming) {
          if ([...form.keys()].length !== 2 || !['media', 'seconds'].every(key => form.getAll(key).length === 1)) fail(400, 'invalid_form');
          const media = form.get('media'); const seconds = form.get('seconds');
          if (!(media instanceof Blob) || media.type !== 'video/mp4' || typeof seconds !== 'string' || !/^\d{1,2}(?:\.\d{1,17})?$/.test(seconds)) fail(400, 'invalid_form');
          output = await trimMedia(Buffer.from(await media.arrayBuffer()), Number(seconds), { signal: controller.signal });
        } else if (mixing) {
          if ([...form.keys()].length !== 5 || !['video', 'audio', 'startSeconds', 'videoVolume', 'narrationVolume'].every(key => form.getAll(key).length === 1)) fail(400, 'invalid_form');
          const video = form.get('video'); const audio = form.get('audio');
          const startSeconds = form.get('startSeconds'); const videoVolume = form.get('videoVolume'); const narrationVolume = form.get('narrationVolume');
          if (!(video instanceof Blob) || !(audio instanceof Blob) || ![startSeconds, videoVolume, narrationVolume].every(v => typeof v === 'string' && /^\d{1,4}(?:\.\d{1,6})?$/.test(v))) fail(400, 'invalid_form');
          output = await mixAudioMedia(Buffer.from(await video.arrayBuffer()), Buffer.from(await audio.arrayBuffer()), { startSeconds: Number(startSeconds), videoVolume: Number(videoVolume), narrationVolume: Number(narrationVolume), signal: controller.signal });
        } else {
        if ([...form.keys()].length !== 3 || !['source', 'ending', 'prefixSeconds'].every(key => form.getAll(key).length === 1)) fail(400, 'invalid_form');
        const source = form.get('source'); const ending = form.get('ending'); const prefix = form.get('prefixSeconds');
        if (!(source instanceof Blob) || !(ending instanceof Blob) || typeof prefix !== 'string' || !/^\d{1,4}(?:\.\d{1,17})?$/.test(prefix) || ![source, ending].every(blob => /^(video\/[a-z0-9.+-]+|application\/octet-stream)$/i.test(blob.type))) fail(400, 'invalid_form');
        output = await composeMedia(Buffer.from(await source.arrayBuffer()), Buffer.from(await ending.arrayBuffer()), Number(prefix), { signal: controller.signal });
        }
        if (!res.destroyed) res.writeHead(200, { ...headers, 'Content-Type': 'video/mp4', 'Content-Length': output.length }).end(output);
      }
    } catch (error) { json(error instanceof LocalMediaError ? error.status : 500, { error: error instanceof LocalMediaError ? error.code : 'local_processing_failed' }); }
    finally { clearTimeout(timer); req.removeListener('aborted', abort); res.removeListener('close', close); busy = false; }
    return true;
  };
}
