// kaz-edge-relay: tiny WebSocket relay in front of the Cloudflare Worker.
// Client (Clash) -> wss://<relay host><ws-path> -> this app -> wss://kaz-edge-01.kaz-1a8.workers.dev<ws-path> -> Worker
// It never looks inside the traffic; it just pipes WebSocket frames.
const http = require('http');
const WebSocket = require('ws');

const PORT = parseInt(process.env.PORT || '8080', 10);
const UPSTREAM = 'wss://kaz-edge-01.kaz-1a8.workers.dev';

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (client) => {
    const target = UPSTREAM + req.url;
    const upstream = new WebSocket(target);
    let closed = false;
    const closeBoth = () => {
      if (closed) return;
      closed = true;
      try { client.close(); } catch (_) {}
      try { upstream.close(); } catch (_) {}
    };
    upstream.on('open', () => {
      client.on('message', (data, isBinary) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      });
    });
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    upstream.on('close', closeBoth);
    upstream.on('error', closeBoth);
    client.on('close', closeBoth);
    client.on('error', closeBoth);
  });
});

server.listen(PORT, () => console.log(`relay listening on ${PORT}`));
