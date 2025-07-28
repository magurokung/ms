const express = require('express');
const multer = require('multer');
const Post = require('../models/Post');
const Category = require('../models/Category');
const Product = require('../models/Product');
const User = require('../models/User');
const { ensureAdmin } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const uploadPath = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

router.get('/posts', ensureAdmin, async (req, res) => {
  try {
    const posts = await Post.find({ status: 'pending' }).lean();
    res.render('admin', { posts });
  } catch (error) {
    console.error('Error loading pending posts:', error);
    res.status(500).send('เกิดข้อผิดพลาดในการโหลดโพสต์');
  }
});

router.post('/posts/:id/approve', ensureAdmin, async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, { status: 'approved' });
    return res.redirect('/admin');
  } catch (error) {
    console.error('Error approving post:', error);
    return res.status(500).send('เกิดข้อผิดพลาดในการอนุมัติโพสต์');
  }
});

router.post('/posts/:id/reject', ensureAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).send('ไม่พบโพสต์');
    }

    const imagePath = post.imageUrl && post.imageUrl.startsWith('/uploads/')
      ? path.join(__dirname, '..', 'public', post.imageUrl)
      : null;

    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }


    await Post.findByIdAndDelete(req.params.id);

    res.redirect('/admin');
  } catch (error) {
    console.error('Error rejecting post:', error);
    return res.status(500).send('เกิดข้อผิดพลาดในการปฏิเสธโพสต์');
  }
});

router.get('/manage-posts', ensureAdmin, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).lean();
    res.render('manage-posts', { user: req.user, posts });
  } catch (err) {
    console.error('Error loading all posts:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการโหลดโพสต์ทั้งหมด');
  }
});

router.delete('/posts/:id', ensureAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).send('ไม่พบโพสต์');
    }

    const imagePath = post.imageUrl && post.imageUrl.startsWith('/uploads/')
      ? path.join(__dirname, '..', 'public', post.imageUrl)
      : null;

    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    await Post.findByIdAndDelete(req.params.id);

    res.redirect('/admin/manage-posts');
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการลบโพสต์');
  }
});

// Add category
router.post('/category/create', ensureAdmin, async (req, res) => {
  try {
    await Category.create({ name: req.body.name });
    res.redirect('/admin/manage-product');
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการสร้างหมวดหมู่');
  }
});

// Delete category
router.post('/category/delete/:id', ensureAdmin, async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.redirect('/admin/manage-product');
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการลบหมวดหมู่');
  }
});

// Add product
router.post('/product/create', ensureAdmin, upload.single('image'), async (req, res) => {
  try {
    const imageUrl = '/uploads/' + req.file.filename;
    await Product.create({
      name: req.body.name,
      description: req.body.description,
      price: req.body.price,
      category: req.body.category,
      imageUrl
    });
    res.redirect('/admin/manage-product');
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการสร้างสินค้า');
  }
});

// Delete product
router.post('/product/delete/:id', ensureAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).send('ไม่พบสินค้า');
    }

    // Delete associated image file if it exists
    if (product.imageUrl && product.imageUrl.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, '..', 'public', product.imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    res.redirect('/admin/manage-product');
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการลบสินค้า');
  }
});

// Fixed manage-product route with better error handling
router.get('/manage-product', ensureAdmin, async (req, res) => {
  try {
    const categories = await Category.find().lean();
    const products = await Product.find().populate({
      path: 'category',
      select: 'name',
      // This ensures that even if category is null/undefined, the populate won't fail
      options: { strictPopulate: false }
    }).lean();

    // Additional safety check - ensure category exists for each product
    const safeProducts = products.map(product => ({
      ...product,
      category: product.category || { name: 'N/A' }
    }));

    res.render('manage-product', {
      user: req.user,
      categories,
      products: safeProducts
    });
  } catch (err) {
    console.error('Error loading manage-product page:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการโหลดสินค้า');
  }
});

router.get('/user/:id/edit', ensureAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).send('ไม่พบผู้ใช้');

    res.render('edit-user', { user });
  } catch (err) {
    console.error('โหลดข้อมูลผู้ใช้ล้มเหลว:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้');
  }
});

// อัปเดตยอดเงินหรือข้อมูล
router.post('/user/:id/update', ensureAdmin, async (req, res) => {
  try {
    const { displayName, balance } = req.body;

    await User.findByIdAndUpdate(req.params.id, {
      displayName,
      balance: parseFloat(balance)
    });

    res.redirect('/admin/manage-user');
  } catch (err) {
    console.error('อัปเดตข้อมูลผู้ใช้ล้มเหลว:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการอัปเดตผู้ใช้');
  }
});

// ใน routes/admin.js
router.get('/manage-user', ensureAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.render('manage-user', { users, user: req.user });
  } catch (err) {
    console.error('Error loading users:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการโหลดผู้ใช้');
  }
});



module.exports = router;
