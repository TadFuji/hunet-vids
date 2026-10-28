import test from 'node:test';
import assert from 'node:assert/strict';
import { Studio, StudioError, requestBody, canExtend, verifyDuration } from '../dist/core.js';
const clip=(seconds,tag='')=>new Blob([JSON.stringify({seconds,tag})],{type:'video/mp4'});
const length=async blob=>JSON.parse(await blob.text()).seconds;
function fixture() {
  const calls=[],prepares=[],assemblies=[];let bad=false, release, rawOffset=0;
  const studio=new Studio({async create(body,d,job){calls.push({body,upload:job.uploadSource,previous:job.previousInteractionId});d.post=(d.post||0)+1;return{id:'v1_'+calls.length};},async resolve(job){return{interactionId:job.interactionId,blob:clip(job.apiExpectedSeconds-(bad?1:0)+rawOffset,'raw'+calls.length)};}}, {
    validate:async(blob,expected,options={})=>{const actualSeconds=await length(blob);return{valid:Number.isFinite(actualSeconds)&&Math.abs(actualSeconds-expected)<=0.1&&actualSeconds<=(options.maxSeconds??40),actualSeconds};},
    prepare:async blob=>{prepares.push(blob);if(release)await release;const seconds=await length(blob),tailSeconds=Math.min(10,seconds);return{originalBlob:blob,tailBlob:clip(tailSeconds,'prepared'),tailSeconds,prefixSeconds:seconds-tailSeconds,sourceSeconds:seconds,settings:{aspectRatio:'16:9',resolution:'360p'}};},
    compose:async(source,ending,expected)=>{assemblies.push({source,ending,expected});return{blob:clip(expected,'assembled'),actualSeconds:expected};},
  });
  return {studio,calls,prepares,assemblies,bad:v=>bad=v,rawOffset:v=>rawOffset=v,block:v=>release=v};
}
const watched=f=>f.studio.viewed(f.studio.baseId);
test('initial3 then7 uses native API durations and retained actual10',async()=>{
  const f=fixture();await f.studio.generate('start',undefined,3);watched(f);await f.studio.generate('continue',undefined,7);
  assert.deepEqual(f.calls.map(c=>c.body.response_format.duration),['3s','7s']);assert.equal(f.calls[1].body.previous_interaction_id,'v1_1');assert.equal(f.studio.base.seconds,10);assert.equal(f.studio.base.wholeSeconds,10);assert.equal(f.prepares.length,0);
});
test('1 and 2 second requests are rejected before creating a job or issuing any POST',async()=>{
  for(const desired of [1,2]) {
    const f=fixture();
    await assert.rejects(f.studio.generate('short',undefined,desired),/3〜10秒/);
    assert.equal(f.calls.length,0);assert.equal(f.studio.job,null);assert.equal(f.studio.versions.length,0);
  }
});
test('37s with measured drift +3s rebases tail<=10s, composes within 40s, and 38/39s cannot extend',async()=>{
  const f=fixture();f.rawOffset(-0.05);
  const parent={id:'old',interactionId:'old',seconds:37,modelSeconds:37.05,wholeSeconds:37.05,blob:clip(37.05,'current'),settings:{aspectRatio:'16:9',resolution:'360p'},viewed:true};
  f.studio.versions=[parent];f.studio.baseId='old';
  await f.studio.generate('finish',undefined,3);
  assert.equal(f.prepares[0],parent.blob);assert.equal(f.calls[0].body.previous_interaction_id,undefined);assert.equal(f.calls[0].body.generation_config.video_config.task,'extend');assert.match(f.calls[0].body.input[0].text,/<VIDEO_0>/);assert.equal(f.calls[0].body.response_format.duration,'3s');
  assert.equal(f.studio.base.seconds,40);assert.equal(f.studio.base.wholeSeconds,40);assert.equal(f.studio.base.requiresUpload,true);assert.equal(canExtend(f.studio.base),false);
  for(const current of [38,39]){
    const g=fixture();const p={id:'near',interactionId:'near',seconds:current,modelSeconds:current,wholeSeconds:current,blob:clip(current,'near'),settings:{aspectRatio:'16:9',resolution:'360p'},viewed:true};
    g.studio.versions=[p];g.studio.baseId='near';
    assert.equal(canExtend(p),false);
    await assert.rejects(g.studio.generate('over',undefined,3),/40秒/);assert.equal(g.calls.length,0);
  }
});
test('uploaded60s +3 +7 tracks whole70 and logical20, uses original prefix50',async()=>{
  const f=fixture(),source={originalBlob:clip(60,'original'),tailBlob:clip(10,'tail'),sourceSeconds:60,tailSeconds:10,prefixSeconds:50,settings:{aspectRatio:'16:9',resolution:'360p'}};f.studio.importSource(source);watched(f);
  await f.studio.generate('three',undefined,3);const first=f.studio.base;assert.equal(first.seconds,13);assert.equal(first.wholeSeconds,63);assert.equal(first.rawActualSeconds,13);assert.equal(first.source.originalBlob,source.originalBlob);
  watched(f);await f.studio.generate('seven',undefined,7);assert.equal(f.assemblies[1].source.prefixSeconds,50);assert.equal(f.studio.base.wholeSeconds,70);assert.equal(f.studio.base.seconds,20);assert.equal(f.studio.base.source.originalBlob,source.originalBlob);assert.equal(await length(source.originalBlob),60);assert.equal(f.calls[1].previous,'v1_1');
});
test('short raw3s output is rejected into review and never enters version history',async()=>{
  const f=fixture();f.bad(true);await f.studio.generate('three',undefined,3);assert.equal(f.studio.versions.length,0);assert.equal(f.studio.rejected.expectedSeconds,3);assert.equal(f.studio.rejected.actualSeconds,2);assert.equal(f.calls.length,1);
});
test('explicit branch from rebased version uploads branchbytes; lock spans local preparation',async()=>{
  const f=fixture();
  const rebasedParent={id:'rebased1',interactionId:'rebased1',seconds:10,modelSeconds:10,wholeSeconds:10,requiresUpload:true,blob:clip(10,'rebased1'),settings:{aspectRatio:'16:9',resolution:'360p'},viewed:true};
  f.studio.versions=[rebasedParent];f.studio.baseId='rebased1';
  await f.studio.generate('next',undefined,7);assert.equal(f.prepares[0],rebasedParent.blob);
  f.studio.fork(rebasedParent.id);
  let unblock;f.block(new Promise(resolve=>unblock=resolve));const running=f.studio.generate('branch',undefined,3);assert.equal(await f.studio.generate('double',undefined,3),false);assert.equal(f.calls.length,1);assert.equal(f.prepares.at(-1),rebasedParent.blob);assert.throws(()=>f.studio.fork(rebasedParent.id),/処理中/);unblock();await running;assert.equal(f.studio.base.parentId,rebasedParent.id);assert.equal(f.studio.base.seconds,13);assert.equal(f.calls.length,2);
});
test('native API validation and Studio.generate accept only 3..10 integers',async()=>{
  for(const n of [1,2,3.5,0,11,NaN])assert.throws(()=>requestBody('x',null,undefined,n),/3〜10/);
  for(const n of [0,1,2,11,3.5,NaN]){const f=fixture();await assert.rejects(f.studio.generate('x',undefined,n),/3〜10/);assert.equal(f.calls.length,0);assert.equal(f.studio.job,null);}
});
test('diagnostics records 3..10 duration policy and excludes private fields',async()=>{
  const f=fixture();await f.studio.generate('private',undefined,3);const diag=f.studio.diagnostics();assert.match(diag.durationPolicy,/desired3\.\.10/);const d=diag.attempts[0];assert.equal(d.desiredSeconds,3);assert.equal(d.apiDurationSeconds,3);assert.equal(d.apiExpectedSeconds,3);assert.equal(d.keptSeconds,3);assert.equal(d.trimmed,false);assert.deepEqual(d.measurements.map(m=>[m.phase,m.expectedSeconds,m.actualSeconds]),[['raw',3,3]]);assert.doesNotMatch(JSON.stringify(d),/private|v1_|rawBlob|uploadSource/);
});
test('accepted native frame drift is used as next API context rather than relabelled logical duration',async()=>{
  const f=fixture();const parent={id:'old',interactionId:'old',seconds:3,modelSeconds:3.042,wholeSeconds:3.042,blob:clip(3.042),settings:{aspectRatio:'16:9',resolution:'360p'},viewed:true};f.studio.versions=[parent];f.studio.baseId='old';await f.studio.generate('next',undefined,7);assert.equal(f.studio.base.seconds,10);assert.equal(f.studio.base.rawActualSeconds,10.042);assert.match(f.calls[0].body.input[0].text,/10.042-second/);
});
test('preparation failure sends nothing and cannot adopt a manually entered unrelated ID',async()=>{
  const f=fixture();const previous={id:'rebased',interactionId:'rebased',seconds:10,modelSeconds:10,wholeSeconds:10,requiresUpload:true,blob:clip(10),settings:{aspectRatio:'16:9',resolution:'360p'},viewed:true};
  f.studio.versions=[previous];f.studio.baseId='rebased';
  f.studio.prepare=async()=>{throw Error('local failure');};await f.studio.generate('next',undefined,7);assert.equal(f.calls.length,0);assert.equal(f.studio.base,previous);assert.equal(f.studio.job.requestReady,false);await assert.rejects(f.studio.resume('unrelated'),/生成は送信していません/);assert.equal(f.calls.length,0);assert.equal(await f.studio.generate('double'),false);
});
test('text-origin assembled output beyond physical40 remains in review despite logical40plan',async()=>{
  const f=fixture(),parent={id:'old',interactionId:'old',seconds:37,modelSeconds:37.042,wholeSeconds:37.042,blob:clip(37.042),viewed:true};f.studio.versions=[parent];f.studio.baseId='old';await f.studio.generate('last',undefined,3);assert.equal(f.studio.versions.length,1);assert.equal(f.studio.job.outcome,'review');assert.equal(f.studio.rejected.actualSeconds,13);assert.equal(f.calls.length,1);
});
test('requestBody refuses any direct previousID reference to a version requiring upload',()=>{
  assert.throws(()=>requestBody('bad',{requiresUpload:true,interactionId:'stale',seconds:10},undefined,3),/現在版の末尾/);
});
test('browser preflight cancellation after tail preparation blocks paid POST and preserves source',async()=>{
  const f=fixture();const previous={id:'rebased',interactionId:'rebased',seconds:10,modelSeconds:10,wholeSeconds:10,requiresUpload:true,blob:clip(10),settings:{aspectRatio:'16:9',resolution:'360p'},viewed:true};
  f.studio.versions=[previous];f.studio.baseId='rebased';
  let cancelled=false,checked=0;
  f.studio.preflight=async()=>()=>{checked++;if(cancelled)throw new StudioError('processing cancelled',{terminal:true});};
  const original=f.studio.prepare;f.studio.prepare=async blob=>{const prepared=await original(blob);cancelled=true;return prepared;};
  await f.studio.generate('continued',undefined,3);
  assert.equal(checked,1);assert.equal(f.calls.length,0);assert.equal(f.studio.base,previous);assert.equal(f.studio.job,null);assert.match(f.studio.error,/cancelled/);
  cancelled=false;f.studio.prepare=original;await f.studio.generate('explicit retry',undefined,3);
  assert.equal(f.calls.length,1);assert.equal(f.studio.base.seconds,13);
});
test('preflight failure releases only unsent job and keeps native history',async()=>{
  const f=fixture();await f.studio.generate('initial',undefined,10);watched(f);const previous=f.studio.base;
  f.studio.preflight=async()=>{throw new Error('untrusted worker error');};
  await f.studio.generate('next',undefined,3);
  assert.equal(f.calls.length,1);assert.equal(f.studio.base,previous);assert.equal(f.studio.job,null);
  assert.doesNotMatch(f.studio.error,/untrusted/);assert.match(f.studio.error,/送信していません/);
});
