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
