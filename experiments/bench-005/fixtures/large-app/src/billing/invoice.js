const { uuid } = require('../shared/ids');
const { getPlan } = require('./plans');
const { findSubscription, saveInvoice } = require('./repository');
function generateInvoice({ subscriptionId }) {
  const s = findSubscription(subscriptionId);
  if (!s) throw new Error('subscription not found');
  const plan = getPlan(s.planId);
  const inv = { id: uuid(), userId: s.userId, subscriptionId: s.id, amount: plan.monthly, issuedAt: new Date().toISOString(), paid: false, currency: s.currency };
  saveInvoice(inv);
  return inv;
}
module.exports = { generateInvoice };
