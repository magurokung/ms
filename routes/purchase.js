const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/auth');
const Purchase = require('../models/Purchase');

router.get('/purchase/history', ensureAuth, async (req, res) => {
  try {
    const history = await Purchase.find({ user: req.user._id })
      .populate('product')
      .sort({ purchasedAt: -1 });

    res.render('purchase-history', { history });
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

module.exports = router;
