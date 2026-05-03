const { findById, update } = require('./repository');
exports.getProfile = ({ userId }) => { const u = findById(userId); return u ? { ok: true, profile: { id: u.id, email: u.email, name: u.name || null } } : { ok: false }; };
exports.updateProfile = ({ userId, patch }) => { const u = update(userId, patch || {}); return u ? { ok: true, profile: u } : { ok: false }; };
