const { destroy } = require('./session');
exports.logout = ({ token }) => { if (!token) return { ok: false, error: 'invalid' }; destroy(token); return { ok: true }; };
