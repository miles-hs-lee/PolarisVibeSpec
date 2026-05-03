const { table } = require('../shared/db');
function usage() { return table('usage'); }
function record({ userId, metric, value }) {
  const key = `${userId}:${metric}`;
  const cur = usage().get(key) || 0;
  usage().set(key, cur + value);
  return { userId, metric, total: cur + value };
}
function get({ userId, metric }) {
  return usage().get(`${userId}:${metric}`) || 0;
}
module.exports = { record, get };
