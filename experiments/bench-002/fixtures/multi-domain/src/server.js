const http = require('http');
const { dispatch } = require('./router');
function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function createServer() {
  return http.createServer(async (req, res) => {
    let body = {};
    if (req.method === 'POST') {
      try { body = await readJson(req); } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'invalid_json' }));
      }
    }
    const { status, body: out } = dispatch(req.method, req.url, body);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
}
module.exports = { createServer };
