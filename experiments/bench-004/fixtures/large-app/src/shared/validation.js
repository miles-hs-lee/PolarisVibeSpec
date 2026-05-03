const isEmail = s => typeof s === 'string' && /.+@.+\..+/.test(s);
const isNonEmpty = s => typeof s === 'string' && s.length > 0;
const isCurrency = s => typeof s === 'string' && /^[A-Z]{3}$/.test(s);
module.exports = { isEmail, isNonEmpty, isCurrency };
