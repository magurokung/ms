// services/truemoneyApi.js
require('dotenv').config();

class TrueMoneyAPI {
  constructor() {
    this.baseURL = 'https://ownby4levy.vercel.app/api/redeem';
    this.timeout = 15000;
    this.maxRetries = 2;
  }

  /**
   * เรียก API เพื่อแลกซองอังเปา TrueMoney
   * @param {string} voucherCode - รหัสซองอังเปา
   * @returns {Promise<Object>} ผลลัพธ์จาก API
   */
  async redeemVoucher(voucherCode) {
    if (!process.env.TRUEMONEY_MOBILE) {
      throw new Error('TRUEMONEY_MOBILE environment variable is required');
    }

    const payload = {
      voucherCode: voucherCode,
      mobileNumber: process.env.TRUEMONEY_MOBILE
    };

    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 API call attempt ${attempt + 1}/${this.maxRetries + 1}`);
        
        const response = await fetch(this.baseURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; TopupBot/1.0)'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeout)
        });

        // ตรวจสอบ HTTP status
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
          error.status = response.status;
          error.response = { status: response.status, data: errorData };
          throw error;
        }

        const responseText = await response.text();
        console.log('📝 Raw API Response:', responseText);
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('❌ JSON Parse Error:', parseError.message);
          throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}`);
        }
        
        console.log('🔍 Parsed API Response:', JSON.stringify(data, null, 2));
        
        // ตรวจสอบความถูกต้องของข้อมูล - รองรับหลายรูปแบบ
        if (!data) {
          throw new Error('Empty API response');
        }

        // รองรับทั้ง success: true/false และ status: "success"/"error"
        const isSuccess = data.success === true || 
                         data.status === 'success' || 
                         data.status?.code === 'SUCCESS' ||
                         data.status?.message === 'success' ||
                         data.code === 200 ||
                         (data.data?.voucher?.amount_baht && parseFloat(data.data.voucher.amount_baht) > 0);

        if (!isSuccess) {
          const error = new Error(data.message || data.error || data.status?.message || 'Voucher redemption failed');
          error.apiError = true;
          throw error;
        }

        console.log('✅ API call successful');
        return data;

      } catch (error) {
        lastError = error;
        console.error(`❌ API call attempt ${attempt + 1} failed:`, error.message);
        
        // หาก error ไม่ใช่ network error หรือ timeout ให้หยุด retry
        if (error.apiError || 
            (error.status && error.status < 500) ||
            error.message.includes('Invalid JSON response') ||
            error.message.includes('Empty API response')) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          const delay = 1000 * (attempt + 1); // exponential backoff
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * ตรวจสอบสถานะของ API
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const response = await fetch(this.baseURL, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      console.error('API health check failed:', error.message);
      return false;
    }
  }
}

module.exports = new TrueMoneyAPI();