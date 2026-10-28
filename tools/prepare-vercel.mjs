// Package a small, exact source allowlist; binary runtime and sources are fetched
// from integrity-pinned official URLs during Vercel Build, never from user files.
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { VERCEL_BUILD_CONFIG, VERCEL_SOURCE_FILES, VERCEL_BINARY_SOURCE_FILES } from './build-vercel.mjs';
import { verifyManualBytes } from './build-public.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function prepareVercelSources(){
 const files=[];
 for(const file of VERCEL_SOURCE_FILES){
  const path=resolve(root,file);if(!(await lstat(path)).isFile()||(await lstat(path)).isSymbolicLink())throw new Error('Nonregular deployment source');
  if(VERCEL_BINARY_SOURCE_FILES.includes(file)){
   const bytes=await readFile(path);verifyManualBytes(bytes);
   files.push({file,data:bytes.toString('base64'),encoding:'base64'});continue;
  }
  const data=await readFile(path,'utf8');
  if(/AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk|ghp|vercel)_[A-Za-z0-9]{24,}|\/Users\/|\/Volumes\//.test(data))throw new Error('Potential secret or personal path in deployment source');
  files.push({file,data,encoding:'utf-8'});
 }
 files.push({file:'vercel.json',data:JSON.stringify(VERCEL_BUILD_CONFIG,null,2)+'\n',encoding:'utf-8'});
 files.push({file:'package.json',data:JSON.stringify({private:true,type:'module',engines:{node:'22.x'}},null,2)+'\n',encoding:'utf-8'});
 return {files,manifest:files.map(({file,data,encoding})=>{const bytes=Buffer.from(data,encoding==='base64'?'base64':'utf8');return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw new Error('Usage: node tools/prepare-vercel.mjs <new-json-file>');
 await writeFile(process.argv[2],JSON.stringify(await prepareVercelSources()),{flag:'wx'});
}
