const RATES = { standard: 500, express: 1500 };
function quote({ method, weightGrams }) {
  const base = RATES[method];
  if (base == null) return null;
  const surcharge = Math.floor((weightGrams || 0) / 1000) * 100;
  return base + surcharge;
}
module.exports = { quote };
