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
