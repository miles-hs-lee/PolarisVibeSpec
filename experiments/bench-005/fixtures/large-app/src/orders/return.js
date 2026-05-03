const { find, save } = require('./repository');
exports.requestReturn = ({ orderId, reason }) => { const o = find(orderId); if (!o || o.status !== 'fulfilled') return { ok: false }; save({ ...o, returnRequested: true, returnReason: reason }); return { ok: true }; };
