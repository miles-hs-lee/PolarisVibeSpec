const { table } = require('../shared/db');
function orders() { return table('orders'); }
function save(order) { orders().set(order.id, order); return order; }
function find(id) { return orders().get(id) || null; }
function listByUser(userId) {
  const out = [];
  for (const o of orders().values()) if (o.userId === userId) out.push(o);
  return out;
}
module.exports = { save, find, listByUser };
