import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleGateway, safeUploadUrl } from '../dist/google.js';
import { Studio } from '../dist/core.js';

const origin = 'https://generativelanguage.googleapis.com';
const sourceUri = origin + '/v1beta/files/tail-123';
const uploadUrl = origin + '/upload/v1beta/files?upload_id=synthetic-upload&upload_protocol=resumable';
const key = 'placeholder-upload-test-only';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const start = (url = uploadUrl) => new Response('', { headers: { 'x-goog-upload-url': url } });
const file = (state = 'ACTIVE') => ({ name: 'files/tail-123', uri: sourceUri, mimeType: 'video/mp4', state });
const input = (uri = sourceUri, text = 'continue') => [{ type: 'video', uri, mime_type: 'video/mp4' }, { type: 'text', text }];
const result = (extra = {}) => ({ id: 'interaction-123', status: 'completed', input: input(), steps: [{ type: 'model_output', content: [{ type: 'video', data: btoa('synthetic output') }] }], ...extra });
const body = () => ({ model: 'gemini-omni-1.1-flash', input: [{ type: 'text', text: 'continue' }], generation_config: { video_config: { task: 'extend' } }, response_format: { type: 'video', duration: '10s', resolution: '360p', delivery: 'uri' }, store: true });
const job = () => ({ uploadSource: new Blob(['synthetic tail only'], { type: 'video/mp4' }), inputText: 'continue', previousInteractionId: null, parentId: 'local-upload-version', diagnostic: {} });
function fixture(responses, getKey = () => key) {
  const calls = [], stages = [];
  const gateway = new GoogleGateway(getKey, { polls: 2, wait: async () => {}, fetcher: async (url, options) => {
    calls.push({ url, options });
    if (!responses.length) throw Error('unexpected mock request');
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  } });
  return { gateway, calls, stages };
}
const uncertain = error => error.uncertain && !error.terminal && !error.message.includes(key) && !error.message.includes('synthetic-upload');

test('upload start, raw tail bytes, ACTIVE polling, then one billable interaction; no source-body mutation', async () => {
  const f = fixture([start(), json({ file: file('PROCESSING') }), json(file('PROCESSING')), json(file()), json(result())]);
  const j = job(), b = body(); j.report = stage => f.stages.push(stage);
  j.response = await f.gateway.create(b, j.diagnostic, j); j.interactionId = j.response.id;
  assert.equal(j.sourceFileUri, sourceUri); assert.equal(j.sourceFileName, 'files/tail-123');
  assert.equal(j.diagnostic.post, 1); assert.deepEqual(j.diagnostic.httpStatuses, [200]);
  assert.equal(f.calls.length, 5); assert.equal(f.calls[1].options.body, j.uploadSource);
  assert.equal(f.calls[1].options.headers['Content-Type'], 'video/mp4');
  assert.equal(f.calls[0].options.headers['X-Goog-Upload-Header-Content-Length'], String(j.uploadSource.size));
  assert.equal(f.calls[1].options.headers['X-Goog-Upload-Command'], 'upload, finalize');
  assert.equal(f.calls[4].url, origin + '/v1beta/interactions');
  const sent = JSON.parse(f.calls[4].options.body);
  assert.deepEqual(sent.input, input()); assert.equal(sent.previous_interaction_id, undefined);
  assert.equal(sent.response_format.aspect_ratio, undefined); assert.equal(b.input.length, 1);
  for (const c of f.calls) {
    assert.equal(c.options.headers['x-goog-api-key'], key);
    assert.equal(c.options.redirect, 'error'); assert.equal(c.options.credentials, 'omit');
    assert.equal(c.url.includes(key), false);
    assert.equal(Object.keys(c.options.headers).some(k => k.toLowerCase() === 'content-length'), false);
  }
  assert.ok(f.stages.length > 0);
  const resolved = await f.gateway.resolve(j, () => {});
  assert.equal(await resolved.blob.text(), 'synthetic output'); assert.equal(f.calls.length, 5);
  await assert.rejects(f.gateway.create(b, j.diagnostic, j), uncertain); assert.equal(f.calls.length, 5);
});

test('strict upload destinations refuse foreign hosts, paths, credentials and unrecognized query parameters', async () => {
  assert.equal(safeUploadUrl(uploadUrl).origin, origin);
  assert.equal(safeUploadUrl(origin + '/upload/v1beta/files?upload_id=opaque').origin, origin);
  for (const url of [null, 'https://evil.example/upload/v1beta/files?upload_id=x', origin + '.evil.example/upload/v1beta/files?upload_id=x', origin.replace('https:', 'http:') + '/upload/v1beta/files?upload_id=x', 'https://user:pass@generativelanguage.googleapis.com/upload/v1beta/files?upload_id=x', origin + '/v1beta/files?upload_id=x', origin + '/upload/v1beta/files?key=secret&upload_id=x', origin + '/upload/v1beta/files?upload_id=x&upload_id=y', origin + '/upload/v1beta/files?upload_id=x#fragment', origin + '/upload/v1beta/files?upload_id=x&upload_protocol=other', origin + '/upload/v1beta/files']) {
    const f = fixture([start(url === null ? '' : url)]), j = job();
    await assert.rejects(f.gateway.create(body(), j.diagnostic, j), uncertain);
    assert.equal(f.calls.length, 1); assert.equal(j.diagnostic.post, undefined);
  }
});

test('upload errors never reach Interactions and retain the job source without automatic retry', async () => {
  const brokenFiles = [null, { ...file(), uri: 'https://evil.example/video' }, { ...file(), uri: sourceUri + '?key=secret' }, { ...file(), name: 'files/other' }, { ...file(), mimeType: 'audio/mp3' }];
  const scenarios = [[new Error(key)], [json({ error: key }, 403)], [start(), new Error(key)], [start(), json({ error: key }, 400)], [start(), new Response('bad-json')], ...brokenFiles.map(value => [start(), json({ file: value })]), [start(), json({ file: file('FAILED') })], [start(), json({ file: file('PROCESSING') }), json({ ...file(), name: 'files/wrong' })], [start(), json({ file: file('PROCESSING') }), json(file('PROCESSING')), json(file('PROCESSING'))]];
  for (const responses of scenarios) {
    const f = fixture(responses), j = job(), source = j.uploadSource;
    await assert.rejects(f.gateway.create(body(), j.diagnostic, j), uncertain);
    assert.equal(f.calls.some(c => c.url === origin + '/v1beta/interactions'), false);
    assert.equal(j.diagnostic.post, undefined); assert.equal(j.uploadSource, source);
    const count = f.calls.length;
    await assert.rejects(f.gateway.create(body(), j.diagnostic, j), uncertain); assert.equal(f.calls.length, count);
  }
});

test('missing key or invalid source sends no request; key loss between upload phases prevents generation', async () => {
  for (const value of ['', '   ']) {
    const f = fixture([], () => value), j = job();
    await assert.rejects(f.gateway.create(body(), j.diagnostic, j), uncertain); assert.equal(f.calls.length, 0);
  }
  for (const source of [new Blob([], { type: 'video/mp4' }), new Blob(['x'], { type: 'video/webm' }), '/private/full-source.mp4']) {
    const f = fixture([]), j = { ...job(), uploadSource: source };
    await assert.rejects(f.gateway.create(body(), j.diagnostic, j), uncertain); assert.equal(f.calls.length, 0);
  }
  let reads = 0; const f = fixture([start()], () => ++reads === 1 ? key : '');
  await assert.rejects(f.gateway.create(body(), {}, job()), uncertain); assert.equal(f.calls.length, 1);
});

test('uploaded recovery verifies video URI and prompt in top-level and latest-user forms; GET only', async () => {
  for (const fields of [{ input: input() }, { input: undefined, steps: [{ type: 'user_input', content: input() }, ...result().steps] }, { input: [{ type: 'user_input', content: input() }] }]) {
    for (const manualRecovery of [false, true]) {
      const f = fixture([json(result(fields))]);
      const j = { ...job(), sourceFileUri: sourceUri, interactionId: 'interaction-123', manualRecovery };
      const value = await f.gateway.resolve(j, () => {});
      assert.equal(await value.blob.text(), 'synthetic output'); assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].options.method, undefined); assert.match(f.calls[0].url, /include_input=true$/);
    }
  }
});

test('missing uploaded input triggers one fresh GET then stays uncertain; no upload or POST on recovery', async () => {
  for (const missing of [undefined, [{ type: 'text', text: 'continue' }], [{ type: 'video', uri: sourceUri }], [{ type: 'video', data: btoa('tail') }, { type: 'text', text: 'continue' }]]) {
    const response = result({ input: missing }), f = fixture([json(response)]);
    const j = { ...job(), sourceFileUri: sourceUri, interactionId: 'interaction-123', response };
    await assert.rejects(f.gateway.resolve(j, () => {}), uncertain);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.method, undefined);
    assert.equal(j.diagnostic.identity.input, 'missing');
  }
  const f = fixture([json(result())]);
  const value = await f.gateway.resolve({ ...job(), sourceFileUri: sourceUri, interactionId: 'interaction-123', response: result({ input: undefined }) }, () => {});
  assert.equal(await value.blob.text(), 'synthetic output'); assert.equal(f.calls.length, 1);
});

test('wrong source, prompt, parent, or contradictory input cannot be adopted or release a failed job', async () => {
  for (const fields of [{ input: input(origin + '/v1beta/files/wrong') }, { input: input(sourceUri, 'wrong') }, { previous_interaction_id: 'wrong-parent' }, { steps: [{ type: 'user_input', content: input(sourceUri, 'different') }, ...result().steps] }, { input: [...input(), { type: 'video', uri: sourceUri }] }]) {
    for (const status of ['completed', 'failed']) {
      const f = fixture([json(result({ ...fields, status }))]);
      await assert.rejects(f.gateway.resolve({ ...job(), sourceFileUri: sourceUri, interactionId: 'interaction-123', manualRecovery: true }, () => {}), uncertain);
      assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.method, undefined);
    }
  }
});

test('native continuation after upload uses real previousInteractionId and preserves legacy parent fallback', async () => {
  for (const fields of [{ previousInteractionId: 'real-parent', parentId: 'local-version', source: { localId: 'retained-local-source' } }, { parentId: 'real-parent' }]) {
    const f = fixture([json(result({ previous_interaction_id: 'real-parent', input: 'continue' }))]);
    const value = await f.gateway.resolve({ ...fields, inputText: 'continue', interactionId: 'interaction-123' }, () => {});
    assert.equal(await value.blob.text(), 'synthetic output'); assert.equal(f.calls.length, 1);
  }
});

test('uncertain generation after successful upload resumes with a single GET and retains source identity', async () => {
  const f = fixture([start(), json({ file: file() }), json({ error: key }, 500), json(result())]);
  const j = job();
  await assert.rejects(f.gateway.create(body(), j.diagnostic, j), uncertain);
  assert.equal(j.sourceFileUri, sourceUri); assert.equal(j.diagnostic.post, 1);
  j.interactionId = 'interaction-123'; j.manualRecovery = true;
  const resolved = await f.gateway.resolve(j, () => {});
  assert.equal(await resolved.blob.text(), 'synthetic output');
  assert.equal(f.calls.length, 4); assert.equal(f.calls[3].options.method, undefined);
  assert.equal(j.diagnostic.post, 1); assert.equal(j.diagnostic.get, 1);
  assert.equal(JSON.stringify(j.diagnostic).includes(sourceUri), false);
  assert.equal(JSON.stringify(j.diagnostic).includes(key), false);
});

test('unknown upload URI never falls back to same-text null-parent recovery and keeps the job pending', async () => {
  for (const marker of [{ uploadSource: new Blob(['tail'], { type: 'video/mp4' }) }, { source: { localId: 'private-local-source' }, previousInteractionId: null }]) {
    for (const manualRecovery of [false, true]) {
      for (const status of ['completed', 'failed']) {
        const unrelated = result({ status, input: 'continue', previous_interaction_id: null });
        const f = fixture([json(unrelated)]);
        const pending = { ...marker, inputText: 'continue', parentId: null, interactionId: 'interaction-123', response: unrelated, manualRecovery, diagnostic: {} };
        await assert.rejects(f.gateway.resolve(pending, () => {}), uncertain);
        assert.equal(f.calls.length, 0); assert.equal(pending.sourceFileUri, undefined);
        assert.equal(pending.diagnostic.identity.input, 'missing');
        const studio = new Studio(f.gateway); studio.job = pending;
        await studio.resume();
        assert.equal(studio.job, pending); assert.equal(studio.versions.length, 0);
        assert.equal(f.calls.length, 0); assert.equal(pending.diagnostic.post, undefined);
      }
    }
  }
});
