const { find } = require('./repository');
exports.track = ({ orderId }) => { const o = find(orderId); return o ? { ok: true, status: o.status, fulfilledAt: o.fulfilledAt } : { ok: false }; };
