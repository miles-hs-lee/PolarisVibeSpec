const { findInvoice, saveInvoice } = require('./repository');
function refundInvoice({ invoiceId, reason }) {
  const invoice = findInvoice(invoiceId);
  if (!invoice) return { ok: false, error: 'invoice_not_found' };
  if (!invoice.paid) return { ok: false, error: 'not_paid' };
  if (invoice.refundedAt) return { ok: false, error: 'already_refunded' };
  const updated = { ...invoice, refundedAt: new Date().toISOString(), refundReason: reason || null };
  saveInvoice(updated);
  return { ok: true, invoice: updated };
}
module.exports = { refundInvoice };
