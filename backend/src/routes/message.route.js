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
} from "../controllers/message.controller.js";
const router = express.Router();
router.get("/users", protectRoute, getUsersForSidebar);
router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);
router.delete("/clear/:id", protectRoute, clearChat);   // ← Clear/Delete chat
router.post("/block/:id", protectRoute, blockUser);      // ← Block/Unblock user
router.delete("/:id", protectRoute, deleteMessage);
router.put("/read/:id", protectRoute, markAsRead);
router.put("/:id", protectRoute, editMessage);
router.post("/react/:id", protectRoute, addReaction);
export default router;
