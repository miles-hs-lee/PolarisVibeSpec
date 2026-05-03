const { listByUser } = require('./repository');
exports.summarize = ({ userId }) => { const orders = listByUser(userId); return { ok: true, total: orders.length, totalSpend: orders.reduce((s,o)=>s+o.total,0) }; };
