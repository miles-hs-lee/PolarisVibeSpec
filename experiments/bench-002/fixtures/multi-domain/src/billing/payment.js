const { findInvoice, saveInvoice } = require('./repository');
function chargeInvoice({ invoiceId, paymentMethod }) {
  const invoice = findInvoice(invoiceId);
  if (!invoice) return { ok: false, error: 'invoice_not_found' };
  if (invoice.paid) return { ok: false, error: 'already_paid' };
  if (!paymentMethod) return { ok: false, error: 'missing_payment_method' };
  const updated = { ...invoice, paid: true, paidAt: new Date().toISOString() };
  saveInvoice(updated);
  return { ok: true, invoice: updated };
}
module.exports = { chargeInvoice };
