const { update, findById } = require('./repository');
exports.setPreference = ({ userId, key, value }) => { const u = findById(userId); if (!u) return { ok: false }; const prefs = { ...(u.preferences||{}), [key]: value }; update(userId, { preferences: prefs }); return { ok: true }; };
