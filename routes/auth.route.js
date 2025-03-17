import express from "express";
import { 
    signup,
    verifyEmail,
    resendVerification,
    login,
    logout,
    forgotPassword,
    resetPassword,
    checkAuth,
    getCurrentUser
} from "../controllers/auth.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { isAdmin } from "../middleware/isAdmin.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: API quản lý xác thực người dùng
 */

/**
 * @swagger
 * /api/auth/check-auth:
 *   get:
 *     summary: Kiểm tra trạng thái xác thực
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Người dùng đã xác thực
 *       401:
 *         description: Chưa xác thực
 */
router.get("/check-auth", verifyToken, checkAuth);

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
        
        const { data, error } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .single();
            
        const available = !data;
        
        res.status(200).json({
            success: true,
            data: { available }
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
        
        const { data, error } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();
            
        const available = !data;
        
        res.status(200).json({
            success: true,
            data: { available }
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
 *     parameters:
 *       - in: query
 *         name: username
 *         schema:
 *           type: string
 *         required: true
 *         description: Tên người dùng
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         required: true
 *         description: Email đăng ký
 *       - in: query
 *         name: password
 *         schema:
 *           type: string
 *           format: password
 *         required: true
 *         description: Mật khẩu
 *       - in: query
 *         name: firstName
 *         schema:
 *           type: string
 *         description: Tên
 *       - in: query
 *         name: lastName
 *         schema:
 *           type: string
 *         description: Họ
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
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         required: true
 *         description: Email của người dùng
 *       - in: query
 *         name: password
 *         schema:
 *           type: string
 *           format: password
 *         required: true
 *         description: Mật khẩu của người dùng
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
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         required: true
 *         description: Email cần xác thực
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: Mã xác thực
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
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         required: true
 *         description: Email cần đặt lại mật khẩu
 *     responses:
 *       200:
 *         description: Email đặt lại mật khẩu đã được gửi
 *       404:
 *         description: Không tìm thấy email
 */
router.post("/forgot-password", forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: Token đặt lại mật khẩu
 *       - in: query
 *         name: password
 *         schema:
 *           type: string
 *           format: password
 *         required: true
 *         description: Mật khẩu mới
 *     responses:
 *       200:
 *         description: Mật khẩu đã được đặt lại thành công
 *       400:
 *         description: Token không hợp lệ hoặc đã hết hạn
 */
router.post("/reset-password/:token", resetPassword);

export default router;