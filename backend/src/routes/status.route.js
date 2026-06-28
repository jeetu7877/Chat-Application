import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  uploadStatus,
  getMyStatuses,
  getFriendsStatuses,
  viewStatus,
  deleteStatus,
  toggleLikeStatus,
  replyStatus,
  getStatusPrivacy,   // ✅ NAYA: Privacy Controller Import
  updateStatusPrivacy, // ✅ NAYA: Privacy Controller Import
} from "../controllers/status.controller.js";

const router = express.Router();

// All routes protected
router.post("/upload",         protectRoute, uploadStatus);
router.get("/my-status",      protectRoute, getMyStatuses);
router.get("/friends",        protectRoute, getFriendsStatuses);
router.post("/view/:statusId", protectRoute, viewStatus);
router.delete("/:statusId",   protectRoute, deleteStatus);

// ── LIKE & REPLY ENDPOINTS ───────────────────────────────────────────────────
router.post("/like/:statusId", protectRoute, toggleLikeStatus); 
router.post("/reply/:statusId", protectRoute, replyStatus);     

// ── NAYE PRIVACY ENDPOINTS ───────────────────────────────────────────────────
router.get("/privacy",        protectRoute, getStatusPrivacy);   // ✅ Privacy settings fetch karne ke liye
router.put("/privacy",        protectRoute, updateStatusPrivacy); // ✅ Privacy settings update karne ke liye

export default router;
