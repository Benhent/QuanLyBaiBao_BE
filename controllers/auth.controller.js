import { supabase } from '../db/connectDB.js';
import { 
    sendVerificationEmail, 
    sendPasswordResetEmail, 
} from '../mail/email.js';
import { generateVerificationCode } from '../utils/generateVerificationCode.js';
import generateTokenAndCookie from '../utils/generateTokenAndCookies.js';
import bcryptjs from 'bcryptjs';

// Số vòng băm cho bcryptjs
const SALT_ROUNDS = 10;

// kiểm tra xác thực
export const checkAuth = async (req, res) => {
    try {
        // Middleware verifyTokenForRole đã xác thực và thêm thông tin người dùng vào req.user
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

// đăng kí
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

        // Kiểm tra email đã tồn tại chưa
        const { data: existingEmail, error: emailCheckError } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (existingEmail) {
            return res.status(409).json({
                success: false,
                error: 'Conflict',
                message: 'Email đã tồn tại'
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

        // Tạo mã xác thực sử dụng hàm có sẵn
        const { code, expiry } = generateVerificationCode();
        
        // Mã hóa mật khẩu trước khi lưu vào database
        const hashedPassword = await bcryptjs.hash(password, SALT_ROUNDS);

        // Tạo bản ghi trong bảng users
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert([
                {
                    username,
                    email,
                    password: hashedPassword, // Lưu mật khẩu đã mã hóa
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

        // Lưu mã xác thực vào bảng verification_codes
        const { error: verificationError } = await supabase
            .from('verification_codes')
            .insert([
                {
                    user_id: userData.id,
                    code: code,
                    type: 'email_verification',
                    expires_at: Math.floor(expiry / 1000), // Chuyển từ milliseconds sang seconds
                    used: false
                }
            ]);

        if (verificationError) {
            console.error('Lỗi lưu mã xác thực:', verificationError);
        }

        // Tạo thông tin bổ sung trong bảng user_info
        if (firstName || lastName) {
            const { error: infoError } = await supabase
                .from('user_info')
                .insert([
                    {
                        user_id: userData.id,
                        first_name: firstName || '',
                        last_name: lastName || ''
                    }
                ]);

            if (infoError) {
                console.error('Lỗi khi tạo thông tin bổ sung:', infoError);
            }
        }

        // Gửi email xác thực qua Mailtrap
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

// xác thực email
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

        // Lấy thông tin người dùng từ bảng users
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, username')
            .eq('email', email)
            .single();
        
        if (userError || !userData) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Không tìm thấy người dùng với email này'
            });
        }

        // Kiểm tra mã xác thực từ bảng verification_codes
        const { data: verificationData, error: verificationError } = await supabase
            .from('verification_codes')
            .select('*')
            .eq('user_id', userData.id)
            .eq('code', code)
            .eq('type', 'email_verification')
            .eq('used', false)
            .single();

        if (verificationError || !verificationData) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Mã xác thực không hợp lệ'
            });
        }

        // Kiểm tra thời gian hết hạn (Unix timestamp)
        const currentTime = Math.floor(Date.now() / 1000);
        if (verificationData.expires_at < currentTime) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Mã xác thực đã hết hạn'
            });
        }

        // Đánh dấu mã xác thực đã được sử dụng
        await supabase
            .from('verification_codes')
            .update({ 
                used: true,
                used_at: Math.floor(Date.now() / 1000) // Unix timestamp
            })
            .eq('id', verificationData.id);
        

        res.status(200).json({
            success: true,
            message: 'Xác thực email thành công'
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

// Gửi lại mã xác thực
export const resendVerificationCode = async (req, res) => {
    try {
        const { email, type = 'email_verification' } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Email là bắt buộc'
            });
        }

        // Kiểm tra loại mã xác thực hợp lệ
        if (!['email_verification', 'password_reset'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Loại mã xác thực không hợp lệ'
            });
        }

        // Lấy thông tin người dùng từ bảng users
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, username')
            .eq('email', email)
            .single();
        
        if (userError || !userData) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Không tìm thấy người dùng với email này'
            });
        }

        // Tạo mã xác thực mới
        const { code, expiry } = generateVerificationCode();

        // Xóa mã xác thực cũ nếu có
        await supabase
            .from('verification_codes')
            .delete()
            .eq('user_id', userData.id)
            .eq('type', type);

        // Lưu mã xác thực mới vào bảng verification_codes
        const { error: verificationError } = await supabase
            .from('verification_codes')
            .insert([
                {
                    user_id: userData.id,
                    code: code,
                    type: type,
                    expires_at: Math.floor(expiry / 1000), // Chuyển từ milliseconds sang seconds
                    used: false
                }
            ]);

        if (verificationError) {
            console.error('Lỗi lưu mã xác thực:', verificationError);
            return res.status(500).json({
                success: false,
                error: 'Database Error',
                message: 'Không thể tạo mã xác thực mới'
            });
        }

        // Gửi email dựa vào loại mã xác thực
        try {
            if (type === 'email_verification') {
                await sendVerificationEmail(email, code);
            } else if (type === 'password_reset') {
                const resetURL = `${process.env.CLIENT_URL}/reset-password/${code}`;
                await sendPasswordResetEmail(email, resetURL);
            }
        } catch (emailError) {
            console.error('Lỗi gửi email:', emailError);
            return res.status(500).json({
                success: false,
                error: 'Email Error',
                message: 'Không thể gửi email'
            });
        }

        res.status(200).json({
            success: true,
            message: `Mã xác thực mới đã được gửi đến ${email}`
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

// đăng nhập
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

        // Lấy thông tin người dùng từ bảng users dựa trên email
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, username, email, password, role, status, avatar_url')
            .eq('email', email)
            .single();

        if (userError || !userData) {
            return res.status(401).json({
                success: false,
                error: 'Invalid login credentials',
                message: 'Đăng nhập thất bại'
            });
        }

        // Kiểm tra xem tài khoản đã được xác thực chưa bằng cách kiểm tra verification_codes
        const { data: verificationData, error: verificationError } = await supabase
            .from('verification_codes')
            .select('*')
            .eq('user_id', userData.id)
            .eq('type', 'email_verification')
            .eq('used', true)
            .single();

        // Nếu không tìm thấy mã xác thực đã sử dụng, tài khoản chưa được xác thực
        if (verificationError && !verificationData) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Tài khoản chưa được xác thực, vui lòng kiểm tra email'
            });
        }

        // So sánh mật khẩu được nhập với mật khẩu đã được mã hóa
        const isPasswordValid = await bcryptjs.compare(password, userData.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid login credentials',
                message: 'Đăng nhập thất bại'
            });
        }

        // Cập nhật trạng thái người dùng thành online
        await supabase
            .from('users')
            .update({ status: 'online' })
            .eq('id', userData.id);

        // Tạo JWT token và cookie
        const { token, expiresAt } = generateTokenAndCookie(userData, res);

        // Trả về thông tin người dùng và token
        res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                user: {
                    id: userData.id,
                    username: userData.username,
                    email: userData.email,
                    role: userData.role,
                    status: 'online',
                    avatar_url: userData.avatar_url
                },
                session: {
                    access_token: token,
                    expires_at: expiresAt
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

// đăng xuất
export const logout = async (req, res) => {
    try {
        // Nếu có thông tin người dùng, cập nhật trạng thái
        if (req.user && req.user.id) {
            await supabase
                .from('users')
                .update({ status: 'offline' })
                .eq('id', req.user.id);
        }

        // Xóa cookie
        res.clearCookie('auth_token');

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

// yêu cầu đặt lại mật khẩu
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

        // Tạo mã đặt lại mật khẩu
        const { code, expiry } = generateVerificationCode();

        // Xóa mã đặt lại mật khẩu cũ nếu có (do ràng buộc UNIQUE)
        await supabase
            .from('verification_codes')
            .delete()
            .eq('user_id', userData.id)
            .eq('type', 'password_reset');

        // Lưu mã đặt lại mật khẩu vào bảng verification_codes
        const { error: tokenError } = await supabase
            .from('verification_codes')
            .insert([
                {
                    user_id: userData.id,
                    code: code,
                    type: 'password_reset',
                    expires_at: Math.floor(expiry / 1000), // Chuyển từ milliseconds sang seconds
                    used: false
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
        const resetURL = `${process.env.CLIENT_URL}/reset-password/${code}`;

        // Gửi email đặt lại mật khẩu qua Mailtrap
        try {
            await sendPasswordResetEmail(email, resetURL);
        } catch (emailError) {
            console.error('Lỗi gửi email đặt lại mật khẩu:', emailError);
            // Tiếp tục xử lý ngay cả khi gửi email thất bại
        }

        // console.log("Reset URL:", resetURL);
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

// đặt lại mật khẩu
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

        // Tìm token trong bảng verification_codes
        const { data: resetData, error: resetError } = await supabase
            .from('verification_codes')
            .select('user_id, expires_at')
            .eq('code', token)
            .eq('type', 'password_reset')
            .eq('used', false)
            .single();

        if (resetError || !resetData) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Token không hợp lệ hoặc đã hết hạn'
            });
        }

        // Kiểm tra thời gian hết hạn (Unix timestamp)
        const currentTime = Math.floor(Date.now() / 1000);
        if (resetData.expires_at < currentTime) {
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

        // Mã hóa mật khẩu mới với bcryptjs
        const hashedPassword = await bcryptjs.hash(password, SALT_ROUNDS);

        // Cập nhật mật khẩu trong bảng users
        const { error: updateUserError } = await supabase
            .from('users')
            .update({ password: hashedPassword })
            .eq('id', resetData.user_id);

        if (updateUserError) {
            console.error('Lỗi cập nhật mật khẩu trong bảng users:', updateUserError);
            return res.status(500).json({
                success: false,
                error: 'Database Error',
                message: 'Không thể cập nhật mật khẩu'
            });
        }

        // Đánh dấu token đã sử dụng
        await supabase
            .from('verification_codes')
            .update({ 
                used: true,
                used_at: Math.floor(Date.now() / 1000) // Unix timestamp
            })
            .eq('code', token)
            .eq('type', 'password_reset');

    } catch (error) {
        console.error('Lỗi đặt lại mật khẩu:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Đã xảy ra lỗi khi đặt lại mật khẩu'
        });
    }
};

// lấy thông tin người dùng hiện tại
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