const { enqueue } = require('./queue');
const { render } = require('./template');
exports.sendEmail = ({ to, key, vars }) => enqueue({ channel: 'email', to, body: render(key, vars||{}) });
