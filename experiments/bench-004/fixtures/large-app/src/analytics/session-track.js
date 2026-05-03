const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
exports.startSession = ({ userId }) => { const id = shortId('asess'); table('asessions').set(id, { id, userId, startedAt: Date.now(), endedAt: null }); return id; };
exports.endSession = ({ id }) => { const s = table('asessions').get(id); if (!s) return false; s.endedAt = Date.now(); return true; };
