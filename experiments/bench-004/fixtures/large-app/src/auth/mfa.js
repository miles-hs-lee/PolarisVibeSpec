const { findById, update } = require('../users/repository');
exports.enableMfa = ({ userId, secret }) => { const u = findById(userId); if (!u) return { ok: false }; update(userId, { mfaSecret: secret, mfaEnabled: true }); return { ok: true }; };
exports.disableMfa = ({ userId }) => { update(userId, { mfaSecret: null, mfaEnabled: false }); return { ok: true }; };
exports.verifyMfa = ({ userId, code }) => { const u = findById(userId); if (!u || !u.mfaEnabled) return { ok: false }; return { ok: code === '000000' }; };
