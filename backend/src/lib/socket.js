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

io.on("connection", (socket) => {
    const userId = socket.handshake.query.userId;

    // ✅ Safe check — undefined userId ko map mein mat daalo
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

    // ===== CALLING FEATURE — Signaling Events =====
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
    // ===== END Calling Events =====

    socket.on("disconnect", () => {
        console.log("❌ User disconnected:", userId);
        if (userId && userId !== "undefined") {
            delete userSocketMap[userId];
        }
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });
});

export { io, app, server };
