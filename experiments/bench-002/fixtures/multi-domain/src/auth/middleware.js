const { get } = require('./session');
const { findById } = require('../users/repository');
function requireAuth(req) {
  const auth = req.headers && req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const session = get(token);
  if (!session) return null;
  return findById(session.userId);
}
module.exports = { requireAuth };
