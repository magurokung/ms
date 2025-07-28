const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
require('dotenv').config();

const app = express();

const adminSteamIds = JSON.parse(process.env.adminSteamIds || '[]');

// connect to MongoDB
const connectDB = require('./config/db');
connectDB();

// view
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

// เพิ่ม middleware สำหรับ parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// session
app.use(session({
  secret: 'secret123',
  resave: false,
  saveUninitialized: false
}));

// passport
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.adminSteamIds = adminSteamIds;
  next();
});

// routes
const indexRoutes = require('./routes/index');
const steamAuthRoutes = require('./auth/steam');
const postRoutes = require('./routes/posts');
const adminRoutes = require('./routes/admin');
const methodOverride = require('method-override');
const topupRoutes = require('./routes/topup');
const productRoutes = require('./routes/product');
const purchaseRoutes = require('./routes/purchase');

app.use(methodOverride('_method'));

app.use('/', indexRoutes);
app.use('/auth', steamAuthRoutes);
app.use('/posts', postRoutes);
app.use('/admin', adminRoutes);
app.use('/top-up', topupRoutes);
app.use('/', productRoutes);
app.use('/', purchaseRoutes);


// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
