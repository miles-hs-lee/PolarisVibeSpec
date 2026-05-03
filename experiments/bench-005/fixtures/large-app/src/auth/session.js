const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
exports.create = userId => { const t = shortId('sess'); table('sessions').set(t, { token: t, userId, createdAt: new Date().toISOString() }); return t; };
exports.get = t => table('sessions').get(t) || null;
exports.destroy = t => table('sessions').delete(t);
