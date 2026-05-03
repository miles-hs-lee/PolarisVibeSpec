const RATES = { standard: 500, express: 1500, overnight: 3000 };
exports.quote = ({ method, weightGrams }) => { const b = RATES[method]; return b == null ? null : b + Math.floor((weightGrams||0)/1000)*100; };
