import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createAppServer } from '../server.mjs';
import { prepareMedia, composeMedia, trimMedia, resolveSettings, preparationLimits, LIMITS, runMediaTool } from '../local-media.mjs';
const exec = promisify(execFile); const ffmpeg = '/opt/homebrew/bin/ffmpeg'; const ffprobe = '/opt/homebrew/bin/ffprobe';
let dir, source, ending, silent, portrait, rotated, server, port;
async function make(name, duration, size, color, audio = true) {
  const path = join(dir, name);
  await exec(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:r=24:d=${duration}`, ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=${color === 'red' ? 440 : 880}:sample_rate=48000:duration=${duration}`] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac'] : []), '-t', String(duration), path]);
  return readFile(path);
}
async function metadata(bytes, name) {
  const { writeFile } = await import('node:fs/promises'); const path = join(dir, name); await writeFile(path, bytes);
  const { stdout } = await exec(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]); return { ...JSON.parse(stdout), path };
}
function request(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers, agent: false }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }); req.on('error', error => { error.message += ` for ${method} ${path} ${headers['Content-Type'] || ''}`; reject(error); }); req.end(body);
  });
}
const localHeaders = () => ({ Origin: `http://127.0.0.1:${port}`, 'x-omni-local': '1', 'Content-Type': 'video/mp4', 'Sec-Fetch-Site': 'same-origin' });
const tempNames = async () => (await readdir(tmpdir())).filter(n => n.startsWith('omni-local-media-')).sort();
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'omni-test-'));
  source = await make('source.mp4', 60, '640x360', 'red'); ending = await make('ending.mp4', 20, '640x360', 'blue');
  silent = await make('silent.mp4', 2, '640x360', 'blue', false); portrait = await make('portrait.mp4', 2, '360x640', 'red');
  await exec(ffmpeg, ['-v', 'error', '-y', '-display_rotation:v:0', '90', '-i', join(dir, 'portrait.mp4'), '-c', 'copy', join(dir, 'rotated.mp4')]); rotated = await readFile(join(dir, 'rotated.mp4'));
  server = createAppServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); port = server.address().port;
});
after(async () => { if (server?.listening) await new Promise(resolve => server.close(resolve)); if (dir) await rm(dir, { recursive: true, force: true }); });

test('60s source yields <=10s tail and a complete 70s composition with both audio segments', async () => {
  const beforeDirs = await tempNames(); const prepared = await prepareMedia(source);
  assert.equal(prepared.sourceSeconds, 60); assert.equal(prepared.tailSeconds, 10); assert.equal(prepared.prefixSeconds, 50);
  assert.deepEqual(prepared.settings, { aspectRatio: '16:9', resolution: '360p' }); assert.equal(prepared.normalized, false);
  const tail = await metadata(Buffer.from(prepared.tailBase64, 'base64'), 'tail-result.mp4'); assert.ok(Number(tail.format.duration) <= 10);
  const output = await composeMedia(source, ending, prepared.prefixSeconds); const info = await metadata(output, 'compose-result.mp4');
  assert.ok(Math.abs(Number(info.format.duration) - 70) < 0.1); assert.equal(info.streams.find(s => s.codec_type === 'video').r_frame_rate, '24/1');
  assert.equal(info.streams.find(s => s.codec_type === 'audio').codec_name, 'aac');
  for (const [time, channel] of [[49, 0], [51, 2]]) {
    const { stdout } = await exec(ffmpeg, ['-v', 'error', '-ss', String(time), '-i', info.path, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
    assert.ok(stdout[channel] > 180, `expected segment color at ${time}s`);
    const pcm = await exec(ffmpeg, ['-v', 'error', '-ss', String(time), '-i', info.path, '-t', '0.2', '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', 'pipe:1'], { encoding: 'buffer' });
    let crossings = 0; for (let i = 2; i < pcm.stdout.length; i += 2) if (pcm.stdout.readInt16LE(i - 2) <= 0 && pcm.stdout.readInt16LE(i) > 0) crossings++;
    assert.ok(Math.abs(crossings / 0.2 - (time === 49 ? 440 : 880)) < 25, 'each segment retains its own sound');
  }
  assert.deepEqual(await tempNames(), beforeDirs);
});

test('portrait and rotation metadata normalize to the displayed orientation', async () => {
  const p = await prepareMedia(portrait); assert.equal(p.width, 360); assert.equal(p.height, 640); assert.equal(p.settings.aspectRatio, '9:16');
  const r = await prepareMedia(rotated); assert.equal(r.width, 640); assert.equal(r.height, 360); assert.equal(r.settings.aspectRatio, '16:9');
  const rotatedTail = await metadata(Buffer.from(r.tailBase64, 'base64'), 'rotated-tail.mp4');
  const video = rotatedTail.streams.find(s => s.codec_type === 'video');
  assert.equal(video.width, 640); assert.equal(video.height, 360);
  assert.equal(Number(video.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? 0), 0);
  assert.equal(resolveSettings(854, 480).normalized, true); assert.equal(resolveSettings(854, 480).settings.resolution, '360p');
  assert.throws(() => resolveSettings(512, 512), /unsupported_aspect_ratio/);
  assert.throws(() => resolveSettings(512, 510), /unsupported_aspect_ratio/);
});

test('missing ending audio is filled with silence and short source supports zero prefix', async () => {
  const output = await composeMedia(source, silent, 50); const info = await metadata(output, 'silence-result.mp4');
  assert.ok(Math.abs(Number(info.format.duration) - 52) < 0.1); assert.ok(info.streams.some(s => s.codec_type === 'audio'));
  const short = await composeMedia(silent, ending, 0); assert.ok(Math.abs(Number((await metadata(short, 'short-result.mp4')).format.duration) - 20) < 0.1);
});

test('invalid media, playlist, arbitrary prefix, aborted processing leave no temporary files', async () => {
  const beforeDirs = await tempNames();
  await assert.rejects(prepareMedia(Buffer.from('#EXTM3U\nhttp://example.com/secret')), /unsupported_container/);
  await assert.rejects(prepareMedia(Buffer.from('0000ftypbroken')), /invalid_media/);
  await assert.rejects(composeMedia(source, ending, 49), /invalid_prefix/);
  const controller = new AbortController(); controller.abort(); await assert.rejects(prepareMedia(source, { signal: controller.signal }), /processing_cancelled/);
  assert.deepEqual(await tempNames(), beforeDirs);
});

test('local routes enforce origin, host, method, custom header, types, bounds, fields and security headers', async () => {
  const caps = await request('/local-media/capabilities'); assert.equal(caps.status, 200); assert.equal(JSON.parse(caps.body).supported, true); assert.equal(caps.headers['cache-control'], 'no-store'); assert.equal(caps.headers['x-content-type-options'], 'nosniff'); assert.equal(caps.headers['access-control-allow-origin'], undefined);
  for (const headers of [{}, { ...localHeaders(), Origin: 'https://evil.example' }, { ...localHeaders(), Host: 'evil.example' }, { ...localHeaders(), 'Sec-Fetch-Site': 'cross-site' }, { ...localHeaders(), 'x-omni-local': '0' }]) assert.equal((await request('/local-media/prepare', { method: 'POST', headers, body: Buffer.from('invalid') })).status, 403);
  assert.equal((await request('/local-media/prepare', { headers: localHeaders() })).status, 405);
  assert.equal((await request('/local-media/capabilities', { method: 'POST', headers: localHeaders() })).status, 405);
  assert.equal((await request('/local-media/prepare', { method: 'POST', headers: { ...localHeaders(), 'Content-Type': 'text/plain' }, body: 'bad' })).status, 415);
  assert.equal((await request('/local-media/prepare', { method: 'POST', headers: { ...localHeaders(), 'Content-Length': LIMITS.prepareBytes + 1 } })).status, 413);
  assert.equal((await request('/local-media/prepare', { method: 'POST', headers: { ...localHeaders(), Authorization: 'test-placeholder' }, body: 'bad' })).status, 400);
  const traversal = await request('/%2e%2e%2fserver.mjs'); assert.equal(traversal.status, 403);
  assert.equal((await request('/local-media/compose', { method: 'POST', headers: { ...localHeaders(), 'Content-Type': 'multipart/form-data; boundary=test' }, body: '--test--\r\n' })).status, 400);
  const prepared = await request('/local-media/prepare', { method: 'POST', headers: localHeaders(), body: silent }); assert.equal(prepared.status, 200);
  const form = new FormData(); form.set('source', new Blob([silent], { type: 'video/mp4' }), '../../outside.mp4'); form.set('ending', new Blob([ending], { type: 'video/mp4' }), '/tmp/outside.mp4'); form.set('prefixSeconds', '0');
  const encoded = new Request('http://localhost', { method: 'POST', body: form });
  const composed = await request('/local-media/compose', { method: 'POST', headers: { ...localHeaders(), 'Content-Type': encoded.headers.get('content-type') }, body: Buffer.from(await encoded.arrayBuffer()) });
  assert.equal(composed.status, 200, composed.body.toString()); assert.equal(composed.headers['content-type'], 'video/mp4');
});


test('serial handler rejects concurrent work and aborted uploads release the processing lock', async () => {
  const pending = http.request({ host: '127.0.0.1', port, path: '/local-media/prepare', method: 'POST', agent: false, headers: localHeaders() });
  pending.on('error', () => {}); pending.write(source.subarray(0, 64));
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal((await request('/local-media/prepare', { method: 'POST', headers: localHeaders(), body: silent })).status, 429);
  pending.destroy(); await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal((await request('/local-media/prepare', { method: 'POST', headers: localHeaders(), body: silent })).status, 200);
});

test('subprocess deadline terminates a running ffmpeg and prepare abort cleans temporary files', async () => {
  await assert.rejects(runMediaTool(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=640x360:r=24', '-f', 'null', '-'], { timeout: 25 }), /processing_timeout/);
  const names = await tempNames(); const controller = new AbortController();
  const preparing = prepareMedia(source, { signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(preparing, /processing_timeout|processing_cancelled/);
  assert.deepEqual(await tempNames(), names);
});


test('trim retains the start, synchronized audio and fractional/1s/2s lengths without changing input', async () => {
  const original = Buffer.from(ending); const names = await tempNames();
  for (const seconds of [1, 2, 10.984, 19.984]) {
    const output = await trimMedia(ending, seconds); const info = await metadata(output, `trim-${seconds}.mp4`);
    assert.ok(Math.abs(Number(info.format.duration) - seconds) <= 0.1);
    assert.ok(Number(info.format.duration) <= 20);
    const v = info.streams.find(s => s.codec_type === 'video'); const a = info.streams.find(s => s.codec_type === 'audio');
    assert.equal(v.codec_name, 'h264'); assert.equal(a.codec_name, 'aac');
    assert.ok(Math.abs(Number(v.duration) - Number(a.duration)) <= 0.05, 'track durations stay synchronized');
    assert.equal(Number(v.start_time), 0); assert.equal(Number(a.start_time), 0);
  }
  const fractional = await trimMedia(ending, 10.984);
  const repeated = await metadata(await trimMedia(fractional, 10.984), 'repeated-trim.mp4');
  assert.ok(Math.abs(Number(repeated.format.duration) - 10.984) <= 0.1, 'AAC/container fraction does not block re-trimming');
  const forty = await metadata(await trimMedia(source, 40), 'trim-forty.mp4');
  assert.equal(Number(forty.format.duration), 40);
  assert.deepEqual(ending, original);
  // Distinct content after 2s proves this operation keeps the beginning, rather than the tail.
  const joined = join(dir, 'trim-start-source.mp4');
  await exec(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=24:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=24:d=2', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast', joined]);
  const trimmed = await metadata(await trimMedia(await readFile(joined), 1), 'start-only.mp4');
  const { stdout } = await exec(ffmpeg, ['-v', 'error', '-ss', '0.5', '-i', trimmed.path, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
  assert.ok(stdout[0] > 180 && stdout[2] < 30);
  assert.equal(trimmed.streams.some(s => s.codec_type === 'audio'), false, 'silent input remains silent');
  assert.deepEqual(await tempNames(), names);
});

test('trim refuses short input and invalid durations, and cleans aborted processing', async () => {
  const names = await tempNames();
  for (const seconds of [0, -1, NaN, Infinity, 40.001]) await assert.rejects(trimMedia(ending, seconds), /invalid_trim_duration/);
  await assert.rejects(trimMedia(silent, 2.001), /source_too_short/);
  await assert.rejects(trimMedia(Buffer.from('#EXTM3U\nhttps://example.com'), 1), /unsupported_container/);
  const controller = new AbortController(); const pending = trimMedia(ending, 1, { signal: controller.signal }); setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, /processing_timeout|processing_cancelled/);
  assert.deepEqual(await tempNames(), names);
});

async function trimRequest(fields, extra = {}) {
  const form = new FormData();
  for (const [key, value] of fields) form.append(key, value);
  const encoded = new Request('http://localhost', { method: 'POST', body: form });
  return request('/local-media/trim', { method: 'POST', headers: { ...localHeaders(), 'Content-Type': encoded.headers.get('content-type'), ...extra }, body: Buffer.from(await encoded.arrayBuffer()) });
}
test('trim route requires local authorization, exact multipart fields and bounded media', async () => {
  const media = new Blob([ending], { type: 'video/mp4' }); const valid = [['media', media], ['seconds', '10.984']];
  const response = await trimRequest(valid); assert.equal(response.status, 200); assert.equal(response.headers['content-type'], 'video/mp4'); assert.equal(response.headers['cache-control'], 'no-store');
  assert.ok(Math.abs(Number((await metadata(response.body, 'route-trim.mp4')).format.duration) - 10.984) <= 0.1);
  assert.equal((await trimRequest(valid, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await trimRequest(valid, { 'x-omni-local': '0' })).status, 403);
  assert.equal((await request('/local-media/trim', { headers: localHeaders() })).status, 405);
  for (const fields of [[...valid, ['apiKey', 'synthetic']], [...valid, ['seconds', '1']], [['media', media], ['seconds', 'Infinity']], [['media', media], ['seconds', '1;rm']], [['media', new Blob([ending], { type: 'text/plain' })], ['seconds', '1']]]) assert.equal((await trimRequest(fields)).status, 400);
  assert.equal((await trimRequest([['media', new Blob([silent], { type: 'video/mp4' })], ['seconds', '3']])).status, 422);
  assert.equal((await request('/local-media/trim', { method: 'POST', headers: { ...localHeaders(), 'Content-Type': 'multipart/form-data; boundary=test', 'Content-Length': LIMITS.prepareBytes + 16385 } })).status, 413);
});

test('trimVideo uses only local multipart bytes and verifies actual output before acceptance', async () => {
  const { trimVideo } = await import('../dist/local-media-client.js');
  const savedFetch = globalThis.fetch; const savedDocument = globalThis.document;
  const input = new Blob([ending], { type: 'video/mp4' }); const resultBlob = new Blob([silent], { type: 'video/mp4' });
  let durations = []; let calls = 0;
  globalThis.document = { createElement() { return { duration: NaN, videoWidth: 640, videoHeight: 360, removeAttribute() {}, load() {}, set src(value) { this.duration = durations.shift(); queueMicrotask(() => this.onloadedmetadata()); } }; } };
  globalThis.fetch = async (path, options) => {
    calls++; assert.equal(path, '/local-media/trim'); assert.equal(options.method, 'POST'); assert.equal(options.headers['x-omni-local'], '1'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.deepEqual([...options.body.keys()], ['media', 'seconds']); assert.equal(options.body.get('seconds'), '1');
    assert.equal(options.body.get('media').size, input.size);
    return new Response(resultBlob, { headers: { 'Content-Type': 'video/mp4' } });
  };
  try {
    durations = [20, 1]; const result = await trimVideo(input, 1, { aspectRatio: '16:9' }); assert.equal(result.actualSeconds, 1); assert.equal(result.blob.type, 'video/mp4');
    durations = [20, 1.2]; await assert.rejects(trimVideo(input, 1, { aspectRatio: '16:9' }));
    durations = [0.9]; await assert.rejects(trimVideo(input, 1, { aspectRatio: '16:9' })); assert.equal(calls, 2, 'short input never reaches processing endpoint');
    await assert.rejects(trimVideo(input, 41, { aspectRatio: '16:9' })); assert.equal(calls, 2);
    assert.equal(input.size, ending.length);
  } finally { globalThis.fetch = savedFetch; if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument; }
});


test('continuation preparation has distinct bounded limits and accepts a tiny 1201s fixture', async () => {
  assert.deepEqual(preparationLimits(), { bytes: 200 * 1024 * 1024, seconds: 1200 });
  assert.deepEqual(preparationLimits(true), { bytes: 400 * 1024 * 1024, seconds: 1240 });
  assert.equal(LIMITS.composeInputBytes, 600 * 1024 * 1024); assert.equal(LIMITS.composeBytes, 400 * 1024 * 1024);
  const names = await tempNames();
  for (const seconds of [1201, 1241]) {
    const path = join(dir, `long-${seconds}.mp4`);
    await exec(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=red:s=160x90:r=1:d=${seconds}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-t', String(seconds), path]);
    const bytes = await readFile(path); assert.ok(bytes.length < 1024 * 1024, 'long-duration fixture stays tiny');
    await assert.rejects(prepareMedia(bytes), /invalid_duration/);
    if (seconds === 1201) {
      const prepared = await prepareMedia(bytes, { continuation: true });
      assert.equal(prepared.sourceSeconds, 1201); assert.equal(prepared.prefixSeconds, 1191); assert.ok(prepared.tailSeconds <= 10); assert.equal(prepared.continuation, true);
      await assert.rejects(composeMedia(bytes, ending, 1190), /invalid_prefix/, 'compose accepts continuation duration before validating its prefix');
      const response = await request('/local-media/prepare-continuation', { method: 'POST', headers: localHeaders(), body: bytes });
      assert.equal(response.status, 200); assert.equal(JSON.parse(response.body).sourceSeconds, 1201);
    } else await assert.rejects(prepareMedia(bytes, { continuation: true }), /invalid_duration/);
  }
  for (const [path, max, type] of [['/local-media/prepare', LIMITS.prepareBytes, 'video/mp4'], ['/local-media/prepare-continuation', LIMITS.continuationBytes, 'video/mp4'], ['/local-media/compose', LIMITS.composeInputBytes + 16384, 'multipart/form-data; boundary=test']]) {
    assert.equal((await request(path, { method: 'POST', headers: { ...localHeaders(), 'Content-Type': type, 'Content-Length': max + 1 } })).status, 413);
  }
  assert.equal((await request('/local-media/prepare-continuation', { method: 'POST', headers: { ...localHeaders(), Origin: 'https://example.com' }, body: ending })).status, 403);
  const caps = JSON.parse((await request('/local-media/capabilities')).body);
  assert.equal(caps.maxContinuationSeconds, 1240); assert.equal(caps.maxContinuationBytes, LIMITS.continuationBytes); assert.equal(caps.maxComposeInputBytes, LIMITS.composeInputBytes);
  assert.deepEqual(await tempNames(), names);
});

test('prepareContinuation client uses the distinct route and validates continuation size and duration', async () => {
  const { prepareSource, prepareContinuation } = await import('../dist/local-media-client.js');
  const savedFetch = globalThis.fetch; const savedDocument = globalThis.document;
  let sourceSeconds = 1201; let tailSeconds = 10; let calls = 0;
  const tiny = new Blob([ending], { type: 'video/mp4' });
  const large = new Blob([ending], { type: 'video/mp4' }); Object.defineProperty(large, 'size', { value: 201 * 1024 * 1024 });
  const tooLarge = new Blob([ending], { type: 'video/mp4' }); Object.defineProperty(tooLarge, 'size', { value: 400 * 1024 * 1024 + 1 });
  globalThis.document = { createElement() { return { duration: 10, videoWidth: 640, videoHeight: 360, removeAttribute() {}, load() {}, set src(value) { queueMicrotask(() => this.onloadedmetadata()); } }; } };
  globalThis.fetch = async (path, options) => {
    calls++; assert.equal(path, '/local-media/prepare-continuation'); assert.equal(options.headers['x-omni-local'], '1'); assert.equal(options.credentials, 'omit');
    return Response.json({ sourceSeconds, tailSeconds, prefixSeconds: sourceSeconds - tailSeconds, tailBase64: ending.toString('base64'), settings: { aspectRatio: '16:9', resolution: '360p' } });
  };
  try {
    await assert.rejects(prepareSource(large)); assert.equal(calls, 0);
    const result = await prepareContinuation(large); assert.equal(result.originalBlob, large); assert.equal(result.sourceSeconds, 1201); assert.equal(result.continuation, true);
    await assert.rejects(prepareContinuation(tooLarge)); assert.equal(calls, 1);
    sourceSeconds = 1240; assert.equal((await prepareContinuation(tiny)).sourceSeconds, 1240);
    sourceSeconds = 1240.001; await assert.rejects(prepareContinuation(tiny));
    sourceSeconds = 1201; tailSeconds = 10.001; await assert.rejects(prepareContinuation(tiny));
  } finally { globalThis.fetch = savedFetch; if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument; }
});

test('square media is rejected by prepare, continuation, trim and compose without changing the original', async () => {
  const names = await tempNames(); const square = await make('rejected-square.mp4', 2, '360x360', 'red'); const original = Buffer.from(square);
  await assert.rejects(prepareMedia(square), /unsupported_aspect_ratio/);
  await assert.rejects(prepareMedia(square, { continuation: true }), /unsupported_aspect_ratio/);
  await assert.rejects(trimMedia(square, 1), /unsupported_aspect_ratio/);
  await assert.rejects(composeMedia(square, ending, 0), /unsupported_aspect_ratio/);
  await assert.rejects(composeMedia(source, square, 50), /unsupported_aspect_ratio/);
  await assert.rejects(composeMedia(square, square, 0), /unsupported_aspect_ratio/);
  for (const path of ['/local-media/prepare', '/local-media/prepare-continuation']) {
    const response = await request(path, { method: 'POST', headers: localHeaders(), body: square });
    assert.equal(response.status, 422); assert.equal(JSON.parse(response.body).error, 'unsupported_aspect_ratio');
  }
  const response = await trimRequest([['media', new Blob([square], { type: 'video/mp4' })], ['seconds', '1']]);
  assert.equal(response.status, 422);
  assert.deepEqual(JSON.parse((await request('/local-media/capabilities')).body).aspectRatios, ['16:9', '9:16']);
  assert.deepEqual(square, original); assert.deepEqual(await tempNames(), names);
});

test('portrait client verifies prepare, trimmed and composed output dimensions instead of silently accepting landscape', async () => {
  const { prepareSource, trimVideo, composeSource } = await import('../dist/local-media-client.js');
  const savedFetch = globalThis.fetch; const savedDocument = globalThis.document;
  const input = new Blob([ending], { type: 'video/mp4' }); let sizes = []; let duration = 1; let route = ''; let calls = 0;
  globalThis.document = { createElement() { const [videoWidth, videoHeight] = sizes.shift(); return { videoWidth, videoHeight, duration, removeAttribute() {}, load() {}, set src(value) { queueMicrotask(() => this.onloadedmetadata()); } }; } };
  globalThis.fetch = async (path, options) => {
    calls++; assert.equal(path, route);
    if (route === '/local-media/prepare') return Response.json({ sourceSeconds: 1, tailSeconds: 1, prefixSeconds: 0, tailBase64: ending.toString('base64'), settings: { aspectRatio: '9:16', resolution: '360p' } });
    return new Response(input, { headers: { 'Content-Type': 'video/mp4' } });
  };
  try {
    route = '/local-media/prepare'; sizes = [[360, 640]]; assert.equal((await prepareSource(input)).settings.aspectRatio, '9:16');
    sizes = [[640, 360]]; await assert.rejects(prepareSource(input));
    route = '/local-media/trim'; sizes = [[360, 640], [360, 640]]; assert.equal((await trimVideo(input, 1, { aspectRatio: '9:16' })).actualSeconds, 1);
    sizes = [[360, 640], [640, 360]]; await assert.rejects(trimVideo(input, 1, { aspectRatio: '9:16' }));
    const before = calls; sizes = [[640, 360]]; await assert.rejects(trimVideo(input, 1, { aspectRatio: '9:16' })); assert.equal(calls, before, 'wrong source ratio never reaches the trim endpoint');
    await assert.rejects(trimVideo(input, 1), 'missing aspect must not default to landscape');
    const beforeSquare = calls;
    await assert.rejects(trimVideo(input, 1, { aspectRatio: '1:1' }));
    await assert.rejects(composeSource({ originalBlob: input, prefixSeconds: 0, settings: { aspectRatio: '1:1' } }, input, 1));
    assert.equal(calls, beforeSquare, 'square settings never send a processing or Google request');
    route = '/local-media/compose'; duration = 2; sizes = [[360, 640]];
    const portraitSource = { originalBlob: input, prefixSeconds: 1, settings: { aspectRatio: '9:16' } };
    assert.equal((await composeSource(portraitSource, input, 2)).actualSeconds, 2);
    sizes = [[640, 360]]; await assert.rejects(composeSource(portraitSource, input, 2));
    duration = 1; sizes = [[640, 360]]; await assert.rejects(composeSource({ ...portraitSource, prefixSeconds: 0 }, input, 1));
  } finally { globalThis.fetch = savedFetch; if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument; }
});
