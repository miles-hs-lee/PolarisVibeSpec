#!/bin/bash
# Scaffold the multi-domain fixture for bench-002. Idempotent: run from
# any cwd, creates fixtures/multi-domain/ with all source files, .polaris
# graph + codemap, then initializes git and tags baseline-state.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FIX="$ROOT/fixtures/multi-domain"

rm -rf "$FIX"
mkdir -p "$FIX/src/auth" "$FIX/src/users" "$FIX/src/billing" "$FIX/src/orders" "$FIX/src/shared" "$FIX/test" "$FIX/.polaris"

cd "$FIX"

# ---------- package.json ----------
cat > package.json <<'EOF'
{
  "name": "multi-domain-api",
  "version": "0.1.0",
  "description": "3-domain fixture for the PV benchmark.",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "node test/auth.test.js && node test/billing.test.js && node test/orders.test.js"
  },
  "dependencies": {}
}
EOF

# ---------- .gitignore ----------
cat > .gitignore <<'EOF'
node_modules/
.polaris/counters.json
.polaris/specs/
*.log
EOF

# ===================================================================
# SHARED  (5 files)
# ===================================================================
cat > src/shared/errors.js <<'EOF'
class DomainError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
module.exports = { DomainError };
EOF

cat > src/shared/logger.js <<'EOF'
function log(level, msg, meta) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts, level, msg, ...(meta || {}) }));
}
module.exports = {
  info:  (m, x) => log('info',  m, x),
  warn:  (m, x) => log('warn',  m, x),
  error: (m, x) => log('error', m, x)
};
EOF

cat > src/shared/validation.js <<'EOF'
function isEmail(s) { return typeof s === 'string' && /.+@.+\..+/.test(s); }
function isNonEmptyString(s) { return typeof s === 'string' && s.length > 0; }
function isPositiveInt(n) { return Number.isInteger(n) && n > 0; }
function isISODate(s) { return typeof s === 'string' && !Number.isNaN(Date.parse(s)); }
module.exports = { isEmail, isNonEmptyString, isPositiveInt, isISODate };
EOF

cat > src/shared/ids.js <<'EOF'
const crypto = require('crypto');
function uuid() { return crypto.randomUUID(); }
function shortId(prefix) {
  const r = crypto.randomBytes(6).toString('hex');
  return prefix ? `${prefix}_${r}` : r;
}
module.exports = { uuid, shortId };
EOF

cat > src/shared/db.js <<'EOF'
// Tiny in-memory key/value store. Pretend this is a real DB.
const tables = new Map();
function table(name) {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
}
function clearAll() { tables.clear(); }
module.exports = { table, clearAll };
EOF

# ===================================================================
# AUTH + USERS  (8 files)
# ===================================================================
cat > src/users/user.js <<'EOF'
const { isEmail } = require('../shared/validation');
function makeUser({ id, email, passwordHash, createdAt }) {
  if (!id) throw new Error('user.id is required');
  if (!isEmail(email)) throw new Error('user.email invalid');
  if (!passwordHash) throw new Error('user.passwordHash required');
  return {
    id,
    email: email.toLowerCase(),
    passwordHash,
    createdAt: createdAt || new Date().toISOString()
  };
}
module.exports = { makeUser };
EOF

cat > src/users/repository.js <<'EOF'
const { table } = require('../shared/db');
function users() { return table('users'); }
function findByEmail(email) {
  if (typeof email !== 'string') return null;
  return users().get(email.toLowerCase()) || null;
}
function findById(id) {
  for (const u of users().values()) if (u.id === id) return u;
  return null;
}
function save(user) { users().set(user.email.toLowerCase(), user); return user; }
function update(id, patch) {
  const u = findById(id);
  if (!u) return null;
  const next = { ...u, ...patch };
  users().set(next.email.toLowerCase(), next);
  return next;
}
module.exports = { findByEmail, findById, save, update };
EOF

cat > src/auth/password.js <<'EOF'
const crypto = require('crypto');
function hash(password) {
  if (typeof password !== 'string' || !password.length) throw new Error('bad password');
  const salt = crypto.randomBytes(16).toString('hex');
  const d = crypto.createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${d}`;
}
function verify(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, d] = stored.split(':');
  const c = crypto.createHash('sha256').update(salt + password).digest('hex');
  return c === d;
}
module.exports = { hash, verify };
EOF

cat > src/auth/session.js <<'EOF'
const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
function sessions() { return table('sessions'); }
function create(userId) {
  const token = shortId('sess');
  const session = { token, userId, createdAt: new Date().toISOString() };
  sessions().set(token, session);
  return session;
}
function get(token) { return sessions().get(token) || null; }
function destroy(token) { sessions().delete(token); }
module.exports = { create, get, destroy };
EOF

cat > src/auth/signup.js <<'EOF'
const { uuid } = require('../shared/ids');
const { isEmail } = require('../shared/validation');
const { makeUser } = require('../users/user');
const { findByEmail, save } = require('../users/repository');
const { hash } = require('./password');
function signup({ email, password }) {
  if (!isEmail(email)) return { ok: false, error: 'invalid_email' };
  if (typeof password !== 'string' || password.length < 8) return { ok: false, error: 'weak_password' };
  if (findByEmail(email)) return { ok: false, error: 'email_taken' };
  const user = makeUser({ id: uuid(), email, passwordHash: hash(password) });
  save(user);
  return { ok: true, user };
}
module.exports = { signup };
EOF

cat > src/auth/login.js <<'EOF'
const { findByEmail } = require('../users/repository');
const { verify } = require('./password');
const { create } = require('./session');
function login({ email, password }) {
  if (typeof email !== 'string' || typeof password !== 'string') return { ok: false, error: 'invalid_request' };
  const user = findByEmail(email);
  if (!user) return { ok: false, error: 'invalid_credentials' };
  if (!verify(password, user.passwordHash)) return { ok: false, error: 'invalid_credentials' };
  const session = create(user.id);
  return { ok: true, token: session.token, user };
}
module.exports = { login };
EOF

cat > src/auth/logout.js <<'EOF'
const { destroy } = require('./session');
function logout({ token }) {
  if (!token) return { ok: false, error: 'invalid_request' };
  destroy(token);
  return { ok: true };
}
module.exports = { logout };
EOF

cat > src/auth/middleware.js <<'EOF'
const { get } = require('./session');
const { findById } = require('../users/repository');
function requireAuth(req) {
  const auth = req.headers && req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const session = get(token);
  if (!session) return null;
  return findById(session.userId);
}
module.exports = { requireAuth };
EOF

# ===================================================================
# BILLING  (9 files)
# ===================================================================
cat > src/billing/plans.js <<'EOF'
const PLANS = {
  free:    { id: 'free',    monthly: 0,    name: 'Free' },
  pro:     { id: 'pro',     monthly: 1900, name: 'Pro' },
  premium: { id: 'premium', monthly: 4900, name: 'Premium' }
};
function getPlan(id) { return PLANS[id] || null; }
function listPlans() { return Object.values(PLANS); }
module.exports = { getPlan, listPlans };
EOF

cat > src/billing/subscription.js <<'EOF'
const { getPlan } = require('./plans');
function makeSubscription({ id, userId, planId, startedAt, status }) {
  if (!id) throw new Error('subscription.id required');
  if (!userId) throw new Error('subscription.userId required');
  const plan = getPlan(planId);
  if (!plan) throw new Error(`unknown plan: ${planId}`);
  return {
    id,
    userId,
    planId,
    status: status || 'active',
    startedAt: startedAt || new Date().toISOString(),
    cancelledAt: null
  };
}
module.exports = { makeSubscription };
EOF

cat > src/billing/repository.js <<'EOF'
const { table } = require('../shared/db');
function subs() { return table('subscriptions'); }
function invoices() { return table('invoices'); }
function saveSubscription(s) { subs().set(s.id, s); return s; }
function findSubscription(id) { return subs().get(id) || null; }
function findSubscriptionsByUser(userId) {
  const out = [];
  for (const s of subs().values()) if (s.userId === userId) out.push(s);
  return out;
}
function saveInvoice(i) { invoices().set(i.id, i); return i; }
function findInvoice(id) { return invoices().get(id) || null; }
function listInvoicesByUser(userId) {
  const out = [];
  for (const i of invoices().values()) if (i.userId === userId) out.push(i);
  return out;
}
module.exports = { saveSubscription, findSubscription, findSubscriptionsByUser, saveInvoice, findInvoice, listInvoicesByUser };
EOF

cat > src/billing/invoice.js <<'EOF'
const { uuid } = require('../shared/ids');
const { getPlan } = require('./plans');
const { findSubscription, saveInvoice } = require('./repository');
function generateInvoice({ subscriptionId, periodStart, periodEnd }) {
  const sub = findSubscription(subscriptionId);
  if (!sub) throw new Error('subscription not found');
  const plan = getPlan(sub.planId);
  const invoice = {
    id: uuid(),
    userId: sub.userId,
    subscriptionId: sub.id,
    amount: plan.monthly,
    periodStart: periodStart || new Date().toISOString(),
    periodEnd: periodEnd || new Date().toISOString(),
    issuedAt: new Date().toISOString(),
    paid: false
  };
  saveInvoice(invoice);
  return invoice;
}
module.exports = { generateInvoice };
EOF

cat > src/billing/subscribe.js <<'EOF'
const { uuid } = require('../shared/ids');
const { findById } = require('../users/repository');
const { getPlan } = require('./plans');
const { makeSubscription } = require('./subscription');
const { saveSubscription } = require('./repository');
function subscribe({ userId, planId }) {
  if (!findById(userId)) return { ok: false, error: 'user_not_found' };
  if (!getPlan(planId)) return { ok: false, error: 'unknown_plan' };
  const sub = makeSubscription({ id: uuid(), userId, planId });
  saveSubscription(sub);
  return { ok: true, subscription: sub };
}
module.exports = { subscribe };
EOF

cat > src/billing/payment.js <<'EOF'
const { findInvoice, saveInvoice } = require('./repository');
function chargeInvoice({ invoiceId, paymentMethod }) {
  const invoice = findInvoice(invoiceId);
  if (!invoice) return { ok: false, error: 'invoice_not_found' };
  if (invoice.paid) return { ok: false, error: 'already_paid' };
  if (!paymentMethod) return { ok: false, error: 'missing_payment_method' };
  const updated = { ...invoice, paid: true, paidAt: new Date().toISOString() };
  saveInvoice(updated);
  return { ok: true, invoice: updated };
}
module.exports = { chargeInvoice };
EOF

cat > src/billing/refund.js <<'EOF'
const { findInvoice, saveInvoice } = require('./repository');
function refundInvoice({ invoiceId, reason }) {
  const invoice = findInvoice(invoiceId);
  if (!invoice) return { ok: false, error: 'invoice_not_found' };
  if (!invoice.paid) return { ok: false, error: 'not_paid' };
  if (invoice.refundedAt) return { ok: false, error: 'already_refunded' };
  const updated = { ...invoice, refundedAt: new Date().toISOString(), refundReason: reason || null };
  saveInvoice(updated);
  return { ok: true, invoice: updated };
}
module.exports = { refundInvoice };
EOF

cat > src/billing/usage.js <<'EOF'
const { table } = require('../shared/db');
function usage() { return table('usage'); }
function record({ userId, metric, value }) {
  const key = `${userId}:${metric}`;
  const cur = usage().get(key) || 0;
  usage().set(key, cur + value);
  return { userId, metric, total: cur + value };
}
function get({ userId, metric }) {
  return usage().get(`${userId}:${metric}`) || 0;
}
module.exports = { record, get };
EOF

cat > src/billing/charge.js <<'EOF'
const { listInvoicesByUser } = require('./repository');
const { chargeInvoice } = require('./payment');
function chargeAllOpen({ userId, paymentMethod }) {
  const open = listInvoicesByUser(userId).filter((i) => !i.paid);
  const results = [];
  for (const inv of open) {
    results.push(chargeInvoice({ invoiceId: inv.id, paymentMethod }));
  }
  return { ok: true, results };
}
module.exports = { chargeAllOpen };
EOF

# ===================================================================
# ORDERS  (8 files)
# ===================================================================
cat > src/orders/cart.js <<'EOF'
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
EOF

cat > src/orders/inventory.js <<'EOF'
const STOCK = { 'SKU-A': 50, 'SKU-B': 20, 'SKU-C': 0 };
function inStock(sku, qty) {
  const have = STOCK[sku];
  if (have == null) return false;
  return have >= qty;
}
function reserve(sku, qty) {
  if (!inStock(sku, qty)) return false;
  STOCK[sku] -= qty;
  return true;
}
module.exports = { inStock, reserve };
EOF

cat > src/orders/shipping.js <<'EOF'
const RATES = { standard: 500, express: 1500 };
function quote({ method, weightGrams }) {
  const base = RATES[method];
  if (base == null) return null;
  const surcharge = Math.floor((weightGrams || 0) / 1000) * 100;
  return base + surcharge;
}
module.exports = { quote };
EOF

cat > src/orders/order.js <<'EOF'
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
EOF

cat > src/orders/repository.js <<'EOF'
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
EOF

cat > src/orders/checkout.js <<'EOF'
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
EOF

cat > src/orders/fulfillment.js <<'EOF'
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
EOF

cat > src/orders/notify.js <<'EOF'
const { info } = require('../shared/logger');
function notifyOrderPlaced({ order }) {
  info('order_placed', { orderId: order.id, userId: order.userId, total: order.total });
}
function notifyOrderFulfilled({ order }) {
  info('order_fulfilled', { orderId: order.id, userId: order.userId });
}
module.exports = { notifyOrderPlaced, notifyOrderFulfilled };
EOF

# ===================================================================
# TOP LEVEL  (3 files)
# ===================================================================
cat > src/router.js <<'EOF'
const { signup } = require('./auth/signup');
const { login } = require('./auth/login');
const { logout } = require('./auth/logout');
const { subscribe } = require('./billing/subscribe');
const { chargeAllOpen } = require('./billing/charge');
const { refundInvoice } = require('./billing/refund');
const { addItem } = require('./orders/cart');
const { checkout } = require('./orders/checkout');
const { fulfill } = require('./orders/fulfillment');
const ROUTES = {
  'POST /auth/signup':       (b) => signup(b),
  'POST /auth/login':        (b) => login(b),
  'POST /auth/logout':       (b) => logout(b),
  'POST /billing/subscribe': (b) => subscribe(b),
  'POST /billing/charge':    (b) => chargeAllOpen(b),
  'POST /billing/refund':    (b) => refundInvoice(b),
  'POST /orders/cart/add':   (b) => addItem(b),
  'POST /orders/checkout':   (b) => checkout(b),
  'POST /orders/fulfill':    (b) => fulfill(b)
};
function dispatch(method, path, body) {
  const fn = ROUTES[`${method} ${path}`];
  if (!fn) return { status: 404, body: { error: 'not_found' } };
  const result = fn(body || {});
  return { status: result.ok ? 200 : 400, body: result };
}
module.exports = { dispatch };
EOF

cat > src/server.js <<'EOF'
const http = require('http');
const { dispatch } = require('./router');
function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function createServer() {
  return http.createServer(async (req, res) => {
    let body = {};
    if (req.method === 'POST') {
      try { body = await readJson(req); } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'invalid_json' }));
      }
    }
    const { status, body: out } = dispatch(req.method, req.url, body);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
}
module.exports = { createServer };
EOF

cat > src/index.js <<'EOF'
const { createServer } = require('./server');
const port = parseInt(process.env.PORT || '3000', 10);
createServer().listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`multi-domain-api listening on :${port}`);
});
EOF

# ===================================================================
# TESTS  (3 files)
# ===================================================================
cat > test/_runner.js <<'EOF'
function run(name, fn) {
  try { fn(); console.log(`ok  - ${name}`); }
  catch (e) { console.error(`fail - ${name}: ${e.message}`); process.exitCode = 1; }
}
module.exports = { run };
EOF

cat > test/auth.test.js <<'EOF'
const assert = require('assert');
const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { login } = require('../src/auth/login');
const { logout } = require('../src/auth/logout');

run('signup creates a user', () => {
  clearAll();
  const r = signup({ email: 'a@b.co', password: 'password1' });
  assert.strictEqual(r.ok, true);
  assert.ok(r.user.id);
});

run('login + logout happy path', () => {
  clearAll();
  signup({ email: 'a@b.co', password: 'password1' });
  const lr = login({ email: 'a@b.co', password: 'password1' });
  assert.strictEqual(lr.ok, true);
  assert.ok(lr.token);
  const out = logout({ token: lr.token });
  assert.strictEqual(out.ok, true);
});

run('login fails on bad password', () => {
  clearAll();
  signup({ email: 'a@b.co', password: 'password1' });
  const lr = login({ email: 'a@b.co', password: 'WRONG' });
  assert.strictEqual(lr.ok, false);
});

if (process.exitCode) process.exit(process.exitCode);
EOF

cat > test/billing.test.js <<'EOF'
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
EOF

cat > test/orders.test.js <<'EOF'
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
EOF

# ===================================================================
# .polaris/graph.json + codemap.json
# ===================================================================
cat > .polaris/graph.json <<'EOF'
{
  "version": 1,
  "nodes": {
    "REQ-AUTH-001":  {"id":"REQ-AUTH-001","type":"requirement","domain":"AUTH","title":"User signup with email + password","description":"New users register by submitting email and password.","tags":["auth","signup"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "REQ-AUTH-002":  {"id":"REQ-AUTH-002","type":"requirement","domain":"AUTH","title":"User login with credentials","description":"Registered users authenticate; on success they receive a session token.","tags":["auth","login"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "REQ-AUTH-003":  {"id":"REQ-AUTH-003","type":"requirement","domain":"AUTH","title":"Session-backed authentication","description":"Authenticated requests are identified via session token (Bearer header).","tags":["auth","session"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-AUTH-USER": {"id":"ENT-AUTH-USER","type":"entity","domain":"AUTH","title":"User record","description":"User entity: id, email, passwordHash, createdAt.","tags":["auth","user"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-AUTH-SESSION":{"id":"ENT-AUTH-SESSION","type":"entity","domain":"AUTH","title":"Session record","description":"Session entity: token, userId, createdAt.","tags":["auth","session"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-AUTH-SIGNUP":{"id":"API-AUTH-SIGNUP","type":"api","domain":"AUTH","title":"POST /auth/signup","description":"Create a new user record.","tags":["auth","signup","api"],"relations":[{"type":"implements","target":"REQ-AUTH-001"},{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-AUTH-LOGIN":{"id":"API-AUTH-LOGIN","type":"api","domain":"AUTH","title":"POST /auth/login","description":"Verify credentials, issue session token.","tags":["auth","login","api"],"relations":[{"type":"implements","target":"REQ-AUTH-002"},{"type":"uses","target":"ENT-AUTH-USER"},{"type":"uses","target":"ENT-AUTH-SESSION"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-AUTH-LOGOUT":{"id":"API-AUTH-LOGOUT","type":"api","domain":"AUTH","title":"POST /auth/logout","description":"Destroy the session.","tags":["auth","logout","api"],"relations":[{"type":"uses","target":"ENT-AUTH-SESSION"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "WF-AUTH-LOGIN": {"id":"WF-AUTH-LOGIN","type":"workflow","domain":"AUTH","title":"Login flow","description":"Lookup → verify hash → issue token.","tags":["auth","login","flow"],"relations":[{"type":"uses","target":"API-AUTH-LOGIN"},{"type":"uses","target":"ENT-AUTH-USER"},{"type":"uses","target":"ENT-AUTH-SESSION"}],"createdAt":"2026-05-03T00:00:00.000Z"},

    "REQ-BILLING-001":{"id":"REQ-BILLING-001","type":"requirement","domain":"BILLING","title":"Users can subscribe to a paid plan","description":"Authenticated users can subscribe to a billing plan.","tags":["billing","subscription"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "REQ-BILLING-002":{"id":"REQ-BILLING-002","type":"requirement","domain":"BILLING","title":"Open invoices can be charged","description":"The system can charge a user's open invoices.","tags":["billing","payment"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "REQ-BILLING-003":{"id":"REQ-BILLING-003","type":"requirement","domain":"BILLING","title":"Paid invoices can be refunded","description":"Paid invoices may be refunded with a reason.","tags":["billing","refund"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-BILLING-SUBSCRIPTION":{"id":"ENT-BILLING-SUBSCRIPTION","type":"entity","domain":"BILLING","title":"Subscription record","description":"Subscription entity: id, userId, planId, status, startedAt, cancelledAt.","tags":["billing","subscription"],"relations":[{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-BILLING-INVOICE":{"id":"ENT-BILLING-INVOICE","type":"entity","domain":"BILLING","title":"Invoice record","description":"Invoice entity: id, userId, subscriptionId, amount, periodStart, periodEnd, issuedAt, paid, paidAt, refundedAt.","tags":["billing","invoice"],"relations":[{"type":"uses","target":"ENT-BILLING-SUBSCRIPTION"},{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-BILLING-SUBSCRIBE":{"id":"API-BILLING-SUBSCRIBE","type":"api","domain":"BILLING","title":"POST /billing/subscribe","description":"Create a subscription for a user.","tags":["billing","api"],"relations":[{"type":"implements","target":"REQ-BILLING-001"},{"type":"uses","target":"ENT-BILLING-SUBSCRIPTION"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-BILLING-CHARGE":{"id":"API-BILLING-CHARGE","type":"api","domain":"BILLING","title":"POST /billing/charge","description":"Charge all open invoices for a user.","tags":["billing","api","payment"],"relations":[{"type":"implements","target":"REQ-BILLING-002"},{"type":"uses","target":"ENT-BILLING-INVOICE"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-BILLING-REFUND":{"id":"API-BILLING-REFUND","type":"api","domain":"BILLING","title":"POST /billing/refund","description":"Refund a paid invoice.","tags":["billing","api","refund"],"relations":[{"type":"implements","target":"REQ-BILLING-003"},{"type":"uses","target":"ENT-BILLING-INVOICE"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "WF-BILLING-INVOICE":{"id":"WF-BILLING-INVOICE","type":"workflow","domain":"BILLING","title":"Invoice generation flow","description":"Lookup subscription → resolve plan price → create invoice.","tags":["billing","invoice","flow"],"relations":[{"type":"uses","target":"ENT-BILLING-SUBSCRIPTION"},{"type":"uses","target":"ENT-BILLING-INVOICE"}],"createdAt":"2026-05-03T00:00:00.000Z"},

    "REQ-ORDER-001":{"id":"REQ-ORDER-001","type":"requirement","domain":"ORDER","title":"Users can place an order through cart checkout","description":"Authenticated users add items to a cart and check out into an Order.","tags":["order","checkout"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "REQ-ORDER-002":{"id":"REQ-ORDER-002","type":"requirement","domain":"ORDER","title":"Orders can be fulfilled","description":"A pending order transitions to fulfilled.","tags":["order","fulfillment"],"relations":[],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-ORDER-CART":{"id":"ENT-ORDER-CART","type":"entity","domain":"ORDER","title":"Cart record","description":"Per-user cart with items.","tags":["order","cart"],"relations":[{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "ENT-ORDER-ORDER":{"id":"ENT-ORDER-ORDER","type":"entity","domain":"ORDER","title":"Order record","description":"Order entity: id, userId, items, total, status, createdAt, fulfilledAt.","tags":["order"],"relations":[{"type":"uses","target":"ENT-AUTH-USER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-ORDER-CART-ADD":{"id":"API-ORDER-CART-ADD","type":"api","domain":"ORDER","title":"POST /orders/cart/add","description":"Add an item to the cart.","tags":["order","cart","api"],"relations":[{"type":"uses","target":"ENT-ORDER-CART"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-ORDER-CHECKOUT":{"id":"API-ORDER-CHECKOUT","type":"api","domain":"ORDER","title":"POST /orders/checkout","description":"Convert cart to a placed order.","tags":["order","checkout","api"],"relations":[{"type":"implements","target":"REQ-ORDER-001"},{"type":"uses","target":"ENT-ORDER-CART"},{"type":"uses","target":"ENT-ORDER-ORDER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "API-ORDER-FULFILL":{"id":"API-ORDER-FULFILL","type":"api","domain":"ORDER","title":"POST /orders/fulfill","description":"Mark a pending order as fulfilled.","tags":["order","fulfillment","api"],"relations":[{"type":"implements","target":"REQ-ORDER-002"},{"type":"uses","target":"ENT-ORDER-ORDER"}],"createdAt":"2026-05-03T00:00:00.000Z"},
    "WF-ORDER-CHECKOUT":{"id":"WF-ORDER-CHECKOUT","type":"workflow","domain":"ORDER","title":"Checkout flow","description":"Validate user → reserve inventory → quote shipping → create order → clear cart.","tags":["order","checkout","flow"],"relations":[{"type":"uses","target":"API-ORDER-CHECKOUT"},{"type":"uses","target":"ENT-ORDER-CART"},{"type":"uses","target":"ENT-ORDER-ORDER"}],"createdAt":"2026-05-03T00:00:00.000Z"}
  }
}
EOF

cat > .polaris/codemap.json <<'EOF'
{
  "ENT-AUTH-USER": ["src/users/user.js", "src/users/repository.js"],
  "ENT-AUTH-SESSION": ["src/auth/session.js"],
  "API-AUTH-SIGNUP": ["src/auth/signup.js", "src/router.js"],
  "API-AUTH-LOGIN": ["src/auth/login.js", "src/router.js"],
  "API-AUTH-LOGOUT": ["src/auth/logout.js", "src/router.js"],
  "WF-AUTH-LOGIN": ["src/auth/login.js", "src/auth/password.js", "src/auth/session.js"],

  "ENT-BILLING-SUBSCRIPTION": ["src/billing/subscription.js", "src/billing/repository.js", "src/billing/plans.js"],
  "ENT-BILLING-INVOICE": ["src/billing/invoice.js", "src/billing/repository.js"],
  "API-BILLING-SUBSCRIBE": ["src/billing/subscribe.js", "src/router.js"],
  "API-BILLING-CHARGE": ["src/billing/charge.js", "src/billing/payment.js", "src/router.js"],
  "API-BILLING-REFUND": ["src/billing/refund.js", "src/router.js"],
  "WF-BILLING-INVOICE": ["src/billing/invoice.js", "src/billing/repository.js", "src/billing/plans.js"],

  "ENT-ORDER-CART": ["src/orders/cart.js"],
  "ENT-ORDER-ORDER": ["src/orders/order.js", "src/orders/repository.js"],
  "API-ORDER-CART-ADD": ["src/orders/cart.js", "src/router.js"],
  "API-ORDER-CHECKOUT": ["src/orders/checkout.js", "src/orders/inventory.js", "src/orders/shipping.js", "src/router.js"],
  "API-ORDER-FULFILL": ["src/orders/fulfillment.js", "src/router.js"],
  "WF-ORDER-CHECKOUT": ["src/orders/checkout.js", "src/orders/cart.js", "src/orders/inventory.js", "src/orders/shipping.js"]
}
EOF

# ---------- git baseline ----------
git init -b main >/dev/null 2>&1
git add . >/dev/null
git -c user.email=bench@local -c user.name=bench commit -q -m "fixture: multi-domain baseline"
git tag baseline-state

# Sanity checks.
echo "=== file count ==="
find src test -type f | wc -l
echo "=== tests ==="
node test/auth.test.js && node test/billing.test.js && node test/orders.test.js
echo "=== pv validate ==="
node /Users/cnt-22-70004/Documents/PolarisVibeSpec/dist/cli.js validate --pretty | tail -10
echo "=== pv impact ENT-BILLING-SUBSCRIPTION ==="
node /Users/cnt-22-70004/Documents/PolarisVibeSpec/dist/cli.js impact ENT-BILLING-SUBSCRIPTION --pretty | tail -25
