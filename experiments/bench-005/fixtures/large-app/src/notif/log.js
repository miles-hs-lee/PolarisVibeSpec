const { recent } = require('./repository');
exports.tail = () => ({ ok: true, items: recent() });
