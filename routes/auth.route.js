import express from "express";
import {
  checkAuth,
  signup, 
  verifyEmail,
  resendVerificationCode,
  login, 
  logout, 
  forgotPassword,
  resetPassword, 
  getCurrentUser
} from "../controllers/auth.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();
// yêu cầu token để truy cập
router.get("/check-auth", verifyToken, checkAuth);
router.get("/me", verifyToken, getCurrentUser);
router.post("/logout", verifyToken, logout);

// không yêu cầu token để truy cập
router.post("/signup", signup);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.post("/resend-code", resendVerificationCode);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
export default router;