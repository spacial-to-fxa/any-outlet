const mongoose = require('mongoose');
module.exports = mongoose.model('Product', new mongoose.Schema({
    name: String,
    description: String,
    realPrice: Number,
    salePrice: Number,
    stock: Number,
    image: String
}));