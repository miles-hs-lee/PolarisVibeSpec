const { getPlan } = require('./plans');
function makeSubscription({ id, userId, planId, startedAt, status, currency }) {
  if (!id) throw new Error('subscription.id required');
  if (!userId) throw new Error('subscription.userId required');
  const plan = getPlan(planId);
  if (!plan) throw new Error(`unknown plan: ${planId}`);
  return {
    id,
    userId,
    planId,
    currency: currency || 'USD',
    status: status || 'active',
    startedAt: startedAt || new Date().toISOString(),
    cancelledAt: null
  };
}
module.exports = { makeSubscription };
