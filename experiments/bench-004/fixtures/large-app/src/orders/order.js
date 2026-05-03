function makeOrder({ id, userId, items, total, status }) {
  if (!id || !userId || !Array.isArray(items) || items.length === 0) throw new Error('invalid order');
  return { id, userId, items, total, status: status||'pending', createdAt: new Date().toISOString(), fulfilledAt: null };
}
module.exports = { makeOrder };
