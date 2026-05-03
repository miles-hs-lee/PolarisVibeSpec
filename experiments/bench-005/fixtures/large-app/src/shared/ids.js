const crypto = require('crypto');
function uuid() { return crypto.randomUUID(); }
function shortId(p) { return (p?p+'_':'') + crypto.randomBytes(6).toString('hex'); }
module.exports = { uuid, shortId };
