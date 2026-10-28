import test from 'node:test';
import assert from 'node:assert/strict';
import {Studio} from '../dist/core.js';
import {GoogleGateway} from '../dist/google.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('initial3s360 wire request follows official fields;400 is classified without GET, fallback or exposing payload',async()=>{
 const sent=[];const secret='synthetic-private-value';
 const gateway=new GoogleGateway(()=>secret,{fetcher:async(url,options)=>{sent.push(JSON.parse(options.body));return json({error:{code:'parameter_unknown',message:`Unknown parameter 'response_format.duration'. ${secret} https://private.invalid/`}},400);}});
 const studio=new Studio(gateway);await studio.generate(secret,{aspectRatio:'16:9',resolution:'360p'},3);
 assert.equal(sent.length,1);assert.deepEqual(Object.keys(sent[0]).sort(),['input','model','response_format','store']);assert.deepEqual(sent[0].response_format,{type:'video',aspect_ratio:'16:9',resolution:'360p',duration:'3s',delivery:'uri'});assert.equal(sent[0].model,'gemini-omni-1.1-flash');assert.equal(sent[0].store,true);assert.deepEqual(Object.keys(sent[0].input[0]).sort(),['text','type']);assert.equal(studio.job,null);assert.equal(studio.versions.length,0);assert.doesNotMatch(studio.error,/synthetic-private|private.invalid/);
 const a=studio.diagnostics().attempts[0];assert.equal(a.requests.post,1);assert.equal(a.requests.get,0);assert.equal(a.receivedBytes,null);assert.equal(a.apiErrors[0].code,'parameter_unknown');assert.equal(a.requestSettings.duration,'3s');assert.equal(a.requestSettings.resolution,'360p');assert.equal(a.requestSettings.route,'initial');assert.doesNotMatch(JSON.stringify(a),/synthetic-private|private.invalid|inputText|x-goog|headers/);
});
test('prerequisite400 remains separate from quota429 and never implies the previous cause was identified',async()=>{
 for(const [status,code] of [[400,'failed_precondition'],[429,'quota_exceeded']]){
  let calls=0;const gateway=new GoogleGateway(()=> 'synthetic-only',{fetcher:async()=>{calls++;return json({error:{code,message:'private-project-and-prompt https://private.invalid'}},status);}});const studio=new Studio(gateway);await studio.generate('private user prompt',undefined,3);assert.equal(calls,1);assert.equal(studio.diagnostics().attempts[0].apiErrors[0].code,code);assert.match(studio.error,new RegExp(code));assert.doesNotMatch(studio.error,/private-project|private user|private.invalid/);
 }
});
test('diagnostics independently reallowlist error entries, cap them and discard raw objects/getters',async()=>{
 const gateway=new GoogleGateway(()=> 'synthetic-only',{fetcher:async()=>json({error:{code:'invalid_request',message:'private'}},400)});const studio=new Studio(gateway);await studio.generate('private',undefined,3);
 let getterCalls=0;const bad={httpStatus:400,field:'https://secret.invalid',message:'private-prompt',headers:{'x-goog-api-key':'synthetic-secret'}};Object.defineProperty(bad,'code',{get(){getterCalls++;return'synthetic-secret';}});
 studio.attempts[0].diagnostic.apiErrors=[...Array.from({length:25},()=>({httpStatus:400,code:'invalid_request',field:'response_format.duration',body:'synthetic-secret'})),bad];
 const exported=studio.diagnostics();assert.equal(exported.schemaVersion,3);const errors=exported.attempts[0].apiErrors;assert.equal(errors.length,20);assert.deepEqual(Object.keys(errors[0]).sort(),['code','field','httpStatus']);assert.equal(errors.at(-1).code,'unknown');assert.equal(errors.at(-1).field,null);assert.equal(getterCalls,0);assert.doesNotMatch(JSON.stringify(exported),/synthetic-secret|secret.invalid|private-prompt|x-goog-api-key|headers/);
});
test('GET500 with a terminal-looking body keeps pending lock and retry never sends anotherPOST',async()=>{
 let posts=0,gets=0;const gateway=new GoogleGateway(()=> 'synthetic-only',{wait:async()=>{},fetcher:async(url,options)=>{if(options.method==='POST'){posts++;return json({id:'v1_pending',status:'queued'});}gets++;return json({error:{code:'invalid_request',message:'private'}},500);}});const studio=new Studio(gateway);await studio.generate('private',undefined,3);const pending=studio.job;assert.ok(pending);assert.equal(posts,1);assert.equal(gets,1);assert.equal(await studio.generate('duplicate'),false);await studio.resume();assert.equal(studio.job,pending);assert.equal(posts,1);assert.equal(gets,2);assert.equal(studio.diagnostics().attempts[0].apiErrors.length,2);
});
