const { table } = require('../shared/db');
exports.findToken = t => table('sessions').get(t) || null;
exports.listSessions = uid => Array.from(table('sessions').values()).filter(s => s.userId === uid);
