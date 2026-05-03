const { list } = require('./repository');
exports.listAll = ({ limit, offset }) => { const all = list(); return { ok: true, total: all.length, items: all.slice(offset||0, (offset||0)+(limit||50)) }; };
