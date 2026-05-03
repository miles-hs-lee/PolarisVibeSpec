const { table } = require('../shared/db');
exports.logEvent = ({ userId, action, meta }) => { table('audit').set(require('../shared/ids').shortId('a'), { userId, action, meta, ts: new Date().toISOString() }); };
exports.getAudit = ({ userId }) => Array.from(table('audit').values()).filter(e => e.userId === userId);
