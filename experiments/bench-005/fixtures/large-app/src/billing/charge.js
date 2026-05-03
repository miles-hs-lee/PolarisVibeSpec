const { listInvoicesByUser } = require('./repository');
const { chargeInvoice } = require('./payment');
exports.chargeAllOpen = ({ userId, paymentMethod }) => {
  const open = listInvoicesByUser(userId).filter(i => !i.paid);
  return { ok: true, results: open.map(i => chargeInvoice({ invoiceId: i.id, paymentMethod })) };
};
