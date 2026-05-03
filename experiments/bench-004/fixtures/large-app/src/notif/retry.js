const { table } = require('../shared/db');
exports.retryFailed = () => { let n = 0; for (const m of table('notifQ').values()) if (m.status === 'failed') { m.status = 'pending'; n++; } return { ok: true, retried: n }; };
