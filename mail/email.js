import { mailtrapClient, sender } from "./mailtrap.config.js";
import { 
    VERIFICATION_EMAIL_TEMPLATE, 
    WELCOME_EMAIL_TEMPLATE, 
    PASSWORD_RESET_REQUEST_TEMPLATE, 
    PASSWORD_RESET_SUCCESS_TEMPLATE, 
    REJECT_AUTHOR_TEMPLATE 
} from "./emailTemplates.js";

/**
 * Gửi email xác thực tài khoản
 */
export const sendVerificationEmail = async (email, verificationCode) => {
    const recipient = [{ email }];

    try {
        const htmlContent = VERIFICATION_EMAIL_TEMPLATE.replace("{verificationCode}", verificationCode);

        const response = await mailtrapClient.send({
            from: sender,
            to: recipient,
            subject: "Verify Your Email",
            html: htmlContent,
            category: "Email Verification",
        });

        console.log("Verification email sent successfully:", response);
    } catch (error) {
        console.error("Error sending verification email:", error);
        throw new Error(`Error sending verification email: ${error}`);
    }
};

/**
 * Gửi email chào mừng khi đăng ký thành công
 */
export const sendWelcomeEmail = async (email, username, dashboardURL) => {
    const recipient = [{ email }];

    try {
        const htmlContent = WELCOME_EMAIL_TEMPLATE
            .replace("{username}", username)
            .replace("{dashboardURL}", dashboardURL);

        const response = await mailtrapClient.send({
            from: sender,
            to: recipient,
            subject: "Welcome to Our Platform!",
            html: htmlContent,
            category: "Welcome Email",
        });

        console.log("Welcome email sent successfully:", response);
    } catch (error) {
        console.error("Error sending welcome email:", error);
        throw new Error(`Error sending welcome email: ${error}`);
    }
};

/**
 * Gửi email từ chối yêu cầu đăng ký tác giả
 */
export const sendRejectAuthorEmail = async (email, username, rejectionReason) => {
    const recipient = [{ email }];

    try {
        const htmlContent = REJECT_AUTHOR_TEMPLATE
            .replace("{username}", username)
            .replace("{rejectionReason}", rejectionReason);

        const response = await mailtrapClient.send({
            from: sender,
            to: recipient,
            subject: "Author Application Rejected",
            html: htmlContent,
            category: "Rejection Email",
        });

        console.log("Rejection email sent successfully:", response);
    } catch (error) {
        console.error("Error sending rejection email:", error);
        throw new Error(`Error sending rejection email: ${error}`);
    }
};

/**
 * Gửi email yêu cầu đặt lại mật khẩu
 */
export const sendPasswordResetEmail = async (email, resetURL) => {
    const recipient = [{ email }];

    try {
        const htmlContent = PASSWORD_RESET_REQUEST_TEMPLATE.replace("{resetURL}", resetURL);

        const response = await mailtrapClient.send({
            from: sender,
            to: recipient,
            subject: "Reset Your Password",
            html: htmlContent,
            category: "Password Reset",
        });

        console.log("Password reset email sent successfully:", response);
    } catch (error) {
        console.error("Error sending password reset email:", error);
        throw new Error(`Error sending password reset email: ${error}`);
    }
};

/**
 * Gửi email xác nhận đặt lại mật khẩu thành công
 */
export const sendResetSuccessEmail = async (email) => {
    const recipient = [{ email }];

    try {
        const response = await mailtrapClient.send({
            from: sender,
            to: recipient,
            subject: "Password Reset Successful",
            html: PASSWORD_RESET_SUCCESS_TEMPLATE,
            category: "Password Reset",
        });

        console.log("Password reset success email sent successfully:", response);
    } catch (error) {
        console.error("Error sending password reset success email:", error);
        throw new Error(`Error sending password reset success email: ${error}`);
    }
};