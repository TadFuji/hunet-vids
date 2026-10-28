import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildPublic, PUBLIC_FILES, PUBLIC_BINARY_FILES, VENDOR_BASE_FILES, VERCEL_CONFIG, validateVendorManifest, verifyVendorBytes, verifyManualBytes } from '../tools/build-public.mjs';

test('public package includes only pinned static runtime/source distribution with browser media enabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'omni-public-build-'));
  try {
    const manifest = await buildPublic(dir);
    const vendor = JSON.parse(await readFile(new URL('../dist/vendor/ffmpeg/manifest.json', import.meta.url), 'utf8'));
    assert.deepEqual(manifest.map(x => x.file), [...PUBLIC_FILES, ...PUBLIC_BINARY_FILES, 'vendor/ffmpeg/manifest.json', ...vendor.files.map(x=>'vendor/ffmpeg/'+x.path), 'vercel.json']);
    for (const file of PUBLIC_BINARY_FILES) {
      const original=await readFile(new URL('../dist/'+file,import.meta.url));
      const published=await readFile(join(dir,file));verifyManualBytes(published);assert.deepEqual(published,original);
      const item=manifest.find(x=>x.file===file);assert.equal(item.sha256,createHash('sha256').update(original).digest('hex'));
    }
    assert.doesNotMatch(PUBLIC_FILES.join(','), /test|fixture|\.env|\.runtime|server|diagnostic.*json|mp4|README|AGENTS|package\.json/);
    assert.equal(await readFile(join(dir, 'runtime.js'), 'utf8'), 'export const localMediaEnabled = true;\nexport const browserMediaEnabled = true;\n');
    const localRuntime=await readFile(new URL('../dist/runtime.js',import.meta.url),'utf8');assert.match(localRuntime,/localMediaEnabled = true/);assert.match(localRuntime,/browserMediaEnabled = false/);
    const adapter = await readFile(join(dir, 'local-media-client.js'), 'utf8'); assert.doesNotMatch(adapter, /fetch\(|localhost|127\.0\.0\.1/); assert.match(adapter, /throw new StudioError/);
    const browser=await readFile(join(dir,'browser-media.js'),'utf8');assert.match(browser,/classWorkerURL/);assert.doesNotMatch(browser,/fetch\(|https?:\/\/|local-media\//);
    for (const entry of vendor.files) {
      const bytes=await readFile(join(dir,'vendor/ffmpeg',entry.path));verifyVendorBytes(entry,bytes);
      if(entry.path.endsWith('.wasm')) assert.deepEqual([...bytes.subarray(0,4)],[0,97,115,109]);
      if(entry.path.endsWith('.tar.gz')) assert.deepEqual([...bytes.subarray(0,2)],[31,139]);
    }
    const config = JSON.parse(await readFile(join(dir, 'vercel.json'), 'utf8')); assert.deepEqual(config, VERCEL_CONFIG); assert.equal(config.public, false); assert.equal(config.functions, undefined); assert.equal(config.rewrites, undefined);
    const headers = Object.fromEntries(config.headers[0].headers.map(x => [x.key,x.value]));const csp=headers['Content-Security-Policy'];
    assert.match(csp,/script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';/);assert.doesNotMatch(csp,/'unsafe-eval'|'unsafe-inline'|unpkg|jsdelivr/);
    assert.match(csp, /connect-src 'self' https:\/\/generativelanguage.googleapis.com;/); assert.match(csp, /frame-ancestors 'none'/); assert.equal(headers['Cache-Control'], 'no-store');
    const worker=config.headers.find(x=>x.source==='/vendor/ffmpeg/ffmpeg/worker.js');assert.match(worker.headers[0].value,/connect-src 'self';/);assert.doesNotMatch(worker.headers[0].value,/googleapis/);
    const wasm=config.headers.find(x=>x.source==='/vendor/ffmpeg/core/ffmpeg-core.wasm');assert.deepEqual(wasm.headers,[{key:'Content-Type',value:'application/wasm'}]);
    const manual=config.headers.find(x=>x.source==='/'+PUBLIC_BINARY_FILES[0]);assert.deepEqual(manual.headers,[{key:'Content-Type',value:'application/pdf'},{key:'Content-Disposition',value:'attachment; filename="omni-continue-user-guide-20261016.pdf"'}]);
    await assert.rejects(buildPublic(dir), /must be empty/);
  } finally { await rm(dir, { recursive:true, force:true }); }
});

function syntheticManifest() {
  const lock={schemaVersion:1,sources:[{file:'library-123.tar.gz',bytes:3,sha256:'a'.repeat(64)}]};
  const manifest={schemaVersion:1,runtimeModified:false,packages:[{name:'@ffmpeg/ffmpeg',version:'0.12.15'},{name:'@ffmpeg/core',version:'0.12.10'}],files:[...VENDOR_BASE_FILES.map(path=>({path,bytes:1,sha256:'b'.repeat(64)})),{path:'sources/library-123.tar.gz',bytes:3,sha256:'a'.repeat(64)}]};return {manifest,lock};
}
test('vendor inventory rejects missing, unexpected, duplicate, traversal, version and source lock drift',()=>{
  const good=syntheticManifest();assert.equal(validateVendorManifest(good.manifest,good.lock).length,VENDOR_BASE_FILES.length+1);
  for(const mutate of [m=>m.files.pop(),m=>m.files.push({path:'diagnostic.json',bytes:1,sha256:'b'.repeat(64)}),m=>m.files.push(m.files[0]),m=>m.files[0].path='../secret',m=>m.packages[0].version='0.99',m=>m.runtimeModified=true,m=>m.files.at(-1).sha256='c'.repeat(64)]) {const {manifest,lock}=syntheticManifest();mutate(manifest);assert.throws(()=>validateVendorManifest(manifest,lock));}
  const {manifest,lock}=syntheticManifest();lock.sources[0].file='../secret.tar.gz';assert.throws(()=>validateVendorManifest(manifest,lock));
});
test('vendor byte validation rejects corruption and UTF-8 roundtrips of binary assets',()=>{
  const bytes=Buffer.from([0,97,115,109,255,254,128,0]),item={path:'core/ffmpeg-core.wasm',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  verifyVendorBytes(item,bytes);assert.throws(()=>verifyVendorBytes(item,Buffer.from(bytes.toString('utf8'))));const corrupt=Buffer.from(bytes);corrupt[0]=1;assert.throws(()=>verifyVendorBytes(item,corrupt));assert.throws(()=>verifyVendorBytes(item,bytes.subarray(1)));
});
