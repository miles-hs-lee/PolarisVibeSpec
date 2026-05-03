const { table } = require('../shared/db');
exports.inc = (k, by) => { const t = table('metrics'); t.set(k, (t.get(k)||0)+(by||1)); };
exports.read = k => table('metrics').get(k) || 0;
