import { readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const PUBLIC_FILES = Object.freeze(['index.html', 'app.js', 'core.js', 'google.js', 'narration.js', 'music.js', 'api-errors.js', 'media.js', 'browser-media.js', 'local-media-client.js', 'runtime.js', 'style.css', 'base.css', 'assets/mark.svg']);
export const PUBLIC_BINARY_FILES = Object.freeze(['manuals/omni-continue-user-guide-20261016.pdf']);
export function verifyManualBytes(data) {
  if (!Buffer.isBuffer(data) || data.length > 2 * 1024 * 1024 || data.subarray(0, 5).toString('ascii') !== '%PDF-' || !data.subarray(-32).includes(Buffer.from('%%EOF'))) throw new Error('Invalid public PDF manual');
}
const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const csp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self' https://generativelanguage.googleapis.com; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
export const VERCEL_CONFIG = Object.freeze({ version: 2, framework: null, buildCommand: '', installCommand: '', outputDirectory: '.', public: false, headers: [{ source: '/(.*)', headers: [
  { key: 'Content-Security-Policy', value: csp }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'no-store' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }, { key: 'X-Frame-Options', value: 'DENY' },
] }, { source: '/vendor/ffmpeg/ffmpeg/worker.js', headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'none'; connect-src 'self'; base-uri 'none'; object-src 'none'" }] }, { source: '/vendor/ffmpeg/core/ffmpeg-core.wasm', headers: [{ key: 'Content-Type', value: 'application/wasm' }] }, { source: '/manuals/omni-continue-user-guide-20261016.pdf', headers: [{ key: 'Content-Type', value: 'application/pdf' }, { key: 'Content-Disposition', value: 'attachment; filename="omni-continue-user-guide-20261016.pdf"' }] }, { source: '/vendor/ffmpeg/sources/(.*).tar.gz', headers: [{ key: 'Content-Type', value: 'application/gzip' }] }] });
const stub = `import { StudioError } from './core.js';\nconst unavailable = () => { throw new StudioError('この版ではMacのローカル動画処理を利用できません。'); };\nexport const prepareSource = unavailable, prepareContinuation = unavailable, composeSource = unavailable, trimVideo = unavailable, mixAudio = unavailable;\n`;
export const VENDOR_BASE_FILES = Object.freeze(['core/ffmpeg-core.js', 'core/ffmpeg-core.wasm', 'ffmpeg/classes.js', 'ffmpeg/const.js', 'ffmpeg/errors.js', 'ffmpeg/index.js', 'ffmpeg/types.js', 'ffmpeg/utils.js', 'ffmpeg/worker.js', 'licenses/core-COPYING.GPLv2.txt', 'licenses/core-LICENSE.md', 'licenses/README.md', 'licenses/wrapper-MIT.txt', 'sources/ffmpeg-wasm-v12.15-source.tar.gz', 'sources/source-lock.json']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function regularFile(base, name) {
  const parts = name.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes('\\'))) throw new Error('Invalid distribution path');
  for (let i = 0; i < parts.length; i++) {
    const stat = await lstat(resolve(base, ...parts.slice(0, i + 1)));
    if (stat.isSymbolicLink() || (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) throw new Error('Expected regular distribution path: ' + name);
  }
}
export function validateVendorManifest(manifest, lock) {
  if (manifest?.schemaVersion !== 1 || manifest.runtimeModified !== false || !Array.isArray(manifest.files) || lock?.schemaVersion !== 1 || !Array.isArray(lock.sources)) throw new Error('Invalid vendor manifest');
  const versions = manifest.packages?.map(x => `${x.name}@${x.version}`).sort();
  if (JSON.stringify(versions) !== JSON.stringify(['@ffmpeg/core@0.12.10', '@ffmpeg/ffmpeg@0.12.15'])) throw new Error('Unexpected vendor versions');
  const sources = lock.sources.map(item => {
    if (!/^[A-Za-z0-9_.-]+\.tar\.gz$/.test(item.file) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) throw new Error('Invalid source lock');
    return { ...item, path: 'sources/' + item.file };
  });
  const allowed = [...VENDOR_BASE_FILES, ...sources.map(x => x.path)];
  const found = manifest.files.map(item => item.path);
  if (new Set(allowed).size !== allowed.length || new Set(found).size !== found.length || JSON.stringify([...allowed].sort()) !== JSON.stringify([...found].sort())) throw new Error('Unexpected vendor file inventory');
  for (const item of manifest.files) {
    if (!/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) throw new Error('Invalid vendor digest');
    const locked = sources.find(x => x.path === item.path);
    if (locked && (locked.sha256 !== item.sha256 || locked.bytes !== item.bytes)) throw new Error('Source lock mismatch');
  }
  return manifest.files;
}
export function verifyVendorBytes(item, data) {
  if (!Buffer.isBuffer(data) || data.length !== item.bytes || digest(data) !== item.sha256) throw new Error('Vendor integrity mismatch: ' + item.path);
}
async function vendorFiles() {
  const manifestPath = 'vendor/ffmpeg/manifest.json';
  await regularFile(root, manifestPath);
  const manifestBytes = await readFile(resolve(root, manifestPath));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const lockBytes = await readFile(new URL('./ffmpeg-source-lock.json', import.meta.url));
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const entries = validateVendorManifest(manifest, lock);
  const files = [{ file: manifestPath, data: manifestBytes }];
  for (const item of entries) {
    const file = 'vendor/ffmpeg/' + item.path;
    await regularFile(root, file);
    const data = await readFile(resolve(root, file)); // WASM and archives remain bytes.
    verifyVendorBytes(item, data);
    if (item.path === 'sources/source-lock.json' && !data.equals(lockBytes)) throw new Error('Published source lock differs from build lock');
    if (file.endsWith('.js') && /AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk|ghp|vercel)_[A-Za-z0-9]{24,}|\/Users\/|\/Volumes\//.test(data.toString('utf8'))) throw new Error('Potential secret or personal path in vendor JavaScript');
    files.push({ file, data });
  }
  return files;
}
export async function buildPublic(outputDirectory) {
  const output = resolve(outputDirectory);
  if (output === root || output.startsWith(root + '/')) throw new Error('Choose a separate empty output directory');
  try { if ((await readdir(output)).length) throw new Error('Output directory must be empty'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  // Read only an exact source allowlist; never walk the checkout or copy user media.
  const files = [];
  for (const name of PUBLIC_FILES) {
    await regularFile(root, name);
    let data = await readFile(resolve(root, name), 'utf8');
    if (name === 'runtime.js') data = 'export const localMediaEnabled = true;\nexport const browserMediaEnabled = true;\n';
    if (name === 'local-media-client.js') data = stub;
    if (/AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk|ghp|vercel)_[A-Za-z0-9]{24,}|\/Users\/|\/Volumes\//.test(data)) throw new Error('Potential secret or personal path in application file: ' + name);
    files.push({ file: name, data });
  }
  for (const name of PUBLIC_BINARY_FILES) {
    await regularFile(root, name);
    const data = await readFile(resolve(root, name));
    verifyManualBytes(data);
    files.push({ file: name, data });
  }
  files.push(...await vendorFiles());
  files.push({ file: 'vercel.json', data: JSON.stringify(VERCEL_CONFIG, null, 2) + '\n' });
  for (const { file, data } of files) { const target = resolve(output, file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, data, { flag: 'wx' }); }
  return files.map(({ file, data }) => ({ file, bytes: Buffer.byteLength(data), sha256: createHash('sha256').update(data).digest('hex') }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node tools/build-public.mjs <empty-output-directory>');
  console.log(JSON.stringify(await buildPublic(process.argv[2]), null, 2));
}
