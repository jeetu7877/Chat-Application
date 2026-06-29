import GameResult from "../models/game.model.js";

// ── Save game result ──────────────────────────────────────────────────────────
export const saveGameResult = async (req, res) => {
  try {
    const { game, gameName, result, score, opponent } = req.body;
    const player = req.user._id;

    const gameResult = new GameResult({
      player,
      game,
      gameName,
      result,
      score: score || 0,
      opponent: opponent || "AI",
    });

    await gameResult.save();
    res.status(201).json({ success: true, gameResult });
  } catch (error) {
    console.error("Save game result error:", error);
    res.status(500).json({ error: "Failed to save game result" });
  }
};

// ── Get player stats ──────────────────────────────────────────────────────────
export const getPlayerStats = async (req, res) => {
  try {
    const player = req.user._id;

    const results = await GameResult.find({ player }).sort({ createdAt: -1 });

    const wins   = results.filter(r => r.result === "win").length;
    const losses = results.filter(r => r.result === "loss").length;
    const draws  = results.filter(r => r.result === "draw").length;
    const totalGames = results.length;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

    // Favorite game
    const gameCounts = {};
    results.forEach(r => {
      gameCounts[r.gameName] = (gameCounts[r.gameName] || 0) + 1;
    });
    const favoriteGame = Object.keys(gameCounts).sort(
      (a, b) => gameCounts[b] - gameCounts[a]
    )[0] || "None";

    // Current streak
    let streak = 0;
    for (const r of results) {
      if (r.result === "win") streak++;
      else break;
    }

    // Recent matches (last 10)
    const recentMatches = results.slice(0, 10).map(r => ({
      game: r.game,
      gameName: r.gameName,
      result: r.result,
      score: r.score,
      opponent: r.opponent,
      time: r.createdAt,
    }));

    // Achievements
    const achievements = [
      { icon: "🏆", label: "First Win",    unlocked: wins >= 1     },
      { icon: "🔥", label: "5 Win Streak", unlocked: streak >= 5   },
      { icon: "⚡", label: "Speed Demon",  unlocked: totalGames >= 10 },
      { icon: "👑", label: "Champion",      unlocked: wins >= 20    },
      { icon: "🎯", label: "Sharpshooter", unlocked: wins >= 50    },
      { icon: "🧠", label: "Big Brain",    unlocked: wins >= 100   },
    ];

    res.status(200).json({
      wins,
      losses,
      draws,
      totalGames,
      winRate,
      favoriteGame,
      streak,
      recentMatches,
      achievements,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
};

// ── ✅ NAYA: Permanent Database Clear Engine ──────────────────────────────────
export const clearGameHistory = async (req, res) => {
  try {
    const player = req.user._id;

    // 🎯 STRICT MONGODB DELETE: Is player ke saare match records ko flush kar do
    await GameResult.deleteMany({ player });

    res.status(200).json({ 
      success: true, 
      message: "Sari game history permanent database se clear ho gayi h!" 
    });
  } catch (error) {
    console.error("Clear game history error:", error);
    res.status(500).json({ error: "Failed to clear match history from database" });
  }
};
