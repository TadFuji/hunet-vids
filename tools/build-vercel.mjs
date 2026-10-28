// Build only public application sources. No credentials or user media are read.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildPublic, VERCEL_CONFIG, PUBLIC_FILES, PUBLIC_BINARY_FILES } from './build-public.mjs';
export const VERCEL_BINARY_SOURCE_FILES = Object.freeze(PUBLIC_BINARY_FILES.map(name=>'dist/'+name));
export const VERCEL_SOURCE_FILES = Object.freeze([...PUBLIC_FILES.map(name=>'dist/'+name), ...VERCEL_BINARY_SOURCE_FILES, 'dist/vendor/ffmpeg/licenses/README.md', 'tools/vendor-ffmpeg.mjs', 'tools/ffmpeg-source-lock.json', 'tools/build-public.mjs', 'tools/build-vercel.mjs']);
export const VERCEL_BUILD_CONFIG = Object.freeze({...VERCEL_CONFIG, buildCommand:'node tools/build-vercel.mjs', outputDirectory:'public'});
export async function buildVercel() {
  const root=fileURLToPath(new URL('../',import.meta.url));
  await promisify(execFile)(process.execPath,['tools/vendor-ffmpeg.mjs'],{cwd:root,timeout:20*60*1000,maxBuffer:1024*1024});
  const output=resolve(root,'public');
  const manifest=await buildPublic(output);
  // The root vercel.json supplies deployment headers; it is not a public asset.
  await rm(resolve(output,'vercel.json'));
  await writeFile(resolve(root,'public-build-manifest.json'),JSON.stringify(manifest.filter(x=>x.file!=='vercel.json'),null,2)+'\n',{flag:'wx'});
  process.stdout.write('Pinned public build complete.\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await buildVercel();
