const PLANS = { free: { id:'free', monthly:0, name:'Free' }, pro: { id:'pro', monthly:1900, name:'Pro' }, premium: { id:'premium', monthly:4900, name:'Premium' }, enterprise: { id:'enterprise', monthly:19900, name:'Enterprise' } };
exports.getPlan = id => PLANS[id] || null;
exports.listPlans = () => Object.values(PLANS);
