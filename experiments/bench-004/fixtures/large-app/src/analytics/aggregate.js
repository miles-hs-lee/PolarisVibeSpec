const { allEvents } = require('./repository');
exports.countByKind = () => { const out = {}; for (const e of allEvents()) out[e.kind] = (out[e.kind]||0)+1; return out; };
