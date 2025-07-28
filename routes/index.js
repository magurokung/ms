const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/auth');
const Post = require('../models/Post');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { render } = require('ejs');

router.get('/', (req, res) => {
  res.render('index', { user: req.user });
});

function getSteamId(user) {
  return user.steamId || user.steamid || user.id || user._json?.steamid;
}

// Profile route ที่ปรับปรุงแล้ว
router.get('/profile', ensureAuth, async (req, res) => {
  try {
    const steamId = getSteamId(req.user);
    
    if (!steamId) {
      console.error('❌ No Steam ID found in user object:', req.user);
      return res.render('profile', { 
        user: req.user,
        balance: 0,
        error: 'ไม่พบ Steam ID กรุณาล็อกอินใหม่'
      });
    }

    console.log('🔍 Loading profile for steamId:', steamId);
    
    // ดึงข้อมูล user จากฐานข้อมูลเพื่อให้ได้ balance ล่าสุด
    const userData = await User.findOne({ steamId }).lean();
    
    if (!userData) {
      console.error('❌ User not found in database:', steamId);
      return res.render('profile', { 
        user: req.user,
        balance: 0,
        error: 'ไม่พบข้อมูลผู้ใช้ในระบบ'
      });
    }

    console.log('✅ User data found:', {
      steamId: userData.steamId,
      displayName: userData.displayName,
      balance: userData.balance
    });
    
    res.render('profile', { 
      user: req.user,
      userData: userData, // ส่งข้อมูลเต็มจากฐานข้อมูล
      balance: userData.balance || 0,
      error: null
    });
    
  } catch (error) {
    console.error('❌ Error loading profile:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    res.render('profile', { 
      user: req.user,
      userData: null,
      balance: 0,
      error: 'เกิดข้อผิดพลาดในการโหลดข้อมูล'
    });
  }
});

router.get('/admin', ensureAuth, async (req, res) => {
  try {
    const posts = await Post.find({ status: 'pending' }).lean();
    const userCount = await User.countDocuments(); // ✅ นับจำนวนผู้ใช้

    res.render('admin', {
      user: req.user,
      posts,
      userCount // ✅ ส่งไปหน้า view
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

router.get('/posts', ensureAuth, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.render('posts', { user: req.user, posts });
  } catch (err) {
    console.error('Failed to load posts:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/trades', ensureAuth, (req, res) => {
  res.render('trades', { user: req.user });
});

router.get('/how-to', ensureAuth, (req, res) => {
  res.render('how-to', { user: req.user });
});

router.get('/product', ensureAuth, async (req, res) => {
  try {
    const categories = await Category.find().lean();
    const selectedCategory = req.query.category || '';

    let products;

    if (selectedCategory) {
      products = await Product.find({ category: selectedCategory }).lean();
    } else {
      products = await Product.find().lean();
    }

    res.render('product', {
      user: req.user,
      categories,
      products,
      selectedCategory
    });
  } catch (err) {
    console.error('Error loading products:', err);
    res.status(500).send('Error loading products');
  }
});



router.get('/top-up', ensureAuth, (req, res) => {
  res.render('top-up', {
    user: req.user,
    error: null,    // Add this
    success: null   // Add this
  });
});

console.log('ensureAuth is:', ensureAuth);

module.exports = router;
