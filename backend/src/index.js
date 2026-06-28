import express from "express";
import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import dotenv from "dotenv";
import { connectDB } from "./lib/db.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";
import { app, server } from "./lib/socket.js";
import path from "path";
import gameRoutes from "./routes/game.route.js";
import mediaRoutes from "./routes/media.route.js"; // ✅ Added Media Studio Routes Import

dotenv.config();
const PORT = process.env.PORT;
const __dirname = path.resolve();

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use(
  cors({
    origin: [
      "https://starlit-moxie-782d49.netlify.app",
      "capacitor://localhost",
      "http://localhost",
      "https://localhost",
    ],
    credentials: true,
  })
);

// ✅ Keep-alive ping endpoint — Render.com sleep prevent karo
app.get("/ping", (req, res) => {
  res.status(200).json({ status: "ok", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/media", mediaRoutes); // ✅ Registered Camera Studio Endpoints Group

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

app.options("*", cors());

server.listen(PORT, () => {
  console.log("Server is running on Port: " + PORT);
  connectDB();
});
