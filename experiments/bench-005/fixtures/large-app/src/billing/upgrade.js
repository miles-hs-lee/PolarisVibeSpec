const { findSubscription, saveSubscription } = require('./repository');
const { getPlan } = require('./plans');
exports.upgrade = ({ subscriptionId, newPlanId }) => { const s = findSubscription(subscriptionId); if (!s||!getPlan(newPlanId)) return { ok: false }; saveSubscription({ ...s, planId: newPlanId }); return { ok: true }; };
