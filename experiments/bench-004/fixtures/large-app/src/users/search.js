const { list } = require('./repository');
exports.search = ({ query }) => { const q = (query||'').toLowerCase(); return { ok: true, results: list().filter(u => u.email.includes(q)) }; };
