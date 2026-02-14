import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const args = process.argv.slice(2);

const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
};

const rootDir = resolve(normalize(argValue('--dir', 'dist')));
const port = Number(argValue('--port', '4321'));
const host = argValue('--host', '127.0.0.1');

if (!Number.isFinite(port) || port <= 0) {
  console.error(`Invalid port: ${String(port)}`);
  process.exit(1);
}

const withinRoot = (candidatePath) => {
  const normalized = resolve(candidatePath);
  return normalized === rootDir || normalized.startsWith(`${rootDir}${sep}`);
};

const fileExists = async (candidatePath) => {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
};

const pickFilePath = async (requestPathname) => {
  const basePath = decodeURIComponent(requestPathname || '/');
  const trimmed = basePath.replace(/^[/\\]+/, '');
  const safePath = normalize(trimmed).replace(/^(\.\.[/\\])+/, '');
  const joined = resolve(rootDir, safePath);

  if (!withinRoot(joined)) {
    return null;
  }

  const candidates = [];
  if (!safePath || safePath.endsWith('/')) {
    candidates.push(join(joined, 'index.html'));
  } else {
    candidates.push(joined);
    candidates.push(`${joined}.html`);
    candidates.push(join(joined, 'index.html'));
  }

  for (const candidate of candidates) {
    if (!withinRoot(candidate)) continue;
    if (await fileExists(candidate)) return candidate;
  }

  const notFoundPage = join(rootDir, '404.html');
  if (await fileExists(notFoundPage)) return notFoundPage;
  return null;
};

const sendFile = async (res, filePath) => {
  const fileStat = await stat(filePath);
  const extension = extname(filePath).toLowerCase();
  const mime = MIME[extension] || 'application/octet-stream';
  const statusCode = filePath.endsWith('/404.html') ? 404 : 200;

  res.writeHead(statusCode, {
    'Content-Type': mime,
    'Content-Length': fileStat.size,
    'Cache-Control': 'no-cache',
  });

  createReadStream(filePath).pipe(res);
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    const filePath = await pickFilePath(url.pathname);

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    await sendFile(res, filePath);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`[static-preview] serving ${rootDir} on http://${host}:${port}`);
});
