const PLANS = {
  free:    { id: 'free',    monthly: 0,    name: 'Free' },
  pro:     { id: 'pro',     monthly: 1900, name: 'Pro' },
  premium: { id: 'premium', monthly: 4900, name: 'Premium' }
};
function getPlan(id) { return PLANS[id] || null; }
function listPlans() { return Object.values(PLANS); }
module.exports = { getPlan, listPlans };
