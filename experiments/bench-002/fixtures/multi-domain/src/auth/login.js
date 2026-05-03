const { findByEmail } = require('../users/repository');
const { verify } = require('./password');
const { create } = require('./session');
function login({ email, password }) {
  if (typeof email !== 'string' || typeof password !== 'string') return { ok: false, error: 'invalid_request' };
  const user = findByEmail(email);
  if (!user) return { ok: false, error: 'invalid_credentials' };
  if (!verify(password, user.password_hash)) return { ok: false, error: 'invalid_credentials' };
  const session = create(user.id);
  return { ok: true, token: session.token, user };
}
module.exports = { login };
