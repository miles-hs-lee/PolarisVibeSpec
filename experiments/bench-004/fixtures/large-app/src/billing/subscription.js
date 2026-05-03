const { getPlan } = require('./plans');
function makeSubscription({ id, userId, planId, status, startedAt, currency }) {
  if (!id || !userId) throw new Error('invalid subscription');
  if (!getPlan(planId)) throw new Error('unknown plan');
  return { id, userId, planId, status: status||'active', startedAt: startedAt||new Date().toISOString(), cancelledAt: null, currency: currency || 'USD' };
}
module.exports = { makeSubscription };
