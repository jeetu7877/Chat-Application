import { Server } from "socket.io";
import http from "http";
import express from "express";
import User from "../models/user.model.js";

const app = express();
const server = http.createServer(app);
// ── SOCKET SERVER CONFIGURATION WITH TIMEOUT OPTIMIZATION ──
const io = new Server(server, {
    pingTimeout: 60000,  // ⏱️ 60 seconds tak wait karega agar response na aaye (Ghost drop block)
    pingInterval: 25000, // ⏱️ Har 25 seconds me server heartbeat check bhejega
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

const userSocketMap = {};

// ── Online Visibility ──────────────────────────────────────────────────────────
const hiddenStatusUsers = new Set();

const broadcastOnlineUsers = () => {
    const visibleUserIds = Object.keys(userSocketMap).filter(
        (id) => !hiddenStatusUsers.has(id)
    );
    io.emit("getOnlineUsers", visibleUserIds);
};

// ── 🆕 CALL STATE TRACKING (Phase 1: Socket Signaling) ──────────────────────
// userId -> { peerId, callType, status: "ringing" | "ongoing" }
const activeCalls = {};

const isUserBusy = (userId) => {
    return !!activeCalls[userId];
};

const setActiveCall = (userIdA, userIdB, callType, status) => {
    activeCalls[userIdA] = { peerId: userIdB, callType, status };
    activeCalls[userIdB] = { peerId: userIdA, callType, status };
};

const updateCallStatus = (userIdA, userIdB, status) => {
    if (activeCalls[userIdA]) activeCalls[userIdA].status = status;
    if (activeCalls[userIdB]) activeCalls[userIdB].status = status;
};

const clearActiveCall = (userId) => {
    const entry = activeCalls[userId];
    if (entry) {
        delete activeCalls[entry.peerId];
        delete activeCalls[userId];
    }
};

// ── Game Rooms ────────────────────────────────────────────────────────────────
const gameRooms = {};

// ── TicTacToe Winner Check ────────────────────────────────────────────────────
const WINNING_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

const checkTTTWinner = (board) => {
  for (const [a,b,c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a,b,c] };
    }
  }
  if (board.every(Boolean)) return { winner: "draw", line: [] };
  return null;
};

const MAX_GTN_ATTEMPTS = 7;

io.on("connection", async (socket) => {
    const userId = socket.handshake.query.userId;

    if (userId && userId !== "undefined") {
        userSocketMap[userId] = socket.id;

        try {
            const user = await User.findById(userId).select("hideOnlineStatus");
            if (user?.hideOnlineStatus) {
                hiddenStatusUsers.add(userId);
            } else {
                hiddenStatusUsers.delete(userId);
            }
        } catch (err) {
            console.log("Error checking hideOnlineStatus:", err.message);
        }
    }

    console.log("✅ User connected:", userId);
    broadcastOnlineUsers();

    // ── 🆕 FIREBASE WHATSAPP-STYLE DYNAMIC CHAT ROOM TRACKERS ──
    socket.on("join:chat_room", ({ chatId }) => {
        if (chatId) {
            socket.join(String(chatId));
            console.log(`👤 Socket [${socket.id}] entered chat focus matrix layer room: ${chatId}`);
        }
    });

    socket.on("leave:chat_room", ({ chatId }) => {
        if (chatId) {
            socket.leave(String(chatId));
            console.log(`👤 Socket [${socket.id}] exited chat focus matrix layer room: ${chatId}`);
        }
    });

    socket.on("update:hideOnlineStatus", ({ hide }) => {
        if (!userId) return;
        if (hide) {
            hiddenStatusUsers.add(userId);
        } else {
            hiddenStatusUsers.delete(userId);
        }
        broadcastOnlineUsers();
    });

    socket.on("typing", ({ receiverId }) => {
        const sid = getReceiverSocketId(receiverId);
        if (sid) io.to(sid).emit("typing", { senderId: userId });
    });

    socket.on("stopTyping", ({ receiverId }) => {
        const sid = getReceiverSocketId(receiverId);
        if (sid) io.to(sid).emit("stopTyping", { senderId: userId });
    });

    // ── Game: Join ────────────────────────────────────────────────────────────
    socket.on("game:join", ({ roomId, gameId, opponentId }) => {
        socket.join(roomId);

        if (!gameRooms[roomId]) {
            gameRooms[roomId] = {
                gameId,
                players: [userId],
                board: Array(9).fill(null),
                currentTurn: null,
                status: "waiting",
                gtnTargets: {},
                gtnAttempts: {},
                gtnSolved: {},
                gtnFinished: {},
                choices: {},
                roundScores: {},
            };
            socket.emit("game:waiting", { roomId });
        } else {
            const room = gameRooms[roomId];
            if (!room.players.includes(userId)) {
                room.players.push(userId);
            }
            room.status = "playing";
            room.currentTurn = room.players[0];

            if (gameId === "ttt") {
                room.board = Array(9).fill(null);
                io.to(roomId).emit("game:start", {
                    roomId,
                    players: room.players,
                    currentTurn: room.currentTurn,
                    assignments: {
                        [room.players[0]]: "X",
                        [room.players[1]]: "O",
                    },
                });
            }

            if (gameId === "gtn") {
                room.gtnAttempts = { [room.players[0]]: 0, [room.players[1]]: 0 };
                room.gtnSolved   = { [room.players[0]]: false, [room.players[1]]: false };
                room.gtnFinished = { [room.players[0]]: false, [room.players[1]]: false };

                const t0 = Math.floor(Math.random() * 100) + 1;
                const t1 = Math.floor(Math.random() * 100) + 1;
                room.gtnTargets = {
                    [room.players[0]]: t0,
                    [room.players[1]]: t1,
                };

                const s0 = getReceiverSocketId(room.players[0]);
                const s1 = getReceiverSocketId(room.players[1]);
                if (s0) io.to(s0).emit("game:start", { roomId, data: { target: t0 } });
                if (s1) io.to(s1).emit("game:start", { roomId, data: { target: t1 } });
            }

            if (gameId === "eq") {
                room.eqScores = {
                    [room.players[0]]: 0,
                    [room.players[1]]: 0,
                };
                room.eqFinished = {};
                io.to(roomId).emit("game:start", {
                    roomId,
                    players: room.players,
                });
            }

            if (gameId === "rps") {
                room.choices = {};
                room.roundScores = {
                    [room.players[0]]: 0,
                    [room.players[1]]: 0,
                    draws: 0,
                };
                io.to(roomId).emit("game:start", {
                    roomId,
                    players: room.players,
                    assignments: {
                        [room.players[0]]: "P1",
                        [room.players[1]]: "P2",
                    },
                });
            }
        }
    });

    // ── Game: Move ────────────────────────────────────────────────────────────
    socket.on("game:move", ({ roomId, index, symbol, data }) => {
        const room = gameRooms[roomId];
        if (!room) return;

        if (index !== undefined && symbol !== undefined) {
            if (room.currentTurn !== userId) return;
            if (room.board[index]) return;

            room.board[index] = symbol;
            const nextTurn = room.players.find(p => p !== userId);
            room.currentTurn = nextTurn;

            const result = checkTTTWinner(room.board);

            if (result) {
                let winnerId = null;
                if (result.winner !== "draw") {
                    winnerId = result.winner === "X" ? room.players[0] : room.players[1];
                }

                io.to(roomId).emit("game:update", {
                    board: room.board,
                    currentTurn: null,
                    lastMove: { index, symbol, by: userId },
                });

                io.to(roomId).emit("game:over", {
                    winner: result.winner,
                    winnerId,
                    line: result.line,
                });

                delete gameRooms[roomId];
            } else {
                io.to(roomId).emit("game:update", {
                    board: room.board,
                    currentTurn: room.currentTurn,
                    lastMove: { index, symbol, by: userId },
                });
            }
        }

        if (data?.type === "guess") {
            const { attempts: attemptCount, correct, failed } = data;

            room.gtnAttempts[userId] = attemptCount;

            const opponentId = room.players.find(p => p !== userId);
            const opponentSid = getReceiverSocketId(opponentId);

            if (opponentSid) {
                io.to(opponentSid).emit("game:update", {
                    data: {
                        type: "opponent_guess",
                        opponentAttemptsCount: attemptCount,
                        result: correct ? "correct" : "wrong",
                    }
                });
            }

            if (correct) {
                room.gtnSolved[userId] = true;
                room.gtnFinished[userId] = true;
            } else if (failed) {
                room.gtnSolved[userId] = false;
                room.gtnFinished[userId] = true;
            }

            const iFinished = room.gtnFinished[userId];
            const oppFinished = room.gtnFinished[opponentId];

            if (iFinished && oppFinished) {
                const iSolved = room.gtnSolved[userId];
                const oppSolved = room.gtnSolved[opponentId];
                const myAttempts = room.gtnAttempts[userId];
                const oppAttempts = room.gtnAttempts[opponentId];

                let winner;
                if (iSolved && oppSolved) {
                    if (myAttempts < oppAttempts) winner = userId;
                    else if (oppAttempts < myAttempts) winner = opponentId;
                    else winner = "draw";
                } else if (iSolved) {
                    winner = userId;
                } else if (oppSolved) {
                    winner = opponentId;
                } else {
                    winner = "draw";
                }

                io.to(roomId).emit("game:update", {
                    data: {
                        type: "round_over",
                        winner,
                        targets: {
                            [userId]: room.gtnTargets[userId],
                            [opponentId]: room.gtnTargets[opponentId],
                        },
                        attempts: {
                            [userId]: myAttempts,
                            [opponentId]: oppAttempts,
                        },
                    }
                });
                delete gameRooms[roomId];
            }
        }

        if (data?.choice) {
            if (!room.choices) room.choices = {};
            room.choices[userId] = data;

            if (Object.keys(room.choices).length === 2) {
                const [p1Id, p2Id] = room.players;
                const p1Choice = room.choices[p1Id]?.choice;
                const p2Choice = room.choices[p2Id]?.choice;
                const roundNum = data?.round || 1;

                const BEATS = { rock: "scissors", scissors: "paper", paper: "rock" };
                const getResult = (a, b) => {
                    if (a === b) return "draw";
                    return BEATS[a] === b ? "win" : "loss";
                };

                const p1Result = getResult(p1Choice, p2Choice);
                if (!room.roundScores) room.roundScores = { [p1Id]: 0, [p2Id]: 0, draws: 0 };
                if (p1Result === "win")       room.roundScores[p1Id]++;
                else if (p1Result === "loss") room.roundScores[p2Id]++;
                else                          room.roundScores.draws++;

                const p1Score = { player: room.roundScores[p1Id], ai: room.roundScores[p2Id], draw: room.roundScores.draws };
                const p2Score = { player: room.roundScores[p2Id], ai: room.roundScores[p1Id], draw: room.roundScores.draws };

                const s1 = getReceiverSocketId(p1Id);
                const s2 = getReceiverSocketId(p2Id);

                if (s1) io.to(s1).emit("game:update", { data: {
                    myChoiceServer: p1Choice, opponentChoiceServer: p2Choice,
                    roundResult: p1Result, newScore: p1Score, roundNum,
                }});
                if (s2) io.to(s2).emit("game:update", { data: {
                    myChoiceServer: p2Choice, opponentChoiceServer: p1Choice,
                    roundResult: p1Result === "win" ? "loss" : p1Result === "loss" ? "win" : "draw",
                    newScore: p2Score, roundNum,
                }});

                room.choices = {};
            }
        }

        if (data?.type === "eq_progress") {
            const { score, finished } = data;
            if (!room.eqScores) room.eqScores = {};
            if (!room.eqFinished) room.eqFinished = {};

            room.eqScores[userId] = score;

            const oppId = room.players.find(p => p !== userId);
            const oppSid = getReceiverSocketId(oppId);

            if (oppSid) {
                io.to(oppSid).emit("game:update", {
                    data: {
                        type: "opponent_progress",
                        opponentScore: score,
                        finished: !!finished,
                    }
                });
            }

            if (finished) {
                room.eqFinished[userId] = true;

                if (room.eqFinished[oppId]) {
                    const myScore  = room.eqScores[userId];
                    const oppScore = room.eqScores[oppId];
                    let winner;
                    if (myScore > oppScore)      winner = userId;
                    else if (oppScore > myScore)  winner = oppId;
                    else                           winner = "draw";

                    io.to(roomId).emit("game:update", {
                        data: { type: "round_over", winner }
                    });
                    delete gameRooms[roomId];
                }
            }
        }
    });

    socket.on("game:over", ({ roomId, result }) => {
        const room = gameRooms[roomId];
        if (!room) return;
        io.to(roomId).emit("game:ended", { result });
        delete gameRooms[roomId];
    });

    socket.on("game:leave", ({ roomId }) => {
        socket.leave(roomId);
        if (gameRooms[roomId]) {
            io.to(roomId).emit("game:opponent-left");
            delete gameRooms[roomId];
        }
    });

    // ── Calling (Phase 1: rebuilt with call-state tracking) ────────────────────
    socket.on("call-user", ({ to, from, offer, callType, callerInfo }) => {
        const sid = getReceiverSocketId(to);

        if (!sid) {
            socket.emit("call-failed", { reason: "User is offline" });
            return;
        }

        if (isUserBusy(to)) {
            socket.emit("call-failed", { reason: "User is busy" });
            return;
        }

        if (isUserBusy(from)) {
            // Safety guard: caller already tracked in a call (stale state) — refuse to double-dial
            socket.emit("call-failed", { reason: "You are already in a call" });
            return;
        }

        setActiveCall(from, to, callType, "ringing");
        io.to(sid).emit("incoming-call", { from, offer, callType, callerInfo });
    });

    socket.on("answer-call", ({ to, answer }) => {
        const sid = getReceiverSocketId(to);
        updateCallStatus(userId, to, "ongoing");
        if (sid) io.to(sid).emit("call-answered", { answer });
    });

    socket.on("reject-call", ({ to }) => {
        const sid = getReceiverSocketId(to);
        clearActiveCall(userId);
        if (sid) io.to(sid).emit("call-rejected");
    });

    // 🆕 Caller cancels before the receiver has answered (distinct from end-call)
    socket.on("cancel-call", ({ to }) => {
        const sid = getReceiverSocketId(to);
        clearActiveCall(userId);
        if (sid) io.to(sid).emit("call-cancelled");
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
        const sid = getReceiverSocketId(to);
        if (sid) io.to(sid).emit("ice-candidate", { candidate });
    });

    socket.on("end-call", ({ to }) => {
        const sid = getReceiverSocketId(to);
        const wasActive = isUserBusy(userId);
        clearActiveCall(userId);
        // Only forward call-ended if there was actually an active call tracked —
        // prevents the old "double end-call after reject" phantom toast bug.
        if (sid && wasActive) io.to(sid).emit("call-ended");
    });

    // ── Disconnect (Added Asynchronous Database Sync + Live Emit Broadcast) ──
    socket.on("disconnect", async () => {
        console.log("❌ User disconnected:", userId);
        if (userId && userId !== "undefined") {

            if (userSocketMap[userId] === socket.id) {
                const currentOfflineTime = new Date();

                try {
                    await User.findByIdAndUpdate(userId, { lastActive: currentOfflineTime });
                    socket.broadcast.emit("userOfflineUpdate", {
                        userId: userId,
                        lastActive: currentOfflineTime
                    });
                } catch (err) {
                    console.log("Error updating lastActive dynamic presence timestamp:", err.message);
                }

                // 🆕 If user disconnects mid-call, notify their peer and clean up state
                if (isUserBusy(userId)) {
                    const peerId = activeCalls[userId].peerId;
                    const peerSid = getReceiverSocketId(peerId);
                    clearActiveCall(userId);
                    if (peerSid) io.to(peerSid).emit("call-ended");
                }

                delete userSocketMap[userId];
                hiddenStatusUsers.delete(userId);
            } else {
                console.log(`⚠️ Stale disconnect ignored for ${userId} — newer socket already active`);
            }
        }
        broadcastOnlineUsers();
    });
}); // ← ye io.on("connection", ...) ko close karta hai

export { io, app, server };
