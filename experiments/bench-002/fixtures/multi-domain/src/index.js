const { createServer } = require('./server');
const port = parseInt(process.env.PORT || '3000', 10);
createServer().listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`multi-domain-api listening on :${port}`);
});
