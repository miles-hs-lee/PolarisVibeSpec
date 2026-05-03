const http = require('http');
const { dispatch } = require('./router');
exports.createServer = () => http.createServer(async (req, res) => {
  let body = {};
  if (req.method === 'POST') {
    let buf = ''; req.on('data', c => buf += c);
    await new Promise(r => req.on('end', r));
    try { body = buf ? JSON.parse(buf) : {}; } catch { res.writeHead(400); return res.end('{"error":"invalid_json"}'); }
  }
  const { status, body: out } = dispatch(req.method, req.url, body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(out));
});
