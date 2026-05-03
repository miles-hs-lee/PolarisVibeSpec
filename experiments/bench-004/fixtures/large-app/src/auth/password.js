const crypto = require('crypto');
exports.hash = pwd => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.createHash('sha256').update(s+pwd).digest('hex'); };
exports.verify = (pwd, stored) => { if (!stored||!stored.includes(':')) return false; const [s,d] = stored.split(':'); return crypto.createHash('sha256').update(s+pwd).digest('hex') === d; };
