const { checkout } = require('./checkout');
exports.placeOrder = body => checkout(body);
