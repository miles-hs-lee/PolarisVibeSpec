const { unsubscribe } = require('./unsubscribe');
exports.cancelImmediately = ({ subscriptionId }) => unsubscribe({ subscriptionId });
