import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../dist/core.js';
import {GoogleGateway} from '../dist/google.js';
const {Studio,outputVideo,requestBody,verifyDuration}=core;
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const video=text=>({type:'video',data:btoa(text)});
const step=(...content)=>({type:'model_output',content});
const response=extra=>({id:'child-40',status:'completed',previous_interaction_id:'parent-30',steps:[step(video('40'))],...extra});
const parent={id:'parent-30',interactionId:'parent-30',seconds:30,viewed:true,blob:new Blob(['30'])};
function setup(actual=30.016){
  let posts=0,resolutions=0,measures=0;
  const studio=new Studio({create:async body=>{posts++;return{id:'attempt-'+posts};},resolve:async job=>{resolutions++;return{interactionId:job.interactionId,blob:new Blob([String(actual)])};}}, {validate:async()=>{measures++;return{valid:verifyDuration(actual,40),actualSeconds:actual};}});
  studio.versions=[{...parent}];studio.baseId=parent.id;studio.selectedId=parent.id;
  return {studio,posts:()=>posts,resolutions:()=>resolutions,measures:()=>measures,setActual:value=>{actual=value;}};
}
test('extension explicitly binds the previous video and requests an appended 10s / 40s full result',()=>{
  const body=requestBody('次の場面',parent);
  assert.match(body.input[0].text,/^\[# Sources <PREVIOUS_VIDEO>@Video1\]/);
  assert.match(body.input[0].text,/30-second/);assert.match(body.input[0].text,/40-second/);
  assert.match(body.input[0].text,/appending/);assert.equal(body.previous_interaction_id,parent.id);
  assert.equal(body.response_format.duration,'10s');assert.equal(body.generation_config,undefined);
  assert.doesNotMatch(requestBody('最初').input[0].text,/PREVIOUS_VIDEO/);
});
test('latest video wins within and across model output steps; latest user input is a boundary',()=>{
  assert.equal(atob(outputVideo({steps:[step(video('old')),step(video('new'))]}).data),'new');
  assert.equal(atob(outputVideo({steps:[step(video('old'),video('new'))]}).data),'new');
  assert.equal(outputVideo({steps:[step(video('old')),{type:'user_input',content:[]},step({type:'text',text:'no video'})]}),undefined);
});
test('latest video without payload cannot fall back to a stale video',async()=>{
  const latest={type:'video'};
  assert.equal(outputVideo({steps:[step(video('old'),latest)]}),latest);
  const gateway=new GoogleGateway(()=> 'synthetic-only');
  await assert.rejects(gateway.resolve({interactionId:'child-40',parentId:'parent-30',response:response({steps:[step(video('old'),latest)]})},()=>{}),e=>e.uncertain&&!e.terminal);
});
test('duration mismatch stays pending; local remeasurement and same-ID retrieval never create again',async()=>{
  const env=setup(),s=env.studio;await s.generate('continue');
  assert.ok(s.job);assert.equal(s.versions.length,1);assert.equal(s.rejections.length,1);
  assert.equal(await s.generate('duplicate'),false);assert.equal(env.posts(),1);
  await s.recheck();assert.equal(env.measures(),2);assert.equal(env.resolutions(),1);
  env.setActual(40);await s.resume();
  assert.equal(env.posts(),1);assert.equal(env.resolutions(),2);assert.equal(s.base.seconds,40);assert.equal(s.job,null);
  assert.equal(s.rejections.length,1);
});
test('all rejected attempts remain downloadable after explicit release and new paid generation',async()=>{
  const env=setup(),s=env.studio;await s.generate('first');const first=s.rejections[0].blob;
  s.abandon();await s.generate('second');
  assert.equal(env.posts(),2);assert.equal(s.rejections.length,2);
  assert.equal(s.rejections[0].blob,first);assert.equal(s.base.seconds,30);
});
test('unreadable metadata retains a local result and can be measured again without retrieval',async()=>{
  const env=setup(NaN),s=env.studio;await s.generate('continue');
  assert.ok(s.job.result);assert.equal(s.rejections[0].actualSeconds,null);
  env.setActual(40);await s.recheck();assert.equal(s.base.seconds,40);
  assert.equal(env.posts(),1);assert.equal(env.resolutions(),1);
  assert.equal(s.rejections[0].accepted,true);assert.equal(s.rejections[0].actualSeconds,40);
  assert.equal(s.rejections[0].blob,s.base.blob);
});
test('same-ID retrieval deduplicates identical bytes but retains changed output bytes',async()=>{
  const env=setup(),s=env.studio;await s.generate('continue');
  const original=s.rejections[0].blob;
  for(let i=0;i<3;i++)await s.resume();
  assert.equal(env.posts(),1);assert.equal(s.rejections.length,1);assert.equal(s.job.result.blob,original);
  env.setActual(30.02);await s.resume();assert.equal(s.rejections.length,2);
});
test('normal response with a different parent cannot be attached to the current lineage',async()=>{
  const gateway=new GoogleGateway(()=> 'synthetic-only');
  await assert.rejects(gateway.resolve({interactionId:'child-40',parentId:'parent-30',response:response({previous_interaction_id:'wrong-parent'})},()=>{}),e=>e.uncertain&&!e.terminal);
});
test('missing parent metadata triggers input-inclusive GET before accepting a result',async()=>{
  const urls=[];const gateway=new GoogleGateway(()=> 'synthetic-only',{fetcher:async url=>{urls.push(url);return json(response());}});
  await gateway.resolve({interactionId:'child-40',parentId:'parent-30',response:response({previous_interaction_id:undefined})},()=>{});
  assert.equal(urls.length,1);assert.equal(new URL(urls[0]).searchParams.get('include_input'),'true');
  const absent=new GoogleGateway(()=> 'synthetic-only',{fetcher:async()=>json(response({previous_interaction_id:undefined}))});
  await assert.rejects(absent.resolve({interactionId:'child-40',parentId:'parent-30'},()=>{}),e=>e.uncertain);
});
test('manual recovery requests input and normalizes all official top-level text input forms',async()=>{
  const text=requestBody('continue',parent).input[0].text;
  for(const input of [text,{type:'text',text},[{type:'text',text}],[{type:'user_input',content:[{type:'text',text}]}]]){
    const gateway=new GoogleGateway(()=> 'synthetic-only',{fetcher:async url=>{
      assert.equal(new URL(url).searchParams.get('include_input'),'true');return json(response({input}));
    }});
    const result=await gateway.resolve({interactionId:'child-40',parentId:'parent-30',inputText:text,manualRecovery:true},()=>{});
    assert.equal(await result.blob.text(),'40');
  }
});
test('conflicting top-level input and latest user input cannot pass manual recovery',async()=>{
  const text=requestBody('continue',parent).input[0].text;
  const gateway=new GoogleGateway(()=> 'synthetic-only',{fetcher:async()=>json(response({input:text,steps:[{type:'user_input',content:[{type:'text',text:'other'}]},step(video('40'))]}))});
  await assert.rejects(gateway.resolve({interactionId:'child-40',parentId:'parent-30',inputText:text,manualRecovery:true},()=>{}),e=>e.uncertain);
});
test('diagnostic export is an allowlist and never exports secrets, prompts, IDs, URIs or video bodies',async()=>{
  const env=setup(),s=env.studio;await s.generate('private-prompt');
  s.job.diagnostic.injected='private-key https://secret.example private-body';
  const exported=JSON.stringify(s.diagnostics());
  for(const value of ['private-prompt','private-key','https://','private-body','parent-30','attempt-1','data:','inputText','blob'])assert.equal(exported.includes(value),false,value);
  const data=s.diagnostics();assert.equal(data.attempts.length,1);assert.equal(data.attempts[0].expectedSeconds,40);assert.equal(data.attempts[0].measurements[0].actualSeconds,30.016);
});
test('40-second boundary remains strict despite audio/container tails',()=>{
  assert.equal(verifyDuration(30.016,30),true);assert.equal(verifyDuration(40.016,40),false);
  assert.equal(verifyDuration(40,40),true);assert.equal(verifyDuration(30.016,40),false);
});
test('actual gateway diagnostics contain selection and status but exclude complete response fields',async()=>{
  const gateway=new GoogleGateway(()=> 'synthetic-secret-key',{fetcher:async(url,options)=>json({
    ...response(),id:'private-interaction-id',input:JSON.parse(options.body).input,
    steps:[step(video('private-video-body'))],errors:[{message:'private-server-message'}],secret:'synthetic-secret-key',uri:'https://private.example',
  })});
  const s=new Studio(gateway,{validate:async()=>({valid:false,actualSeconds:30.016})});
  s.versions=[{...parent}];s.baseId=parent.id;await s.generate('private-user-prompt');
  const exported=JSON.stringify(s.diagnostics());
  for(const value of ['synthetic-secret-key','private-interaction-id','private-video-body','private-server-message','https://','private-user-prompt'])assert.equal(exported.includes(value),false);
  const a=s.diagnostics().attempts[0];assert.equal(a.requests.post,1);assert.equal(a.selection.count,1);assert.deepEqual(a.statuses,['completed']);
});
test('history selection during an operation cannot alter the frozen parent and explicit fork plans 30s',async()=>{
  let release,body,notifySent;let sent=new Promise(resolve=>{notifySent=resolve;});const receipt=new Promise(resolve=>{release=resolve;});
  const s=new Studio({create:async value=>{body=value;notifySent();return receipt;},resolve:async pending=>({interactionId:pending.interactionId,blob:new Blob(['ok'])})});
  s.versions=[{...parent,id:'older-20',interactionId:'older-20',seconds:20},{...parent}];s.baseId=parent.id;
  const running=s.generate('continue');s.select('older-20');assert.throws(()=>s.fork('older-20'),/処理中/);
  await sent;assert.equal(body.previous_interaction_id,parent.id);assert.equal(s.job.seconds,40);
  release({id:'new-40'});await running;assert.equal(s.base.parentId,parent.id);
  s.fork('older-20');assert.match(s.notice,/20秒版を延長の元/);assert.match(s.notice,/追加する長さを選び/);assert.doesNotMatch(s.notice,/40秒/);
  sent=new Promise(resolve=>{notifySent=resolve;});const branch=s.generate('branch');await sent;assert.equal(body.previous_interaction_id,'older-20');assert.equal(s.job.seconds,30);await branch;
});
test('untrusted video URL does not send a key or release a pending generation',async()=>{
  let fetches=0;const gateway=new GoogleGateway(()=> 'synthetic-only',{fetcher:async()=>{fetches++;throw Error('must not fetch');}});
  await assert.rejects(gateway.resolve({interactionId:'child-40',parentId:parent.id,response:response({steps:[step({type:'video',uri:'https://evil.example/private'})]})},()=>{}),e=>e.uncertain&&!e.terminal);
  assert.equal(fetches,0);
});
