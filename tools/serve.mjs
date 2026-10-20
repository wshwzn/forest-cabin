// tools/serve.mjs — tiny static file server (no dependencies)
import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 5178);
// bind all interfaces so phones on the same network can reach the scene
const host = process.argv[4] || '0.0.0.0';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(url.parse(req.url).pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}).listen(port, host, () => {
  const urls = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) urls.push({ name, address: a.address });
    }
  }
  console.log(`serving ${root}`);
  console.log(`  bind      ${host}:${port}`);
  console.log(`  local     http://127.0.0.1:${port}/`);
  if (urls.length) {
    console.log('  在手机浏览器里打开（需与电脑同一 Wi-Fi / 局域网）:');
    for (const u of urls) console.log(`    http://${u.address}:${port}/   (${u.name})`);
  } else {
    console.log('  (未找到局域网 IPv4 地址)');
  }
});
