const assert = require('assert');
const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { subscribe } = require('../src/billing/subscribe');
const { generateInvoice } = require('../src/billing/invoice');
const { chargeInvoice } = require('../src/billing/payment');
const { refundInvoice } = require('../src/billing/refund');

run('subscribe creates a subscription', () => {
  clearAll();
  const u = signup({ email: 'a@b.co', password: 'password1' }).user;
  const s = subscribe({ userId: u.id, planId: 'pro' });
  assert.strictEqual(s.ok, true);
  assert.strictEqual(s.subscription.planId, 'pro');
});

run('invoice generation + charge + refund', () => {
  clearAll();
  const u = signup({ email: 'a@b.co', password: 'password1' }).user;
  const s = subscribe({ userId: u.id, planId: 'pro' }).subscription;
  const inv = generateInvoice({ subscriptionId: s.id });
  assert.ok(inv.amount > 0);
  const charged = chargeInvoice({ invoiceId: inv.id, paymentMethod: 'card' });
  assert.strictEqual(charged.ok, true);
  const refunded = refundInvoice({ invoiceId: inv.id, reason: 'duplicate' });
  assert.strictEqual(refunded.ok, true);
});

if (process.exitCode) process.exit(process.exitCode);
