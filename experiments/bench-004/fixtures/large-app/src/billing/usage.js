const { table } = require('../shared/db');
exports.record = ({ userId, metric, value }) => { const k = userId+':'+metric; table('usage').set(k, (table('usage').get(k)||0)+value); };
exports.get = ({ userId, metric }) => table('usage').get(userId+':'+metric) || 0;
