// routes/topup.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const topupService = require('../services/topupService');

// ตรวจสอบว่าผู้ใช้ล็อกอินผ่าน Steam หรือยัง
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect('/login');
}

// Helper function to get Steam ID from user object
function getSteamId(user) {
  // รองรับหลายรูปแบบ Steam ID field
  return user.steamId || user.steamid || user.id || user._json?.steamid;
}

// Validation middleware
const validateVoucherLink = [
  body('link')
    .notEmpty()
    .withMessage('กรุณากรอกลิงก์ซองอังเปา')
    .matches(/truemoney\.com/)
    .withMessage('กรุณากรอกลิงก์ TrueMoney ที่ถูกต้อง')
];

// POST route สำหรับแลกซองอังเปา
router.post('/redeem', isAuthenticated, validateVoucherLink, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('top-up', { 
      user: req.user,
      error: errors.array()[0].msg, 
      success: null 
    });
  }

  const { link } = req.body;
  const steamId = getSteamId(req.user);

  // Debug log
  console.log('🔍 Route - User object:', {
    steamId: req.user.steamId,
    steamid: req.user.steamid,
    id: req.user.id,
    _id: req.user._id,
    displayName: req.user.displayName
  });
  console.log('🔍 Route - Extracted steamId:', steamId);

  if (!steamId) {
    console.error('❌ No Steam ID found in user object');
    return res.render('top-up', {
      user: req.user,
      error: 'ไม่พบ Steam ID กรุณาล็อกอินใหม่',
      success: null
    });
  }

  try {
    // เรียกใช้ topup service
    const result = await topupService.processTopup(steamId, link);

    if (result.success) {
      return res.render('top-up', {
        user: req.user,
        success: result.message,
        error: null,
        newBalance: result.newBalance
      });
    } else {
      return res.render('top-up', {
        user: req.user,
        error: result.message,
        success: null
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error in topup route:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    return res.render('top-up', {
      user: req.user,
      error: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่ภายหลัง',
      success: null
    });
  }
});

// GET route สำหรับแสดงหน้า top-up
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const steamId = getSteamId(req.user);
    
    if (!steamId) {
      console.error('❌ No Steam ID found for getting topup page');
      return res.render('top-up', {
        user: req.user,
        error: 'ไม่พบ Steam ID กรุณาล็อกอินใหม่',
        success: null,
        recentTopups: []
      });
    }
    
    // ดึงประวัติการเติมเงิน
    const recentTopups = await topupService.getTopupHistory(steamId, 10);

    res.render('top-up', {
      user: req.user,
      error: null,
      success: null,
      recentTopups
    });
  } catch (error) {
    console.error('❌ Error loading top-up page:', error.message);
    res.render('top-up', {
      user: req.user,
      error: null,
      success: null,
      recentTopups: []
    });
  }
});

// GET route สำหรับดูประวัติการเติมเงิน (JSON API)
router.get('/history', isAuthenticated, async (req, res) => {
  try {
    const steamId = getSteamId(req.user);
    
    if (!steamId) {
      return res.status(400).json({
        success: false,
        message: 'ไม่พบ Steam ID'
      });
    }
    
    const limit = parseInt(req.query.limit) || 20;
    
    const history = await topupService.getTopupHistory(steamId, limit);
    const stats = await topupService.getTopupStats(steamId);
    
    res.json({
      success: true,
      data: {
        history,
        stats
      }
    });
  } catch (error) {
    console.error('❌ Error getting topup history:', error.message);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงประวัติ'
    });
  }
});

// GET route สำหรับดูสถิติการเติมเงิน
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const steamId = getSteamId(req.user);
    
    if (!steamId) {
      return res.status(400).json({
        success: false,
        message: 'ไม่พบ Steam ID'
      });
    }
    
    const stats = await topupService.getTopupStats(steamId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error getting topup stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงสถิติ'
    });
  }
});

module.exports = router;