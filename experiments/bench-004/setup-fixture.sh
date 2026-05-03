#!/bin/bash
# Scaffold the large-app fixture for bench-004 (~100 files, 6 domains).
# Goal: size threshold where blind `find` becomes too noisy and the agent
# might actually invoke pv tools rather than rely on intuition.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FIX="$ROOT/fixtures/large-app"

rm -rf "$FIX"
mkdir -p "$FIX/src"/{auth,users,billing,orders,notif,analytics,shared} \
         "$FIX/test" "$FIX/.polaris"
cd "$FIX"

# ---------- package.json + .gitignore ----------
cat > package.json <<'EOF'
{
  "name": "large-app",
  "version": "0.1.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "node test/auth.test.js && node test/billing.test.js && node test/orders.test.js"
  }
}
EOF
cat > .gitignore <<'EOF'
node_modules/
.polaris/counters.json
.polaris/specs/
.polaris/usage.jsonl
*.log
EOF

# ---------- shared (6 files) ----------
cat > src/shared/errors.js <<'EOF'
class DomainError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
module.exports = { DomainError };
EOF
cat > src/shared/logger.js <<'EOF'
function log(level, msg, meta) { console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })); }
module.exports = { info: (m,x)=>log('info',m,x), warn: (m,x)=>log('warn',m,x), error: (m,x)=>log('error',m,x) };
EOF
cat > src/shared/validation.js <<'EOF'
const isEmail = s => typeof s === 'string' && /.+@.+\..+/.test(s);
const isNonEmpty = s => typeof s === 'string' && s.length > 0;
const isCurrency = s => typeof s === 'string' && /^[A-Z]{3}$/.test(s);
module.exports = { isEmail, isNonEmpty, isCurrency };
EOF
cat > src/shared/ids.js <<'EOF'
const crypto = require('crypto');
function uuid() { return crypto.randomUUID(); }
function shortId(p) { return (p?p+'_':'') + crypto.randomBytes(6).toString('hex'); }
module.exports = { uuid, shortId };
EOF
cat > src/shared/db.js <<'EOF'
const tables = new Map();
function table(n) { if (!tables.has(n)) tables.set(n, new Map()); return tables.get(n); }
function clearAll() { tables.clear(); }
module.exports = { table, clearAll };
EOF
cat > src/shared/config.js <<'EOF'
module.exports = {
  defaultCurrency: 'USD',
  sessionTtlMinutes: 60,
  maxLoginAttempts: 5,
  notificationRetryMax: 3
};
EOF

# ---------- AUTH (14 files) ----------
cat > src/auth/password.js <<'EOF'
const crypto = require('crypto');
exports.hash = pwd => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.createHash('sha256').update(s+pwd).digest('hex'); };
exports.verify = (pwd, stored) => { if (!stored||!stored.includes(':')) return false; const [s,d] = stored.split(':'); return crypto.createHash('sha256').update(s+pwd).digest('hex') === d; };
EOF
cat > src/auth/session.js <<'EOF'
const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
exports.create = userId => { const t = shortId('sess'); table('sessions').set(t, { token: t, userId, createdAt: new Date().toISOString() }); return t; };
exports.get = t => table('sessions').get(t) || null;
exports.destroy = t => table('sessions').delete(t);
EOF
cat > src/auth/signup.js <<'EOF'
const { uuid } = require('../shared/ids');
const { isEmail } = require('../shared/validation');
const { findByEmail, save } = require('../users/repository');
const { hash } = require('./password');
function signup({ email, password }) {
  if (!isEmail(email)) return { ok: false, error: 'invalid_email' };
  if (typeof password !== 'string' || password.length < 8) return { ok: false, error: 'weak_password' };
  if (findByEmail(email)) return { ok: false, error: 'email_taken' };
  const user = { id: uuid(), email: email.toLowerCase(), passwordHash: hash(password), createdAt: new Date().toISOString() };
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
  const user = findByEmail(email);
  if (!user || !verify(password, user.passwordHash)) return { ok: false, error: 'invalid_credentials' };
  return { ok: true, token: create(user.id), user };
}
module.exports = { login };
EOF
cat > src/auth/logout.js <<'EOF'
const { destroy } = require('./session');
exports.logout = ({ token }) => { if (!token) return { ok: false, error: 'invalid' }; destroy(token); return { ok: true }; };
EOF
cat > src/auth/refresh.js <<'EOF'
const { get, create } = require('./session');
exports.refresh = ({ token }) => { const s = get(token); if (!s) return { ok: false, error: 'invalid_session' }; return { ok: true, token: create(s.userId) }; };
EOF
cat > src/auth/reset.js <<'EOF'
const { findByEmail, update } = require('../users/repository');
const { hash } = require('./password');
exports.resetPassword = ({ email, newPassword }) => {
  const u = findByEmail(email);
  if (!u) return { ok: false, error: 'not_found' };
  update(u.id, { passwordHash: hash(newPassword) });
  return { ok: true };
};
EOF
cat > src/auth/verify.js <<'EOF'
const { table } = require('../shared/db');
const { findByEmail, update } = require('../users/repository');
exports.requestVerify = ({ email }) => { const u = findByEmail(email); if (!u) return { ok: false }; const tok = require('../shared/ids').shortId('vrf'); table('verify').set(tok, u.id); return { ok: true, token: tok }; };
exports.confirmVerify = ({ token }) => { const id = table('verify').get(token); if (!id) return { ok: false }; update(id, { verified: true }); table('verify').delete(token); return { ok: true }; };
EOF
cat > src/auth/mfa.js <<'EOF'
const { findById, update } = require('../users/repository');
exports.enableMfa = ({ userId, secret }) => { const u = findById(userId); if (!u) return { ok: false }; update(userId, { mfaSecret: secret, mfaEnabled: true }); return { ok: true }; };
exports.disableMfa = ({ userId }) => { update(userId, { mfaSecret: null, mfaEnabled: false }); return { ok: true }; };
exports.verifyMfa = ({ userId, code }) => { const u = findById(userId); if (!u || !u.mfaEnabled) return { ok: false }; return { ok: code === '000000' }; };
EOF
cat > src/auth/recover.js <<'EOF'
const { findByEmail } = require('../users/repository');
exports.startRecovery = ({ email }) => { const u = findByEmail(email); if (!u) return { ok: false }; return { ok: true, token: require('../shared/ids').shortId('rcv') }; };
EOF
cat > src/auth/magic-link.js <<'EOF'
const { table } = require('../shared/db');
const { findByEmail } = require('../users/repository');
const { create } = require('./session');
const { shortId } = require('../shared/ids');
exports.sendMagic = ({ email }) => { const u = findByEmail(email); if (!u) return { ok: false }; const t = shortId('mgc'); table('magic').set(t, u.id); return { ok: true, token: t }; };
exports.consumeMagic = ({ token }) => { const id = table('magic').get(token); if (!id) return { ok: false }; table('magic').delete(token); return { ok: true, sessionToken: create(id) }; };
EOF
cat > src/auth/oauth.js <<'EOF'
const { findByEmail, save } = require('../users/repository');
const { uuid } = require('../shared/ids');
const { create } = require('./session');
exports.oauthLogin = ({ provider, email }) => {
  let u = findByEmail(email);
  if (!u) { u = { id: uuid(), email, passwordHash: 'oauth:'+provider, createdAt: new Date().toISOString() }; save(u); }
  return { ok: true, token: create(u.id), user: u };
};
EOF
cat > src/auth/middleware.js <<'EOF'
const { get } = require('./session');
const { findById } = require('../users/repository');
exports.requireAuth = req => {
  const a = req.headers && req.headers.authorization;
  if (!a || !a.startsWith('Bearer ')) return null;
  const s = get(a.slice(7));
  return s ? findById(s.userId) : null;
};
EOF
cat > src/auth/repository.js <<'EOF'
const { table } = require('../shared/db');
exports.findToken = t => table('sessions').get(t) || null;
exports.listSessions = uid => Array.from(table('sessions').values()).filter(s => s.userId === uid);
EOF

# ---------- USERS (12 files) ----------
cat > src/users/user.js <<'EOF'
const { isEmail } = require('../shared/validation');
function makeUser({ id, email, passwordHash, createdAt, currency }) {
  if (!id || !isEmail(email) || !passwordHash) throw new Error('invalid user');
  return { id, email: email.toLowerCase(), passwordHash, createdAt: createdAt || new Date().toISOString(), currency: currency || null };
}
module.exports = { makeUser };
EOF
cat > src/users/repository.js <<'EOF'
const { table } = require('../shared/db');
function users() { return table('users'); }
exports.findByEmail = e => typeof e === 'string' ? users().get(e.toLowerCase()) || null : null;
exports.findById = id => { for (const u of users().values()) if (u.id === id) return u; return null; };
exports.save = u => { users().set(u.email.toLowerCase(), u); return u; };
exports.update = (id, patch) => { const u = exports.findById(id); if (!u) return null; const next = { ...u, ...patch }; users().set(next.email.toLowerCase(), next); return next; };
exports.list = () => Array.from(users().values());
EOF
cat > src/users/profile.js <<'EOF'
const { findById, update } = require('./repository');
exports.getProfile = ({ userId }) => { const u = findById(userId); return u ? { ok: true, profile: { id: u.id, email: u.email, name: u.name || null } } : { ok: false }; };
exports.updateProfile = ({ userId, patch }) => { const u = update(userId, patch || {}); return u ? { ok: true, profile: u } : { ok: false }; };
EOF
cat > src/users/settings.js <<'EOF'
const { update, findById } = require('./repository');
exports.getSettings = ({ userId }) => { const u = findById(userId); return u ? { ok: true, settings: u.settings || {} } : { ok: false }; };
exports.updateSettings = ({ userId, settings }) => { const u = update(userId, { settings }); return u ? { ok: true } : { ok: false }; };
EOF
cat > src/users/preferences.js <<'EOF'
const { update, findById } = require('./repository');
exports.setPreference = ({ userId, key, value }) => { const u = findById(userId); if (!u) return { ok: false }; const prefs = { ...(u.preferences||{}), [key]: value }; update(userId, { preferences: prefs }); return { ok: true }; };
EOF
cat > src/users/search.js <<'EOF'
const { list } = require('./repository');
exports.search = ({ query }) => { const q = (query||'').toLowerCase(); return { ok: true, results: list().filter(u => u.email.includes(q)) }; };
EOF
cat > src/users/list.js <<'EOF'
const { list } = require('./repository');
exports.listAll = ({ limit, offset }) => { const all = list(); return { ok: true, total: all.length, items: all.slice(offset||0, (offset||0)+(limit||50)) }; };
EOF
cat > src/users/export.js <<'EOF'
const { list } = require('./repository');
exports.exportUsers = () => ({ ok: true, csv: list().map(u => `${u.id},${u.email}`).join('\n') });
EOF
cat > src/users/delete.js <<'EOF'
const { table } = require('../shared/db');
const { findById } = require('./repository');
exports.deleteUser = ({ userId }) => { const u = findById(userId); if (!u) return { ok: false }; table('users').delete(u.email.toLowerCase()); return { ok: true }; };
EOF
cat > src/users/suspend.js <<'EOF'
const { update } = require('./repository');
exports.suspend = ({ userId, reason }) => { const u = update(userId, { suspended: true, suspendedReason: reason||null }); return u ? { ok: true } : { ok: false }; };
exports.unsuspend = ({ userId }) => { const u = update(userId, { suspended: false, suspendedReason: null }); return u ? { ok: true } : { ok: false }; };
EOF
cat > src/users/audit.js <<'EOF'
const { table } = require('../shared/db');
exports.logEvent = ({ userId, action, meta }) => { table('audit').set(require('../shared/ids').shortId('a'), { userId, action, meta, ts: new Date().toISOString() }); };
exports.getAudit = ({ userId }) => Array.from(table('audit').values()).filter(e => e.userId === userId);
EOF

# ---------- BILLING (14 files) ----------
cat > src/billing/plans.js <<'EOF'
const PLANS = { free: { id:'free', monthly:0, name:'Free' }, pro: { id:'pro', monthly:1900, name:'Pro' }, premium: { id:'premium', monthly:4900, name:'Premium' }, enterprise: { id:'enterprise', monthly:19900, name:'Enterprise' } };
exports.getPlan = id => PLANS[id] || null;
exports.listPlans = () => Object.values(PLANS);
EOF
cat > src/billing/subscription.js <<'EOF'
const { getPlan } = require('./plans');
function makeSubscription({ id, userId, planId, status, startedAt }) {
  if (!id || !userId) throw new Error('invalid subscription');
  if (!getPlan(planId)) throw new Error('unknown plan');
  return { id, userId, planId, status: status||'active', startedAt: startedAt||new Date().toISOString(), cancelledAt: null };
}
module.exports = { makeSubscription };
EOF
cat > src/billing/repository.js <<'EOF'
const { table } = require('../shared/db');
const subs = () => table('subscriptions');
const invs = () => table('invoices');
exports.saveSubscription = s => { subs().set(s.id, s); return s; };
exports.findSubscription = id => subs().get(id) || null;
exports.findSubscriptionsByUser = uid => Array.from(subs().values()).filter(s => s.userId === uid);
exports.saveInvoice = i => { invs().set(i.id, i); return i; };
exports.findInvoice = id => invs().get(id) || null;
exports.listInvoicesByUser = uid => Array.from(invs().values()).filter(i => i.userId === uid);
EOF
cat > src/billing/invoice.js <<'EOF'
const { uuid } = require('../shared/ids');
const { getPlan } = require('./plans');
const { findSubscription, saveInvoice } = require('./repository');
function generateInvoice({ subscriptionId }) {
  const s = findSubscription(subscriptionId);
  if (!s) throw new Error('subscription not found');
  const plan = getPlan(s.planId);
  const inv = { id: uuid(), userId: s.userId, subscriptionId: s.id, amount: plan.monthly, issuedAt: new Date().toISOString(), paid: false };
  saveInvoice(inv);
  return inv;
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
cat > src/billing/unsubscribe.js <<'EOF'
const { findSubscription, saveSubscription } = require('./repository');
exports.unsubscribe = ({ subscriptionId }) => { const s = findSubscription(subscriptionId); if (!s) return { ok: false }; saveSubscription({ ...s, status: 'cancelled', cancelledAt: new Date().toISOString() }); return { ok: true }; };
EOF
cat > src/billing/cancel.js <<'EOF'
const { unsubscribe } = require('./unsubscribe');
exports.cancelImmediately = ({ subscriptionId }) => unsubscribe({ subscriptionId });
EOF
cat > src/billing/upgrade.js <<'EOF'
const { findSubscription, saveSubscription } = require('./repository');
const { getPlan } = require('./plans');
exports.upgrade = ({ subscriptionId, newPlanId }) => { const s = findSubscription(subscriptionId); if (!s||!getPlan(newPlanId)) return { ok: false }; saveSubscription({ ...s, planId: newPlanId }); return { ok: true }; };
EOF
cat > src/billing/payment.js <<'EOF'
const { findInvoice, saveInvoice } = require('./repository');
function chargeInvoice({ invoiceId, paymentMethod }) {
  const i = findInvoice(invoiceId);
  if (!i) return { ok: false, error: 'invoice_not_found' };
  if (i.paid) return { ok: false, error: 'already_paid' };
  if (!paymentMethod) return { ok: false, error: 'missing_payment_method' };
  const next = { ...i, paid: true, paidAt: new Date().toISOString() };
  saveInvoice(next);
  return { ok: true, invoice: next };
}
module.exports = { chargeInvoice };
EOF
cat > src/billing/refund.js <<'EOF'
const { findInvoice, saveInvoice } = require('./repository');
exports.refundInvoice = ({ invoiceId, reason }) => {
  const i = findInvoice(invoiceId);
  if (!i || !i.paid || i.refundedAt) return { ok: false };
  saveInvoice({ ...i, refundedAt: new Date().toISOString(), refundReason: reason || null });
  return { ok: true };
};
EOF
cat > src/billing/charge.js <<'EOF'
const { listInvoicesByUser } = require('./repository');
const { chargeInvoice } = require('./payment');
exports.chargeAllOpen = ({ userId, paymentMethod }) => {
  const open = listInvoicesByUser(userId).filter(i => !i.paid);
  return { ok: true, results: open.map(i => chargeInvoice({ invoiceId: i.id, paymentMethod })) };
};
EOF
cat > src/billing/usage.js <<'EOF'
const { table } = require('../shared/db');
exports.record = ({ userId, metric, value }) => { const k = userId+':'+metric; table('usage').set(k, (table('usage').get(k)||0)+value); };
exports.get = ({ userId, metric }) => table('usage').get(userId+':'+metric) || 0;
EOF
cat > src/billing/dunning.js <<'EOF'
const { listInvoicesByUser } = require('./repository');
exports.pastDue = ({ userId, days }) => { const cut = Date.now() - (days||30)*86400000; return listInvoicesByUser(userId).filter(i => !i.paid && Date.parse(i.issuedAt) < cut); };
EOF
cat > src/billing/taxes.js <<'EOF'
const RATES = { US: 0.08, GB: 0.20, DE: 0.19, JP: 0.10, FR: 0.20 };
exports.taxFor = ({ amount, country }) => Math.round(amount * (RATES[country]||0));
EOF

# ---------- ORDERS (12 files) ----------
cat > src/orders/cart.js <<'EOF'
const { table } = require('../shared/db');
const carts = () => table('carts');
exports.getCart = uid => { if (!carts().has(uid)) carts().set(uid, { userId: uid, items: [] }); return carts().get(uid); };
exports.addItem = ({ userId, sku, qty }) => { const c = exports.getCart(userId); c.items.push({ sku, qty }); return c; };
exports.clear = uid => carts().delete(uid);
EOF
cat > src/orders/inventory.js <<'EOF'
const STOCK = { 'SKU-A': 50, 'SKU-B': 20, 'SKU-C': 0, 'SKU-D': 100, 'SKU-E': 5 };
exports.inStock = (sku, qty) => (STOCK[sku] != null) && STOCK[sku] >= qty;
exports.reserve = (sku, qty) => { if (!exports.inStock(sku, qty)) return false; STOCK[sku] -= qty; return true; };
EOF
cat > src/orders/shipping.js <<'EOF'
const RATES = { standard: 500, express: 1500, overnight: 3000 };
exports.quote = ({ method, weightGrams }) => { const b = RATES[method]; return b == null ? null : b + Math.floor((weightGrams||0)/1000)*100; };
EOF
cat > src/orders/order.js <<'EOF'
function makeOrder({ id, userId, items, total, status }) {
  if (!id || !userId || !Array.isArray(items) || items.length === 0) throw new Error('invalid order');
  return { id, userId, items, total, status: status||'pending', createdAt: new Date().toISOString(), fulfilledAt: null };
}
module.exports = { makeOrder };
EOF
cat > src/orders/repository.js <<'EOF'
const { table } = require('../shared/db');
exports.save = o => { table('orders').set(o.id, o); return o; };
exports.find = id => table('orders').get(id) || null;
exports.listByUser = uid => Array.from(table('orders').values()).filter(o => o.userId === uid);
EOF
cat > src/orders/checkout.js <<'EOF'
const { uuid } = require('../shared/ids');
const { findById } = require('../users/repository');
const { getCart, clear } = require('./cart');
const { reserve } = require('./inventory');
const { quote } = require('./shipping');
const { makeOrder } = require('./order');
const { save } = require('./repository');
const PRICES = { 'SKU-A': 1000, 'SKU-B': 2500, 'SKU-C': 800, 'SKU-D': 1500, 'SKU-E': 5000 };
function checkout({ userId, shippingMethod }) {
  if (!findById(userId)) return { ok: false, error: 'user_not_found' };
  const c = getCart(userId);
  if (c.items.length === 0) return { ok: false, error: 'cart_empty' };
  for (const it of c.items) if (!reserve(it.sku, it.qty)) return { ok: false, error: 'oos_'+it.sku };
  const goods = c.items.reduce((s, it) => s + (PRICES[it.sku]||0)*it.qty, 0);
  const ship = quote({ method: shippingMethod||'standard', weightGrams: 500*c.items.length }) || 0;
  const order = makeOrder({ id: uuid(), userId, items: c.items, total: goods+ship });
  save(order);
  clear(userId);
  return { ok: true, order };
}
module.exports = { checkout };
EOF
cat > src/orders/fulfillment.js <<'EOF'
const { find, save } = require('./repository');
exports.fulfill = ({ orderId }) => { const o = find(orderId); if (!o || o.status !== 'pending') return { ok: false }; save({ ...o, status: 'fulfilled', fulfilledAt: new Date().toISOString() }); return { ok: true }; };
EOF
cat > src/orders/place-order.js <<'EOF'
const { checkout } = require('./checkout');
exports.placeOrder = body => checkout(body);
EOF
cat > src/orders/cancel-order.js <<'EOF'
const { find, save } = require('./repository');
exports.cancelOrder = ({ orderId }) => { const o = find(orderId); if (!o || o.status === 'fulfilled') return { ok: false }; save({ ...o, status: 'cancelled' }); return { ok: true }; };
EOF
cat > src/orders/track.js <<'EOF'
const { find } = require('./repository');
exports.track = ({ orderId }) => { const o = find(orderId); return o ? { ok: true, status: o.status, fulfilledAt: o.fulfilledAt } : { ok: false }; };
EOF
cat > src/orders/return.js <<'EOF'
const { find, save } = require('./repository');
exports.requestReturn = ({ orderId, reason }) => { const o = find(orderId); if (!o || o.status !== 'fulfilled') return { ok: false }; save({ ...o, returnRequested: true, returnReason: reason }); return { ok: true }; };
EOF
cat > src/orders/summary.js <<'EOF'
const { listByUser } = require('./repository');
exports.summarize = ({ userId }) => { const orders = listByUser(userId); return { ok: true, total: orders.length, totalSpend: orders.reduce((s,o)=>s+o.total,0) }; };
EOF

# ---------- NOTIF (10 files) ----------
cat > src/notif/template.js <<'EOF'
const TPL = { welcome: 'Welcome, {{email}}!', orderPlaced: 'Order {{id}} confirmed', refundIssued: 'Refund of {{amount}} processed' };
exports.render = (key, vars) => (TPL[key]||'').replace(/\{\{(\w+)\}\}/g, (_,k)=>vars[k]||'');
EOF
cat > src/notif/queue.js <<'EOF'
const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
exports.enqueue = msg => { const id = shortId('n'); table('notifQ').set(id, { id, ...msg, status: 'pending' }); return id; };
exports.dequeue = () => { for (const m of table('notifQ').values()) if (m.status === 'pending') { m.status = 'sent'; return m; } return null; };
exports.size = () => table('notifQ').size;
EOF
cat > src/notif/email.js <<'EOF'
const { enqueue } = require('./queue');
const { render } = require('./template');
exports.sendEmail = ({ to, key, vars }) => enqueue({ channel: 'email', to, body: render(key, vars||{}) });
EOF
cat > src/notif/sms.js <<'EOF'
const { enqueue } = require('./queue');
exports.sendSms = ({ to, body }) => enqueue({ channel: 'sms', to, body });
EOF
cat > src/notif/push.js <<'EOF'
const { enqueue } = require('./queue');
exports.sendPush = ({ deviceId, body }) => enqueue({ channel: 'push', deviceId, body });
EOF
cat > src/notif/send.js <<'EOF'
const { dequeue } = require('./queue');
exports.flushOne = () => { const m = dequeue(); return m ? { ok: true, sent: m } : { ok: true, sent: null }; };
EOF
cat > src/notif/repository.js <<'EOF'
const { table } = require('../shared/db');
exports.recent = () => Array.from(table('notifQ').values()).slice(-50);
EOF
cat > src/notif/preferences-notif.js <<'EOF'
const { findById, update } = require('../users/repository');
exports.setNotifPrefs = ({ userId, prefs }) => update(userId, { notifPrefs: prefs });
exports.getNotifPrefs = ({ userId }) => { const u = findById(userId); return u ? (u.notifPrefs||{}) : {}; };
EOF
cat > src/notif/log.js <<'EOF'
const { recent } = require('./repository');
exports.tail = () => ({ ok: true, items: recent() });
EOF
cat > src/notif/retry.js <<'EOF'
const { table } = require('../shared/db');
exports.retryFailed = () => { let n = 0; for (const m of table('notifQ').values()) if (m.status === 'failed') { m.status = 'pending'; n++; } return { ok: true, retried: n }; };
EOF

# ---------- ANALYTICS (10 files) ----------
cat > src/analytics/event.js <<'EOF'
const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
exports.record = ({ userId, kind, props }) => { const id = shortId('e'); table('events').set(id, { id, userId, kind, props: props||{}, ts: new Date().toISOString() }); return id; };
EOF
cat > src/analytics/session-track.js <<'EOF'
const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
exports.startSession = ({ userId }) => { const id = shortId('asess'); table('asessions').set(id, { id, userId, startedAt: Date.now(), endedAt: null }); return id; };
exports.endSession = ({ id }) => { const s = table('asessions').get(id); if (!s) return false; s.endedAt = Date.now(); return true; };
EOF
cat > src/analytics/metric.js <<'EOF'
const { table } = require('../shared/db');
exports.inc = (k, by) => { const t = table('metrics'); t.set(k, (t.get(k)||0)+(by||1)); };
exports.read = k => table('metrics').get(k) || 0;
EOF
cat > src/analytics/dashboard.js <<'EOF'
const { table } = require('../shared/db');
exports.summary = () => ({ users: table('users').size, orders: table('orders').size, events: table('events').size });
EOF
cat > src/analytics/repository.js <<'EOF'
const { table } = require('../shared/db');
exports.allEvents = () => Array.from(table('events').values());
exports.allSessions = () => Array.from(table('asessions').values());
EOF
cat > src/analytics/track.js <<'EOF'
const { record } = require('./event');
exports.track = record;
EOF
cat > src/analytics/query.js <<'EOF'
const { allEvents } = require('./repository');
exports.byKind = kind => allEvents().filter(e => e.kind === kind);
exports.byUser = uid => allEvents().filter(e => e.userId === uid);
EOF
cat > src/analytics/aggregate.js <<'EOF'
const { allEvents } = require('./repository');
exports.countByKind = () => { const out = {}; for (const e of allEvents()) out[e.kind] = (out[e.kind]||0)+1; return out; };
EOF
cat > src/analytics/export-events.js <<'EOF'
const { allEvents } = require('./repository');
exports.exportAll = () => allEvents().map(e => `${e.id},${e.kind},${e.userId},${e.ts}`).join('\n');
EOF
cat > src/analytics/funnel.js <<'EOF'
const { byUser } = require('./query');
exports.funnel = ({ userId, steps }) => { const evs = byUser(userId); return steps.map(s => evs.some(e => e.kind === s)); };
EOF

# ---------- TOP LEVEL (3 files) ----------
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
  'POST /auth/signup':       b => signup(b),
  'POST /auth/login':        b => login(b),
  'POST /auth/logout':       b => logout(b),
  'POST /billing/subscribe': b => subscribe(b),
  'POST /billing/charge':    b => chargeAllOpen(b),
  'POST /billing/refund':    b => refundInvoice(b),
  'POST /orders/cart/add':   b => addItem(b),
  'POST /orders/checkout':   b => checkout(b),
  'POST /orders/fulfill':    b => fulfill(b)
};
exports.dispatch = (m, p, b) => { const fn = ROUTES[`${m} ${p}`]; if (!fn) return { status: 404, body: { error: 'not_found' } }; const r = fn(b||{}); return { status: r.ok ? 200 : 400, body: r }; };
EOF
cat > src/server.js <<'EOF'
const http = require('http');
const { dispatch } = require('./router');
exports.createServer = () => http.createServer(async (req, res) => {
  let body = {};
  if (req.method === 'POST') {
    let buf = ''; req.on('data', c => buf += c);
    await new Promise(r => req.on('end', r));
    try { body = buf ? JSON.parse(buf) : {}; } catch { res.writeHead(400); return res.end('{"error":"invalid_json"}'); }
  }
  const { status, body: out } = dispatch(req.method, req.url, body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(out));
});
EOF
cat > src/index.js <<'EOF'
const { createServer } = require('./server');
const port = parseInt(process.env.PORT || '3000', 10);
createServer().listen(port);
EOF

# ---------- TESTS (6 files) ----------
cat > test/_runner.js <<'EOF'
exports.run = (n, fn) => { try { fn(); console.log('ok  - '+n); } catch (e) { console.error('fail - '+n+': '+e.message); process.exitCode = 1; } };
EOF
cat > test/auth.test.js <<'EOF'
const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { login } = require('../src/auth/login');
run('signup', () => { clearAll(); const r = signup({ email:'a@b.co', password:'password1' }); assert.strictEqual(r.ok, true); });
run('login', () => { clearAll(); signup({ email:'a@b.co', password:'password1' }); const r = login({ email:'a@b.co', password:'password1' }); assert.strictEqual(r.ok, true); });
if (process.exitCode) process.exit(process.exitCode);
EOF
cat > test/billing.test.js <<'EOF'
const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { subscribe } = require('../src/billing/subscribe');
const { generateInvoice } = require('../src/billing/invoice');
run('subscribe', () => { clearAll(); const u = signup({ email:'a@b.co', password:'password1' }).user; const r = subscribe({ userId: u.id, planId: 'pro' }); assert.strictEqual(r.ok, true); });
run('invoice', () => { clearAll(); const u = signup({ email:'a@b.co', password:'password1' }).user; const s = subscribe({ userId: u.id, planId: 'pro' }).subscription; const inv = generateInvoice({ subscriptionId: s.id }); assert.ok(inv.amount > 0); });
if (process.exitCode) process.exit(process.exitCode);
EOF
cat > test/orders.test.js <<'EOF'
const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { addItem } = require('../src/orders/cart');
const { checkout } = require('../src/orders/checkout');
run('checkout', () => { clearAll(); const u = signup({ email:'a@b.co', password:'password1' }).user; addItem({ userId: u.id, sku:'SKU-A', qty:2 }); const r = checkout({ userId: u.id }); assert.strictEqual(r.ok, true); });
if (process.exitCode) process.exit(process.exitCode);
EOF
cat > test/notif.test.js <<'EOF'
const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { sendEmail } = require('../src/notif/email');
const { size } = require('../src/notif/queue');
run('enqueue email', () => { clearAll(); sendEmail({ to:'a@b.co', key:'welcome', vars:{ email:'a@b.co' } }); assert.ok(size() > 0); });
if (process.exitCode) process.exit(process.exitCode);
EOF
cat > test/analytics.test.js <<'EOF'
const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { record } = require('../src/analytics/event');
const { byKind } = require('../src/analytics/query');
run('event tracking', () => { clearAll(); record({ userId:'u1', kind:'login', props:{} }); assert.strictEqual(byKind('login').length, 1); });
if (process.exitCode) process.exit(process.exitCode);
EOF

# ---------- git baseline ----------
git init -b main >/dev/null 2>&1
git add . >/dev/null
git -c user.email=bench@local -c user.name=bench commit -q -m "fixture: large-app baseline"
git tag baseline-state

# ---------- summary ----------
echo "=== file count ==="
find src test -type f | wc -l
echo "=== tests ==="
node test/auth.test.js && node test/billing.test.js && node test/orders.test.js && node test/notif.test.js && node test/analytics.test.js
echo "=== domains ==="
ls src/
echo "Fixture initialized at $FIX (tag: baseline-state)"
