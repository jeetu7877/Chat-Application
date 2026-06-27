import express from "express";
import { saveGameResult, getPlayerStats } from "../controllers/game.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/result", protectRoute, saveGameResult);
router.get("/stats", protectRoute, getPlayerStats);

export default router;
