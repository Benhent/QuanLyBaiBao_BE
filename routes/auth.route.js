import express from "express";
import { 
  signup, 
  login, 
  logout, 
  verifyEmail, 
  resendVerification, 
  forgotPassword, 
  resetPassword, 
  getCurrentUser 
} from "../controllers/auth.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: Quản lý xác thực người dùng
 */

/**
 * @swagger
 * /api/auth/check-username:
 *   get:
 *     summary: Kiểm tra username đã tồn tại chưa
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: username
 *         schema:
 *           type: string
 *         required: true
 *         description: Username cần kiểm tra
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 */
router.get("/check-username", async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Username là bắt buộc'
      });
    }

    // Kiểm tra username trong cơ sở dữ liệu
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    res.status(200).json({
      success: true,
      available: !data
    });
  } catch (error) {
    console.error('Lỗi kiểm tra username:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Đã xảy ra lỗi khi kiểm tra username'
    });
  }
});

/**
 * @swagger
 * /api/auth/check-email:
 *   get:
 *     summary: Kiểm tra email đã tồn tại chưa
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         required: true
 *         description: Email cần kiểm tra
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 */
router.get("/check-email", async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Email là bắt buộc'
      });
    }

    // Kiểm tra email trong cơ sở dữ liệu
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    res.status(200).json({
      success: true,
      available: !data
    });
  } catch (error) {
    console.error('Lỗi kiểm tra email:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Đã xảy ra lỗi khi kiểm tra email'
    });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Lấy thông tin người dùng hiện tại
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin người dùng
 *       401:
 *         description: Chưa đăng nhập
 */
router.get("/me", verifyToken, getCurrentUser);

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Đăng ký tài khoản mới
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Tên người dùng
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email đăng ký
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu
 *               firstName:
 *                 type: string
 *                 description: Tên
 *               lastName:
 *                 type: string
 *                 description: Họ
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
router.post("/signup", signup);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email của người dùng
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu của người dùng
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *       401:
 *         description: Thông tin đăng nhập không chính xác
 */
router.post("/login", login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Đăng xuất
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 */
router.post("/logout", verifyToken, logout);

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Xác thực email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email cần xác thực
 *               code:
 *                 type: string
 *                 description: Mã xác thực
 *     responses:
 *       200:
 *         description: Email đã được xác thực thành công
 *       400:
 *         description: Mã xác thực không hợp lệ
 */
router.post("/verify-email", verifyEmail);

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Gửi lại mã xác thực
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Mã xác thực mới đã được gửi
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.post("/resend-verification", resendVerification);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Yêu cầu đặt lại mật khẩu
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email cần đặt lại mật khẩu
 *     responses:
 *       200:
 *         description: Email đặt lại mật khẩu đã được gửi
 *       404:
 *         description: Không tìm thấy email
 */
router.post("/forgot-password", forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   post:
 *     summary: Đặt lại mật khẩu
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: Token đặt lại mật khẩu
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu mới
 *     responses:
 *       200:
 *         description: Mật khẩu đã được đặt lại thành công
 *       400:
 *         description: Token không hợp lệ hoặc đã hết hạn
 */
router.post("/reset-password/:token", resetPassword);

export default router;