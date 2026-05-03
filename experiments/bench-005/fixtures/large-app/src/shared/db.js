const tables = new Map();
function table(n) { if (!tables.has(n)) tables.set(n, new Map()); return tables.get(n); }
function clearAll() { tables.clear(); }
module.exports = { table, clearAll };
