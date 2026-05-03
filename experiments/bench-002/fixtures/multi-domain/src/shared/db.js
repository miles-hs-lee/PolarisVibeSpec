// Tiny in-memory key/value store. Pretend this is a real DB.
const tables = new Map();
function table(name) {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
}
function clearAll() { tables.clear(); }
module.exports = { table, clearAll };
