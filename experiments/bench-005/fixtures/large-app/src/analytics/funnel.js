const { byUser } = require('./query');
exports.funnel = ({ userId, steps }) => { const evs = byUser(userId); return steps.map(s => evs.some(e => e.kind === s)); };
