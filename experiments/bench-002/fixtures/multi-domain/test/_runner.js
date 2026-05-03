function run(name, fn) {
  try { fn(); console.log(`ok  - ${name}`); }
  catch (e) { console.error(`fail - ${name}: ${e.message}`); process.exitCode = 1; }
}
module.exports = { run };
