const { table } = require('../shared/db');
const carts = () => table('carts');
exports.getCart = uid => { if (!carts().has(uid)) carts().set(uid, { userId: uid, items: [] }); return carts().get(uid); };
exports.addItem = ({ userId, sku, qty }) => { const c = exports.getCart(userId); c.items.push({ sku, qty }); return c; };
exports.clear = uid => carts().delete(uid);
