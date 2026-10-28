import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareVercelSources} from '../tools/prepare-vercel.mjs';
import {VERCEL_BUILD_CONFIG,VERCEL_SOURCE_FILES,VERCEL_BINARY_SOURCE_FILES} from '../tools/build-vercel.mjs';
import {VERCEL_CONFIG} from '../tools/build-public.mjs';
test('Vercel sources preserve the allowlisted PDF bytes and retain security headers',async()=>{
 const {files,manifest}=await prepareVercelSources();
 assert.deepEqual(files.map(x=>x.file),[...VERCEL_SOURCE_FILES,'vercel.json','package.json']);
 assert.ok(manifest.reduce((sum,x)=>sum+x.bytes,0)<750000);
 for(const file of VERCEL_BINARY_SOURCE_FILES){
  const item=files.find(x=>x.file===file),original=await readFile(new URL('../'+file,import.meta.url));
  assert.equal(item.encoding,'base64');assert.deepEqual(Buffer.from(item.data,'base64'),original);
  assert.equal(manifest.find(x=>x.file===file).sha256,createHash('sha256').update(original).digest('hex'));
  assert.equal(manifest.find(x=>x.file===file).bytes,original.length);
 }
 assert.doesNotMatch(files.map(x=>x.file).join('\n'),/test\/|fixtures|\.runtime|\.env|\.wasm|\.tar\.gz/);
 assert.ok(files.some(x=>x.file==='dist/vendor/ffmpeg/licenses/README.md'));
 assert.deepEqual(VERCEL_BUILD_CONFIG.headers,VERCEL_CONFIG.headers);
 assert.equal(VERCEL_BUILD_CONFIG.outputDirectory,'public');
 assert.equal(VERCEL_BUILD_CONFIG.buildCommand,'node tools/build-vercel.mjs');
 assert.equal(VERCEL_BUILD_CONFIG.installCommand,'');assert.equal(VERCEL_BUILD_CONFIG.public,false);
 assert.equal(JSON.parse(files.find(x=>x.file==='package.json').data).dependencies,undefined);
});
