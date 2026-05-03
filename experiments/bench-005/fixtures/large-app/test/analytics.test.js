const assert = require('assert'); const { run } = require('./_runner');
const { clearAll } = require('../src/shared/db');
const { record } = require('../src/analytics/event');
const { byKind } = require('../src/analytics/query');
run('event tracking', () => { clearAll(); record({ userId:'u1', kind:'login', props:{} }); assert.strictEqual(byKind('login').length, 1); });
if (process.exitCode) process.exit(process.exitCode);
