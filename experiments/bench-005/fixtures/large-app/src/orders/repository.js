const { table } = require('../shared/db');
exports.save = o => { table('orders').set(o.id, o); return o; };
exports.find = id => table('orders').get(id) || null;
exports.listByUser = uid => Array.from(table('orders').values()).filter(o => o.userId === uid);
