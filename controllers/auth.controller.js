import { supabase } from '../db/connectDB.js';
import { 
    sendVerificationEmail, 
    sendWelcomeEmail, 
    sendPasswordResetEmail, 
    sendResetSuccessEmail 
} from '../email.js';
import { generateVerificationCode } from '../utils/generateVerificationCode.js';
import crypto from 'crypto';

/**
 * Kiểm tra trạng thái xác thực của người dùng
 */
export const checkAuth = async (req, res) => {
    try {
        // Middleware verifyToken đã xác thực và thêm thông tin người dùng vào req.user
        res.status(200).json({
            success: true,
            message: "Authenticated",
            data: {
                user: req.user
            }
        });
    } catch (error) {
        console.error('Lỗi kiểm tra xác thực:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi kiểm tra xác thực'
        });
    }
};

/**
 * Đăng ký người dùng mới
 */
export const signup = async (req, res) => {
    try {
        const { username, email, password, firstName, lastName } = req.body;

        // Kiểm tra dữ liệu đầu vào
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Username, email và password là bắt buộc'
            });
        }

        // Kiểm tra username đã tồn tại chưa
        const { data: existingUser, error: userCheckError } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .single();

        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'Conflict',
                message: 'Username đã tồn tại'
            });
        }

        // Tạo mã xác thực
        const { code, expiry } = generateVerificationCode();
        
        // Đăng ký người dùng với Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username,
                    verification_code: code,
                    verification_expiry: expiry,
                    is_verified: false
                }
            }
        });

        if (authError) {
            return res.status(400).json({
                success: false,
                error: authError.message,
                message: 'Đăng ký thất bại'
            });
        }

        // Tạo bản ghi trong bảng users
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert([
                {
                    id: authData.user.id,
                    username,
                    email,
                    role: 'user',
                    status: 'offline'
                }
            ])
            .select()
            .single();

        if (userError) {
            return res.status(400).json({
                success: false,
                error: userError.message,
                message: 'Tạo thông tin người dùng thất bại'
            });
        }

        // Tạo thông tin bổ sung trong bảng user_info
        if (firstName || lastName) {
            const { error: infoError } = await supabase
                .from('user_info')
                .insert([
                    {
                        user_id: authData.user.id,
                        first_name: firstName || '',
                        last_name: lastName || ''
                    }
                ]);

            if (infoError) {
                console.error('Lỗi khi tạo thông tin bổ sung:', infoError);
            }
        }

        // Gửi email xác thực
        try {
            await sendVerificationEmail(email, code);
        } catch (emailError) {
            console.error('Lỗi gửi email xác thực:', emailError);
            // Tiếp tục xử lý ngay cả khi gửi email thất bại
        }

        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công, vui lòng kiểm tra email để xác thực tài khoản',
            data: {
                id: userData.id,
                username: userData.username,
                email: userData.email,
                role: userData.role
            }
        });
    } catch (error) {
        console.error('Lỗi đăng ký:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi đăng ký'
        });
    }
};

/**
 * Xác thực email
 */
export const verifyEmail = async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Email và mã xác thực là bắt buộc'
            });
        }

        // Lấy thông tin người dùng từ Supabase Auth
        const { data: { user }, error: getUserError } = await supabase.auth.admin.getUserByEmail(email);
        
        if (getUserError || !user) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Không tìm thấy người dùng với email này'
            });
        }

        // Kiểm tra mã xác thực
        if (user.user_metadata.verification_code !== code) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Mã xác thực không hợp lệ'
            });
        }

        // Kiểm tra thời gian hết hạn
        const expiry = user.user_metadata.verification_expiry;
        if (expiry && Date.now() > expiry) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Mã xác thực đã hết hạn'
            });
        }

        // Cập nhật trạng thái xác thực
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            user.id,
            { 
                user_metadata: { 
                    ...user.user_metadata,
                    is_verified: true, 
                    verification_code: null,
                    verification_expiry: null 
                } 
            }
        );

        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Không thể cập nhật trạng thái xác thực'
            });
        }

        // Gửi email chào mừng
        try {
            const dashboardURL = process.env.CLIENT_URL || 'https://your-frontend-app.com/dashboard';
            await sendWelcomeEmail(email, user.user_metadata.username || 'User', dashboardURL);
        } catch (emailError) {
            console.error('Lỗi gửi email chào mừng:', emailError);
            // Tiếp tục xử lý ngay cả khi gửi email thất bại
        }

        res.status(200).json({
            success: true,
            message: 'Email đã được xác thực thành công'
        });
    } catch (error) {
        console.error('Lỗi xác thực email:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi xác thực email'
        });
    }
};

/**
 * Gửi lại mã xác thực
 */
export const resendVerification = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Email là bắt buộc'
            });
        }

        // Lấy thông tin người dùng từ Supabase Auth
        const { data: { user }, error: getUserError } = await supabase.auth.admin.getUserByEmail(email);
        
        if (getUserError || !user) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Không tìm thấy người dùng với email này'
            });
        }

        // Kiểm tra xem người dùng đã xác thực chưa
        if (user.user_metadata.is_verified) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Tài khoản đã được xác thực'
            });
        }

        // Tạo mã xác thực mới
        const { code, expiry } = generateVerificationCode();

        // Cập nhật mã xác thực mới
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            user.id,
            { 
                user_metadata: { 
                    ...user.user_metadata, 
                    verification_code: code,
                    verification_expiry: expiry
                } 
            }
        );

        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Không thể cập nhật mã xác thực'
            });
        }

        // Gửi email xác thực mới
        try {
            await sendVerificationEmail(email, code);
        } catch (emailError) {
            console.error('Lỗi gửi email xác thực:', emailError);
            return res.status(500).json({
                success: false,
                error: 'Email Error',
                message: 'Không thể gửi email xác thực'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Mã xác thực mới đã được gửi đến email của bạn'
        });
    } catch (error) {
        console.error('Lỗi gửi lại mã xác thực:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi gửi lại mã xác thực'
        });
    }
};

/**
 * Đăng nhập
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Kiểm tra dữ liệu đầu vào
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Email và password là bắt buộc'
            });
        }

        // Đăng nhập với Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return res.status(401).json({
                success: false,
                error: error.message,
                message: 'Đăng nhập thất bại'
            });
        }

        // Kiểm tra xem tài khoản đã được xác thực chưa
        if (data.user.user_metadata && data.user.user_metadata.is_verified === false) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Tài khoản chưa được xác thực, vui lòng kiểm tra email'
            });
        }

        // Cập nhật trạng thái người dùng
        await supabase
            .from('users')
            .update({ status: 'online' })
            .eq('id', data.user.id);

        // Lấy thông tin người dùng
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, username, email, role, status, avatar_url')
            .eq('id', data.user.id)
            .single();

        if (userError) {
            console.error('Lỗi khi lấy thông tin người dùng:', userError);
        }

        res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                user: userData || {
                    id: data.user.id,
                    email: data.user.email
                },
                session: {
                    access_token: data.session.access_token,
                    expires_at: data.session.expires_at
                }
            }
        });
    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi đăng nhập'
        });
    }
};

/**
 * Đăng xuất
 */
export const logout = async (req, res) => {
    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message,
                message: 'Đăng xuất thất bại'
            });
        }

        // Nếu có thông tin người dùng, cập nhật trạng thái
        if (req.user && req.user.id) {
            await supabase
                .from('users')
                .update({ status: 'offline' })
                .eq('id', req.user.id);
        }

        res.status(200).json({
            success: true,
            message: 'Đăng xuất thành công'
        });
    } catch (error) {
        console.error('Lỗi đăng xuất:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi đăng xuất'
        });
    }
};

/**
 * Yêu cầu đặt lại mật khẩu
 */
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Email là bắt buộc'
            });
        }

        // Kiểm tra xem email có tồn tại không
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (userError || !userData) {
            // Không thông báo cụ thể để tránh lộ thông tin
            return res.status(200).json({
                success: true,
                message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi'
            });
        }

        // Tạo token đặt lại mật khẩu
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 giờ

        // Lưu token vào cơ sở dữ liệu
        const { error: tokenError } = await supabase
            .from('password_resets')
            .insert([
                {
                    user_id: userData.id,
                    token: resetToken,
                    expires_at: new Date(resetTokenExpiry).toISOString()
                }
            ]);

        if (tokenError) {
            console.error('Lỗi lưu token đặt lại mật khẩu:', tokenError);
            return res.status(500).json({
                success: false,
                error: 'Database Error',
                message: 'Không thể tạo yêu cầu đặt lại mật khẩu'
            });
        }

        // Tạo URL đặt lại mật khẩu
        const resetURL = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

        // Gửi email đặt lại mật khẩu
        try {
            await sendPasswordResetEmail(email, resetURL);
        } catch (emailError) {
            console.error('Lỗi gửi email đặt lại mật khẩu:', emailError);
            // Tiếp tục xử lý ngay cả khi gửi email thất bại
        }

        res.status(200).json({
            success: true,
            message: 'Email đặt lại mật khẩu đã được gửi'
        });
    } catch (error) {
        console.error('Lỗi yêu cầu đặt lại mật khẩu:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi yêu cầu đặt lại mật khẩu'
        });
    }
};

/**
 * Đặt lại mật khẩu
 */
export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Token và mật khẩu mới là bắt buộc'
            });
        }

        // Kiểm tra độ dài mật khẩu
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Mật khẩu phải có ít nhất 8 ký tự'
            });
        }

        // Tìm token trong cơ sở dữ liệu
        const { data: resetData, error: resetError } = await supabase
            .from('password_resets')
            .select('user_id, expires_at')
            .eq('token', token)
            .single();

        if (resetError || !resetData) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Token không hợp lệ hoặc đã hết hạn'
            });
        }

        // Kiểm tra thời gian hết hạn
        const expiryDate = new Date(resetData.expires_at);
        if (expiryDate < new Date()) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Token đã hết hạn'
            });
        }

        // Lấy thông tin người dùng
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('email')
            .eq('id', resetData.user_id)
            .single();

        if (userError || !userData) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Không tìm thấy người dùng'
            });
        }

        // Đặt lại mật khẩu với Supabase Auth
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            resetData.user_id,
            { password }
        );

        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Không thể đặt lại mật khẩu'
            });
        }

        // Xóa token đã sử dụng
        await supabase
            .from('password_resets')
            .delete()
            .eq('token', token);

        // Gửi email xác nhận đặt lại mật khẩu thành công
        try {
            await sendResetSuccessEmail(userData.email);
        } catch (emailError) {
            console.error('Lỗi gửi email xác nhận đặt lại mật khẩu:', emailError);
            // Tiếp tục xử lý ngay cả khi gửi email thất bại
        }

        res.status(200).json({
            success: true,
            message: 'Mật khẩu đã được đặt lại thành công'
        });
    } catch (error) {
        console.error('Lỗi đặt lại mật khẩu:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi đặt lại mật khẩu'
        });
    }
};

/**
 * Lấy thông tin người dùng hiện tại
 */
export const getCurrentUser = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Không có thông tin xác thực'
            });
        }

        // Lấy thông tin chi tiết từ cơ sở dữ liệu
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select(`
                id, username, email, role, status, avatar_url,
                user_info (
                    first_name, last_name, birthday, gender, follower_count, following_count
                )
            `)
            .eq('id', req.user.id)
            .single();

        if (userError) {
            return res.status(400).json({
                success: false,
                error: userError.message,
                message: 'Không thể lấy thông tin người dùng'
            });
        }

        res.status(200).json({
            success: true,
            data: userData
        });
    } catch (error) {
        console.error('Lỗi lấy thông tin người dùng:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi lấy thông tin người dùng'
        });
    }
};