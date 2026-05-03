const { isEmail } = require('../shared/validation');
function makeUser({ id, email, passwordHash, createdAt }) {
  if (!id) throw new Error('user.id is required');
  if (!isEmail(email)) throw new Error('user.email invalid');
  if (!passwordHash) throw new Error('user.passwordHash required');
  return {
    id,
    email: email.toLowerCase(),
    passwordHash,
    createdAt: createdAt || new Date().toISOString()
  };
}
module.exports = { makeUser };
