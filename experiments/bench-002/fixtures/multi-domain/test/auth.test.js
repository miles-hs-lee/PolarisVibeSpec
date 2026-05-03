const assert = require('assert');
const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { login } = require('../src/auth/login');
const { logout } = require('../src/auth/logout');

run('signup creates a user', () => {
  clearAll();
  const r = signup({ email: 'a@b.co', password: 'password1' });
  assert.strictEqual(r.ok, true);
  assert.ok(r.user.id);
});

run('login + logout happy path', () => {
  clearAll();
  signup({ email: 'a@b.co', password: 'password1' });
  const lr = login({ email: 'a@b.co', password: 'password1' });
  assert.strictEqual(lr.ok, true);
  assert.ok(lr.token);
  const out = logout({ token: lr.token });
  assert.strictEqual(out.ok, true);
});

run('login fails on bad password', () => {
  clearAll();
  signup({ email: 'a@b.co', password: 'password1' });
  const lr = login({ email: 'a@b.co', password: 'WRONG' });
  assert.strictEqual(lr.ok, false);
});

if (process.exitCode) process.exit(process.exitCode);
