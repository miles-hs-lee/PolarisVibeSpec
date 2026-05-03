const { table } = require('../shared/db');
const { findById } = require('./repository');
exports.deleteUser = ({ userId }) => { const u = findById(userId); if (!u) return { ok: false }; table('users').delete(u.email.toLowerCase()); return { ok: true }; };
