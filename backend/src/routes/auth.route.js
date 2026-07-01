import express from "express";
import {
  checkAuth, login, logout, signup, updateProfile,
  blockUser, unblockUser, getBlockedUsers, getAllUsers,
  sendOTP, verifyOTP, resendOTP, checkEmailValid,
  updateFCMToken, removeFCMToken, // 🆕 Endpoints controllers import kiye
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Email validation
router.post("/check-email", checkEmailValid);

// OTP routes
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);

// Auth routes
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.put("/update-profile", protectRoute, updateProfile);
router.get("/check", protectRoute, checkAuth);
router.get("/users", protectRoute, getAllUsers);

// Block / Unblock
router.post("/block/:id", protectRoute, blockUser);
router.delete("/unblock/:id", protectRoute, unblockUser);
router.get("/blocked-users", protectRoute, getBlockedUsers);

// ── 🆕 FIREBASE CLOUD MESSAGING TOKEN MANAGEMENT ROUTES ──
router.post("/update-fcm-token", protectRoute, updateFCMToken);
router.post("/remove-fcm-token", protectRoute, removeFCMToken);

export default router;
