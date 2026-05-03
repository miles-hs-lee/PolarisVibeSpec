const { allEvents } = require('./repository');
exports.byKind = kind => allEvents().filter(e => e.kind === kind);
exports.byUser = uid => allEvents().filter(e => e.userId === uid);
