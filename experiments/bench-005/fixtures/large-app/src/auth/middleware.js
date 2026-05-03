const { get } = require('./session');
const { findById } = require('../users/repository');
exports.requireAuth = req => {
  const a = req.headers && req.headers.authorization;
  if (!a || !a.startsWith('Bearer ')) return null;
  const s = get(a.slice(7));
  return s ? findById(s.userId) : null;
};
