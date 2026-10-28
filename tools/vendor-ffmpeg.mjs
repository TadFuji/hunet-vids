// Reproduce the pinned runtime without npm install or package lifecycle scripts.
// Network use is restricted to the explicitly pinned public URLs below.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'dist/vendor/ffmpeg');
const cacheIndex = process.argv.indexOf('--cache-dir');
const cache = cacheIndex >= 0 ? path.resolve(process.argv[cacheIndex + 1]) : null;
const sourceLockBytes = await readFile(path.join(root, 'tools/ffmpeg-source-lock.json'));
const sourceLock = JSON.parse(sourceLockBytes);
const pinned = [
  { name: '@ffmpeg/ffmpeg', version: '0.12.15', file: 'ffmpeg-0.12.15.tgz', url: 'https://registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-0.12.15.tgz', integrity: 'sha512-1C8Obr4GsN3xw+/1Ww6PFM84wSQAGsdoTuTWPOj2OizsRDLT4CXTaVjPhkw6ARyDus1B9X/L2LiXHqYYsGnRFw==', folder: 'ffmpeg', files: ['classes.js', 'const.js', 'errors.js', 'index.js', 'types.js', 'utils.js', 'worker.js'] },
  { name: '@ffmpeg/core', version: '0.12.10', file: 'core-0.12.10.tgz', url: 'https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz', integrity: 'sha512-dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==', folder: 'core', files: ['ffmpeg-core.js', 'ffmpeg-core.wasm'] },
];
const supplemental = [
  { file: 'ffmpeg-wrapper-LICENSE', url: 'https://raw.githubusercontent.com/ffmpegwasm/ffmpeg.wasm/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/LICENSE', sha256: '3e123e29517d76504ffce77b3f8e2ccffd4712493f27694b0aba3e376676459f', output: 'licenses/wrapper-MIT.txt' },
  { file: 'ffmpeg-core-COPYING.GPLv2', url: 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n5.1.4/COPYING.GPLv2', sha256: '8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643', output: 'licenses/core-COPYING.GPLv2.txt' },
  { file: 'ffmpeg-core-LICENSE.md', url: 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n5.1.4/LICENSE.md', sha256: 'cb48bf09a11f5fb576cddb0431c8f5ed0a60157a9ec942adffc13907cbe083f2', output: 'licenses/core-LICENSE.md' },
  { file: 'ffmpeg-wasm-v12.15-source.tar.gz', url: 'https://codeload.github.com/ffmpegwasm/ffmpeg.wasm/tar.gz/refs/tags/v12.15', sha256: '98e473f975e4aa6e5836d99078c40db5d8f4ea52685e6411025f2d7b876a7569', output: 'sources/ffmpeg-wasm-v12.15-source.tar.gz' },
];
async function acquire(item) {
  let bytes;
  if (cache) bytes = await readFile(path.join(cache, item.file));
  else {
    const response = await fetch(item.url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Pinned asset unavailable: ${item.file}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const valid = item.integrity ? `sha512-${createHash('sha512').update(bytes).digest('base64')}` === item.integrity : createHash('sha256').update(bytes).digest('hex') === item.sha256;
  if (!valid) throw new Error(`Pinned integrity mismatch: ${item.file}`);
  return bytes;
}
const temporary = await mkdtemp(path.join(tmpdir(), 'omni-vendor-'));
try {
  for (const item of pinned) {
    const archive = path.join(temporary, item.file); await writeFile(archive, await acquire(item));
    const unpack = path.join(temporary, item.folder); await mkdir(unpack);
    // Extract only fixed regular-file paths; never run scripts shipped in packages.
    const entries = item.files.map(name => `package/dist/esm/${name}`);
    await exec('tar', ['-xzf', archive, '-C', unpack, ...entries]);
    await mkdir(path.join(destination, item.folder), { recursive: true });
    for (const name of item.files) await copyFile(path.join(unpack, 'package/dist/esm', name), path.join(destination, item.folder, name));
  }
  for (const item of supplemental) { const output = path.join(destination, item.output); await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, await acquire(item)); }
  for (const item of sourceLock.sources) {
    if (!/^[A-Za-z0-9._-]+\.tar\.gz$/.test(item.file) || !/^https:\/\/codeload\.github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/tar\.gz\/[a-f0-9]{40}$/.test(item.url)) throw new Error('Invalid fixed source lock');
    const bytes = await acquire(item);
    if (bytes.length !== item.bytes) throw new Error('Source archive size mismatch');
    await writeFile(path.join(destination, 'sources', item.file), bytes);
  }
  await writeFile(path.join(destination, 'sources/source-lock.json'), sourceLockBytes);
  const files = [];
  async function inventory(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await inventory(file);
      else if (entry.isFile() && entry.name !== 'manifest.json') { const bytes = await readFile(file); files.push({ path: path.relative(destination, file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    }
  }
  await inventory(destination);
  await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ schemaVersion: 1, runtimeModified: false, packages: pinned.map(({ name, version, url, integrity }) => ({ name, version, url, integrity })), releaseSourceCommit: '71aa99d37c02a7b4c435275ca9ef50e612f6efa1', sources: [...supplemental, ...sourceLock.sources], correspondenceReview: 'See licenses/README.md and sources/source-lock.json for supplied source inventory, evidence and limitations.', files }, null, 2) + '\n');
  process.stdout.write(`Pinned ffmpeg runtime prepared: ${files.length} files.\n`);
} finally { await rm(temporary, { recursive: true, force: true }); }
