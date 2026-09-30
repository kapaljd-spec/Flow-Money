import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

function sendText(response, status, text) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(text);
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    sendText(response, 405, 'Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    sendText(response, 400, 'Invalid URL');
    return;
  }

  const requestedPath = resolve(root, `.${pathname}`);
  if (requestedPath !== root && !requestedPath.startsWith(`${root}${sep}`)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  let filePath = requestedPath;
  try {
    const requestedStats = await stat(filePath);
    if (requestedStats.isDirectory()) filePath = resolve(filePath, 'index.html');
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      sendText(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Length': fileStats.size,
      'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    sendText(response, 404, 'Not found');
  }
});

const requestedPort = Number(process.env.PORT) || 0;
server.listen(requestedPort, '0.0.0.0', () => {
  const address = server.address();
  console.log(`FlowMoney local server: http://localhost:${address.port}`);
  console.log(`Dashboard: http://localhost:${address.port}/dashboard`);
});