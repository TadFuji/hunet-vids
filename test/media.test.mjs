import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVideo} from '../dist/media.js';
function fake(events, timeoutMs=100) {
  let cleaned=0,revoked=0;
  const video={duration:NaN,removeAttribute(){cleaned++;},load(){},set src(value){queueMicrotask(()=>events(this));}};
  return {options:{createVideo:()=>video,createUrl:()=> 'blob:synthetic',revokeUrl:()=>revoked++,timeoutMs},video,counts:()=>[cleaned,revoked]};
}
test('metadata duration is read from a new Blob element and cleanup revokes it',async()=>{
  const f=fake(v=>{v.duration=30.016;v.onloadedmetadata();});
  assert.deepEqual(await validateVideo(new Blob(['test']),40,f.options),{valid:false,actualSeconds:30.016});
  assert.deepEqual(f.counts(),[1,1]);assert.equal(f.video.onloadedmetadata,null);
});
test('unknown metadata waits for finite durationchange instead of immediate rejection',async()=>{
  const f=fake(v=>{v.duration=Infinity;v.onloadedmetadata();v.duration=40;v.ondurationchange();});
  assert.deepEqual(await validateVideo(new Blob(['test']),40,f.options),{valid:true,actualSeconds:40});
});
test('timeout or decode error is distinguishable from a measured duration mismatch',async()=>{
  for(const f of [fake(()=>{},1),fake(v=>v.onerror())]){
    assert.deepEqual(await validateVideo(new Blob(['test']),40,f.options),{valid:false,actualSeconds:null});
    assert.deepEqual(f.counts(),[1,1]);
  }
});

test('requested shape checks actual pixel dimensions, rejecting unsupported squares',async()=>{
  for(const [ratio,width,height,accepted] of [['1:1',360,360,false],['1:1',512,510,false],['1:1',640,360,false],['16:9',640,360,true],['16:9',854,480,true],['16:9',360,640,false],['9:16',360,640,true],['9:16',360,360,false]]) {
    const f=fake(v=>{v.duration=3;v.videoWidth=width;v.videoHeight=height;v.onloadedmetadata();});
    const result=await validateVideo(new Blob(['x']),3,{...f.options,aspectRatio:ratio});
    assert.equal(result.valid,accepted);assert.equal(result.aspectValid,accepted);assert.equal(result.durationValid,true);assert.equal(result.width,width);assert.equal(result.height,height);assert.deepEqual(f.counts(),[1,1]);
  }
});
test('known duration waits for dimensions and resize; timeout with missing pixels is reviewable',async()=>{
  const f=fake(v=>{v.duration=3;v.videoWidth=0;v.videoHeight=0;v.onloadedmetadata();queueMicrotask(()=>{v.videoWidth=360;v.videoHeight=640;v.onresize();});});
  const result=await validateVideo(new Blob(['x']),3,{...f.options,aspectRatio:'9:16'});assert.equal(result.valid,true);assert.equal(result.width,360);assert.equal(f.video.onresize,null);
  const unknown=fake(v=>{v.duration=3;v.videoWidth=0;v.videoHeight=0;v.onloadedmetadata();},1);
  const failed=await validateVideo(new Blob(['x']),3,{...unknown.options,aspectRatio:'9:16'});assert.equal(failed.valid,false);assert.equal(failed.actualSeconds,3);assert.equal(failed.aspectValid,false);assert.equal(failed.width,null);assert.deepEqual(unknown.counts(),[1,1]);
});
