const { dequeue } = require('./queue');
exports.flushOne = () => { const m = dequeue(); return m ? { ok: true, sent: m } : { ok: true, sent: null }; };
