export const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // Kiểm tra xem middleware verifyToken đã chạy chưa
    if (!req.user) {
      return res.status(401).json({
        error: 'Không có quyền',
        message: 'Bạn cần đăng nhập để thực hiện hành động này.'
      });
    }

    // Chuyển đổi vai trò đơn lẻ thành mảng (nếu cần)
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    // Kiểm tra quyền
    if (!rolesArray.includes(req.user.role)) {
      console.warn(`Người dùng ${req.user.id} bị từ chối quyền truy cập! Vai trò yêu cầu: ${rolesArray.join(', ')}, nhưng vai trò hiện tại: ${req.user.role}`);
      return res.status(403).json({
        error: 'Không được phép',
        message: `Bạn cần có quyền: ${rolesArray.join(' hoặc ')} để thực hiện hành động này.`
      });
    }

    // Người dùng hợp lệ, tiếp tục
    next();
  };
};

// Middleware dành riêng cho admin
export const isAdmin = checkRole('admin');

// Middleware kiểm tra nhiều vai trò
export const hasRole = (roles) => checkRole(roles);