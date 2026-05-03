const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { subscribe } = require('../src/billing/subscribe');
const { generateInvoice } = require('../src/billing/invoice');
run('subscribe', () => { clearAll(); const u = signup({ email:'a@b.co', password:'password1' }).user; const r = subscribe({ userId: u.id, planId: 'pro' }); assert.strictEqual(r.ok, true); });
run('invoice', () => { clearAll(); const u = signup({ email:'a@b.co', password:'password1' }).user; const s = subscribe({ userId: u.id, planId: 'pro' }).subscription; const inv = generateInvoice({ subscriptionId: s.id }); assert.ok(inv.amount > 0); });
if (process.exitCode) process.exit(process.exitCode);
