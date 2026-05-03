const crypto = require('crypto');
function uuid() { return crypto.randomUUID(); }
function shortId(prefix) {
  const r = crypto.randomBytes(6).toString('hex');
  return prefix ? `${prefix}_${r}` : r;
}
module.exports = { uuid, shortId };
