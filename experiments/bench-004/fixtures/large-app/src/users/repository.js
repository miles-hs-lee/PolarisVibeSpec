const { table } = require('../shared/db');
function users() { return table('users'); }
exports.findByEmail = e => typeof e === 'string' ? users().get(e.toLowerCase()) || null : null;
exports.findById = id => { for (const u of users().values()) if (u.id === id) return u; return null; };
exports.save = u => { users().set(u.email.toLowerCase(), u); return u; };
exports.update = (id, patch) => { const u = exports.findById(id); if (!u) return null; const next = { ...u, ...patch }; users().set(next.email.toLowerCase(), next); return next; };
exports.list = () => Array.from(users().values());
