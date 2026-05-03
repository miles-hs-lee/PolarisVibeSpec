const { table } = require('../shared/db');
const { shortId } = require('../shared/ids');
exports.record = ({ userId, kind, props }) => { const id = shortId('e'); table('events').set(id, { id, userId, kind, props: props||{}, ts: new Date().toISOString() }); return id; };
