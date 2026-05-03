const { find, save } = require('./repository');
exports.fulfill = ({ orderId }) => { const o = find(orderId); if (!o || o.status !== 'pending') return { ok: false }; save({ ...o, status: 'fulfilled', fulfilledAt: new Date().toISOString() }); return { ok: true }; };
