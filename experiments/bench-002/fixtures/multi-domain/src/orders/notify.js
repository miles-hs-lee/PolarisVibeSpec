const { info } = require('../shared/logger');
function notifyOrderPlaced({ order }) {
  info('order_placed', { orderId: order.id, userId: order.userId, total: order.total });
}
function notifyOrderFulfilled({ order }) {
  info('order_fulfilled', { orderId: order.id, userId: order.userId });
}
module.exports = { notifyOrderPlaced, notifyOrderFulfilled };
