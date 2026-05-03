const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
function sessions() { return table('sessions'); }
function create(userId) {
  const token = shortId('sess');
  const session = { token, userId, createdAt: new Date().toISOString() };
  sessions().set(token, session);
  return session;
}
function get(token) { return sessions().get(token) || null; }
function destroy(token) { sessions().delete(token); }
module.exports = { create, get, destroy };
