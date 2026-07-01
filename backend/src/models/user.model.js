import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    profilePic: {
      type: String,
      default: "",
    },
    about: {
      type: String,
      default: "",
      maxlength: 100,
    },
    hideOnlineStatus: {
      type: Boolean,
      default: false,
    },
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    // ── Status Privacy Engine Fields ──────────────────────────────────
    statusPrivacyType: {
      type: String,
      enum: ["contacts", "except", "only"],
      default: "contacts",
    },
    statusAllowedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    statusExcludedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    // ── WhatsApp Chat Lock Engine Fields ──────────────────────
    chatLockPassword: {
      type: String,
      default: "", 
    },
    isChatLockSet: {
      type: Boolean,
      default: false, 
    },
    lockedChats: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [], 
      },
    ],
    // ── Realtime Presence Engine Field ──────────────────────
    lastActive: {
      type: Date,
      default: Date.now,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // ── 🆕 FIREBASE PUSH NOTIFICATION TOKEN BUFFER MAPPING ──
    fcmTokens: {
      type: [String],
      default: [], // Multiple login handles ke liye array framework
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
