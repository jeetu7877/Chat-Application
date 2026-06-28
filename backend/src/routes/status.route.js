import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  uploadStatus,
  getMyStatuses,
  getFriendsStatuses,
  viewStatus,
  deleteStatus,
  toggleLikeStatus, // ✅ NAYA
  replyStatus,      // ✅ NAYA
} from "../controllers/status.controller.js";

const router = express.Router();

// All routes protected
router.post("/upload",         protectRoute, uploadStatus);
router.get("/my-status",      protectRoute, getMyStatuses);
router.get("/friends",        protectRoute, getFriendsStatuses);
router.post("/view/:statusId", protectRoute, viewStatus);
router.delete("/:statusId",   protectRoute, deleteStatus);

// ── NAYE ENDPOINTS ───────────────────────────────────────────────────────────
router.post("/like/:statusId", protectRoute, toggleLikeStatus); // ✅ Like toggle route
router.post("/reply/:statusId", protectRoute, replyStatus);     // ✅ Reply status route

export default router;
