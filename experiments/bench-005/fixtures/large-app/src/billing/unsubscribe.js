const { findSubscription, saveSubscription } = require('./repository');
exports.unsubscribe = ({ subscriptionId }) => { const s = findSubscription(subscriptionId); if (!s) return { ok: false }; saveSubscription({ ...s, status: 'cancelled', cancelledAt: new Date().toISOString() }); return { ok: true }; };
