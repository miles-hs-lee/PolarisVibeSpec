const { table } = require('../shared/db');
const { findByEmail, update } = require('../users/repository');
exports.requestVerify = ({ email }) => { const u = findByEmail(email); if (!u) return { ok: false }; const tok = require('../shared/ids').shortId('vrf'); table('verify').set(tok, u.id); return { ok: true, token: tok }; };
exports.confirmVerify = ({ token }) => { const id = table('verify').get(token); if (!id) return { ok: false }; update(id, { verified: true }); table('verify').delete(token); return { ok: true }; };
