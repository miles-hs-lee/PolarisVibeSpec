const { findByEmail, update } = require('../users/repository');
const { hash } = require('./password');
exports.resetPassword = ({ email, newPassword }) => {
  const u = findByEmail(email);
  if (!u) return { ok: false, error: 'not_found' };
  update(u.id, { passwordHash: hash(newPassword) });
  return { ok: true };
};
