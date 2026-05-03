const { isEmail } = require('../shared/validation');
function makeUser({ id, email, password_hash, createdAt }) {
  if (!id) throw new Error('user.id is required');
  if (!isEmail(email)) throw new Error('user.email invalid');
  if (!password_hash) throw new Error('user.password_hash required');
  return {
    id,
    email: email.toLowerCase(),
    password_hash,
    createdAt: createdAt || new Date().toISOString()
  };
}
module.exports = { makeUser };
