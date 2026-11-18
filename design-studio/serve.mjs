import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Ce serveur est volontairement séparé de Next.js et ne sert que le prototype.
const root = fileURLToPath(new URL('public', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://studio.local').pathname);
    const file = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
    const type = mime[extname(file)];
    if (!file.startsWith(`${root}${sep}`) || !type) throw new Error('Absent');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'",
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Aperçu : fichier introuvable.');
  }
}).listen(port, '0.0.0.0', () => console.log(`Studio de maquettes PâtisGest : port ${port}`));
