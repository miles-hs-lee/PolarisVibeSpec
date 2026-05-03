const { table } = require('../shared/db');
exports.allEvents = () => Array.from(table('events').values());
exports.allSessions = () => Array.from(table('asessions').values());
