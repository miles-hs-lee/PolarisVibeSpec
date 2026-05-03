class DomainError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
module.exports = { DomainError };
