const { table } = require('../shared/db');
exports.recent = () => Array.from(table('notifQ').values()).slice(-50);
