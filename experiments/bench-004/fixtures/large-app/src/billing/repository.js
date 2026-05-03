const { table } = require('../shared/db');
const subs = () => table('subscriptions');
const invs = () => table('invoices');
exports.saveSubscription = s => { subs().set(s.id, s); return s; };
exports.findSubscription = id => subs().get(id) || null;
exports.findSubscriptionsByUser = uid => Array.from(subs().values()).filter(s => s.userId === uid);
exports.saveInvoice = i => { invs().set(i.id, i); return i; };
exports.findInvoice = id => invs().get(id) || null;
exports.listInvoicesByUser = uid => Array.from(invs().values()).filter(i => i.userId === uid);
