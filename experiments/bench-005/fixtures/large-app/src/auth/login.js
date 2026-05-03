const { findByEmail } = require('../users/repository');
const { verify } = require('./password');
const { create } = require('./session');
function login({ email, password }) {
  const user = findByEmail(email);
  if (!user || !verify(password, user.passwordHash)) return { ok: false, error: 'invalid_credentials' };
  return { ok: true, token: create(user.id), user };
}
module.exports = { login };
