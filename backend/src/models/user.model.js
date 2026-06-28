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
    // ── ✅ NAYA: WhatsApp Chat Lock Engine Fields ──────────────────────
    chatLockPassword: {
      type: String,
      default: "", // Hashed string save hogi yahan setting se
    },
    isChatLockSet: {
      type: Boolean,
      default: false, // Jab user pehli baar setup karega tab true hoga
    },
    lockedChats: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [], // Jin friends ki chats lock hain, unki IDs yahan aayengi
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
