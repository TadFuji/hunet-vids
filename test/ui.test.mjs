import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Studio,StudioError,DEFAULT_VIDEO_SETTINGS,LEGACY_VIDEO_SETTINGS,videoSettings,formatVideoSettings,canExtend,secondsLabel} from '../dist/core.js';

// Execute the actual app module with a small DOM fixture and an entirely local
// gateway. No browser secrets, network or model generation are involved.
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.events=new Map();this.value='';this.checked=false;this.disabled=false;this.hidden=false;const classes=new Set();this.classList={toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(name,value){this[name]=value;}
  removeAttribute(name){delete this[name];}
  querySelectorAll(tag){return this.children.filter(n=>n.tag===tag);}
  querySelector(tag){return this.children.find(n=>n.tag===tag)||new Element(tag);}
  addEventListener(name,fn,options={}){const items=this.events.get(name)||[];items.push({fn,once:options.once});this.events.set(name,items);}
  async emit(name){const list=[...(this.events.get(name)||[])];this.events.set(name,list.filter(e=>!e.once));for(const e of list)await e.fn({preventDefault(){},persisted:false});}
  focus(options){this.focusCalls=(this.focusCalls||0)+1;this.focusOptions=options;}
  scrollIntoView(options){this.scrollCalls=(this.scrollCalls||0)+1;this.scrollOptions=options;}
  play(){this.playCalls=(this.playCalls||0)+1;return this.playImplementation?.()||Promise.resolve();}
  load(){} showModal(){this.open=true;}
}
async function fixture({withKey=true,sourceAspectRatio='16:9',localMediaEnabled=true,browserMediaEnabled=false}={}){
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  for(const match of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))for(const option of match[2].matchAll(/<option value="([^"]+)"/g)){const node=new Element('option');node.value=option[1];nodes[match[1]].append(node);}
  let good=false,wrongAspect=false,rejectCreate=false,posts=0,gets=0,urlIndex=0;
  const size=ratio=>ratio==='9:16'?{width:720,height:1280}:{width:1280,height:720};const blobs=new Map(),alerts=[],bodies=[];
  class MockGateway {
    constructor(getKey){this.getKey=getKey;}
    async create(body){bodies.push(body);if(!this.getKey())throw new StudioError('APIキーを入力してください。',{uncertain:true});const id='synthetic-'+(++posts);if(rejectCreate)throw new StudioError('synthetic API rejection',{terminal:true});return{id};}
    async resolve(job){if(!this.getKey())throw new StudioError('APIキーを入力してください。',{uncertain:true});gets++;return{interactionId:job.interactionId,blob:new Blob(['synthetic-video-'+job.interactionId])};}
  }
  const mediaControl = { readyCalls:0, cancelCalls:0, failReady:false, gate:null };
  const validationControl = { gate:null, started:null };
  const context=vm.createContext({localMediaEnabled,browserMediaEnabled,createBrowserMedia:({onState})=>({
    async ensureReady(){mediaControl.readyCalls++;onState({phase:'loading',busy:true});mediaControl.started?.();if(mediaControl.gate)await mediaControl.gate;if(mediaControl.failReady){onState({phase:'error',busy:false});throw new StudioError('合成の読込失敗');}onState({phase:'ready',busy:false});},
    async prepareSource(...args){await this.ensureReady();return context.prepareSource(...args);},
    prepareContinuation:(...args)=>context.prepareContinuation(...args),trimVideo:(...args)=>context.trimVideo(...args),composeSource:(...args)=>context.composeSource(...args),
    cancel(){mediaControl.cancelCalls++;onState({phase:'cancelled',busy:false});},dispose(){},
  }),Studio,StudioError,DEFAULT_VIDEO_SETTINGS,LEGACY_VIDEO_SETTINGS,videoSettings,formatVideoSettings,canExtend,secondsLabel,GoogleGateway:MockGateway,Blob,
    prepareSource:async file=>({originalBlob:file,tailBlob:new Blob(['tail'],{type:'video/mp4'}),sourceSeconds:60,tailSeconds:10,prefixSeconds:50,settings:{aspectRatio:sourceAspectRatio,resolution:'720p'},...size(sourceAspectRatio),name:'synthetic.mp4',hasAudio:true}),
    prepareContinuation:async file=>({originalBlob:file,tailBlob:new Blob(['tail'],{type:'video/mp4'}),sourceSeconds:10,tailSeconds:10,prefixSeconds:0,settings:{aspectRatio:'16:9',resolution:'360p'},name:'continuation.mp4',hasAudio:true}),
    trimVideo:async(blob,expected,settings)=>({blob:new Blob(['trimmed']),actualSeconds:expected,...size(settings?.aspectRatio)}),
    composeSource:async(source,ending,expected)=>({blob:new Blob(['composed']),actualSeconds:expected,...size(source.settings?.aspectRatio)}),
    mixAudio:async(videoBlob,audioBlob,options={})=>({blob:new Blob(['mixed-video']),actualSeconds:10,...size(sourceAspectRatio)}),
    validateVideo:async(blob,expected,options={})=>{validationControl.started?.();if(validationControl.gate)await validationControl.gate;return {valid:good&&!wrongAspect,durationValid:good,aspectValid:good&&!wrongAspect,actualSeconds:good?expected:null,...(good?size(wrongAspect?'16:9':options.aspectRatio):{width:null,height:null})};},
    URL:{createObjectURL:blob=>{const url='blob:fixture-'+(++urlIndex);blobs.set(url,blob);return url;},revokeObjectURL:url=>blobs.delete(url)},
    document:{getElementById:id=>nodes[id],querySelectorAll:()=>[],createElement:tag=>new Element(tag)},
    window:{addEventListener(){},alert:message=>alerts.push(message)}});
  const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  vm.runInContext(source+'\n globalThis.fixture={get studio(){return studio;},render};',context);
  const api={nodes,blobs,alerts,bodies,mediaControl,validationControl,get studio(){return context.fixture.studio;},render:context.fixture.render,setGood:value=>{good=value;},setWrongAspect:value=>{wrongAspect=value;},setRejectCreate:value=>{rejectCreate=value;},posts:()=>posts,gets:()=>gets,
    async applyKey(){nodes['api-key'].value='unit-test-placeholder-only';await nodes['api-key'].emit('input');},
    async generate(){nodes.prompt.value='synthetic scene';await nodes.prompt.emit('input');await nodes['generate-form'].emit('submit');}};
  if(withKey)await api.applyKey();return api;
}
test('recovery controls remeasure locally and update labels without rebuilding video elements',async()=>{
  const f=await fixture();await f.generate();
  assert.equal(f.nodes.recovery.hidden,false);assert.equal(f.nodes.recheck.hidden,false);
  assert.equal(f.nodes.generate.disabled,true);assert.equal(f.posts(),1);
  const card=f.nodes['inspection-list'].children[0],video=card.querySelector('video');
  assert.match(card.querySelector('p').textContent,/未計測/);
  f.setGood(true);await f.nodes.recheck.emit('click');
  assert.equal(f.posts(),1);assert.equal(f.nodes.recovery.hidden,true);
  assert.equal(card.querySelector('video'),video);assert.match(card.querySelector('p').textContent,/採用済み/);
  assert.doesNotMatch(card.querySelector('p').textContent,/未計測|延長には使いません/);
  const diagnostic=JSON.parse(await f.blobs.get(f.nodes['diagnostic-download'].href).text());
  assert.equal(diagnostic.attempts[0].outcome,'accepted');
});
test('explicit release preserves output and does not submit a new generation',async()=>{
  const f=await fixture();await f.generate();
  const release=f.nodes.abandon.emit('click');
  assert.equal(f.nodes['confirm-dialog'].open,true);assert.equal(f.posts(),1);
  f.nodes['confirm-check'].checked=true;await f.nodes['confirm-check'].emit('change');
  f.nodes['confirm-dialog'].returnValue='ok';await f.nodes['confirm-dialog'].emit('close');await release;
  assert.equal(f.studio.job,null);assert.equal(f.studio.rejections.length,1);
  assert.equal(f.posts(),1);
  await f.generate();assert.equal(f.posts(),2);assert.equal(f.studio.rejections.length,2);
});
test('40s screen disables extension and does not claim playback unlocks another extension',async()=>{
  const f=await fixture();
  const v={id:'synthetic-40',interactionId:'synthetic-40',seconds:40,actualSeconds:40,blob:new Blob(['synthetic']),viewed:false,prompt:'synthetic',parentId:null};
  f.studio.versions=[v];f.studio.baseId=v.id;f.studio.selectedId=v.id;f.render();
  assert.equal(f.nodes.generate.disabled,true);assert.equal(f.nodes.prompt.disabled,true);
  assert.match(f.nodes['view-state'].textContent,/この展開は完成/);
  assert.doesNotMatch(f.nodes['view-state'].textContent,/延長できる/);
});
test('without a key the UI blocks generation and API retrieval, including submitted events',async()=>{
  const f=await fixture({withKey:false});await f.generate();
  assert.equal(f.posts(),0);assert.equal(f.nodes.generate.disabled,false);assert.equal(f.nodes.generate.classList.contains('needs-key'),true);assert.equal(f.nodes.resume.disabled,true);
  assert.deepEqual(f.alerts,['Gemini の API キーを入力してください']);
  await f.nodes.resume.emit('click');assert.equal(f.gets(),0);
});
test('forgetting a key keeps completed video playback, downloads and diagnostics available',async()=>{
  const f=await fixture();f.setGood(true);await f.generate();
  const original=f.studio.selected,src=f.nodes.video.src,download=f.nodes.download.href;
  await f.nodes['forget-key'].emit('click');
  assert.equal(f.studio.selected,original);assert.equal(f.nodes.video.src,src);assert.equal(f.nodes.download.href,download);
  assert.equal(f.nodes.video.hidden,false);assert.equal(f.nodes.download.hidden,false);assert.equal(f.nodes['diagnostics-panel'].hidden,false);
  f.studio.viewed(original.id);await f.generate();assert.equal(f.posts(),1);assert.equal(f.nodes.generate.classList.contains('needs-key'),true);
  assert.equal(f.alerts.at(-1),'Gemini の API キーを入力してください');
});
test('whitespace-only input and deleting an entered key restore the exact alert without requests',async()=>{
  const f=await fixture({withKey:false});
  f.nodes['api-key'].value='   ';await f.nodes['api-key'].emit('input');await f.generate();
  assert.equal(f.posts(),0);assert.equal(f.alerts.at(-1),'Gemini の API キーを入力してください');
  await f.applyKey();assert.equal(f.nodes.generate.classList.contains('needs-key'),false);
  f.nodes['api-key'].value='';await f.nodes['api-key'].emit('input');await f.generate();
  assert.equal(f.posts(),0);assert.equal(f.alerts.length,2);assert.equal(f.nodes['key-state'].textContent,'キー未入力');
});
test('busy, pending and maximum-duration locks remain stronger than the missing-key explanation',async()=>{
  const f=await fixture({withKey:false});
  f.studio.busy=true;f.render();await f.generate();assert.equal(f.nodes.generate.disabled,true);assert.equal(f.alerts.length,0);
  f.studio.busy=false;f.studio.job={stage:'pending'};f.render();await f.generate();assert.equal(f.nodes.generate.disabled,true);assert.equal(f.alerts.length,0);
  f.studio.job=null;f.studio.versions=[{id:'max',seconds:40,blob:new Blob(['synthetic']),prompt:'synthetic',actualSeconds:40}];f.studio.baseId='max';f.studio.selectedId='max';f.render();await f.generate();
  assert.equal(f.nodes.generate.disabled,true);assert.equal(f.alerts.length,0);assert.equal(f.posts(),0);
});
test('pending output survives key removal; local remeasurement needs no key or API request',async()=>{
  const f=await fixture();await f.generate();const job=f.studio.job,gets=f.gets();
  await f.nodes['forget-key'].emit('click');assert.equal(f.studio.job,job);assert.equal(f.nodes.resume.disabled,true);
  await f.nodes.resume.emit('click');assert.equal(f.gets(),gets);assert.equal(f.studio.job,job);
  assert.equal(f.nodes.recheck.disabled,false);f.setGood(true);await f.nodes.recheck.emit('click');
  assert.equal(f.studio.base.seconds,10);assert.equal(f.gets(),gets);assert.equal(f.posts(),1);
});
test('a key can be reapplied to a pending job without replacing its output or sending a new POST',async()=>{
  const f=await fixture();await f.generate();const job=f.studio.job;
  await f.nodes['forget-key'].emit('click');await f.applyKey();
  assert.equal(f.studio.job,job);assert.equal(f.nodes.resume.disabled,false);assert.equal(f.nodes.generate.disabled,true);
  await f.nodes.resume.emit('click');assert.equal(f.posts(),1);assert.equal(f.gets(),2);
});
test('public app has no mode switch, demonstration path or sample adapter',async()=>{
  for(const name of ['index.html','app.js','google.js','style.css']){
    const source=await readFile(new URL('../dist/'+name,import.meta.url),'utf8');
    assert.doesNotMatch(source,/DemoGateway|demo-\d|デモ|name="mode"|mode-switch/);
  }
});

test('generation needs no billing checkbox and keeps visible pricing and retention explanations',async()=>{
  const f=await fixture();f.setGood(true);
  assert.equal(f.nodes['billing-consent'],undefined);
  f.nodes.prompt.value='synthetic';await f.nodes.prompt.emit('input');assert.equal(f.nodes.generate.disabled,false);
  await f.nodes['generate-form'].emit('submit');assert.equal(f.posts(),1);
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/billing-consent|billing-label|下記の料金・保存の説明を確認しました/);
  assert.match(html,/料金と失敗時の扱い/);assert.match(html,/キーと作品の保存について/);assert.match(html,/入力・出力のトークン使用量/);
});
test('selectable video settings reach the first POST and stay locked to the parent for extensions',async()=>{
  const f=await fixture();f.setGood(true);
  f.nodes['aspect-ratio'].value='9:16';await f.nodes['aspect-ratio'].emit('change');
  f.nodes.resolution.value='4k';await f.nodes.resolution.emit('change');
  assert.match(f.nodes['resolution-hint'].textContent,/アップスケール/);
  await f.generate();assert.equal(f.bodies[0].response_format.aspect_ratio,'9:16');assert.equal(f.bodies[0].response_format.resolution,'4k');
  assert.equal(f.nodes['aspect-ratio'].disabled,true);assert.equal(f.nodes.resolution.disabled,true);
  assert.match(f.nodes['settings-hint'].textContent,/このアプリでは/);
  f.nodes['aspect-ratio'].value='16:9';await f.nodes['aspect-ratio'].emit('change');assert.equal(f.nodes['aspect-ratio'].value,'9:16');
  f.studio.viewed(f.studio.baseId);await f.generate();assert.equal(f.bodies[1].response_format.aspect_ratio,'9:16');assert.equal(f.bodies[1].response_format.resolution,'4k');
  assert.match(f.nodes['preview-spec'].textContent,/縦 9:16.*4K/);
});
test('pending initial settings remain frozen through key clearing, GET and local remeasurement',async()=>{
  const f=await fixture();f.nodes.resolution.value='360p';await f.nodes.resolution.emit('change');await f.generate();
  const job=f.studio.job;assert.equal(job.settings.resolution,'360p');assert.equal(f.nodes.resolution.disabled,true);
  await f.nodes['forget-key'].emit('click');assert.equal(f.studio.job,job);assert.equal(f.nodes.resolution.disabled,true);
  f.nodes.resolution.value='1080p';await f.nodes.resolution.emit('change');assert.equal(f.nodes.resolution.value,'360p');
  f.setGood(true);await f.nodes.recheck.emit('click');assert.equal(f.studio.base.settings.resolution,'360p');assert.equal(f.posts(),1);
});

test('new and reset sessions show 360p and send 360p unless explicitly changed',async()=>{
  const f=await fixture();f.setGood(true);assert.equal(f.nodes.resolution.value,'360p');assert.match(f.nodes['preview-spec'].textContent,/360p/);
  await f.generate();assert.equal(f.bodies[0].response_format.resolution,'360p');
  const reset=f.nodes.reset.emit('click');f.nodes['confirm-dialog'].returnValue='ok';await f.nodes['confirm-dialog'].emit('close');await reset;
  assert.equal(f.nodes.resolution.value,'360p');assert.match(f.nodes['preview-spec'].textContent,/360p/);assert.equal(f.nodes.resolution.disabled,false);
  await f.applyKey();await f.generate();assert.equal(f.bodies[1].response_format.resolution,'360p');
});
test('720p parents keep their label and request resolution for continuation and branching',async()=>{
  for(const legacy of [false,true]){
    const f=await fixture();f.setGood(true);
    const original={id:'old720',interactionId:'old720',seconds:10,actualSeconds:10,blob:new Blob(['old']),viewed:true,prompt:'old',parentId:null,...(legacy?{}:{settings:{aspectRatio:'16:9',resolution:'720p'}})};
    f.studio.versions=[original];f.studio.baseId=original.id;f.studio.selectedId=original.id;f.render();
    assert.equal(f.nodes.resolution.value,'720p');assert.equal(f.nodes['aspect-ratio'].value,'16:9');assert.match(f.nodes['preview-spec'].textContent,/720p/);
    await f.generate();assert.equal(f.bodies[0].response_format.resolution,'720p');
    f.studio.select(original.id);f.studio.fork(original.id);await f.generate();assert.equal(f.bodies[1].response_format.resolution,'720p');
  }
});
test('choosing a local source never creates Google work; upload flow shows model and assembled lengths separately',async()=>{
  const f=await fixture({withKey:false});await f.nodes['source-upload'].emit('click');assert.equal(f.nodes['upload-panel'].hidden,false);
  f.nodes['source-file'].files=[new Blob(['synthetic local input'],{type:'video/mp4'})];await f.nodes['source-file'].emit('change');
  assert.equal(f.posts(),0);assert.equal(f.studio.base.kind,'uploaded-original');assert.match(f.nodes['upload-summary'].textContent,/前半 50秒.*末尾 10秒/);
  assert.match(f.nodes['duration-readout'].textContent,/動画全体 60秒.*予定 10秒/);assert.equal(f.nodes['tail-download'].hidden,false);assert.match(f.nodes['duration-readout'].textContent,/参照する元動画の末尾/);assert.doesNotMatch(f.nodes['duration-readout'].textContent,/採用したAI部分/);
  await f.generate();assert.equal(f.posts(),0);assert.equal(f.alerts.at(-1),'Gemini の API キーを入力してください');
  await f.applyKey();f.setGood(true);f.studio.viewed(f.studio.baseId);await f.generate();assert.equal(f.posts(),1);
  assert.match(f.nodes['timeline-total'].textContent,/この展開 20.*全体 70/);assert.match(f.nodes['preview-title'].textContent,/全体 70秒/);
});
test('removed connection notice stays absent and the original audio is not disabled',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/実APIでの生成は未検証です。有料枠でのOmni利用権限が必要です。/);
  assert.match(html,/映像・音声/);assert.doesNotMatch(html,/<video[^>]*\bmuted\b/);
});

test('duration choices cover 3 through 10, default to 10, and show the next planned total',async()=>{
  const f=await fixture();f.setGood(true);
  assert.deepEqual(f.nodes['extension-seconds'].children.map(n=>Number(n.value)),[10,9,8,7,6,5,4,3]);
  assert.equal(f.nodes['extension-seconds'].value,'10');assert.equal(f.nodes['duration-label'].textContent,'動画の長さ');
  f.nodes['extension-seconds'].value='7';await f.nodes['extension-seconds'].emit('change');
  assert.match(f.nodes['planned-length'].textContent,/7秒/);await f.generate();
  assert.equal(f.bodies[0].response_format.duration,'7s');assert.equal(f.studio.base.seconds,7);
  assert.equal(f.nodes['duration-label'].textContent,'追加する長さ');assert.match(f.nodes['planned-length'].textContent,/14秒/);
  f.studio.viewed(f.studio.baseId);await f.generate();assert.equal(f.studio.base.seconds,14);
  assert.deepEqual(f.nodes.timeline.children.map(n=>n.children[0].textContent),['7秒','14秒','21秒']);
});
test('rebased continuation explains reupload and preserves raw download beside assembled output',async()=>{
  const f=await fixture();f.setGood(true);
  const v={id:'rebased0',interactionId:'rebased0',seconds:10,actualSeconds:10,modelSeconds:10,wholeSeconds:10,requiresUpload:true,blob:new Blob(['synthetic']),viewed:true,prompt:'synthetic',parentId:null,settings:DEFAULT_VIDEO_SETTINGS};
  f.studio.versions=[v];f.studio.baseId=v.id;f.studio.selectedId=v.id;f.render();
  assert.equal(f.nodes['duration-caveat'].hidden,false);assert.match(f.nodes['duration-caveat'].textContent,/送り直して.*EEA/);
  f.nodes['extension-seconds'].value='3';await f.nodes['extension-seconds'].emit('change');
  await f.generate();assert.equal(f.bodies[0].response_format.duration,'3s');assert.equal(f.studio.base.seconds,13);
  assert.equal(f.studio.base.requiresUpload,true);assert.equal(f.nodes['raw-download'].hidden,false);
  assert.equal(f.blobs.get(f.nodes['raw-download'].href),f.studio.base.rawBlob);assert.notEqual(f.studio.base.rawBlob,f.studio.base.blob);
  const reset=f.nodes.reset.emit('click');f.nodes['confirm-dialog'].returnValue='ok';await f.nodes['confirm-dialog'].emit('close');await reset;
  assert.equal(f.nodes['extension-seconds'].value,'10');assert.equal(f.nodes['raw-download'].hidden,true);
});
test('duration selection without a key preserves the exact alert and sends no requests',async()=>{
  const f=await fixture({withKey:false});
  for(const duration of ['3','7']){f.nodes['extension-seconds'].value=duration;await f.nodes['extension-seconds'].emit('change');await f.generate();}
  assert.deepEqual(f.alerts,['Gemini の API キーを入力してください','Gemini の API キーを入力してください']);assert.equal(f.posts(),0);assert.equal(f.gets(),0);
});
test('remaining logical capacity clamps choices while measured context triggers reupload explanation',async()=>{
  const f=await fixture();
  const v={id:'near40',interactionId:'near40',seconds:37,actualSeconds:37.05,modelSeconds:37.05,wholeSeconds:37.05,blob:new Blob(['synthetic']),viewed:true,prompt:'synthetic',parentId:null};
  f.studio.versions=[v];f.studio.baseId=v.id;f.studio.selectedId=v.id;f.render();
  assert.equal(f.nodes['extension-seconds'].value,'3');assert.equal(f.nodes['extension-seconds'].disabled,false);
  assert.equal(f.nodes['extension-seconds'].children.filter(n=>!n.disabled).length,1);
  assert.match(f.nodes['planned-length'].textContent,/40秒/);assert.equal(f.nodes['duration-caveat'].hidden,false);
  assert.match(f.nodes['duration-caveat'].textContent,/送り直して/);
  v.seconds=39;v.actualSeconds=39;v.modelSeconds=39;f.render();
  assert.equal(f.nodes['extension-seconds'].disabled,true);assert.match(f.nodes['action-hint'].textContent,/残りが3秒未満/);
});

test('failed local continuation preparation hides ID recovery and disables API retrieval',async()=>{
  const f=await fixture();f.studio.job={requestReady:false,stage:'local preparation failed',desiredSeconds:1,seconds:11};f.render();
  assert.equal(f.nodes.resume.disabled,true);assert.equal(f.nodes['recovery-id'].hidden,true);assert.equal(f.nodes['recovery-label'].hidden,true);
  assert.match(f.nodes['recovery-description'].textContent,/Googleへの生成は送信していません/);
  await f.nodes.resume.emit('click');assert.equal(f.gets(),0);assert.equal(f.posts(),0);assert.ok(f.studio.job);
});

test('stable aspect choices preserve default settings and both new generation and native extensions',async()=>{
  for(const aspectRatio of ['16:9','9:16']){
    const f=await fixture();f.setGood(true);
    assert.deepEqual(f.nodes['aspect-ratio'].children.map(n=>n.value),['16:9','9:16']);
    assert.equal(f.nodes['aspect-ratio'].value,'16:9');assert.equal(f.nodes.resolution.value,'360p');assert.equal(f.nodes['extension-seconds'].value,'10');
    f.nodes['aspect-ratio'].value=aspectRatio;await f.nodes['aspect-ratio'].emit('change');
    assert.equal(f.nodes['video-screen'].classList.contains('portrait'),aspectRatio==='9:16');
    await f.generate();assert.equal(f.bodies[0].response_format.aspect_ratio,aspectRatio);assert.equal(f.bodies[0].response_format.resolution,'360p');
    assert.match(f.nodes['preview-spec'].textContent,/要求設定/);assert.match(f.nodes['preview-dimensions'].textContent,/×.*px/);
    f.studio.viewed(f.studio.baseId);await f.generate();assert.equal(f.bodies[1].response_format.aspect_ratio,aspectRatio);
  }
});
test('pending portrait keeps its ratio through key removal and local review',async()=>{
  const f=await fixture();f.nodes['aspect-ratio'].value='9:16';await f.nodes['aspect-ratio'].emit('change');await f.generate();
  assert.equal(f.nodes['aspect-ratio'].disabled,true);assert.equal(f.studio.job.settings.aspectRatio,'9:16');
  await f.nodes['forget-key'].emit('click');f.nodes['aspect-ratio'].value='16:9';await f.nodes['aspect-ratio'].emit('change');
  assert.equal(f.nodes['aspect-ratio'].value,'9:16');assert.equal(f.nodes['video-screen'].classList.contains('portrait'),true);
  f.setGood(true);await f.nodes.recheck.emit('click');assert.equal(f.studio.base.settings.aspectRatio,'9:16');assert.equal(f.posts(),1);
});
test('portrait local source retains dimensions and uploads without explicit aspect ratio',async()=>{
  const f=await fixture({sourceAspectRatio:'9:16'});await f.nodes['source-upload'].emit('click');
  f.nodes['source-file'].files=[new Blob(['portrait local input'],{type:'video/mp4'})];await f.nodes['source-file'].emit('change');
  assert.equal(f.posts(),0);assert.equal(f.nodes['aspect-ratio'].value,'9:16');assert.match(f.nodes['preview-dimensions'].textContent,/元動画.*720 × 1280px/);
  f.setGood(true);f.studio.viewed(f.studio.baseId);await f.generate();assert.equal(f.posts(),1);assert.equal(Object.hasOwn(f.bodies[0].response_format,'aspect_ratio'),false);
  assert.equal(f.studio.base.settings.aspectRatio,'9:16');
});
test('landscape output for portrait request remains inspectable and recovers without another POST',async()=>{
  const f=await fixture();f.setGood(true);f.setWrongAspect(true);
  f.nodes['aspect-ratio'].value='9:16';await f.nodes['aspect-ratio'].emit('change');await f.generate();
  assert.equal(f.studio.versions.length,0);assert.ok(f.studio.job);assert.equal(f.posts(),1);
  const card=f.nodes['inspection-list'].children[0],video=card.querySelector('video');
  assert.match(card.querySelector('p').textContent,/要求画角 9:16.*1280 × 720px.*画角.*一致しません/);
  assert.equal(f.nodes.generate.disabled,true);assert.equal(f.nodes['inspections'].hidden,false);
  f.setWrongAspect(false);await f.nodes.recheck.emit('click');
  assert.equal(f.posts(),1);assert.equal(card.querySelector('video'),video);assert.match(card.querySelector('p').textContent,/採用済み/);
  assert.doesNotMatch(card.querySelector('p').textContent,/一致しません/);
});
test('unsupported aspect change reports an error without POST and cannot be selected in the public UI',async()=>{
  const f=await fixture();f.setGood(true);f.nodes['aspect-ratio'].value='1:1';await f.nodes['aspect-ratio'].emit('change');
  assert.equal(f.posts(),0);assert.equal(f.nodes['aspect-ratio'].children.some(n=>n.value==='1:1'),false);assert.match(f.studio.error,/画角|解像度/);
  f.nodes['aspect-ratio'].value='9:16';await f.nodes['aspect-ratio'].emit('change');await f.generate();
  assert.equal(f.posts(),1);assert.equal(f.bodies[0].response_format.aspect_ratio,'9:16');
});
test('portrait API rejection never retries and preserves a previously completed version',async()=>{
  const f=await fixture();f.setGood(true);f.nodes['aspect-ratio'].value='9:16';await f.nodes['aspect-ratio'].emit('change');await f.generate();
  const original=f.studio.base;f.studio.viewed(original.id);f.setRejectCreate(true);await f.generate();
  assert.equal(f.posts(),2);assert.equal(f.bodies.length,2);assert.equal(f.studio.base,original);assert.equal(f.studio.versions.length,1);assert.equal(f.studio.job,null);
  assert.equal(f.bodies[1].response_format.aspect_ratio,'9:16');assert.equal(f.nodes.download.hidden,false);
});

test('public profile disables unsupported controls and preserves exact missing-key behavior', async () => {
  const f = await fixture({ localMediaEnabled: false, withKey: false });
  assert.equal(f.studio.localMediaEnabled, false); assert.equal(f.nodes['public-profile-note'].hidden, false);
  assert.equal(f.nodes['source-upload'].disabled, true); assert.equal(f.nodes['source-upload'].hidden, true); assert.equal(f.nodes['source-file'].disabled, true);
  assert.deepEqual(f.nodes['extension-seconds'].children.map(n=>Number(n.value)), [10,9,8,7,6,5,4,3]);
  assert.match(f.nodes['duration-description'].textContent, /3〜10秒/); assert.doesNotMatch(f.nodes['extension-description'].textContent, /このMac/);
  assert.match(f.nodes['timeline-note'].textContent, /3〜10秒/);
  await f.nodes['source-upload'].emit('click'); f.nodes['source-file'].files = [new Blob(['synthetic'])]; await f.nodes['source-file'].emit('change');
  assert.equal(f.studio.versions.length, 0); assert.equal(f.nodes['upload-panel'].hidden, true); assert.equal(f.posts(), 0);
  await f.generate(); assert.equal(f.posts(), 0); assert.equal(f.alerts.at(-1), 'Gemini の API キーを入力してください');
  for (const seconds of [1, 2]) await assert.rejects(f.studio.generate('synthetic', DEFAULT_VIDEO_SETTINGS, seconds), /3〜10秒/);
  assert.equal(f.posts(), 0); assert.equal(f.studio.job, null); assert.equal(f.studio.attempts.length, 0);
});

test('public profile uses native ten-second continuation through forty seconds', async () => {
  const f = await fixture({ localMediaEnabled: false }); f.setGood(true);
  for (const seconds of [10, 20, 30, 40]) {
    if (f.studio.base) await f.nodes.video.emit('ended');
    await f.generate(); assert.equal(f.studio.base.seconds, seconds); assert.equal(f.studio.job, null);
  }
  assert.equal(f.posts(), 4); assert.equal(f.nodes.generate.disabled, true); assert.equal(f.nodes['target-seconds'].textContent, '40 / 40秒');
  for (const body of f.bodies) { assert.equal(body.response_format.duration, '10s'); assert.equal(body.generation_config, undefined); }
  await f.generate(); assert.equal(f.posts(), 4);
});

test('public profile explains less-than-three remaining seconds without claiming forty seconds were reached', async () => {
  for (const [seconds, modelSeconds] of [[38, 38], [39, 39], [37, 37.01]]) {
    const f = await fixture({ localMediaEnabled: false });
    f.studio.versions = [{ id: 'short-remaining', interactionId: 'short-remaining', seconds, modelSeconds, actualSeconds: modelSeconds, blob: new Blob(['synthetic']), prompt: 'synthetic', viewed: true, settings: DEFAULT_VIDEO_SETTINGS }];
    f.studio.baseId = 'short-remaining'; f.studio.selectedId = 'short-remaining'; f.render();
    assert.equal(f.nodes.generate.disabled, true); assert.equal(f.nodes['extension-seconds'].disabled, true);
    assert.match(f.nodes['action-hint'].textContent, /残りが3秒未満/); assert.doesNotMatch(f.nodes['duration-hint'].textContent, /上限に達/);
    assert.notEqual(f.nodes['target-seconds'].textContent, '40 / 40秒'); assert.doesNotMatch(f.nodes['view-state'].textContent, /40秒版/);
    await f.generate(); assert.equal(f.posts(), 0); assert.equal(f.studio.attempts.length, 0);
  }
});

test('public profile disables choices that exceed the measured model length and retains pending locks', async () => {
  const f = await fixture({ localMediaEnabled: false });
  f.studio.versions = [{ id: 'rounding', interactionId: 'rounding', seconds: 30, modelSeconds: 30.04, actualSeconds: 30.04, blob: new Blob(['synthetic']), prompt: 'synthetic', viewed: true, settings: DEFAULT_VIDEO_SETTINGS }];
  f.studio.baseId = 'rounding'; f.studio.selectedId = 'rounding'; f.render();
  assert.equal(f.nodes['extension-seconds'].children.find(option => option.value === '10').disabled, true);
  assert.equal(f.nodes['extension-seconds'].value, '9');
  await assert.rejects(f.studio.generate('blocked ten', DEFAULT_VIDEO_SETTINGS, 10), /公開版/); assert.equal(f.posts(), 0);
  await f.generate(); assert.equal(f.posts(), 1); const job = f.studio.job; assert.ok(job);
  await f.generate(); assert.equal(f.posts(), 1); assert.equal(f.studio.job, job);
  await f.nodes['forget-key'].emit('click'); assert.equal(f.studio.job, job); assert.equal(f.nodes.resume.disabled, true);
});


test('browser media profile restores uploads and 3..10 choices while keeping native generation independent of WASM',async()=>{
 const f=await fixture({browserMediaEnabled:true});f.setGood(true);
 assert.equal(f.nodes['source-upload'].hidden,false);assert.equal(f.nodes['browser-media-panel'].hidden,false);assert.match(f.nodes['source-file-label'].textContent,/50MiB/);
 assert.deepEqual(f.nodes['extension-seconds'].children.map(o=>Number(o.value)),[10,9,8,7,6,5,4,3]);
 await f.generate();assert.equal(f.posts(),1);assert.equal(f.mediaControl.readyCalls,0);
});
test('browser preflight failure and unsupported resolution neverPOST and permit manual retry',async()=>{
 const f=await fixture({browserMediaEnabled:true});f.setGood(true);
 const v={id:'rebased',interactionId:'rebased',seconds:10,actualSeconds:10,modelSeconds:10,wholeSeconds:10,requiresUpload:true,blob:new Blob(['synthetic']),viewed:true,prompt:'synthetic',parentId:null,settings:{aspectRatio:'16:9',resolution:'360p'}};
 f.studio.versions=[v];f.studio.baseId=v.id;f.studio.selectedId=v.id;f.render();
 f.nodes['extension-seconds'].value='3';await f.nodes['extension-seconds'].emit('change');
 f.mediaControl.failReady=true;await f.generate();assert.equal(f.posts(),0);assert.equal(f.studio.job,null);assert.equal(f.studio.busy,false);
 f.mediaControl.failReady=false;v.settings={aspectRatio:'16:9',resolution:'1080p'};f.render();await f.generate();assert.equal(f.posts(),0);assert.match(f.studio.error,/720p/);
 v.settings={aspectRatio:'16:9',resolution:'360p'};f.render();await f.generate();assert.equal(f.posts(),1);assert.equal(f.studio.base.seconds,13);
});
test('browser cancellation during engine loading preventsPOST and the next explicit attempt can run',async()=>{
 const f=await fixture({browserMediaEnabled:true});f.setGood(true);
 const v={id:'rebased',interactionId:'rebased',seconds:10,actualSeconds:10,modelSeconds:10,wholeSeconds:10,requiresUpload:true,blob:new Blob(['synthetic']),viewed:true,prompt:'synthetic',parentId:null,settings:{aspectRatio:'16:9',resolution:'360p'}};
 f.studio.versions=[v];f.studio.baseId=v.id;f.studio.selectedId=v.id;f.render();
 f.nodes['extension-seconds'].value='3';await f.nodes['extension-seconds'].emit('change');
 let release,start;const started=new Promise(r=>{start=r;});f.mediaControl.started=start;f.mediaControl.gate=new Promise(r=>{release=r;});const pending=f.generate();await started;assert.equal(f.nodes['cancel-media'].hidden,false);
 await f.nodes['cancel-media'].emit('click');release();await pending;assert.equal(f.mediaControl.cancelCalls,1);assert.equal(f.posts(),0);assert.equal(f.studio.job,null);
 f.mediaControl.gate=null;await f.generate();assert.equal(f.posts(),1);assert.equal(f.studio.base.seconds,13);
});
test('browser file selection preserves original and never sendsGoogle work',async()=>{
 const f=await fixture({browserMediaEnabled:true,withKey:false});const original=new Blob(['synthetic-source'],{type:'video/mp4'});
 await f.nodes['source-upload'].emit('click');f.nodes['source-file'].files=[original];await f.nodes['source-file'].emit('change');
 assert.equal(f.posts(),0);assert.equal(f.studio.base.source.originalBlob,original);assert.match(f.nodes['upload-processing-description'].textContent,/Vercelや別/);
 await f.generate();assert.equal(f.posts(),0);assert.equal(f.alerts.at(-1),'Gemini の API キーを入力してください');
});

test('extension unlocks only after metadata validation, without playback or ended',async()=>{
  const f=await fixture();f.setGood(true);
  let release,started;f.validationControl.gate=new Promise(r=>{release=r;});
  const checking=new Promise(r=>{started=r;});f.validationControl.started=started;
  const initial=f.generate();await checking;
  assert.equal(f.studio.busy,true);assert.equal(f.studio.versions.length,0);assert.equal(f.nodes.generate.disabled,true);
  release();await initial;f.validationControl.gate=null;
  assert.equal(f.studio.base.viewed,false);assert.equal(f.nodes.video.playCalls||0,0);
  f.nodes.prompt.value='続き';await f.nodes.prompt.emit('input');assert.equal(f.nodes.generate.disabled,false);
  assert.doesNotMatch(f.nodes['action-hint'].textContent,/再生してください/);
  await f.nodes['generate-form'].emit('submit');assert.equal(f.posts(),2);assert.equal(f.studio.base.seconds,20);
});

test('history display moves and focuses the preview without playing or changing the extension base',async()=>{
  const f=await fixture();f.setGood(true);await f.generate();const first=f.studio.base;
  await f.generate();const base=f.studio.base,posts=f.posts();
  await f.nodes.history.children[0].children[2].emit('click');
  assert.equal(f.studio.selectedId,first.id);assert.equal(f.studio.base,base);assert.equal(f.blobs.get(f.nodes.video.src),first.blob);
  assert.equal(f.nodes.video.scrollCalls,1);assert.equal(f.nodes.video.focusCalls,1);assert.equal(f.nodes.video.focusOptions.preventScroll,true);
  assert.equal(f.nodes.video.playCalls||0,0);assert.equal(f.posts(),posts);
});

test('history play and timeline play start the selected video, preserving the extension base',async()=>{
  const f=await fixture();f.setGood(true);await f.generate();const first=f.studio.base;await f.generate();const base=f.studio.base,posts=f.posts();
  const play=f.nodes.history.children[0].children[0];assert.equal(play.tag,'button');assert.equal(play.type,'button');assert.match(play['aria-label'],/版 1.*再生/);
  await play.emit('click');assert.equal(f.studio.selectedId,first.id);assert.equal(f.nodes.video.playCalls,1);assert.equal(f.blobs.get(f.nodes.video.src),first.blob);
  await f.nodes.timeline.children[1].emit('click');assert.equal(f.studio.selectedId,base.id);assert.equal(f.nodes.video.playCalls,2);
  assert.equal(f.studio.base,base);assert.equal(f.posts(),posts);
});

test('play rejection has a fixed visible message and preserves an existing generation error and job',async()=>{
  const f=await fixture();f.setGood(true);await f.generate();f.setGood(false);await f.generate();const job=f.studio.job,error=f.studio.error,posts=f.posts();
  f.nodes.video.playImplementation=()=>Promise.reject(Error('private response content'));
  await f.nodes.history.children[0].children[0].emit('click');
  assert.equal(f.studio.job,job);assert.equal(f.studio.error,error);assert.equal(f.nodes['playback-notice'].hidden,false);
  assert.match(f.nodes['playback-notice'].textContent,/再生を開始できません/);assert.doesNotMatch(f.nodes['playback-notice'].textContent,/private response/);
  assert.equal(f.nodes.generate.disabled,true);assert.equal(f.posts(),posts);
});

test('stale playback failures cannot alter another selected version or a reset session',async()=>{
  for(const reset of [false,true]){
    const f=await fixture();f.setGood(true);await f.generate();await f.generate();let reject;
    f.nodes.video.playImplementation=()=>new Promise((_,r)=>{reject=r;});
    const playing=f.nodes.history.children[0].children[0].emit('click');
    if(reset){const resetting=f.nodes.reset.emit('click');f.nodes['confirm-dialog'].returnValue='ok';await f.nodes['confirm-dialog'].emit('close');await resetting;}
    else await f.nodes.history.children[1].children[2].emit('click');
    reject(Error('stale failure'));await playing;assert.equal(f.nodes['playback-notice'].hidden,true);
    assert.equal(f.studio.versions.length,reset?0:2);
  }
});

test('keyless playback works; busy playback is blocked and neither path sends a generation',async()=>{
  const f=await fixture();f.setGood(true);await f.generate();await f.nodes['forget-key'].emit('click');const posts=f.posts();
  await f.nodes.history.children[0].children[0].emit('click');assert.equal(f.nodes.video.playCalls,1);assert.equal(f.posts(),posts);
  f.studio.busy=true;f.render();const row=f.nodes.history.children[0];assert.equal(row.children[0].disabled,true);assert.equal(row.children[2].disabled,true);
  await row.children[0].emit('click');await row.children[2].emit('click');assert.equal(f.nodes.video.playCalls,1);assert.equal(f.posts(),posts);
});
