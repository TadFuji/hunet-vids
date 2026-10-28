import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleGateway, safeVideoUrl } from '../dist/google.js';
import { Studio, requestBody } from '../dist/core.js';

const json = (data, status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const video = value => ({id:'v1_test',status:'completed',steps:[{type:'model_output',content:[{type:'video',mime_type:'video/mp4',...value}]}]});
const TEST_KEY = 'placeholder-unit-test-only';

test('POST once, poll interaction completion, poll ACTIVE, then download', async () => {
  const requests=[];
  const responses=[json({id:'v1_test',status:'in_progress'}),json(video({uri:'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media'})),json({state:'PROCESSING'}),json({state:'ACTIVE'}),new Response('video-bytes')];
  const gateway=new GoogleGateway(()=>TEST_KEY,{wait:async()=>{},fetcher:async(url,options)=>{requests.push({url,options});return responses.shift();}});
  const initial=await gateway.create(requestBody('test'));
  const job={response:initial,interactionId:initial.id};
  const result=await gateway.resolve(job,()=>{});
  assert.equal(await result.blob.text(),'video-bytes'); assert.equal(result.interactionId,'v1_test');
  assert.equal(requests.filter(r=>r.options.method==='POST').length,1);
  assert.equal(requests[1].url,'https://generativelanguage.googleapis.com/v1beta/interactions/v1_test?include_input=true');
  assert.equal(requests[4].url,'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media');
  for (const r of requests) {
    assert.equal(r.options.headers['x-goog-api-key'],TEST_KEY);
    assert.equal(r.options.redirect,'error'); assert.equal(r.options.credentials,'omit');
    assert.equal(r.url.includes(TEST_KEY),false); assert.equal(r.url.includes('key='),false);
  }
});

test('GET recovery decodes inline REST video and never POSTs', async () => {
  const requests=[];
  const gateway=new GoogleGateway(()=>TEST_KEY,{fetcher:async(url,options)=>{requests.push(options);return json(video({data:btoa('MP4')}));}});
  const result=await gateway.resolve({interactionId:'v1_test',response:null},()=>{});
  assert.equal(await result.blob.text(),'MP4'); assert.equal(requests.length,1);
  assert.equal(requests[0].method,undefined);
});

test('failed interaction, failed file and completed without video are not successful', async () => {
  for (const value of [{id:'v1_test',status:'failed'}, {id:'v1_test',status:'cancelled'}, {id:'v1_test',status:'incomplete'}, {id:'v1_test',status:'completed',steps:[]}]) {
    const gateway=new GoogleGateway(()=>TEST_KEY);
    await assert.rejects(gateway.resolve({response:value,interactionId:'v1_test'},()=>{}),e=>value.status === 'completed' ? e.uncertain && !e.terminal : e.terminal);
  }
  const gateway=new GoogleGateway(()=>TEST_KEY,{fetcher:async()=>json({state:'FAILED'})});
  await assert.rejects(gateway.resolve({response:video({uri:'https://generativelanguage.googleapis.com/v1beta/files/abc'}),interactionId:'v1_test'},()=>{}),e=>e.terminal);
});

test('network failure never retries and HTTP bodies cannot leak into errors', async () => {
  let count=0;
  const gateway=new GoogleGateway(()=>TEST_KEY,{fetcher:async()=>{count++;throw new Error(TEST_KEY);}});
  await assert.rejects(gateway.create(requestBody('test')),e=>e.uncertain&&!e.message.includes(TEST_KEY)); assert.equal(count,1);
  const rejected=new GoogleGateway(()=>TEST_KEY,{fetcher:async()=>json({error:{message:TEST_KEY}},401)});
  await assert.rejects(rejected.create(requestBody('test')),e=>e.terminal&&!e.message.includes(TEST_KEY));
  const serverFailure=new GoogleGateway(()=>TEST_KEY,{fetcher:async()=>json({},500)});
  await assert.rejects(serverFailure.create(requestBody('test')),e=>e.uncertain&&!e.terminal);
});

test('key is sent only to a strictly validated Google file URL', () => {
  assert.equal(safeVideoUrl('https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media').origin,'https://generativelanguage.googleapis.com');
  for (const uri of ['https://evil.example/v1beta/files/abc','https://generativelanguage.googleapis.com.evil.example/v1beta/files/abc','http://generativelanguage.googleapis.com/v1beta/files/abc','https://user:pass@generativelanguage.googleapis.com/v1beta/files/abc','https://generativelanguage.googleapis.com/v1beta/files/abc?key=secret','https://generativelanguage.googleapis.com/v1beta/files/abc#secret','data:video/mp4,abc']) assert.throws(()=>safeVideoUrl(uri));
});

test('timeout and unexpected state remain recoverable and never complete early', async () => {
  const gateway=new GoogleGateway(()=>TEST_KEY,{polls:2,wait:async()=>{},fetcher:async()=>json({id:'v1_test',status:'in_progress'})});
  await assert.rejects(gateway.resolve({interactionId:'v1_test'},()=>{}),e=>e.uncertain);
  await assert.rejects(gateway.resolve({response:{id:'v1_test',status:'requires_action'},interactionId:'v1_test'},()=>{}),e=>e.uncertain);
});

test('CORS or malformed response cannot trigger a second create', async () => {
  let count=0;
  const gateway=new GoogleGateway(()=>TEST_KEY,{fetcher:async()=>{count++;return new Response('not-json');}});
  await assert.rejects(gateway.create(requestBody('test')),e=>e.uncertain); assert.equal(count,1);
});

test('manually recovered ID must match the exact prompt and parent interaction', async () => {
  const prompt = requestBody('original',{interactionId:'parent-1'}).input[0].text;
  const makeInteraction = (text,parent) => ({...video({data:btoa('MP4')}),previous_interaction_id:parent,steps:[{type:'user_input',content:[{type:'text',text}]},...video({data:btoa('MP4')}).steps]});
  for (const response of [makeInteraction('different','parent-1'),makeInteraction(prompt,'wrong-parent')]) {
    const gateway=new GoogleGateway(()=>TEST_KEY,{fetcher:async()=>json(response)});
    await assert.rejects(gateway.resolve({interactionId:'v1_test',manualRecovery:true,inputText:prompt,parentId:'parent-1'},()=>{}),e=>e.uncertain);
  }
  const gateway=new GoogleGateway(()=>TEST_KEY,{fetcher:async()=>json(makeInteraction(prompt,'parent-1'))});
  const result=await gateway.resolve({interactionId:'v1_test',manualRecovery:true,inputText:prompt,parentId:'parent-1'},()=>{});
  assert.equal(await result.blob.text(),'MP4');
});

test('mismatched response ID cannot replace the pending interaction', async () => {
  const gateway=new GoogleGateway(()=>TEST_KEY,{fetcher:async()=>json({...video({data:btoa('MP4')}),id:'other-id'})});
  const job={interactionId:'v1_test'};
  await assert.rejects(gateway.resolve(job,()=>{}),e=>e.uncertain);
  assert.equal(job.interactionId,'v1_test');
});

test('an unrelated failed recovery ID cannot release the uncertain original request', async () => {
  for (const status of ['failed','cancelled','incomplete']) {
    const response={id:'v1_test',status,previous_interaction_id:'other-parent',steps:[{type:'user_input',content:[{type:'text',text:'unrelated'}]}]};
    const gateway=new GoogleGateway(()=>TEST_KEY,{fetcher:async()=>json(response)});
    await assert.rejects(gateway.resolve({interactionId:'v1_test',manualRecovery:true,inputText:'original',parentId:'original-parent'},()=>{}),e=>e.uncertain&&!e.terminal);
  }
});

test('client keys are isolated and clearing memory prevents further authenticated requests', async () => {
  let firstKey = 'placeholder-first-session';
  let secondKey = 'placeholder-second-session';
  const firstRequests=[], secondRequests=[];
  const first=new GoogleGateway(()=>firstKey,{fetcher:async(url,options)=>{firstRequests.push({url,options});return json({id:'first'});}});
  const second=new GoogleGateway(()=>secondKey,{fetcher:async(url,options)=>{secondRequests.push({url,options});return json({id:'second'});}});
  await first.create(requestBody('first')); await second.create(requestBody('second'));
  assert.equal(firstRequests[0].options.headers['x-goog-api-key'],'placeholder-first-session');
  assert.equal(secondRequests[0].options.headers['x-goog-api-key'],'placeholder-second-session');
  firstKey = '';
  await assert.rejects(first.create(requestBody('cleared')),/Gemini の API キーを入力してください/);
  assert.equal(firstRequests.length,1);
  await second.create(requestBody('unaffected')); assert.equal(secondRequests.length,2);
  secondKey = '';
  const newSession=new GoogleGateway(()=>'',{fetcher:async()=>{throw new Error('must never send');}});
  await assert.rejects(newSession.create(requestBody('new session')),/Gemini の API キーを入力してください/);
});
test('blank keys prevent every authenticated operation and preserve a pending job for key reentry',async()=>{
  let key='placeholder-only',posts=0,gets=0,networkFailed=true;
  const gateway=new GoogleGateway(()=>key,{wait:async()=>{},fetcher:async(url,options)=>{
    if(options.method==='POST'){posts++;return json({id:'v1_pending',status:'in_progress'});}
    gets++;if(networkFailed)throw Error('synthetic interruption');
    return json({...video({data:btoa('synthetic')}),id:'v1_pending'});
  }});
  const studio=new Studio(gateway);await studio.generate('synthetic scene');const pending=studio.job;
  assert.ok(pending);assert.equal(posts,1);assert.equal(gets,1);
  for(const value of ['', '   ']){
    key=value;await studio.resume();assert.equal(studio.job,pending);assert.equal(gets,1);
    assert.equal(await studio.generate('blocked'),false);assert.equal(posts,1);
    await assert.rejects(gateway.create(requestBody('blocked')),e=>e.uncertain&&!e.terminal);
  }
  key='placeholder-only';networkFailed=false;await studio.resume();
  assert.equal(posts,1);assert.equal(gets,2);assert.equal(studio.base.seconds,10);
});
