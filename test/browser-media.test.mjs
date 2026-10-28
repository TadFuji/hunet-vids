import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserMedia, BROWSER_MEDIA_LIMITS as L, browserMediaSettings, browserMediaMetadata } from '../dist/browser-media.js';
const metadata = (seconds = 10, width = 640, height = 360, audio = true) => ({ format: { duration: String(seconds) }, streams: [{ codec_type: 'video', width, height, duration: String(seconds), sample_aspect_ratio: '1:1' }, ...(audio ? [{ codec_type: 'audio' }] : [])] });
const metas = new WeakMap();
function video(seconds = 10, width = 640, height = 360, audio = true) { const b = new Blob([new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109])], { type: 'video/mp4' }); metas.set(b, metadata(seconds,width,height,audio)); return b; }
function fakeEngine({ hangLoad = false, corrupt = null, failExec = false } = {}) {
  const files = new Map(), mounted = new Map(), calls = []; let terminated = false;
  const ff = {
    calls, files, mounted, terminated: () => terminated,
    on(event, cb) { calls.push(['on',event]); ff.progress = cb; },
    async load(options) { calls.push(['load',options]); if (hangLoad) await new Promise(() => {}); },
    terminate() { terminated = true; files.clear(); mounted.clear(); calls.push(['terminate']); },
    async createDir(path) { calls.push(['createDir',path]); }, async deleteDir(path) { calls.push(['deleteDir',path]); },
    async mount(type, options, path) { calls.push(['mount',type,options,path]); for (const b of options.blobs) mounted.set(`${path}/${b.name}`, metas.get(b.data) || files.get('output-meta')); return true; },
    async unmount(path) { calls.push(['unmount',path]); mounted.clear(); return true; },
    async deleteFile(path) { calls.push(['deleteFile',path]); files.delete(path); },
    async exec(args) {
      calls.push(['exec',args]); if (failExec) throw new Error('SECRET API-KEY prompt filename');
      const self = args.includes('lavfi');
      const sources = args.flatMap((v,i) => v === '-i' && mounted.has(args[i+1]) ? [mounted.get(args[i+1])] : []);
      const sec = Number(args[args.indexOf('-t')+1]);
      let w=640,h=360,a=true;
      if (!self) {
        const meta = browserMediaMetadata(sources[0],90); w=meta.width;h=meta.height;a=meta.hasAudio;
        const vf = args[args.indexOf('-vf')+1] || '';
        const filter = args[args.indexOf('-filter_complex')+1] || '';
        const scaled = (vf+';'+filter).match(/scale=(\d+):(\d+)/); if(scaled) {w=Number(scaled[1]);h=Number(scaled[2]);}
        if (args.includes('-filter_complex')) a=true;
      }
      let result = metadata(sec,w,h,a); if (!self && corrupt) result=corrupt(result);
      files.set('/output.mp4',new Uint8Array([0,0,0,16,102,116,121,112,0,0,0,0])); files.set('output-meta', result);
      ff.progress?.({ progress:0.5 }); return 0;
    },
    async ffprobe(args) { calls.push(['ffprobe',args]); const path=args[args.indexOf('-i')+1]; const meta=path==='/output.mp4'? files.get('output-meta'):mounted.get(path); files.set('/metadata.json',new TextEncoder().encode(JSON.stringify(meta)));return 0; },
    async listDir() { return [...files.keys()].filter(name=>name.startsWith('/')).map(path=>({name:path.slice(1),isDir:false})); },
    async readFile(path) { calls.push(['readFile',path]); return files.get(path); },
  }; return ff;
}
function harness(options={}) { const engines=[], states=[]; const media=createBrowserMedia({onState:s=>states.push(s),createFFmpeg:async()=>{const e=fakeEngine(options);engines.push(e);return e;},...options}); return {media,engines,states}; }
const execs = e => e.calls.filter(c=>c[0]==='exec').map(c=>c[1]);

test('settings permit only bounded landscape/portrait; rotation and SAR are validated',()=>{
  assert.equal(browserMediaSettings(640,360).settings.aspectRatio,'16:9');
  assert.deepEqual(browserMediaSettings(720,1280).settings,{aspectRatio:'9:16',resolution:'720p'});
  for(const [w,h] of [[720,720],[1920,1080],[1281,720],[NaN,360],[0,0]]) assert.throws(()=>browserMediaSettings(w,h));
  const m=metadata();m.streams[0].side_data_list=[{rotation:90}];assert.equal(browserMediaMetadata(m,60).width,360);
  m.streams[0].sample_aspect_ratio='2:1';assert.throws(()=>browserMediaMetadata(m,60));
  m.streams[0].sample_aspect_ratio='1:1';m.streams[0].side_data_list=[{rotation:12}];assert.throws(()=>browserMediaMetadata(m,60));
});

test('readiness uses pinned same-origin worker and encoder/audio self-check; no log subscription',async()=>{
  const {media,engines,states}=harness(); const ready=await media.ensureReady();assert.equal(ready.ready,true);assert.equal(ready.limits,L);
  const e=engines[0],load=e.calls.find(c=>c[0]==='load')[1];
  assert.match(load.coreURL,/vendor\/ffmpeg\/core\/ffmpeg-core.js$/);assert.match(load.wasmURL,/vendor\/ffmpeg\/core\/ffmpeg-core.wasm$/);assert.match(load.classWorkerURL,/vendor\/ffmpeg\/ffmpeg\/worker.js$/);
  assert.deepEqual(e.calls.filter(c=>c[0]==='on').map(c=>c[1]),['progress']);assert.ok(execs(e)[0].includes('libx264'));assert.ok(execs(e)[0].includes('aac'));
  await media.ensureReady();assert.equal(execs(e).length,1);assert.equal(states.at(-1).busy,false);assert.equal(states.at(-1).phase,'ready');
});

test('prepare mounts only selected Blob under fixed name, preserves original, emits <=10 sec tail and cleans',async()=>{
  const {media,engines,states}=harness();const src=video(60);Object.defineProperty(src,'name',{value:'../../secret-key.mp4'});
  const result=await media.prepareSource(src);assert.equal(result.originalBlob,src);assert.equal(result.prefixSeconds,50);assert.equal(result.tailSeconds,10);assert.equal(result.sourceSeconds,60);assert.equal(result.name,'選択した動画');
  const e=engines[0], mount=e.calls.filter(c=>c[0]==='mount').at(-1);assert.equal(mount[1],'WORKERFS');assert.equal(mount[2].blobs[0].data,src);assert.equal(mount[2].blobs[0].name,'media0');
  const args=execs(e).at(-1);assert.equal(args[args.indexOf('-ss')+1],'50');assert.equal(args[args.indexOf('-t')+1],'10');assert.ok(args.includes('file'));
  assert.ok(e.calls.some(c=>c[0]==='unmount'));assert.equal(e.mounted.size,0);assert.equal(e.files.has('/output.mp4'),false);assert.equal(e.files.has('/metadata.json'),false);assert.equal(JSON.stringify(states).includes('secret'),false);
});

test('initial 60 seconds limit differs from continuation 90 seconds; malformed/oversize refused',async()=>{
  const {media}=harness();await assert.rejects(media.prepareSource(video(60.01)));assert.equal((await media.prepareContinuation(video(90))).sourceSeconds,90);await assert.rejects(media.prepareContinuation(video(90.01)));
  await assert.rejects(media.prepareSource(new Blob(['#EXTM3U\nhttps://secret'])));
  const huge=video();Object.defineProperty(huge,'size',{value:L.sourceBytes+1});await assert.rejects(media.prepareSource(huge));
});

test('prepare respects portrait rotation and rejects square or returned wrong dimensions',async()=>{
  const rotated=video(20);metas.get(rotated).streams[0].side_data_list=[{rotation:90}];const {media}=harness();const result=await media.prepareSource(rotated);assert.equal(result.width,360);assert.equal(result.height,640);assert.equal(result.settings.aspectRatio,'9:16');
  await assert.rejects(media.prepareSource(video(10,360,360)));
  const bad=harness({corrupt:m=>({...m,streams:[{...m.streams[0],width:360,height:640}]})});await assert.rejects(bad.media.prepareSource(video()));assert.equal(bad.engines[0].terminated(),true);
});

test('trim 1, 2, fractional seconds without padding; does not lengthen short source',async()=>{
  const {media,engines}=harness();for(const seconds of [1,2,10.984]) {const result=await media.trimVideo(video(20),seconds,{aspectRatio:'16:9'});assert.equal(result.actualSeconds,seconds);}
  const args=execs(engines[0]).at(-1);assert.match(args[args.indexOf('-vf')+1],/trim=end_frame=263/);assert.equal(args.some(a=>a.includes('apad')),false);
  await assert.rejects(media.trimVideo(video(1),2,{aspectRatio:'16:9'}));await assert.rejects(media.trimVideo(video(),1,{aspectRatio:'9:16'}));
});

test('compose 60s source prefix50 + generated20 produces70 with concat and silence only for missing audio',async()=>{
  const {media,engines}=harness();const source=await media.prepareSource(video(60,640,360,true));const result=await media.composeSource(source,video(20,640,360,false),70);assert.equal(result.actualSeconds,70);
  const args=execs(engines[0]).at(-1),filter=args[args.indexOf('-filter_complex')+1];assert.match(filter,/\[0:a:0\]aresample=48000/);assert.match(filter,/anullsrc=r=48000:cl=stereo,atrim=duration=20/);assert.match(filter,/concat=n=2:v=1:a=1/);assert.ok(args.includes('yuv420p'));
});

test('compose rejects landscape ending for portrait and forged prefix/expected duration before encoder',async()=>{
  const {media,engines}=harness();const source=await media.prepareSource(video(60,360,640));
  await assert.rejects(media.composeSource(source,video(20),70));assert.equal(execs(engines[0]).length,2);
  await assert.rejects(media.composeSource({...source,prefixSeconds:49},video(20,360,640),69));
  await assert.rejects(media.composeSource(source,video(20,360,640),60));
});

test('cancel during loading rejects promptly, releases busy and allows fresh worker retry',async()=>{
  let count=0;const engines=[],states=[];const media=createBrowserMedia({onState:s=>states.push(s),createFFmpeg:async()=>{const e=fakeEngine({hangLoad:count++===0});engines.push(e);return e;}});
  const pending=media.ensureReady();await Promise.resolve();await assert.rejects(media.ensureReady(),/別の動画/);media.cancel();await assert.rejects(pending,/中止/);assert.equal(engines[0].terminated(),true);assert.equal(states.at(-1).busy,false);
  await media.ensureReady();assert.equal(engines.length,2);assert.equal(states.at(-1).phase,'ready');
});

test('cancel during asynchronous factory cannot resurrect abandoned worker',async()=>{
  let resolve;const engine=fakeEngine();const media=createBrowserMedia({createFFmpeg:()=>new Promise(r=>resolve=r)});const pending=media.ensureReady();media.cancel();await assert.rejects(pending);resolve(engine);await new Promise(r=>setImmediate(r));assert.equal(engine.terminated(),true);assert.equal(engine.calls.some(c=>c[0]==='load'),false);
});

test('timeout terminates worker, emits no raw tool message, retry works and disposal is final',async()=>{
  const states=[],engines=[];let count=0;const media=createBrowserMedia({timeoutMs:10,onState:s=>states.push(s),createFFmpeg:async()=>{const e=fakeEngine({hangLoad:count++===0});engines.push(e);return e;}});
  await assert.rejects(media.ensureReady(),/ブラウザで動画/);assert.equal(engines[0].terminated(),true);assert.equal(states.at(-1).phase,'error');await media.ensureReady();media.dispose();await assert.rejects(media.ensureReady());assert.equal(engines[1].terminated(),true);
  const failed=harness({failExec:true});await assert.rejects(failed.media.ensureReady(),e=>!e.message.includes('SECRET')&&!e.message.includes('API-KEY'));assert.equal(JSON.stringify(failed.states).includes('SECRET'),false);
});

test('inconsistent media duration and output audio loss fail closed',async()=>{
  const m=metadata(20);m.streams[0].duration='10';assert.throws(()=>browserMediaMetadata(m,60));
  const {media}=harness({corrupt:m=>({...m,streams:m.streams.filter(s=>s.codec_type==='video')})});await assert.rejects(media.trimVideo(video(),2,{aspectRatio:'16:9'}));
});

test('WORKERFS failure fails readiness and never claims ready',async()=>{
  const e=fakeEngine();e.mount=async()=>{throw new Error('untrusted worker failure');};const states=[];
  const media=createBrowserMedia({createFFmpeg:async()=>e,onState:s=>states.push(s)});await assert.rejects(media.ensureReady());assert.equal(e.terminated(),true);assert.equal(states.at(-1).phase,'error');assert.equal(states.at(-1).busy,false);assert.equal(states.some(s=>s.phase==='ready'),false);
});

test('processing cancellation terminates mounted worker and a retry reinitializes it',async()=>{
  const {media,engines,states}=harness();await media.ensureReady();const first=engines[0];let started;const began=new Promise(r=>started=r);
  first.exec=async()=>{started();return new Promise(()=>{});};const pending=media.prepareSource(video(20));await began;assert.equal(first.mounted.size,1);assert.equal(states.at(-1).busy,true);media.cancel();await assert.rejects(pending,/中止/);assert.equal(first.mounted.size,0);assert.equal(states.at(-1).busy,false);
  assert.equal((await media.prepareSource(video(20))).tailSeconds,10);assert.equal(engines.length,2);
});

test('progress belongs to the current operation and output caps remain in fixed encoder args',async()=>{
  const {media,engines,states}=harness();await media.ensureReady();states.length=0;await media.trimVideo(video(),1,{aspectRatio:'16:9'});
  assert.ok(states.some(s=>s.phase==='trimming'&&s.progress===0.5&&s.busy));assert.equal(states.at(-1).busy,false);
  const args=execs(engines[0]).at(-1);assert.equal(Number(args[args.indexOf('-fs')+1]),L.outputBytes-1048576);assert.equal(args[args.indexOf('-protocol_whitelist')+1],'file');assert.equal(args.at(-1),'/output.mp4');
});

test('pinned ffprobe sentinel -1 succeeds only with fresh complete validated JSON',async()=>{
  const e=fakeEngine(),original=e.ffprobe;let probes=0;
  e.ffprobe=async args=>{assert.equal(e.files.has('/metadata.json'),false,'each probe begins without old metadata');assert.ok(args.includes('-show_error'));probes++;await original(args);return -1;};
  const media=createBrowserMedia({createFFmpeg:async()=>e});await media.ensureReady();const result=await media.prepareSource(video(20));assert.equal(result.prefixSeconds,10);assert.equal(result.tailSeconds,10);assert.ok(probes>=4);assert.equal(e.files.has('/metadata.json'),false);
});

test('sentinel -1 cannot reuse a previous probe JSON when current probe produces no file',async()=>{
  const e=fakeEngine(),original=e.ffprobe;let probes=0;
  e.ffprobe=async args=>{if(++probes===1) await original(args);return -1;};
  const media=createBrowserMedia({createFFmpeg:async()=>e});await assert.rejects(media.ensureReady());assert.equal(probes,2);assert.equal(e.terminated(),true);
});

test('probe rejects incomplete, error, invalid UTF-8, invalid metadata and explicit nonzero exits',async()=>{
  for(const payload of ['{"streams":', JSON.stringify({...metadata(0.125),error:{code:-1}}), JSON.stringify({...metadata(0.125),error:{}}), JSON.stringify(metadata(0.125,360,360)),new Uint8Array([255,254])]) {
    const e=fakeEngine();e.ffprobe=async()=>{e.files.set('/metadata.json',typeof payload==='string'?new TextEncoder().encode(payload):payload);return -1;};
    const media=createBrowserMedia({createFFmpeg:async()=>e});await assert.rejects(media.ensureReady());assert.equal(e.terminated(),true);
  }
  const e=fakeEngine(),original=e.ffprobe;e.ffprobe=async args=>{await original(args);return 1;};await assert.rejects(createBrowserMedia({createFFmpeg:async()=>e}).ensureReady());
});

test('failure to remove stale metadata rejects before invoking ffprobe',async()=>{
  const e=fakeEngine();e.files.set('/metadata.json',new TextEncoder().encode(JSON.stringify(metadata(0.125))));e.deleteFile=async()=>{};
  await assert.rejects(createBrowserMedia({createFFmpeg:async()=>e}).ensureReady());assert.equal(e.calls.some(c=>c[0]==='ffprobe'),false);assert.equal(e.terminated(),true);
});
