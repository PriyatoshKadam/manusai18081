const http = require('http');
const next = require('next');

const port = Number(process.env.PORT || 3000);
const hostname = '0.0.0.0';
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

function reject(res) {
  res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' });
  res.end('Unsupported request');
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const target = req.url || '';
    if (req.headers.upgrade || /^https?:\/\//i.test(target)) return reject(res);
    return handle(req, res);
  });
  server.on('upgrade', (req, socket) => {
    try { socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); } finally { socket.destroy(); }
  });
  server.listen(port, hostname, () => console.log(`GA4Fix listening on ${hostname}:${port}`));
}).catch((error) => {
  console.error('Unable to start GA4Fix:', error);
  process.exit(1);
});
