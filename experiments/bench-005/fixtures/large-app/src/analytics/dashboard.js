const { table } = require('../shared/db');
exports.summary = () => ({ users: table('users').size, orders: table('orders').size, events: table('events').size });
