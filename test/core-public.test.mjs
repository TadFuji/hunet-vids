import test from 'node:test';
import assert from 'node:assert/strict';
import { Studio, StudioError, DEFAULT_VIDEO_SETTINGS, canExtend } from '../dist/core.js';

function setup(options = {}) {
  const requests = []; let localCalls = 0;
  const gateway = {
    async create(body) { requests.push(body); return { id: `public-${requests.length}` }; },
    async resolve(job) { return { interactionId: job.interactionId, blob: new Blob(['synthetic']) }; },
  };
  const local = async () => { localCalls++; throw Error('public mode must not use local processing'); };
  const studio = new Studio(gateway, { localMediaEnabled: false, prepare: local, trim: local, compose: local, ...options });
  return { studio, requests, localCalls: () => localCalls };
}
function parent(studio, overrides = {}) {
  const version = { id: 'existing', interactionId: 'existing', seconds: 20, actualSeconds: 20, modelSeconds: 20, wholeSeconds: 20, viewed: true, blob: new Blob(['original']), settings: DEFAULT_VIDEO_SETTINGS, ...overrides };
  studio.versions.push(version); studio.baseId = version.id; studio.selectedId = version.id; return version;
}

test('public mode rejects imports and 1/2-second requests before creating a job or issuing a POST', async () => {
  const { studio, requests, localCalls } = setup();
  assert.throws(() => studio.importSource({}), /公開版/);
  for (const seconds of [1, 2]) await assert.rejects(studio.generate('synthetic', DEFAULT_VIDEO_SETTINGS, seconds), /3〜10秒/);
  assert.equal(studio.job, null); assert.equal(studio.attempts.length, 0); assert.equal(studio.versions.length, 0); assert.equal(studio.busy, false);
  assert.equal(requests.length, 0); assert.equal(localCalls(), 0);
  assert.equal(new Studio({}).localMediaEnabled, true, 'local mode remains the default');
});

test('public mode supports native 10 to20 to30 to40 with no local preparation, trimming or uploads', async () => {
  const { studio, requests, localCalls } = setup();
  for (const total of [10, 20, 30, 40]) {
    if (studio.base) studio.viewed(studio.base.id);
    await studio.generate('synthetic', DEFAULT_VIDEO_SETTINGS, 10);
    assert.equal(studio.base.seconds, total); assert.equal(studio.job, null);
    const body = requests.at(-1); assert.equal(body.response_format.duration, '10s'); assert.equal(body.generation_config, undefined);
    assert.equal(body.previous_interaction_id, total === 10 ? undefined : `public-${total / 10 - 1}`);
  }
  assert.equal(requests.length, 4); assert.equal(localCalls(), 0);
  assert.equal(canExtend(studio.base, { localMediaEnabled: false }), false);
  await assert.rejects(studio.generate('blocked', DEFAULT_VIDEO_SETTINGS, 3)); assert.equal(requests.length, 4);
});

test('public mode blocks every operation requiring uploaded material or rebasing before creating a job', async () => {
  const cases = [{ requiresUpload: true }, { source: { originalBlob: new Blob(['original']) } }, { interactionId: null }, { seconds: 30, modelSeconds: 30.01, actualSeconds: 30.01 }, { seconds: 37, modelSeconds: 37.01, actualSeconds: 37.01 }];
  for (const overrides of cases) {
    const { studio, requests, localCalls } = setup(); const original = parent(studio, overrides);
    const seconds = overrides.seconds === 37 ? 3 : 10;
    await assert.rejects(studio.generate('blocked', DEFAULT_VIDEO_SETTINGS, seconds), /公開版/);
    assert.equal(studio.base, original); assert.equal(studio.job, null); assert.equal(studio.attempts.length, 0); assert.equal(studio.busy, false); assert.equal(requests.length, 0); assert.equal(localCalls(), 0);
  }
});

test('public extension availability respects both logical and measured remaining length', async () => {
  const { studio, requests } = setup();
  const v = parent(studio, { seconds: 37, modelSeconds: 37.01 });
  assert.equal(canExtend(v), true); assert.equal(canExtend(v, { localMediaEnabled: false }), false);
  v.modelSeconds = 37; assert.equal(canExtend(v, { localMediaEnabled: false }), true);
  await studio.generate('last three', DEFAULT_VIDEO_SETTINGS, 3); assert.equal(studio.base.seconds, 40); assert.equal(requests.length, 1);
  for (const seconds of [38, 39]) {
    const blocked = setup(); parent(blocked.studio, { seconds, modelSeconds: seconds });
    assert.equal(canExtend(blocked.studio.base, { localMediaEnabled: false }), false);
    await assert.rejects(blocked.studio.generate('blocked', DEFAULT_VIDEO_SETTINGS, 3)); assert.equal(blocked.requests.length, 0);
  }
});

test('public pending and busy locks prevent repeated paid creation', async () => {
  let posts = 0; let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const studio = new Studio({ async create() { posts++; await waiting; throw new StudioError('uncertain synthetic result', { uncertain: true }); } }, { localMediaEnabled: false });
  const first = studio.generate('first', DEFAULT_VIDEO_SETTINGS, 3);
  assert.equal(await studio.generate('second', DEFAULT_VIDEO_SETTINGS, 3), false); assert.equal(posts, 1);
  release(); await first; const pending = studio.job;
  assert.ok(pending); assert.equal(await studio.generate('third', DEFAULT_VIDEO_SETTINGS, 3), false); assert.equal(posts, 1); assert.equal(studio.job, pending);
});
