const assert = require('assert');
const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { addItem } = require('../src/orders/cart');
const { checkout } = require('../src/orders/checkout');
const { fulfill } = require('../src/orders/fulfillment');

run('checkout produces an order', () => {
  clearAll();
  const u = signup({ email: 'a@b.co', password: 'password1' }).user;
  addItem({ userId: u.id, sku: 'SKU-A', qty: 2 });
  const co = checkout({ userId: u.id });
  assert.strictEqual(co.ok, true);
  assert.ok(co.order.total > 0);
});

run('fulfill marks order fulfilled', () => {
  clearAll();
  const u = signup({ email: 'a@b.co', password: 'password1' }).user;
  addItem({ userId: u.id, sku: 'SKU-B', qty: 1 });
  const co = checkout({ userId: u.id });
  const f = fulfill({ orderId: co.order.id });
  assert.strictEqual(f.ok, true);
  assert.strictEqual(f.order.status, 'fulfilled');
});

if (process.exitCode) process.exit(process.exitCode);
