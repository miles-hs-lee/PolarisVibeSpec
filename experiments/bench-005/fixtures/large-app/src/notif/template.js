const TPL = { welcome: 'Welcome, {{email}}!', orderPlaced: 'Order {{id}} confirmed', refundIssued: 'Refund of {{amount}} processed' };
exports.render = (key, vars) => (TPL[key]||'').replace(/\{\{(\w+)\}\}/g, (_,k)=>vars[k]||'');
