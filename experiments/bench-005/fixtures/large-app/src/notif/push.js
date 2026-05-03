const { enqueue } = require('./queue');
exports.sendPush = ({ deviceId, body }) => enqueue({ channel: 'push', deviceId, body });
