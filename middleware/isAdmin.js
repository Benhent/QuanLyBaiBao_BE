export const isAdmin = (req, res, next) => {
    // Đảm bảo middleware verifyToken đã chạy trước
    if (!req.user) {
      return res.status(401).json({
        error: 'Không có quyền',
        message: 'Yêu cầu xác thực'
      });
    }
  
    // Kiểm tra xem người dùng có vai trò admin không
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Không được phép',
        message: 'Yêu cầu quyền quản trị'
      });
    }
  
    // Người dùng là admin thì tiếp tục xử lý
    next();
  };

  export const hasRole = (roles) => {
    // Chuyển đổi vai trò đơn lẻ thành mảng để xử lý nhất quán
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    return (req, res, next) => {
      // Đảm bảo middleware verifyToken đã chạy trước
      if (!req.user) {
        return res.status(401).json({
          error: 'Không có quyền',
          message: 'Yêu cầu xác thực'
        });
      }
  
      // Kiểm tra xem người dùng có bất kỳ vai trò nào được yêu cầu không
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          error: 'Không đươc phép',
          message: `Yêu cầu quyền: ${allowedRoles.join(' or ')}`
        });
      }
  
      // Người dùng có vai trò được phép, tiếp tục
      next();
    };
  };