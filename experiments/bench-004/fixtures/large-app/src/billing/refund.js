const { findInvoice, saveInvoice } = require('./repository');
exports.refundInvoice = ({ invoiceId, reason }) => {
  const i = findInvoice(invoiceId);
  if (!i || !i.paid || i.refundedAt) return { ok: false };
  saveInvoice({ ...i, refundedAt: new Date().toISOString(), refundReason: reason || null });
  return { ok: true };
};
