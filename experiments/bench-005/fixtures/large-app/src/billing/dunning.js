const { listInvoicesByUser } = require('./repository');
exports.pastDue = ({ userId, days }) => { const cut = Date.now() - (days||30)*86400000; return listInvoicesByUser(userId).filter(i => !i.paid && Date.parse(i.issuedAt) < cut); };
