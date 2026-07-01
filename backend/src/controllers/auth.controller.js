import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import OTP from "../models/otp.model.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";
import crypto from "crypto";
import { sendOTPEmail } from "../lib/email.js";
import dns from "dns/promises";
import axios from "axios";

// ── Generate 6-digit OTP ──────────────────────────────────────────────────────
const generateOTP = () => crypto.randomInt(100000, 999999).toString();

// ── Send OTP ──────────────────────────────────────────────────────────────────
export const sendOTP = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password)
      return res.status(400).json({ message: "All fields are required" });

    if (!/\S+@\S+\.\S+/.test(email))
      return res.status(400).json({ message: "Invalid email format" });

    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    // Email already registered check
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "This email is already registered" });

    // Rate limit — max 3 OTPs per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOTPs = await OTP.countDocuments({ email, createdAt: { $gt: oneHourAgo } });
    if (recentOTPs >= 3)
      return res.status(429).json({ message: "Too many OTP requests. Try again after 1 hour." });

    // Delete old OTPs for this email
    await OTP.deleteMany({ email });

    // Generate OTP
    const otp = generateOTP();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save OTP
    await OTP.create({
      email,
      otp,
      fullName,
      password: hashedPassword,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    // Send email
    try {
      await sendOTPEmail(email, fullName, otp);
    } catch (emailError) {
      console.error("Email send error:", emailError);
      await OTP.deleteMany({ email });
      return res.status(500).json({ message: "Unable to send verification email. Please try again." });
    }

    res.status(200).json({ message: "OTP sent successfully", email });
  } catch (error) {
    console.log("Error in sendOTP:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Verify OTP & Create Account ───────────────────────────────────────────────
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP are required" });

    const otpRecord = await OTP.findOne({ email });
    if (!otpRecord)
      return res.status(400).json({ message: "OTP not found. Please request a new one." });

    // Max attempts check
    if (otpRecord.attempts >= 5) {
      await OTP.deleteMany({ email });
      return res.status(400).json({ message: "Too many failed attempts. Please request a new OTP." });
    }

    // Expiry check
    if (new Date() > otpRecord.expiresAt) {
      await OTP.deleteMany({ email });
      return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
    }

    // OTP match check
    if (otpRecord.otp !== otp.toString()) {
      await OTP.findByIdAndUpdate(otpRecord._id, { $inc: { attempts: 1 } });
      const remaining = 5 - (otpRecord.attempts + 1);
      return res.status(400).json({ message: `Invalid verification code. ${remaining} attempts remaining.` });
    }

    // ✅ OTP verified — create user
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered" });

    const newUser = new User({
      fullName: otpRecord.fullName,
      email,
      password: otpRecord.password,
      emailVerified: true,
    });

    await newUser.save();
    await OTP.deleteMany({ email });

    const token = generateToken(newUser._id, res);

    res.status(201).json({
      _id: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      profilePic: newUser.profilePic,
      token,
    });
  } catch (error) {
    console.log("Error in verifyOTP:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Resend OTP ────────────────────────────────────────────────────────────────
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const otpRecord = await OTP.findOne({ email });
    if (!otpRecord)
      return res.status(400).json({ message: "No pending verification for this email" });

    // Rate limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOTPs = await OTP.countDocuments({ email, createdAt: { $gt: oneHourAgo } });
    if (recentOTPs >= 3)
      return res.status(429).json({ message: "Too many OTP requests. Try again after 1 hour." });

    const otp = generateOTP();
    await OTP.findByIdAndUpdate(otpRecord._id, {
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
    });

    await sendOTPEmail(email, otpRecord.fullName, otp);

    res.status(200).json({ message: "OTP resent successfully" });
  } catch (error) {
    console.log("Error in resendOTP:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Signup (Direct — existing) ────────────────────────────────────────────────
export const signup = async (req, res) => {
  const { fullName, email, password } = req.body;
  try {
    if (!fullName || !email || !password)
      return res.status(400).json({ message: "All fields are required" });
    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    const user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "Email already exists" });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = new User({ fullName, email, password: hashedPassword });
    if (newUser) {
      const token = generateToken(newUser._id, res);
      await newUser.save();
      res.status(201).json({
        _id: newUser._id, fullName: newUser.fullName,
        email: newUser.email, profilePic: newUser.profilePic, token,
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.log("Error in signup controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Login ─────────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "No account found with this email. Please sign up first.",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Incorrect password. Please try again.",
      });
    }

    const token = generateToken(user._id, res);

    res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      profilePic: user.profilePic,
      token,
    });

  } catch (error) {
    console.log("Error in login controller", error.message);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// ── Logout ────────────────────────────────────────────────────────────────────
export const logout = (req, res) => {
  try {
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Update Profile ────────────────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  try {
    const { profilePic, fullName, email, about, hideOnlineStatus, notificationsEnabled } = req.body;
    const userId = req.user._id;
    const updateFields = {};
    if (profilePic) {
      const uploadResponse = await cloudinary.uploader.upload(profilePic);
      updateFields.profilePic = uploadResponse.secure_url;
    }
    if (fullName !== undefined) updateFields.fullName = fullName;
    if (email !== undefined) updateFields.email = email;
    if (about !== undefined) updateFields.about = about;
    if (hideOnlineStatus !== undefined) updateFields.hideOnlineStatus = hideOnlineStatus;
    if (notificationsEnabled !== undefined) updateFields.notificationsEnabled = notificationsEnabled; // 🆕 ADD THIS
    const updatedUser = await User.findByIdAndUpdate(userId, updateFields, { new: true }).select("-password");
    res.status(200).json(updatedUser);
  } catch (error) {
    console.log("error in update profile:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ── Check Auth ────────────────────────────────────────────────────────────────
export const checkAuth = (req, res) => {
  try {
    res.status(200).json(req.user);
  } catch (error) {
    console.log("Error in checkAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Get All Users ─────────────────────────────────────────────────────────────
export const getAllUsers = async (req, res) => {
  try {
    const myId = req.user._id;
    const me = await User.findById(myId).select("blockedUsers");
    const blockedByMe = me.blockedUsers || [];
    const usersWhoBlockedMe = await User.find({ blockedUsers: myId }).select("_id");
    const blockedMeIds = usersWhoBlockedMe.map(u => u._id);
    const allBlocked = [...blockedByMe, ...blockedMeIds];
    const users = await User.find({ _id: { $ne: myId, $nin: allBlocked } }).select("-password");
    res.status(200).json(users);
  } catch (error) {
    console.log("Error in getAllUsers controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Block User ────────────────────────────────────────────────────────────────
export const blockUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id: targetId } = req.params;
    if (userId.toString() === targetId)
      return res.status(400).json({ message: "You cannot block yourself" });
    const user = await User.findById(userId);
    if (user.blockedUsers.includes(targetId))
      return res.status(400).json({ message: "User already blocked" });
    await User.findByIdAndUpdate(userId, { $addToSet: { blockedUsers: targetId } });
    res.status(200).json({ message: "User blocked successfully" });
  } catch (error) {
    console.log("Error in blockUser controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Unblock User ──────────────────────────────────────────────────────────────
export const unblockUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id: targetId } = req.params;
    await User.findByIdAndUpdate(userId, { $pull: { blockedUsers: targetId } });
    res.status(200).json({ message: "User unblocked successfully" });
  } catch (error) {
    console.log("Error in unblockUser controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Get Blocked Users ─────────────────────────────────────────────────────────
export const getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("blockedUsers", "_id fullName profilePic");
    res.status(200).json(user.blockedUsers);
  } catch (error) {
    console.log("Error in getBlockedUsers controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Verify Email Exists (MX Record Check) ─────────────────────────────────────
export const checkEmailValid = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(200).json({ valid: false, message: "Invalid email format" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(200).json({ valid: false, message: "This email is already registered" });
    }

    try {
      const response = await axios.get("https://emailreputation.abstractapi.com/v1/", {
        params: {
          api_key: process.env.ABSTRACT_API_KEY,
          email: email,
        },
      });

      const data = response.data;
      const deliverability = data.email_deliverability?.status;
      const isDisposable = data.email_quality?.is_disposable;

      if (isDisposable) {
        return res.status(200).json({ valid: false, message: "Temporary/disposable emails are not allowed" });
      }

      if (deliverability === "undeliverable") {
        return res.status(200).json({ valid: false, message: "This email does not exist" });
      }

      if (deliverability === "unknown") {
        return res.status(200).json({ valid: true, message: "Email could not be fully verified" });
      }

      return res.status(200).json({ valid: true, message: "Email looks valid" });

    } catch (apiError) {
      console.error("Abstract API error:", apiError.message);
      return res.status(200).json({ valid: true, message: "Could not verify, proceeding anyway" });
    }

  } catch (error) {
    console.log("Error in checkEmailValid:", error.message);
    res.status(200).json({ valid: true, message: "Could not verify, proceeding anyway" });
  }
};

// ── 🆕 FIREBASE PUSH ENDPOINT CONTROLLERS ────────────────────────────────────
export const updateFCMToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "FCM Token is required" });

    // Ensure array mapping uniqueness avoiding redundant entry streams
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { fcmTokens: token }
    });

    res.status(200).json({ message: "FCM token saved successfully" });
  } catch (error) {
    console.log("Error in updateFCMToken controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const removeFCMToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token configuration is required" });

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { fcmTokens: token }
    });

    res.status(200).json({ message: "FCM token removed successfully" });
  } catch (error) {
    console.log("Error in removeFCMToken controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
