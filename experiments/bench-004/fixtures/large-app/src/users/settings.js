const { update, findById } = require('./repository');
exports.getSettings = ({ userId }) => { const u = findById(userId); return u ? { ok: true, settings: u.settings || {} } : { ok: false }; };
exports.updateSettings = ({ userId, settings }) => { const u = update(userId, { settings }); return u ? { ok: true } : { ok: false }; };
