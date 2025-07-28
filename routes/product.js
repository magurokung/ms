const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const User = require('../models/User');
const Purchase = require('../models/Purchase');
const { ensureAuth } = require('../middleware/auth');

router.get('/products', async (req, res) => {
  try {
    const { category } = req.query;

    let filter = {};
    if (category) {
      filter.category = category;
    }

    const products = await Product.find(filter);
    const categories = await Product.distinct('category'); // ดึง category ทั้งหมด
    const selectedCategory = category || '';

    res.render('product', {
      products,
      categories: categories.map(c => ({ _id: c, name: c })), // ทำให้ใช้กับ select dropdown ได้
      selectedCategory,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาดในการโหลดสินค้า');
  }
});

router.post('/buy/:id', ensureAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.redirect('/products?error=Product not found');
    }

    if (user.balance < product.price) {
      return res.redirect('/products?error=Insufficient balance');
    }

    user.balance -= product.price;
    await user.save();

    const purchase = new Purchase({
      user: user._id,
      product: product._id,
      price: product.price,
    });
    await purchase.save();

    return res.redirect('/products?success=Purchase successful!');
  } catch (err) {
    console.error(err);
    return res.redirect('/products?error=Something went wrong');
  }
});

module.exports = router;
