const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
exports.enqueue = msg => { const id = shortId('n'); table('notifQ').set(id, { id, ...msg, status: 'pending' }); return id; };
exports.dequeue = () => { for (const m of table('notifQ').values()) if (m.status === 'pending') { m.status = 'sent'; return m; } return null; };
exports.size = () => table('notifQ').size;
