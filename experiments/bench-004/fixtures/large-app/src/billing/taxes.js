const RATES = { US: 0.08, GB: 0.20, DE: 0.19, JP: 0.10, FR: 0.20 };
exports.taxFor = ({ amount, country }) => Math.round(amount * (RATES[country]||0));
