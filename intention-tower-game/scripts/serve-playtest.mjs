import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export function servePlaytest(port = 4173, root = resolve('dist')) {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = resolve(root, `.${pathname}`);
      if (!file.startsWith(root + sep) && file !== root) throw new Error('Invalid path');
      try { if (!(await stat(file)).isFile()) file = resolve(root, 'index.html'); }
      catch { file = resolve(root, 'index.html'); }
      response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch (error) { response.statusCode = 404; response.end(String(error)); }
  }).listen(port, '127.0.0.1');
}
if (process.argv[1]?.endsWith('serve-playtest.mjs')) {
  servePlaytest();
  console.log('Built game: http://127.0.0.1:4173 (start intention-tower-mcp alongside it)');
}
