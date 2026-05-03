const { isEmail } = require('../shared/validation');
function makeUser({ id, email, passwordHash, createdAt, currency }) {
  if (!id || !isEmail(email) || !passwordHash) throw new Error('invalid user');
  return { id, email: email.toLowerCase(), passwordHash, createdAt: createdAt || new Date().toISOString(), currency: currency || 'USD' };
}
module.exports = { makeUser };
