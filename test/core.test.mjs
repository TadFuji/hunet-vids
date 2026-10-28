import test from 'node:test';
import assert from 'node:assert/strict';
import { Studio, StudioError, requestBody, outputVideo, verifyDuration } from '../dist/core.js';

function setup() {
  let calls = 0, resolutions = 0, failure = null;
  const gateway = {
    async create() { calls++; return { id: `interaction-${calls}` }; },
    async resolve(job) {
      resolutions++;
      if (failure) throw failure;
      return { blob: new Blob(['test']), interactionId: job.interactionId };
    },
  };
  return { studio: new Studio(gateway), calls: () => calls, resolutions: () => resolutions, fail: e => { failure = e; } };
}

test('first video and native extensions stop at 40 seconds', async () => {
  const {studio,calls} = setup();
  for (const seconds of [10,20,30,40]) {
    await studio.generate('日本語のシーン');
    assert.equal(studio.base.seconds, seconds);
    assert.equal(studio.versions.length, seconds / 10);
    studio.viewed(studio.baseId);
  }
  await assert.rejects(studio.generate('さらに続く'), /40秒/);
  assert.equal(calls(), 4);
  assert.deepEqual(studio.lineage.map(v => v.seconds), [10,20,30,40]);
});

test('validated video can extend without watching; selection does not change source and fork stays explicit', async () => {
  const {studio} = setup();
  await studio.generate('start'); const initialId = studio.baseId;
  assert.equal(studio.base.viewed,false);
  await studio.generate('first continuation');
  const secondId = studio.baseId;
  studio.select(initialId); assert.equal(studio.baseId, secondId);
  studio.fork(initialId); assert.equal(studio.baseId, initialId);
  await studio.generate('another continuation');
  assert.equal(studio.base.seconds,20); assert.equal(studio.versions.length,3);
  assert.equal(studio.versions[1].parentId, initialId);
  assert.equal(studio.versions[2].parentId, initialId);
});

test('double submit creates exactly one paid request', async () => {
  const {studio,calls} = setup();
  const first = studio.generate('start');
  const second = studio.generate('start');
  assert.equal(await second, false); await first;
  assert.equal(calls(),1); assert.equal(studio.versions.length,1);
});

test('terminal failure keeps previous video and never retries automatically', async () => {
  const {studio,calls,fail} = setup();
  await studio.generate('start'); studio.viewed(studio.baseId);
  fail(new StudioError('generation failed',{terminal:true}));
  await studio.generate('next');
  assert.equal(calls(),2); assert.equal(studio.versions.length,1);
  assert.equal(studio.base.seconds,10); assert.equal(studio.job,null);
  assert.equal(studio.error,'generation failed');
});

test('uncertain results block new requests and resume only the same interaction', async () => {
  const {studio,calls,fail,resolutions} = setup();
  fail(new StudioError('network interrupted',{uncertain:true}));
  await studio.generate('start'); assert.ok(studio.job);
  assert.equal(studio.job.interactionId,'interaction-1');
  assert.equal(await studio.generate('duplicate'),false);
  fail(null); await studio.resume();
  assert.equal(calls(),1); assert.equal(resolutions(),2);
  assert.equal(studio.versions.length,1); assert.equal(studio.job,null);
});

test('unknown POST receipt is kept pending until an ID is recovered or explicitly abandoned', async () => {
  let calls=0;
  const studio = new Studio({ async create() {calls++; throw new StudioError('lost response',{uncertain:true});}, async resolve(job) {return {interactionId:job.interactionId,blob:new Blob(['ok'])};} });
  await studio.generate('start'); assert.equal(studio.job.interactionId,null);
  await assert.rejects(studio.resume(),/生成ID/);
  assert.equal(await studio.generate('start'),false);
  await studio.resume('v1_recovered'); assert.equal(studio.baseId,'v1_recovered');
  assert.equal(calls,1);
});

test('wrong duration never enters success timeline and remains available for inspection', async () => {
  const {studio} = setup(); studio.validate = async () => false;
  await studio.generate('start');
  assert.equal(studio.versions.length,0); assert.ok(studio.job);
  assert.equal(studio.job.outcome,'review');
  assert.ok(studio.rejected.blob); assert.match(studio.error,/長さ/);
});

test('recovery refuses an existing version ID and preserves the pending lock', async () => {
  const {studio,fail,calls} = setup();
  await studio.generate('start'); studio.viewed(studio.baseId);
  await studio.generate('next'); const existing = studio.baseId;
  studio.fork(studio.versions[0].id);
  fail(new StudioError('lost response',{uncertain:true})); await studio.generate('alternate');
  await assert.rejects(studio.resume(existing),/すでに保存/);
  assert.ok(studio.job); assert.equal(studio.versions.length,2); assert.equal(calls(),3);
  fail(null); await studio.resume(); assert.equal(studio.versions.length,3);
});

test('duration verification allows frame rounding, rejects wrong and over-limit outputs', () => {
  assert.ok(verifyDuration(10.04,10)); assert.ok(verifyDuration(40,40));
  for (const n of [3,9.5,20,NaN,Infinity,0]) assert.equal(verifyDuration(n,10),false);
  assert.equal(verifyDuration(40.2,40),false); assert.equal(verifyDuration(40.01,40),false);
});

test('off-length initial output, shorter extension, and output over 40 seconds remain inspection-only with actual duration', async () => {
  for (const scenario of [
    { parentSeconds:0, actual:7, expected:10 },
    { parentSeconds:10, actual:5, expected:20 },
    { parentSeconds:30, actual:20, expected:40 },
    { parentSeconds:30, actual:41, expected:40 },
  ]) {
    const {studio}=setup();
    for (let seconds=10;seconds<=scenario.parentSeconds;seconds+=10) {
      await studio.generate('prior scene'); studio.viewed(studio.baseId);
    }
    const previousCount=studio.versions.length;
    studio.validate=async()=>({valid:verifyDuration(scenario.actual,scenario.expected),actualSeconds:scenario.actual});
    await studio.generate('new scene');
    assert.equal(studio.versions.length,previousCount);
    assert.equal(studio.base?.seconds || 0,scenario.parentSeconds);
    assert.equal(studio.rejected.expectedSeconds,scenario.expected);
    assert.equal(studio.rejected.actualSeconds,scenario.actual);
    assert.match(studio.error,new RegExp(`予定${scenario.expected}秒／実尺${scenario.actual.toFixed(2)}秒`));
  }
});

test('40-second version cannot be used as a new branch and sessions have isolated histories', async () => {
  const {studio,calls}=setup(); const other=setup().studio;
  for (const seconds of [10,20,30,40]) {
    await studio.generate(`scene ${seconds}`); studio.viewed(studio.baseId);
  }
  assert.throws(()=>studio.fork(studio.baseId),/延長できません/);
  assert.equal(calls(),4); assert.equal(studio.base.seconds,40);
  assert.equal(other.versions.length,0); assert.equal(other.base,null); assert.equal(other.job,null);
});

test('request contract and output extraction match official REST shape', () => {
  const body=requestBody('日本語',{interactionId:'v1_previous'});
  assert.equal(body.model,'gemini-omni-1.1-flash'); assert.equal(body.previous_interaction_id,'v1_previous');
  assert.deepEqual(body.response_format,{type:'video',aspect_ratio:'16:9',resolution:'720p',duration:'10s',delivery:'uri'});
  assert.equal(body.store,true); assert.match(body.input[0].text,/exactly 10 seconds/);
  assert.equal('duration_seconds' in body,false);
  const video={type:'video',data:'AAAA'};
  assert.equal(outputVideo({steps:[{type:'user_input',content:[{type:'video',data:'wrong'}]},{type:'model_output',content:[video]}]}),video);
  assert.equal(outputVideo({output_video:video}),undefined);
});

test('initial generation and every native extension explicitly request 10s rather than cumulative duration', () => {
  const initial=requestBody('start');
  assert.equal(initial.response_format.duration,'10s');
  assert.equal('previous_interaction_id' in initial,false);
  for (const seconds of [10,20,30]) {
    const body=requestBody('continue',{seconds,interactionId:`v1_${seconds}`});
    assert.equal(body.model,'gemini-omni-1.1-flash');
    assert.equal(body.previous_interaction_id,`v1_${seconds}`);
    assert.equal(body.response_format.duration,'10s');
    assert.equal(body.response_format.resolution,'720p');
  }
});


test('only documented video aspects and resolutions are sent, and unsupported choices never POST',async()=>{
  for(const aspectRatio of ['16:9','9:16'])for(const resolution of ['360p','720p','1080p','4k']){
    const body=requestBody('scene',null,{aspectRatio,resolution});
    assert.equal(body.response_format.aspect_ratio,aspectRatio);assert.equal(body.response_format.resolution,resolution);
  }
  let posts=0;const studio=new Studio({create(){posts++;}});
  for(const settings of [{aspectRatio:'2:1',resolution:'720p'},{aspectRatio:'9:16',resolution:'2k'},{aspectRatio:'16:9'}]){
    await assert.rejects(studio.generate('scene',settings),/対応している/);
    assert.equal(posts,0);assert.equal(studio.job,null);assert.equal(studio.busy,false);
  }
});
test('frozen per-job settings survive recovery and explicit branches always inherit their own parent',async()=>{
  const bodies=[];let failure=true;
  const studio=new Studio({async create(body){bodies.push(body);return{id:'v'+bodies.length};},async resolve(job){if(failure)throw new StudioError('pending',{uncertain:true});return{interactionId:job.interactionId,blob:new Blob(['ok'])};}});
  const settings={aspectRatio:'9:16',resolution:'1080p'};await studio.generate('start',settings);settings.resolution='360p';
  assert.equal(studio.job.settings.resolution,'1080p');assert.ok(Object.isFrozen(studio.job.settings));
  failure=false;await studio.resume();const first=studio.baseId;assert.equal(studio.base.settings.resolution,'1080p');studio.viewed(first);
  await studio.generate('next',{aspectRatio:'16:9',resolution:'4k'});assert.equal(bodies[1].response_format.aspect_ratio,'9:16');assert.equal(bodies[1].response_format.resolution,'1080p');
  studio.select(first);studio.fork(first);await studio.generate('branch',{aspectRatio:'16:9',resolution:'360p'});
  assert.equal(bodies[2].previous_interaction_id,first);assert.equal(bodies[2].response_format.resolution,'1080p');assert.equal(studio.base.settings.aspectRatio,'9:16');
});


test('fresh request defaults to360p while explicit and historical720p parents stay720p',()=>{
  assert.equal(requestBody('new').response_format.resolution,'360p');
  for(const parent of [{interactionId:'legacy'},{interactionId:'explicit',settings:{aspectRatio:'16:9',resolution:'720p'}}]){
    assert.equal(requestBody('continue',parent).response_format.resolution,'720p');
    assert.equal(requestBody('branch',parent,{aspectRatio:'9:16',resolution:'360p'}).response_format.resolution,'720p');
  }
});
