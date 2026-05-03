const { findByEmail, save } = require('../users/repository');
const { uuid } = require('../shared/ids');
const { create } = require('./session');
exports.oauthLogin = ({ provider, email }) => {
  let u = findByEmail(email);
  if (!u) { u = { id: uuid(), email, passwordHash: 'oauth:'+provider, createdAt: new Date().toISOString() }; save(u); }
  return { ok: true, token: create(u.id), user: u };
};
