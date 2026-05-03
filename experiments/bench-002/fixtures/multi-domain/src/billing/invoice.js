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
    currency: sub.currency,
    periodStart: periodStart || new Date().toISOString(),
    periodEnd: periodEnd || new Date().toISOString(),
    issuedAt: new Date().toISOString(),
    paid: false
  };
  saveInvoice(invoice);
  return invoice;
}
module.exports = { generateInvoice };
