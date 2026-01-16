const mongoose = require('mongoose');
module.exports = mongoose.model('SiteConfig', new mongoose.Schema({
    shopName: { type: String, default: 'Any Outlet' },
    address: String,
    phone: String,
    email: String,
    lineId: String
}));