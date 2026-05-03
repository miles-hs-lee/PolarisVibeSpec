const { uuid } = require('../shared/ids');
const { findById } = require('../users/repository');
const { getCart, clear } = require('./cart');
const { reserve } = require('./inventory');
const { quote } = require('./shipping');
const { makeOrder } = require('./order');
const { save } = require('./repository');
const PRICES = { 'SKU-A': 1000, 'SKU-B': 2500, 'SKU-C': 800 };
function checkout({ userId, shippingMethod }) {
  if (!findById(userId)) return { ok: false, error: 'user_not_found' };
  const cart = getCart(userId);
  if (cart.items.length === 0) return { ok: false, error: 'cart_empty' };
  for (const it of cart.items) {
    if (!reserve(it.sku, it.qty)) return { ok: false, error: `oos_${it.sku}` };
  }
  const goods = cart.items.reduce((sum, it) => sum + (PRICES[it.sku] || 0) * it.qty, 0);
  const ship = quote({ method: shippingMethod || 'standard', weightGrams: 500 * cart.items.length });
  const total = goods + (ship || 0);
  const order = makeOrder({ id: uuid(), userId, items: cart.items, total });
  save(order);
  clear(userId);
  return { ok: true, order };
}
module.exports = { checkout };
