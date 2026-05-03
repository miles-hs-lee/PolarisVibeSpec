const { get, create } = require('./session');
exports.refresh = ({ token }) => { const s = get(token); if (!s) return { ok: false, error: 'invalid_session' }; return { ok: true, token: create(s.userId) }; };
