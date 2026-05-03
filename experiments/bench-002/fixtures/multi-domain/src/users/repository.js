const { table } = require('../shared/db');
function users() { return table('users'); }
function findByEmail(email) {
  if (typeof email !== 'string') return null;
  return users().get(email.toLowerCase()) || null;
}
function findById(id) {
  for (const u of users().values()) if (u.id === id) return u;
  return null;
}
function save(user) { users().set(user.email.toLowerCase(), user); return user; }
function update(id, patch) {
  const u = findById(id);
  if (!u) return null;
  const next = { ...u, ...patch };
  users().set(next.email.toLowerCase(), next);
  return next;
}
module.exports = { findByEmail, findById, save, update };
