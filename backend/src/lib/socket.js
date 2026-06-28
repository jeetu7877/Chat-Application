import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
          "http://localhost:5173",
          "https://starlit-moxie-782d49.netlify.app",
          "capacitor://localhost",
          "http://localhost",
          "https://localhost"
        ],
        credentials: true,
    }
});

export function getReceiverSocketId(userId){
    return userSocketMap[userId];
}

const userSocketMap = {}; // {userId: socketId}

// ── Game Rooms ────────────────────────────────────────────────────────────────
// { roomId: { gameId, players: [userId1, userId2], board, currentTurn, status } }
const gameRooms = {};

const generateRoomId = (userId1, userId2, gameId) => {
  return [userId1, userId2].sort().join("_") + "_" + gameId;
};

io.on("connection", (socket) => {
    const userId = socket.handshake.query.userId;

    if (userId && userId !== "undefined") {
        userSocketMap[userId] = socket.id;
    }

    console.log("✅ User connected:", userId, "| socketId:", socket.id);
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // ===== TYPING EVENTS =====
    socket.on("typing", ({ receiverId }) => {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("typing", { senderId: userId });
        }
    });

    socket.on("stopTyping", ({ receiverId }) => {
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("stopTyping", { senderId: userId });
        }
    });

    // ===== GAME EVENTS =====

    // Jab koi game join kare
    socket.on("game:join", ({ roomId, gameId, opponentId }) => {
        socket.join(roomId);

        if (!gameRooms[roomId]) {
            gameRooms[roomId] = {
                gameId,
                players: [userId],
                board: Array(9).fill(null),
                currentTurn: null,
                status: "waiting",
            };
            // Pehla player — wait karo
            socket.emit("game:waiting", { roomId });
        } else {
            // Doosra player join kiya
            const room = gameRooms[roomId];
            if (!room.players.includes(userId)) {
                room.players.push(userId);
            }
            room.status = "playing";
            // Pehle wale player ko X denge, doosre ko O
            room.currentTurn = room.players[0];

            // Dono players ko batao game start ho gaya
            io.to(roomId).emit("game:start", {
                roomId,
                players: room.players,
                currentTurn: room.currentTurn,
                // X = pehla player, O = doosra player
                assignments: {
                    [room.players[0]]: "X",
                    [room.players[1]]: "O",
                },
            });
        }
    });

    // Jab koi move kare
    socket.on("game:move", ({ roomId, index, symbol, data }) => {
  const room = gameRooms[roomId];
  if (!room) return;

  // ── TicTacToe move ──
  if (index !== undefined && symbol !== undefined) {
    if (room.currentTurn !== userId) return;

    room.board[index] = symbol;
    const nextTurn = room.players.find(p => p !== userId);
    room.currentTurn = nextTurn;

    io.to(roomId).emit("game:update", {
      board: room.board,
      currentTurn: room.currentTurn,
      lastMove: { index, symbol, by: userId },
    });
  }

  // ── RPS move ──
  if (data?.choice) {
    if (!room.choices) room.choices = {};
    room.choices[userId] = data;

    // Jab dono players ne choose kar liya
    if (Object.keys(room.choices).length === 2) {
      const [p1Id, p2Id] = room.players;
      const p1Choice = room.choices[p1Id]?.choice;
      const p2Choice = room.choices[p2Id]?.choice;
      const currentScore = room.choices[p1Id]?.currentScore || { player: 0, ai: 0, draw: 0 };
      const roundNum = room.choices[p1Id]?.round || 1;

      const getChoiceResult = (a, b) => {
        if (a === b) return "draw";
        const BEATS = { rock: "scissors", scissors: "paper", paper: "rock" };
        return BEATS[a] === b ? "win" : "loss";
      };

      const p1Result = getChoiceResult(p1Choice, p2Choice);
      const newScore = { ...currentScore };
      if (p1Result === "win") newScore.player += 1;
      else if (p1Result === "loss") newScore.ai += 1;
      else newScore.draw += 1;

      // P1 ko result bhejo
      const p1SocketId = getReceiverSocketId(p1Id);
      if (p1SocketId) {
        io.to(p1SocketId).emit("game:update", {
          data: {
            myChoiceServer: p1Choice,
            opponentChoiceServer: p2Choice,
            roundResult: p1Result,
            newScore,
            roundNum,
          }
        });
      }

      // P2 ko result bhejo
      const p2Result = p1Result === "win" ? "loss" : p1Result === "loss" ? "win" : "draw";
      const p2Score = { player: newScore.ai, ai: newScore.player, draw: newScore.draw };
      const p2SocketId = getReceiverSocketId(p2Id);
      if (p2SocketId) {
        io.to(p2SocketId).emit("game:update", {
          data: {
            myChoiceServer: p2Choice,
            opponentChoiceServer: p1Choice,
            roundResult: p2Result,
            newScore: p2Score,
            roundNum,
          }
        });
      }

      // Reset choices for next round
      room.choices = {};
    }
  }
});

    // Game khatam
    socket.on("game:over", ({ roomId, result }) => {
        const room = gameRooms[roomId];
        if (!room) return;

        io.to(roomId).emit("game:ended", { result });
        delete gameRooms[roomId]; // Room clean karo
    });

    // Game se bahar jaana
    socket.on("game:leave", ({ roomId }) => {
        socket.leave(roomId);
        if (gameRooms[roomId]) {
            // Doosre player ko batao
            io.to(roomId).emit("game:opponent-left");
            delete gameRooms[roomId];
        }
    });

    // ===== CALLING FEATURE =====
    socket.on("call-user", ({ to, from, offer, callType, callerInfo }) => {
        console.log(`📞 call-user: from=${from} to=${to}`);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("incoming-call", {
                from, offer, callType, callerInfo,
            });
        } else {
            socket.emit("call-failed", { reason: "User is offline" });
        }
    });

    socket.on("answer-call", ({ to, answer }) => {
        const callerSocketId = getReceiverSocketId(to);
        if (callerSocketId) {
            io.to(callerSocketId).emit("call-answered", { answer });
        }
    });

    socket.on("reject-call", ({ to }) => {
        const callerSocketId = getReceiverSocketId(to);
        if (callerSocketId) {
            io.to(callerSocketId).emit("call-rejected");
        }
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
        const targetSocketId = getReceiverSocketId(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit("ice-candidate", { candidate });
        }
    });

    socket.on("end-call", ({ to }) => {
        const targetSocketId = getReceiverSocketId(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-ended");
        }
    });

    socket.on("disconnect", () => {
        console.log("❌ User disconnected:", userId);
        if (userId && userId !== "undefined") {
            delete userSocketMap[userId];
        }
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });
});

export { io, app, server };
