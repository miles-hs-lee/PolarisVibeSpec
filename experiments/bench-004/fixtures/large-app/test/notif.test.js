const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { sendEmail } = require('../src/notif/email');
const { size } = require('../src/notif/queue');
run('enqueue email', () => { clearAll(); sendEmail({ to:'a@b.co', key:'welcome', vars:{ email:'a@b.co' } }); assert.ok(size() > 0); });
if (process.exitCode) process.exit(process.exitCode);
