const { findInvoice, saveInvoice } = require('./repository');
function chargeInvoice({ invoiceId, paymentMethod }) {
  const i = findInvoice(invoiceId);
  if (!i) return { ok: false, error: 'invoice_not_found' };
  if (i.paid) return { ok: false, error: 'already_paid' };
  if (!paymentMethod) return { ok: false, error: 'missing_payment_method' };
  const next = { ...i, paid: true, paidAt: new Date().toISOString() };
  saveInvoice(next);
  return { ok: true, invoice: next };
}
module.exports = { chargeInvoice };
