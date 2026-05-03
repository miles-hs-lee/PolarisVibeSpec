const { uuid } = require('../shared/ids');
const { isEmail } = require('../shared/validation');
const { findByEmail, save } = require('../users/repository');
const { hash } = require('./password');
function signup({ email, password }) {
  if (!isEmail(email)) return { ok: false, error: 'invalid_email' };
  if (typeof password !== 'string' || password.length < 8) return { ok: false, error: 'weak_password' };
  if (findByEmail(email)) return { ok: false, error: 'email_taken' };
  const user = { id: uuid(), email: email.toLowerCase(), passwordHash: hash(password), createdAt: new Date().toISOString() };
  save(user);
  return { ok: true, user };
}
module.exports = { signup };
