// Private fixture harness only. Never include test/ in a publication build.
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = await realpath(path.join(root, 'dist'));
const host = '127.0.0.1'; const port = 4318;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.gz': 'application/gzip' };
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; media-src blob:; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
  if (req.headers.host !== `${host}:${port}` || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); res.end(); return; }
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (url.search) throw new Error('query');
    let pathname = decodeURIComponent(url.pathname); if (pathname === '/') pathname = '/test/browser-harness.html';
    const harness = ['/test/browser-harness.html', '/test/browser-harness.js'].includes(pathname);
    if (!harness && (pathname.startsWith('/test/') || pathname.includes('\\') || pathname.split('/').includes('..'))) throw new Error('path');
    const file = await realpath(path.join(harness ? root : dist, pathname));
    if (harness ? file !== path.join(root, pathname) : !file.startsWith(dist + path.sep)) throw new Error('path');
    const info = await stat(file); if (!info.isFile()) throw new Error('file');
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.setHeader('Content-Length', info.size); res.writeHead(200);
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
server.on('error', () => { process.stderr.write('Private harness could not start.\n'); process.exitCode = 1; });
server.listen(port, host, () => process.stdout.write('Private fixture harness: http://127.0.0.1:4318/\n'));
