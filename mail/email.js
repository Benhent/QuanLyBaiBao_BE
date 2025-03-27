import { mailtrapClient, sender } from "./mailtrap.config.js";
import { 
    VERIFICATION_EMAIL_TEMPLATE, 
    PASSWORD_RESET_REQUEST_TEMPLATE,
    APPROVE_AUTHOR_TEMPLATE, 
    REJECT_AUTHOR_TEMPLATE
} from "./emailTemplates.js";

// gửi email xác thực tài khoản
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

// gửi yêu cầu đặt lại mật khẩu
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

// gửi email thông báo cho admin khi có yêu cầu tác giả mới
export const sendAdminAuthorRequestNotification = async (adminEmails, authorRequest, requestURL) => {
    try {
        if (!adminEmails || adminEmails.length === 0) {
            console.warn("No admin emails provided for notification");
            return;
        }

        const recipients = adminEmails.map(email => ({ email }));
        
        let htmlContent = ADMIN_AUTHOR_REQUEST_NOTIFICATION_TEMPLATE
            .replace("{firstName}", authorRequest.first_name)
            .replace("{lastName}", authorRequest.last_name)
            .replace("{academicTitle}", authorRequest.academic_title || 'Không có')
            .replace("{reason}", authorRequest.reason_for_request || 'Không có')
            .replace("{requestURL}", requestURL);

        const response = await mailtrapClient.send({
            from: sender,
            to: recipients,
            subject: "Yêu cầu trở thành tác giả mới",
            html: htmlContent,
            category: "Author Request Notification",
        });

        console.log("Admin notification email sent successfully:", response);
    } catch (error) {
        console.error("Error sending admin notification email:", error);
        // Không throw error ở đây để không ảnh hưởng đến việc tạo yêu cầu
    }
};

// gửi email thông báo chấp nhận yêu cầu làm tác giả
export const sendAuthorApprovalEmail = async (email, firstName, loginURL) => {
    const recipient = [{ email }];

    try {
        let htmlContent = APPROVE_AUTHOR_TEMPLATE.replace("{firstName}", firstName);
        htmlContent = htmlContent.replace("{loginURL}", loginURL);

        const response = await mailtrapClient.send({
            from: sender,
            to: recipient,
            subject: "Your Author Request Has Been Approved",
            html: htmlContent,
            category: "Author Approval",
        });

        console.log("Author approval email sent successfully:", response);
    } catch (error) {
        console.error("Error sending author approval email:", error);
        throw new Error(`Error sending author approval email: ${error}`);
    }
};

// gửi email thông báo từ chối yêu cầu làm tác giả
export const sendAuthorRejectionEmail = async (email, firstName, rejectionReason) => {
    const recipient = [{ email }];

    try {
        let htmlContent = REJECT_AUTHOR_TEMPLATE.replace("{firstName}", firstName);
        htmlContent = htmlContent.replace("{rejectionReason}", rejectionReason);

        const response = await mailtrapClient.send({
            from: sender,
            to: recipient,
            subject: "Your Author Request Status",
            html: htmlContent,
            category: "Author Rejection",
        });

        console.log("Author rejection email sent successfully:", response);
    } catch (error) {
        console.error("Error sending author rejection email:", error);
        throw new Error(`Error sending author rejection email: ${error}`);
    }
};