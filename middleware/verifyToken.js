import { supabase } from '../db/connectDB.js';

// Middleware xác thực token người dùng
export const verifyToken = async (req, res, next) => {
  try {
    // Lấy token từ header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token'
      });
    }

    // Trích xuất token từ chuỗi "Bearer <token>"
    const token = authHeader.split(' ')[1];

    // Xác thực token với Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.warn(`Token không hợp lệ hoặc đã hết hạn!`, error?.message || '');
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

    // Truy vấn thông tin chi tiết của người dùng từ database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, username, email, role, status, avatar_url')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.warn(`Không thể lấy dữ liệu người dùng từ DB:`, userError.message);
    }

    // Kết hợp thông tin từ token và database
    req.user = {
      ...user,
      ...(userData || {}) // Chỉ hợp nhất nếu có dữ liệu
    };

    next();
  } catch (error) {
    console.error('Lỗi xác thực token:', error);
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
    // Lấy token từ session (nếu có)
    let token = req.session?.supabaseToken;
    if (!token) return next(); // Không có token -> bỏ qua

    // Kiểm tra session hiện tại
    const { data: { session }, error } = await supabase.auth.getUser(token);
    if (error || !session) return next(); // Token không hợp lệ -> bỏ qua

    // Kiểm tra thời gian hết hạn
    const expiresAt = new Date(session.expires_at * 1000);
    const now = new Date();
    const oneHour = 60 * 60 * 1000; // 1 giờ

    if (expiresAt - now < oneHour) {
      // Làm mới token nếu sắp hết hạn
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('Token refresh thất bại:', refreshError.message);
      } else {
        // Cập nhật session với token mới
        req.session.supabaseToken = data.session.access_token;
        console.log('Token được làm mới thành công!');
      }
    }

    next();
  } catch (error) {
    console.error('Lỗi khi làm mới token:', error);
    next();
  }
};