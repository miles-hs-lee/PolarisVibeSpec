const { table } = require('../shared/db');
const { findByEmail } = require('../users/repository');
const { create } = require('./session');
const { shortId } = require('../shared/ids');
exports.sendMagic = ({ email }) => { const u = findByEmail(email); if (!u) return { ok: false }; const t = shortId('mgc'); table('magic').set(t, u.id); return { ok: true, token: t }; };
exports.consumeMagic = ({ token }) => { const id = table('magic').get(token); if (!id) return { ok: false }; table('magic').delete(token); return { ok: true, sessionToken: create(id) }; };
