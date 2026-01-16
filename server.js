require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const promptpay = require('promptpay-qr');

const User = require('./models/User');
const Product = require('./models/Product');
const SiteConfig = require('./models/SiteConfig');

const app = express();

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
}));

app.use(async (req, res, next) => {
    res.locals.user = req.session.user || null;
    let config = await SiteConfig.findOne();
    if (!config) config = await SiteConfig.create({ shopName: "Any Outlet" });
    res.locals.config = config;
    next();
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => cb(null, 'img-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.status(403).send('Access Denied');
};

// Routes
app.get('/', async (req, res) => {
    const products = await Product.find({});
    res.render('index', { products });
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.isVerified) return res.send('<script>alert("User not found or unverified"); window.location="/login"</script>');
    
    if (await bcrypt.compare(password, user.password)) {
        req.session.user = user;
        return res.redirect('/');
    }
    res.send('<script>alert("Wrong password"); window.location="/login"</script>');
});

app.get('/signup', (req, res) => res.render('signup'));

app.post('/signup', async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;
    if (password !== confirmPassword) return res.send('Passwords do not match');
    
    if (await User.findOne({ email })) return res.send('Email already exists');

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await new User({ name, email, password: hashedPassword, otp }).save();

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify Any Outlet',
        text: `OTP: ${otp}`
    });

    req.session.tempEmail = email;
    res.redirect('/verify-otp');
});

app.get('/verify-otp', (req, res) => res.render('verify-otp'));

app.post('/verify-otp', async (req, res) => {
    const user = await User.findOne({ email: req.session.tempEmail });
    if (user && user.otp === req.body.otp) {
        user.isVerified = true;
        user.otp = null;
        await user.save();
        req.session.tempEmail = null;
        return res.redirect('/login');
    }
    res.send('Invalid OTP');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.get('/checkout/:id', isAuthenticated, async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product || product.stock <= 0) return res.send('Out of Stock');
    res.render('checkout', { product });
});

app.post('/process-checkout', isAuthenticated, async (req, res) => {
    const { productId, address, phone } = req.body;
    const product = await Product.findById(productId);
    
    const qrPayload = promptpay(phone, product.salePrice); 
    const qrImage = await QRCode.toDataURL(qrPayload);
    
    product.stock -= 1;
    await product.save();

    res.render('payment', { product, qrImage, address });
});

app.get('/contact', (req, res) => res.render('contact'));

app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
    const users = await User.find({});
    res.render('admin/dashboard', { users });
});

app.post('/admin/product', isAuthenticated, isAdmin, upload.single('image'), async (req, res) => {
    await Product.create({
        name: req.body.name,
        description: req.body.description,
        realPrice: req.body.realPrice,
        salePrice: req.body.salePrice,
        stock: req.body.stock,
        image: req.file ? req.file.filename : ''
    });
    res.redirect('/admin');
});

app.post('/admin/promote/:id', isAuthenticated, isAdmin, async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { role: 'admin' });
    res.redirect('/admin');
});

app.post('/admin/settings', isAuthenticated, isAdmin, async (req, res) => {
    await SiteConfig.findOneAndUpdate({}, req.body, { upsert: true });
    res.redirect('/admin');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));