function isEmail(s) { return typeof s === 'string' && /.+@.+\..+/.test(s); }
function isNonEmptyString(s) { return typeof s === 'string' && s.length > 0; }
function isPositiveInt(n) { return Number.isInteger(n) && n > 0; }
function isISODate(s) { return typeof s === 'string' && !Number.isNaN(Date.parse(s)); }
module.exports = { isEmail, isNonEmptyString, isPositiveInt, isISODate };
