const { update } = require('./repository');
exports.suspend = ({ userId, reason }) => { const u = update(userId, { suspended: true, suspendedReason: reason||null }); return u ? { ok: true } : { ok: false }; };
exports.unsuspend = ({ userId }) => { const u = update(userId, { suspended: false, suspendedReason: null }); return u ? { ok: true } : { ok: false }; };
