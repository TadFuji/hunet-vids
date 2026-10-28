import test from 'node:test';
import assert from 'node:assert/strict';
import { API_ERROR_MAX_BYTES, sanitizeApiError, decodeApiError, readApiError, apiErrorMessage } from '../dist/api-errors.js';
import { GoogleGateway } from '../dist/google.js';
import { requestBody } from '../dist/core.js';
const response = (data, status = 400) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const secret = 'synthetic-private-prompt-key-v1_id-https://private.example';
function safeOnly(value) { const text = JSON.stringify(value); assert.equal(text.includes(secret), false); assert.equal(text.includes('https://'), false); assert.equal(text.includes('message'), false); assert.equal(text.includes('details'), false); }

test('documented Interactions codes are preserved exactly and rendered using fixed explanations', async () => {
  const cases = { invalid_request: 400, failed_precondition: 400, parameter_unknown: 400, authentication: 401, payment_required: 402, permission_denied: 403, not_found: 404, model_not_found: 404, already_exists: 409, aborted: 409, out_of_range: 416, cancelled: 499, api_error: 500, unimplemented: 501, service_unavailable: 503, deadline_exceeded: 504, rate_limit_exceeded: 429, quota_exceeded: 429, too_many_requests: 429 };
  for (const [code, httpStatus] of Object.entries(cases)) {
    const safe = await readApiError(response({ error: { code, message: secret, details: [{ prompt: secret }] } }, httpStatus));
    assert.deepEqual(safe, { httpStatus, code, field: null }); safeOnly(safe);
    assert.ok(apiErrorMessage(safe).includes(code)); assert.equal(apiErrorMessage(safe).includes(secret), false);
  }
});

test('legacy Google statuses map conservatively without copying details or inferring a code from prose', async () => {
  assert.deepEqual(await readApiError(response({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received. Unknown name "duration" at \'response_format\': Cannot find field.', details: [{ field: secret }] } })), { httpStatus: 400, code: 'invalid_request', field: 'response_format.duration' });
  assert.equal(decodeApiError({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: secret } }, 429).code, 'resource_exhausted');
  assert.equal(decodeApiError({ error: { code: 400, status: 'INVALID_ARGUMENT' } }, 500).code, 'unknown');
  assert.deepEqual(decodeApiError({ error: { message: "Unknown parameter 'response_format.duration'." } }, 400), { httpStatus: 400, code: 'unknown', field: null });
});

test('field extraction requires a complete recognized grammar and exact allowlisted identifier', () => {
  const cases = [
    ["Unknown parameter 'duration' in 'response_format'.", 'response_format.duration'],
    ['Unknown parameter: "response_format.resolution".', 'response_format.resolution'],
    ['Unknown name "duration" at \'response_format\': Cannot find field.', 'response_format.duration'],
    ["Invalid value at 'response_format.duration' (TYPE_STRING), 123", 'response_format.duration'],
    [`The value '${secret}' is not supported for 'type' at 'response_format'. Supported values: video`, 'response_format.type'],
    [`The value '${secret}' is not supported for 'type' at 'tools[0]'. Supported values: video`, null],
    [`Unknown parameter '${secret}'.`, null],
    ['Unknown parameter "https://example.com/response_format.duration".', null],
    ['Unknown parameter "response_format.duration-secret".', null],
    ['Unknown parameter "__proto__".', null],
    ["Unknown parameter 'duration' in 'response_format'; Unknown parameter 'resolution' in 'response_format'.", null],
    [`Prompt echoed: Unknown parameter 'response_format.duration'. ${secret}`, null],
    ["Unknown parameter 'duration'.", null],
    ["Unknown parameter 'response_format.duration'. trailing explanation", null],
    ["Invalid value at 'response_format.duration' (TYPE_STRING), Invalid value at 'response_format.resolution'", null],
  ];
  for (const [message, field] of cases) {
    const safe = decodeApiError({ error: { code: 'invalid_request', message } }, 400);
    assert.equal(safe.field, field, message); safeOnly(safe); assert.equal(apiErrorMessage(safe).includes(secret), false);
  }
});

test('sanitizer rejects inherited/accessor/prototype/code injection and returns only three constants', () => {
  const inputs = [null, [], { code: secret, field: secret, httpStatus: secret }, { code: 'invalid_request ' + secret, httpStatus: 400 }, { code: '__proto__', httpStatus: 400 }, { code: { toString() { throw Error('must not coerce'); } }, httpStatus: 400 }, Object.create({ code: 'invalid_request', field: 'model', httpStatus: 400 }), JSON.parse('{"__proto__":{"code":"invalid_request"}}')];
  let getterCalls = 0; const getter = { get code() { getterCalls++; return secret; }, get field() { getterCalls++; return secret; }, get httpStatus() { getterCalls++; return 400; } }; inputs.push(getter);
  for (const value of inputs) { const safe = sanitizeApiError(value); assert.equal(safe.code, 'unknown'); assert.equal(safe.field, null); assert.deepEqual(Object.keys(safe), ['httpStatus', 'code', 'field']); safeOnly(safe); }
  assert.equal(getterCalls, 0);
  assert.deepEqual(sanitizeApiError({ code: 'payment_required', field: 'response_format.duration', httpStatus: 402, message: secret }), { httpStatus: 402, code: 'payment_required', field: null });
  assert.deepEqual(sanitizeApiError({ code: 'parameter_unknown', field: 'response_format.duration', httpStatus: 400, key: secret }), { httpStatus: 400, code: 'parameter_unknown', field: 'response_format.duration' });
});

test('malformed, HTML, unknown codes, bad UTF8 and oversized bodies return the same safe generic record', async () => {
  const bodies = ['<html>' + secret + '</html>', '{bad json', JSON.stringify({ error: { code: 'untrusted_' + secret, message: "Unknown parameter 'model'." } }), new Uint8Array([0xff]), JSON.stringify({ error: { code: 'invalid_request', message: secret.repeat(1000) } })];
  for (const body of bodies) {
    const safe = await readApiError(new Response(body, { status: 400 }));
    assert.deepEqual(safe, { httpStatus: 400, code: 'unknown', field: null }); safeOnly(safe);
  }
});

test('error body reads are streamed, bounded and cancelled before oversized or stalled bodies can accumulate', async () => {
  let cancelled = 0; let reads = 0;
  const stream = new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array(8192)); }, cancel() { cancelled++; } });
  const res = new Response(stream, { status: 400 }); res.text = res.json = () => { throw Error('unbounded body API used'); };
  assert.equal((await readApiError(res)).code, 'unknown'); assert.ok(reads <= 4); assert.ok(cancelled >= 1);
  let headerCancelled = false;
  const declared = new Response(new ReadableStream({ cancel() { headerCancelled = true; } }), { status: 400, headers: { 'Content-Length': String(API_ERROR_MAX_BYTES + 1) } });
  await readApiError(declared); assert.equal(headerCancelled, true);
  let stalledCancelled = false;
  const stalled = new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { stalledCancelled = true; } }), { status: 503 });
  const start = Date.now(); assert.deepEqual(await readApiError(stalled, { timeoutMs: 10 }), { httpStatus: 503, code: 'unknown', field: null });
  assert.ok(Date.now() - start < 500); assert.equal(stalledCancelled, true);
});

test('gateway keeps only sanitized last20 errors and never retries or lets body codes alter pending policy', async () => {
  let calls = 0; let status = 400; let code = 'parameter_unknown';
  const diagnostic = { apiErrors: [{ httpStatus: 400, code: secret, message: secret }] };
  const gateway = new GoogleGateway(() => 'placeholder-unit-only', { fetcher: async () => { calls++; return response({ error: { code, message: "Unknown parameter 'duration' in 'response_format'.", details: { secret } } }, status); } });
  for (let i = 0; i < 22; i++) await assert.rejects(gateway.create(requestBody('synthetic scene'), diagnostic), error => error.terminal && !error.uncertain && !error.message.includes(secret) && error.message.includes('response_format.duration'));
  assert.equal(calls, 22); assert.equal(diagnostic.apiErrors.length, 20); safeOnly(diagnostic);
  assert.deepEqual(diagnostic.apiErrors.at(-1), { httpStatus: 400, code: 'parameter_unknown', field: 'response_format.duration' });
  status = 402; code = 'payment_required'; await assert.rejects(gateway.create(requestBody('synthetic scene'), diagnostic), error => error.terminal && !error.uncertain);
  status = 500; code = 'invalid_request'; await assert.rejects(gateway.create(requestBody('synthetic scene'), diagnostic), error => error.uncertain && !error.terminal);
  await assert.rejects(gateway.request('/v1beta/interactions/synthetic', {}, diagnostic), error => error.uncertain && !error.terminal);
  status = 400; await assert.rejects(gateway.request('/v1beta/interactions/synthetic', {}, diagnostic), error => error.uncertain && !error.terminal);
  status = 402; await assert.rejects(gateway.request('/v1beta/interactions/synthetic', {}, diagnostic), error => error.uncertain && !error.terminal);
  assert.equal(calls, 27);
});


test('stream boundary permits exactly16KiB validJSON and handles split UTF8 without keeping prose', async () => {
  const json = JSON.stringify({ error: { code: 'invalid_request', message: '非公開の合成文字列' } });
  const encoded = new TextEncoder().encode(json); const padded = new Uint8Array(API_ERROR_MAX_BYTES); padded.fill(32); padded.set(encoded);
  let offset = 0;
  const stream = new ReadableStream({ pull(controller) { if (offset >= padded.length) { controller.close(); return; } controller.enqueue(padded.subarray(offset, offset + 7)); offset += 7; } });
  assert.deepEqual(await readApiError(new Response(stream, { status: 400 })), { httpStatus: 400, code: 'invalid_request', field: null });
  assert.deepEqual(decodeApiError({ error: { code: 400, status: '__proto__', field: secret, message: secret } }, 400), { httpStatus: 400, code: 'unknown', field: null });
});
