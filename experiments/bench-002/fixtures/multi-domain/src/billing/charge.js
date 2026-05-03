const { listInvoicesByUser } = require('./repository');
const { chargeInvoice } = require('./payment');
function chargeAllOpen({ userId, paymentMethod }) {
  const open = listInvoicesByUser(userId).filter((i) => !i.paid);
  const results = [];
  for (const inv of open) {
    results.push(chargeInvoice({ invoiceId: inv.id, paymentMethod }));
  }
  return { ok: true, results };
}
module.exports = { chargeAllOpen };
