const { uuid } = require('../shared/ids');
const { findById } = require('../users/repository');
const { getPlan } = require('./plans');
const { makeSubscription } = require('./subscription');
const { saveSubscription } = require('./repository');
function subscribe({ userId, planId, currency }) {
  if (!findById(userId)) return { ok: false, error: 'user_not_found' };
  if (!getPlan(planId)) return { ok: false, error: 'unknown_plan' };
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'invalid_currency' };
  const sub = makeSubscription({ id: uuid(), userId, planId, currency });
  saveSubscription(sub);
  return { ok: true, subscription: sub };
}
module.exports = { subscribe };
