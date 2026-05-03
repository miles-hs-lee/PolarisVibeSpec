const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { signup } = require('../src/auth/signup');
const { login } = require('../src/auth/login');
run('signup', () => { clearAll(); const r = signup({ email:'a@b.co', password:'password1' }); assert.strictEqual(r.ok, true); });
run('login', () => { clearAll(); signup({ email:'a@b.co', password:'password1' }); const r = login({ email:'a@b.co', password:'password1' }); assert.strictEqual(r.ok, true); });
if (process.exitCode) process.exit(process.exitCode);
