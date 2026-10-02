// Tiny HTTP wrapper around the real Code.gs (in-memory sheet) for browser tests.
const http = require('http');
const { createBackend } = require('./gs-harness');
const b = createBackend({ props: { PROXY_SECRET: process.env.PAGE_SECRET || 'dmb!ENH-weu9rda9rgk' } });
b.seedLegacy([
  ['c1','Ann Test','ann@x.com','555-0101','','','Facebook','["Cruise"]','Likes balconies','Oct 1, 2026, 9:00 AM'],
  ['c2','Bob Roe','bob@x.com','','','','Instagram','["All-Inclusive Resort"]','','Oct 1, 2026, 9:00 AM'],
], [['t0','c1','Send brochure','2026-10-01','false','Oct 1, 2026, 9:00 AM']]);
const server = http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(200, cors); return res.end(); }
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    if (req.url === '/__state') {
      res.writeHead(200, cors);
      const out = {}; Object.keys(b.tabs).forEach(k => out[k] = b.tabs[k].rows);
      return res.end(JSON.stringify(out));
    }
    if (req.url === '/__now') { b.setNow(JSON.parse(body).now); res.writeHead(200, cors); return res.end('{}'); }
    if (req.url === '/__log') { res.writeHead(200, cors); return res.end(JSON.stringify(server.log || [])); }
    const data = JSON.parse(body || '{}');
    (server.log = server.log || []).push({ type: data.type, action: data.action });
    const r = b.post(data);
    res.writeHead(200, cors); res.end(JSON.stringify(r));
  });
});
server.listen(process.env.PORT || 8799, () => console.log('gs-server ready'));
