const { findById, update } = require('../users/repository');
exports.setNotifPrefs = ({ userId, prefs }) => update(userId, { notifPrefs: prefs });
exports.getNotifPrefs = ({ userId }) => { const u = findById(userId); return u ? (u.notifPrefs||{}) : {}; };
