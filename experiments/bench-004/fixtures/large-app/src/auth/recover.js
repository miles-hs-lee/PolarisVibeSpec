const { findByEmail } = require('../users/repository');
exports.startRecovery = ({ email }) => { const u = findByEmail(email); if (!u) return { ok: false }; return { ok: true, token: require('../shared/ids').shortId('rcv') }; };
