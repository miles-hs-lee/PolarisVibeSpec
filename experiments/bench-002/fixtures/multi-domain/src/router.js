const { signup } = require('./auth/signup');
const { login } = require('./auth/login');
const { logout } = require('./auth/logout');
const { subscribe } = require('./billing/subscribe');
const { chargeAllOpen } = require('./billing/charge');
const { refundInvoice } = require('./billing/refund');
const { addItem } = require('./orders/cart');
const { checkout } = require('./orders/checkout');
const { fulfill } = require('./orders/fulfillment');
const ROUTES = {
  'POST /auth/signup':       (b) => signup(b),
  'POST /auth/login':        (b) => login(b),
  'POST /auth/logout':       (b) => logout(b),
  'POST /billing/subscribe': (b) => subscribe(b),
  'POST /billing/charge':    (b) => chargeAllOpen(b),
  'POST /billing/refund':    (b) => refundInvoice(b),
  'POST /orders/cart/add':   (b) => addItem(b),
  'POST /orders/checkout':   (b) => checkout(b),
  'POST /orders/fulfill':    (b) => fulfill(b)
};
function dispatch(method, path, body) {
  const fn = ROUTES[`${method} ${path}`];
  if (!fn) return { status: 404, body: { error: 'not_found' } };
  const result = fn(body || {});
  return { status: result.ok ? 200 : 400, body: result };
}
module.exports = { dispatch };
