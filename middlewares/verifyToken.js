// auth.middleware.js
import jwt from 'jsonwebtoken';
import { supabase } from '../db/connectDB.js';

// JWT Secret key - should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware xác thực token người dùng
export const verifyToken = async (req, res, next) => {
  try {
    let token;

    // Lấy token từ header Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // Nếu không có token trong header, kiểm tra cookie
    if (!token && req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing authorization token'
      });
    }

    // Xác thực token với JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    // Kiểm tra thời gian hết hạn
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp <= currentTime) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    }

    // Truy vấn thông tin chi tiết của người dùng từ database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, username, email, role, status, avatar_url')
      .eq('id', decoded.userId)
      .single();

    if (userError || !userData) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not found or invalid token'
      });
    }

    // Gán thông tin người dùng vào request
    req.user = userData;
    req.token = token;

    next();
  } catch (error) {
    console.error('Lỗi xác thực token:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'An error occurred during authentication'
    });
  }
};

// Middleware làm mới token nếu sắp hết hạn
export const refreshToken = async (req, res, next) => {
  try {
    // Kiểm tra xem có token không
    if (!req.token || !req.user) {
      return next();
    }

    // Giải mã token để kiểm tra thời gian hết hạn
    const decoded = jwt.decode(req.token);
    if (!decoded) {
      return next();
    }

    // Kiểm tra thời gian hết hạn
    const currentTime = Math.floor(Date.now() / 1000);
    const oneHour = 60 * 60; // 1 giờ tính bằng giây
    
    // Nếu token sắp hết hạn (còn dưới 1 giờ)
    if (decoded.exp - currentTime < oneHour) {
      // Import generateTokenAndCookie function
      const generateTokenAndCookie = (await import('./generateTokenAndCookie.js')).default;
      
      // Tạo token mới
      const { token, expiresAt } = generateTokenAndCookie(req.user, res);
      
      // Cập nhật token trong request
      req.token = token;
      
      console.log('Token được làm mới thành công!');
    }

    next();
  } catch (error) {
    console.error('Lỗi khi làm mới token:', error);
    next();
  }
};