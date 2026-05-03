const { find, save } = require('./repository');
exports.cancelOrder = ({ orderId }) => { const o = find(orderId); if (!o || o.status === 'fulfilled') return { ok: false }; save({ ...o, status: 'cancelled' }); return { ok: true }; };
