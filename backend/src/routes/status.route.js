import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  uploadStatus,
  getMyStatuses,
  getFriendsStatuses,
  viewStatus,
  deleteStatus,
} from "../controllers/status.controller.js";

const router = express.Router();

// All routes protected
router.post("/upload",        protectRoute, uploadStatus);
router.get("/my-status",      protectRoute, getMyStatuses);
router.get("/friends",        protectRoute, getFriendsStatuses);
router.post("/view/:statusId", protectRoute, viewStatus);
router.delete("/:statusId",   protectRoute, deleteStatus);

export default router;
