// Local production server for dist/: serves the built app with exactly the headers Vercel sends
// (read from vercel.json), so browser tests run under the real Content-Security-Policy.
import { createServer } from 'node:http';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, 'dist');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4180);

/** Headers that vercel.json applies to every path. */
export function vercelHeaders(config = JSON.parse(readFileSync(join(here, 'vercel.json'), 'utf8'))) {
  const rule = config.headers.find((h) => h.source === '/(.*)');
  return Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const headers = vercelHeaders();
  createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end();
      return;
    }
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const target = normalize(join(root, path));
    if (!target.startsWith(root + sep)) {
      res.writeHead(404, headers).end();
      return;
    }
    let size;
    try {
      const st = statSync(target);
      if (!st.isFile()) throw new Error('not a file');
      size = st.size;
    } catch {
      res.writeHead(404, headers).end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(target)] ?? 'application/octet-stream', 'Content-Length': size });
    if (req.method === 'HEAD') res.end();
    else createReadStream(target).pipe(res);
  }).listen(port, host, () => console.log(`hunet vids: http://${host}:${port}/ (Ctrl+C to stop)`));
}
