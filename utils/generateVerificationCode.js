import crypto from "crypto";

const VERIFICATION_EXPIRY = 5 * 60 * 1000; // 5 phút

export const generateVerificationCode = () => {
  const code = crypto.randomInt(100000, 999999).toString(); // Mã 6 chữ số
  const expiry = Date.now() + VERIFICATION_EXPIRY; // Thời gian hết hạn

  return { code, expiry };
};
