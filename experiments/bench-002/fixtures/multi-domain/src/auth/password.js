const crypto = require('crypto');
function hash(password) {
  if (typeof password !== 'string' || !password.length) throw new Error('bad password');
  const salt = crypto.randomBytes(16).toString('hex');
  const d = crypto.createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${d}`;
}
function verify(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, d] = stored.split(':');
  const c = crypto.createHash('sha256').update(salt + password).digest('hex');
  return c === d;
}
module.exports = { hash, verify };
