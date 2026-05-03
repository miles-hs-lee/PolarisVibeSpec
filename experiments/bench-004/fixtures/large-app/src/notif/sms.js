const { enqueue } = require('./queue');
exports.sendSms = ({ to, body }) => enqueue({ channel: 'sms', to, body });
