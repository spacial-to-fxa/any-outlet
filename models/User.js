const mongoose = require('mongoose');
module.exports = mongoose.model('User', new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: 'member' },
    otp: String,
    isVerified: { type: Boolean, default: false }
}));