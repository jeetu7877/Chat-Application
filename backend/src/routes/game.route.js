import express from "express";
import { saveGameResult, getPlayerStats, clearGameHistory } from "../controllers/game.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/result", protectRoute, saveGameResult);
router.get("/stats", protectRoute, getPlayerStats);

// 🎯 NAYA: Recent matches ki history delete karne ke liye route
router.delete("/clear-history", protectRoute, clearGameHistory);

export default router;
