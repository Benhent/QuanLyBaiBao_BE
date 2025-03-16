import { supabase } from '../db/connectDB.js';

export const verifyToken = async (req, res, next) => {
  try {
    // Lấy token từ header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized', 
        message: 'Missing or invalid authorization token' 
      });
    }
    
    // trích xuất token
    const token = authHeader.split(' ')[1];
    
    // xác thực token với supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized', 
        message: 'Invalid or expired token' 
      });
    }
    
    // đính kèm thông tin người dùng vào request
    req.user = user;
    
    // lấy thông tin người dùng từ database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, username, email, role, status, avatar_url')
      .eq('id', user.id)
      .single();
    
    if (!userError && userData) {
      // kết hợp dữ liệu người dùng với dữ liệu từ token
      req.user = {
        ...req.user,
        ...userData
      };
    } else if (userError) {
      console.warn('Could not fetch user data:', userError.message);
      // tiếp tục nếu không thể lấy dữ liệu người dùng
    }
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal Server Error', 
      message: 'An error occurred during authentication' 
    });
  }
};

// refresh token nếu cần lưu token lâu dài trong session
export const refreshToken = async (req, res, next) => {
    try {
      let token = req.session.supabaseToken;
      if (!token) {
        return next(); // Không có token -> không cần làm mới
      }
      // Xác thực lại token
      const { data: { session }, error } = await supabase.auth.getUser(token);
      if (error || !session) {
        return next(); // Token không hợp lệ -> để verifyToken xử lý
      }
      // Kiểm tra thời gian hết hạn
      const expiresAt = new Date(session.expires_at * 1000);
      const now = new Date();
      const oneHour = 60 * 60 * 1000; // 1 giờ
      if (expiresAt.getTime() - now.getTime() < oneHour) {
        // Làm mới token nếu sắp hết hạn
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.warn('Token refresh failed:', refreshError.message);
        } else {
          // Cập nhật session với token mới
          req.session.supabaseToken = data.session.access_token;
        }
      }
      next();
    } catch (error) {
      console.error('Token refresh error:', error);
      next();
    }
  };  