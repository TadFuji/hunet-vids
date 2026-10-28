import { StudioError } from './core.js';

// Input Blobs are mounted read-only with WORKERFS, never copied into MEMFS.
export const BROWSER_MEDIA_LIMITS = Object.freeze({ sourceBytes: 50 * 1024 ** 2, continuationBytes: 100 * 1024 ** 2, composeInputBytes: 150 * 1024 ** 2, outputBytes: 100 * 1024 ** 2, sourceSeconds: 60, continuationSeconds: 90, endingSeconds: 40, timeoutMs: 240000 });
const LIMIT = BROWSER_MEDIA_LIMITS;
const error = (kind = 'processing') => new StudioError(({ busy: 'ブラウザで別の動画を処理しています。完了してから再度お試しください。', cancelled: 'ブラウザでの動画処理を中止しました。元の動画は変更していません。', limit: 'ブラウザ処理は初回60秒・50MiB以下、継続90秒・100MiB以下、720p以下の動画に対応しています。', unsupported: '横16:9または縦9:16のMP4・MOV・WebM動画を選んでください。', processing: 'ブラウザで動画を処理できませんでした。元の動画は変更していません。短い動画で再試行してください。' })[kind], { uncertain: true });
function requireValue(value, kind) { if (!value) throw error(kind); }
function checkBlob(blob, max) { requireValue(blob instanceof Blob && blob.size > 0 && blob.size <= max, 'limit'); }
const input = (path, format) => ['-protocol_whitelist', 'file', '-format_whitelist', format, '-threads', '1', '-f', format, ...(format === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-i', path];
const encode = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-threads', '1'];
const scale = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p`;
const outPath = '/output.mp4';
const metaPath = '/metadata.json';

export function browserMediaSettings(width, height) {
  requireValue(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width >= 16 && height >= 16 && Math.min(width, height) <= 720 && Math.max(width, height) <= 1280, 'limit');
  const portrait = height > width;
  requireValue(Math.abs(Math.max(width, height) / Math.min(width, height) / (16 / 9) - 1) <= 0.025, 'unsupported');
  const short = Math.min(width, height);
  const preset = Math.abs(Math.log(short / 360)) <= Math.abs(Math.log(short / 720)) ? 360 : 720;
  const long = preset * 16 / 9;
  return { width: portrait ? preset : long, height: portrait ? long : preset, normalized: short !== preset || Math.max(width, height) !== long, settings: { aspectRatio: portrait ? '9:16' : '16:9', resolution: preset === 360 ? '360p' : '720p' } };
}
export function browserMediaMetadata(info, maxSeconds) {
  const streams = info?.streams;
  requireValue(Array.isArray(streams) && streams.length <= 16);
  const video = streams.find(s => s.codec_type === 'video');
  const seconds = Number(info?.format?.duration);
  requireValue(video && Number.isFinite(seconds) && seconds > 0 && seconds <= maxSeconds, 'limit');
  const videoSeconds = Number(video.duration);
  requireValue(!Number.isFinite(videoSeconds) || videoSeconds <= 0 || seconds - videoSeconds <= 0.1);
  let width = Number(video.width), height = Number(video.height);
  requireValue(!video.sample_aspect_ratio || ['1:1', '0:1', 'N/A'].includes(video.sample_aspect_ratio), 'unsupported');
  const rotation = Number(video.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  requireValue(Number.isFinite(rotation) && Math.abs(rotation / 90 - Math.round(rotation / 90)) <= 0.01, 'unsupported');
  if (Math.abs(Math.round(rotation / 90)) % 2) [width, height] = [height, width];
  browserMediaSettings(width, height);
  return { seconds, videoSeconds: Number.isFinite(videoSeconds) && videoSeconds > 0 ? videoSeconds : seconds, width, height, hasAudio: streams.some(s => s.codec_type === 'audio') };
}
async function container(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return 'mov';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'matroska';
  throw error('unsupported');
}
const factory = async () => { const { FFmpeg } = await import('./vendor/ffmpeg/ffmpeg/index.js'); return new FFmpeg(); };

// createFFmpeg and timeoutMs allow offline lifecycle tests; production uses the
// pinned, same-origin vendor distribution and the bounded timeout above.
export function createBrowserMedia({ onState = () => {}, createFFmpeg = factory, timeoutMs = LIMIT.timeoutMs } = {}) {
  let engine = null, ready = false, active = null, disposed = false;
  const state = (phase, progress) => { try { onState({ phase, busy: !['ready', 'cancelled', 'error', 'idle'].includes(phase), ...(Number.isFinite(progress) ? { progress: Math.min(1, Math.max(0, progress)) } : {}) }); } catch {} };
  const terminate = () => { const previous = engine; engine = null; ready = false; try { previous?.terminate(); } catch {} };
  const cancel = () => { if (!active) return; const reject = active.reject; active.stopped = true; active.cancelled = true; terminate(); reject(error('cancelled')); state('cancelled'); };
  async function operation(work, phase = 'checking') {
    requireValue(!disposed);
    if (active) throw error('busy');
    const token = { phase: 'checking' }; active = token;
    let timer;
    const stopped = new Promise((_, reject) => { token.reject = reject; timer = setTimeout(() => { token.stopped = true; terminate(); reject(error()); }, Math.min(LIMIT.timeoutMs, Math.max(1, timeoutMs))); });
    const check = () => requireValue(active === token && !token.stopped && engine);
    try {
      const result = await Promise.race([(async () => {
        if (!engine) {
          state('loading');
          const created = await createFFmpeg();
          if (active !== token || token.stopped) { try { created.terminate(); } catch {} throw error('cancelled'); }
          engine = created;
          // Deliberately do not subscribe to ffmpeg log events: they may contain
          // untrusted metadata. Only numeric progress can leave this module.
          engine.on?.('progress', ({ progress }) => { if (engine === created && active && !active.stopped) state(active.phase, progress); });
          await engine.load({ classWorkerURL: new URL('./vendor/ffmpeg/ffmpeg/worker.js', import.meta.url).href, coreURL: new URL('./vendor/ffmpeg/core/ffmpeg-core.js', import.meta.url).href, wasmURL: new URL('./vendor/ffmpeg/core/ffmpeg-core.wasm', import.meta.url).href }); check();
        }
        const ff = engine;
        const files = new Set(); let mounted = false, directory = false;
        const call = async (method, ...args) => { check(); const result = await ff[method](...args); check(); return result; };
        const exec = async args => { files.add(outPath); const code = await call('exec', ['-v', 'error', '-nostdin', '-y', ...args], LIMIT.timeoutMs); requireValue(code === 0); };
        const probe = async (path, format, maxSeconds) => {
          // Pinned core 0.12.10 discards _ffprobe's C return value and reports
          // Module.ret (-1) on normal return (release bind.js:67 / ffprobe.c:4227).
          // Do not treat -1 itself as success: require a newly created complete
          // JSON result without an error section, then validate every used field.
          const before = await call('listDir', '/'); requireValue(Array.isArray(before));
          if (before.some(entry => entry.name === 'metadata.json')) await call('deleteFile', metaPath);
          const cleared = await call('listDir', '/');
          requireValue(Array.isArray(cleared) && !cleared.some(entry => entry.name === 'metadata.json'));
          files.add(metaPath);
          const code = await call('ffprobe', ['-v', 'error', ...input(path, format), '-show_error', '-show_entries', 'error=code:format=duration:stream=codec_type,width,height,duration,sample_aspect_ratio:stream_tags=rotate:stream_side_data=rotation', '-of', 'json', '-o', metaPath], LIMIT.timeoutMs);
          requireValue(code === 0 || code === -1);
          const data = await call('readFile', metaPath); requireValue(data.byteLength > 0 && data.byteLength <= 65536);
          let info; try { info = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); } catch { throw error(); }
          requireValue(info && typeof info === 'object' && !Array.isArray(info) && !Object.hasOwn(info, 'error'));
          return browserMediaMetadata(info, maxSeconds);
        };
        const output = async (expected, maxSeconds, width, height, audio) => {
          const meta = await probe(outPath, 'mov', maxSeconds);
          requireValue(meta.width === width && meta.height === height && Math.abs(meta.seconds - expected) <= 0.1 && (audio === undefined || meta.hasAudio === audio));
          const bytes = await call('readFile', outPath); requireValue(bytes.byteLength > 0 && bytes.byteLength <= LIMIT.outputBytes, 'limit');
          return { blob: new Blob([bytes], { type: 'video/mp4' }), actualSeconds: meta.seconds, meta };
        };
        const mount = async blobs => {
          await call('createDir', '/input'); directory = true;
          requireValue(await call('mount', 'WORKERFS', { blobs: blobs.map((data, index) => ({ name: `media${index}`, data })) }, '/input'));
          mounted = true;
        };
        try {
          if (!ready) {
            state('checking');
            await exec(['-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=24:d=0.125', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '0.125', ...encode, '-fs', '1048576', outPath]);
            const sample = await output(0.125, 1, 640, 360, true);
            await mount([sample.blob]);
            const mountedSample = await probe('/input/media0', 'mov', 1);
            requireValue(mountedSample.width === 640 && mountedSample.height === 360 && mountedSample.hasAudio && Math.abs(mountedSample.seconds - 0.125) <= 0.1);
            await call('unmount', '/input'); mounted = false;
            await call('deleteDir', '/input'); directory = false;
            await call('deleteFile', outPath); files.delete(outPath);
            ready = true;
          }
          token.phase = phase; state(phase);
          return await work({ exec, probe, output, mount, check });
        } finally {
          // Termination releases all mounts/MEMFS at once; otherwise remove each
          // resource before accepting another operation. Cleanup failure resets.
          if (engine === ff) {
            try {
              if (mounted) await ff.unmount('/input');
              if (directory) await ff.deleteDir('/input');
              for (const path of files) await ff.deleteFile(path);
            } catch { terminate(); }
          }
        }
      })(), stopped]);
      state('ready'); return result;
    } catch (cause) {
      terminate(); state(token.cancelled ? 'cancelled' : 'error');
      if (cause instanceof StudioError) throw cause;
      throw error();
    } finally { token.stopped = true; clearTimeout(timer); if (active === token) active = null; }
  }
  async function prepare(blob, continuation) {
    checkBlob(blob, continuation ? LIMIT.continuationBytes : LIMIT.sourceBytes);
    return operation(async ({ mount, probe, exec, output }) => {
      const format = await container(blob); await mount([blob]);
      const meta = await probe('/input/media0', format, continuation ? LIMIT.continuationSeconds : LIMIT.sourceSeconds);
      const config = browserMediaSettings(meta.width, meta.height);
      const tailSeconds = Math.floor(Math.min(10, meta.seconds) * 24) / 24;
      requireValue(tailSeconds >= 1 / 24);
      const prefixSeconds = meta.seconds - tailSeconds;
      await exec(['-ss', String(prefixSeconds), ...input('/input/media0', format), '-map', '0:v:0', '-map', '0:a:0?', '-vf', scale(config.width, config.height), '-af', `atrim=duration=${tailSeconds},asetpts=PTS-STARTPTS`, '-t', String(tailSeconds), ...encode, '-fs', String(LIMIT.outputBytes - 1048576), outPath]);
      const result = await output(tailSeconds, 10, config.width, config.height, meta.hasAudio);
      requireValue(Math.abs(result.actualSeconds - tailSeconds) <= 0.05);
      return { continuation, originalBlob: blob, tailBlob: result.blob, name: '選択した動画', sourceSeconds: meta.seconds, tailSeconds: result.actualSeconds, prefixSeconds, sourceWidth: meta.width, sourceHeight: meta.height, hasAudio: result.meta.hasAudio, ...config };
    }, 'preparing');
  }
  async function trimVideo(blob, seconds, { aspectRatio } = {}) {
    checkBlob(blob, LIMIT.sourceBytes);
    requireValue(['16:9', '9:16'].includes(aspectRatio) && Number.isFinite(seconds) && seconds >= 1 / 24 && seconds <= LIMIT.endingSeconds);
    return operation(async ({ mount, probe, exec, output }) => {
      const format = await container(blob); requireValue(format === 'mov', 'unsupported'); await mount([blob]);
      const meta = await probe('/input/media0', format, LIMIT.endingSeconds);
      requireValue(seconds <= meta.seconds && browserMediaSettings(meta.width, meta.height).settings.aspectRatio === aspectRatio && meta.width % 2 === 0 && meta.height % 2 === 0);
      const frames = Math.floor(Math.min(seconds, meta.videoSeconds) * 24 + 1e-5);
      await exec([...input('/input/media0', format), '-map', '0:v:0', '-map', '0:a:0?', '-vf', `fps=24,trim=end_frame=${frames},setpts=PTS-STARTPTS,setsar=1,format=yuv420p`, '-af', `atrim=duration=${seconds},asetpts=PTS-STARTPTS`, '-t', String(seconds), ...encode, '-fs', String(LIMIT.outputBytes - 1048576), outPath]);
      const result = await output(seconds, Math.min(meta.seconds, LIMIT.endingSeconds), meta.width, meta.height, meta.hasAudio);
      requireValue(result.meta.videoSeconds <= meta.videoSeconds);
      return { blob: result.blob, actualSeconds: result.actualSeconds };
    }, 'trimming');
  }
  async function composeSource(source, ending, expectedSeconds) {
    checkBlob(source?.originalBlob, LIMIT.continuationBytes); checkBlob(ending, LIMIT.sourceBytes);
    requireValue(source.originalBlob.size + ending.size <= LIMIT.composeInputBytes && Number.isFinite(expectedSeconds) && expectedSeconds > 0 && expectedSeconds <= LIMIT.continuationSeconds, 'limit');
    const prefix = source.prefixSeconds;
    requireValue(Number.isFinite(prefix) && prefix >= 0 && ['16:9', '9:16'].includes(source.settings?.aspectRatio));
    return operation(async ({ mount, probe, exec, output }) => {
      const sourceFormat = await container(source.originalBlob), endingFormat = await container(ending); await mount([source.originalBlob, ending]);
      const src = await probe('/input/media0', sourceFormat, LIMIT.continuationSeconds), end = await probe('/input/media1', endingFormat, LIMIT.endingSeconds);
      const config = browserMediaSettings(src.width, src.height);
      requireValue(config.settings.aspectRatio === source.settings.aspectRatio && config.settings.aspectRatio === browserMediaSettings(end.width, end.height).settings.aspectRatio);
      const expectedPrefix = src.seconds - Math.floor(Math.min(10, src.seconds) * 24) / 24;
      requireValue(Math.abs(expectedPrefix - prefix) <= 0.001 && Math.abs(expectedSeconds - prefix - end.seconds) <= 0.1 && prefix + end.seconds <= LIMIT.continuationSeconds);
      const filters = [];
      const segment = (index, duration, audio) => {
        filters.push(`[${index}:v:0]trim=duration=${duration},setpts=PTS-STARTPTS,${scale(config.width, config.height)}[v${index}]`);
        filters.push(audio ? `[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[a${index}]` : `anullsrc=r=48000:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[a${index}]`);
      };
      if (prefix > 0) { segment(0, prefix, src.hasAudio); segment(1, end.seconds, end.hasAudio); filters.push('[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]'); }
      else { segment(1, end.seconds, end.hasAudio); filters.push('[v1]null[v]', '[a1]anull[a]'); }
      await exec([...input('/input/media0', sourceFormat), ...input('/input/media1', endingFormat), '-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-t', String(prefix + end.seconds), ...encode, '-fs', String(LIMIT.outputBytes - 1048576), outPath]);
      const result = await output(expectedSeconds, LIMIT.continuationSeconds, config.width, config.height, true);
      return { blob: result.blob, actualSeconds: result.actualSeconds };
    }, 'composing');
  }
  async function mixAudio(videoBlob, audioBlob, { startSeconds = 0, videoVolume = 1, narrationVolume = 1, aspectRatio, expectedSeconds } = {}) {
    checkBlob(videoBlob, LIMIT.continuationBytes); checkBlob(audioBlob, LIMIT.sourceBytes);
    requireValue(['16:9', '9:16'].includes(aspectRatio) && Number.isFinite(startSeconds) && startSeconds >= 0 && Number.isFinite(videoVolume) && videoVolume >= 0 && videoVolume <= 2 && Number.isFinite(narrationVolume) && narrationVolume > 0 && narrationVolume <= 2);
    return operation(async ({ mount, probe, exec, output }) => {
      const format = await container(videoBlob);
      const wavHeader = new Uint8Array(await audioBlob.slice(0, 12).arrayBuffer());
      requireValue(wavHeader.length >= 12 && String.fromCharCode(...wavHeader.slice(0, 4)) === 'RIFF' && String.fromCharCode(...wavHeader.slice(8, 12)) === 'WAVE', 'unsupported');
      await mount([videoBlob, audioBlob]);
      const meta = await probe('/input/media0', format, LIMIT.continuationSeconds);
      const config = browserMediaSettings(meta.width, meta.height);
      requireValue(config.settings.aspectRatio === aspectRatio && startSeconds < meta.seconds && (!Number.isFinite(expectedSeconds) || Math.abs(meta.seconds - expectedSeconds) <= 0.1));
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
      await exec([...input('/input/media0', format), ...input('/input/media1', 'wav'), '-filter_complex_threads', '1', '-filter_complex', filter, ...videoArgs, '-t', String(dur), '-fs', String(LIMIT.outputBytes - 1048576), outPath]);
      const result = await output(dur, LIMIT.continuationSeconds, canCopyVideo ? meta.width : config.width, canCopyVideo ? meta.height : config.height, true);
      return { blob: result.blob, actualSeconds: result.actualSeconds };
    }, 'composing');
  }
  return { prepareSource: blob => prepare(blob, false), prepareContinuation: blob => prepare(blob, true), composeSource, trimVideo, mixAudio, ensureReady: () => operation(async () => ({ ready: true, limits: LIMIT })), cancel, dispose() { disposed = true; cancel(); terminate(); state('idle'); } };
}
