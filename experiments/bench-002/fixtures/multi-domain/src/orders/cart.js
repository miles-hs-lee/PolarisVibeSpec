const { table } = require('../shared/db');
function carts() { return table('carts'); }
function getCart(userId) {
  if (!carts().has(userId)) carts().set(userId, { userId, items: [] });
  return carts().get(userId);
}
function addItem({ userId, sku, qty }) {
  const c = getCart(userId);
  c.items.push({ sku, qty });
  return c;
}
function clear(userId) { carts().delete(userId); }
module.exports = { getCart, addItem, clear };
