function makeOrder({ id, userId, items, total, status }) {
  if (!id) throw new Error('order.id required');
  if (!userId) throw new Error('order.userId required');
  if (!Array.isArray(items) || items.length === 0) throw new Error('order.items required');
  return {
    id,
    userId,
    items,
    total,
    status: status || 'pending',
    createdAt: new Date().toISOString(),
    fulfilledAt: null
  };
}
module.exports = { makeOrder };
