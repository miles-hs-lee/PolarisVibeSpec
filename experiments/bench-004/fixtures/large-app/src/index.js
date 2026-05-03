const { createServer } = require('./server');
const port = parseInt(process.env.PORT || '3000', 10);
createServer().listen(port);
