import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { handleConnection } from './ws-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ─── Static file server for client build ─────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.woff2': 'font/woff2',
};

const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  // Prevent path traversal
  const safePath = path.normalize(url).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(CLIENT_DIST, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback
    filePath = path.join(CLIENT_DIST, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Client not built. Run: npm run build --workspace=client');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] ?? 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // Keep-alive ping endpoint (used by client on Render free tier)
  if (req.url === '/ping' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
    return;
  }
  serveStatic(req, res);
});

// ─── WebSocket server ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket, req) => {
  handleConnection(socket, req);
});

server.listen(PORT, () => {
  console.log(`Splendor server listening on http://localhost:${PORT}`);
});

