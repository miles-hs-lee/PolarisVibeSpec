const { allEvents } = require('./repository');
exports.exportAll = () => allEvents().map(e => `${e.id},${e.kind},${e.userId},${e.ts}`).join('\n');
