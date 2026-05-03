const STOCK = { 'SKU-A': 50, 'SKU-B': 20, 'SKU-C': 0 };
function inStock(sku, qty) {
  const have = STOCK[sku];
  if (have == null) return false;
  return have >= qty;
}
function reserve(sku, qty) {
  if (!inStock(sku, qty)) return false;
  STOCK[sku] -= qty;
  return true;
}
module.exports = { inStock, reserve };
