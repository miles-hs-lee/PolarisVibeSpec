const { list } = require('./repository');
exports.exportUsers = () => ({ ok: true, csv: list().map(u => `${u.id},${u.email}`).join('\n') });
