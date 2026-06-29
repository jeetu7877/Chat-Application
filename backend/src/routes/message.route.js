import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";

import { 
  getMessages, 
  getUsersForSidebar, 
  getAllUsersForInvite,
  sendMessage, 
  deleteMessage, 
  editMessage,
  markAsRead,
  addReaction,
  clearChat,
  blockUser,
  setLockPassword,    
  verifyLockPassword, 
  toggleLockChat,     
  getLockedUsers,
} from "../controllers/message.controller.js";

const router = express.Router();

// ── 1. FIXED STATIC ROUTES (Hamesha sabsé UPAR hone chahiye) ── ✅
router.get("/users", protectRoute, getUsersForSidebar);
router.get("/invite-friends-list", protectRoute, getAllUsersForInvite);

// ── ✅ WhatsApp Chat Lock Engine Settings (Hardcoded endpoints must be on top) ──
router.get("/lock/users", protectRoute, getLockedUsers);         // Hidden users fetch karne ke liye
router.post("/lock/set-pwd", protectRoute, setLockPassword);    // Custom password set/change ke liye
router.post("/lock/verify", protectRoute, verifyLockPassword);  // Folder access verification ke liye

// ── 2. DYNAMIC ID (/:id) ROUTES (Hamesha sabsé NICHE hone chahiye) ── ❌👇
router.post("/lock/toggle/:id", protectRoute, toggleLockChat);  // Individual chat lock/unlock toggle
router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);
router.delete("/clear/:id", protectRoute, clearChat);   
router.post("/block/:id", protectRoute, blockUser);      
router.delete("/:id", protectRoute, deleteMessage);
router.put("/read/:id", protectRoute, markAsRead);
router.put("/:id", protectRoute, editMessage);
router.post("/react/:id", protectRoute, addReaction);

export default router;
