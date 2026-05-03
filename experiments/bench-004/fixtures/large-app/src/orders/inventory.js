const STOCK = { 'SKU-A': 50, 'SKU-B': 20, 'SKU-C': 0, 'SKU-D': 100, 'SKU-E': 5 };
exports.inStock = (sku, qty) => (STOCK[sku] != null) && STOCK[sku] >= qty;
exports.reserve = (sku, qty) => { if (!exports.inStock(sku, qty)) return false; STOCK[sku] -= qty; return true; };
