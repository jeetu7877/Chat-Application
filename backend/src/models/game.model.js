import mongoose from "mongoose";

const gameResultSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    game: {
      type: String,
      enum: ["ttt", "rps", "gtn", "eq"],
      required: true,
    },
    gameName: {
      type: String,
      required: true,
    },
    result: {
      type: String,
      enum: ["win", "loss", "draw"],
      required: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    opponent: {
      type: String,
      default: "AI",
    },
  },
  { timestamps: true }
);

const GameResult = mongoose.model("GameResult", gameResultSchema);
export default GameResult;
