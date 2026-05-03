const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { addItem } = require('../src/orders/cart');
const { checkout } = require('../src/orders/checkout');
run('checkout', () => { clearAll(); const u = signup({ email:'a@b.co', password:'password1' }).user; addItem({ userId: u.id, sku:'SKU-A', qty:2 }); const r = checkout({ userId: u.id }); assert.strictEqual(r.ok, true); });
if (process.exitCode) process.exit(process.exitCode);
