// services/topupService.js
const User = require('../models/User');
const TopupLog = require('../models/TopupLog');
const truemoneyApi = require('./truemoneyApi');

class TopupService {
  /**
   * ฟังก์ชันสำหรับแยก voucher hash จาก URL
   * @param {string} link - ลิงก์ซองอังเปา
   * @returns {string} voucher hash
   */
  extractVoucherHash(link) {
    try {
      // รองรับหลายรูปแบบ URL
      const patterns = [
        /v=([a-zA-Z0-9]+)/,  // ?v=hash
        /\/([a-zA-Z0-9]+)$/,  // /hash
        /gift\.truemoney\.com\/campaign\/\?v=([a-zA-Z0-9]+)/
      ];
      
      for (const pattern of patterns) {
        const match = link.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }
      
      throw new Error('รูปแบบลิงก์ไม่ถูกต้อง');
    } catch (error) {
      throw new Error('รูปแบบลิงก์ไม่ถูกต้อง');
    }
  }

  /**
   * ตรวจสอบว่าซองอังเปาถูกใช้ไปแล้วหรือยัง
   * @param {string} voucherHash - รหัสซองอังเปา
   * @returns {Promise<boolean>}
   */
  async isVoucherUsed(voucherHash) {
    const existingLog = await TopupLog.findOne({ voucherHash });
    return !!existingLog;
  }

  /**
   * ตรวจสอบความถูกต้องของจำนวนเงิน
   * @param {number} amount - จำนวนเงิน
   * @returns {boolean}
   */
  validateAmount(amount) {
    const numAmount = parseFloat(amount);
    return numAmount > 0 && numAmount <= 50000;
  }

  /**
   * เติมเงินให้ผู้ใช้
   * @param {string} steamId - Steam ID ของผู้ใช้
   * @param {string} link - ลิงก์ซองอังเปา
   * @returns {Promise<Object>} ผลลัพธ์การเติมเงิน
   */
  async processTopup(steamId, link) {
    let voucherHash;
    
    console.log('🔍 Processing topup for steamId:', steamId);
    
    try {
      // แยก voucher hash จากลิงก์
      voucherHash = this.extractVoucherHash(link);
      const fullVoucherUrl = `https://gift.truemoney.com/campaign/?v=${voucherHash}`;

      // ตรวจสอบ user ก่อน - ใช้ steamId ที่ถูกต้อง
      const user = await User.findOne({ steamId: steamId });
      if (!user) {
        console.error('❌ User not found with steamId:', steamId);
        throw new Error('ไม่พบผู้ใช้ในระบบ กรุณาล็อกอินใหม่');
      }
      
      console.log('✅ User found:', { 
        _id: user._id, 
        steamId: user.steamId, 
        displayName: user.displayName,
        currentBalance: user.balance 
      });

      // ตรวจสอบว่าเคยใช้ไปแล้วหรือยัง
      const isUsed = await this.isVoucherUsed(voucherHash);
      if (isUsed) {
        throw new Error('ลิงก์นี้ถูกใช้งานไปแล้ว');
      }

      console.log('🔁 Processing voucher:', voucherHash);

      // เรียก API เพื่อแลกซองอังเปา
      const apiResult = await truemoneyApi.redeemVoucher(fullVoucherUrl);
      
      console.log('🔍 Final API Result:', JSON.stringify(apiResult, null, 2));
      
      // ตรวจสอบสถานะสำเร็จ
      const statusCode = apiResult.status?.code;
      const statusMessage = apiResult.status?.message;
      const hasVoucherData = apiResult.data?.voucher?.amount_baht;
      
      console.log('🔍 Status Check:', { statusCode, statusMessage, hasVoucherData });
      
      const isSuccess = statusCode === 'SUCCESS' || statusMessage === 'success';
      
      console.log('✅ Is Success:', isSuccess);
      
      if (!isSuccess) {
        throw new Error(apiResult.message || apiResult.error || statusMessage || 'ไม่สามารถเติมเงินได้');
      }

      // รองรับหลายชื่อฟิลด์
      const amount = parseFloat(
        apiResult.data?.voucher?.amount_baht ||
        apiResult.data?.voucher?.redeemed_amount_baht ||
        apiResult.data?.my_ticket?.amount_baht ||
        apiResult.amount_bath || 
        apiResult.amount || 
        apiResult.value || 
        apiResult.money ||
        apiResult.data?.amount_bath ||
        apiResult.data?.amount
      ) || 0;
      
      console.log('💰 Amount extracted:', amount);
      
      // ตรวจสอบจำนวนเงิน
      if (!this.validateAmount(amount)) {
        throw new Error('จำนวนเงินไม่ถูกต้อง');
      }

      // ใช้ transaction เพื่อความปลอดภัย
      const session = await User.startSession();
      
      try {
        await session.withTransaction(async () => {
          // เพิ่มเงินให้ผู้ใช้ - ใช้ steamId แทน _id
          const updateResult = await User.updateOne(
            { steamId: steamId }, 
            { $inc: { balance: amount } }
          ).session(session);
          
          console.log('📊 Update result:', updateResult);
          
          if (updateResult.matchedCount === 0) {
            throw new Error('ไม่พบผู้ใช้ในระบบเมื่ออัพเดทยอดเงิน');
          }

          // บันทึก log สำเร็จ - ใช้ steamId ที่ถูกต้อง
          const logEntry = {
            steamId: steamId, // ใช้ steamId ที่แท้จริง ไม่ใช่ MongoDB _id
            voucherHash,
            amount,
            date: new Date() // ใช้ date ตาม model
          };
          
          console.log('📝 Creating log entry:', logEntry);
          
          await TopupLog.create([logEntry], { session });
        });
      } finally {
        await session.endSession();
      }

      console.log(`✅ เติมเงินสำเร็จ: ${amount} บาท สำหรับผู้ใช้ ${steamId}`);

      // ดึงยอดเงินใหม่หลังอัพเดท
      const updatedUser = await User.findOne({ steamId: steamId });
      
      return {
        success: true,
        amount,
        newBalance: updatedUser?.balance || 0,
        message: `เติมเงินสำเร็จ ${amount.toLocaleString()} บาท (ยอดเงินปัจจุบัน: ${updatedUser?.balance?.toLocaleString() || 0} บาท)`
      };

    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาด:', error.message);
      console.error('❌ Error stack:', error.stack);

      // บันทึก failed log - ใช้ steamId ที่ถูกต้อง
      try {
        const failedLogEntry = {
          steamId: steamId, // ใช้ steamId ที่แท้จริง
          voucherHash: voucherHash || 'unknown',
          amount: 0,
          date: new Date(),
          error: error.message
        };
        
        console.log('📝 Creating failed log entry:', failedLogEntry);
        await TopupLog.create(failedLogEntry);
      } catch (logError) {
        console.error('❌ Failed to log error:', logError.message);
      }

      // จัดการข้อความ error
      let message = 'เกิดข้อผิดพลาดในการเติมเงิน';
      
      if (error.status === 400) {
        message = 'ลิงก์ไม่ถูกต้องหรือใช้งานไปแล้ว';
      } else if (error.status === 404) {
        message = 'ไม่พบซองอังเปาที่ระบุ';
      } else if (error.status && error.status >= 500) {
        message = 'เซิร์ฟเวอร์ TrueMoney ขัดข้อง กรุณาลองใหม่ภายหลัง';
      } else if (error.response?.data?.message) {
        message = error.response.data.message;
      } else if (error.message === 'รูปแบบลิงก์ไม่ถูกต้อง') {
        message = 'รูปแบบลิงก์ไม่ถูกต้อง กรุณาตรวจสอบลิงก์อีกครั้ง';
      } else if (error.name === 'TimeoutError' || error.code === 'ETIMEDOUT') {
        message = 'หมดเวลาเชื่อมต่อ กรุณาลองใหม่ภายหลัง';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        message = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่ภายหลัง';
      } else if (error.message) {
        message = error.message;
      }

      return {
        success: false,
        message
      };
    }
  }

  /**
   * ดึงประวัติการเติมเงิน
   * @param {string} steamId - Steam ID ของผู้ใช้
   * @param {number} limit - จำนวนรายการที่ต้องการ
   * @returns {Promise<Array>} รายการประวัติ
   */
  async getTopupHistory(steamId, limit = 10) {
    try {
      console.log('📊 Getting topup history for steamId:', steamId);
      
      const history = await TopupLog.find({ steamId: steamId }) // ใช้ steamId ที่ถูกต้อง
        .sort({ date: -1 })
        .limit(limit)
        .select('amount date voucherHash error -_id')
        .lean();
        
      console.log('📊 Found topup history:', history.length, 'records');
      
      return history;
    } catch (error) {
      console.error('❌ Error getting topup history:', error.message);
      return [];
    }
  }

  /**
   * ดึงสถิติการเติมเงิน
   * @param {string} steamId - Steam ID ของผู้ใช้
   * @returns {Promise<Object>} สถิติ
   */
  async getTopupStats(steamId) {
    try {
      const stats = await TopupLog.aggregate([
        { $match: { steamId: steamId, amount: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalTransactions: { $sum: 1 },
            averageAmount: { $avg: '$amount' },
            lastTopup: { $max: '$date' }
          }
        }
      ]);

      return stats[0] || {
        totalAmount: 0,
        totalTransactions: 0,
        averageAmount: 0,
        lastTopup: null
      };
    } catch (error) {
      console.error('❌ Error getting topup stats:', error.message);
      return {
        totalAmount: 0,
        totalTransactions: 0,
        averageAmount: 0,
        lastTopup: null
      };
    }
  }
}

module.exports = new TopupService();