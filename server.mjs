import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createLocalMediaHandler } from './local-media.mjs';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 4317);
const identity = { app: 'omni-continue-studio', pid: process.pid, startedAt: new Date().toISOString(), checkout: createHash('sha256').update(fileURLToPath(import.meta.url)).digest('hex') };
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self' https://generativelanguage.googleapis.com; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };

export function createAppServer() {
 const localMedia = createLocalMediaHandler();
 return createServer(async (req, res) => {
  const headers = { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'X-Frame-Options': 'DENY' };
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (await localMedia(req, res, path, headers)) return;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, headers).end(); return; }
    if (path === '/__local_status') {
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(identity)); return;
    }
    const target = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403, headers).end(); return; }
    const info = await stat(target);
    if (!info.isFile()) throw new Error('not a file');
    const data = await readFile(target);
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404, headers).end('Not found'); }
 });
}
export const server = createAppServer();
if (process.argv[1] && await realpath(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
 server.listen(port, '127.0.0.1', () => console.log(`Omni Continue Studio: http://127.0.0.1:${port}`));
}
