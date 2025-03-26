import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export const verifyTokenForRole = (req, res, next) => {
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
        message: 'Bạn cần đăng nhập để thực hiện hành động này.'
      });
    }

    // Xác thực token với JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Gán thông tin người dùng vào request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };
    
    next();
  } catch (error) {
    console.error('Lỗi xác thực token:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Token không hợp lệ'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Token đã hết hạn'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Đã xảy ra lỗi khi xác thực'
    });
  }
};

export const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // Kiểm tra xem middleware verifyToken đã chạy chưa
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Bạn cần đăng nhập để thực hiện hành động này.'
      });
    }

    // Chuyển đổi vai trò đơn lẻ thành mảng (nếu cần)
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    // Kiểm tra quyền
    if (!rolesArray.includes(req.user.role)) {
      console.warn(`Người dùng ${req.user.id} bị từ chối quyền truy cập! Vai trò yêu cầu: ${rolesArray.join(', ')}, nhưng vai trò hiện tại: ${req.user.role}`);
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Bạn cần có quyền: ${rolesArray.join(' hoặc ')} để thực hiện hành động này.`
      });
    }

    // Người dùng hợp lệ, tiếp tục
    next();
  };
};

export const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Bạn không có quyền truy cập tài nguyên này'
    });
  }
};

export const hasRole = (roles) => checkRole(roles);

export const isOwner = (getResourceOwnerId) => {
  return async (req, res, next) => {
    try {
      // Kiểm tra xem middleware verifyToken đã chạy chưa
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Bạn cần đăng nhập để thực hiện hành động này.'
        });
      }

      // Lấy ID của chủ sở hữu tài nguyên
      const ownerId = await getResourceOwnerId(req);
      
      // Kiểm tra xem người dùng hiện tại có phải là chủ sở hữu không
      if (req.user.id === ownerId || req.user.role === 'admin') {
        next();
      } else {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Bạn không có quyền thực hiện hành động này'
        });
      }
    } catch (error) {
      console.error('Lỗi khi kiểm tra quyền sở hữu:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Đã xảy ra lỗi khi kiểm tra quyền'
      });
    }
  };
};