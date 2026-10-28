import test from 'node:test';
import assert from 'node:assert/strict';
import { Studio, StudioError, canExtend, requestBody } from '../dist/core.js';
const source = (tailSeconds=10) => ({ originalBlob:new Blob(['original']), tailBlob:new Blob(['tail'],{type:'video/mp4'}), sourceSeconds:60, prefixSeconds:60-tailSeconds, tailSeconds, settings:{aspectRatio:'9:16',resolution:'720p'}, name:'original.mov', hasAudio:true });
function fixture(tailSeconds=10) {
  const requests=[],assemblies=[];let failCompose=false,failResolve=false,measurement=true;
  const studio=new Studio({async create(body,diagnostic,job){requests.push({body,source:job.uploadSource,previous:job.previousInteractionId});return{id:'v1_'+requests.length};},async resolve(job){if(failResolve)throw new StudioError('GET pending',{uncertain:true});return{interactionId:job.interactionId,blob:new Blob(['model'+requests.length],{type:'video/mp4'})};}}, {validate:async(blob,expected)=>({valid:measurement,actualSeconds:measurement?expected:expected-5}),compose:async(input,ending,expected)=>{assemblies.push({input,ending,expected});if(failCompose)throw Error('local');return{blob:new Blob(['full'+expected]),actualSeconds:expected};}});
  const input=source(tailSeconds);studio.importSource(input);
  return {studio,input,requests,assemblies,failCompose:v=>failCompose=v,failResolve:v=>failResolve=v,measurement:v=>measurement=v};
}
test('import is local, preserves original, and only the first explicit extension carries the tail',async()=>{
  const f=fixture();assert.equal(f.requests.length,0);assert.equal(f.studio.base.blob,f.input.originalBlob);assert.equal(f.studio.base.modelBlob,f.input.tailBlob);
  assert.equal(f.studio.base.wholeSeconds,60);assert.equal(f.studio.base.seconds,10);assert.equal(f.studio.base.interactionId,null);
  assert.equal(f.studio.base.viewed,false);assert.equal(f.requests.length,0);
  for(const [model,whole] of [[20,70],[30,80],[40,90]]) {
    await f.studio.generate('continue without new speech');assert.equal(f.studio.base.seconds,model);assert.equal(f.studio.base.wholeSeconds,whole);
    assert.equal(f.studio.base.source.originalBlob,f.input.originalBlob);assert.notEqual(f.studio.base.blob,f.studio.base.modelBlob);assert.equal(f.studio.base.viewed,false);
  }
  assert.equal(f.requests[0].source,f.input.tailBlob);assert.equal(f.requests[0].previous,null);
  assert.equal(f.requests[0].body.previous_interaction_id,undefined);assert.equal(f.requests[0].body.response_format.aspect_ratio,undefined);assert.equal(f.requests[0].body.generation_config.video_config.task,'extend');
  assert.match(f.requests[0].body.input[0].text,/<VIDEO_0>/);assert.match(f.requests[0].body.input[0].text,/Do not add any new spoken dialogue/);
  assert.equal(f.requests[1].source,null);assert.equal(f.requests[1].body.previous_interaction_id,'v1_1');assert.match(f.requests[1].body.input[0].text,/<PREVIOUS_VIDEO>/);
  assert.equal(f.requests[1].body.generation_config,undefined);assert.equal(f.requests[1].body.response_format.aspect_ratio,'9:16');
  assert.equal(canExtend(f.studio.base),false);await assert.rejects(f.studio.generate('again'),/40秒/);assert.equal(f.requests.length,3);
  assert.deepEqual(f.assemblies.map(x=>x.input.prefixSeconds),[50,50,50]);
});
test('3–10 second choices use measured tail duration and reject any model output plan beyond40',async()=>{
  const f=fixture(9.984);f.studio.viewed(f.studio.baseId);
  await f.studio.generate('next',undefined,3);assert.equal(f.studio.base.seconds,12.984);assert.equal(f.requests[0].body.response_format.duration,'3s');assert.equal(f.studio.base.wholeSeconds,63);
  for(const added of [0,11,3.5])await assert.rejects(f.studio.generate('bad',undefined,added));
  assert.equal(f.requests.length,1);f.studio.viewed(f.studio.baseId);
  await f.studio.generate('next',undefined,10);f.studio.viewed(f.studio.baseId);await f.studio.generate('next',undefined,10);f.studio.viewed(f.studio.baseId);
  await assert.rejects(f.studio.generate('too long',undefined,10),/40秒/);
  await f.studio.generate('last',undefined,7);assert.equal(f.studio.base.seconds,39.984);assert.equal(canExtend(f.studio.base),false);
  assert.equal(requestBody('plain',null,undefined,3).response_format.duration,'3s');
});
test('local composition failure keeps original and received model; local recheck never sends a paid request',async()=>{
  const f=fixture();f.studio.viewed(f.studio.baseId);f.failCompose(true);await f.studio.generate('continue');
  assert.equal(f.studio.versions.length,1);assert.equal(f.studio.base.blob,f.input.originalBlob);assert.ok(f.studio.job.result.blob);const model=f.studio.job.result.blob;
  assert.equal(await f.studio.generate('double'),false);assert.equal(f.requests.length,1);
  f.failCompose(false);await f.studio.recheck();assert.equal(f.requests.length,1);assert.equal(f.assemblies.length,2);assert.equal(f.studio.base.modelBlob,model);assert.equal(f.studio.base.wholeSeconds,70);
});
test('uncertain result, invalid length and branching preserve the same prefix and parent settings',async()=>{
  const f=fixture();f.studio.viewed(f.studio.baseId);f.failResolve(true);await f.studio.generate('continue');const pending=f.studio.job;
  f.failResolve(false);f.measurement(false);await f.studio.resume();assert.equal(f.studio.job,pending);assert.equal(f.studio.versions.length,1);assert.equal(f.assemblies.length,0);assert.ok(f.studio.rejected.blob);
  f.measurement(true);await f.studio.recheck();const first=f.studio.baseId;f.studio.viewed(first);await f.studio.generate('next');f.studio.select(first);f.studio.fork(first);await f.studio.generate('branch',{aspectRatio:'16:9',resolution:'360p'},5);
  assert.equal(f.studio.base.seconds,25);assert.equal(f.studio.base.wholeSeconds,75);assert.equal(f.requests.at(-1).body.previous_interaction_id,first);assert.equal(f.requests.at(-1).body.response_format.resolution,'720p');
  assert.equal(f.requests.length,3);assert.equal(f.studio.base.source.originalBlob,f.input.originalBlob);
  assert.doesNotMatch(JSON.stringify(f.studio.diagnostics()),/original.mov|originalBlob|uploadSource|sourceFileUri/);
});
test('invalid import never changes existing work or permits tail longer than10',()=>{
  const f=fixture();assert.throws(()=>f.studio.importSource(source()),/新しく始める/);assert.equal(f.studio.versions.length,1);
  const blank=new Studio({});assert.throws(()=>blank.importSource(source(10.01)),/長さ/);assert.equal(blank.hasWork,false);
});

test('assembly-failed model remains downloadable after explicit abandonment',async()=>{
  const f=fixture();f.studio.viewed(f.studio.baseId);f.failCompose(true);await f.studio.generate('continue');
  const received=f.studio.job.result.blob;assert.equal(f.studio.rejections.length,1);assert.equal(f.studio.rejected.blob,received);
  f.studio.abandon();assert.equal(f.studio.job,null);assert.equal(f.studio.rejected.blob,received);assert.equal(f.studio.base.blob,f.input.originalBlob);
});
