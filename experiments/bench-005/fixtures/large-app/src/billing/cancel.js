const { unsubscribe } = require('./unsubscribe');
const { findSubscription } = require('./repository');
const { track } = require('../analytics/track');
const { sendEmail } = require('../notif/email');
const { findById } = require('../users/repository');

exports.cancelImmediately = ({ subscriptionId }) => {
  const result = unsubscribe({ subscriptionId });
  if (!result.ok) return result;
  const sub = findSubscription(subscriptionId);
  track({ userId: sub.userId, kind: 'subscription_cancelled', props: { subscriptionId } });
  const user = findById(sub.userId);
  if (user) sendEmail({ to: user.email, key: 'subscription_cancelled', vars: { email: user.email } });
  return result;
};
