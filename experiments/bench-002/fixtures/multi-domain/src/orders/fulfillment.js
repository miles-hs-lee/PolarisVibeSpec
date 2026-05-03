const { find, save } = require('./repository');
function fulfill({ orderId }) {
  const order = find(orderId);
  if (!order) return { ok: false, error: 'order_not_found' };
  if (order.status !== 'pending') return { ok: false, error: 'invalid_status' };
  const updated = { ...order, status: 'fulfilled', fulfilledAt: new Date().toISOString() };
  save(updated);
  return { ok: true, order: updated };
}
module.exports = { fulfill };
