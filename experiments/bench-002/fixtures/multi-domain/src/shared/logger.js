function log(level, msg, meta) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts, level, msg, ...(meta || {}) }));
}
module.exports = {
  info:  (m, x) => log('info',  m, x),
  warn:  (m, x) => log('warn',  m, x),
  error: (m, x) => log('error', m, x)
};
