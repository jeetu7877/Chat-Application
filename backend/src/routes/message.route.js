import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { 
  getMessages, 
  getUsersForSidebar, 
  sendMessage, 
  deleteMessage, 
  editMessage,
  markAsRead,
  addReaction,
  clearChat,
  blockUser,
  setLockPassword,    // ✅ NAYA
  verifyLockPassword, // ✅ NAYA
  toggleLockChat,     // ✅ NAYA
  getLockedUsers,     // ✅ NAYA
} from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);
router.delete("/clear/:id", protectRoute, clearChat);   
router.post("/block/:id", protectRoute, blockUser);      
router.delete("/:id", protectRoute, deleteMessage);
router.put("/read/:id", protectRoute, markAsRead);
router.put("/:id", protectRoute, editMessage);
router.post("/react/:id", protectRoute, addReaction);

// ── ✅ NAYE ENDPOINTS: WhatsApp Chat Lock Engine ───────────────────────────
router.get("/lock/users", protectRoute, getLockedUsers);        // Hidden users fetch karne ke liye
router.post("/lock/set-pwd", protectRoute, setLockPassword);    // Custom password set/change ke liye
router.post("/lock/verify", protectRoute, verifyLockPassword);  // Folder access verification ke liye
router.post("/lock/toggle/:id", protectRoute, toggleLockChat);  // Individual chat lock/unlock toggle

export default router;
