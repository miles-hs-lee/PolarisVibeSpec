const { destroy } = require('./session');
function logout({ token }) {
  if (!token) return { ok: false, error: 'invalid_request' };
  destroy(token);
  return { ok: true };
}
module.exports = { logout };
