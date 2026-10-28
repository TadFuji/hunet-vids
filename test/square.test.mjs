import test from 'node:test';
import assert from 'node:assert/strict';
import {Studio,StudioError,requestBody,verifyAspectRatio,videoSettings,formatVideoSettings} from '../dist/core.js';
const settings={aspectRatio:'9:16',resolution:'360p'};
const clip=(seconds,width=360,height=640)=>new Blob([JSON.stringify({seconds,width,height})],{type:'video/mp4'});
function fixture(){
 const calls=[],prepares=[];const state={output:[360,640],prepared:[360,640],cut:[360,640],assembled:[360,640],terminal:false};let resolves=0;
 const studio=new Studio({async create(body,d,job){calls.push({body,source:job.uploadSource,previous:job.previousInteractionId});d.post=(d.post||0)+1;if(state.terminal)throw new StudioError('この画角の要求はAPIに拒否されました（HTTP 400）。',{terminal:true});return{id:'square_'+calls.length};},async resolve(job){resolves++;return{interactionId:job.interactionId,blob:clip(job.apiExpectedSeconds,...state.output)};}},{
  validate:async(blob,expected,options={})=>{const m=JSON.parse(await blob.text());const durationValid=Math.abs(m.seconds-expected)<=.1&&m.seconds<=(options.maxSeconds??40);const aspectValid=!options.aspectRatio||verifyAspectRatio(m.width,m.height,options.aspectRatio);return{valid:durationValid&&aspectValid,actualSeconds:m.seconds,width:m.width,height:m.height,durationValid,aspectValid};},
  trim:async(blob,seconds,config)=>{assert.equal(config.aspectRatio,'9:16');return{blob:clip(seconds,...state.cut),actualSeconds:seconds};},
  prepare:async(blob)=>{prepares.push(blob);const {seconds}=JSON.parse(await blob.text()),tailSeconds=Math.min(10,seconds);return{originalBlob:blob,tailBlob:clip(tailSeconds,...state.prepared),sourceSeconds:seconds,tailSeconds,prefixSeconds:seconds-tailSeconds,settings};},
  compose:async(source,ending,expected)=>({blob:clip(expected,...state.assembled),actualSeconds:expected}),
 });
 return{studio,calls,state,prepares,resolves:()=>resolves};
}
const watched=f=>f.studio.viewed(f.studio.baseId);
test('stable allowlist rejects square generation, import and extension before any API request',async()=>{
 const f=fixture(),square={aspectRatio:'1:1',resolution:'360p'};
 assert.throws(()=>videoSettings(square),/対応している/);
 assert.throws(()=>requestBody('square',null,square,3),/対応している/);
 await assert.rejects(f.studio.generate('square',square,3),/対応している/);assert.equal(f.calls.length,0);
 const source={originalBlob:clip(60,360,360),tailBlob:clip(10,360,360),sourceSeconds:60,tailSeconds:10,prefixSeconds:50,settings:square};
 assert.throws(()=>f.studio.importSource(source),/対応している/);assert.equal(f.studio.versions.length,0);
 const old={id:'historical',interactionId:'historical',seconds:10,viewed:true,settings:square,blob:source.tailBlob};
 f.studio.versions=[old];f.studio.baseId=old.id;await assert.rejects(f.studio.generate('continue'),/対応している/);assert.equal(f.calls.length,0);assert.equal(f.studio.base,old);
});
test('both rectangular routes explicitly request their shape and upload inherits without a ratio parameter',()=>{
 for(const aspectRatio of ['16:9','9:16']){
  const config={aspectRatio,resolution:'360p'};assert.equal(requestBody('new',null,config,3).response_format.aspect_ratio,aspectRatio);
  assert.equal(requestBody('next',{interactionId:'prior',seconds:10,settings:config},undefined,7).response_format.aspect_ratio,aspectRatio);
  const uploaded=requestBody('upload',{source:{},interactionId:null,seconds:10,settings:config},undefined,7);assert.equal(uploaded.response_format.aspect_ratio,undefined);assert.equal(uploaded.generation_config.video_config.task,'extend');
 }
 assert.equal(verifyAspectRatio(360,360,'1:1'),false);assert.equal(verifyAspectRatio(854,480,'16:9'),true);assert.equal(verifyAspectRatio(640,362,'16:9'),false);
});
test('native portrait extension and explicit branch freeze settings, save measured pixels and never fallback',async()=>{
 const f=fixture();await f.studio.generate('first',settings);const first=f.studio.base;assert.equal(first.width,360);assert.equal(first.height,640);watched(f);await f.studio.generate('next',{aspectRatio:'16:9',resolution:'720p'},7);assert.equal(f.studio.base.seconds,17);assert.equal(f.calls[1].body.response_format.aspect_ratio,'9:16');assert.equal(f.calls[1].body.previous_interaction_id,first.id);assert.equal(f.studio.base.settings.aspectRatio,'9:16');f.studio.fork(first.id);await f.studio.generate('branch',undefined,3);assert.equal(f.calls[2].body.response_format.aspect_ratio,'9:16');assert.equal(f.studio.base.seconds,13);assert.equal(f.studio.base.parentId,first.id);
});
test('wrong returned aspect is inspectable, blocks success/duplicates, recheck stays local and GET can recover portrait',async()=>{
 const f=fixture();f.state.output=[640,360];await f.studio.generate('private square prompt',settings,3);const job=f.studio.job;assert.equal(f.calls.length,1);assert.equal(f.studio.versions.length,0);assert.equal(job.reviewReason,'aspect');assert.match(f.studio.error,/画角/);assert.equal(f.studio.rejected.width,640);assert.equal(f.studio.rejected.height,360);assert.equal(f.studio.rejected.expectedAspectRatio,'9:16');assert.equal(await f.studio.generate('double'),false);await f.studio.recheck();assert.equal(f.calls.length,1);assert.equal(f.resolves(),1);assert.equal(f.studio.job,job);
 const d=f.studio.diagnostics().attempts[0];assert.equal(d.measurements[0].result,'aspect');assert.equal(d.measurements[0].width,640);assert.equal(d.measurements[0].expectedAspectRatio,'9:16');assert.doesNotMatch(JSON.stringify(d),/private|square_|blob:|https?:\/\/|"uri"\s*:/);
 f.state.output=[360,640];await f.studio.resume();assert.equal(f.calls.length,1);assert.equal(f.resolves(),2);assert.equal(f.studio.base.width,360);assert.equal(f.studio.base.settings.aspectRatio,'9:16');assert.equal(f.studio.rejected.width,640);assert.equal(f.studio.rejected.accepted,false);
});
test('rebased portrait extends its current pixels through upload and composition with no old previousID',async()=>{
 const f=fixture();await f.studio.generate('short',settings,3);const first=f.studio.base;first.requiresUpload=true;assert.equal(first.width,360);assert.equal(first.rawActualSeconds,3);assert.equal(first.actualSeconds,3);watched(f);await f.studio.generate('continue',undefined,7);assert.equal(f.prepares[0],first.blob);assert.equal(f.calls[1].body.response_format.aspect_ratio,undefined);assert.equal(f.calls[1].body.previous_interaction_id,undefined);assert.equal(f.calls[1].body.generation_config.video_config.task,'extend');assert.equal(f.studio.base.seconds,10);assert.equal(f.studio.base.width,360);assert.equal(f.studio.base.height,640);
});
test('a wrong-aspect rebase tail is blocked before Files or paid create',async()=>{
 const f=fixture();await f.studio.generate('three',settings,3);const previous=f.studio.base;previous.requiresUpload=true;watched(f);f.state.prepared=[640,360];await f.studio.generate('next',undefined,7);assert.equal(f.calls.length,1);assert.equal(f.studio.base,previous);assert.equal(f.studio.job.requestReady,false);assert.equal(f.studio.diagnostics().attempts[1].measurements[0].phase,'prepared');assert.equal(f.studio.diagnostics().attempts[1].measurements[0].result,'aspect');await assert.rejects(f.studio.resume('unrelated'),/生成は送信していません/);
});
test('post-composition dimension checks retain raw results and retry locally without a new POST',async()=>{
 const f=fixture();await f.studio.generate('three',settings,3);const first=f.studio.base;first.requiresUpload=true;
 watched(f);f.state.assembled=[640,360];await f.studio.generate('next',undefined,7);const pending=f.studio.job.result.blob;assert.equal(f.studio.versions.length,1);assert.equal(f.studio.rejected.blob,pending);assert.equal(f.studio.diagnostics().attempts[1].measurements.at(-1).result,'aspect');f.state.assembled=[360,640];await f.studio.recheck();assert.equal(f.calls.length,2);assert.equal(f.studio.base.width,360);assert.equal(f.studio.base.seconds,10);
});
test('API refusal preserves existing portrait and never retries, changes aspect or crops',async()=>{
 const f=fixture();await f.studio.generate('first',settings,3);const prior=f.studio.base;watched(f);f.state.terminal=true;await f.studio.generate('next',undefined,7);assert.equal(f.calls.length,2);assert.equal(f.studio.versions.length,1);assert.equal(f.studio.base,prior);assert.equal(f.studio.job,null);assert.match(f.studio.error,/HTTP 400/);assert.equal(f.calls.at(-1).body.response_format.aspect_ratio,'9:16');
});
